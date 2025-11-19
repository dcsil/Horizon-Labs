/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// mock Poppins font to avoid runtime font logic
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// Provide controllable implementations for useParams/useRouter
const mockPush = jest.fn();
let mockParams = {};
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => mockParams,
}));

import StudentQuizDetailsPage from "./quizid.jsx";

beforeEach(() => {
  cleanup();
  jest.clearAllMocks();
  mockParams = {};
  window.localStorage.clear();

  // default fetch harmless implementation — individual tests override as needed
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(null),
    })
  );
});

afterEach(() => {
  jest.restoreAllMocks();
  cleanup();
});

test("shows missing quiz identifier view and Back to Quizzes navigates", async () => {
  // no quizId -> should show missing identifier UI
  mockParams = {};
  render(<StudentQuizDetailsPage />);

  expect(screen.getByText(/Missing quiz identifier\./i)).toBeInTheDocument();
  const backBtn = screen.getByRole("button", { name: /Back to Quizzes/i });
  await userEvent.click(backBtn);
  expect(mockPush).toHaveBeenCalledWith("/Student/Quizzes");
});

test("loads quiz details and renders info rows, topics and Start New Attempt", async () => {
  mockParams = { quizId: "quiz-123" };

  const quizPayload = {
    quiz_id: "quiz-123",
    name: "Calculus Quiz",
    default_mode: "assessment",
    metadata: { description: "Test your calculus skills" },
    source_filename: "calc-slides.pdf",
    assessment_num_questions: 20,
    assessment_time_limit_minutes: 45,
    topics: ["Derivatives", "Integrals"],
  };

  global.fetch = jest.fn((url) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(quizPayload),
    })
  );

  render(<StudentQuizDetailsPage />);

  // Loading indicator should show then be replaced
  expect(screen.getByText(/Loading quiz details\.\.\./i)).toBeInTheDocument();

  await waitFor(() => expect(screen.queryByText(/Loading quiz details\.\.\./i)).not.toBeInTheDocument());

  // Title and description
  expect(screen.getByRole("heading", { name: /Calculus Quiz/i })).toBeInTheDocument();
  expect(screen.getByText(/Test your calculus skills/i)).toBeInTheDocument();

  // Info rows
  expect(screen.getByText(/Source Material/i)).toBeInTheDocument();
  expect(screen.getByText(/calc-slides.pdf/i)).toBeInTheDocument();
  expect(screen.getByText(/Questions/i)).toBeInTheDocument();
  expect(screen.getByText(/20/i)).toBeInTheDocument();
  expect(screen.getByText(/Time Limit/i)).toBeInTheDocument();
  expect(screen.getByText(/45 minutes/i)).toBeInTheDocument();

  // Topics rendered
  expect(screen.getByText("Derivatives")).toBeInTheDocument();
  expect(screen.getByText("Integrals")).toBeInTheDocument();

  // Start New Attempt button exists
  expect(screen.getByRole("button", { name: /Start New Attempt/i })).toBeInTheDocument();

  // Back to Quizzes link in header works
  const headerBack = screen.getByRole("button", { name: /← Back to Quizzes/i });
  await userEvent.click(headerBack);
  expect(mockPush).toHaveBeenCalledWith("/Student/Quizzes");
});

test("handles response ok but payload null -> shows not found message and Back to Quizzes navigates", async () => {
  mockParams = { quizId: "quiz-null" };

  // fetch resolves ok but returns null JSON
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(null),
    })
  );

  render(<StudentQuizDetailsPage />);

  // wait for loading to finish and then assert 'not found' message
  await waitFor(() => expect(screen.getByText(/This quiz could not be found or is no longer available\./i)).toBeInTheDocument());

  const backBtn = screen.getByRole("button", { name: /Back to Quizzes/i });
  await userEvent.click(backBtn);
  expect(mockPush).toHaveBeenCalledWith("/Student/Quizzes");
});

test("displays error when fetch returns non-ok with detail", async () => {
  mockParams = { quizId: "quiz-missing" };

  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ detail: "Not found" }),
    })
  );

  render(<StudentQuizDetailsPage />);

  // wait for error to be displayed
  await waitFor(() => {
    expect(screen.getByText(/Not found/i)).toBeInTheDocument();
  });
});

test("accepts quizId as array and uses first element", async () => {
  mockParams = { quizId: ["arr-id", "ignored"] };

  const quizPayload = {
    quiz_id: "arr-id",
    name: "Array ID Quiz",
    default_mode: "practice",
    metadata: {},
    source_filename: null,
    topics: [],
  };

  global.fetch = jest.fn((url) =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(quizPayload),
    })
  );

  render(<StudentQuizDetailsPage />);

  await waitFor(() => expect(screen.getByText(/Array ID Quiz/i)).toBeInTheDocument());

  // Shows fallback description for practice mode when none provided
  expect(screen.getByText(/Your instructor will share more details before the quiz is enabled\./i)).toBeInTheDocument();

  // Source Material displays "—" when none
  expect(screen.getByText(/Source Material/i)).toBeInTheDocument();
  expect(screen.getByText("—")).toBeInTheDocument();

  // Topics fallback message
  expect(screen.getByText(/General knowledge check\./i)).toBeInTheDocument();
});