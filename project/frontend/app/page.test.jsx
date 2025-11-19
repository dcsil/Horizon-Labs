/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// mock the Poppins font to avoid runtime font logic
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// create a push mock and mock next/navigation to return it
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import Home from "./hompage";

beforeEach(() => {
  mockPush.mockClear();
  // clear localStorage between tests
  window.localStorage.clear();
  cleanup();
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
});

test("renders heading, description, role buttons and Get started button", () => {
  render(<Home />);

  expect(screen.getByRole("heading", { name: /choose your role/i })).toBeInTheDocument();
  expect(screen.getByText(/select student if you would like to access our ai assistant/i)).toBeInTheDocument();

  // images/buttons present
  expect(screen.getByAltText("Student")).toBeInTheDocument();
  expect(screen.getByAltText("Instructor")).toBeInTheDocument();

  // Get started button
  expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
});

test("clicking role buttons updates role and writes to localStorage", async () => {
  render(<Home />);

  // default role is student -> localStorage gets saved on effect after mount
  // click instructor (image is inside a button)
  await userEvent.click(screen.getByAltText("Instructor"));

  // the instructor button is wrapped by a button; ensure we wrote to localStorage
  const saved = window.localStorage.getItem("role");
  expect(saved).toBe("instructor");

  // check that clicking student sets back to student
  await userEvent.click(screen.getByAltText("Student"));
  expect(window.localStorage.getItem("role")).toBe("student");
});

test('clicking "Get started" navigates to /LoginPage', async () => {
  render(<Home />);

  await userEvent.click(screen.getByRole("button", { name: /get started/i }));
  expect(mockPush).toHaveBeenCalledWith("/LoginPage");
});

test("picks up a saved 'instructor' role from localStorage on mount", async () => {
  window.localStorage.setItem("role", "instructor");

  render(<Home />);

  // wait for effects to run and DOM to update
  await waitFor(() => {
    const instrBtn = screen.getByAltText("Instructor").closest("button");
    expect(instrBtn).toBeTruthy();
    // selected instructor button should have the ring classes applied
    expect(instrBtn.className).toContain("ring-indigo-500");
  });

  // localStorage should still be instructor
  expect(window.localStorage.getItem("role")).toBe("instructor");
});

test("ignores invalid saved role and overwrites it with default 'student'", async () => {
  window.localStorage.setItem("role", "admin"); // invalid value

  render(<Home />);

  // after mount the effect will write the default 'student' to storage
  await waitFor(() => {
    expect(window.localStorage.getItem("role")).toBe("student");
    const studentBtn = screen.getByAltText("Student").closest("button");
    expect(studentBtn.className).toContain("ring-indigo-500"); // selected state
  });
});

test("dispatches ROLE_EVENT CustomEvent with correct detail when role changes", async () => {
  const dispatchSpy = jest.spyOn(window, "dispatchEvent");

  render(<Home />);

  // click instructor to change role
  await userEvent.click(screen.getByAltText("Instructor"));

  // wait for dispatch to be called
  await waitFor(() => {
    expect(dispatchSpy).toHaveBeenCalled();
  });

  // find the last dispatched event and verify its detail is the new role
  const calls = dispatchSpy.mock.calls;
  const lastEventArg = calls[calls.length - 1][0];
  expect(lastEventArg).toBeInstanceOf(CustomEvent);
  expect(lastEventArg.detail).toBe("instructor");

  dispatchSpy.mockRestore();
});