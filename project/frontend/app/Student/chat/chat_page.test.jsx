/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock font to avoid runtime differences
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// Mock next/navigation BEFORE importing component
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import ChatPage from "./chat_page.jsx";

const SESSION_LIST_STORAGE_KEY = "hl-student-chat-sessions";
const LAST_SESSION_STORAGE_KEY = "hl-student-chat-last-session";

beforeEach(() => {
  cleanup();
  jest.clearAllMocks();
  window.localStorage.clear();

  // default fetch that can be overridden per-test
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ sessions: [] }),
      text: () => Promise.resolve(""),
    })
  );
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

test("renders landing view and 'New' creates a session (Chat 1)", async () => {
  render(<ChatPage />);

  // Landing content present
  expect(screen.getByText(/New Chat Session/i)).toBeInTheDocument();
  expect(screen.getByText(/Ask a question to begin/i)).toBeInTheDocument();

  // Click New -> session should appear in list
  const newBtn = screen.getByRole("button", { name: /New/i });
  await userEvent.click(newBtn);

  // Session button labeled Chat 1 should exist
  expect(await screen.findByText(/Chat 1/)).toBeInTheDocument();
});

test("malformed session-list in localStorage results in empty sessions and LAST_SESSION removed", async () => {
  // put bad JSON and a last session id
  window.localStorage.setItem(SESSION_LIST_STORAGE_KEY, "not-json");
  window.localStorage.setItem(LAST_SESSION_STORAGE_KEY, "does-not-exist");

  render(<ChatPage />);

  // Wait for component to process and show empty-state
  await waitFor(() => {
    expect(screen.getByText(/No sessions yet\. Start by creating a new chat\./i)).toBeInTheDocument();
  });

  // LAST_SESSION should have been removed
  expect(window.localStorage.getItem(LAST_SESSION_STORAGE_KEY)).toBeNull();
});

test("hydrates session: fetchHistory + fetchSessionState render messages and guidance modal opens", async () => {
  // prepare stored sessions and last session id
  const stored = [{ id: "s-1", name: "My Session", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
  window.localStorage.setItem(SESSION_LIST_STORAGE_KEY, JSON.stringify(stored));
  window.localStorage.setItem(LAST_SESSION_STORAGE_KEY, "s-1");

  // mock fetch to return history and state depending on url
  global.fetch = jest.fn((url) => {
    if (url.includes("/chat/history")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            messages: [
              { role: "user", content: "Hi", created_at: "2025-01-01T00:00:00Z" },
              { role: "assistant", content: "Answer", created_at: "2025-01-01T00:00:01Z" },
            ],
          }),
      });
    }
    if (url.includes("/debug/friction-state")) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            guidance_ready: true,
            classification_label: "good",
            classification_source: "model",
            classification_rationale: "Because",
            next_prompt: "friction",
          }),
      });
    }
    // fallback
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });

  render(<ChatPage />);

  // messages should be rendered (non-system)
  await waitFor(() => {
    expect(screen.getByText("Answer")).toBeInTheDocument();
    expect(screen.getByText("Hi")).toBeInTheDocument();
  });

  // guidance modal should open (guidanceReady true -> modal open)
  await waitFor(() => {
    expect(screen.getByText(/Guidance mode unlocked/i)).toBeInTheDocument();
  });

  // Session diagnostic shows classification label
  await waitFor(() => {
    expect(screen.getByText(/good/i)).toBeInTheDocument();
  });
});

test("fetchHistory 404 returns empty history and component shows landing (no non-system messages)", async () => {
  const stored = [{ id: "s-404", name: "Empty Session", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
  window.localStorage.setItem(SESSION_LIST_STORAGE_KEY, JSON.stringify(stored));
  window.localStorage.setItem(LAST_SESSION_STORAGE_KEY, "s-404");

  global.fetch = jest.fn((url) => {
    if (url.includes("/chat/history")) {
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    }
    if (url.includes("/debug/friction-state")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(null) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
  });

  render(<ChatPage />);

  // After hydrate with 404 history, there are no non-system messages -> landing shown
  await waitFor(() => {
    expect(screen.getByText(/New Chat Session/i)).toBeInTheDocument();
  });
});

test("rename and delete session via session menu (prompt + reset POST)", async () => {
  render(<ChatPage />);

  // create a session
  const newBtn = screen.getByRole("button", { name: /New/i });
  await userEvent.click(newBtn);

  const sessionBtn = await screen.findByText(/Chat 1/);
  expect(sessionBtn).toBeInTheDocument();

  // open session menu (aria-label uses session label)
  const menuToggle = screen.getByLabelText(/Session options for Chat 1/);
  await userEvent.click(menuToggle);

  // mock prompt to return new name
  const promptSpy = jest.spyOn(window, "prompt").mockImplementation(() => "Renamed Chat");

  // click Rename
  const renameBtn = await screen.findByText("Rename");
  await userEvent.click(renameBtn);

  // label updated
  expect(await screen.findByText("Renamed Chat")).toBeInTheDocument();
  promptSpy.mockRestore();

  // open menu again for delete
  const deleteMenuToggle = screen.getByLabelText(/Session options for Renamed Chat/);
  await userEvent.click(deleteMenuToggle);

  // mock RESET endpoint to succeed
  global.fetch = jest.fn((url, opts) => {
    if (url.includes("/chat/reset")) {
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("") });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ sessions: [] }) });
  });

  // click Delete
  const deleteBtn = await screen.findByText("Delete");
  await userEvent.click(deleteBtn);

  // After reset, session should be removed and landing shown
  await waitFor(() => {
    expect(screen.queryByText("Renamed Chat")).not.toBeInTheDocument();
    expect(screen.getByText(/New Chat Session/i)).toBeInTheDocument();
  });
});

test("Sync Sessions (refreshSessionsFromApi) surfaces error notice when backend non-ok", async () => {
  render(<ChatPage />);

  // mock fetch for SESSIONS_ENDPOINT to return non-ok
  global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ detail: "Broken" }) }));

  const syncBtn = screen.getByRole("button", { name: /Sync Sessions/i });
  await userEvent.click(syncBtn);

  // notice should appear
  await waitFor(() => {
    expect(screen.getByText(/Failed to load sessions/i) || screen.getByText(/Broken/i) || screen.getByText(/Unable to reach the session service\./i)).toBeTruthy();
  });
});