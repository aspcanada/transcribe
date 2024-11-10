import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand } from '@aws-sdk/client-transcribe';
import { v4 as uuidv4 } from 'uuid';
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

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Upload to S3
    const fileId = uuidv4();
    const fileExtension = file.name.split('.').pop();
    const key = `uploads/${fileId}.${fileExtension}`;
    
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: file.type,
    }));

    // Start transcription job
    const transcriptionJobName = `transcription-${fileId}`;
    await transcribeClient.send(new StartTranscriptionJobCommand({
      TranscriptionJobName: transcriptionJobName,
      Media: {
        MediaFileUri: `s3://${process.env.S3_BUCKET_NAME}/${key}`
      },
      LanguageCode: 'en-US'
    }));

    // Poll for transcription completion
    let transcriptionComplete = false;
    let transcriptionText = '';
    
    while (!transcriptionComplete) {
      const jobStatus = await transcribeClient.send(new GetTranscriptionJobCommand({
        TranscriptionJobName: transcriptionJobName
      }));

      if (jobStatus.TranscriptionJob?.TranscriptionJobStatus === 'COMPLETED') {
        const transcriptUrl = jobStatus.TranscriptionJob.Transcript?.TranscriptFileUri;
        const response = await fetch(transcriptUrl!);
        const data = await response.json();
        transcriptionText = data.results.transcripts[0].transcript;
        transcriptionComplete = true;
      } else if (jobStatus.TranscriptionJob?.TranscriptionJobStatus === 'FAILED') {
        throw new Error('Transcription failed');
      }

      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before polling again
    }

    // Get summary from ChatGPT
    const completion = await openai.chat.completions.create({
      messages: [
        { role: "system", content: "You are a helpful assistant that summarizes transcripts." },
        { role: "user", content: `Please provide a concise summary of this transcript: ${transcriptionText}` }
      ],
      model: "gpt-4-turbo-preview",
    });

    const summary = completion.choices[0].message.content;

    return NextResponse.json({ 
      transcription: transcriptionText,
      summary: summary
    });

  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }
}
