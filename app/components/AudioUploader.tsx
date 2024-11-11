'use client';

import { useState } from 'react';

export default function AudioUploader() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    transcription: string;
    summary: string;
  } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error('Error:', error);
      alert('Failed to process audio file');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
          <input
            type="file"
            accept="audio/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full"
          />
        </div>
        <button
          type="submit"
          disabled={!file || loading}
          className="w-full bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <div className="animate-spin h-5 w-5 mr-2 border-2 border-white border-t-transparent rounded-full"></div>
              Processing...
            </div>
          ) : 'Upload and Process'}
        </button>
      </form>

      {result && (
        <div className="mt-8 space-y-4">
          <div>
            <h3 className="font-bold">Transcription:</h3>
            <details className="mt-2">
              <summary className="cursor-pointer text-gray-700 hover:text-gray-900">Click to view full transcription</summary>
              <p className="mt-2 pl-4 text-gray-700">{result.transcription}</p>
            </details>
          </div>
          <div>
            <h3 className="font-bold">Summary:</h3>
            <p className="mt-2 text-gray-700">{result.summary}</p>
          </div>
        </div>
      )}
    </div>
  );
}
