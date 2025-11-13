"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

export default function QuizGenerator2Page() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    numberOfAttempts: "",
    numberOfQuestions: "",
    timeLimit: "",
    difficulty: "",
    topicsToTest: [],
  });
  const [topicInput, setTopicInput] = useState("");
  const [existingQuizId, setExistingQuizId] = useState(null);
  const [sourceFilename, setSourceFilename] = useState("");
  const [documentId, setDocumentId] = useState(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const saveStatusTimeoutRef = useRef(null);
  const [isPublished, setIsPublished] = useState(false);
  const hasHydratedRef = useRef(false);
  const hydratedDefinitionIdRef = useRef(null);
  const isHydratingRef = useRef(true);

  const hydrateFromDefinition = useCallback(async (quizId) => {
    if (!quizId) return;
    try {
      const response = await fetch(`${QUIZ_DEFINITION_ENDPOINT}/${encodeURIComponent(quizId)}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.detail || "Unable to load quiz definition.");
      }
      const metadata = data.metadata || {};
      const topicsToTest =
        (Array.isArray(metadata.topicsToTest) && metadata.topicsToTest.length
          ? metadata.topicsToTest
          : data.topics) || [];
      setFormData((prev) => ({
        ...prev,
        title: data.name ?? "",
        description: metadata.description ?? "",
        numberOfAttempts:
          metadata.numberOfAttempts ??
          (data.assessment_max_attempts != null ? String(data.assessment_max_attempts) : ""),
        numberOfQuestions:
          metadata.numberOfQuestions ??
          (data.assessment_num_questions != null ? String(data.assessment_num_questions) : ""),
        timeLimit:
          metadata.timeLimitLabel ??
          metadata.timeLimit ??
          (data.assessment_time_limit_minutes != null ? String(data.assessment_time_limit_minutes) : ""),
        difficulty:
          (
            metadata.difficultyLabel ??
            metadata.difficulty ??
            data.initial_difficulty ??
            ""
          ).toString().toLowerCase(),
        topicsToTest,
      }));
      setExistingQuizId(data.quiz_id);
      setSourceFilename(data.source_filename ?? "");
      setDocumentId(data.embedding_document_id ?? null);
      setIsPublished(Boolean(data.is_published));
      hydratedDefinitionIdRef.current = data.quiz_id;
    } catch (error) {
      console.error("Unable to hydrate assessment definition", error);
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
      if (draft?.mode !== "assessment") {
        finishHydration();
        return;
      }
      const config = draft.configuration || {};
      const draftId = draft.id ?? draft.quizId ?? null;
      setFormData((prev) => ({
        ...prev,
        title: draft.title ?? "",
        description: draft.description ?? "",
        numberOfAttempts: config.numberOfAttempts ?? "",
        numberOfQuestions:
          config.numberOfQuestions ?? (draft.totalQuestions?.toString() ?? ""),
        timeLimit: config.timeLimit ?? "",
        difficulty: config.difficulty ?? "",
        topicsToTest: Array.isArray(config.topicsToTest) ? config.topicsToTest : [],
      }));
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
      console.error("Unable to load assessment draft", error);
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
      const configuration = {
        ...formData,
        topics: formData.topicsToTest,
      };
      const payload = {
        mode: "assessment",
        title: formData.title,
        description: formData.description,
        configuration,
        id: existingQuizId,
        quizId: existingQuizId,
        sourceFilename,
        documentId,
        isPublished,
      };
      localStorage.setItem("quizConfigDraft", JSON.stringify(payload));
    } catch (error) {
      console.error("Unable to persist assessment draft", error);
    }
  }, [formData, existingQuizId, sourceFilename, documentId, isPublished]);

  useEffect(() => {
    if (!existingQuizId) return;
    if (hydratedDefinitionIdRef.current === existingQuizId) return;
    hydrateFromDefinition(existingQuizId);
  }, [existingQuizId, hydrateFromDefinition]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleTopicInputChange = (e) => {
    setTopicInput(e.target.value);
  };

  const handleAddTopic = () => {
    const cleanedTopic = topicInput.trim();
    if (!cleanedTopic || formData.topicsToTest.includes(cleanedTopic)) {
      setTopicInput("");
      return;
    }
    setFormData((prev) => ({
      ...prev,
      topicsToTest: [...prev.topicsToTest, cleanedTopic],
    }));
    setTopicInput("");
  };

  const handleRemoveTopic = (topicToRemove) => {
    setFormData((prev) => ({
      ...prev,
      topicsToTest: prev.topicsToTest.filter((topic) => topic !== topicToRemove),
    }));
  };

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

  const showSaveSuccess = (message = "Saved to your list.") => {
    setSaveStatus(message);
    if (saveStatusTimeoutRef.current) {
      clearTimeout(saveStatusTimeoutRef.current);
    }
    saveStatusTimeoutRef.current = setTimeout(() => setSaveStatus(""), 4000);
  };

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

  const handlePreviewQuiz = async () => {
    const trimmedTitle = formData.title.trim();
    const trimmedDescription = formData.description.trim();
    // Validate required fields
    if (
      !trimmedTitle ||
      !formData.numberOfAttempts ||
      !formData.numberOfQuestions ||
      !formData.timeLimit ||
      !formData.difficulty
    ) {
      alert("Please fill in all required fields");
      return;
    }
    const savedDefinition = await saveQuizRecord();
    const quizId = savedDefinition?.quiz_id || existingQuizId;
    if (!quizId) {
      alert("Please save this quiz configuration before previewing.");
      return;
    }
    const initialDifficulty = (formData.difficulty || "medium").toLowerCase();
    try {
      persistPreviewState({
        mode: "assessment",
        quizId,
        sourceFilename,
        documentId,
        configuration: {
          ...formData,
          title: trimmedTitle,
          description: trimmedDescription,
        },
      });
      router.push("/Quiz/1");
    } catch (error) {
      alert(error.message || "Unable to launch preview.");
    }
  };

  const saveQuizRecord = async ({ publishState } = {}) => {
    const trimmedTitle = formData.title.trim();
    const trimmedDescription = formData.description.trim();
    if (
      !trimmedTitle ||
      !formData.numberOfAttempts ||
      !formData.numberOfQuestions ||
      !formData.timeLimit ||
      !formData.difficulty
    ) {
      alert("Please fill in all required fields");
      return false;
    }

    const toInteger = (value) => {
      if (value === undefined || value === null || value === "") return null;
      const match = String(value).match(/\d+/);
      if (!match) return null;
      const parsed = parseInt(match[0], 10);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const topicsPayload = formData.topicsToTest.length ? formData.topicsToTest : ["General"];
    const quizId = existingQuizId ?? `assessment-${Date.now()}`;
    const parsedAttempts = toInteger(formData.numberOfAttempts);
    const parsedQuestions = toInteger(formData.numberOfQuestions);
    const parsedTimeLimit = toInteger(formData.timeLimit);
    const difficultyValue = (formData.difficulty || "medium").toLowerCase();
    const allowedDifficulty = ["easy", "medium", "hard"].includes(difficultyValue)
      ? difficultyValue
      : "medium";

    const metadata = {
      description: trimmedDescription || undefined,
      topicsToTest: formData.topicsToTest,
      timeLimitLabel: formData.timeLimit,
      difficultyLabel: formData.difficulty,
      numberOfAttempts: formData.numberOfAttempts,
      numberOfQuestions: formData.numberOfQuestions,
      sourceFilename,
    };
    const cleanedMetadata = Object.fromEntries(
      Object.entries(metadata).filter(([, value]) => {
        if (value === undefined || value === null) return false;
        if (Array.isArray(value) && value.length === 0) return false;
        return true;
      })
    );

    const nextPublishState =
      typeof publishState === "boolean" ? publishState : isPublished;

    const payload = {
      quiz_id: quizId,
      name: trimmedTitle,
      topics: topicsPayload,
      default_mode: "assessment",
      initial_difficulty: allowedDifficulty,
      assessment_num_questions: parsedQuestions,
      assessment_time_limit_minutes: parsedTimeLimit,
      assessment_max_attempts: parsedAttempts,
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

  const handleSaveQuiz = async () => {};

  const handlePublishQuiz = async () => {};

  const handleDeleteQuiz = () => {};

  const confirmDeleteQuiz = async () => {
    setIsDeleteModalOpen(false);
  };

  const cancelDeleteQuiz = () => {
    setIsDeleteModalOpen(false);
  };

  const handleBackToQuizList = () => {
    setIsExitModalOpen(true);
  };

  const handleLeaveWithoutSaving = async () => {
    setIsExitModalOpen(false);
  };

  const handleSaveAndExit = async () => {
    setIsExitModalOpen(false);
  };

  const handleStayOnPage = () => {
    setIsExitModalOpen(false);
  };

  return (
    <div className="relative min-h-screen bg-white px-8 py-8">
      <div className="max-w-4xl mx-auto">
      <div className="mb-4">
            <button
              type="button"
              onClick={() => router.push("/Instructor/Quizzes")}
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
            Assessment Mode
          </h1>
          <p className={`text-base text-gray-600 ${poppins.className}`}>
            Quizzes will simulate real tests/exams with time limits.
          </p>
          <p className={`text-sm text-gray-500 mt-2 ${poppins.className}`}>
            {sourceFilename ? `Using slides: ${sourceFilename}` : "No slide deck attached yet."}
          </p>
        </div>

        {/* Quiz Details Section */}
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
                className={`block text-sm font-medium text-gray-700 mb-2 ${poppins.className}`}
              >
                Quiz Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="quizTitle"
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                className={`w-full px-4 py-3 border border-purple-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${poppins.className}`}
                placeholder="e.g., Module 3 Assessment"
              />
            </div>
            <div>
              <label
                htmlFor="quizDescription"
                className={`block text-sm font-medium text-gray-700 mb-2 ${poppins.className}`}
              >
                Quiz Description (optional)
              </label>
              <textarea
                id="quizDescription"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows={3}
                className={`w-full px-4 py-3 border border-purple-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none ${poppins.className}`}
                placeholder="Share exam rules, grading info, or study tips."
              />
              <p className={`text-xs text-gray-500 mt-1 ${poppins.className}`}>
                This shows alongside the quiz overview for students.
              </p>
            </div>
          </div>
        </div>

        {/* Quiz Parameters Section */}
        <div className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* Number of Attempts */}
            <div>
              <label
                htmlFor="numberOfAttempts"
                className={`block text-sm font-medium text-gray-700 mb-2 ${poppins.className}`}
              >
                Number of Attempts <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="numberOfAttempts"
                name="numberOfAttempts"
                value={formData.numberOfAttempts}
                onChange={handleInputChange}
                className={`w-full px-4 py-2 border border-purple-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${poppins.className}`}
                placeholder="Enter number"
              />
            </div>

            {/* Number of Questions */}
            <div>
              <label
                htmlFor="numberOfQuestions"
                className={`block text-sm font-medium text-gray-700 mb-2 ${poppins.className}`}
              >
                Number of Questions <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                id="numberOfQuestions"
                name="numberOfQuestions"
                value={formData.numberOfQuestions}
                onChange={handleInputChange}
                className={`w-full px-4 py-2 border border-purple-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${poppins.className}`}
                placeholder="Enter number"
              />
            </div>

            {/* Time Limit */}
            <div>
              <label
                htmlFor="timeLimit"
                className={`block text-sm font-medium text-gray-700 mb-2 ${poppins.className}`}
              >
                Time Limit <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="timeLimit"
                name="timeLimit"
                value={formData.timeLimit}
                onChange={handleInputChange}
                className={`w-full px-4 py-2 border border-purple-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${poppins.className}`}
                placeholder="e.g., 30 min"
              />
            </div>
          </div>

          {/* Difficulty */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="difficulty"
                className={`block text-sm font-medium text-gray-700 mb-2 ${poppins.className}`}
              >
                Difficulty <span className="text-red-500">*</span>
              </label>
              <select
                id="difficulty"
                name="difficulty"
                value={formData.difficulty}
                onChange={handleInputChange}
                className={`w-full px-4 py-2 border border-purple-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 ${poppins.className}`}
              >
                <option value="">Select difficulty</option>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
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
              className={`block text-sm font-medium text-gray-700 mb-2 ${poppins.className}`}
            >
              Topics to Focus (optional)
            </label>
            <p className={`text-sm text-gray-500 mb-3 ${poppins.className}`}>
              Add targeted topics individually. Leave this empty to generate questions across the uploaded material.
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
                  placeholder="e.g., Binary Trees"
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
                {formData.topicsToTest.length === 0 ? (
                  <p className={`text-sm text-gray-500 ${poppins.className}`}>
                    No specific topics added. Questions will cover the source material broadly.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {formData.topicsToTest.map((topic) => (
                      <li
                        key={topic}
                        className="flex items-center justify-between bg-white px-4 py-2 rounded-md shadow-sm"
                      >
                        <span className={`text-sm text-gray-800 ${poppins.className}`}>{topic}</span>
                        <button
                          type="button"
                          onClick={() => {}}
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
            <button
              type="button"
              onClick={() => {}}
              className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg text-purple-900 bg-purple-100 ${poppins.className}`}
            >
              Save Quiz
            </button>
            <button
              type="button"
              onClick={() => {}}
              className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg text-white bg-red-500 ${poppins.className}`}
            >
              Delete Quiz
            </button>
          </div>

          <div className="flex flex-wrap gap-3 justify-end">
            <button
              onClick={() => {}}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold transition-all duration-300 shadow-lg ${poppins.className}`}
              style={{
                background: "linear-gradient(to right, #7B2CBF, #3B82F6)",
              }}
            >
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

            <button
              onClick={() => {}}
              className={`px-6 py-3 rounded-xl text-white font-semibold transition-all duration-300 shadow-lg ${poppins.className}`}
              style={{
                background: "linear-gradient(to right, #EC4899, #F97316)",
              }}
            >
              {isPublished ? "Unpublish Quiz" : "Publish Quiz"}
            </button>
          </div>
        </div>
      </div>

      {saveStatus && (
        <div
          className={`mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700 ${poppins.className}`}
        >
          {saveStatus}
        </div>
      )}

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
              You haven’t saved this assessment yet. Save it now or leave without saving.
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
