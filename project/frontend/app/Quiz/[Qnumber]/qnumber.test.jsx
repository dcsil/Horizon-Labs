/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the Poppins font to avoid runtime font loading/runtime differences
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// Mock next/navigation router BEFORE importing component
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import QuizPage from "./qnumber.jsx";

beforeEach(() => {
  jest.clearAllMocks();
  cleanup();

  // ensure fetch exists and resolves by default (prevents hanging requests)
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(""),
    })
  );

  // clear storage between tests
  window.localStorage.clear();

  // provide stable crypto.randomUUID if needed
  if (!global.crypto) global.crypto = {};
  global.crypto.randomUUID = global.crypto.randomUUID || (() => "mock-uuid-1");
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("loads initial question, allows selecting an option and submitting shows feedback", async () => {
  // Provide preview metadata so createPreviewSession will be able to start
  window.localStorage.setItem(
    "quizPreviewData",
    JSON.stringify({ id: "quiz-1", mode: "practice", title: "Test Quiz" })
  );

  // Sequence of fetches:
  // 1) POST /quiz/session/start  -> ok
  // 2) GET /quiz/session/{id}/next -> returns a question payload
  // 3) POST /quiz/session/{id}/answer -> returns submission result
  const questionPayload = {
    question_id: "q1",
    prompt: "What is 2+2?",
    choices: ["3", "4", "5"],
    topic: "Math",
    difficulty: "easy",
    source_metadata: { slide_number: 1, slide_title: "Addition" },
  };

  const answerResponse = {
    is_correct: true,
    correct_answer: "4",
    selected_answer: "4",
    correct_rationale: "2+2 equals 4.",
  };

  // override fetch for the three calls in sequence
  global.fetch
    .mockImplementationOnce(() =>
      // start session
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      })
    )
    .mockImplementationOnce(() =>
      // next question
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(questionPayload),
      })
    )
    .mockImplementationOnce(() =>
      // submit answer
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(answerResponse),
      })
    );

  render(<QuizPage />);

  // wait for the question prompt to appear
  await waitFor(() => expect(screen.getByText(/What is 2\+2\?/i)).toBeInTheDocument(), {
    timeout: 3000,
  });

  // options should render
  expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.getByText("4")).toBeInTheDocument();
  expect(screen.getByText("5")).toBeInTheDocument();

  // submit button exists but disabled until selection
  const submitBtn = screen.getByRole("button", { name: /submit answer/i });
  expect(submitBtn).toBeDisabled();

  // select the correct option
  const optionButton = screen.getByText("4").closest("button");
  await userEvent.click(optionButton);

  // now submit enabled
  expect(submitBtn).toBeEnabled();

  // click submit
  await userEvent.click(submitBtn);

  // after submit we should see feedback (Correct — nice work! or the correct answer)
  await waitFor(
    () => {
      expect(screen.getByText(/Correct — nice work!/i) || screen.getByText(/Correct answer/i)).toBeTruthy();
    },
    { timeout: 3000 }
  );
});

test("shows rate-limit notice when server returns 429 for next question", async () => {
  // Provide preview metadata so createPreviewSession will be able to start
  window.localStorage.setItem(
    "quizPreviewData",
    JSON.stringify({ id: "quiz-2", mode: "practice", title: "RateLimit Quiz" })
  );

  // start session OK, next returns 429
  global.fetch
    .mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      })
    )
    .mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ detail: "Rate limit exceeded" }),
      })
    );

  render(<QuizPage />);

  // rate limit notice text set in component; wait for it to appear
  await waitFor(
    () => {
      expect(
        screen.getByText(/We're hitting a temporary content generation limit/i) ||
          screen.getByText(/Please try again soon/i)
      ).toBeTruthy();
    },
    { timeout: 3000 }
  );
});

test("Back to Configuration saves draft and navigates to practice config", async () => {
  // Provide preview metadata with practice mode and title so handleReturnToConfig writes draft
  window.localStorage.setItem(
    "quizPreviewData",
    JSON.stringify({ id: "quiz-3", mode: "practice", title: "Save Title", topicsToTest: ["A"] })
  );

  // ensure a seed is present so code can pick filename/documentId if needed
  window.localStorage.setItem("quizGeneratorSeed", JSON.stringify({ filename: "slides.pdf", documentId: "doc-1" }));

  // Make sure any fetches invoked during mount resolve
  global.fetch.mockImplementation(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(""),
    })
  );

  render(<QuizPage />);

  // "Back to Configuration" button should be present (component renders it when no question or error)
  const backBtn = screen.getByRole("button", { name: /back to configuration/i }) || screen.getByText(/Back to Configuration/i);
  expect(backBtn).toBeTruthy();

  // Click it
  await userEvent.click(backBtn);

  // wait for router.push to be called with practice path
  await waitFor(() => {
    expect(mockPush).toHaveBeenCalledWith("/Instructor/Practice");
  });

  // validate that a draft was written to localStorage
  const draftRaw = window.localStorage.getItem("quizConfigDraft");
  expect(draftRaw).not.toBeNull();
  const draft = JSON.parse(draftRaw);
  expect(draft.mode).toBe("practice");
  expect(draft.title).toBe("Save Title");
  // sourceFilename should have been set from the seed
  expect(draft.sourceFilename).toBe("slides.pdf");
});