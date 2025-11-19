"use client";

import { Poppins } from "next/font/google";
import { useRouter } from "next/navigation";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export default function InstructorPage() {
  const router = useRouter();

  const currentDate = new Date();
  const formattedDate = currentDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const handleQuizGenerator = () => {
    router.push("/Instructor/Quizzes");
  };

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      <div className="flex h-full min-h-screen flex-col xl:flex-row">
        {/* left border line */}
        <div className="hidden xl:block w-80 bg-white border-r border-[#9690B7] relative z-10" />

        {/* Main Content Area */}
        <div className="flex-1 bg-white relative z-10">
          <div className="min-h-[calc(100vh-4rem)] flex flex-col px-6 py-10 sm:px-10 lg:px-16">
            <div className="flex flex-col max-w-3xl pt-10 sm:pt-12 lg:pt-16">
              <div className="mb-8 sm:mb-10">
                <h1
                  className={`text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-3 ${poppins.className}`}
                >
                  Welcome Instructor
                </h1>
                <p
                  className={`text-base sm:text-lg text-gray-500 ${poppins.className}`}
                  style={{ marginLeft: 5, paddingLeft: 0 }}
                >
                  {formattedDate}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                <button
                  onClick={handleQuizGenerator}
                  className="group relative flex flex-col items-start gap-4 p-8 rounded-2xl bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-200 hover:border-purple-400 hover:shadow-xl transition-all duration-300 hover:scale-105"
                >
                  <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-r from-purple-500 to-purple-700 text-white shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <img src="/Qbubble.png" alt="Quiz Generator" className="w-8 h-8" />
                  </div>
                  <div className="flex-1">
                    <h2
                      className={`text-2xl font-bold text-purple-900 mb-2 ${poppins.className}`}
                    >
                      Quiz Generator
                    </h2>
                    <p
                      className={`text-base text-gray-600 ${poppins.className}`}
                    >
                      Build adaptive assessments and publish practice sets for your cohort.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-purple-600 font-semibold">
                    <span className={poppins.className}>Start Creating</span>
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
              </div>
            </div>
          </div>
        </div>

        {/* Decorative Right Panel */}
        <div className="hidden lg:block lg:w-40 xl:w-72 2xl:w-80 bg-purple-100 border-l border-gray-300 relative z-20" />
      </div>

      {/* Gradients */}
      <img src="/gradient1.png" alt="Gradient decoration" className="fixed bottom-0 left-0 w-40 sm:w-56 lg:w-72 z-20" />
    </div>
  );
}
