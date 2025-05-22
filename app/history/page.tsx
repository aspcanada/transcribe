"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import ReactMarkdown from "react-markdown";

interface TranscriptionHistory {
  id: string;
  fileName: string;
  context: string;
  transcription: string;
  summary: string;
  createdAt: string;
}

export default function HistoryPage() {
  const [history, setHistory] = useState<TranscriptionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { getToken } = useAuth();

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await fetch("/api/history", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch history");
      }

      const data = await response.json();
      setHistory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this transcription?")) {
      return;
    }

    try {
      const token = await getToken();
      const response = await fetch(`/api/history?key=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete transcription");
      }

      // Refresh the history
      await fetchHistory();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete transcription");
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [getToken]);

  if (loading) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-3xl font-bold text-center mb-8">Transcription History</h1>
          <div className="flex justify-center">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen py-8">
        <div className="max-w-4xl mx-auto px-4">
          <h1 className="text-3xl font-bold text-center mb-8">Transcription History</h1>
          <div className="alert alert-error">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="stroke-current shrink-0 h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{error}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Transcription History</h1>
          <button
            onClick={() => fetchHistory()}
            className="btn btn-ghost btn-circle"
            title="Refresh"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
        
        {history.length === 0 ? (
          <div className="text-center text-gray-500">
            <p>No transcriptions found.</p>
            <a href="/transcribe" className="btn btn-primary mt-4">
              Start Transcribing
            </a>
          </div>
        ) : (
          <div className="space-y-6">
            {history.map((item) => (
              <div key={item.id} className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="card-title">{item.fileName}</h2>
                      <p className="text-sm text-gray-500">
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="btn btn-ghost btn-sm text-error"
                      title="Delete transcription"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                  {item.context && (
                    <div className="mt-2">
                      <h3 className="font-semibold">Context:</h3>
                      <p className="text-gray-600">{item.context}</p>
                    </div>
                  )}
                  <div className="mt-4">
                    <h3 className="font-semibold">Transcription:</h3>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-gray-700 hover:text-gray-900">
                        Click to view full transcription
                      </summary>
                      <p className="mt-2 pl-4 text-gray-700">{item.transcription}</p>
                    </details>
                  </div>
                  <div className="mt-4">
                    <h3 className="font-semibold">Summary:</h3>
                    <div className="prose prose-blue max-w-none">
                      <ReactMarkdown>{item.summary}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
} 