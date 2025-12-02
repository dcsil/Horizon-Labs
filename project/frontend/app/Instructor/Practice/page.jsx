"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const API_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(
  /\/$/,
  ""
);
const DELETE_INGEST_ENDPOINT = `${API_BASE_URL}/ingest/document`;
const QUIZ_DEFINITION_ENDPOINT = `${API_BASE_URL}/quiz/definitions`;

/**
 * Practice quiz builder for instructors to configure adaptive sessions.
 */
export default function PracticePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [topics, setTopics] = useState([]);
  const [topicInput, setTopicInput] = useState("");
  const [existingQuizId, setExistingQuizId] = useState(null);
  const [sourceFilename, setSourceFilename] = useState("");
  const [documentId, setDocumentId] = useState(null);
  const [isPublished, setIsPublished] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const saveStatusTimeoutRef = useRef(null);

  const hasHydratedRef = useRef(false);
  const hydratedDefinitionIdRef = useRef(null);
  const isHydratingRef = useRef(true);

  /**
   * Hydrates the practice builder from a saved quiz definition.
   */
  const hydrateFromDefinition = useCallback(async (quizId) => {
    if (!quizId) return;
    try {
      const response = await fetch(`${QUIZ_DEFINITION_ENDPOINT}/${encodeURIComponent(quizId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Unable to load quiz definition.");
      }
      const metadata = data.metadata || {};
      const practiceTopics =
        (Array.isArray(metadata.practiceTopics) && metadata.practiceTopics.length
          ? metadata.practiceTopics
          : data.topics) || [];
      setTitle(data.name ?? "");
      setDescription(metadata.description ?? "");
      setTopics(practiceTopics);
      setExistingQuizId(data.quiz_id);
      setSourceFilename(data.source_filename ?? "");
      setDocumentId(data.embedding_document_id ?? null);
      setIsPublished(Boolean(data.is_published));
      hydratedDefinitionIdRef.current = data.quiz_id;
    } catch (error) {
      console.error("Unable to hydrate quiz definition", error);
    }
  }, []);

  useEffect(() => {
    const finishHydration = () => {
      isHydratingRef.current = false;
    };
    try {
      if (typeof window === "undefined") {
        finishHydration();
        return;
      }
      const raw = localStorage.getItem("quizConfigDraft");
      if (!raw) {
        finishHydration();
        return;
      }
      const draft = JSON.parse(raw);
      if (draft?.mode !== "practice") {
        finishHydration();
        return;
      }
      setTitle(draft.title ?? "");
      setDescription(draft.description ?? "");
      setTopics(Array.isArray(draft.topics) ? draft.topics : []);
      const draftId = draft.id ?? draft.quizId ?? null;
      setExistingQuizId(draftId);
      setSourceFilename(draft.sourceFilename ?? draft.filename ?? "");
      setDocumentId(draft.documentId ?? null);
      setIsPublished(Boolean(draft.isPublished));
      if (draftId) {
        hydrateFromDefinition(draftId).finally(finishHydration);
      } else {
        finishHydration();
      }
    } catch (error) {
      console.error("Unable to load practice draft", error);
      finishHydration();
    }
    hasHydratedRef.current = true;
  }, [hydrateFromDefinition]);

  useEffect(() => {
    return () => {
      if (saveStatusTimeoutRef.current) {
        clearTimeout(saveStatusTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const seedRaw = localStorage.getItem("quizGeneratorSeed");
      if (!seedRaw) return;
      const seed = JSON.parse(seedRaw);
      if (seed?.filename) {
        setSourceFilename(seed.filename);
      }
      if (seed?.documentId) {
        setDocumentId(seed.documentId);
      }
      if (typeof seed?.isPublished === "boolean") {
        setIsPublished(seed.isPublished);
      }
    } catch (error) {
      console.error("Unable to load quiz generator seed", error);
    }
  }, []);

  useEffect(() => {
    if (!hasHydratedRef.current) return;
    try {
      if (typeof window === "undefined") return;
      const payload = {
        mode: "practice",
        title,
        description,
        topics,
        id: existingQuizId,
        quizId: existingQuizId,
        sourceFilename,
        documentId,
        isPublished,
      };
      localStorage.setItem("quizConfigDraft", JSON.stringify(payload));
    } catch (error) {
      console.error("Unable to persist practice draft", error);
    }
  }, [title, description, topics, existingQuizId, sourceFilename, documentId, isPublished]);

  useEffect(() => {
    if (!existingQuizId) return;
    if (hydratedDefinitionIdRef.current === existingQuizId) return;
    hydrateFromDefinition(existingQuizId);
  }, [existingQuizId, hydrateFromDefinition]);

  /** Saves preview metadata for the quiz runner flow. */
  const persistPreviewState = (metaPayload) => {
    try {
      if (typeof window === "undefined") return;
      localStorage.setItem("quizPreviewData", JSON.stringify(metaPayload));
      localStorage.removeItem("quizPreviewSession");
      localStorage.removeItem("quizPreviewQuestions");
      localStorage.removeItem("quizPreviewResponses");
    } catch (error) {
      console.error("Unable to persist preview payload", error);
    }
  };

  /** Tracks topic input field changes. */
  const handleTopicInputChange = (e) => {
    setTopicInput(e.target.value);
  };

  /** Adds a new topic tag if it's unique and non-empty. */
  const handleAddTopic = () => {
    const cleanedTopic = topicInput.trim();
    if (!cleanedTopic || topics.includes(cleanedTopic)) {
      setTopicInput("");
      return;
    }
    setTopics((prev) => [...prev, cleanedTopic]);
    setTopicInput("");
  };

  /** Removes a selected topic from the list. */
  const handleRemoveTopic = (topicToRemove) => {
    setTopics((prev) => prev.filter((topic) => topic !== topicToRemove));
  };

  /** Deletes the associated ingest document from the index if present. */
  const deleteDocumentFromIndex = async () => {
    if (!documentId) return;
    try {
      await fetch(`${DELETE_INGEST_ENDPOINT}/${encodeURIComponent(documentId)}`, {
        method: "DELETE",
      });
    } catch (error) {
      console.warn("Unable to delete document from index", error);
    }
  };

  /** Deletes the quiz definition from the backend. */
  const deleteQuizDefinition = async (quizId) => {
    if (!quizId) return;
    try {
      await fetch(`${QUIZ_DEFINITION_ENDPOINT}/${encodeURIComponent(quizId)}`, {
        method: "DELETE",
      });
    } catch (error) {
      console.warn("Unable to delete quiz definition", error);
    }
  };

  /** Briefly surfaces a success status message in the UI. */
  const showSaveSuccess = (message = "Saved to your list.") => {
    setSaveStatus(message);
    if (saveStatusTimeoutRef.current) {
      clearTimeout(saveStatusTimeoutRef.current);
    }
    saveStatusTimeoutRef.current = setTimeout(() => {
      setSaveStatus("");
    }, 4000);
  };

  /** Persists the quiz and routes to the preview runner. */
  const handlePreviewQuiz = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      alert("Please enter a quiz title.");
      return;
    }
    const trimmedDescription = description.trim();
    const topicsPayload = topics.length ? topics : ["General"];
    const savedDefinition = await saveQuizRecord();
    const quizId = savedDefinition?.quiz_id || existingQuizId;
    if (!quizId) {
      alert("Please save this quiz configuration before previewing.");
      return;
    }
    try {
      persistPreviewState({
        mode: "practice",
        title: trimmedTitle,
        description: trimmedDescription,
        topicsToTest: topicsPayload,
        id: quizId,
        quizId,
        sourceFilename,
        documentId,
        isPublished,
      });
      router.push("/Quiz/1");
    } catch (error) {
      alert(error.message || "Unable to launch preview.");
    }
  };

  /** Toggles publish status by re-saving the quiz definition. */
  const handlePublishQuiz = async () => {
    await saveQuizRecord({ publishState: !isPublished });
  };

  /** Creates or updates the practice quiz definition via the backend. */
  const saveQuizRecord = async ({ publishState } = {}) => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      alert("Please enter a quiz title.");
      return false;
    }
    const trimmedDescription = description.trim();
    const quizId = existingQuizId ?? `practice-${Date.now()}`;
    const topicsPayload = topics.length ? topics : ["General"];
    const nextPublishState =
      typeof publishState === "boolean" ? publishState : isPublished;

    const metadata = {
      description: trimmedDescription || undefined,
      practiceTopics: topicsPayload,
      sourceFilename,
    };
    const cleanedMetadata = Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => {
        if (value === undefined || value === null) return false;
        if (Array.isArray(value) && value.length === 0) return false;
        return true;
      })
    );

    const payload = {
      quiz_id: quizId,
      name: trimmedTitle,
      topics: topicsPayload,
      default_mode: "practice",
      initial_difficulty: "medium",
      assessment_num_questions: null,
      assessment_time_limit_minutes: null,
      assessment_max_attempts: null,
      embedding_document_id: documentId,
      source_filename: sourceFilename || null,
      is_published: nextPublishState,
      metadata: Object.keys(cleanedMetadata).length ? cleanedMetadata : null,
    };

    try {
      const response = await fetch(QUIZ_DEFINITION_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.detail || "Unable to save quiz configuration.");
      }
      const data = await response.json();
      setExistingQuizId(data.quiz_id);
      setIsPublished(Boolean(data.is_published));
      const message =
        typeof publishState === "boolean"
          ? publishState
            ? "Quiz published."
            : "Quiz unpublished."
          : "Saved to your list.";
      showSaveSuccess(message);
      return data;
    } catch (error) {
      console.error("Unable to save quiz definition", error);
      alert(error.message || "Unable to save quiz.");
      return null;
    }
  };

  /** Saves the quiz configuration as a draft. */
  const handleSaveQuiz = async () => {
    await saveQuizRecord();
  };

  /** Opens delete confirmation after verifying the quiz exists. */
  const handleDeleteQuiz = () => {
    if (!existingQuizId) {
      alert("Save this quiz first before trying to delete it.");
      return;
    }
    setIsDeleteModalOpen(true);
  };

  /** Confirms deletion, cleans up data, and returns to the quiz list. */
  const confirmDeleteQuiz = async () => {
    if (!existingQuizId) return;
    await deleteDocumentFromIndex();
    await deleteQuizDefinition(existingQuizId);
    setExistingQuizId(null);
    setTitle("");
    setDescription("");
    setTopics([]);
    setTopicInput("");
    setSourceFilename("");
    setDocumentId(null);
    setIsPublished(false);
    setIsDeleteModalOpen(false);
    router.push("/Instructor/Quizzes");
  };

  /** Cancels the delete confirmation modal. */
  const cancelDeleteQuiz = () => {
    setIsDeleteModalOpen(false);
  };

  /** Opens the exit confirmation modal. */
  const handleBackToQuizList = () => {
    setIsExitModalOpen(true);
  };

  /** Leaves the page, deleting the ingest document if nothing is saved. */
  const handleLeaveWithoutSaving = async () => {
    setIsExitModalOpen(false);
    if (!existingQuizId && !isHydratingRef.current) {
      await deleteDocumentFromIndex();
      router.push("/Instructor/Quizzes");
      return;
    }
    router.push("/Instructor/Quizzes");
  };

  /** Saves changes then navigates back to the quiz list. */
  const handleSaveAndExit = async () => {
    const saved = await saveQuizRecord();
    if (saved) {
      setIsExitModalOpen(false);
      router.push("/Instructor/Quizzes");
    }
  };

  /** Keeps the user on the page and closes the modal. */
  const handleStayOnPage = () => {
    setIsExitModalOpen(false);
  };

  return (
    <div className="relative min-h-screen bg-white px-8 py-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-4">
            <button
              type="button"
              onClick={handleBackToQuizList}
              className={`text-base text-purple-700 hover:text-purple-900 font-semibold ${poppins.className}`}
            >
              ← Back to Quiz List
            </button>
        </div>

        {/* Header Section */}
        <div className="mb-8">
          <h1
            className={`text-4xl font-bold text-purple-900 mb-2 ${poppins.className}`}
          >
            Practice Mode
          </h1>
          <p className={`text-base text-gray-600 ${poppins.className}`}>
            Unlimited questions for students to practice and prep for assessments.
          </p>
          <p className={`text-sm text-gray-500 mt-2 ${poppins.className}`}>
            {sourceFilename
              ? `Using slides: ${sourceFilename}`
              : "No slide deck attached yet."}
          </p>
        </div>

        {/* Topic Configuration Section */}
        <div className="mb-8">
          <h2
            className={`text-2xl font-bold text-purple-900 mb-4 ${poppins.className}`}
          >
            Quiz Details
          </h2>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="quizTitle"
                className={`block text-sm font-medium text-gray-600 mb-2 ${poppins.className}`}
              >
                Quiz Title <span className="text-red-500">*</span>
              </label>
              <input
                id="quizTitle"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`w-full px-4 py-3 border border-purple-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${poppins.className}`}
                placeholder="e.g., Midterm Practice Set"
              />
            </div>
            <div>
              <label
                htmlFor="quizDescription"
                className={`block text-sm font-medium text-gray-600 mb-2 ${poppins.className}`}
              >
                Quiz Description (optional)
              </label>
              <textarea
                id="quizDescription"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={`w-full px-4 py-3 border border-purple-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none ${poppins.className}`}
                placeholder="Add context or instructions for students."
              />
              <p className={`text-xs text-gray-500 mt-1 ${poppins.className}`}>
                Shown to students alongside the quiz overview.
              </p>
            </div>
          </div>
        </div>

        {/* Topic Configuration Section */}
        <div className="mb-8">
          <h2
            className={`text-2xl font-bold text-purple-900 mb-4 ${poppins.className}`}
          >
            Topic Configuration
          </h2>
          <div>
            <label
              className={`block text-sm font-medium text-gray-600 mb-2 ${poppins.className}`}
            >
              Topics to Focus (optional)
            </label>
            <p className={`text-sm text-gray-500 mb-3 ${poppins.className}`}>
              Add topics one by one. Leave this blank to generate questions broadly from your uploaded material.
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  type="text"
                  value={topicInput}
                  onChange={handleTopicInputChange}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTopic();
                    }
                  }}
                  className={`flex-1 px-4 py-3 border border-purple-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${poppins.className}`}
                  placeholder="e.g., Recursion"
                />
                <button
                  type="button"
                  onClick={handleAddTopic}
                  disabled={!topicInput.trim()}
                  className={`px-6 py-3 rounded-lg text-white font-semibold transition-all duration-300 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${poppins.className}`}
                  style={{
                    background: "linear-gradient(to right, #7B2CBF, #3B82F6)",
                  }}
                >
                  Add topic
                </button>
              </div>
              <div className="border border-purple-100 rounded-lg p-4 min-h-[80px] bg-purple-50">
                {topics.length === 0 ? (
                  <p className={`text-sm text-gray-500 ${poppins.className}`}>
                    No topics added yet. Questions will be generated from the full set of slides.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {topics.map((topic) => (
                      <li
                        key={topic}
                        className="flex items-center justify-between bg-white px-4 py-2 rounded-md shadow-sm"
                      >
                        <span className={`text-sm text-gray-800 ${poppins.className}`}>{topic}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTopic(topic)}
                          className="text-xs text-red-500 hover:text-red-600 font-semibold"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-3">
            {/* Save Quiz Button */}
            <button
              type="button"
              onClick={handleSaveQuiz}
              disabled={!title.trim()}
              className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-105 shadow-lg text-purple-900 bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed ${poppins.className}`}
            >
              Save Quiz
            </button>
            {/* Delete Quiz Button */}
            <button
              type="button"
              onClick={handleDeleteQuiz}
              disabled={!existingQuizId}
              className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 hover:scale-105 shadow-lg text-white bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed ${poppins.className}`}
            >
              Delete Quiz
            </button>
          </div>

          <div className="flex flex-wrap gap-3 justify-end">
            {/* Preview Quiz Button */}
            <button
              onClick={handlePreviewQuiz}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold transition-all duration-300 hover:scale-105 shadow-lg ${poppins.className}`}
              style={{
                background: "linear-gradient(to right, #7B2CBF, #3B82F6)",
              }}
            >
              {/* Play Icon */}
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M6.66667 4.16667L15 10L6.66667 15.8333V4.16667Z"
                  fill="white"
                />
              </svg>
              Preview Quiz
            </button>

            {/* Publish Quiz Button */}
            <button
              onClick={handlePublishQuiz}
              className={`px-6 py-3 rounded-xl text-white font-semibold transition-all duration-300 hover:scale-105 shadow-lg ${poppins.className}`}
              style={{
                background: "linear-gradient(to right, #EC4899, #F97316)",
              }}
            >
              {isPublished ? "Unpublish Quiz" : "Publish Quiz"}
            </button>
          </div>
        </div>

        {saveStatus && (
          <div
            className={`mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700 ${poppins.className}`}
          >
            {saveStatus}
          </div>
        )}
      </div>

      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className={`text-xl font-semibold text-purple-900 mb-2 ${poppins.className}`}>
              Delete this quiz?
            </h3>
            <p className={`text-sm text-gray-600 mb-6 ${poppins.className}`}>
              This removes the configuration from your quiz list. You can always recreate it later by saving again.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={cancelDeleteQuiz}
                className={`px-4 py-2 rounded-lg font-semibold border border-gray-300 text-gray-600 hover:bg-gray-100 ${poppins.className}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteQuiz}
                className={`px-4 py-2 rounded-lg font-semibold text-white shadow-md ${poppins.className}`}
                style={{
                  background: "linear-gradient(to right, #EF4444, #B91C1C)",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {isExitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={handleStayOnPage}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
              aria-label="Close dialog"
            >
              X
            </button>
            <h3 className={`text-xl font-semibold text-purple-900 mb-2 ${poppins.className}`}>
              Leave without saving?
            </h3>
            <p className={`text-sm text-gray-600 mb-6 ${poppins.className}`}>
              You haven't saved this practice quiz yet. Save it now or leave without saving.
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={handleSaveAndExit}
                className={`px-4 py-2 rounded-lg font-semibold text-white shadow-md ${poppins.className}`}
                style={{
                  background: "linear-gradient(to right, #7B2CBF, #3B82F6)",
                }}
              >
                Save & Exit
              </button>
              <button
                type="button"
                onClick={handleLeaveWithoutSaving}
                className={`px-4 py-2 rounded-lg font-semibold border border-gray-300 text-gray-600 hover:bg-gray-100 ${poppins.className}`}
              >
                Leave Without Saving
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
