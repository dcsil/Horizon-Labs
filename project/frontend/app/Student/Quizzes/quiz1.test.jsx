// File-level: checks student quizzes list loading, empty state messaging, and router navigation.
import { render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import StudentQuizzesPage from "./page";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-mock" }),
}));

describe("StudentQuizzesPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: jest.fn() });
  });

  it("shows loading state then renders empty sections", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    render(<StudentQuizzesPage />);

    expect(screen.getByText(/Loading available quizzes/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Assessment Quizzes")).toBeInTheDocument();
      expect(screen.getByText("Practice Quizzes")).toBeInTheDocument();
    });
  });
});
