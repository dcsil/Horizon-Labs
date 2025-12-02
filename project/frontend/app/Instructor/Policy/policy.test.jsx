// File-level: validates the instructor policy preview page renders scopes, services, and toggles correctly.
import { render, screen, fireEvent } from "@testing-library/react";
import { useRouter } from "next/navigation";
import PolicyPage from "./page";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-mock" }),
}));

describe("PolicyPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: jest.fn() });
  });

  it("renders core sections", () => {
    render(<PolicyPage />);
    expect(screen.getByText("AI & Content Scope")).toBeInTheDocument();
    expect(screen.getByText("Site-wide policy windows")).toBeInTheDocument();
    expect(screen.getByText("Chat Settings")).toBeInTheDocument();
  });

  it("allows toggling guidance", () => {
    render(<PolicyPage />);
    const toggle = screen.getByRole("button", { pressed: true });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });
});
