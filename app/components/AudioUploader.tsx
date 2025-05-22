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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
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
