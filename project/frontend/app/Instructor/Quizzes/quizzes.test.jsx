/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// mock next/font/google to avoid runtime font logic
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// mock next/navigation BEFORE importing the component
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import InstructorQuizzesPage from "./quizzes.jsx";

beforeEach(() => {
  cleanup();
  mockPush.mockClear();
  window.localStorage.clear();

  // default fetch to avoid unexpected network hangs; individual tests override
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

test("shows loading then error when fetch returns non-ok", async () => {
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ detail: "Backend down" }),
    })
  );

  render(<InstructorQuizzesPage />);

  // loading shown initially
  expect(screen.getByText(/Loading quizzes/i)).toBeInTheDocument();

  // wait for error message
  await waitFor(() => {
    expect(screen.getByText(/Backend down/i)).toBeInTheDocument();
  });
});

test("shows empty-state when no quizzes and Create a Quiz navigates", async () => {
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    })
  );

  render(<InstructorQuizzesPage />);

  // wait for empty state copy
  await waitFor(() => {
    expect(screen.getByText(/Quizzes you create will appear here/i)).toBeInTheDocument();
  });

  const createBtn = screen.getByRole("button", { name: /\+ Create a Quiz/i });
  expect(createBtn).toBeInTheDocument();

  await userEvent.click(createBtn);
  expect(mockPush).toHaveBeenCalledWith("/Instructor/QuizGenerator");
});

test("renders a list of quizzes and opens an assessment draft when clicked", async () => {
  const assessmentQuiz = {
    quiz_id: "a1",
    name: "Assessment One",
    default_mode: "assessment",
    is_published: true,
    metadata: {
      description: "Assess desc",
      numberOfAttempts: "4",
      numberOfQuestions: "10",
      timeLimitLabel: "30 min",
      difficultyLabel: "Hard",
      topicsToTest: ["Graphs", "Trees"],
    },
    topics: ["Graphs"],
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    assessment_max_attempts: 2,
    assessment_num_questions: 5,
    assessment_time_limit_minutes: 60,
    initial_difficulty: "medium",
  };

  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve([assessmentQuiz]),
    })
  );

  render(<InstructorQuizzesPage />);

  // wait for quiz card to render
  await waitFor(() => expect(screen.getByText("Assessment One")).toBeInTheDocument());

  // Ensure metadata is displayed
  expect(screen.getByText(/Mode: assessment/i)).toBeInTheDocument();
  expect(screen.getByText(/Topics:/i)).toBeInTheDocument();
  expect(screen.getByText(/Status: Published/i)).toBeInTheDocument();

  // Click the quiz to open it -> should write draft and navigate to Assessment
  await userEvent.click(screen.getByText("Assessment One"));

  const raw = window.localStorage.getItem("quizConfigDraft");
  expect(raw).not.toBeNull();
  const draft = JSON.parse(raw);
  expect(draft.mode).toBe("assessment");
  // metadata.numberOfAttempts (string) should be used per logic
  expect(draft.configuration.numberOfAttempts).toBe("4");
  expect(draft.configuration.numberOfQuestions).toBe("10");
  expect(draft.configuration.difficulty).toBe("Hard");

  expect(mockPush).toHaveBeenCalledWith("/Instructor/Assessment");
});

