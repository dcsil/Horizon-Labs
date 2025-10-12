"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flags } from "../../lib/flag.js";

const API_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const STREAM_ENDPOINT = `${API_BASE_URL}/chat/stream`;
const HISTORY_ENDPOINT = `${API_BASE_URL}/chat/history`;

const SESSION_LIST_STORAGE_KEY = "horizon-chat-sessions";
const LAST_SESSION_STORAGE_KEY = "horizon-chat-last-session";

const createId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

const createWelcomeMessage = () => ({
  id: "welcome",
  role: "system",
  text: "Welcome to Horizon Labs Chat. Ask a question to begin.",
});

function Banner() {
  if (!flags.showInstructorBanner) return null;
  return (
    <div className="mb-3 rounded-lg border p-3 text-sm">
      Instructor Mode Banner (feature flag controlled)
    </div>
  );
}

const defaultSessionName = (count) => `Chat ${count}`;

export default function ChatPage() {
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([createWelcomeMessage()]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [error, setError] = useState(null);

  const listRef = useRef(null);
  const abortRef = useRef(null);
  const sessionRef = useRef(null);

  const persistSessions = useCallback((updater) => {
    setSessions((prev) => {
      const next =
        typeof updater === "function"
          ? updater(prev)
          : Array.isArray(updater)
          ? updater
          : prev;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(SESSION_LIST_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const ensureSessionTracked = useCallback(() => {
    if (sessionRef.current) return sessionRef.current;
    const fallback = sessions[0];
    if (fallback) {
      sessionRef.current = fallback.id;
      return fallback.id;
    }
    const id = createId();
    const now = new Date().toISOString();
    persistSessions([{ id, name: defaultSessionName(1), createdAt: now, updatedAt: now }]);
    sessionRef.current = id;
    setActiveSessionId(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_SESSION_STORAGE_KEY, id);
    }
    return id;
  }, [persistSessions, sessions]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let parsed = [];
    try {
      const raw = window.localStorage.getItem(SESSION_LIST_STORAGE_KEY);
      if (raw) {
        const candidate = JSON.parse(raw);
        if (Array.isArray(candidate)) {
          parsed = candidate.filter((item) => item && typeof item.id === "string");
        }
      }
    } catch {
      parsed = [];
    }

    if (!parsed.length) {
      const id = createId();
      const now = new Date().toISOString();
      parsed = [{ id, name: defaultSessionName(1), createdAt: now, updatedAt: now }];
    }

    persistSessions(parsed.map((session, index) => ({
      name: session.name || defaultSessionName(index + 1),
      createdAt: session.createdAt || new Date().toISOString(),
      updatedAt: session.updatedAt || session.createdAt || new Date().toISOString(),
      id: session.id,
    })));

    const last = window.localStorage.getItem(LAST_SESSION_STORAGE_KEY);
    const initial = parsed.find((session) => session.id === last)?.id ?? parsed[0].id;
    sessionRef.current = initial;
    setActiveSessionId(initial);
    window.localStorage.setItem(LAST_SESSION_STORAGE_KEY, initial);
  }, [persistSessions]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  const fetchHistory = useCallback(async (sessionId) => {
    const url = `${HISTORY_ENDPOINT}?session_id=${encodeURIComponent(sessionId)}`;
    const response = await fetch(url);
    if (response.status === 404) {
      return { messages: [], latestTimestamp: new Date().toISOString() };
    }
    if (!response.ok) {
      throw new Error(`Failed to load history (status ${response.status})`);
    }
    const payload = await response.json();
    const restored = (payload.messages || []).map((msg, index) => ({
      id: `${msg.role}-${index}-${createId()}`,
      role: msg.role,
      text: msg.content ?? "",
      createdAt: msg.created_at ?? null,
    }));
    const latest =
      restored.length && restored[restored.length - 1].createdAt
        ? restored[restored.length - 1].createdAt
        : new Date().toISOString();
    return { messages: restored, latestTimestamp: latest };
  }, []);

  useEffect(() => {
    if (!activeSessionId) return;
    sessionRef.current = activeSessionId;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_SESSION_STORAGE_KEY, activeSessionId);
    }
    let cancelled = false;
    setIsLoadingHistory(true);
    setError(null);

    fetchHistory(activeSessionId)
      .then(({ messages: restored, latestTimestamp }) => {
        if (cancelled) return;
        setMessages(
          restored.length ? [createWelcomeMessage(), ...restored] : [createWelcomeMessage()]
        );
        persistSessions((prev) =>
          prev.map((session, index) =>
            session.id === activeSessionId
              ? {
                  ...session,
                  name: session.name || defaultSessionName(index + 1),
                  updatedAt: latestTimestamp,
                }
              : session
          )
        );
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Unable to load previous messages.";
        setError(message);
        setMessages([createWelcomeMessage()]);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingHistory(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSessionId, fetchHistory, persistSessions]);

  const handleCreateSession = () => {
    const now = new Date().toISOString();
    const id = createId();
    persistSessions((prev) => [
      ...prev,
      {
        id,
        name: defaultSessionName(prev.length + 1),
        createdAt: now,
        updatedAt: now,
      },
    ]);

    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    sessionRef.current = id;
    setActiveSessionId(id);
    setMessages([createWelcomeMessage()]);
    setError(null);
    setIsStreaming(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAST_SESSION_STORAGE_KEY, id);
    }
  };

  const handleSelectSession = (id) => {
    if (id === activeSessionId || isStreaming) return;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    sessionRef.current = id;
    setMessages([createWelcomeMessage()]);
    setError(null);
    setActiveSessionId(id);
  };

  const handleRenameSession = (id) => {
    if (typeof window === "undefined") return;
    const session = sessions.find((item) => item.id === id);
    if (!session) return;
    const next = window.prompt("Rename chat", session.name ?? "");
    if (!next) return;
    persistSessions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name: next } : item))
    );
  };

  const ensureSessionId = () => {
    const existing = sessionRef.current || activeSessionId;
    if (existing) {
      sessionRef.current = existing;
      return existing;
    }
    return ensureSessionTracked();
  };

  const updateMessage = (id, updater) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== id) return msg;
        const patch = updater(msg) || {};
        return { ...msg, ...patch };
      })
    );
  };

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || isLoadingHistory) return;

    const currentSession = ensureSessionId();
    if (!currentSession) return;

    const userId = createId();
    const assistantId = createId();
    const now = new Date().toISOString();
    let encounteredError = false;

    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text: trimmed, createdAt: now },
      { id: assistantId, role: "assistant", text: "", createdAt: now },
    ]);
    setInput("");
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const processEvent = (rawEvent) => {
      if (!rawEvent) return;
      const lines = rawEvent.split("\n");
      let eventType = "message";
      let dataLine = "";

      lines.forEach((line) => {
        if (line.startsWith("event:")) eventType = line.replace("event:", "").trim();
        if (line.startsWith("data:")) dataLine = line.replace("data:", "").trim();
      });

      if (!dataLine) return;

      try {
        const payload = JSON.parse(dataLine);
        if (eventType === "error") {
          encounteredError = true;
          updateMessage(assistantId, () => ({ text: `⚠️ ${payload.message}` }));
          setError(payload.message || "An error occurred");
          controller.abort();
          return;
        }
        if (eventType === "end") {
          return;
        }
        if (payload.type === "token") {
          updateMessage(assistantId, (msg) => ({ text: (msg.text || "") + payload.data }));
        }
      } catch (err) {
        encounteredError = true;
        updateMessage(assistantId, () => ({ text: "⚠️ Failed to parse response from server." }));
        setError("Failed to parse response from server.");
        controller.abort();
      }
    };

    const readStream = async (response) => {
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        events.forEach((evt) => processEvent(evt.trim()));
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
            session_id: currentSession,
            message: trimmed,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        await readStream(response);
        if (!encounteredError) {
          const history = await fetchHistory(currentSession);
          setMessages(
            history.messages.length
              ? [createWelcomeMessage(), ...history.messages]
              : [createWelcomeMessage()]
          );
          persistSessions((prev) =>
            prev.map((session, index) =>
              session.id === currentSession
                ? {
                    ...session,
                    name: session.name || defaultSessionName(index + 1),
                    updatedAt: history.latestTimestamp,
                  }
                : session
            )
          );
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          const message = err instanceof Error ? err.message : "Unknown error";
          updateMessage(assistantId, () => ({ text: `⚠️ ${message}` }));
          setError(message);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    })();
  };

  const sessionSummaries = useMemo(() => {
    return sessions.map((session, index) => {
      const label = session.name || defaultSessionName(index + 1);
      const timestamp = session.updatedAt || session.createdAt;
      const formatted =
        timestamp && typeof window !== "undefined"
          ? new Date(timestamp).toLocaleString()
          : "";
      return { ...session, label, formatted };
    });
  }, [sessions]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 md:flex-row">
      <aside className="w-full rounded-lg border bg-white p-4 shadow md:w-64">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Chats</h2>
          <button
            type="button"
            onClick={handleCreateSession}
            className="rounded-md border border-black px-2 py-1 text-sm hover:bg-black hover:text-white"
          >
            New Chat
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Select a chat to resume or start a new conversation.
        </p>
        <ul className="mt-4 space-y-2">
          {sessionSummaries.map((session) => {
            const isActive = session.id === activeSessionId;
            return (
              <li key={session.id}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSelectSession(session.id)}
                    data-testid="session-select"
                    className={`flex-1 rounded-md border px-3 py-2 text-left text-sm ${
                      isActive
                        ? "border-black bg-black text-white"
                        : "border-gray-200 bg-gray-50 text-gray-800 hover:border-black"
                    }`}
                  >
                    <div className="font-medium">{session.label}</div>
                    <div className="text-xs opacity-70">
                      {session.formatted ? `Updated ${session.formatted}` : "New chat"}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRenameSession(session.id)}
                    data-testid="session-rename"
                    className="rounded-md border border-transparent px-2 py-1 text-xs text-gray-500 hover:border-gray-300 hover:text-gray-800"
                    aria-label={`Rename ${session.label}`}
                  >
                    Rename
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="flex-1">
        <h1 className="mb-4 text-2xl font-semibold">Hello Chat</h1>
        <Banner />
        <div
          ref={listRef}
          className="h-[420px] w-full overflow-y-auto rounded-lg border bg-white p-4 shadow"
        >
          {isLoadingHistory && (
            <div className="mb-2 text-xs text-gray-500">Restoring previous messages…</div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`mb-3 flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow transition ${
                  m.role === "user"
                    ? "bg-black text-white"
                    : m.role === "assistant"
                    ? "bg-gray-100"
                    : "bg-blue-50"
                }`}
              >
                <div className="mb-1 text-[11px] opacity-60">{m.role.toUpperCase()}</div>
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
            </div>
          ))}
          {isStreaming && <div className="animate-pulse text-xs text-gray-500">streaming…</div>}
        </div>
        {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
        <div className="mt-4 flex items-center gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleSend()}
            placeholder="Type your message…"
            className="flex-1 rounded-lg border px-3 py-2"
          />
          <button
            onClick={handleSend}
            disabled={isStreaming || isLoadingHistory}
            className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </section>
    </div>
  );
}
