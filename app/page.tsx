export default function Home() {
  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4">
        
        <h1 className="text-3xl font-bold text-center mb-8">
          Welcome to Audio Tools
        </h1>
        <div className="space-y-6">
          <section className="text-center">
            <h2 className="text-2xl font-semibold mb-4">
              Transform Your Audio Content
            </h2>
            <p className="text-gray-600">
              Upload your audio files for instant transcription and smart
              summaries.
            </p>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <div className="p-6 bg-white rounded-lg shadow-md">
              <h3 className="text-xl font-semibold mb-2">Transcribe Audio</h3>
              <p className="text-gray-600 mb-4">
                Convert your audio files into accurate text transcriptions.
              </p>
              <a
                href="/transcribe"
                className="btn btn-primary"
              >
                Start Transcribing
              </a>
            </div>

            <div className="p-6 bg-white rounded-lg shadow-md">
              <h3 className="text-xl font-semibold mb-2">View History</h3>
              <p className="text-gray-600 mb-4">
                Access your past transcriptions and summaries.
              </p>
              <a
                href="/history"
                className="btn btn-primary"
              >
                View History
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
