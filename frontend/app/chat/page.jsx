"use client";
import { useEffect, useRef, useState } from "react";
import { flags } from "../../lib/flag.js";

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
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 text-2xl font-semibold">Hello Chat</h1>
      <Banner />
      <div ref={listRef} className="h-[420px] w-full overflow-y-auto rounded-lg border bg-white p-4">
        {messages.map(m => (
          <div key={m.id} className={`mb-3 flex ${m.role==="user"?"justify-end":"justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow ${
              m.role==="user"?"bg-black text-white":m.role==="assistant"?"bg-gray-100":"bg-blue-50"}`}>
              <div className="text-[11px] opacity-60 mb-1">{m.role.toUpperCase()}</div>
              <div className="whitespace-pre-wrap">{m.text}</div>
            </div>
          </div>
        ))}
        {isStreaming && <div className="animate-pulse text-xs text-gray-500">streaming…</div>}
      </div>
      {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      <div className="mt-4 flex items-center gap-2">
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSend()}
          placeholder="Type your message…" className="flex-1 rounded-lg border px-3 py-2" />
        <button onClick={handleSend} disabled={isStreaming} className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50">Send</button>
      </div>
    </div>
  );
}
