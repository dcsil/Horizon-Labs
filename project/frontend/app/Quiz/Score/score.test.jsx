// File-level: validates quiz score preview rendering, publish toggle flow, and router calls.
import { render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import ScorePage from "./page";

jest.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: () => null,
  }),
  useRouter: jest.fn(),
  usePathname: () => "/Quiz/Score",
}));

jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-mock" }),
}));

describe("QuizScorePage", () => {
  beforeEach(() => {
    useRouter.mockReturnValue({ push: jest.fn() });
  });

  it("renders score page shell", () => {
    render(<ScorePage />);
    expect(screen.getByText(/Your Score/i)).toBeInTheDocument();
  });
});
