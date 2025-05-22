import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } from '@aws-sdk/client-transcribe';
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const context = formData.get('context') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Create a unique key based on file name and content hash
    const fileBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const fileExtension = file.name.split('.').pop();
    const key = `uploads/${userId}/${hashHex}.${fileExtension}`;
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    try {
      // Check if file exists and has metadata
      const headResponse = await s3Client.send(new HeadObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: key
      }));

      // If file exists and has summary metadata, check if transcription job exists
      if (headResponse.Metadata?.summary) {
        const transcriptionJobName = `transcription-${userId}-${hashHex}`;
        try {
          const existingJob = await transcribeClient.send(new GetTranscriptionJobCommand({
            TranscriptionJobName: transcriptionJobName
          }));

          if (existingJob.TranscriptionJob?.TranscriptionJobStatus === 'COMPLETED') {
            const transcriptUrl = existingJob.TranscriptionJob.Transcript?.TranscriptFileUri;
            if (!transcriptUrl) throw new Error('No transcript URL available');
            
            const response = await fetch(transcriptUrl);
            const data = await response.json();
            const transcriptionText = data.results.transcripts[0].transcript;

            return NextResponse.json({
              transcription: transcriptionText,
              summary: headResponse.Metadata.summary,
              isExisting: true
            });
          }
        } catch (error) {
          // If job not found or other error, continue with new transcription
          console.error('Error checking existing job:', error);
        }
      }

      // File exists but no transcription, continue with upload
    } catch (error: unknown) {
      if (error && typeof error === "object" && "name" in error && (error as { name: string }).name === "NotFound") {
        // File doesn't exist, upload it
        await s3Client.send(new PutObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME!,
          Key: key,
          Body: buffer,
          ContentType: file.type,
          Metadata: {
            fileName: file.name,
            context: context || "",
          },
        }));
      } else {
        throw error; // Re-throw other errors
      }
    }

    // Check if transcription job already exists
    const transcriptionJobName = `transcription-${userId}-${hashHex}`;
    
    let existingJob;
    try {
      existingJob = await transcribeClient.send(new GetTranscriptionJobCommand({
        TranscriptionJobName: transcriptionJobName
      }));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      // console.error('error:', error);

      // If job not found, set existingJob to null
      existingJob = { TranscriptionJob: null };
    }

    let transcriptionText = '';

    if (existingJob.TranscriptionJob?.TranscriptionJobStatus === 'COMPLETED') {
      // job exists, fetch it
      const transcriptUrl = existingJob.TranscriptionJob.Transcript?.TranscriptFileUri;
      if (!transcriptUrl) throw new Error('No transcript URL available');
      
      const response = await fetch(transcriptUrl);
      const data = await response.json();
      transcriptionText = data.results.transcripts[0].transcript;
    } else if (existingJob.TranscriptionJob?.TranscriptionJobStatus === 'IN_PROGRESS') {
      // job is in progress, just hold on...
      transcriptionText = await waitForTranscriptionCompletion(transcribeClient, transcriptionJobName);
    } else {
      // Start new transcription job
      await transcribeClient.send(new StartTranscriptionJobCommand({
        TranscriptionJobName: transcriptionJobName,
        Media: {
          MediaFileUri: `s3://${process.env.S3_BUCKET_NAME}/${key}`
        },
        LanguageCode: 'en-US'
      }));

      transcriptionText = await waitForTranscriptionCompletion(transcribeClient, transcriptionJobName);
    }

    // // transcribe audio with openai whisper with a try catch
    // // this is more expensive than aws transcribe
    // try {
    //   const transcription = await openai.audio.transcriptions.create({
    //     file: file,
    //     model: "whisper-1",
    //   });
    //   transcriptionText = transcription.text;
    //   console.log('transcriptionText:', transcriptionText);
    // } catch (error) {
    //   console.error('OpenAI API error:', error);
    // }

    // Get summary from ChatGPT
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
        model: "gpt-4o",
      });

      const summary = completion.choices[0].message.content;
    
      try {
        // Update the file metadata with just the summary
        await s3Client.send(new PutObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME!,
          Key: key,
          Body: buffer,
          ContentType: file.type,
          Metadata: {
            fileName: file.name,
            context: context || "",
            summary: encodeURIComponent(summary || "Summary unavailable"),
          },
        }));

        return NextResponse.json({ 
          transcription: transcriptionText,
          summary: summary
        });
      } catch (s3Error) {
        console.error('S3 update error:', s3Error);
        // Still return the transcription and summary even if S3 update fails
        return NextResponse.json({ 
          transcription: transcriptionText,
          summary: summary
        });
      }
    
    } catch (openaiError) {
      // Handle OpenAI API errors gracefully
      console.error('OpenAI API error:', openaiError);
      return NextResponse.json({ 
        transcription: transcriptionText,
        summary: "Summary unavailable - API limit reached"
      });
    }

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
