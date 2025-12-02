"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ConditionalHeader from "../../components/ConditionalHeader";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/** Parses JSON safely, returning null on failure. */
const safeParse = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn("Unable to parse stored quiz preview value", error);
    return null;
  }
};

const DEFAULT_RESULTS = {
  correctAnswers: 0,
  totalQuestions: 0,
  percentage: 0,
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(
  /\/$/,
  ""
);
const QUIZ_DEFINITION_ENDPOINT = `${API_BASE_URL}/quiz/definitions`;

/** Displays preview quiz results and lets instructors publish the quiz. */
export default function QuizScorePage() {
  const router = useRouter();
  const [results, setResults] = useState(DEFAULT_RESULTS);
  const [isLoading, setIsLoading] = useState(true);
  const [quizMeta, setQuizMeta] = useState(null);
  const [isPublished, setIsPublished] = useState(false);
  const [isPublishLoading, setIsPublishLoading] = useState(false);
  const [publishNotice, setPublishNotice] = useState(null);
  const publishNoticeTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (publishNoticeTimeoutRef.current) {
        clearTimeout(publishNoticeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const questions = safeParse(localStorage.getItem("quizPreviewQuestions")) || [];
    const responses = safeParse(localStorage.getItem("quizPreviewResponses")) || [];
    const total = questions.length;
    const correct = responses.filter((entry) => entry?.isCorrect).length;
    const percentage = total > 0 ? Math.round((correct / total) * 100) : 0;

    setResults({
      correctAnswers: correct,
      totalQuestions: total,
      percentage,
    });
    const previewMeta = safeParse(localStorage.getItem("quizPreviewData"));
    if (previewMeta) {
      setQuizMeta(previewMeta);
      setIsPublished(Boolean(previewMeta.isPublished));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const quizId = quizMeta?.quizId ?? quizMeta?.id ?? null;
    if (!quizId) return;
    if (typeof quizMeta?.isPublished === "boolean") return;

    let isMounted = true;
    const fetchPublishState = async () => {
      try {
        const response = await fetch(
          `${QUIZ_DEFINITION_ENDPOINT}/${encodeURIComponent(quizId)}`
        );
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          return;
        }
        if (!isMounted) return;
        const published = Boolean(body.is_published);
        setIsPublished(published);
        setQuizMeta((prev) => ({ ...(prev || {}), isPublished: published }));
      } catch (error) {
        console.warn("Unable to refresh publish state", error);
      }
    };

    fetchPublishState();
    return () => {
      isMounted = false;
    };
  }, [quizMeta]);

  /** Shows a temporary notice after publish/unpublish attempts. */
  const showPublishNotice = (type, message) => {
    setPublishNotice({ type, message });
    if (publishNoticeTimeoutRef.current) {
      clearTimeout(publishNoticeTimeoutRef.current);
    }
    publishNoticeTimeoutRef.current = setTimeout(() => {
      setPublishNotice(null);
    }, 4000);
  };

  /** Returns to the quiz builder for edits. */
  const handleEditQuiz = () => {
    router.push("/Instructor/QuizGenerator");
  };

  /** Toggles quiz publish status by resubmitting the definition. */
  const handlePublishQuiz = async () => {
    if (isPublishLoading) return;
    const quizId = quizMeta?.quizId ?? quizMeta?.id ?? null;
    if (!quizId) {
      showPublishNotice("error", "Save this quiz before publishing.");
      return;
    }

    setIsPublishLoading(true);
    try {
      const definitionResponse = await fetch(
        `${QUIZ_DEFINITION_ENDPOINT}/${encodeURIComponent(quizId)}`
      );
      const definitionBody = await definitionResponse.json().catch(() => ({}));
      if (!definitionResponse.ok) {
        const detail = definitionBody?.detail;
        if (definitionResponse.status === 404) {
          throw new Error("Save this quiz before publishing.");
        }
        throw new Error(detail || "Unable to load quiz definition.");
      }

      const nextPublishState = !isPublished;
      const payload = {
        quiz_id: definitionBody.quiz_id,
        name: definitionBody.name,
        topics: Array.isArray(definitionBody.topics) && definitionBody.topics.length
          ? definitionBody.topics
          : ["General"],
        default_mode: definitionBody.default_mode || "practice",
        initial_difficulty: definitionBody.initial_difficulty || "medium",
        assessment_num_questions: definitionBody.assessment_num_questions,
        assessment_time_limit_minutes: definitionBody.assessment_time_limit_minutes,
        assessment_max_attempts: definitionBody.assessment_max_attempts,
        embedding_document_id: definitionBody.embedding_document_id,
        source_filename: definitionBody.source_filename,
        is_published: nextPublishState,
        metadata: definitionBody.metadata ?? null,
      };

      const response = await fetch(QUIZ_DEFINITION_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const responseBody = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = responseBody?.detail;
        throw new Error(detail || "Unable to update publish status.");
      }

      const updatedPublishState = Boolean(responseBody.is_published);
      setIsPublished(updatedPublishState);
      setQuizMeta((prev) => ({ ...(prev || {}), isPublished: updatedPublishState }));
      showPublishNotice(
        "success",
        updatedPublishState ? "Quiz published. Learners can now access it." : "Quiz moved back to draft."
      );
      if (typeof window !== "undefined") {
        const storedMeta = safeParse(localStorage.getItem("quizPreviewData")) || {};
        localStorage.setItem(
          "quizPreviewData",
          JSON.stringify({ ...storedMeta, isPublished: updatedPublishState })
        );
      }
    } catch (error) {
      console.error("Unable to toggle publish state", error);
      showPublishNotice("error", error.message || "Unable to update publish status.");
    } finally {
      setIsPublishLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-pink-50 flex flex-col">
        <ConditionalHeader />
        <div className="flex-1 flex items-center justify-center">
          <div className={`text-purple-900 text-xl ${poppins.className}`}>
            Calculating results...
          </div>
        </div>
      </div>
    );
  }

  const { percentage, correctAnswers, totalQuestions } = results;
  const hasQuizId = Boolean(quizMeta?.quizId || quizMeta?.id);

  return (
    <div className="min-h-screen bg-pink-50 flex flex-col">
      <ConditionalHeader />

      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 w-full">
        <div className="mb-12">
          <div
            className="w-64 h-64 rounded-full flex flex-col items-center justify-center shadow-lg"
            style={{
              background: "linear-gradient(135deg, #EC4899, #F472B6)",
            }}
          >
            <div className="text-white text-center">
              <p className={`text-lg font-medium mb-2 ${poppins.className}`}>
                Your Score
              </p>
              <p className={`text-6xl font-bold mb-2 ${poppins.className}`}>
                {percentage}%
              </p>
              <p className={`text-base font-medium ${poppins.className}`}>
                {correctAnswers}/{totalQuestions} questions
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 w-full max-w-sm">
          <button
            onClick={handleEditQuiz}
            className={`px-8 py-4 rounded-xl text-white font-semibold text-lg transition-all duration-300 hover:scale-105 shadow-lg ${poppins.className}`}
            style={{
              background: "linear-gradient(to right, #7B2CBF, #3B82F6)",
            }}
          >
            Edit Quiz
          </button>

          <button
            onClick={handlePublishQuiz}
            disabled={isPublishLoading || !hasQuizId}
            className={`px-8 py-4 rounded-xl text-white font-semibold text-lg transition-all duration-300 hover:scale-105 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed ${poppins.className}`}
            style={{
              background: "linear-gradient(to right, #EC4899, #F97316)",
            }}
          >
            {isPublished ? "Unpublish Quiz" : "Publish Quiz"}
          </button>
          {!hasQuizId && (
            <p className={`text-sm text-gray-500 ${poppins.className}`}>
              Save this quiz first to enable publishing.
            </p>
          )}
          {publishNotice && (
            <p
              className={`text-sm ${
                publishNotice.type === "error" ? "text-red-600" : "text-green-600"
              } ${poppins.className}`}
            >
              {publishNotice.message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
