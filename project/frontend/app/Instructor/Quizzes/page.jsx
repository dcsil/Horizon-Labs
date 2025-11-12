"use client";

import { useState, useEffect } from "react";
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
const QUIZ_DEFINITIONS_ENDPOINT = `${API_BASE_URL}/quiz/definitions`;

export default function InstructorQuizzesPage() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const fetchQuizzes = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(QUIZ_DEFINITIONS_ENDPOINT);
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.detail || "Unable to load quizzes.");
        }
        const data = await response.json();
        if (!isMounted) return;
        setQuizzes(Array.isArray(data) ? data : []);
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

  const hasQuizzes = quizzes.length > 0;

  const handleCreateQuiz = () => {
    router.push("/Instructor/QuizGenerator");
  };

  const buildDraftFromDefinition = (quiz) => {
    const base = {
      id: quiz.quiz_id,
      title: quiz.name ?? "",
      description: quiz.metadata?.description ?? "",
      sourceFilename: quiz.source_filename ?? "",
      documentId: quiz.embedding_document_id ?? null,
    };

    if (quiz.default_mode === "assessment") {
      const numberOfAttemptsMetadata = quiz.metadata?.numberOfAttempts;
      const numberOfQuestionsMetadata = quiz.metadata?.numberOfQuestions;
      const timeLimitLabel = quiz.metadata?.timeLimitLabel;
      const difficultyLabel = quiz.metadata?.difficultyLabel;
      const topicsToTestMetadata = Array.isArray(quiz.metadata?.topicsToTest)
        ? quiz.metadata.topicsToTest
        : null;

      return {
        mode: "assessment",
        id: base.id,
        sourceFilename: base.sourceFilename,
        documentId: base.documentId,
        isPublished: Boolean(quiz.is_published),
        configuration: {
          title: base.title,
          description: base.description,
          numberOfAttempts:
            (typeof numberOfAttemptsMetadata === "string" && numberOfAttemptsMetadata) ||
            (quiz.assessment_max_attempts != null ? String(quiz.assessment_max_attempts) : ""),
          numberOfQuestions:
            (typeof numberOfQuestionsMetadata === "string" && numberOfQuestionsMetadata) ||
            (quiz.assessment_num_questions != null ? String(quiz.assessment_num_questions) : ""),
          timeLimit:
            (typeof timeLimitLabel === "string" && timeLimitLabel) ||
            (quiz.assessment_time_limit_minutes != null
              ? String(quiz.assessment_time_limit_minutes)
              : ""),
          difficulty:
            (typeof difficultyLabel === "string" && difficultyLabel) ||
            quiz.initial_difficulty ||
            "medium",
          topicsToTest:
            (topicsToTestMetadata && topicsToTestMetadata.length ? topicsToTestMetadata : quiz.topics) ||
            ["General"],
        },
      };
    }

    const practiceTopicsMetadata = Array.isArray(quiz.metadata?.practiceTopics)
      ? quiz.metadata.practiceTopics
      : null;

    return {
      mode: "practice",
      id: base.id,
      title: base.title,
      description: base.description,
      topics:
        (practiceTopicsMetadata && practiceTopicsMetadata.length ? practiceTopicsMetadata : quiz.topics) ||
        ["General"],
      sourceFilename: base.sourceFilename,
      documentId: base.documentId,
      isPublished: Boolean(quiz.is_published),
    };
  };

  const handleOpenQuiz = (quiz) => {
    try {
      if (typeof window !== "undefined") {
        const draft = buildDraftFromDefinition(quiz);
        localStorage.setItem("quizConfigDraft", JSON.stringify(draft));
        const destination = draft.mode === "assessment" ? "/Instructor/Assessment" : "/Instructor/Practice";
        router.push(destination);
        return;
      }
    } catch (error) {
      console.error("Unable to cache quiz draft", error);
    }
  };

  return (
    <div className="min-h-screen bg-white px-8 py-8">
      <div className="max-w-6xl mx-auto space-y-4">
        <button
          type="button"
          onClick={() => router.push("/Instructor")}
          className={`inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-purple-400 ${poppins.className}`}
        >
          ← Back to Home
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className={`text-4xl font-bold text-purple-900 mb-2 ${poppins.className}`}>
              My Quizzes
            </h1>
            <p className={`text-base text-gray-600 ${poppins.className}`}>
              Quizzes will simulate real tests/exams with time limits.
            </p>
          </div>
          <button
            onClick={handleCreateQuiz}
            className={`px-6 py-3 rounded-xl text-white font-semibold text-lg transition-all duration-300 hover:scale-105 shadow-lg ${poppins.className}`}
            style={{ background: "linear-gradient(to right, #7B2CBF, #3B82F6)" }}
          >
            + Create a Quiz
          </button>
        </div>

        <div className="border border-gray-300 rounded-lg bg-white p-12 min-h-[500px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <p className={`text-base text-gray-600 ${poppins.className}`}>Loading quizzes...</p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <p className={`text-base text-red-500 ${poppins.className}`}>{error}</p>
            </div>
          ) : hasQuizzes ? (
            <div className="space-y-4">
              {quizzes.map((quiz) => (
                <button
                  key={quiz.quiz_id}
                  type="button"
                  onClick={() => handleOpenQuiz(quiz)}
                  className="w-full border border-gray-200 rounded-lg p-4 text-left hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-purple-400"
                >
                  <h3 className={`text-xl font-semibold text-purple-900 mb-2 ${poppins.className}`}>
                    {quiz.name ?? "Untitled quiz"}
                  </h3>
                  <p className={`text-sm text-gray-600 mb-2 ${poppins.className}`}>
                    {quiz.metadata?.description ?? "No description provided."}
                  </p>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                    <span>Mode: {quiz.default_mode}</span>
                    <span>Topics: {quiz.topics?.join(", ") || "General"}</span>
                    <span>
                      Updated:{" "}
                      {quiz.updated_at
                        ? new Date(quiz.updated_at).toLocaleDateString()
                        : new Date(quiz.created_at).toLocaleDateString()}
                    </span>
                    <span>Status: {quiz.is_published ? "Published" : "Draft"}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <p className={`text-lg text-gray-600 mb-6 ${poppins.className}`}>
                Quizzes you create will appear here
              </p>
              <div className="mb-8 relative w-64 h-64">
                <svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 200 200"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect x="40" y="80" width="120" height="100" fill="#F3F4F6" stroke="#9CA3AF" strokeWidth="2" rx="4" />
                  <rect x="40" y="80" width="120" height="30" fill="#E5E7EB" />
                  <path d="M40 80 L100 50 L160 80" stroke="#9CA3AF" strokeWidth="2" fill="none" />
                  <circle cx="90" cy="40" r="8" fill="#7B2CBF" opacity="0.8" />
                  <circle cx="110" cy="35" r="6" fill="#EC4899" opacity="0.8" />
                  <circle cx="85" cy="50" r="7" fill="#3B82F6" opacity="0.8" />
                  <circle cx="115" cy="45" r="5" fill="#F97316" opacity="0.8" />
                  <rect x="95" y="25" width="10" height="10" rx="2" fill="#10B981" opacity="0.8" />
                  <rect x="105" y="30" width="8" height="8" rx="2" fill="#EF4444" opacity="0.8" />
                </svg>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
