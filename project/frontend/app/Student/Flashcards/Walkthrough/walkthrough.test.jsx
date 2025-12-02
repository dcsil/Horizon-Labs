// File-level: ensures the flashcard walkthrough demo renders deck info and reacts to router mocks.
import { render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import FlashcardWalkthroughPage from "./page";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-mock" }),
}));

describe("FlashcardWalkthroughPage", () => {
  beforeEach(() => {
    useRouter.mockReturnValue({ push: jest.fn() });
  });

  it("renders the flashcard walkthrough heading", () => {
    render(<FlashcardWalkthroughPage />);
    expect(screen.getByText("Discrete Math Proof Patterns")).toBeInTheDocument();
  });
});
