"use client";
import { useEffect, useRef, useState } from "react";
import { flags } from "../../../lib/flag.js";
import { Poppins } from 'next/font/google'
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})
const API_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const STREAM_ENDPOINT = `${API_BASE_URL}/chat/stream`;

const createId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

function Banner() {
  if (!flags.showInstructorBanner) return null;
  return <div className="mb-3 rounded-lg border p-3 text-sm">
    Instructor Mode Banner (feature flag controlled)
  </div>;
}

export default function ChatPage() {
  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "system",
      text: "Welcome to Horizon Labs Chat. Ask a question to begin.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);
  const abortRef = useRef(null);
  const sessionRef = useRef(null);

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages, isStreaming]);

  useEffect(() => () => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  const ensureSessionId = () => {
    if (!sessionRef.current) {
      sessionRef.current = createId();
    }
    return sessionRef.current;
  };

  const updateMessage = (id, updater) => {
    setMessages(prev => prev.map(msg => {
      if (msg.id !== id) return msg;
      const patch = updater(msg) || {};
      return { ...msg, ...patch };
    }));
  };

  const handleSend = () => {
    const t = input.trim();
    if (!t || isStreaming) return;

    const sessionId = ensureSessionId();
    const userId = createId();
    const assistantId = createId();

    setError(null);
    setMessages(m => [
      ...m,
      { id: userId, role: "user", text: t },
      { id: assistantId, role: "assistant", text: "" },
    ]);
    setInput("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const processEvent = rawEvent => {
      if (!rawEvent) return;
      const lines = rawEvent.split("\n");
      let eventType = "message";
      let dataLine = "";

      lines.forEach(line => {
        if (line.startsWith("event:")) eventType = line.replace("event:", "").trim();
        if (line.startsWith("data:")) dataLine = line.replace("data:", "").trim();
      });

      if (!dataLine) return;

      try {
        const payload = JSON.parse(dataLine);
        if (eventType === "error") {
          updateMessage(assistantId, () => ({ text: `⚠️ ${payload.message}` }));
          setError(payload.message || "An error occurred");
          controller.abort();
          return;
        }
        if (eventType === "end") {
          return;
        }
        if (payload.type === "token") {
          updateMessage(assistantId, msg => ({ text: (msg.text || "") + payload.data }));
        }
      } catch (err) {
        updateMessage(assistantId, () => ({ text: "⚠️ Failed to parse response from server." }));
        setError("Failed to parse response from server.");
        controller.abort();
      }
    };

    const readStream = async response => {
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        events.forEach(evt => processEvent(evt.trim())) ;
      }

      if (buffer.trim()) {
        processEvent(buffer.trim());
      }
    };

    (async () => {
      try {
        const response = await fetch(STREAM_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            message: t,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        await readStream(response);
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        updateMessage(assistantId, () => ({ text: `⚠️ ${message}` }));
        setError(message);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    })();
  };

  return (
    <div className="bg-white flex flex-col mt-50">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {/* Chat Icon */}
        <img src="/chat.png" alt="" />
        {/* Title */}
        <h1 className={`text-[48.52px] font-bold font-[700] tracking-[0.03em] ${poppins.className}`}>New Chat Session</h1>
        {/* Messages Area - Hidden when no messages */}
        {messages.length > 1 && (
          <div ref={listRef} className="w-full max-w-4xl mb-8 max-h-96 overflow-y-auto">
            {messages.slice(1).map(m => (
              <div key={m.id} className={`mb-4 flex ${m.role==="user"?"justify-end":"justify-start"}`}>
                <div className={`max-w-[70%] rounded-2xl px-4 py-3 ${
                  m.role==="user"?"bg-purple-600 text-white":"bg-gray-100 text-gray-800"}`}>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              </div>
            ))}
            {isStreaming && (
              <div className="flex justify-start mb-4">
                <div className="bg-gray-100 rounded-2xl px-4 py-3">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{animationDelay: '0.2s'}}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" style={{animationDelay: '0.4s'}}></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input Section */}
      <div className="p-6">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          {/* Plus Button */}
          <button className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300 transition-colors">
            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </button>

          {/* Thinking Button */}
          {isStreaming && (
            <button className="px-4 py-2 rounded-full bg-purple-100 text-purple-600 text-sm font-medium">
              Thinking
            </button>
          )}

          {/* Input Field */}
          <div className="flex-1 relative">
            <input 
              value={input} 
              onChange={e=>setInput(e.target.value)} 
              onKeyDown={e=>e.key==="Enter"&&handleSend()}
              placeholder="What do you need help with today?"
              className="w-full px-4 py-3 rounded-2xl bg-purple-50 border-0 focus:outline-none focus:ring-2 focus:ring-purple-500 text-gray-800 placeholder-purple-400"
            />
          </div>

          {/* Send Button */}
          <button 
            onClick={handleSend} 
            disabled={isStreaming || !input.trim()}
            className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center hover:from-purple-600 hover:to-pink-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="max-w-4xl mx-auto mt-3 text-sm text-red-600 text-center">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}