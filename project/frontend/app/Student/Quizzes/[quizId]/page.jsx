"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const API_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const QUIZ_DEFINITION_ENDPOINT = `${API_BASE_URL}/quiz/definitions`;

const InfoRow = ({ label, value }) => (
  <div className="flex flex-col gap-1 rounded-2xl border border-gray-200 bg-white px-4 py-3">
    <span className="text-xs uppercase tracking-wide text-gray-500">{label}</span>
    <span className="text-sm text-gray-900">{value || "—"}</span>
  </div>
);

export default function StudentQuizDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const quizId = Array.isArray(params?.quizId) ? params.quizId[0] : params?.quizId;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [quiz, setQuiz] = useState(null);

  useEffect(() => {
    if (!quizId) return;
    let isMounted = true;
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

  const topics = useMemo(() => quiz?.topics || [], [quiz]);
  const metadata = quiz?.metadata || {};

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
                {metadata.description || "Your instructor will share more details before the quiz is enabled."}
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
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-purple-500 to-blue-500 px-5 py-3 text-lg font-semibold text-white shadow-lg transition-transform duration-200 hover:scale-[1.01]"
                >
                  Start New Attempt
                </button>
              </div>
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm">
              <div className="mb-4">
                <h2 className={`text-2xl font-semibold text-gray-900 ${poppins.className}`}>
                  Previous Attempts
                </h2>
                <p className={`text-sm text-gray-500 ${poppins.className}`}>
                  Review your latest sessions once you begin taking this quiz.
                </p>
              </div>
              <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center text-gray-500">
                No attempts recorded yet. Your history will appear here once you start practicing.
              </div>
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
