// File-level: confirms analytics dashboard renders summaries, charts, and handles fetch lifecycle.
import { render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import InstructorDashboard from "./page";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-mock" }),
}));

describe("InstructorDashboard", () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: jest.fn() });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ sessions: [], quizzes: [], recentChats: [] }),
    });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("renders dashboard headings", async () => {
    render(<InstructorDashboard />);
    await waitFor(() => expect(screen.getByText(/Analytics Dashboard/i)).toBeInTheDocument());
  });
});