test("opens a practice draft when quiz default_mode is practice and falls back fields", async () => {
  const practiceQuiz = {
    quiz_id: "p1",
    // name intentionally omitted to test fallback "Untitled quiz" display
    default_mode: "practice",
    is_published: false,
    metadata: {
      practiceTopics: ["A", "B"],
    },
    topics: ["X", "Y"],
    created_at: new Date().toISOString(),
  };

  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve([practiceQuiz]),
    })
  );

  render(<InstructorQuizzesPage />);

  // wait for fallback title to appear (component renders "Untitled quiz")
  await waitFor(() => expect(screen.getByText(/Untitled quiz/i)).toBeInTheDocument());

  // check Mode/Topics/Status
  expect(screen.getByText(/Mode: practice/i)).toBeInTheDocument();
  expect(screen.getByText(/Topics: A, B/i)).toBeInTheDocument();
  expect(screen.getByText(/Status: Draft/i)).toBeInTheDocument();

  // Click the quiz -> should save practice draft and navigate to Practice
  await userEvent.click(screen.getByText(/Untitled quiz/i));
  const raw = window.localStorage.getItem("quizConfigDraft");
  expect(raw).not.toBeNull();
  const draft = JSON.parse(raw);
  expect(draft.mode).toBe("practice");
  expect(Array.isArray(draft.topics)).toBeTruthy();
  expect(mockPush).toHaveBeenCalledWith("/Instructor/Practice");
});
```// filepath: c:\Users\vivia\csc491\Horizon-Labs\project\frontend\app\Instructor\Quizzes\quizzes.test.jsx
/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// mock next/font/google to avoid runtime font logic
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// mock next/navigation BEFORE importing the component
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import InstructorQuizzesPage from "./quizzes.jsx";

beforeEach(() => {
  cleanup();
  mockPush.mockClear();
  window.localStorage.clear();

  // default fetch to avoid unexpected network hangs; individual tests override
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

test("shows loading then error when fetch returns non-ok", async () => {
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ detail: "Backend down" }),
    })
  );

  render(<InstructorQuizzesPage />);

  // loading shown initially
  expect(screen.getByText(/Loading quizzes/i)).toBeInTheDocument();

  // wait for error message
  await waitFor(() => {
    expect(screen.getByText(/Backend down/i)).toBeInTheDocument();
  });
});

test("shows empty-state when no quizzes and Create a Quiz navigates", async () => {
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    })
  );

  render(<InstructorQuizzesPage />);

  // wait for empty state copy
  await waitFor(() => {
    expect(screen.getByText(/Quizzes you create will appear here/i)).toBeInTheDocument();
  });

  const createBtn = screen.getByRole("button", { name: /\+ Create a Quiz/i });
  expect(createBtn).toBeInTheDocument();

  await userEvent.click(createBtn);
  expect(mockPush).toHaveBeenCalledWith("/Instructor/QuizGenerator");
});

test("renders a list of quizzes and opens an assessment draft when clicked", async () => {
  const assessmentQuiz = {
    quiz_id: "a1",
    name: "Assessment One",
    default_mode: "assessment",
    is_published: true,
    metadata: {
      description: "Assess desc",
      numberOfAttempts: "4",
      numberOfQuestions: "10",
      timeLimitLabel: "30 min",
      difficultyLabel: "Hard",
      topicsToTest: ["Graphs", "Trees"],
    },
    topics: ["Graphs"],
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    assessment_max_attempts: 2,
    assessment_num_questions: 5,
    assessment_time_limit_minutes: 60,
    initial_difficulty: "medium",
  };

  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve([assessmentQuiz]),
    })
  );

  render(<InstructorQuizzesPage />);

  // wait for quiz card to render
  await waitFor(() => expect(screen.getByText("Assessment One")).toBeInTheDocument());

  // Ensure metadata is displayed
  expect(screen.getByText(/Mode: assessment/i)).toBeInTheDocument();
  expect(screen.getByText(/Topics:/i)).toBeInTheDocument();
  expect(screen.getByText(/Status: Published/i)).toBeInTheDocument();

  // Click the quiz to open it -> should write draft and navigate to Assessment
  await userEvent.click(screen.getByText("Assessment One"));

  const raw = window.localStorage.getItem("quizConfigDraft");
  expect(raw).not.toBeNull();
  const draft = JSON.parse(raw);
  expect(draft.mode).toBe("assessment");
  // metadata.numberOfAttempts (string) should be used per logic
  expect(draft.configuration.numberOfAttempts).toBe("4");
  expect(draft.configuration.numberOfQuestions).toBe("10");
  expect(draft.configuration.difficulty).toBe("Hard");

  expect(mockPush).toHaveBeenCalledWith("/Instructor/Assessment");
});

test("opens a practice draft when quiz default_mode is practice and falls back fields", async () => {
  const practiceQuiz = {
    quiz_id: "p1",
    // name intentionally omitted to test fallback "Untitled quiz" display
    default_mode: "practice",
    is_published: false,
    metadata: {
      practiceTopics: ["A", "B"],
    },
    topics: ["X", "Y"],
    created_at: new Date().toISOString(),
  };

  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve([practiceQuiz]),
    })
  );

  render(<InstructorQuizzesPage />);

  // wait for fallback title to appear (component renders "Untitled quiz")
  await waitFor(() => expect(screen.getByText(/Untitled quiz/i)).toBeInTheDocument());

  // check Mode/Topics/Status
  expect(screen.getByText(/Mode: practice/i)).toBeInTheDocument();
  expect(screen.getByText(/Topics: A, B/i)).toBeInTheDocument();
  expect(screen.getByText(/Status: Draft/i)).toBeInTheDocument();

  // Click the quiz -> should save practice draft and navigate to Practice
  await userEvent.click(screen.getByText(/Untitled quiz/i));
  const raw = window.localStorage.getItem("quizConfigDraft");
  expect(raw).not.toBeNull();
  const draft = JSON.parse(raw);
  expect(draft.mode).toBe("practice");
  expect(Array.isArray(draft.topics)).toBeTruthy();
  expect(mockPush).toHaveBeenCalledWith("/Instructor/Practice");
});