"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const API_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const INGEST_ENDPOINT = `${API_BASE_URL}/ingest/upload`;
const DELETE_INGEST_ENDPOINT = `${API_BASE_URL}/ingest/document`;

const DRAFT_STORAGE_KEYS = [
  "quizConfigDraft",
  "quizPreviewData",
  "quizPreviewSession",
  "quizPreviewQuestions",
  "quizPreviewResponses",
];

const clearStoredQuizDrafts = () => {
  if (typeof window === "undefined") {
    return;
  }
  for (const key of DRAFT_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn("Unable to clear stored quiz draft state", error);
      break;
    }
  }
};

const ensureSessionId = () => {
  if (typeof window === "undefined") return "";
  const storageKey = "quizGeneratorSessionId";
  let sessionId = localStorage.getItem(storageKey);
  if (!sessionId) {
    sessionId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `session-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(storageKey, sessionId);
  }
  return sessionId;
};

export default function QuizGeneratorPage() {
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState("practice");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestError, setIngestError] = useState(null);
  const [ingestSuccessMessage, setIngestSuccessMessage] = useState(null);
  const [ingestedDocumentId, setIngestedDocumentId] = useState(null);
  const [ingestedFilename, setIngestedFilename] = useState(null);

  const handleModeSelect = (mode) => {
    setSelectedMode(mode);
    setIngestError(null);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
      setIngestError(null);
      setIngestSuccessMessage(null);
    }
  };

  const saveSeedAndNavigate = () => {
    try {
      if (typeof window !== "undefined") {
        clearStoredQuizDrafts();
        localStorage.setItem(
          "quizGeneratorSeed",
          JSON.stringify({
            mode: selectedMode,
            filename: uploadedFile?.name ?? "sample-notes.pdf",
            createdAt: new Date().toISOString(),
            documentId: ingestedDocumentId,
            sessionId: ensureSessionId(),
          })
        );
      }
    } catch (error) {
      console.error("Unable to persist quiz generator seed", error);
    }

    if (selectedMode === "assessment") {
      router.push("/Instructor/Assessment");
    } else {
      router.push("/Instructor/Practice");
    }
  };

  const handleNext = () => {
    if (selectedMode !== "assessment") {
      if (!uploadedFile) {
        setIngestError("Please upload a file before continuing.");
        return;
      }
      if (!ingestedDocumentId || ingestedFilename !== uploadedFile.name) {
        setIngestError("Please ingest your latest upload before continuing.");
        return;
      }
    }
    saveSeedAndNavigate();
  };

  const handleIngest = async () => {
    if (!uploadedFile) {
      setIngestError("Please upload a file to ingest.");
      return;
    }

    setIsIngesting(true);
    setIngestError(null);
    setIngestSuccessMessage(null);

    try {
      if (ingestedDocumentId) {
        const deleteResponse = await fetch(
          `${DELETE_INGEST_ENDPOINT}/${encodeURIComponent(ingestedDocumentId)}`,
          { method: "DELETE" }
        );
        if (!deleteResponse.ok) {
          throw new Error("Unable to delete previously ingested document.");
        }
      }

      const sessionId = ensureSessionId();
      const formData = new FormData();
      formData.append("session_id", sessionId);
      formData.append("file", uploadedFile);
      formData.append(
        "metadata",
        JSON.stringify({
          source: "quiz-generator",
          uploaded_at: new Date().toISOString(),
        })
      );

      const ingestResponse = await fetch(INGEST_ENDPOINT, {
        method: "POST",
        body: formData,
      });

      if (!ingestResponse.ok) {
        const payload = await ingestResponse.json().catch(() => ({}));
        throw new Error(payload.detail || "File ingestion failed.");
      }

      const data = await ingestResponse.json();
      const slideLabel =
        typeof data.slide_count === "number" && data.slide_count > 0
          ? `${data.slide_count} slides`
          : "the uploaded file";
      setIngestedDocumentId(data.document_id);
      setIngestedFilename(uploadedFile.name);
      setIngestSuccessMessage(
        `Ingested ${slideLabel} (${data.chunk_count ?? 0} chunks).`
      );
    } catch (error) {
      console.error(error);
      setIngestError(error.message || "Unable to ingest file.");
    } finally {
      setIsIngesting(false);
    }
  };

  const handleBackToQuizList = () => setIsExitModalOpen(true);
  const handleProceedExit = async () => {
    setIsExitModalOpen(false);
    try {
      if (ingestedDocumentId) {
        await fetch(`${DELETE_INGEST_ENDPOINT}/${encodeURIComponent(ingestedDocumentId)}`, {
          method: "DELETE",
        });
      }
    } catch (error) {
      console.warn("Unable to delete document before exiting", error);
    } finally {
      router.push("/Instructor/Quizzes");
    }
  };
  const handleStay = () => setIsExitModalOpen(false);

  const canProceed =
    selectedMode === "assessment" ||
    (Boolean(ingestedDocumentId) &&
      Boolean(uploadedFile) &&
      ingestedFilename === uploadedFile?.name);

  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 relative">
      <div className="absolute top-6 left-6">
        <button
          type="button"
          onClick={handleBackToQuizList}
          className={`text-base text-purple-700 hover:text-purple-900 font-semibold ${poppins.className}`}
        >
          ← Back to Quiz List
        </button>
      </div>
      <img src="/logo1.png" alt="Graduation Cap" className="w-208px h-200px"/>

      <h1 className={`text-5xl font-bold text-purple-900 mb-4 text-center ${poppins.className}`}>
        Create a New Quiz
      </h1>

      <p className={`text-lg text-gray-600 mb-8 text-center ${poppins.className}`}>
        Select a mode
      </p>

      <div className="flex gap-6 mb-12">
        <button
          onClick={() => handleModeSelect("assessment")}
          className={`px-8 py-4 rounded-xl font-semibold shadow-lg transition-all duration-300 hover:scale-105 ${
            selectedMode === "assessment" ? "ring-4 ring-offset-2 ring-purple-300" : ""
          } ${poppins.className}`}
          style={{
            background: "linear-gradient(to right, #7B2CBF, #9333EA)",
            color: "#F8FAFC",
          }}
        >
          Assessment
        </button>
        <button
          onClick={() => handleModeSelect("practice")}
          className={`px-8 py-4 rounded-xl text-white font-semibold transition-all duration-300 hover:scale-105 shadow-lg ${
            selectedMode === "practice" ? "ring-4 ring-offset-2 ring-orange-300" : ""
          } ${poppins.className}`}
          style={{
            background: "linear-gradient(to right, #FF6B35, #F97316)",
          }}
        >
          Practice
        </button>
      </div>

      <div className="mb-4 w-full max-w-md">
        <label htmlFor="file-upload">
          <div
            className="rounded-xl p-[2px] cursor-pointer transition-all duration-300 hover:shadow-lg"
            style={{
              background: "linear-gradient(to right, #7B2CBF, #9333EA)",
            }}
          >
            <div className="bg-white rounded-[10px] p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 15V3M12 3L8 7M12 3L16 7"
                    stroke="#7B2CBF"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M2 17L2 19C2 20.1046 2.89543 21 4 21L20 21C21.1046 21 22 20.1046 22 19V17"
                    stroke="#7B2CBF"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className={`text-lg font-medium text-purple-900 ${poppins.className}`}>
                  {uploadedFile ? uploadedFile.name : "Upload Slides/Notes"}
                </span>
              </div>
            </div>
          </div>
        </label>
        <input
          id="file-upload"
          type="file"
          accept=".pdf,.pptx"
          onChange={handleFileUpload}
          className="hidden"
        />
      </div>

      <p className={`text-sm text-gray-600 mb-6 ${poppins.className}`}>Supports PDF/PPTX</p>

      <div className="flex flex-col gap-3 w-full max-w-2xl mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-center gap-4">
          <button
            type="button"
            onClick={handleIngest}
            disabled={!uploadedFile || isIngesting}
            className={`flex-1 px-6 py-3 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 hover:scale-105 disabled:opacity-50 ${poppins.className}`}
            style={{
              background: "linear-gradient(to right, #7B2CBF, #3B82F6)",
            }}
          >
            {isIngesting ? "Ingesting..." : "Ingest File"}
          </button>

          <button
            onClick={handleNext}
            disabled={!selectedMode || !canProceed}
            className={`flex-1 px-6 py-3 rounded-xl text-white font-semibold text-lg transition-all duration-300 shadow-lg hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${poppins.className}`}
            style={{
              background:
                selectedMode && canProceed
                  ? "linear-gradient(to right, #38bdf8, #818cf8)"
                  : "linear-gradient(to right, #9CA3AF, #6B7280)",
            }}
          >
            Next
          </button>
        </div>
        {ingestSuccessMessage && (
          <p className={`text-sm text-green-600 text-center ${poppins.className}`}>
            {ingestSuccessMessage}
          </p>
        )}
        {ingestError && (
          <p className={`text-sm text-red-500 text-center ${poppins.className}`}>{ingestError}</p>
        )}
      </div>

      {isExitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className={`text-xl font-semibold text-purple-900 mb-2 ${poppins.className}`}>
              Leave setup?
            </h3>
            <p className={`text-sm text-gray-600 mb-6 ${poppins.className}`}>
              You haven't created a quiz yet. Are you sure you want to return to the quiz list?
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleStay}
                className={`px-4 py-2 rounded-lg font-semibold border border-gray-300 text-gray-600 hover:bg-gray-100 ${poppins.className}`}
              >
                Stay Here
              </button>
              <button
                type="button"
                onClick={handleProceedExit}
                className={`px-4 py-2 rounded-lg font-semibold text-white shadow-md ${poppins.className}`}
                style={{
                  background: "linear-gradient(to right, #7B2CBF, #3B82F6)",
                }}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
