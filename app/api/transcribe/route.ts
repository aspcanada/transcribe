import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } from '@aws-sdk/client-transcribe';
import OpenAI from 'openai';

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
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Create a unique key based on file name and content hash
    const fileBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const fileExtension = file.name.split('.').pop();
    const key = `uploads/${hashHex}.${fileExtension}`;
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME!,
        Key: key
      }));
      // File exists, no need to upload

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error && typeof error === 'object' && 'name' in error && error.name === 'NotFound') {
        // File doesn't exist, upload it
        await s3Client.send(new PutObjectCommand({
          Bucket: process.env.S3_BUCKET_NAME!,
          Key: key,
          Body: buffer,
          ContentType: file.type,
        }));
      } else {
        throw error; // Re-throw other errors
      }
    }

    // Check if transcription job already exists
    const transcriptionJobName = `transcription-${hashHex}`;
    
    let existingJob;
    try {
      existingJob = await transcribeClient.send(new GetTranscriptionJobCommand({
        TranscriptionJobName: transcriptionJobName
      }));
    } catch (error) {
      console.error('error:', error);

      // If job not found, set existingJob to null
      existingJob = { TranscriptionJob: null };
    }

    let transcriptionText = '';

    if (existingJob.TranscriptionJob?.TranscriptionJobStatus === 'COMPLETED') {
      const transcriptUrl = existingJob.TranscriptionJob.Transcript?.TranscriptFileUri;
      if (!transcriptUrl) throw new Error('No transcript URL available');
      
      const response = await fetch(transcriptUrl);
      const data = await response.json();
      transcriptionText = data.results.transcripts[0].transcript;
    } else if (existingJob.TranscriptionJob?.TranscriptionJobStatus === 'IN_PROGRESS') {
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

    // Get summary from ChatGPT
    try {
      const completion = await openai.chat.completions.create({
        messages: [
          { role: "system", content: "You are a helpful assistant that summarizes transcripts." },
          { role: "user", content: `Please provide a concise summary of this transcript: ${transcriptionText}` }
        ],
        // model: "gpt-3.5-turbo",
        model: "gpt-4o-mini",
      });

      const summary = completion.choices[0].message.content;
    
      return NextResponse.json({ 
        transcription: transcriptionText,
        summary: summary
      });
    
    } catch (error) {
      // Handle OpenAI API errors gracefully
      console.error('OpenAI API error:', error);
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
