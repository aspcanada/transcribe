"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import ReactMarkdown from "react-markdown";
import AudioUploader from "../components/AudioUploader";

interface TranscriptionHistory {
  context: string;
  createdAt: string;
  fileHash: string;
  filename: string;
  summary: string;
  transcription: string;
  userId: string;
}

export default function TranscribePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [history, setHistory] = useState<TranscriptionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const { getToken } = useAuth();

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await fetch("/api/transcribe", {
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
    try {
      const token = await getToken();
      const response = await fetch(`/api/transcribe?key=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete transcription");
      }

      await fetchHistory();
      setDeleteModalOpen(false);
      setItemToDelete(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete transcription");
    }
  };

  const openDeleteModal = (id: string) => {
    setItemToDelete(id);
    setDeleteModalOpen(true);
  };

  const handleTranscriptionComplete = () => {
    setIsModalOpen(false);
    setRefreshTrigger(prev => prev + 1);
  };

  useEffect(() => {
    fetchHistory();
  }, [getToken, refreshTrigger]);

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Audio Transcription</h1>
          <button
            onClick={() => setIsModalOpen(true)}
            className="btn btn-primary"
          >
            New Transcription
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center">
            <span className="loading loading-spinner loading-lg"></span>
          </div>
        ) : error ? (
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
        ) : (
          <div className="space-y-6">
            {history.length === 0 ? (
              <div className="text-center text-gray-500">
                <p>No transcriptions found.</p>
              </div>
            ) : (
              history.map((item) => (
                <div key={`transcription-${item.fileHash}`} className="card bg-base-100 shadow-xl">
                  <div className="card-body">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="card-title">{item.filename}</h2>
                        <p className="text-sm text-gray-500">
                          {new Date(item.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => openDeleteModal(item.fileHash)}
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
                    <div className="mt-2">
                      <h3 className="font-semibold">Context:</h3>
                      <p className="text-gray-600">{item.context || "No context provided"}</p>
                    </div>
                    <div className="mt-4">
                      <div className="collapse collapse-arrow bg-base-100 border border-base-300">
                        <input type="checkbox" /> 
                        <div className="collapse-title font-semibold">
                          Transcription
                        </div>
                        <div className="collapse-content">
                          <p className="text-gray-700">{item.transcription}</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="collapse collapse-arrow bg-base-100 border border-base-300">
                        <input type="checkbox" /> 
                        <div className="collapse-title font-semibold">
                          Summary
                        </div>
                        <div className="collapse-content">
                          <div className="prose prose-blue max-w-none">
                            <ReactMarkdown>{item.summary}</ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Modal for new transcription */}
        {isModalOpen && (
          <div className="modal modal-open">
            <div className="modal-box w-11/12 max-w-4xl">
              <button
                onClick={() => setIsModalOpen(false)}
                className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
              >
                ✕
              </button>
              <h3 className="font-bold text-lg mb-4">New Transcription</h3>
              <AudioUploader onComplete={handleTranscriptionComplete} />
            </div>
            <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
              <button className="cursor-default">close</button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        <dialog id="delete_modal" className={`modal ${deleteModalOpen ? "modal-open" : ""}`}>
          <div className="modal-box">
            <h3 className="font-bold text-lg">Delete Transcription</h3>
            <p className="py-4">Are you sure you want to delete this transcription? This action cannot be undone.</p>
            <div className="modal-action">
              <button 
                className="btn" 
                onClick={() => {
                  setDeleteModalOpen(false);
                  setItemToDelete(null);
                }}
              >
                Cancel
              </button>
              <button 
                className="btn btn-error" 
                onClick={() => itemToDelete && handleDelete(itemToDelete)}
              >
                Delete
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setDeleteModalOpen(false)}>close</button>
          </form>
        </dialog>
      </div>
    </div>
  );
}
