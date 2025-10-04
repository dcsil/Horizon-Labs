"use client";
import { useEffect, useRef, useState } from "react";
import { flags } from "../../lib/flag.js";

function Banner() {
  if (!flags.showInstructorBanner) return null;
  return <div className="mb-3 rounded-lg border p-3 text-sm">
    Instructor Mode Banner (feature flag controlled)
  </div>;
}

export default function ChatPage() {
  const [messages, setMessages] = useState([{ id: 1, role: "system", text: "Hello! This is the Hello Chat skeleton." }]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const listRef = useRef(null); const streamRef = useRef(null);

  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages, isStreaming]);

  const handleSend = () => {
    const t = input.trim(); if (!t || isStreaming) return;
    const userMsg = { id: Date.now(), role: "user", text: t };
    setMessages(m => [...m, userMsg]); setInput("");

    const full = "This is a placeholder streaming response… We’ll replace this with real SSE later.";
    const id = Date.now() + 1; let i = 0;
    setMessages(m => [...m, { id, role: "assistant", text: "" }]); setIsStreaming(true);
    streamRef.current = setInterval(() => {
      i++; setMessages(m => m.map(msg => msg.id===id ? { ...msg, text: full.slice(0, i) } : msg));
      if (i >= full.length) { clearInterval(streamRef.current); setIsStreaming(false); }
    }, 15);
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
      <div className="mt-4 flex items-center gap-2">
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSend()}
          placeholder="Type your message…" className="flex-1 rounded-lg border px-3 py-2" />
        <button onClick={handleSend} disabled={isStreaming} className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50">Send</button>
      </div>
    </div>
  );
}