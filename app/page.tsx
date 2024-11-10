import AudioUploader from './components/AudioUploader';

export default function Home() {
  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-center mb-8">
          Audio Transcription and Summary
        </h1>
        <AudioUploader />
      </div>
    </div>
  );
}
