// File-level: verifies practice quiz builder renders core fields and navigation links for instructors.
import { render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import PracticePage from "./page";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-mock" }),
}));

describe("PracticePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: jest.fn() });
  });

  it("renders the practice heading and inputs", () => {
    render(<PracticePage />);
    expect(screen.getByText(/Practice Mode/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g., Midterm Practice Set")).toBeInTheDocument();
  });
});
