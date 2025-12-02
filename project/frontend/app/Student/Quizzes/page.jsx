"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const heroTitleClasses = `text-4xl font-bold text-gray-900 ${poppins.className}`;
const heroSubtitleClasses = `text-base text-gray-600 mt-2 ${poppins.className}`;

const API_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const QUIZ_DEFINITIONS_ENDPOINT = `${API_BASE_URL}/quiz/definitions`;

/** Reusable section for rendering quiz cards with empty state handling. */
const Section = ({ title, description, quizzes, emptyMessage, onSelect }) => (
  <section className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
    <div className="mb-4">
      <h2 className={`text-2xl font-semibold text-gray-900 ${poppins.className}`}>{title}</h2>
      <p className={`text-sm text-gray-500 ${poppins.className}`}>{description}</p>
    </div>
    {quizzes.length === 0 ? (
      <div className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-gray-500">
        {emptyMessage}
      </div>
    ) : (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quizzes.map((quiz) => (
          <button
            key={quiz.quiz_id}
            type="button"
            onClick={() => onSelect?.(quiz.quiz_id)}
            className="text-left border border-gray-200 rounded-xl p-5 bg-gradient-to-br from-gray-50 to-white hover:shadow-md transition-shadow duration-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <h3 className={`text-xl font-semibold text-purple-900 mb-2 ${poppins.className}`}>
              {quiz.name || "Untitled Quiz"}
            </h3>
            <p className={`text-sm text-gray-600 mb-3 ${poppins.className}`}>
              {(() => {
                const metadata = quiz.metadata || {};
                const description =
                  typeof metadata.description === "string" ? metadata.description.trim() : "";
                const fallbackDescription =
                  quiz.default_mode === "assessment"
                    ? "Quiz generated from your course material."
                    : "Practice quiz generated from your course material.";
                return (description || fallbackDescription).slice(0, 120);
              })()}
            </p>
            <div className="flex flex-wrap gap-3 text-xs text-gray-500">
              {quiz.source_filename ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1 font-semibold text-blue-700">
                  Source: {quiz.source_filename}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-3 py-1 font-semibold text-purple-700">
                {quiz.topics?.length ? `${quiz.topics.length} topic${quiz.topics.length > 1 ? "s" : ""}` : "General"}
              </span>
              {quiz.default_mode === "assessment" && quiz.assessment_num_questions ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-700">
                  {quiz.assessment_num_questions} questions
                </span>
              ) : null}
              {quiz.default_mode === "assessment" && quiz.assessment_time_limit_minutes ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700">
                  {quiz.assessment_time_limit_minutes} min limit
                </span>
              ) : null}
            </div>
          </button>
        ))}
      </div>
    )}
  </section>
);

/**
 * Lists available assessment and practice quizzes published for students.
 */
export default function StudentQuizzesPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [assessments, setAssessments] = useState([]);
  const [practice, setPractice] = useState([]);

  useEffect(() => {
    let isMounted = true;

    /** Fetches published quiz definitions and separates them by mode. */
    const fetchQuizzes = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(QUIZ_DEFINITIONS_ENDPOINT);
        const payload = await response.json().catch(() => []);
        if (!response.ok) {
          throw new Error(payload.detail || "Unable to load quizzes.");
        }
        if (!isMounted) return;
        const published = (Array.isArray(payload) ? payload : []).filter((quiz) => quiz?.is_published);
        setAssessments(
          published.filter((quiz) => (quiz.default_mode || "practice") === "assessment"),
        );
        setPractice(
          published.filter((quiz) => (quiz.default_mode || "practice") === "practice"),
        );
      } catch (err) {
        if (!isMounted) return;
        setError(err.message || "Unable to load quizzes.");
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchQuizzes();
    return () => {
      isMounted = false;
    };
  }, []);

  /** Routes to a selected quiz's detail page. */
  const handleSelectQuiz = (quizId) => {
    if (!quizId) return;
    router.push(`/Student/Quizzes/${encodeURIComponent(quizId)}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
    <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push("/Student/HomePage")}
            className={`inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-purple-400 ${poppins.className}`}
          >
            ← Back to Home
          </button>
        </div>
        <div>
          <h1 className={heroTitleClasses}>Your Quizzes</h1>
          <p className={heroSubtitleClasses}>
            Choose from instructor-published assessments or practice sessions tailored to your course.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="rounded-2xl border border-purple-200 bg-white px-6 py-12 text-center shadow-sm">
            <p className={`text-lg text-purple-900 ${poppins.className}`}>Loading available quizzes...</p>
          </div>
        ) : (
          <div className="space-y-8">
            <Section
              title="Assessment Quizzes"
              description="Timed assessments curated by your instructor."
              quizzes={assessments}
              emptyMessage="Assessment mode is coming soon."
              onSelect={handleSelectQuiz}
            />
            <Section
              title="Practice Quizzes"
              description="Unlimited adaptive practice sessions to reinforce your learning."
              quizzes={practice}
              emptyMessage="No practice quizzes are published yet."
              onSelect={handleSelectQuiz}
            />
          </div>
        )}
      </div>
    </div>
  );
}
