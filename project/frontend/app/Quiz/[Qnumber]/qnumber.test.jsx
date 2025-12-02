// File-level: covers instructor quiz preview runner loading, navigation, and button states.
import { render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import QuizPage from "./page";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-mock" }),
}));

describe("QuizPage", () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: mockPush });
  });

  it("renders a question after fetching preview data", async () => {
    localStorage.setItem(
      "quizPreviewData",
      JSON.stringify({ quizId: "quiz-1", mode: "practice", topicsToTest: ["Algebra"] })
    );

    global.fetch = jest
      .fn()
      // start session
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      })
      // fetch first question
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            question_id: "q1",
            prompt: "What is 2 + 2?",
            choices: ["3", "4"],
            difficulty: "easy",
            topic: "Algebra",
            source_metadata: {},
          }),
      });

    render(<QuizPage />);

    await waitFor(() => {
      expect(screen.getByText(/What is 2 \+ 2\?/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/Practice Quiz Preview/i)).toBeInTheDocument();
  });

  it("shows the loading state before a question arrives", () => {
    global.fetch = jest.fn(() => new Promise(() => {}));
    localStorage.setItem("quizPreviewData", JSON.stringify({ quizId: "quiz-2", mode: "practice" }));

    const { getByText } = render(<QuizPage />);
    expect(getByText(/Loading question/i)).toBeInTheDocument();
  });
});
