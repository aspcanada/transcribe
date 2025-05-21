"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@clerk/nextjs";

/**
 * AudioUploader component for handling audio file uploads and transcription
 * @returns {JSX.Element} The audio uploader form component
 */
export default function AudioUploader(): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState("");
  const [result, setResult] = useState<{
    transcription: string;
    summary: string;
  } | null>(null);
  const { getToken } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("context", context);

    try {
      const token = await getToken();
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Please sign in to continue");
        }
        throw new Error("Upload failed");
      }

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("Error:", error);
      alert(
        error instanceof Error ? error.message : "Failed to process audio file"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-4">
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Enter context of the transcription"
            className="w-full textarea"
            required
          />
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full file-input"
              required
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={!file || loading}
          className="w-full btn btn-primary"
        >
          {loading ? (
            <div className="flex items-center justify-center">
              <span className="loading loading-spinner loading-md mr-2"></span>

              Processing...
            </div>
          ) : (
            "Upload and Process"
          )}
        </button>
      </form>

      {result && (
        <div className="mt-8 space-y-4">
          <div>
            <h3 className="font-bold">Transcription:</h3>
            <details className="mt-2">
              <summary className="cursor-pointer text-gray-700 hover:text-gray-900">
                Click to view full transcription
              </summary>
              <p className="mt-2 pl-4 text-gray-700">{result.transcription}</p>
            </details>
          </div>
          <div>
            <h3 className="font-bold">Analysis:</h3>
            <div className="mt-2 prose prose-blue max-w-none">
              <ReactMarkdown>{result.summary}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
