/**
 * @jest-environment jsdom
 */
// ...existing code...

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// mock next/font/google to avoid runtime font logic
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// mock next/navigation router
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import Assessment from "./assessment.jsx";

beforeEach(() => {
  jest.restoreAllMocks();
  mockPush.mockClear();
  window.localStorage.clear();
  global.fetch = jest.fn();
});

test("renders header, description and 'No slide deck attached yet.' when no sourceFilename", () => {
  render(<Assessment />);
  expect(screen.getByRole("heading", { name: /Assessment Mode/i })).toBeInTheDocument();
  expect(screen.getByText(/Quizzes will simulate real tests\/exams with time limits\./i)).toBeInTheDocument();
  expect(screen.getByText(/No slide deck attached yet\./i)).toBeInTheDocument();
});

test("typing into title and other fields persists draft to localStorage", async () => {
  render(<Assessment />);

  const titleInput = screen.getByLabelText(/Quiz Title/i);
  const attemptsInput = screen.getByLabelText(/Number of Attempts/i);
  const questionsInput = screen.getByLabelText(/Number of Questions/i);
  const timeLimitInput = screen.getByLabelText(/Time Limit/i);
  const difficultySelect = screen.getByLabelText(/Difficulty/i);

  await userEvent.type(titleInput, "New Assessment Title");
  await userEvent.type(attemptsInput, "2");
  await userEvent.type(questionsInput, "10");
  await userEvent.type(timeLimitInput, "30");
  await userEvent.selectOptions(difficultySelect, "medium");

  await waitFor(() => {
    const raw = window.localStorage.getItem("quizConfigDraft");
    expect(raw).not.toBeNull();
    const draft = JSON.parse(raw);
    expect(draft.title).toBe("New Assessment Title");
    expect(draft.configuration.numberOfAttempts).toBe("2");
    expect(draft.configuration.numberOfQuestions).toBe("10");
    expect(draft.configuration.timeLimit).toBe("30");
    expect(draft.configuration.difficulty).toBe("medium");
  });
});

test("adding a topic via input and Add topic button shows the topic in the list", async () => {
  render(<Assessment />);

  const topicInput = screen.getByPlaceholderText(/e.g., Binary Trees/i);
  const addBtn = screen.getByRole("button", { name: /add topic/i });

  await userEvent.type(topicInput, "Graphs");
  await userEvent.click(addBtn);

  expect(await screen.findByText("Graphs")).toBeInTheDocument();

  // ensure topic input was cleared
  expect(topicInput).toHaveValue("");
});

test("hydrates from remote quiz definition when draft contains an id (fetch called and title updated)", async () => {
  // prepare localStorage draft that triggers hydrateFromDefinition
  const draft = {
    mode: "assessment",
    id: "quiz-123",
    title: "Local Draft Title",
    configuration: {},
  };
  window.localStorage.setItem("quizConfigDraft", JSON.stringify(draft));

  // mock fetch to return definition payload
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          quiz_id: "quiz-123",
          name: "Server Quiz Name",
          metadata: {
            description: "Server description",
            numberOfAttempts: "3",
            numberOfQuestions: "5",
            timeLimitLabel: "45 min",
            difficultyLabel: "Hard",
            topicsToTest: ["Topic A", "Topic B"],
          },
          source_filename: "slides.pdf",
          embedding_document_id: "doc-999",
          is_published: true,
        }),
    })
  );

  render(<Assessment />);

  // wait for the fetch to be consumed and UI to update with server name
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());

  // title input should reflect server-provided name after hydration
  const titleInput = await screen.findByDisplayValue("Server Quiz Name");
  expect(titleInput).toBeInTheDocument();

  // source filename should be shown in header
  expect(screen.getByText(/Using slides: slides.pdf/i)).toBeInTheDocument();

  // topics rendered from metadata
  expect(screen.getByText("Topic A")).toBeInTheDocument();
  expect(screen.getByText("Topic B")).toBeInTheDocument();
});

// ...existing code...

// New tests to cover error-hydration, seed-reading, back navigation, and duplicate-topic prevention
test("hydrateFromDefinition handles non-ok responses without throwing (keeps local draft values)", async () => {
  // Prepare draft that will trigger hydrateFromDefinition
  const draft = {
    mode: "assessment",
    id: "quiz-404",
    title: "Local Draft Title",
    configuration: {},
  };
  window.localStorage.setItem("quizConfigDraft", JSON.stringify(draft));

  // Mock the fetch for the definition endpoint to return non-ok
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ detail: "Server error" }),
    })
  );

  render(<Assessment />);

  // Wait for the component to call fetch (hydration attempt)
  await waitFor(() => expect(global.fetch).toHaveBeenCalled(), { timeout: 2000 });

  // The title input should remain the local draft title (hydration failed but no crash)
  const titleInput = await screen.findByDisplayValue("Local Draft Title");
  expect(titleInput).toBeInTheDocument();
});

test("reads quizGeneratorSeed from localStorage and shows Using slides / Unpublish Quiz when seed indicates published", async () => {
  // pre-seed quizGeneratorSeed: UI effect should pick it up
  const seed = { filename: "slides-seed.pdf", documentId: "doc-seed", isPublished: true };
  window.localStorage.setItem("quizGeneratorSeed", JSON.stringify(seed));

  render(<Assessment />);

  // wait for effect to propagate and UI to update
  await waitFor(() => {
    expect(screen.getByText(/Using slides: slides-seed.pdf/i)).toBeInTheDocument();
  }, { timeout: 2000 });

  // publish button should reflect published state
  expect(screen.getByText("Unpublish Quiz")).toBeInTheDocument();
});

test("clicking '← Back to Quiz List' calls router.push to /Instructor/Quizzes", async () => {
  render(<Assessment />);

  const backBtn = screen.getByRole("button", { name: /← Back to Quiz List/i });
  expect(backBtn).toBeTruthy();

  await userEvent.click(backBtn);

  expect(mockPush).toHaveBeenCalledWith("/Instructor/Quizzes");
});

test("adding a topic prevents duplicates and trims whitespace", async () => {
  render(<Assessment />);

  const topicInput = screen.getByPlaceholderText(/e.g., Binary Trees/i);
  const addBtn = screen.getByRole("button", { name: /add topic/i });

  // Add first topic
  await userEvent.type(topicInput, "Graphs");
  await userEvent.click(addBtn);
  expect(await screen.findByText("Graphs")).toBeInTheDocument();

  // Try to add duplicate with trailing space
  await userEvent.type(topicInput, "Graphs ");
  await userEvent.click(addBtn);

  // Only one "Graphs" list item should exist
  const occurrences = screen.getAllByText("Graphs");
  expect(occurrences.length).toBe(1);

  // Ensure input was cleared after each add
  expect(topicInput).toHaveValue("");
});