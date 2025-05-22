import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand, DeleteTranscriptionJobCommand } from '@aws-sdk/client-transcribe';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const transcribeClient = new TranscribeClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const docClient = DynamoDBDocumentClient.from(dynamoClient);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function waitForTranscriptionCompletion(transcribeClient: TranscribeClient, jobName: string): Promise<string> {
  while (true) {
    const jobStatus = await transcribeClient.send(new GetTranscriptionJobCommand({
      TranscriptionJobName: jobName
    }));

    if (jobStatus.TranscriptionJob?.TranscriptionJobStatus === 'COMPLETED') {
      const transcriptUrl = jobStatus.TranscriptionJob.Transcript?.TranscriptFileUri;
      if (!transcriptUrl) throw new Error('No transcript URL available');
      
      const response = await fetch(transcriptUrl);
      const data = await response.json();
      return data.results.transcripts[0].transcript;
    } 
    
    if (jobStatus.TranscriptionJob?.TranscriptionJobStatus === 'FAILED') {
      throw new Error('Transcription failed');
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;
    const context = formData.get("context") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Create a unique key based on file name and content hash
    const fileBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    const fileExtension = file.name.split(".").pop();
    const key = `transcriptions/${userId}/${hashHex}.${fileExtension}`;
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Check if transcription exists in DynamoDB
    try {
      const existingTranscription = await docClient.send(new GetCommand({
        TableName: process.env.DYNAMODB_TABLE_NAME!,
        Key: {
          userId,
          fileHash: hashHex,
        },
      }));

      if (existingTranscription.Item) {
        return NextResponse.json({
          transcription: existingTranscription.Item.transcription,
          summary: existingTranscription.Item.summary,
          isExisting: true,
        });
      }
    } catch (error) {
      console.error("Error checking existing transcription:", error);
      return NextResponse.json({ 
        error: "Failed to check for existing transcription",
        details: error instanceof Error ? error.message : "Unknown error"
      }, { status: 500 });
    }

    // Upload file to S3
    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: file.type,
        Metadata: {
          filename: file.name,
          context: context || "",
        },
      }));
    } catch (error) {
      console.error("Error uploading to S3:", error);
      return NextResponse.json({ 
        error: "Failed to upload audio file",
        details: error instanceof Error ? error.message : "Unknown error"
      }, { status: 500 });
    }

    // Start transcription job
    const transcriptionJobName = `transcription-${userId}-${hashHex}`;
    let transcriptionText = "";

    try {
      let existingJob;
      try {
        existingJob = await transcribeClient.send(new GetTranscriptionJobCommand({
          TranscriptionJobName: transcriptionJobName,
        }));
      } catch (error: unknown) {
        // Job doesn't exist yet, which is expected for new transcriptions
        console.debug("No existing transcription job found:", error);
        existingJob = null;
      }

      if (existingJob?.TranscriptionJob?.TranscriptionJobStatus === "COMPLETED") {
        const transcriptUrl = existingJob.TranscriptionJob.Transcript?.TranscriptFileUri;
        if (!transcriptUrl) throw new Error("No transcript URL available");
        
        const response = await fetch(transcriptUrl);
        const data = await response.json();
        transcriptionText = data.results.transcripts[0].transcript;
      } else if (existingJob?.TranscriptionJob?.TranscriptionJobStatus === "IN_PROGRESS") {
        transcriptionText = await waitForTranscriptionCompletion(transcribeClient, transcriptionJobName);
      } else {
        try {
          await transcribeClient.send(new StartTranscriptionJobCommand({
            TranscriptionJobName: transcriptionJobName,
            Media: {
              MediaFileUri: `s3://${process.env.S3_BUCKET_NAME}/${key}`,
            },
            LanguageCode: "en-US",
          }));
        } catch (error) {
          console.error("Error starting transcription job:", error);
          return NextResponse.json({ 
            error: "Failed to start transcription job",
            details: error instanceof Error ? error.message : "Unknown error"
          }, { status: 500 });
        }

        try {
          transcriptionText = await waitForTranscriptionCompletion(transcribeClient, transcriptionJobName);
        } catch (error) {
          console.error("Error waiting for transcription completion:", error);
          return NextResponse.json({ 
            error: "Failed to complete transcription",
            details: error instanceof Error ? error.message : "Unknown error"
          }, { status: 500 });
        }
      }
    } catch (error) {
      console.error("Error with transcription job:", error);
      return NextResponse.json({ 
        error: "Failed to process transcription job",
        details: error instanceof Error ? error.message : "Unknown error"
      }, { status: 500 });
    }

    // Get summary from ChatGPT
    let summary = "";
    try {
      const completion = await openai.chat.completions.create({
        messages: [
          { 
            role: "system", 
            content: "You are a helpful assistant that summarizes transcripts. Format your response in the following structure:\n\n" +
              "Summary:\n[Provide a concise summary of the transcript]\n\n" +
              "Participants:\n- [List the participants involved]\n\n" +
              "Key Points:\n- [List 3-4 main points]\n\n" +
              "Action Items:\n- [List any action items or next steps mentioned]"
          },
          { 
            role: "user", 
            content: `Context: ${context}\n\nPlease summarize this transcript: ${transcriptionText}` 
          }
        ],
        model: "gpt-4",
      });

      summary = completion.choices[0].message.content || "";
    } catch (error) {
      console.error("OpenAI API error:", error);
      return NextResponse.json({ 
        error: "Failed to generate summary",
        details: error instanceof Error ? error.message : "Unknown error"
      }, { status: 500 });
    }

    // Store in DynamoDB
    try {
      await docClient.send(new PutCommand({
        TableName: process.env.DYNAMODB_TABLE_NAME!,
        Item: {
          userId,
          fileHash: hashHex,
          filename: file.name,
          context: context || "",
          transcription: transcriptionText,
          summary,
          createdAt: new Date().toISOString(),
          s3Key: key,
        },
      }));
    } catch (error) {
      console.error("Error storing in DynamoDB:", error);
      return NextResponse.json({ 
        error: "Failed to save transcription",
        details: error instanceof Error ? error.message : "Unknown error"
      }, { status: 500 });
    }

    return NextResponse.json({ 
      transcription: transcriptionText,
      summary,
    });

  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ 
      error: "An unexpected error occurred",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Query DynamoDB for user's transcriptions
    const result = await docClient.send(new QueryCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME!,
      IndexName: "CreatedAtIndex",
      KeyConditionExpression: "userId = :userId",
      ExpressionAttributeValues: {
        ":userId": userId,
      },
      ScanIndexForward: false, // Sort in descending order (newest first)
    }));

    return NextResponse.json(result.Items || []);
  } catch (error) {
    console.error("Error fetching history:", error);
    return NextResponse.json(
      { error: "Failed to fetch history" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "No file key provided" }, { status: 400 });
    }

    // Verify the file belongs to the user
    if (!key.startsWith(`transcriptions/${userId}/`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Extract hash from the key for transcription job lookup
    const hashHex = key.split("/").pop()?.split(".")[0] || "";
    const transcriptionJobName = `transcription-${userId}-${hashHex}`;

    // Delete the transcription job
    try {
      await transcribeClient.send(new DeleteTranscriptionJobCommand({
        TranscriptionJobName: transcriptionJobName,
      }));
    } catch (error) {
      console.error("Error deleting transcription job:", error);
    }

    // Delete from S3
    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: key,
    }));

    // Delete from DynamoDB
    await docClient.send(new DeleteCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME!,
      Key: {
        userId,
        fileHash: hashHex,
      },
    }));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting file:", error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}
