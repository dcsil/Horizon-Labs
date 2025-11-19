/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// mock Poppins font and next/navigation BEFORE importing the component
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock ConditionalHeader to keep test output simple
jest.mock("../../components/ConditionalHeader", () => () => <div data-testid="cond-header" />);

// Import the component under test
import QuizScorePage from "./score.jsx";

beforeEach(() => {
  cleanup();
  mockPush.mockClear();
  window.localStorage.clear();

  // safe default fetch so unexpected calls don't hang tests
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(""),
    })
  );
});

afterEach(() => {
  jest.restoreAllMocks();
  cleanup();
});

test("shows loading then computes score from preview questions/responses and shows UI", async () => {
  // three questions, two correct -> rounded percentage 67
  window.localStorage.setItem("quizPreviewQuestions", JSON.stringify([1, 2, 3]));
  window.localStorage.setItem(
    "quizPreviewResponses",
    JSON.stringify([{ isCorrect: true }, { isCorrect: true }, { isCorrect: false }])
  );

  render(<QuizScorePage />);

  // loading text appears first
  expect(screen.getByText(/Calculating results\.\.\./i)).toBeInTheDocument();

  // after effect runs we expect percentage and counts
  await waitFor(() => {
    expect(screen.getByText(/67%/)).toBeInTheDocument();
    expect(screen.getByText(/2\/3 questions/i)).toBeInTheDocument();
  });

  // When no quizId present, Publish button is disabled and a helper message is shown
  const publishBtn = screen.getByRole("button", { name: /Publish Quiz/i });
  expect(publishBtn).toBeDisabled();
  expect(screen.getByText(/Save this quiz first to enable publishing\./i)).toBeInTheDocument();
});

test("Edit Quiz button navigates to QuizGenerator when clicked", async () => {
  // provide quizPreviewData with quizId so handleEditQuiz behaves normally
  window.localStorage.setItem("quizPreviewData", JSON.stringify({ quizId: "q-123", isPublished: false }));

  render(<QuizScorePage />);

  // wait for UI to finish loading
  await waitFor(() => expect(screen.queryByText(/Calculating results\.\.\./i)).not.toBeInTheDocument());

  const editBtn = screen.getByRole("button", { name: /Edit Quiz/i });
  await userEvent.click(editBtn);
  expect(mockPush).toHaveBeenCalledWith("/Instructor/QuizGenerator");
});

test("fetches publish state when preview meta lacks isPublished and updates button text", async () => {
  // preview meta without isPublished => effect will fetch publish state
  window.localStorage.setItem("quizPreviewData", JSON.stringify({ id: "qid-1", title: "T" }));

  // mock GET to return is_published true
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ quiz_id: "qid-1", is_published: true }),
    })
  );

  render(<QuizScorePage />);

  // wait for fetch and updated button text
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /Unpublish Quiz/i })).toBeInTheDocument();
  });
});

test("publish action toggles publish state: GET definition then POST update (success path)", async () => {
  // seed preview with explicit isPublished false so effect won't fetch publish state
  window.localStorage.setItem("quizPreviewData", JSON.stringify({ quizId: "qid-2", isPublished: false }));

  // first fetch (GET definition) -> return definition body
  global.fetch
    .mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            quiz_id: "qid-2",
            name: "My Quiz",
            topics: ["A"],
            default_mode: "practice",
            initial_difficulty: "medium",
            embedding_document_id: "doc-1",
            source_filename: "slides.pdf",
            metadata: {},
          }),
      })
    )
    // second fetch (POST to update) -> return updated publish state
    .mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ is_published: true }),
      })
    );

  render(<QuizScorePage />);

  await waitFor(() => expect(screen.getByRole("button", { name: /Publish Quiz/i })).toBeEnabled());

  const publishBtn = screen.getByRole("button", { name: /Publish Quiz/i });
  await userEvent.click(publishBtn);

  // wait for success notice and updated button text
  await waitFor(() => {
    expect(screen.getByText(/Quiz published\. Learners can now access it\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unpublish Quiz/i })).toBeInTheDocument();
  });

  // localStorage preview meta should be updated with isPublished true
  const stored = JSON.parse(window.localStorage.getItem("quizPreviewData") || "{}");
  expect(stored.isPublished).toBe(true);
});

test("publish action surfaces 404 from definition GET as save-prior-to-publish error", async () => {
  window.localStorage.setItem("quizPreviewData", JSON.stringify({ quizId: "missing-quiz", isPublished: false }));

  // GET returns 404
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    })
  );

  render(<QuizScorePage />);

  const publishBtn = screen.getByRole("button", { name: /Publish Quiz/i });
  await userEvent.click(publishBtn);

  // show error notice
  await waitFor(() => {
    expect(screen.getByText(/Save this quiz before publishing\./i)).toBeInTheDocument();
  });
});

test("safeParse gracefully handles invalid JSON in localStorage without crashing", async () => {
  // put invalid JSON strings into storage
  window.localStorage.setItem("quizPreviewQuestions", "not-json");
  window.localStorage.setItem("quizPreviewResponses", "also-not-json");
  window.localStorage.setItem("quizPreviewData", "bad-json");

  render(<QuizScorePage />);

  // component should finish loading and show 0% and 0/0 questions
  await waitFor(() => {
    expect(screen.getByText(/0%/)).toBeInTheDocument();
    expect(screen.getByText(/0\/0 questions/i)).toBeInTheDocument();
  });
});