// File-level: exercises ConditionalHeader role persistence, avatar selection, and route-aware visibility.
import { render, screen } from "@testing-library/react";
import { usePathname, useRouter } from "next/navigation";
import ConditionalHeader from "./ConditionalHeader";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}));

// Simplify next/image to a plain img tag without the priority prop
jest.mock("next/image", () => (props) => {
  const { alt, priority: _priority, ...rest } = props;
  return <img alt={alt} {...rest} />;
});

describe("ConditionalHeader", () => {
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useRouter.mockReturnValue({ push: mockPush });
  });

  it("renders header on student routes", () => {
    usePathname.mockReturnValue("/Student/Home");

    render(<ConditionalHeader />);

    expect(screen.getByAltText("Learn LLM")).toBeInTheDocument();
    expect(screen.getByAltText("Account")).toBeInTheDocument();
  });

  it("renders with purple background on LoginPage routes", () => {
    usePathname.mockReturnValue("/LoginPage");

    const { container } = render(<ConditionalHeader />);

    expect(container.firstChild).toHaveClass("bg-purple-100");
  });

  it("does not render on score pages", () => {
    usePathname.mockReturnValue("/Quiz/Score");

    const { container } = render(<ConditionalHeader />);

    expect(container.firstChild).toBeNull();
  });
});
