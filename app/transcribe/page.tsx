"use client";

import { useState } from "react";
import AudioUploader from "../components/AudioUploader";
import TranscriptionHistory from "../components/TranscriptionHistory";

export default function TranscribePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleTranscriptionComplete = () => {
    setIsModalOpen(false);
    setRefreshTrigger(prev => prev + 1);
  };

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

        <TranscriptionHistory key={refreshTrigger} />

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
      </div>
    </div>
  );
}
