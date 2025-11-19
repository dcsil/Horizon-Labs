"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Poppins } from "next/font/google";
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// API Configuration
const API_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(
  /\/$/,
  ""
);

const QUIZ_DEFINITIONS_ENDPOINT = `${API_BASE_URL}/quiz/definitions`;


export default function MyQuizPage() {
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
  }, []);

  const handleCreateQuiz = () => {
    router.push("/Instructor/QuizGenerator");
  };
  const handleOpenQuiz = (quiz) => {
    router.push("/Quiz/1");
  };
  return (
    <div className="min-h-screen bg-white px-8 py-8">
      <div className="max-w-6xl mx-auto">
        {/* Header Section */}
        <div className="mb-6">
          <h1
            className={`text-4xl font-bold text-purple-900 mb-2 ${poppins.className}`}
          >
            My Quizzes
          </h1>
          <p className={`text-base text-gray-600 ${poppins.className}`}>
            Quizzes are created by the given material.
          </p>
        </div>

        {/* Main Content Area */}
        <div className="border border-gray-300 rounded-lg bg-white p-12 min-h-[500px]">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className={`text-purple-900 text-lg ${poppins.className}`}>
                Loading quizzes...
              </div>
            </div>
          ) : quizzes.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center h-full">
              {/* Placeholder Text */}
              <p
                className={`text-lg text-gray-600 mb-6 ${poppins.className}`}
              >
                Quizzes you create and hand out by the instructor will appear here
              </p>

              {/* Illustration - Box with items jumping out */}
              <div className="mb-8 relative w-64 h-64">
                <svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 200 200"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  {/* Box */}
                  <rect
                    x="40"
                    y="80"
                    width="120"
                    height="100"
                    fill="#F3F4F6"
                    stroke="#9CA3AF"
                    strokeWidth="2"
                    rx="4"
                  />
                  <rect
                    x="40"
                    y="80"
                    width="120"
                    height="30"
                    fill="#E5E7EB"
                  />
                  {/* Box flap */}
                  <path
                    d="M40 80 L100 50 L160 80"
                    stroke="#9CA3AF"
                    strokeWidth="2"
                    fill="none"
                  />
                  {/* Items jumping out */}
                  <circle cx="90" cy="40" r="8" fill="#7B2CBF" opacity="0.8" />
                  <circle cx="110" cy="35" r="6" fill="#EC4899" opacity="0.8" />
                  <circle cx="85" cy="50" r="7" fill="#3B82F6" opacity="0.8" />
                  <circle cx="115" cy="45" r="5" fill="#F97316" opacity="0.8" />
                  <rect
                    x="95"
                    y="25"
                    width="10"
                    height="10"
                    rx="2"
                    fill="#10B981"
                    opacity="0.8"
                  />
                  <rect
                    x="105"
                    y="30"
                    width="8"
                    height="8"
                    rx="2"
                    fill="#EF4444"
                    opacity="0.8"
                  />
                </svg>
              </div>

              {/* Create Quiz Button */}
              <button
                onClick={handleCreateQuiz}
                className={`px-8 py-4 rounded-xl text-white font-semibold text-lg transition-all duration-300 hover:scale-105 shadow-lg ${poppins.className}`}
                style={{
                  background: "linear-gradient(to right, #7B2CBF, #3B82F6)",
                }}
              >
                + Create a Quiz
              </button>
            </div>
          ) : (
            /* Quizzes List */
            <div className="space-y-4">
              {quizzes.map((quiz) => (
                <button
                  key={quiz.quiz_id}
                  type="button"
                  onClick={() => handleOpenQuiz(quiz)}
                  className="w-full border border-gray-200 rounded-lg p-4 text-left hover:shadow-md transition-shadow focus:outline-none focus:ring-2 focus:ring-purple-400"
                >
                  <h3
                    className={`text-xl font-semibold text-purple-900 mb-2 ${poppins.className}`}
                  >
                    {quiz.title || "Untitled Quiz"}
                  </h3>
                  <p className={`text-sm text-gray-600 mb-2 ${poppins.className}`}>
                    {quiz.description || "No description"}
                  </p>
                  <div className="flex gap-4 text-sm text-gray-500">
                    <span>Questions: {quiz.totalQuestions || 0}</span>
                    <span>Mode: {quiz.mode || "N/A"}</span>
                    <span>Created: {quiz.createdAt ? new Date(quiz.createdAt).toLocaleDateString() : "N/A"}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

