"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Poppins } from "next/font/google";
import { useRouter } from "next/navigation";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const API_BASE_URL = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(
  /\/$/,
  ""
);
const STREAM_ENDPOINT = `${API_BASE_URL}/chat/stream`;
const HISTORY_ENDPOINT = `${API_BASE_URL}/chat/history`;
const STATE_ENDPOINT = `${API_BASE_URL}/debug/friction-state`;
const SESSIONS_ENDPOINT = `${API_BASE_URL}/chat/sessions`;
const RESET_ENDPOINT = `${API_BASE_URL}/chat/reset`;

const SESSION_LIST_STORAGE_KEY = "hl-student-chat-sessions";
const LAST_SESSION_STORAGE_KEY = "hl-student-chat-last-session";

/** Generates a random session id, preferring crypto.randomUUID when available. */
const createId = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2));

/** Returns the default welcome system message for a new chat. */
const createWelcomeMessage = () => ({
  id: "welcome",
  role: "system",
  text: "Welcome to Horizon Labs Chat. Ask a question to begin.",
});

/** Builds a user-friendly session name fallback. */
const defaultSessionName = (count) => `Chat ${count}`;

/** Combines class names, filtering out falsy values. */
const mergeClassNames = (...classes) => classes.filter(Boolean).join(" ");

const BLOCK_LEVEL_MARKDOWN_TAGS = new Set([
  "article",
  "aside",
  "blockquote",
  "div",
  "figure",
  "figcaption",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "thead",
  "tfoot",
  "tr",
  "td",
  "th",
  "ul",
]);

/** Checks whether a markdown code node contains multiple lines. */
const isMultilineCodeNode = (node) => {
  if (!node || node.type !== "element" || node.tagName !== "code") return false;
  const textContent = node.children
    ?.filter((child) => child.type === "text" && typeof child.value === "string")
    .map((child) => child.value)
    .join("");
  if (textContent && textContent.includes("\n")) {
    return true;
  }
  const start = node.position?.start?.line;
  const end = node.position?.end?.line;
  return typeof start === "number" && typeof end === "number" && end > start;
};

/** Recursively checks whether a markdown node contains any block-level elements. */
const markdownNodeHasBlockElement = (node) => {
  if (!node || !Array.isArray(node.children)) return false;
  return node.children.some((child) => {
    if (child.type !== "element") return false;
    const tag = typeof child.tagName === "string" ? child.tagName.toLowerCase() : "";
    if (tag === "code" && isMultilineCodeNode(child)) {
      return true;
    }
    if (BLOCK_LEVEL_MARKDOWN_TAGS.has(tag)) {
      return true;
    }
    return markdownNodeHasBlockElement(child);
  });
};

/** Maps backend classification sources to readable labels. */
const describeSource = (sourceRaw) => {
  if (sourceRaw === "model") return "LLM (model)";
  if (sourceRaw === "heuristic") return "Heuristic fallback";
  if (!sourceRaw) return "--";
  return "Unknown";
};

/** Human-friendly label for whether the LLM produced the response. */
const describeLLMUsage = (sourceRaw, label) => {
  if (sourceRaw === "model") return "Yes";
  if (sourceRaw === "heuristic") return label && label !== "--" ? "No – heuristic used" : "--";
  return "--";
};

/**
 * Student chat experience with session management, streaming answers, and diagnostics.
 */
