"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const API_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const QUIZ_SESSION_ENDPOINT = `${API_BASE_URL}/quiz/session`;
const QUIZ_DEFINITION_ENDPOINT = `${API_BASE_URL}/quiz/definitions`;
const STUDENT_USER_ID = process.env.NEXT_PUBLIC_STUDENT_ID || "student-demo";
const SESSION_META_KEY_PREFIX = "hl-student-quiz-session-";
const ACTIVE_SESSION_KEY_PREFIX = "hl-student-active-session-";
const OPTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

const normalizeQuestion = (payload) => {
  const options = (payload.choices || []).map((choice, index) => ({
    id: OPTION_LETTERS[index] || `Choice-${index + 1}`,
    text: choice,
  }));
  return {
    ...payload,
    options,
  };
};

const formatDuration = (durationMs) => {
  if (typeof durationMs !== "number" || durationMs <= 0) return "—";
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
};

const formatTimestamp = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const ReviewCard = ({ attempt, index }) => {
  const { question, response } = attempt;
  const selected = question.options.find((opt) => opt.text === response.selected_answer);
  const correct = question.options.find((opt) => opt.text === response.correct_answer);
  const sourceMetadata = question.source_metadata || {};
  const slideNumber = sourceMetadata.slide_number;
  const slideTitle = sourceMetadata.slide_title;
  const filename =
    sourceMetadata.source_filename ||
    sourceMetadata.document_title ||
    sourceMetadata.sourceFilename ||
    "Uploaded material";
  const sourceLabel = slideNumber
    ? `Slide ${slideNumber}${slideTitle ? ` · ${slideTitle}` : ""} · ${filename}`
    : `${slideTitle || "Uploaded material"} · ${filename}`;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-purple-700">Question {index + 1}</p>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${response.is_correct ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}
        >
          {response.is_correct ? "Correct" : "Incorrect"}
        </span>
      </div>
      <p className="mt-3 text-base font-medium text-gray-900">{question.prompt}</p>
      <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-gray-600 sm:grid-cols-3">
        <div>
          <span className="font-semibold text-gray-700">Topic:</span> {question.topic || "General"}
        </div>
        <div>
          <span className="font-semibold text-gray-700">Difficulty:</span>{" "}
          <span className="capitalize">{question.difficulty || "medium"}</span>
        </div>
        <div>
          <span className="font-semibold text-gray-700">Source:</span> {sourceLabel}
        </div>
      </div>
      <div className="mt-4 space-y-3 text-sm">
        {question.options.map((option) => {
          const isCorrect = option.text === response.correct_answer;
          const wasSelected = option.text === response.selected_answer;
          return (
            <div
              key={option.id}
              className={`rounded-2xl border px-4 py-3 ${
                isCorrect
                  ? "border-green-500 bg-green-50 text-green-900"
                  : wasSelected
                  ? "border-red-500 bg-red-50 text-red-900"
                  : "border-gray-200 bg-white text-gray-800"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-purple-700 mr-2">{option.id}.</span>
                {isCorrect && <span className="text-xs font-semibold uppercase text-green-700">Correct</span>}
                {!isCorrect && wasSelected && (
                  <span className="text-xs font-semibold uppercase text-red-700">Selected</span>
                )}
              </div>
              <p className="mt-1">{option.text}</p>
              {isCorrect && response.correct_rationale && (
                <p className="mt-2 text-sm text-gray-700">{response.correct_rationale}</p>
              )}
              {!isCorrect && wasSelected && response.incorrect_rationales?.[option.text] && (
                <p className="mt-2 text-sm text-gray-700">{response.incorrect_rationales[option.text]}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function StudentQuizSessionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const quizId = Array.isArray(params?.quizId) ? params.quizId[0] : params?.quizId;
  const sessionId = Array.isArray(params?.sessionId) ? params.sessionId[0] : params?.sessionId;
  const forcedReview = (searchParams?.get("mode") || "").toLowerCase() === "review";

  const [sessionMeta, setSessionMeta] = useState(null);
  const [quizDetails, setQuizDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentResponse, setCurrentResponse] = useState(null);
  const currentQuestionRef = useRef(null);
  const currentResponseRef = useRef(null);
  const [selectedAnswerId, setSelectedAnswerId] = useState(null);
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState(null);
  const [reviewAttempts, setReviewAttempts] = useState([]);
  const [showSummaryView, setShowSummaryView] = useState(false);
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [isFetchingQuestion, setIsFetchingQuestion] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [error, setError] = useState(null);
  const [rateLimitNotice, setRateLimitNotice] = useState(null);
  const initialQuestionRequestedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !sessionId) return;
    const stored = localStorage.getItem(`${SESSION_META_KEY_PREFIX}${sessionId}`);
    if (stored) {
      try {
        setSessionMeta(JSON.parse(stored));
      } catch (parseError) {
        console.warn("Unable to parse stored session metadata", parseError);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    if (sessionMeta?.quizName || !quizId) return;
    let active = true;
    const loadDefinition = async () => {
      try {
        const response = await fetch(`${QUIZ_DEFINITION_ENDPOINT}/${encodeURIComponent(quizId)}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) return;
        if (active) {
          setQuizDetails(payload);
        }
      } catch (definitionError) {
        console.warn("Unable to load quiz details", definitionError);
      }
    };
    loadDefinition();
    return () => {
      active = false;
    };
  }, [quizId, sessionMeta]);

  useEffect(() => {
    if (typeof window === "undefined" || !quizId || !sessionId) return;
    try {
      if (summary && summary.status !== "in_progress") {
        localStorage.removeItem(`${ACTIVE_SESSION_KEY_PREFIX}${quizId}`);
      } else {
        localStorage.setItem(`${ACTIVE_SESSION_KEY_PREFIX}${quizId}`, sessionId);
      }
    } catch {
      // ignore storage failures
    }
  }, [quizId, sessionId, summary]);

  const mapAttempts = useCallback((attempts) => {
    return attempts.map((entry, index) => {
      const questionPayload = normalizeQuestion({
        question_id: entry.question_id,
        prompt: entry.prompt,
        choices: entry.choices,
        topic: entry.topic,
        difficulty: entry.difficulty,
        source_metadata: entry.source_metadata,
        order: index + 1,
      });
      const responsePayload = {
        question_id: entry.question_id,
        is_correct: entry.is_correct,
        selected_answer: entry.selected_answer,
        correct_answer: entry.correct_answer,
        rationale: entry.rationale || entry.correct_rationale,
        correct_rationale: entry.correct_rationale,
        incorrect_rationales: entry.incorrect_rationales,
      };
      return { question: questionPayload, response: responsePayload };
    });
  }, []);

  const fetchSessionSnapshot = useCallback(
    async ({ silent } = { silent: false }) => {
      if (!sessionId) return;
      if (!silent) {
        setIsLoading(true);
      }
      setError(null);
      try {
        const response = await fetch(
          `${QUIZ_SESSION_ENDPOINT}/${encodeURIComponent(sessionId)}?user_id=${encodeURIComponent(STUDENT_USER_ID)}`
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.detail || "Unable to load this session.");
        }
        if (payload.summary) {
          setSummary(payload.summary);
        }
        if (Array.isArray(payload.attempts)) {
          const normalized = mapAttempts(payload.attempts);
          setHistory(normalized);
          setReviewAttempts(normalized);
        }
        if (payload.summary && payload.summary.status !== "in_progress") {
          setShowSummaryView(true);
        }
      } catch (snapshotError) {
        setError(snapshotError.message || "Unable to load this session.");
      } finally {
        setIsLoading(false);
      }
    },
    [mapAttempts, sessionId]
  );

  useEffect(() => {
    fetchSessionSnapshot();
  }, [fetchSessionSnapshot]);

  useEffect(() => {
    currentQuestionRef.current = currentQuestion;
  }, [currentQuestion]);

  useEffect(() => {
    currentResponseRef.current = currentResponse;
  }, [currentResponse]);

  const requestQuestion = useCallback(async () => {
    if (!sessionId || showSummaryView) return;
    if (initialQuestionRequestedRef.current && currentQuestionRef.current && !currentResponseRef.current) {
      return;
    }
    setIsFetchingQuestion(true);
    setError(null);
    try {
      const response = await fetch(`${QUIZ_SESSION_ENDPOINT}/${encodeURIComponent(sessionId)}/next`);
      const payload = await response.json().catch(() => ({}));
      if (response.status === 410) {
        await fetchSessionSnapshot({ silent: true });
        setShowSummaryView(true);
        return;
      }
      if (!response.ok) {
        throw new Error(payload.detail || "Unable to fetch the next question.");
      }
      initialQuestionRequestedRef.current = true;
      const normalized = normalizeQuestion(payload);
      setCurrentQuestion(normalized);
      setSelectedAnswerId(null);
      setCurrentResponse(null);
    } catch (questionError) {
      setError(questionError.message || "Unable to fetch the next question.");
    } finally {
      setIsLoading(false);
      setIsFetchingQuestion(false);
    }
  }, [fetchSessionSnapshot, sessionId, showSummaryView]);

  useEffect(() => {
    if (!summary || summary.status !== "in_progress") return;
    if (forcedReview) {
      setShowSummaryView(true);
      return;
    }
    requestQuestion();
  }, [forcedReview, requestQuestion, summary]);

  const handleSelectOption = (optionId) => {
    if (currentResponse) return;
    setSelectedAnswerId(optionId);
  };

  const handleSubmit = async () => {
    if (!currentQuestion || !selectedAnswerId || !sessionId) {
      setError("Select an answer before submitting.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const selectedOption = currentQuestion.options.find((opt) => opt.id === selectedAnswerId);
      const response = await fetch(`${QUIZ_SESSION_ENDPOINT}/${encodeURIComponent(sessionId)}/answer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question_id: currentQuestion.question_id,
          selected_answer: selectedOption?.text,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 429) {
        setRateLimitNotice(
          "We're hitting a temporary content generation limit. Please wait a moment and try again."
        );
        throw new Error(payload.detail || "Please wait before submitting again.");
      }
      if (!response.ok) {
        throw new Error(payload.detail || "Unable to submit your answer.");
      }
      const attemptRecord = { question: currentQuestion, response: payload };
      setHistory((prev) => [...prev, attemptRecord]);
      setReviewAttempts((prev) => [...prev, attemptRecord]);
      setCurrentResponse(payload);
      setSummary((prevSummary) => payload.summary || prevSummary);
      if (payload.summary) {
        setShowSummaryView(true);
      }
    } catch (submitError) {
      setError(submitError.message || "Unable to submit your answer.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextQuestion = async () => {
    if (isFetchingQuestion) return;
    setCurrentQuestion(null);
    setCurrentResponse(null);
    setSelectedAnswerId(null);
    await requestQuestion();
  };

  const handleEndSession = async () => {
    if (!sessionId) return;
    setIsEndingSession(true);
    setError(null);
    try {
      const response = await fetch(`${QUIZ_SESSION_ENDPOINT}/${encodeURIComponent(sessionId)}/end`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || "Unable to end this session.");
      }
      setSummary(payload);
      setShowSummaryView(true);
      await fetchSessionSnapshot({ silent: true });
      try {
        if (quizId) {
          localStorage.removeItem(`${ACTIVE_SESSION_KEY_PREFIX}${quizId}`);
        }
      } catch {
        // ignore storage cleanup issues
      }
    } catch (endError) {
      setError(endError.message || "Unable to end this session.");
    } finally {
      setIsEndingSession(false);
    }
  };

  const handleReturnToOverview = () => {
    router.push(`/Student/Quizzes/${encodeURIComponent(quizId)}`);
  };

  const handleReviewQuestions = () => {
    setShowReviewPanel(true);
    setShowSummaryView(true);
  };

  const quizTitle = sessionMeta?.quizName || quizDetails?.name || "Quiz Session";
  const sourceFilename = sessionMeta?.sourceFilename || quizDetails?.source_filename || "Uploaded material";
  const isSessionComplete = summary && summary.status !== "in_progress";
  const showQuestionMetadata = Boolean(currentResponse);

  const activeSourceMetadata = currentQuestion?.source_metadata || {};
  const slideNumber = activeSourceMetadata.slide_number;
  const slideTitle = activeSourceMetadata.slide_title;
  const locationLabel = slideNumber
    ? `Slide ${slideNumber}${slideTitle ? ` · ${slideTitle}` : ""}`
    : slideTitle || "Uploaded material";
  const sourceLabel = `${locationLabel} · ${sourceFilename}`;

  if (!quizId || !sessionId) {
    return (
      <div className="min-h-screen bg-pink-50 flex items-center justify-center px-6 text-center">
        <div className="rounded-3xl bg-white px-6 py-8 shadow">
          <p className={`text-base text-gray-700 ${poppins.className}`}>Missing quiz or session identifier.</p>
          <button
            type="button"
            className="mt-4 rounded-xl border border-purple-300 px-4 py-2 text-sm font-semibold text-purple-700"
            onClick={handleReturnToOverview}
          >
            Back to quizzes
          </button>
        </div>
      </div>
    );
  }

  if (isLoading && !currentQuestion && !showSummaryView) {
    return (
      <div className="min-h-screen bg-pink-50 flex flex-col items-center justify-center px-6 text-center">
        <p className={`text-lg text-purple-900 ${poppins.className}`}>Loading your session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pink-50 px-6 py-10">
      {rateLimitNotice && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl">
            <p className={`text-base text-gray-800 ${poppins.className}`}>{rateLimitNotice}</p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-2 text-white"
              onClick={() => setRateLimitNotice(null)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleReturnToOverview}
            className="text-sm font-semibold text-purple-700 hover:text-purple-900"
          >
            ← Back to Quiz Overview
          </button>
          {!showSummaryView && (
            <button
              type="button"
              onClick={handleEndSession}
              disabled={isEndingSession}
              className={`rounded-xl border border-purple-300 px-4 py-2 text-sm font-semibold text-purple-700 ${
                isEndingSession ? "opacity-60" : "hover:border-purple-500"
              }`}
            >
              {isEndingSession ? "Ending..." : "End Quiz Session"}
            </button>
          )}
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {showSummaryView ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="flex flex-col items-center gap-6 text-center">
              <div>
                <p className="text-sm uppercase tracking-wide text-purple-600 font-semibold">Session summary</p>
                <h1 className={`mt-1 text-4xl font-bold text-gray-900 ${poppins.className}`}>{quizTitle}</h1>
              </div>
              {summary ? (
                <>
                  <div
                    className="flex h-48 w-48 flex-col items-center justify-center rounded-full shadow"
                    style={{ background: "linear-gradient(135deg, #EC4899, #A855F7)" }}
                  >
                    <p className="text-lg font-semibold text-white">Accuracy</p>
                    <p className="text-5xl font-bold text-white mt-1">{Math.round((summary.accuracy || 0) * 100)}%</p>
                    <p className="text-sm text-white/80">
                      {summary.correct_answers}/{summary.total_questions} correct
                    </p>
                  </div>
                  <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-2xl border border-gray-100 px-4 py-3 text-left">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Duration</p>
                      <p className="text-lg font-semibold text-gray-900">{formatDuration(summary.duration_ms)}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-100 px-4 py-3 text-left">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Max streak</p>
                      <p className="text-lg font-semibold text-gray-900">{summary.max_correct_streak || 0}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-100 px-4 py-3 text-left">
                      <p className="text-xs uppercase tracking-wide text-gray-500">Finished</p>
                      <p className="text-lg font-semibold text-gray-900">{formatTimestamp(summary.completed_at)}</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-base text-gray-600">Session summary will appear once this quiz has questions.</p>
              )}
              <div className="flex w-full flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleReturnToOverview}
                  className="w-full rounded-2xl border border-purple-300 px-4 py-3 text-sm font-semibold text-purple-700"
                >
                  Return to Quiz Overview
                </button>
                <button
                  type="button"
                  onClick={handleReviewQuestions}
                  disabled={!reviewAttempts.length}
                  className={`w-full rounded-2xl bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-3 text-sm font-semibold text-white shadow ${
                    reviewAttempts.length ? "" : "opacity-60"
                  }`}
                >
                  Review Questions
                </button>
              </div>
            </div>
            {showReviewPanel && reviewAttempts.length > 0 && (
              <div className="mt-8 space-y-4">
                {reviewAttempts.map((attempt, index) => (
                  <ReviewCard key={`${attempt.question.question_id}-${index}`} attempt={attempt} index={index} />
                ))}
              </div>
            )}
          </div>
        ) : currentQuestion ? (
          <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
            <div className="flex flex-col gap-1">
              <p className="text-sm uppercase tracking-wide text-purple-600 font-semibold">
                {sessionMeta?.mode === "assessment" ? "Assessment" : "Practice"} Mode
              </p>
              <h1 className={`text-3xl font-bold text-gray-900 ${poppins.className}`}>{quizTitle}</h1>
              <p className="text-sm text-gray-500">Source: {sourceFilename}</p>
            </div>
            <div className="mt-6">
              <p className={`text-2xl font-semibold text-gray-900 ${poppins.className}`}>{currentQuestion.prompt}</p>
              {showQuestionMetadata && (
                <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-600 sm:grid-cols-3">
                  <div>
                    <span className="font-semibold text-gray-700">Current difficulty:</span> {currentQuestion.difficulty || "—"}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Topic:</span> {currentQuestion.topic || "General"}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Source:</span> {sourceLabel}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6 space-y-3">
              {currentQuestion.options.map((option) => {
                const isSelected = selectedAnswerId === option.id;
                const isCorrect = currentResponse?.correct_answer === option.text;
                const isIncorrect = currentResponse && currentResponse.selected_answer === option.text && !currentResponse.is_correct;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={Boolean(currentResponse)}
                    onClick={() => handleSelectOption(option.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left text-base font-medium transition ${
                      isCorrect
                        ? "border-green-500 bg-green-50 text-green-900"
                        : isIncorrect
                        ? "border-red-500 bg-red-50 text-red-900"
                        : isSelected
                        ? "border-purple-500 bg-purple-50 text-purple-900"
                        : "border-gray-200 bg-white text-gray-800 hover:border-purple-300"
                    }`}
                  >
                    <span className="font-semibold text-purple-700 mr-2">{option.id}.</span> {option.text}
                  </button>
                );
              })}
            </div>
            {currentResponse ? (
              <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <p
                  className={`text-lg font-semibold ${
                    currentResponse.is_correct ? "text-green-700" : "text-red-700"
                  }`}
                >
                  {currentResponse.is_correct ? "Great job!" : "Let's review this concept."}
                </p>
                <p className="mt-2 text-sm text-gray-700">
                  Correct answer: <span className="font-semibold">{currentResponse.correct_answer}</span>
                </p>
                <p className="mt-2 text-sm text-gray-700">
                  {currentResponse.rationale || currentResponse.correct_rationale}
                </p>
                {!showSummaryView && !isSessionComplete && (
                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="mt-4 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Next Question
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!selectedAnswerId || isSubmitting}
                className={`mt-6 w-full rounded-2xl bg-gradient-to-r from-purple-500 to-blue-500 px-5 py-3 text-lg font-semibold text-white shadow ${
                  selectedAnswerId && !isSubmitting ? "" : "opacity-60"
                }`}
              >
                {isSubmitting ? "Submitting..." : "Submit Answer"}
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white px-6 py-12 text-center shadow">
            <p className={`text-base text-gray-600 ${poppins.className}`}>
              {isSessionComplete ? "This session is complete." : "Fetching your next question..."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
