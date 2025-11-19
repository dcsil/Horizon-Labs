/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the Poppins font to avoid runtime font logic
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// mock next/navigation BEFORE importing the component
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import MyQuizPage from "./myquiz.jsx";

beforeEach(() => {
  cleanup();
  mockPush.mockClear();
  window.localStorage.clear();

  // default fetch to avoid unexpected network hangs; tests override as needed
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    })
  );
});

afterEach(() => {
  jest.restoreAllMocks();
  cleanup();
});

test("shows loading then empty-state when no quizzes", async () => {
  // fetch returns empty list (default)
  render(<MyQuizPage />);

  // initial loading indicator
  expect(screen.getByText(/Loading quizzes\.\.\./i)).toBeInTheDocument();

  // wait for empty-state text
  await waitFor(() => {
    expect(
      screen.getByText(/Quizzes you create and hand out by the instructor will appear here/i)
    ).toBeInTheDocument();
  });
});

test("Create a Quiz button navigates to QuizGenerator", async () => {
  render(<MyQuizPage />);

  await waitFor(() => screen.getByText(/Quizzes you create and hand out/i));
  const createBtn = screen.getByRole("button", { name: /\+ Create a Quiz/i });
  await userEvent.click(createBtn);

  expect(mockPush).toHaveBeenCalledWith("/Instructor/QuizGenerator");
});

test("displays error message when fetch returns non-ok with detail", async () => {
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ detail: "Service unavailable" }),
    })
  );

  render(<MyQuizPage />);

  // wait for error to be displayed
  await waitFor(() => {
    expect(screen.getByText(/Service unavailable/i)).toBeInTheDocument();
  });
});

test("handles fetch throwing and shows fallback error message", async () => {
  global.fetch.mockImplementationOnce(() => Promise.reject(new Error("network fail")));

  render(<MyQuizPage />);

  await waitFor(() => {
    expect(screen.getByText(/Unable to load quizzes\./i)).toBeInTheDocument();
  });
});

test("renders a list of quizzes and clicking one opens the quiz", async () => {
  const quiz = {
    quiz_id: "q-1",
    title: "Sample Quiz",
    description: "One two three",
    totalQuestions: 7,
    mode: "practice",
    createdAt: new Date("2025-01-02T00:00:00.000Z").toISOString(),
  };

  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve([quiz]),
    })
  );

  render(<MyQuizPage />);

  // wait for quiz entry to appear
  await waitFor(() => expect(screen.getByText("Sample Quiz")).toBeInTheDocument());

  // metadata present
  expect(screen.getByText(/Questions: 7/i)).toBeInTheDocument();
  expect(screen.getByText(/Mode: practice/i)).toBeInTheDocument();
  // created date should render (locale-specific) — assert that year appears
  expect(screen.getByText(/2025/)).toBeInTheDocument();

  // clicking the quiz should call router.push to open quiz (component uses static /Quiz/1)
  await userEvent.click(screen.getByText("Sample Quiz"));
  expect(mockPush).toHaveBeenCalledWith("/Quiz/1");
});

test("handles non-array response by treating as empty list", async () => {
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ not: "an array" }),
    })
  );

  render(<MyQuizPage />);

  await waitFor(() => {
    expect(
      screen.getByText(/Quizzes you create and hand out by the instructor will appear here/i)
    ).toBeInTheDocument();
  });
});