import { NextResponse } from "next/server";
import { S3Client, ListObjectsV2Command, HeadObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { TranscribeClient, GetTranscriptionJobCommand, DeleteTranscriptionJobCommand } from "@aws-sdk/client-transcribe";
import { auth } from "@clerk/nextjs/server";

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

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // List all objects in the user's directory
    const command = new ListObjectsV2Command({
      Bucket: process.env.S3_BUCKET_NAME!,
      Prefix: `uploads/${userId}/`,
    });

    const response = await s3Client.send(command);
    const files = response.Contents || [];

    // Fetch metadata for each file
    const history = await Promise.all(
      files.map(async (file) => {
        if (!file.Key) return null;

        // Get metadata using HeadObjectCommand
        const headResponse = await s3Client.send(new HeadObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME!,
          Key: file.Key,
        }));

        // Extract hash from the key for transcription job lookup
        const hashHex = file.Key.split("/").pop()?.split(".")[0] || "";
        
        let transcription = "";
        const transcriptionJobName = `transcription-${userId}-${hashHex}`;
        
        try {
          const jobResponse = await transcribeClient.send(new GetTranscriptionJobCommand({
            TranscriptionJobName: transcriptionJobName
          }));

          if (jobResponse.TranscriptionJob?.TranscriptionJobStatus === "COMPLETED") {
            const transcriptUrl = jobResponse.TranscriptionJob.Transcript?.TranscriptFileUri;
            if (transcriptUrl) {
              const transcriptResponse = await fetch(transcriptUrl);
              const transcriptData = await transcriptResponse.json();
              transcription = transcriptData.results.transcripts[0].transcript;
            }
          }
        } catch (error) {
          console.error("Error fetching transcription:", error);
        }
        
        const summary = headResponse.Metadata?.summary 
          ? decodeURIComponent(headResponse.Metadata.summary)
          : "Summary unavailable";
        
        return {
          id: file.Key,
          fileName: headResponse.Metadata?.filename || "Unknown file",
          context: headResponse.Metadata?.context || "",
          transcription,
          summary,
          createdAt: file.LastModified?.toISOString() || new Date().toISOString(),
        };
      })
    );

    // Filter out null values and sort by date (newest first)
    const validHistory = history
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json(validHistory);
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
    if (!key.startsWith(`uploads/${userId}/`)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Extract hash from the key for transcription job lookup
    const hashHex = key.split("/").pop()?.split(".")[0] || "";
    const transcriptionJobName = `transcription-${userId}-${hashHex}`;

    // Delete the transcription job
    try {
      await transcribeClient.send(new DeleteTranscriptionJobCommand({
        TranscriptionJobName: transcriptionJobName
      }));
    } catch (error) {
      console.error("Error deleting transcription job:", error);
      // Continue with file deletion even if transcription job deletion fails
    }

    // Delete the original file
    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: key,
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