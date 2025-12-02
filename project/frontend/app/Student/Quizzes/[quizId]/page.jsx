"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const API_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const QUIZ_DEFINITION_ENDPOINT = `${API_BASE_URL}/quiz/definitions`;
const QUIZ_SESSION_ENDPOINT = `${API_BASE_URL}/quiz/session`;
const STUDENT_USER_ID = process.env.NEXT_PUBLIC_STUDENT_ID || "student-demo";
const SESSION_META_KEY_PREFIX = "hl-student-quiz-session-";
const ACTIVE_SESSION_KEY_PREFIX = "hl-student-active-session-";

/** Small info pill used to show quiz metadata. */
const InfoRow = ({ label, value }) => (
  <div className="flex flex-col gap-1 rounded-2xl border border-gray-200 bg-white px-4 py-3">
    <span className="text-xs uppercase tracking-wide text-gray-500">{label}</span>
    <span className="text-sm text-gray-900">{value || "—"}</span>
  </div>
);

/**
 * Quiz details page where students can start, resume, or review attempts.
 */
export default function StudentQuizDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const quizId = Array.isArray(params?.quizId) ? params.quizId[0] : params?.quizId;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState(null);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isStartingAttempt, setIsStartingAttempt] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [hasActiveSession, setHasActiveSession] = useState(false);
  const [isCheckingResume, setIsCheckingResume] = useState(true);

  useEffect(() => {
    if (!quizId) return;
    let isMounted = true;
    /** Retrieves quiz definition details for the requested quiz. */
    const fetchDefinition = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${QUIZ_DEFINITION_ENDPOINT}/${encodeURIComponent(quizId)}`);
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.detail || "Unable to load quiz details.");
        }
        if (isMounted) {
          setQuiz(payload);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message || "Unable to load quiz details.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };
    fetchDefinition();
    return () => {
      isMounted = false;
    };
  }, [quizId]);

  /** Loads recent quiz sessions for this quiz and student. */
  const fetchHistory = useCallback(async () => {
    if (!quizId) return;
    setIsHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await fetch(
        `${QUIZ_DEFINITION_ENDPOINT}/${encodeURIComponent(quizId)}/sessions?user_id=${encodeURIComponent(STUDENT_USER_ID)}&limit=15`
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || "Unable to load previous attempts.");
      }
      setHistory(payload.sessions || []);
    } catch (historyErr) {
      setHistoryError(historyErr.message || "Unable to load previous attempts.");
    } finally {
      setIsHistoryLoading(false);
    }
  }, [quizId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  /** Stores session metadata locally for quick resume and review. */
  const persistSessionMeta = (sessionId, payload) => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(`${SESSION_META_KEY_PREFIX}${sessionId}`, JSON.stringify(payload));
    } catch (storageError) {
      console.warn("Unable to persist session metadata", storageError);
    }
  };

  /** Reads the active session id for this quiz from local storage. */
  const readActiveSessionId = () => {
    if (typeof window === "undefined" || !quizId) return null;
    try {
      return localStorage.getItem(`${ACTIVE_SESSION_KEY_PREFIX}${quizId}`);
    } catch {
      return null;
    }
  };

  /** Persists the current active session id for this quiz. */
  const writeActiveSessionId = (sessionId) => {
    if (typeof window === "undefined" || !quizId) return;
    try {
      localStorage.setItem(`${ACTIVE_SESSION_KEY_PREFIX}${quizId}`, sessionId);
    } catch (storageError) {
      console.warn("Unable to track active session", storageError);
    }
  };

  /** Clears any stored active session pointer for this quiz. */
  const clearActiveSessionId = () => {
    if (typeof window === "undefined" || !quizId) return;
    try {
      localStorage.removeItem(`${ACTIVE_SESSION_KEY_PREFIX}${quizId}`);
    } catch {
      // ignore
    }
  };

  /** Attempts to resume an in-progress session; optionally navigates to it. */
  const tryResumeExistingSession = useCallback(async ({ navigate = false } = {}) => {
    const existingSessionId = readActiveSessionId();
    if (!existingSessionId) return false;
    try {
      const response = await fetch(
        `${QUIZ_SESSION_ENDPOINT}/${encodeURIComponent(existingSessionId)}?user_id=${encodeURIComponent(STUDENT_USER_ID)}`
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.summary) {
        clearActiveSessionId();
        return false;
      }
      if (payload.summary.status === "in_progress") {
        setHasActiveSession(true);
        if (navigate) {
          router.push(
            `/Student/Quizzes/${encodeURIComponent(quizId)}/sessions/${encodeURIComponent(existingSessionId)}`
          );
        }
        return true;
      }
      clearActiveSessionId();
      setHasActiveSession(false);
      return false;
    } catch (resumeError) {
      console.warn("Unable to resume session", resumeError);
      clearActiveSessionId();
      setHasActiveSession(false);
      return false;
    }
  }, [quizId, router]);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      setIsCheckingResume(true);
      const resumed = await tryResumeExistingSession();
      if (!alive) return;
      setHasActiveSession(resumed);
      setIsCheckingResume(false);
    };
    check();
    return () => {
      alive = false;
    };
  }, [tryResumeExistingSession]);

  /** Starts or resumes a quiz attempt and routes to the session runner. */
  const handleStartAttempt = async () => {
    if (!quizId || !quiz) return;
    setIsStartingAttempt(true);
    setError(null);
    const resumed = await tryResumeExistingSession({ navigate: true });
    if (resumed) {
      setIsStartingAttempt(false);
      return;
    }
    const sessionId =
      (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `student-${Date.now()}`);
    try {
      const response = await fetch(`${QUIZ_SESSION_ENDPOINT}/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: sessionId,
          quiz_id: quizId,
          user_id: STUDENT_USER_ID,
          mode: quiz.default_mode,
          initial_difficulty: quiz.initial_difficulty || "medium",
          is_preview: false,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || "Unable to start a new attempt.");
      }
      persistSessionMeta(sessionId, {
        sessionId,
        quizId,
        userId: STUDENT_USER_ID,
        quizName: quiz.name,
        mode: payload.mode,
        topics: payload.topics,
        sourceFilename: quiz.source_filename,
      });
      writeActiveSessionId(sessionId);
      router.push(
        `/Student/Quizzes/${encodeURIComponent(quizId)}/sessions/${encodeURIComponent(sessionId)}`
      );
    } catch (startError) {
      setError(startError.message || "Unable to start a new attempt.");
    } finally {
      setIsStartingAttempt(false);
    }
  };

  /** Routes to a completed session to view results. */
  const handleViewResults = (sessionId) => {
    router.push(
      `/Student/Quizzes/${encodeURIComponent(quizId)}/sessions/${encodeURIComponent(sessionId)}?mode=review`
    );
  };

  /** Deletes a stored session and refreshes the history list. */
  const handleDeleteSession = async (sessionId) => {
    if (!sessionId) return;
    try {
      const response = await fetch(
        `${QUIZ_SESSION_ENDPOINT}/${encodeURIComponent(sessionId)}?user_id=${encodeURIComponent(STUDENT_USER_ID)}`,
        {
          method: "DELETE",
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.detail || "Unable to delete session.");
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem(`${SESSION_META_KEY_PREFIX}${sessionId}`);
      }
      setOpenMenuId((prev) => (prev === sessionId ? null : prev));
      await fetchHistory();
    } catch (deleteError) {
      setHistoryError(deleteError.message || "Unable to delete session.");
    }
  };

  /** Formats an accuracy ratio as a percentage string. */
  const formatAccuracy = (accuracy) => {
    const value = typeof accuracy === "number" ? accuracy : 0;
    return `${Math.round(value * 100)}%`;
  };

  /** Formats a millisecond duration as a friendly string. */
  const formatDuration = (durationMs) => {
    if (typeof durationMs !== "number" || durationMs <= 0) return "—";
    const totalSeconds = Math.round(durationMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes === 0) {
      return `${seconds}s`;
    }
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  };

  /** Formats ISO timestamps into a compact readable value. */
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

  const topics = useMemo(() => quiz?.topics || [], [quiz]);
  const metadata = quiz?.metadata || {};
  const description =
    typeof metadata.description === "string" ? metadata.description.trim() : "";
  const fallbackDescription =
    quiz?.default_mode === "assessment"
      ? "Quiz generated from your course material."
      : "Practice quiz generated from your course material.";

  if (!quizId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="max-w-lg rounded-2xl border border-gray-200 bg-white px-6 py-8 text-center shadow-sm">
          <p className={`text-sm text-gray-600 ${poppins.className}`}>Missing quiz identifier.</p>
          <button
            type="button"
            className="mt-4 inline-flex items-center justify-center rounded-lg border border-purple-300 px-4 py-2 text-sm font-semibold text-purple-700"
            onClick={() => router.push("/Student/Quizzes")}
          >
            Back to Quizzes
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/Student/Quizzes")}
            className={`text-sm font-semibold text-purple-700 hover:text-purple-900 ${poppins.className}`}
          >
            ← Back to Quizzes
          </button>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-2xl border border-purple-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className={`text-lg text-purple-900 ${poppins.className}`}>Loading quiz details...</p>
          </div>
        ) : quiz ? (
          <>
            <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-purple-600 font-semibold">
                  {quiz.default_mode === "assessment" ? "Assessment Quiz" : "Practice Quiz"}
                </p>
                <h1 className={`text-4xl font-bold text-gray-900 mt-1 ${poppins.className}`}>
                  {quiz.name || "Untitled Quiz"}
                </h1>
              </div>
              <p className={`text-base text-gray-600 ${poppins.className}`}>
                {description || fallbackDescription}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <InfoRow label="Source Material" value={quiz.source_filename || "—"} />
                <InfoRow
                  label="Questions"
                  value={
                    quiz.default_mode === "assessment"
                      ? quiz.assessment_num_questions ?? "Set by instructor"
                      : "Adaptive"
                  }
                />
                <InfoRow
                  label="Time Limit"
                  value={
                    quiz.default_mode === "assessment"
                      ? quiz.assessment_time_limit_minutes
                        ? `${quiz.assessment_time_limit_minutes} minutes`
                        : "None"
                      : "Not timed"
                  }
                />
              </div>
              <div>
                <h2 className={`text-sm font-semibold text-gray-700 mb-2 ${poppins.className}`}>Topics Covered</h2>
                {topics.length ? (
                  <div className="flex flex-wrap gap-2">
                    {topics.map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"
                      >
                        {topic}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className={`text-sm text-gray-500 ${poppins.className}`}>General knowledge check.</p>
                )}
              </div>
              <div className="pt-4 border-t border-gray-100 space-y-3">
                <p className={`text-sm text-gray-500 ${poppins.className}`}>
                  Practice mode delivers continuous adaptive questions to reinforce your understanding.
                </p>
                <button
                  type="button"
                  onClick={handleStartAttempt}
                  disabled={isStartingAttempt || isCheckingResume}
                  className={`inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-purple-500 to-blue-500 px-5 py-3 text-lg font-semibold text-white shadow-lg transition-transform duration-200 ${
                    isStartingAttempt ? "opacity-60" : "hover:scale-[1.01]"
                  }`}
                >
                  {isStartingAttempt
                    ? "Starting..."
                    : hasActiveSession
                    ? "Resume Active Session"
                    : "Start New Attempt"}
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
              <div className="mb-4">
                <h2 className={`text-2xl font-semibold text-gray-900 ${poppins.className}`}>
                  Previous Attempts
                </h2>
                <p className={`text-sm text-gray-500 ${poppins.className}`}>
                  Track your progress and revisit explanations from earlier sessions.
                </p>
              </div>
              {historyError && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {historyError}
                </div>
              )}
              {isHistoryLoading ? (
                <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-10 text-center text-gray-500">
                  Loading your attempts...
                </div>
              ) : history.length ? (
                <div className="space-y-4">
                  {history.map((attempt) => (
                    <div
                      key={attempt.session_id}
                      className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:border-purple-200"
                    >
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            {attempt.status === "completed" ? "Completed" : attempt.status}
                          </p>
                          <p className="text-3xl font-bold text-gray-900 mt-1">
                            {formatAccuracy(attempt.accuracy)}
                          </p>
                          <p className="text-sm text-gray-500">
                            {attempt.correct_answers}/{attempt.total_questions} correct · {formatTimestamp(attempt.completed_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleViewResults(attempt.session_id)}
                            className="rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow"
                          >
                            View Results
                          </button>
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() =>
                                setOpenMenuId((prev) => (prev === attempt.session_id ? null : attempt.session_id))
                              }
                              className="flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-2xl leading-none text-gray-500 hover:border-purple-200 hover:text-purple-700"
                            >
                              ⋯
                            </button>
                            {openMenuId === attempt.session_id && (
                              <div className="absolute right-0 z-10 mt-2 w-40 rounded-2xl border border-gray-100 bg-white p-1 shadow-lg">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteSession(attempt.session_id)}
                                  className="w-full rounded-xl px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                >
                                  Delete record
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-1 gap-3 text-sm text-gray-600 sm:grid-cols-3">
                        <div className="rounded-xl border border-gray-100 px-4 py-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">Duration</p>
                          <p className="text-base text-gray-900">{formatDuration(attempt.duration_ms)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-100 px-4 py-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">Max streak</p>
                          <p className="text-base text-gray-900">{attempt.max_correct_streak || 0}</p>
                        </div>
                        <div className="rounded-xl border border-gray-100 px-4 py-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">Started</p>
                          <p className="text-base text-gray-900">{formatTimestamp(attempt.started_at)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center text-gray-500">
                  No attempts recorded yet. Your history will appear here once you start practicing.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white px-6 py-10 text-center shadow-sm">
            <p className={`text-base text-gray-600 ${poppins.className}`}>
              This quiz could not be found or is no longer available.
            </p>
            <button
              type="button"
              onClick={() => router.push("/Student/Quizzes")}
              className="mt-4 inline-flex items-center justify-center rounded-lg border border-purple-300 px-4 py-2 text-sm font-semibold text-purple-700"
            >
              Back to Quizzes
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
