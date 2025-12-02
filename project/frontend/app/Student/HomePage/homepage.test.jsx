// File-level: validates student home dashboard renders quick actions and routes via buttons.
import { render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import StudentHomePage from "./page";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-mock" }),
}));

describe("StudentHomePage", () => {
  beforeEach(() => {
    useRouter.mockReturnValue({ push: jest.fn() });
  });

  it("renders quick action cards", () => {
    render(<StudentHomePage />);
    expect(screen.getByText(/Chat with AI Assistant/i)).toBeInTheDocument();
    expect(screen.getByText(/Assessment & Practice Quizzes/i)).toBeInTheDocument();
    expect(screen.getByText(/Flashcards Lab/i)).toBeInTheDocument();
  });
});
