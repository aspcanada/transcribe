export default function Home() {
  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-center mb-8">
          AI Tools Collection
        </h1>
        <div className="space-y-6">
          <section className="text-center">
            <h2 className="text-2xl font-semibold mb-4">
              Enhance Your Workflow
            </h2>
            <p className="text-gray-600">
              A collection of AI-powered tools to help you work smarter.
            </p>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h3 className="card-title">Audio Transcription</h3>
                <p className="text-gray-600">
                  Convert your audio files into accurate text transcriptions with AI-powered analysis.
                </p>
                <div className="card-actions justify-end mt-4">
                  <a href="/transcribe" className="btn btn-primary">
                    Open Tool
                  </a>
                </div>
              </div>
            </div>

            {/* Add more tools here as they become available */}
            <div className="card bg-base-100 shadow-xl opacity-50">
              <div className="card-body">
                <h3 className="card-title">Coming Soon</h3>
                <p className="text-gray-600">
                  More AI tools are being developed. Stay tuned!
                </p>
                <div className="card-actions justify-end mt-4">
                  <button className="btn btn-primary" disabled>
                    Coming Soon
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
