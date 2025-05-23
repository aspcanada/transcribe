import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import OpenAI from 'openai';
import { auth } from '@clerk/nextjs/server';
import { del } from '@vercel/blob';

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

export async function POST(request: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const blobUrl = formData.get("blobUrl") as string;
    const context = formData.get("context") as string;

    if (!blobUrl) {
      return NextResponse.json({ error: "No file URL provided" }, { status: 400 });
    }

    // Create a unique key based on the blob URL
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(blobUrl));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

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

    // Get transcription from GPT-4
    let transcriptionText = "";
    try {
      const response = await fetch(blobUrl);
      const blob = await response.blob();
      const file = new File([blob], "audio", { type: blob.type });
      
      const transcriptionResponse = await openai.audio.transcriptions.create({
        file,
        model: "gpt-4o-transcribe",
        response_format: "text",
      });
      transcriptionText = transcriptionResponse;
    } catch (error) {
      console.error("OpenAI transcription error:", error);
      return NextResponse.json({ 
        error: "Failed to transcribe audio",
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
          filename: blobUrl.split("/").pop() || "audio",
          context: context || "",
          transcription: transcriptionText,
          summary,
          createdAt: new Date().toISOString(),
        },
      }));
    } catch (error) {
      console.error("Error storing in DynamoDB:", error);
      return NextResponse.json({ 
        error: "Failed to save transcription",
        details: error instanceof Error ? error.message : "Unknown error"
      }, { status: 500 });
    }

    // Delete the blob after processing
    try {
      await del(blobUrl);
    } catch (error) {
      console.error("Error deleting blob:", error);
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
    const fileHash = searchParams.get("key");

    if (!fileHash) {
      return NextResponse.json({ error: "No file hash provided" }, { status: 400 });
    }

    // Delete from DynamoDB
    await docClient.send(new DeleteCommand({
      TableName: process.env.DYNAMODB_TABLE_NAME!,
      Key: {
        userId,
        fileHash,
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
