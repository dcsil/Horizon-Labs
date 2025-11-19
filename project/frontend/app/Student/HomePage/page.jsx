"use client";

import { useRouter } from "next/navigation";
import { Poppins } from "next/font/google";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function StudentHomePage() {
  const router = useRouter();
  const currentDate = new Date();
  const formattedDate = currentDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const handleChat = () => {
    router.push("/Student/chat");
  };

  const handleQuiz = () => {
    router.push("/Student/Quizzes");
  };

  const handleFlashcards = () => {
    router.push("/Student/Flashcards");
  };
  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <div className="flex h-full min-h-screen flex-col xl:flex-row">
        {/* left border line */}
        <div className="hidden xl:block w-80 bg-white border-r border-[#9690B7] relative z-10" />

        {/* Main Content Area */}
        <div className="flex-1 bg-white relative z-10">
          <div className="min-h-[calc(100vh-4rem)] flex flex-col px-6 py-10 sm:px-10 lg:px-16">
            <div className="flex flex-col max-w-4xl pt-10 sm:pt-12 lg:pt-16">
              <div className="mb-8 sm:mb-10 space-y-2">
                <h1
                  className={`text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 ${poppins.className}`}
                >
                  Welcome Student
                </h1>
                <p className={`text-base sm:text-lg text-gray-500 ${poppins.className}`}>{formattedDate}</p>
              </div>

              {/* Options Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                {/* Chat Option */}
                <button
                  onClick={handleChat}
                  className="group relative flex flex-col items-start gap-4 p-8 rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200 hover:border-purple-400 hover:shadow-xl transition-all duration-300 hover:scale-105"
                >
                  <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-purple-500 text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <img src="/chat.png" alt="Chat" className="w-8 h-8" />
                  </div>
                  <div className="flex-1">
                    <h2
                      className={`text-2xl font-bold text-purple-900 mb-2 ${poppins.className}`}
                    >
                      Chat with AI Assistant
                    </h2>
                    <p
                      className={`text-base text-gray-600 ${poppins.className}`}
                    >
                      Get help with your questions and learn with our adaptive AI coach
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-purple-600 font-semibold">
                    <span className={poppins.className}>Start Chatting</span>
                    <svg
                      className="w-5 h-5 group-hover:translate-x-1 transition-transform"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </button>

                {/* Quiz Option */}
                <button
                  type="button"
                  onClick={handleQuiz}
                  className="group relative flex flex-col items-start gap-4 p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 hover:border-blue-400 hover:shadow-xl transition-all duration-300 hover:scale-105"
                >
                  <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <img src="/Qbubble.png" alt="Quiz" className="w-8 h-8" />
                  </div>
                  <div className="flex-1">
                    <h2 className={`text-2xl font-bold text-blue-900 mb-2 ${poppins.className}`}>
                      Assessment & Practice Quizzes
                    </h2>
                    <p className={`text-base text-gray-600 ${poppins.className}`}>
                      Run timed assessments or adaptive practice sessions built from your course content.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-blue-600 font-semibold">
                    <span className={poppins.className}>View Quizzes</span>
                    <svg
                      className="w-5 h-5 group-hover:translate-x-1 transition-transform"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </button>

                {/* Flashcards Option */}
                <button
                  type="button"
                  onClick={handleFlashcards}
                  className="group relative flex flex-col items-start gap-4 p-8 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-200 hover:border-emerald-400 hover:shadow-xl transition-all duration-300 hover:scale-105"
                >
                  <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <svg
                      className="w-8 h-8"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="3" width="7" height="7" rx="1.5" />
                      <rect x="14" y="3" width="7" height="7" rx="1.5" />
                      <rect x="14" y="14" width="7" height="7" rx="1.5" />
                      <rect x="3" y="14" width="7" height="7" rx="1.5" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h2 className={`text-2xl font-bold text-emerald-900 mb-2 ${poppins.className}`}>
                      Flashcards Lab (Preview)
                    </h2>
                    <p className={`text-base text-gray-600 ${poppins.className}`}>
                      Generate decks from course files and rehearse with active recall.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-emerald-600 font-semibold">
                    <span className={poppins.className}>Open Flashcards</span>
                    <svg
                      className="w-5 h-5 group-hover:translate-x-1 transition-transform"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Decorative Right Panel */}
        <div className="hidden lg:block lg:w-40 xl:w-72 2xl:w-80 bg-purple-100 border-l border-gray-300 relative z-20" />
      </div>

      {/* Gradients */}
      <img
        src="/gradient1.png"
        alt="Gradient decoration"
        className="fixed bottom-0 left-0 w-40 sm:w-56 lg:w-72 z-20"
      />
    </div>
  );
}
