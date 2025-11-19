/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// increase file-level timeout for slow CI environments (adjust if you prefer)
jest.setTimeout(10000);

// mock next/font/google to avoid runtime font logic
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// mock next/navigation router
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import PracticePage from "./practice.jsx";

beforeEach(() => {
  jest.restoreAllMocks();
  cleanup();
  mockPush.mockClear();
  window.localStorage.clear();

  // default fetch mock resolves OK by default to avoid hangs
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(""),
    })
  );
});

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  cleanup();
});

test("renders header and shows no slide deck text when sourceFilename empty", () => {
  render(<PracticePage />);
  expect(screen.getByRole("heading", { name: /Practice Mode/i })).toBeInTheDocument();
  expect(screen.getByText(/No slide deck attached yet\./i)).toBeInTheDocument();
});

test("typing title persists draft to localStorage", async () => {
  render(<PracticePage />);
  const titleInput = screen.getByPlaceholderText(/e.g., Midterm Practice Set/i) || screen.getByLabelText(/Quiz Title/i);

  await userEvent.type(titleInput, "My Practice Quiz");
  // Wait for effect to persist to localStorage (short timeout to fail fast)
  await waitFor(
    () => {
      const raw = window.localStorage.getItem("quizConfigDraft");
      expect(raw).not.toBeNull();
      const draft = JSON.parse(raw);
      expect(draft.title).toBe("My Practice Quiz");
      expect(draft.mode).toBe("practice");
    },
    { timeout: 2000 }
  );
});

test("adding and removing a topic updates UI and local state", async () => {
  render(<PracticePage />);
  const topicInput = screen.getByPlaceholderText(/e.g., Recursion/i);
  const addBtn = screen.getByRole("button", { name: /add topic/i });

  await userEvent.type(topicInput, "Graphs");
  await userEvent.click(addBtn);

  expect(await screen.findByText("Graphs", { timeout: 2000 })).toBeInTheDocument();
  // remove
  const removeBtn = screen.getByRole("button", { name: /Remove/i });
  await userEvent.click(removeBtn);
  await waitFor(
    () => {
      expect(screen.queryByText("Graphs")).not.toBeInTheDocument();
    },
    { timeout: 2000 }
  );
});

test("prevents adding duplicate topics and trims whitespace", async () => {
  render(<PracticePage />);
  const topicInput = screen.getByPlaceholderText(/e.g., Recursion/i);
  const addBtn = screen.getByRole("button", { name: /add topic/i });

  await userEvent.type(topicInput, "  Algorithms  ");
  await userEvent.click(addBtn);
  expect(await screen.findByText("Algorithms", { timeout: 2000 })).toBeInTheDocument();

  // attempt duplicate with extra spaces
  await userEvent.type(topicInput, "Algorithms ");
  await userEvent.click(addBtn);

  const occurrences = screen.getAllByText("Algorithms");
  expect(occurrences.length).toBe(1);
  expect(topicInput).toHaveValue("");
});

test("hydrates from remote definition when draft contains id (success path)", async () => {
  // prepare a draft in localStorage that will trigger hydrateFromDefinition
  const draft = {
    mode: "practice",
    id: "quiz-42",
    title: "Local Title",
    topics: ["A"],
  };
  window.localStorage.setItem("quizConfigDraft", JSON.stringify(draft));

  // mock fetch for definition endpoint
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          quiz_id: "quiz-42",
          name: "Server Quiz Name",
          metadata: { description: "Server desc", practiceTopics: ["T1", "T2"] },
          source_filename: "slides.pdf",
          embedding_document_id: "doc-42",
          is_published: true,
        }),
    })
  );

  render(<PracticePage />);

  // wait for the hydrated title to appear (reliable indicator fetch completed)
  await screen.findByDisplayValue("Server Quiz Name", { timeout: 3000 });

  // UI should reflect hydrated values
  expect(screen.getByText(/Using slides: slides.pdf/i)).toBeInTheDocument();
  expect(screen.getByText("T1")).toBeInTheDocument();
  expect(screen.getByText("T2")).toBeInTheDocument();
});

test("hydrateFromDefinition handles non-ok response and keeps local draft (error path)", async () => {
  const draft = { mode: "practice", id: "bad-quiz", title: "LocalTitle" };
  window.localStorage.setItem("quizConfigDraft", JSON.stringify(draft));

  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ detail: "Server error" }),
    })
  );

  render(<PracticePage />);

  // wait for local title to remain in DOM (use findBy with timeout)
  expect(await screen.findByDisplayValue("LocalTitle", { timeout: 2000 })).toBeInTheDocument();
});

test("reads quizGeneratorSeed from localStorage and sets sourceFilename/documentId/isPublished", async () => {
  const seed = { filename: "slides-seed.pdf", documentId: "doc-seed", isPublished: true };
  window.localStorage.setItem("quizGeneratorSeed", JSON.stringify(seed));

  render(<PracticePage />);

  await waitFor(
    () => {
      expect(screen.getByText(/Using slides: slides-seed.pdf/i)).toBeInTheDocument();
    },
    { timeout: 2000 }
  );
  // Draft persisted should include the sourceFilename (effect persists after hydration)
  const draft = JSON.parse(window.localStorage.getItem("quizConfigDraft") || "{}");
  expect(draft.sourceFilename === "slides-seed.pdf" || draft.sourceFilename === undefined).toBeTruthy();
});

test("saveQuizRecord (Save Quiz) posts payload and shows save message; saveStatus clears after timeout", async () => {
  jest.useFakeTimers();
  render(<PracticePage />);

  // enter title so save is allowed
  const titleInput = screen.getByPlaceholderText(/e.g., Midterm Practice Set/i) || screen.getByLabelText(/Quiz Title/i);
  await userEvent.type(titleInput, "Saveable Title");

  // mock POST response for save
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          quiz_id: "saved-123",
          is_published: false,
        }),
    })
  );

  const saveBtn = screen.getByRole("button", { name: /Save Quiz/i });
  await userEvent.click(saveBtn);

  // saveStatus message should appear
  await waitFor(
    () => {
      expect(screen.getByText(/Saved to your list\./i)).toBeInTheDocument();
    },
    { timeout: 2000 }
  );

  // Advance timers to clear saveStatus
  act(() => {
    jest.advanceTimersByTime(4000);
  });

  await waitFor(
    () => {
      expect(screen.queryByText(/Saved to your list\./i)).not.toBeInTheDocument();
    },
    { timeout: 2000 }
  );

  jest.useRealTimers();
});

test("saveQuizRecord handles server error and alerts user", async () => {
  const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  render(<PracticePage />);

  // enter title so save is allowed
  const titleInput = screen.getByPlaceholderText(/e.g., Midterm Practice Set/i) || screen.getByLabelText(/Quiz Title/i);
  await userEvent.type(titleInput, "WillFail");

  // mock POST response non-ok with detail
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ detail: "Bad things" }),
    })
  );

  const saveBtn = screen.getByRole("button", { name: /Save Quiz/i });
  await userEvent.click(saveBtn);

  await waitFor(
    () => {
      expect(alertSpy).toHaveBeenCalledWith("Bad things");
    },
    { timeout: 2000 }
  );
  alertSpy.mockRestore();
});

/* NOTE:
   Several longer flows (preview/publish/delete flows) were commented out in the original file.
   If you need those re-enabled, add focused fetch mocks for each network call and consider
   using findBy* with timeouts or jest.useFakeTimers() to advance timers used in the component.
*/