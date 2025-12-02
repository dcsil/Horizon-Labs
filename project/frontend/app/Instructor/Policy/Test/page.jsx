"use client";

import { Poppins } from "next/font/google";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/**
 * Lightweight mock chat page to demonstrate how policy choices affect responses.
 */
export default function PolicyTestPage() {
  const router = useRouter();
  const [messages, setMessages] = useState([
    { from: "assistant", text: "This is a static preview of adaptive chat under your policy settings." },
    { from: "assistant", text: "Try a message and I'll respond with whether I would use or skip certain files." },
  ]);
  const [draft, setDraft] = useState("");
  const [responseIndex, setResponseIndex] = useState(0);

  /** Predefined assistant replies that rotate to mimic policy-driven responses. */
  const cannedResponses = useMemo(
    () => [
      "Using this file: focus_1.pdf",
      "Not using this file: deny_1.pdf",
      "Using this file: focus_2.pdf",
      "Not using this file: deny_2.pdf",
    ],
    []
  );

  /** Appends the user's message and the next canned assistant response. */
  const handleSend = () => {
    const text = draft.trim();
    if (!text) return;
    const nextResp = cannedResponses[responseIndex % cannedResponses.length];
    setResponseIndex((prev) => prev + 1);
    setMessages((prev) => [
      ...prev,
      { from: "user", text },
      { from: "assistant", text: nextResp },
    ]);
    setDraft("");
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
              <div className="mb-8 sm:mb-10">
                <button
                  onClick={() => router.back()}
                  className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                  <span className={poppins.className}>Back to Policy</span>
                </button>
                <h1
                  className={`text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-3 ${poppins.className}`}
                >
                  Test Prompt
                </h1>
                <p
                  className={`text-base sm:text-lg text-gray-500 ${poppins.className}`}
                  style={{ marginLeft: 5, paddingLeft: 0 }}
                >
                  Simple mock chat to see how the application might respond with allowed/blocked files.
                </p>
              </div>

              <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 sm:p-8 space-y-4">
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-2">
                  {messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`rounded-2xl px-4 py-3 max-w-xl text-sm ${
                          msg.from === "user"
                            ? "bg-purple-100 text-gray-900"
                            : "bg-gray-100 text-gray-800"
                        } ${poppins.className}`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="Type a test message..."
                    className="flex-1 rounded-xl border-2 border-gray-300 bg-white px-4 py-3 text-base text-gray-900 focus:outline-none focus:border-purple-500"
                  />
                  <button
                    onClick={handleSend}
                    className="px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-purple-700 text-white font-semibold hover:shadow-lg transition-transform duration-150 hover:scale-105"
                  >
                    Send
                  </button>
                </div>
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
