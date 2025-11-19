"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const API_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const QUIZ_SESSION_ENDPOINT = `${API_BASE_URL}/quiz/session`;
const DEFAULT_META = { mode: "practice" };
const OPTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const safeParse = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn("Unable to parse stored quiz preview value", error);
    return null;
  }
};

const normalizeQuestion = (payload) => {
  const options = (payload.choices || []).map((choice, index) => ({
    id: OPTION_LETTERS[index] || `Option-${index + 1}`,
    text: choice,
  }));
  return {
    ...payload,
    options,
  };
};

export default function QuizPage() {
  const router = useRouter();

  const [meta, setMeta] = useState(DEFAULT_META);
  const [sessionInfo, setSessionInfo] = useState(null);
  const [history, setHistory] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswerId, setSelectedAnswerId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingQuestion, setIsFetchingQuestion] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState("medium");
  const [selectedTopic, setSelectedTopic] = useState("General");
  const cleanupRequestedRef = useRef(false);
  const initialQuestionRequestedRef = useRef(false);
  const [rateLimitNotice, setRateLimitNotice] = useState(null);
  const readStoredPreviewSession = useCallback(() => {
    if (typeof window === "undefined") return null;
    return safeParse(localStorage.getItem("quizPreviewSession"));
  }, []);

  const writeStoredPreviewSession = useCallback((payload) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("quizPreviewSession", JSON.stringify(payload));
      cleanupRequestedRef.current = false;
    } catch (error) {
      console.error("Unable to persist preview session", error);
    }
  }, []);

  const readStoredPreviewMeta = useCallback(() => {
    if (typeof window === "undefined") return DEFAULT_META;
    return safeParse(localStorage.getItem("quizPreviewData")) || DEFAULT_META;
  }, []);

  const topicsSequence = useMemo(() => {
    const sanitize = (items) =>
      (items || [])
        .map((topic) => (typeof topic === "string" ? topic.trim() : ""))
        .filter(Boolean);
    if (Array.isArray(meta?.topicsToTest) && meta.topicsToTest.length) {
      return sanitize(meta.topicsToTest);
    }
    if (
      Array.isArray(meta?.configuration?.topicsToTest) &&
      meta.configuration.topicsToTest.length
    ) {
      return sanitize(meta.configuration.topicsToTest);
    }
    return [];
  }, [meta]);

  const showRateLimitNotice = useCallback(() => {
    setRateLimitNotice(
      "We're hitting a temporary content generation limit. Please wait a moment and try again."
    );
  }, []);

  const topicOptions = useMemo(() => {
    if (!topicsSequence.length) {
      return ["General"];
    }
    return Array.from(new Set(topicsSequence));
  }, [topicsSequence]);

  useEffect(() => {
    if (!topicOptions.length) return;
    setSelectedTopic((prev) => (topicOptions.includes(prev) ? prev : topicOptions[0]));
  }, [topicOptions]);

  const deriveTopicsPayload = useCallback(() => {
    if (Array.isArray(meta?.topicsToTest) && meta.topicsToTest.length) {
      return meta.topicsToTest;
    }
    if (Array.isArray(meta?.configuration?.topicsToTest) && meta.configuration.topicsToTest.length) {
      return meta.configuration.topicsToTest;
    }
    if (Array.isArray(sessionInfo?.topics) && sessionInfo.topics.length) {
      return sessionInfo.topics;
    }
    const stored = readStoredPreviewSession();
    if (Array.isArray(stored?.topics) && stored.topics.length) {
      return stored.topics;
    }
    return topicsSequence.length ? topicsSequence : ["General"];
  }, [meta, topicsSequence, sessionInfo, readStoredPreviewSession]);

  const deriveInitialDifficulty = useCallback(
    (sessionCandidate, metaCandidate) => {
      const metaDifficulty =
        metaCandidate?.configuration?.difficulty || metaCandidate?.initial_difficulty;
      if (typeof sessionCandidate?.initialDifficulty === "string" && sessionCandidate.initialDifficulty) {
        return sessionCandidate.initialDifficulty.toLowerCase();
      }
      if (typeof metaDifficulty === "string" && metaDifficulty.trim()) {
        return metaDifficulty.toLowerCase();
      }
      return "medium";
    },
    []
  );

  const createPreviewSession = useCallback(async () => {
    const fallbackMeta = readStoredPreviewMeta();
    const activeMeta = meta?.quizId || meta?.id ? meta : fallbackMeta;
    const quizId =
      activeMeta?.quizId || activeMeta?.id || activeMeta?.quiz_id || sessionInfo?.quizId || null;
    if (!quizId) {
      throw new Error(
        "Preview metadata missing quiz reference. Please restart the preview from the configuration page."
      );
    }
    const mode = activeMeta?.mode === "assessment" ? "assessment" : "practice";
    const initialDifficulty = deriveInitialDifficulty(null, activeMeta);
    const topics = deriveTopicsPayload();
    const sessionId = `preview-${quizId}-${Date.now()}`;
    const response = await fetch(`${QUIZ_SESSION_ENDPOINT}/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: sessionId,
        quiz_id: quizId,
        user_id: "instructor-preview",
        mode,
        initial_difficulty: initialDifficulty,
        is_preview: true,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.detail || "Unable to start preview session.");
    }
    const normalizedSession = {
      sessionId,
      quizId,
      mode,
      initialDifficulty,
      topics,
    };
    writeStoredPreviewSession(normalizedSession);
    setSessionInfo(normalizedSession);
    setSelectedDifficulty(initialDifficulty);
    return normalizedSession;
  }, [meta, sessionInfo, deriveTopicsPayload, deriveInitialDifficulty, readStoredPreviewMeta, writeStoredPreviewSession]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedMeta = readStoredPreviewMeta();
    setMeta(storedMeta);
    const storedSession = readStoredPreviewSession();
    if (storedSession?.sessionId) {
      setSessionInfo(storedSession);
      setSelectedDifficulty(deriveInitialDifficulty(storedSession, storedMeta));
      cleanupRequestedRef.current = false;
    } else {
      setSelectedDifficulty(deriveInitialDifficulty(null, storedMeta));
    }
    setIsLoading(false);
  }, [deriveInitialDifficulty, readStoredPreviewMeta, readStoredPreviewSession]);
  const requestQuestion = useCallback(
    async ({ topicOverride, difficultyOverride, isInitial = false } = {}) => {
      setIsFetchingQuestion(true);
      setError(null);
      try {
        let activeSession = sessionInfo;
        if (!activeSession?.sessionId) {
          activeSession = await createPreviewSession();
        }
        const params = new URLSearchParams();
        if (topicOverride) params.set("topic", topicOverride);
        if (difficultyOverride) params.set("difficulty", difficultyOverride);
        const query = params.toString();
        const response = await fetch(
          `${QUIZ_SESSION_ENDPOINT}/${activeSession.sessionId}/next${query ? `?${query}` : ""}`
        );
        const payload = await response.json().catch(() => ({}));
        if (response.status === 404) {
          throw new Error(
            "Preview session expired. Please return to the configuration page and launch the preview again."
          );
        }
        if (response.status === 429) {
          showRateLimitNotice();
          throw new Error(payload.detail || "Too many requests. Please try again shortly.");
        }
        if (!response.ok) {
          throw new Error(payload.detail || "Unable to load question.");
        }
        const normalized = normalizeQuestion(payload);
        setHistory((prev) => {
          const next = [...prev, { question: normalized, response: null }];
          const nextIndex = next.length - 1;
          setCurrentIndex(nextIndex);
          return next;
        });
        setSelectedAnswerId(null);
        if (isInitial) {
          setIsLoading(false);
        }
      } catch (fetchError) {
        console.error("Unable to fetch question", fetchError);
        setError(fetchError.message || "Unable to load question.");
        setIsLoading(false);
      } finally {
        setIsFetchingQuestion(false);
      }
    },
    [sessionInfo, createPreviewSession, showRateLimitNotice]
  );

  useEffect(() => {
    if (!selectedTopic) return;
    if (initialQuestionRequestedRef.current) return;
    initialQuestionRequestedRef.current = true;
    requestQuestion({
      topicOverride: selectedTopic,
      difficultyOverride: selectedDifficulty,
      isInitial: true,
    });
  }, [selectedTopic, selectedDifficulty, requestQuestion]);

  useEffect(() => {
    const entry = history[currentIndex];
    if (!entry || !entry.response) {
      setSelectedAnswerId(null);
      return;
    }
    const match = entry.question.options.find(
      (option) => option.text === entry.response.selected_answer
    );
    setSelectedAnswerId(match?.id || null);
  }, [currentIndex, history]);

  const currentEntry = history[currentIndex] || null;
  const currentQuestion = currentEntry?.question || null;
  const currentResponse = currentEntry?.response || null;

  const handleAnswerSelect = (optionId) => {
    if (currentResponse) return;
    setSelectedAnswerId(optionId);
  };

  const handleSubmit = async () => {
    if (!currentQuestion || !selectedAnswerId || !sessionInfo) {
      alert("Please select an answer before submitting.");
      return;
    }
    setIsSubmitting(true);
    try {
      const selectedOption = currentQuestion.options.find((opt) => opt.id === selectedAnswerId);
      const response = await fetch(
        `${QUIZ_SESSION_ENDPOINT}/${sessionInfo.sessionId}/answer`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question_id: currentQuestion.question_id,
            selected_answer: selectedOption?.text,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (response.status === 429) {
        showRateLimitNotice();
        throw new Error(data.detail || "Too many requests. Please try again shortly.");
      }
      if (!response.ok) {
        throw new Error(data.detail || "Unable to submit answer.");
      }
      setHistory((prev) => {
        const next = [...prev];
        next[currentIndex] = {
          question: next[currentIndex].question,
          response: data,
        };
        return next;
      });
    } catch (submitError) {
      console.error("Unable to submit answer", submitError);
      alert(submitError.message || "Unable to submit answer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const goToQuestion = (index) => {
    const clamped = Math.max(0, Math.min(index, history.length - 1));
    setCurrentIndex(clamped);
  };

  const handlePreviousQuestion = () => {
    if (currentIndex === 0) return;
    goToQuestion(currentIndex - 1);
  };

  const handleNextQuestion = async () => {
    if (currentIndex < history.length - 1) {
      goToQuestion(currentIndex + 1);
      return;
    }
    if (!currentResponse || isFetchingQuestion) return;
    await requestQuestion({
      topicOverride: selectedTopic,
      difficultyOverride: selectedDifficulty,
    });
  };

  const cleanupPreviewSession = useCallback(async ({ useKeepAlive = false } = {}) => {
    if (!sessionInfo?.sessionId || cleanupRequestedRef.current) return;
    cleanupRequestedRef.current = true;
    try {
      await fetch(`${QUIZ_SESSION_ENDPOINT}/${sessionInfo.sessionId}`, {
        method: "DELETE",
        keepalive: useKeepAlive,
      });
    } catch (cleanupError) {
      console.warn("Unable to clean up preview session", cleanupError);
    } finally {
      if (typeof window !== "undefined") {
        localStorage.removeItem("quizPreviewSession");
      }
    }
  }, [sessionInfo]);

  // Skip automatic cleanup on StrictMode double-invocation; rely on explicit exits.

  const handleReturnToConfig = async () => {
    const target = meta.mode === "practice" ? "/Instructor/Practice" : "/Instructor/Assessment";
    try {
      if (typeof window !== "undefined") {
        const seed = safeParse(localStorage.getItem("quizGeneratorSeed")) || {};
        if (meta.mode === "practice") {
          const draft = {
            mode: "practice",
            title: meta?.title ?? "",
            description: meta?.description ?? "",
            topics: Array.isArray(meta?.topicsToTest) ? meta.topicsToTest : [],
            id: meta?.id ?? meta?.quizId ?? null,
            sourceFilename: meta?.sourceFilename ?? seed.filename ?? "",
            documentId: meta?.documentId ?? seed.documentId ?? null,
            isPublished: Boolean(meta?.isPublished),
          };
          localStorage.setItem("quizConfigDraft", JSON.stringify(draft));
        } else {
          const configuration = meta?.configuration ?? {};
          const draft = {
            mode: "assessment",
            id: meta?.quizId ?? meta?.id ?? null,
            sourceFilename: meta?.sourceFilename ?? seed.filename ?? "",
            documentId: meta?.documentId ?? seed.documentId ?? null,
            configuration,
            isPublished: Boolean(meta?.isPublished),
          };
          localStorage.setItem("quizConfigDraft", JSON.stringify(draft));
        }
      }
    } catch (storageError) {
      console.error("Unable to persist configuration draft before returning", storageError);
    } finally {
      await cleanupPreviewSession();
      router.push(target);
    }
  };
  
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePageHide = () => {
      cleanupPreviewSession({ useKeepAlive: true });
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [cleanupPreviewSession]);

  const modeLabel = meta.mode === "practice" ? "Practice" : "Assessment";
  const questionCount = history.length || 1;
  const isLatestQuestion = currentIndex === history.length - 1;
  const currentTopic = currentQuestion?.topic || selectedTopic || "General";
  const currentDifficulty =
    currentQuestion?.difficulty || sessionInfo?.initialDifficulty || selectedDifficulty;
  const sourceMetadata = currentQuestion?.source_metadata || {};
  const slideNumber = sourceMetadata.slide_number;
  const slideTitle = sourceMetadata.slide_title;
  const sourceFilename =
    meta.sourceFilename ||
    meta?.configuration?.sourceFilename ||
    meta?.configuration?.source_filename ||
    "Uploaded slides";
  const locationLabel = slideNumber
    ? `Slide ${slideNumber}${slideTitle ? ` · ${slideTitle}` : ""}`
    : slideTitle || "Uploaded material";
  const sourceLabel = `${locationLabel} · ${sourceFilename}`;

  if (isLoading || (!currentQuestion && isFetchingQuestion)) {
    return (
      <div className="min-h-screen bg-pink-50 flex items-center justify-center">
        <div className={`text-purple-900 text-xl ${poppins.className}`}>Loading question...</div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-pink-50 flex flex-col items-center justify-center">
        <p className={`text-lg text-purple-900 mb-4 ${poppins.className}`}>
          {error || "No questions are available for this preview yet."}
        </p>
        <button
          type="button"
          onClick={handleReturnToConfig}
          className={`px-6 py-3 rounded-xl text-white font-semibold shadow-lg ${poppins.className}`}
          style={{
            background: "linear-gradient(to right, #7B2CBF, #3B82F6)",
          }}
        >
          Back to Configuration
        </button>
      </div>
    );
  }

  const showFeedback = Boolean(currentResponse);
  const selectedAnswerText =
    currentResponse?.selected_answer ||
    currentQuestion.options.find((opt) => opt.id === selectedAnswerId)?.text;
  const correctAnswerText = currentResponse?.correct_answer;
  const options = currentQuestion.options || [];

  return (
    <div className="min-h-screen bg-pink-50 p-8">
      {rateLimitNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className={`mb-3 text-lg font-semibold text-purple-900 ${poppins.className}`}>
              Please try again soon
            </h3>
            <p className={`mb-4 text-sm text-gray-700 ${poppins.className}`}>{rateLimitNotice}</p>
            <button
              type="button"
              onClick={() => setRateLimitNotice(null)}
              className={`w-full rounded-lg bg-gradient-to-r from-purple-600 to-pink-500 px-4 py-2 text-white font-semibold ${poppins.className}`}
            >
              Got it
            </button>
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReturnToConfig}
            className={`text-lg text-purple-700 hover:text-purple-900 font-semibold ${poppins.className}`}
          >
            ← Back to Configuration
          </button>
        </div>
        <div className="mb-6">
          <h2 className={`text-2xl font-bold text-purple-900 ${poppins.className}`}>
            {modeLabel} Quiz Preview · Question {currentIndex + 1} / {questionCount}
          </h2>
          <div className="mt-2 grid grid-cols-1 gap-3 text-base md:grid-cols-3 text-gray-700">
            <div>
              <span className="font-semibold text-gray-700">Current difficulty:</span>{" "}
              <span className="capitalize">{currentDifficulty}</span>
            </div>
            <div>
              <span className="font-semibold text-gray-700">Topic:</span> {currentTopic}
            </div>
            <div>
              <span className="font-semibold text-gray-700">Source:</span> {sourceLabel}
            </div>
          </div>
          {error && (
            <p className={`mt-2 text-sm text-red-600 ${poppins.className}`}>{error}</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <h1 className={`text-2xl font-bold text-purple-900 mb-6 ${poppins.className}`}>
              {currentQuestion.prompt}
            </h1>
            {showFeedback && currentResponse && (
              <div className="mb-6 rounded-2xl border border-purple-200 bg-purple-50 p-4">
                <p
                  className={`text-base font-semibold ${
                    currentResponse.is_correct ? "text-green-700" : "text-red-600"
                  } ${poppins.className}`}
                >
                  {currentResponse.is_correct
                    ? "Correct — nice work!"
                    : "Not quite — review the explanations below."}
                </p>
                <p className={`mt-1 text-sm text-purple-900 ${poppins.className}`}>
                  Correct answer:{" "}
                  <span className="font-semibold">
                    {currentResponse.correct_answer}
                  </span>
                </p>
              </div>
            )}
          </div>

          <div className="lg:col-span-1">
            <div className="space-y-4">
              {options.map((option) => {
                const isSelected = selectedAnswerId === option.id;
                const isCorrectOption = option.text === correctAnswerText;
                const baseClasses = showFeedback
                  ? isCorrectOption
                    ? "bg-green-50 border-2 border-green-500"
                    : isSelected
                      ? "bg-red-50 border-2 border-red-400"
                      : "bg-gray-100 border border-gray-300"
                  : isSelected
                    ? "bg-purple-200 border-2 border-purple-600"
                    : "bg-gray-100 border border-gray-300 hover:bg-gray-200";

                const explanation = showFeedback
                  ? isCorrectOption
                    ? currentResponse?.correct_rationale || "This choice is correct."
                    : currentResponse?.incorrect_rationales?.[option.text] ||
                      "This choice is incorrect."
                  : null;

                return (
                  <button
                    key={option.id}
                    onClick={() => handleAnswerSelect(option.id)}
                    className={`w-full px-6 py-4 rounded-xl text-left transition-all duration-200 ${baseClasses} ${poppins.className}`}
                    disabled={showFeedback}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-semibold ${
                          isSelected ? "text-purple-900" : "text-gray-600"
                        }`}
                      >
                        {option.id}.
                      </span>
                      <span
                        className={
                          isSelected
                            ? "text-purple-900 font-medium"
                            : "text-gray-700"
                        }
                      >
                        {option.text}
                      </span>
                    </div>
                    {explanation && (
                      <p
                        className={`mt-2 text-sm ${
                          isCorrectOption
                            ? "text-green-700"
                            : isSelected
                              ? "text-red-600"
                              : "text-gray-500"
                        }`}
                      >
                        {explanation}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className={`text-sm text-gray-600 ${poppins.className}`}>
                Next question difficulty:
              </label>
              <select
                value={selectedDifficulty}
                onChange={(event) => setSelectedDifficulty(event.target.value)}
                className={`px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 ${poppins.className}`}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className={`text-sm text-gray-600 ${poppins.className}`}>
                Next question topic:
              </label>
              <select
                value={selectedTopic}
                onChange={(event) => setSelectedTopic(event.target.value)}
                className={`px-3 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 ${poppins.className}`}
              >
                {topicOptions.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handlePreviousQuestion}
              disabled={currentIndex === 0}
              className={`px-5 py-2 rounded-lg border border-purple-400 text-purple-700 font-medium transition-all duration-300 hover:bg-purple-50 disabled:opacity-40 disabled:cursor-not-allowed ${poppins.className}`}
            >
              Previous Question
            </button>
            {isLatestQuestion ? (
              showFeedback ? (
                <button
                  onClick={handleNextQuestion}
                  disabled={isFetchingQuestion}
                  className={`px-6 py-3 rounded-xl text-white font-semibold transition-all duration-300 hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${poppins.className}`}
                  style={{
                    background: "linear-gradient(to right, #EC4899, #F97316)",
                  }}
                >
                  {isFetchingQuestion ? "Generating..." : "Next Question"}
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={!selectedAnswerId || isSubmitting}
                  className={`px-6 py-3 rounded-xl text-white font-semibold transition-all duration-300 hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 ${poppins.className}`}
                  style={{
                    background: "linear-gradient(to right, #EC4899, #F97316)",
                  }}
                >
                  {isSubmitting ? "Submitting..." : "Submit Answer"}
                </button>
              )
            ) : (
              <button
                onClick={handleNextQuestion}
                className={`px-5 py-2 rounded-lg border border-gray-300 text-gray-600 font-medium transition-all duration-300 hover:bg-gray-100 ${poppins.className}`}
              >
                Next Question
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
