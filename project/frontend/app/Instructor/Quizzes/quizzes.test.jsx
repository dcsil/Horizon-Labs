// File-level: checks instructor quizzes list loading, empty states, and navigation to create/edit flows.
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { useRouter } from "next/navigation";
import InstructorQuizzesPage from "./page";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-mock" }),
}));

describe("InstructorQuizzesPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: jest.fn() });
    global.fetch = jest.fn();
    localStorage.clear();
  });

  it("renders the quizzes heading", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    render(<InstructorQuizzesPage />);

    await waitFor(() => {
      expect(screen.getByText("My Quizzes")).toBeInTheDocument();
    });
  });

  it("shows an error when the API call fails", async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ detail: "nope" }),
    });

    render(<InstructorQuizzesPage />);

    await screen.findByText("nope");
  });

  it("opens an assessment quiz and stores draft in localStorage", async () => {
    const push = jest.fn();
    useRouter.mockReturnValue({ push });
    const quiz = {
      quiz_id: "q1",
      name: "Assessment Quiz",
      default_mode: "assessment",
      metadata: {
        description: "desc",
        numberOfAttempts: "2",
        numberOfQuestions: "5",
        timeLimitLabel: "30 minutes",
        difficultyLabel: "hard",
        topicsToTest: ["Math", "Science"],
      },
      topics: ["Math"],
      is_published: true,
      assessment_max_attempts: 3,
      assessment_num_questions: 10,
      assessment_time_limit_minutes: 25,
      initial_difficulty: "medium",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    };
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([quiz]),
    });

    render(<InstructorQuizzesPage />);
    await screen.findByText("Assessment Quiz");
    fireEvent.click(screen.getByText("Assessment Quiz"));

    const stored = JSON.parse(localStorage.getItem("quizConfigDraft"));
    expect(stored.mode).toBe("assessment");
    expect(stored.id).toBe("q1");
    expect(push).toHaveBeenCalledWith("/Instructor/Assessment");
  });

  it("opens a practice quiz and stores draft in localStorage", async () => {
    const push = jest.fn();
    useRouter.mockReturnValue({ push });
    const quiz = {
      quiz_id: "q2",
      name: "Practice Quiz",
      default_mode: "practice",
      metadata: { practiceTopics: ["Topic A"] },
      topics: ["Topic B"],
      is_published: false,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    };
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([quiz]),
    });

    render(<InstructorQuizzesPage />);
    await screen.findByText("Practice Quiz");
    fireEvent.click(screen.getByText("Practice Quiz"));

    const stored = JSON.parse(localStorage.getItem("quizConfigDraft"));
    expect(stored.mode).toBe("practice");
    expect(stored.title).toBe("Practice Quiz");
    expect(push).toHaveBeenCalledWith("/Instructor/Practice");
  });

  it("clears draft state when creating a new quiz", async () => {
    const push = jest.fn();
    useRouter.mockReturnValue({ push });
    localStorage.setItem("quizConfigDraft", JSON.stringify({ hello: "world" }));
    localStorage.setItem("quizPreviewData", "x");

    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    render(<InstructorQuizzesPage />);
    await screen.findByText("My Quizzes");

    fireEvent.click(screen.getByRole("button", { name: "+ Create a Quiz" }));
    expect(localStorage.getItem("quizConfigDraft")).toBeNull();
    expect(localStorage.getItem("quizPreviewData")).toBeNull();
    expect(push).toHaveBeenCalledWith("/Instructor/QuizGenerator");
  });
});