export default function ChatPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([createWelcomeMessage()]);
  const [sessionState, setSessionState] = useState(null);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingState, setIsLoadingState] = useState(false);
  const [isRefreshingSessions, setIsRefreshingSessions] = useState(false);
  const [sessionListNotice, setSessionListNotice] = useState(null);
  const [error, setError] = useState(null);
  const [guidanceReady, setGuidanceReady] = useState(false);
  const [guidanceModalOpen, setGuidanceModalOpen] = useState(false);
  const [guidanceToggle, setGuidanceToggle] = useState(false);
  const [sessionMenuId, setSessionMenuId] = useState(null);
  const [showMessageDiagnostics, setShowMessageDiagnostics] = useState(false);
  const [showSessionDiagnostics, setShowSessionDiagnostics] = useState(true);
  const [showDiagnosticsInfo, setShowDiagnosticsInfo] = useState(false);

  const listRef = useRef(null);
  const abortRef = useRef(null);
  const sessionRef = useRef(activeSessionId || null);
  const skipNextHydrateRef = useRef(false);

  /** Syncs UI guidance prompts with backend state. */
  const applyGuidanceState = useCallback((ready) => {
    setGuidanceReady((prev) => {
      if (!prev && ready) {
        setGuidanceModalOpen(true);
      }
      return ready;
    });
    if (!ready) {
      setGuidanceToggle(false);
      setGuidanceModalOpen(false);
    }
  }, []);

  useEffect(() => {
    sessionRef.current = activeSessionId;
    if (typeof window !== "undefined") {
      if (activeSessionId) {
        window.localStorage.setItem(LAST_SESSION_STORAGE_KEY, activeSessionId);
      } else {
        window.localStorage.removeItem(LAST_SESSION_STORAGE_KEY);
      }
    }
  }, [activeSessionId]);

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

    setSessions(parsed);

    if (parsed.length > 0) {
      const last = window.localStorage.getItem(LAST_SESSION_STORAGE_KEY);
      if (last && parsed.some((session) => session.id === last)) {
        sessionRef.current = last;
        setActiveSessionId(last);
      } else {
        sessionRef.current = null;
        setActiveSessionId(null);
        window.localStorage.removeItem(LAST_SESSION_STORAGE_KEY);
      }
    } else {
      sessionRef.current = null;
      setActiveSessionId(null);
      window.localStorage.removeItem(LAST_SESSION_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SESSION_LIST_STORAGE_KEY, JSON.stringify(sessions));
    }
  }, [sessions]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (sessions.length === 0) {
      if (activeSessionId !== null) {
        setActiveSessionId(null);
      }
      sessionRef.current = null;
      setMessages([createWelcomeMessage()]);
      setSessionState(null);
      applyGuidanceState(false);
      return;
    }

    if (activeSessionId && !sessions.some((session) => session.id === activeSessionId)) {
      setActiveSessionId(null);
      sessionRef.current = null;
      setMessages([createWelcomeMessage()]);
      setSessionState(null);
      applyGuidanceState(false);
    }
  }, [sessions, activeSessionId, applyGuidanceState]);

  /** Loads historical messages for a session from the backend. */
  const fetchHistory = useCallback(async (sessionId, signal) => {
    const url = `${HISTORY_ENDPOINT}?session_id=${encodeURIComponent(sessionId)}`;
    const response = await fetch(url, { signal });
    if (response.status === 404) {
      return {
        messages: [],
        latestTimestamp: new Date().toISOString(),
      };
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
      turnClassification: msg.turn_classification ?? null,
      classificationRationale: msg.classification_rationale ?? null,
      classificationSource: msg.classification_source ?? null,
    }));
    const latest =
      restored.length && restored[restored.length - 1].createdAt
        ? restored[restored.length - 1].createdAt
        : new Date().toISOString();
    return { messages: restored, latestTimestamp: latest };
  }, []);

  /** Fetches session-level state used to drive guidance toggles and diagnostics. */
  const fetchSessionState = useCallback(async (sessionId, signal) => {
    const url = `${STATE_ENDPOINT}?session_id=${encodeURIComponent(sessionId)}`;
    const response = await fetch(url, { signal });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch session state (status ${response.status})`);
    }
    return await response.json();
  }, []);

  /** Hydrates history and session state while handling cancellations and loaders. */
  const runHydrate = useCallback(
    async (sessionId, { withLoaders = true, shouldCancel, signal } = {}) => {
      if (!sessionId) return null;
      if (withLoaders) {
        setIsLoadingHistory(true);
        setIsLoadingState(true);
      }
      setError(null);

      try {
        const [historyPayload, statePayload] = await Promise.all([
          fetchHistory(sessionId, signal),
          fetchSessionState(sessionId, signal),
        ]);

        if (shouldCancel?.()) {
          return null;
        }

        const transcript = historyPayload.messages.length
          ? [createWelcomeMessage(), ...historyPayload.messages]
          : [createWelcomeMessage()];
        setMessages(transcript);

        if (shouldCancel?.()) {
          return null;
        }

        setSessionState(statePayload);
        applyGuidanceState(Boolean(statePayload && statePayload.guidance_ready));

        const messageCount = historyPayload.messages.filter(
          (msg) => msg.role === "user" || msg.role === "assistant"
        ).length;

        setSessions((prev) =>
          prev.map((session, index) =>
            session.id === sessionId
              ? {
                  ...session,
                  name: session.name || defaultSessionName(index + 1),
                  updatedAt: historyPayload.latestTimestamp,
                  messageCount,
                }
              : session
          )
        );

        return { history: historyPayload, state: statePayload };
      } catch (err) {
        if (shouldCancel?.()) {
          return null;
        }
        const message = err instanceof Error ? err.message : "Unable to load session data.";
        setError(message);
        setMessages([createWelcomeMessage()]);
        setSessionState(null);
        applyGuidanceState(false);
        throw err;
      } finally {
        if (withLoaders && !shouldCancel?.()) {
          setIsLoadingHistory(false);
          setIsLoadingState(false);
        }
      }
    },
    [applyGuidanceState, fetchHistory, fetchSessionState]
  );

  useEffect(() => {
    if (!activeSessionId) {
      return;
    }

    if (skipNextHydrateRef.current) {
      skipNextHydrateRef.current = false;
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    runHydrate(activeSessionId, {
      withLoaders: true,
      shouldCancel: () => cancelled,
      signal: controller.signal,
    }).catch(() => {
      if (cancelled) return;
      // Error surfaced via state setters.
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeSessionId, runHydrate]);

  /** Refreshes the session list from the backend and merges with any local data. */
  const refreshSessionsFromApi = useCallback(
    async (preferredId) => {
      setIsRefreshingSessions(true);
      setSessionListNotice(null);

      try {
        const response = await fetch(SESSIONS_ENDPOINT);
        if (response.status === 404) {
          return;
        }
        if (!response.ok) {
          throw new Error(`Failed to load sessions (status ${response.status})`);
        }
        const payload = await response.json();
        const apiSessions = Array.isArray(payload.sessions) ? payload.sessions : [];

        setSessions((prev) => {
          const prevById = new Map(prev.map((session) => [session.id, session]));
          const merged = apiSessions.map((session, index) => {
            const existing = prevById.get(session.session_id);
            const updatedAt =
              session.updated_at ?? existing?.updatedAt ?? new Date().toISOString();
            return {
              id: session.session_id,
              name: existing?.name ?? defaultSessionName(index + 1),
              createdAt: existing?.createdAt ?? updatedAt,
              updatedAt,
              messageCount:
                typeof session.message_count === "number"
                  ? session.message_count
                  : existing?.messageCount ?? 0,
            };
          });

          prev.forEach((session) => {
            if (!merged.some((item) => item.id === session.id)) {
              merged.push(session);
            }
          });

          merged.sort((a, b) => {
            const right = new Date(b.updatedAt || 0).getTime();
            const left = new Date(a.updatedAt || 0).getTime();
            return right - left;
          });

          return merged;
        });

        if (preferredId) {
          setActiveSessionId((prev) => prev ?? preferredId);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to reach the session service.";
        setSessionListNotice(message);
      } finally {
        setIsRefreshingSessions(false);
      }
    },
    []
  );

  useEffect(() => {
    refreshSessionsFromApi(activeSessionId ?? undefined);
  }, [refreshSessionsFromApi, activeSessionId]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const handleDocumentClick = (event) => {
      const target = event.target;
      if (
        target instanceof Node &&
        target.closest("[data-session-menu-root]")
      ) {
        return;
      }
      setSessionMenuId(null);
    };
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, []);

  /** Ensures there is an active session id, creating one if none exists. */
  const ensureSessionId = useCallback(() => {
    const existing = sessionRef.current || activeSessionId;
    if (existing) {
      sessionRef.current = existing;
      if (!sessions.some((session) => session.id === existing)) {
        const now = new Date().toISOString();
        setSessions((prev) => [
          {
            id: existing,
            name: defaultSessionName(prev.length + 1),
            createdAt: now,
            updatedAt: now,
            messageCount: 0,
          },
          ...prev,
        ]);
      }
      return existing;
    }

    const id = createId();
    const now = new Date().toISOString();
    setSessions((prev) => [
      {
        id,
        name: defaultSessionName(prev.length + 1),
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
      },
      ...prev,
    ]);
    setActiveSessionId(id);
    sessionRef.current = id;
    skipNextHydrateRef.current = true;
    return id;
  }, [activeSessionId, sessions]);

  /** Updates a message by id using a partial patch or updater function. */
  const updateMessage = useCallback((id, updater) => {
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id !== id) return msg;
        const patch = typeof updater === "function" ? updater(msg) : updater;
        return { ...msg, ...patch };
      })
    );
  }, []);

  /** Starts a new chat session and resets state. */
  const handleCreateSession = () => {
    const now = new Date().toISOString();
    const id = createId();
    setSessions((prev) => [
      {
        id,
        name: defaultSessionName(prev.length + 1),
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
      },
      ...prev,
    ]);
    setActiveSessionId(id);
    sessionRef.current = id;
    skipNextHydrateRef.current = true;
    setMessages([createWelcomeMessage()]);
    setSessionState(null);
    setIsLoadingHistory(false);
    setIsLoadingState(false);
    setError(null);
    applyGuidanceState(false);
  };

  /** Switches to another chat session, aborting any in-flight stream. */
  const handleSelectSession = (id) => {
    if (!id || id === activeSessionId) return;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsStreaming(false);
    setIsClassifying(false);
    setIsLoadingHistory(true);
    setIsLoadingState(true);
    setActiveSessionId(id);
    sessionRef.current = id;
    skipNextHydrateRef.current = false;
    setMessages([createWelcomeMessage()]);
    setSessionState(null);
    setError(null);
    applyGuidanceState(false);
    setSessionMenuId(null);
  };

  /** Renames a chat session using a prompt dialog. */
  const handleRenameSession = (id) => {
    if (typeof window === "undefined") return;
    const session = sessions.find((item) => item.id === id);
    if (!session) return;
    const next = window.prompt("Rename chat", session.name ?? "");
    if (!next) return;
    setSessions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, name: next } : item))
    );
  };

  /** Resets a session on the server and removes it locally. */
  const handleResetSession = async (id) => {
    if (!id) return;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    try {
      const response = await fetch(RESET_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: id }),
      });
      if (!response.ok) {
        throw new Error(`Reset failed (status ${response.status})`);
      }
      setSessions((prev) => prev.filter((session) => session.id !== id));
      if (activeSessionId === id) {
        setActiveSessionId(null);
        sessionRef.current = null;
        setMessages([createWelcomeMessage()]);
        setSessionState(null);
        applyGuidanceState(false);
      }
      await refreshSessionsFromApi(
        activeSessionId && activeSessionId !== id ? activeSessionId : undefined
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to reset session.";
      setError(message);
    }
  };

  /** Reloads the current session from the backend APIs. */
  const handleRefreshClick = async () => {
    const sessionId = sessionRef.current;
    if (!sessionId) return;
    try {
      await runHydrate(sessionId, { withLoaders: true });
      await refreshSessionsFromApi(sessionId);
    } catch {
      // Error already surfaced through state.
    }
  };

  /** Sends a message, streams the assistant response, and refreshes session data. */
  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || isLoadingHistory || isClassifying) return;

    const currentSession = ensureSessionId();
    if (!currentSession) return;

    const userId = createId();
    const assistantId = createId();
    const now = new Date().toISOString();
    const useGuidanceNow = guidanceReady && guidanceToggle;

    let encounteredError = false;

    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", text: trimmed, createdAt: now },
      { id: assistantId, role: "assistant", text: "", createdAt: now, isStreaming: true },
    ]);
    setInput("");
    setIsStreaming(true);
    setIsClassifying(true);

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
          const message = payload.message || "An error occurred";
          updateMessage(assistantId, () => ({ text: `⚠️ ${message}`, isStreaming: false }));
          setError(message);
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
        const message =
          err instanceof Error ? err.message : "Failed to parse response from server.";
        updateMessage(assistantId, () => ({ text: `⚠️ ${message}`, isStreaming: false }));
        setError(message);
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
        events.forEach((event) => processEvent(event.trim()));
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
            use_guidance: useGuidanceNow,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        await readStream(response);
        updateMessage(assistantId, () => ({ isStreaming: false }));

        if (!encounteredError) {
          await runHydrate(currentSession, { withLoaders: false });
          await refreshSessionsFromApi(currentSession);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          const message = err instanceof Error ? err.message : "Unknown error";
          updateMessage(assistantId, () => ({ text: `⚠️ ${message}`, isStreaming: false }));
          setError(message);
        }
      } finally {
        setIsStreaming(false);
        setIsClassifying(false);
        abortRef.current = null;
        if (useGuidanceNow) {
          setGuidanceToggle(false);
          setGuidanceModalOpen(false);
        }
      }
    })();
  };

  /** Derived summary labels for the session list sidebar. */
  const sessionSummaries = useMemo(() => {
    return sessions.map((session, index) => {
      const timestamp =
        session.updatedAt && !Number.isNaN(new Date(session.updatedAt).getTime())
          ? new Date(session.updatedAt).toLocaleString()
          : null;
      return {
        ...session,
        label: session.name || defaultSessionName(index + 1),
        formatted: timestamp ? `Updated ${timestamp}` : "New chat",
      };
    });
  }, [sessions]);

  /** Filters out system messages for display. */
  const nonSystemMessages = useMemo(
    () => messages.filter((message) => message.role !== "system"),
    [messages]
  );

  /** Custom renderers for markdown output to align with chat styling. */
  const markdownComponents = useMemo(
    () => ({
      table: ({ node, className, ...props }) => (
        <div className="chat-markdown-table-wrapper overflow-x-auto">
          <table
            {...props}
            className={mergeClassNames(
              "chat-markdown-table w-full border-collapse text-left text-sm",
              className
            )}
          />
        </div>
      ),
      th: ({ node, className, ...props }) => (
        <th
          {...props}
          className={mergeClassNames(
            "border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700",
            className
          )}
        />
      ),
      td: ({ node, className, ...props }) => (
        <td
          {...props}
          className={mergeClassNames("border-b border-gray-100 px-3 py-2 align-top text-sm", className)}
        />
      ),
      pre: ({ className, children, ...props }) => (
        <pre
          {...props}
          className={mergeClassNames(
            "chat-markdown-pre overflow-x-auto rounded-xl border border-gray-300 bg-gray-100 p-4 text-[13px] text-gray-900",
            className
          )}
        >
          {children}
        </pre>
      ),
      code: ({ inline, className, children, ...props }) => {
        if (inline) {
          return (
            <code
              {...props}
              className={mergeClassNames(
                "rounded-md bg-gray-100 px-1.5 py-0.5 font-mono text-[12px] text-purple-700",
                className
              )}
            >
              {children}
            </code>
          );
        }
        return (
          <code {...props} className={mergeClassNames("font-mono text-gray-900", className)}>
            {children}
          </code>
        );
      },
      a: ({ className, ...props }) => (
        <a
          {...props}
          className={mergeClassNames(
            "text-purple-600 underline-offset-2 transition hover:text-purple-500 hover:underline",
            className
          )}
          target="_blank"
          rel="noreferrer"
        />
      ),
      ul: ({ className, ...props }) => (
        <ul {...props} className={mergeClassNames("ml-5 list-disc space-y-1", className)} />
      ),
      ol: ({ className, ...props }) => (
        <ol {...props} className={mergeClassNames("ml-5 list-decimal space-y-1", className)} />
      ),
      p: ({ node, className, children, ...props }) => {
        const hasBlockChild = markdownNodeHasBlockElement(node);
        const Tag = hasBlockChild ? "div" : "p";
        const baseClasses = hasBlockChild ? "mb-3 space-y-3 text-[15px]" : "mb-3 leading-relaxed text-[15px]";
        return (
          <Tag {...props} className={mergeClassNames(baseClasses, className)}>
            {children}
          </Tag>
        );
      },
      em: ({ node, className, children, ...props }) => {
        const combined = mergeClassNames("italic", className);
        if (markdownNodeHasBlockElement(node)) {
          return (
            <div {...props} className={combined}>
              {children}
            </div>
          );
        }
        return (
          <em {...props} className={combined}>
            {children}
          </em>
        );
      },
      strong: ({ className, ...props }) => (
        <strong {...props} className={mergeClassNames("font-semibold text-gray-900", className)} />
      ),
      blockquote: ({ className, ...props }) => (
        <blockquote
          {...props}
          className={mergeClassNames(
            "border-l-4 border-purple-200 bg-purple-50/60 px-4 py-2 text-sm italic text-purple-900",
            className
          )}
        />
      ),
    }),
    []
  );

  const showLanding = !isLoadingHistory && nonSystemMessages.length === 0;

  const attempts = Number(sessionState?.friction_attempts ?? 0);
  const threshold = Number(sessionState?.friction_threshold ?? 0);
  const remaining =
    sessionState?.responses_needed ?? Math.max(threshold - attempts, 0);
  const backendNextPrompt = sessionState?.next_prompt ?? "--";
  const nextPrompt = guidanceReady
    ? guidanceToggle
      ? "guidance"
      : "friction"
    : backendNextPrompt;
  const lastPrompt = sessionState?.last_prompt ?? "--";
  const guidanceReadyNow = Boolean(sessionState?.guidance_ready);
  const classificationLabelRaw = sessionState?.classification_label ?? null;
  const classificationLabel =
    classificationLabelRaw && classificationLabelRaw.trim().length
      ? classificationLabelRaw
      : "--";
  const classificationRationale =
    sessionState?.classification_rationale && sessionState.classification_rationale.trim().length
      ? sessionState.classification_rationale
      : "--";
  const classificationSource = sessionState?.classification_source ?? null;
  const classificationSourceDisplay = describeSource(classificationSource);
  const classificationLLM = describeLLMUsage(classificationSource, classificationLabel);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 md:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/Student/HomePage")}
          className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-purple-400"
        >
          ← Back to Home
        </button>
      </div>
      <div className="flex w-full flex-col gap-8 md:flex-row">
      <aside className="w-full md:w-72">
        <div className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className={`text-lg font-semibold ${poppins.className}`}>Your Sessions</h2>
            <button
              type="button"
              onClick={handleCreateSession}
              className="rounded-lg bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900"
            >
              New
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Switch between practice attempts and keep history in sync with the backend.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => refreshSessionsFromApi(activeSessionId ?? undefined)}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:border-purple-400"
            >
              Sync Sessions
            </button>
            {isRefreshingSessions && (
              <span className="text-xs text-gray-500">Syncing…</span>
            )}
          </div>
          {sessionListNotice && (
            <div className="mt-3 rounded-xl border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800">
              {sessionListNotice}
            </div>
          )}
          <ul className="mt-4 space-y-3">
            {sessionSummaries.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <li
                  key={session.id}
                  className="relative"
                  data-session-menu-root={sessionMenuId === session.id ? "true" : undefined}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => handleSelectSession(session.id)}
                      className={`w-full flex-1 rounded-2xl border px-3 py-2 text-left text-sm transition ${
                        isActive
                          ? "border-purple-500 bg-purple-50 text-purple-900 shadow-sm"
                          : "border-gray-200 bg-white text-gray-800 hover:border-purple-300"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{session.label}</span>
                        <span className="text-xs opacity-70">
                          {session.messageCount ?? 0} msgs
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">{session.formatted}</div>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSessionMenuId((prev) => (prev === session.id ? null : session.id));
                      }}
                      className="mt-1 rounded-full border border-transparent px-2 py-1 text-lg leading-none text-gray-500 hover:border-gray-300 hover:text-gray-800"
                      aria-label={`Session options for ${session.label}`}
                    >
                      ⋯
                    </button>
                  </div>
                  {sessionMenuId === session.id && (
                    <div
                      className="absolute right-0 top-14 z-10 w-36 rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSessionMenuId(null);
                          handleRenameSession(session.id);
                        }}
                        className="block w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSessionMenuId(null);
                          handleResetSession(session.id);
                        }}
                        className="block w-full px-3 py-2 text-left text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
            {!sessionSummaries.length && (
              <li className="rounded-2xl border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-500">
                No sessions yet. Start by creating a new chat.
              </li>
            )}
          </ul>
        </div>
      </aside>

      <section className="flex-1 space-y-6">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className={`text-3xl font-semibold ${poppins.className}`}>Adaptive Coach</h1>
              {showLanding && (
                <p className="text-sm text-gray-500">Select or create a session to begin.</p>
              )}
            </div>
          </div>

          {showLanding ? (
            <>
              <div className="mt-8 flex h-[520px] flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-purple-200 bg-purple-50/70 text-center">
                <img src="/chat.png" alt="" className="h-16 w-16" />
                <div>
                  <h2
                    className={`text-[48.52px] font-bold tracking-[0.03em] text-gray-900 ${poppins.className}`}
                  >
                    New Chat Session
                  </h2>
                  <p className="mt-2 text-sm text-gray-500">
                    Ask a question to begin. Select a session from the left or start a fresh chat
                    below.
                  </p>
                </div>
              </div>

              {error && (
                <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
                <div className="flex w-full flex-wrap items-center gap-3">
                  <button
                    type="button"
                    aria-label="Add context"
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-200 text-gray-600 transition-colors hover:bg-gray-300"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v12m6-6H6"
                      />
                    </svg>
                  </button>
                  {isStreaming && (
                    <button
                      type="button"
                      className="rounded-full bg-purple-100 px-4 py-2 text-sm font-medium text-purple-600"
                    >
                      Thinking
                    </button>
                  )}
                  <div className="flex-1">
                    <input
                      value={input}
                      onChange={(event) => setInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="What do you need help with today?"
                      className="w-full rounded-2xl bg-purple-50 px-4 py-3 text-sm text-gray-800 placeholder-purple-400 outline-none ring-0 transition focus:bg-white focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={isStreaming || isLoadingHistory || isClassifying || !input.trim()}
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white transition hover:from-purple-600 hover:to-pink-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div
                ref={listRef}
                className="mt-4 h-[520px] w-full overflow-y-auto rounded-2xl border border-gray-100 bg-gray-50 p-4"
              >
                {isLoadingHistory && (
                  <div className="mb-3 text-xs text-gray-500">Restoring previous messages…</div>
                )}
                {nonSystemMessages.map((message) => {
                  const isUser = message.role === "user";
                  const shouldRenderMarkdown =
                    !isUser &&
                    !message.isStreaming &&
                    typeof message.text === "string" &&
                    message.text.trim().length > 0;
                  return (
                    <div
                      key={message.id}
                      className={`mb-3 flex ${isUser ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] break-words rounded-2xl px-4 py-3 text-sm shadow ${
                          isUser ? "bg-purple-600 text-white" : "bg-white text-gray-800"
                        }`}
                      >
                        {shouldRenderMarkdown ? (
                          <div className="chat-markdown">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={markdownComponents}
                            >
                              {message.text}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap">{message.text}</div>
                        )}
                        {showMessageDiagnostics && message.turnClassification && (
                          <div className="mt-2 text-[11px] opacity-80">
                            Classification: {message.turnClassification}
                            {message.classificationSource && (
                              <span className="ml-1">
                                • {describeSource(message.classificationSource)}
                              </span>
                            )}
                          </div>
                        )}
                        {showMessageDiagnostics && message.classificationRationale && (
                          <div className="mt-1 text-[11px] opacity-60">
                            {message.classificationRationale}
                          </div>
                        )}
                        {message.createdAt && (
                          <div className="mt-2 text-[10px] opacity-50">
                            {new Date(message.createdAt).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {isStreaming && <div className="text-xs text-gray-500">streaming…</div>}
              </div>

              {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}

              {guidanceReady ? (
                guidanceModalOpen ? (
                  <div className="mt-4 relative rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                    <button
                      type="button"
                      onClick={() => setGuidanceModalOpen(false)}
                      className="absolute right-3 top-3 text-base text-blue-500 hover:text-blue-700"
                      aria-label="Dismiss guidance prompt"
                    >
                      ×
                    </button>
                    <h3 className="text-sm font-semibold">Guidance mode unlocked</h3>
                    <p className="mt-1 text-xs">
                      Toggle to let Horizon Labs provide direct guidance on the next response. The
                      toggle resets after one turn so you can stay in friction mode when you prefer.
                    </p>
                    <label className="mt-3 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={guidanceToggle}
                        onChange={(event) => setGuidanceToggle(event.target.checked)}
                      />
                      Use guidance on the next response
                    </label>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setGuidanceModalOpen(true)}
                    className="mt-4 w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 hover:border-blue-300"
                  >
                    Guidance ready — click to configure
                  </button>
                )
              ) : (
                <div className="mt-4 rounded-xl border border-purple-100 bg-purple-50 px-3 py-2 text-xs text-purple-700">
                  Guidance unlocks after{" "}
                  <span className="font-semibold">
                    {typeof remaining === "number" ? Math.max(remaining, 0) : "a few more"}
                  </span>{" "}
                  qualifying responses.
                </div>
              )}

              <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="What do you need help with today?"
                  rows={2}
                  className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow focus:border-purple-400 focus:outline-none focus:ring-0"
                />
                <button
                  onClick={handleSend}
                  disabled={isStreaming || isLoadingHistory || isClassifying || !input.trim()}
                  className="rounded-2xl bg-gradient-to-r from-purple-500 to-blue-500 px-6 py-3 text-sm font-semibold text-white shadow transition hover:from-purple-600 hover:to-blue-600 disabled:opacity-60"
                >
                  Send
                </button>
              </div>
            </>
          )}
        </div>

        {!showLanding && (
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className={`text-lg font-semibold ${poppins.className}`}>Session Diagnostics</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowDiagnosticsInfo((prev) => !prev)}
                  className="flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm hover:border-blue-400"
                  aria-expanded={showDiagnosticsInfo ? "true" : "false"}
                  aria-controls="session-diagnostics-info"
                >
                  <span>Info</span>
                  <span className="text-base leading-none text-blue-500">ℹ️</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowSessionDiagnostics((prev) => !prev)}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm hover:border-purple-400"
                >
                  {showSessionDiagnostics ? "Hide" : "Show"} diagnostics
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Inspect the friction gate state and classifier output powering guidance mode.
            </p>
            {showDiagnosticsInfo && (
              <div
                id="session-diagnostics-info"
                className="mt-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm text-blue-900 shadow-sm"
              >
                <h3 className="text-sm font-semibold">How your coach reads each turn</h3>
                <ul className="mt-2 list-outside list-disc space-y-2 pl-5">
                  <li>
                    <strong>Qualifying response</strong>: When you stay focused on the task, share your thinking, and
                    suggest a next step, the coach counts it as progress toward unlocking fuller support.
                  </li>
                  <li>
                    <strong>Friction vs guidance</strong>: Friction mode keeps you in the driver’s seat with hints and
                    questions; after enough qualifying responses, guidance mode opens up and the coach can be more direct.
                  </li>
                  <li>
                    <strong>Classifier labels</strong>: <em>good</em> means your reply is on track. If you see{" "}
                    <em>needs_focusing</em>, it’s a nudge that you may not be unlocking the full learning moment yet, so
                    try to slow down, explain your thinking, and connect your next step back to the goal.
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={() => setShowDiagnosticsInfo(false)}
                  className="mt-3 text-xs font-medium text-blue-600 underline-offset-2 hover:underline"
                >
                  Got it
                </button>
              </div>
            )}
            {showSessionDiagnostics && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowMessageDiagnostics((prev) => !prev)}
                  className={`rounded-xl border px-3 py-2 text-sm transition ${
                    showMessageDiagnostics
                      ? "border-purple-500 bg-purple-50 text-purple-900"
                      : "border-gray-200 hover:border-purple-400"
                  }`}
                >
                  {showMessageDiagnostics ? "Hide" : "Show"} message classifications
                </button>
                <button
                  type="button"
                  onClick={handleRefreshClick}
                  disabled={!activeSessionId || isLoadingState}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm hover:border-purple-400 disabled:opacity-60"
                >
                  Refresh
                </button>
              </div>
            )}

            {showSessionDiagnostics ? (
              isLoadingState ? (
                <div className="mt-6 text-sm text-gray-500">Loading session state…</div>
              ) : sessionState ? (
                <div className="mt-6 space-y-6">
                  <div className="grid gap-4 text-sm md:grid-cols-2">
                    <div>
                      <div className="text-xs uppercase text-gray-400">Session ID</div>
                      <div className="font-medium text-gray-900">
                        {activeSessionId ?? sessionState.session_id ?? "--"}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-gray-400">Guidance ready</div>
                      <div>
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${
                            guidanceReadyNow
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {guidanceReadyNow ? "Yes" : "No"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-gray-400">Next prompt</div>
                      <div className="font-medium text-gray-900">{nextPrompt}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-gray-400">Last prompt</div>
                      <div className="font-medium text-gray-900">{lastPrompt}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-gray-400">Qualifying attempts</div>
                      <div className="font-medium text-gray-900">
                        {attempts} / {threshold}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-gray-400">Responses needed</div>
                      <div className="font-medium text-gray-900">{Math.max(remaining, 0)}</div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-800">Last classification</h3>
                    <div className="mt-2 grid gap-3 text-sm md:grid-cols-2">
                      <div>
                        <div className="text-xs uppercase text-gray-400">Label</div>
                        <div className="font-medium text-gray-900">{classificationLabel}</div>
                      </div>
                      <div>
                        <div className="text-xs uppercase text-gray-400">Source</div>
                        <div className="font-medium text-gray-900">{classificationSourceDisplay}</div>
                      </div>
                      <div>
                      <div className="text-xs uppercase text-gray-400">LLM used</div>
                      <div className="font-medium text-gray-900">{classificationLLM}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase text-gray-400">Rationale</div>
                      <div className="font-medium text-gray-900">{classificationRationale}</div>
                    </div>
                  </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 text-sm text-gray-500">
                  Select a session to view friction diagnostics.
                </div>
              )
            ) : null}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
