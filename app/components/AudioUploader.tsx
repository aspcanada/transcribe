"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@clerk/nextjs";
import { put } from "@vercel/blob";

interface TranscriptionResponse {
  transcription: string;
  summary: string;
  isExisting?: boolean;
}

interface AudioUploaderProps {
  onComplete?: () => void;
}

/**
 * AudioUploader component for handling audio file uploads and transcription
 * @returns {JSX.Element} The audio uploader form component
 */
export default function AudioUploader({ onComplete }: AudioUploaderProps): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [context, setContext] = useState("");
  const [transcription, setTranscription] = useState("");
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExisting, setIsExisting] = useState(false);
  const { getToken } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    setError(null);
    setIsExisting(false);

    try {
      // Upload to Vercel Blob
      const blob = await put(file.name, file, {
        access: "public",
        token: process.env.NEXT_PUBLIC_BLOB_READ_WRITE_TOKEN,
      });

      // Create form data for the API
      const formData = new FormData();
      formData.append("context", context);
      formData.append("blobUrl", blob.url);

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
        const errorData = await response.json();
        throw new Error(errorData.details || errorData.error || "Failed to transcribe audio");
      }

      const data: TranscriptionResponse = await response.json();
      setTranscription(data.transcription);
      setSummary(data.summary);
      setIsExisting(data.isExisting || false);

      // Call onComplete callback if provided
      if (onComplete) {
        onComplete();
      }

      // Reset form
      setFile(null);
      setContext("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-4">
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Enter context of the transcription (optional)"
            className="w-full textarea"
          />
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
            <label className="flex flex-col items-center justify-center w-full h-32 cursor-pointer bg-gray-50 hover:bg-gray-100 rounded-lg">
              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                <svg
                  className="w-8 h-8 mb-4 text-gray-500"
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 20 16"
                >
                  <path
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"
                  />
                </svg>
                <p className="mb-2 text-sm text-gray-500">
                  <span className="font-semibold">Click to upload</span> or drag and drop
                </p>
                <p className="text-xs text-gray-500">M4A, MP3, WAV, or other audio files</p>
              </div>
              <input
                type="file"
                accept=".m4a,.mp3,.wav,.aac,.ogg,.webm,audio/*"
                onChange={handleFileChange}
                className="hidden"
                required
              />
            </label>
            {file && (
              <div className="mt-4 text-sm text-gray-500">
                Selected file: {file.name}
              </div>
            )}
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

        {error && (
          <div className="alert alert-error">
            <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {isExisting && (
          <div className="alert alert-info">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-current shrink-0 w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>This file has already been transcribed. Showing previous results.</span>
          </div>
        )}

        {transcription && (
          <div className="space-y-4">
            <div className="card bg-base-100 shadow-xl">
              <div className="card-body">
                <h2 className="card-title">Transcription</h2>
                <details className="mt-2">
                  <summary className="cursor-pointer text-gray-700 hover:text-gray-900">
                    Click to view full transcription
                  </summary>
                  <div className="mt-2 pl-4 text-gray-700">
                    <ReactMarkdown>{transcription}</ReactMarkdown>
                  </div>
                </details>
              </div>
            </div>

            {summary && (
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title">Analysis</h2>
                  <div className="prose max-w-none">
                    <ReactMarkdown>{summary}</ReactMarkdown>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
