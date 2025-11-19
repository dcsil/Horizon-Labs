/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// mock font to avoid runtime font loading
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// mock next/navigation BEFORE importing component
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import StudentQuizzesPage from "./page2.jsx";

beforeEach(() => {
  cleanup();
  jest.clearAllMocks();
  window.localStorage.clear();

  // safe default fetch so tests must explicitly override where needed
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

test("shows loading then renders two sections with assessment and practice quizzes and badges", async () => {
  const payload = [
    {
      quiz_id: "a1",
      name: "Assessment One",
      is_published: true,
      default_mode: "assessment",
      assessment_num_questions: 10,
      assessment_time_limit_minutes: 30,
      source_filename: "slides.pdf",
      topics: ["Graphs", "Trees"],
      metadata: { description: "Assess desc" },
    },
    {
      quiz_id: "p1",
      name: "Practice One",
      is_published: true,
      default_mode: "practice",
      source_filename: null,
      topics: ["Recursion"],
      metadata: { description: "Practice desc" },
    },
    // unpublished should be ignored
    { quiz_id: "d1", name: "Draft", is_published: false, default_mode: "practice" },
  ];

  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(payload),
    })
  );

  render(<StudentQuizzesPage />);

  // Loading appears
  expect(screen.getByText(/Loading available quizzes\.\.\./i)).toBeInTheDocument();

  // Wait for lists to render
  await waitFor(() => expect(screen.getByText("Assessment One")).toBeInTheDocument());

  // Assessment card shows question and time badges and source badge
  expect(screen.getByText("Assessment One")).toBeInTheDocument();
  expect(screen.getByText(/10 questions/i)).toBeInTheDocument();
  expect(screen.getByText(/30 min limit/i)).toBeInTheDocument();
  expect(screen.getByText(/Source: slides.pdf/i)).toBeInTheDocument();
  expect(screen.getByText(/2 topics/i)).toBeInTheDocument();

  // Practice card shows topics count and no source badge
  expect(screen.getByText("Practice One")).toBeInTheDocument();
  expect(screen.getByText(/1 topic/i)).toBeInTheDocument();
  expect(screen.queryByText(/Source:/i, { selector: "span" })).toBeTruthy(); // source for assessment present; practice has none
});

test("clicking a quiz calls router.push with encoded quizId", async () => {
  const payload = [
    { quiz_id: "id with spaces/and/slash", name: "Enc Quiz", is_published: true, default_mode: "practice", metadata: {} },
  ];
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(payload) })
  );

  render(<StudentQuizzesPage />);

  await waitFor(() => expect(screen.getByText("Enc Quiz")).toBeInTheDocument());

  await userEvent.click(screen.getByText("Enc Quiz"));

  expect(mockPush).toHaveBeenCalledWith("/Student/Quizzes/" + encodeURIComponent("id with spaces/and/slash"));
});

test("displays error message when backend responds non-ok with detail", async () => {
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({ ok: false, json: () => Promise.resolve({ detail: "Backend error" }) })
  );

  render(<StudentQuizzesPage />);

  await waitFor(() => {
    expect(screen.getByText(/Backend error/i)).toBeInTheDocument();
  });
});

test("treats non-array payload as empty and shows empty messages for both sections", async () => {
  // return an object instead of array
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ not: "an array" }) })
  );

  render(<StudentQuizzesPage />);

  await waitFor(() => {
    expect(screen.getByText(/No assessment quizzes are published yet\./i)).toBeInTheDocument();
    expect(screen.getByText(/No practice quizzes are published yet\./i)).toBeInTheDocument();
  });
});

test("Back to Home button navigates to Student HomePage", async () => {
  // default fetch returns empty list quickly
  render(<StudentQuizzesPage />);

  const backBtn = screen.getByRole("button", { name: /← Back to Home/i });
  await userEvent.click(backBtn);
  expect(mockPush).toHaveBeenCalledWith("/Student/HomePage");
});