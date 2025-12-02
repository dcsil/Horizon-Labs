// File-level: verifies ConditionalBody chooses the correct body background and wrapper based on route.
import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import ConditionalBody from "./ConditionalBody";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

describe("ConditionalBody", () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("shows a purple background on LoginPage routes", () => {
    usePathname.mockReturnValue("/LoginPage");

    render(
      <ConditionalBody>
        <div>Login content</div>
      </ConditionalBody>
    );

    expect(screen.getByText("Login content")).toBeInTheDocument();
  });

  it("uses the gray background for all other routes", () => {
    usePathname.mockReturnValue("/Student/Home");

    render(
      <ConditionalBody>
        <div>Default content</div>
      </ConditionalBody>
    );

    expect(screen.getByText("Default content")).toBeInTheDocument();
  });

  it("renders children regardless of route", () => {
    usePathname.mockReturnValue("/");

    render(
      <ConditionalBody>
        <span data-testid="child">Hello world</span>
      </ConditionalBody>
    );

    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});
