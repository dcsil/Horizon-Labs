import React from "react";
import { render, screen } from "@testing-library/react";

// Mock next/navigation and expose a mockable usePathname
jest.mock("next/navigation", () => ({ usePathname: jest.fn() }));
import { usePathname } from "next/navigation";
import ConditionalBody from "./ConditionalBody";

beforeEach(() => {
  jest.clearAllMocks();
});

describe("ConditionalBody (Jest)", () => {
  test("renders purple background when pathname is /LoginPage", () => {
    usePathname.mockReturnValue("/LoginPage");
    const { container } = render(
      <ConditionalBody>
        <div>child-content</div>
      </ConditionalBody>
    );

    const innerBody = container.querySelector("body");
    expect(innerBody).not.toBeNull();
    expect(innerBody.className).toContain("bg-purple-100");
    expect(screen.getByText("child-content")).toBeTruthy();
  });

  test("renders purple background for nested /LoginPage/* paths", () => {
    usePathname.mockReturnValue("/LoginPage/profile/settings");
    const { container } = render(
      <ConditionalBody>
        <div>nested-child</div>
      </ConditionalBody>
    );

    const innerBody = container.querySelector("body");
    expect(innerBody).not.toBeNull();
    expect(innerBody.className).toContain("bg-purple-100");
    expect(screen.getByText("nested-child")).toBeTruthy();
  });

  test("renders gray background for non-LoginPage path (/Home)", () => {
    usePathname.mockReturnValue("/Home");
    const { container } = render(
      <ConditionalBody>
        <div>other-child</div>
      </ConditionalBody>
    );

    const innerBody = container.querySelector("body");
    expect(innerBody).not.toBeNull();
    expect(innerBody.className).toContain("bg-gray-50");
    expect(screen.getByText("other-child")).toBeTruthy();
  });

  test("current implementation keeps /Student as gray (not purple)", () => {
    // note: component comment mentions Student but implementation only checks /LoginPage
    usePathname.mockReturnValue("/Student");
    const { container } = render(
      <ConditionalBody>
        <div>student-child</div>
      </ConditionalBody>
    );

    const innerBody = container.querySelector("body");
    expect(innerBody).not.toBeNull();
    expect(innerBody.className).toContain("bg-gray-50");
    expect(screen.getByText("student-child")).toBeTruthy();
  });

  test("renders children even if pathname is empty", () => {
    usePathname.mockReturnValue("");
    const { container } = render(
      <ConditionalBody>
        <div>empty-child</div>
      </ConditionalBody>
    );

    const innerBody = container.querySelector("body");
    expect(innerBody).not.toBeNull();
    expect(innerBody.className).toContain("bg-gray-50");
    expect(screen.getByText("empty-child")).toBeTruthy();
  });
});