// File-level: checks assessment quiz builder renders required fields and navigation for instructors.
import { render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import QuizGenerator2Page from "./page";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-mock" }),
}));

describe("QuizGenerator2Page (Assessment)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: jest.fn() });
  });

  it("renders the assessment header", () => {
    render(<QuizGenerator2Page />);
    expect(screen.getByText("Assessment Mode")).toBeInTheDocument();
    expect(
      screen.getByText(/Quizzes will simulate real tests\/exams with time limits/i)
    ).toBeInTheDocument();
  });

  it("shows quiz detail inputs", () => {
    render(<QuizGenerator2Page />);
    expect(screen.getByLabelText(/Quiz Title/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g., Module 3 Assessment")).toBeInTheDocument();
  });
});
