// We recommend installing an extension to run Jest tests.


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
  test("applies purple background when pathname starts with /LoginPage", () => {
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

  test("applies purple background for nested /LoginPage/* paths", () => {
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

  test("falls back to gray background for non-LoginPage paths", () => {
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

  test("does not apply purple for /Student path with current implementation", () => {
    usePathname.mockReturnValue("/Student");
    const { container } = render(
      <ConditionalBody>
        <div>student-child</div>
      </ConditionalBody>
    );

    const innerBody = container.querySelector("body");
    expect(innerBody).not.toBeNull();
    // Current component only checks '/LoginPage' so Student remains gray
    expect(innerBody.className).toContain("bg-gray-50");
    expect(screen.getByText("student-child")).toBeTruthy();
  });

  test("uses gray background for empty pathname", () => {
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