// ...existing code...
/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the Poppins font to avoid runtime font logic
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// Mock next/navigation useRouter (provide push spy)
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import LoginPage from "./login_page.jsx";

beforeEach(() => {
  mockPush.mockClear();
  window.localStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
  cleanup();
});

test("renders Student Sign In by default and inputs are present", () => {
  render(<LoginPage />);

  expect(screen.getByRole("heading", { name: /Student Sign In/i })).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Username or email/i)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/Password/i)).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /remember me/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
});

test("uses stored role from localStorage (instructor) and shows Instructor Sign In", () => {
  window.localStorage.setItem("role", "instructor");
  render(<LoginPage />);

  expect(screen.getByRole("heading", { name: /Instructor Sign In/i })).toBeInTheDocument();
});

test("ignores invalid stored role and keeps Student Sign In", () => {
  // invalid entry should be ignored by effect
  window.localStorage.setItem("role", "admin");
  render(<LoginPage />);

  expect(screen.getByRole("heading", { name: /Student Sign In/i })).toBeInTheDocument();
});

test("typing into inputs and toggling rememberMe updates values", async () => {
  render(<LoginPage />);
  const username = screen.getByPlaceholderText(/Username or email/i);
  const password = screen.getByPlaceholderText(/Password/i);
  const checkbox = screen.getByRole("checkbox", { name: /remember me/i });

  await userEvent.type(username, "alice");
  await userEvent.type(password, "secret123");
  await userEvent.click(checkbox);

  expect(username).toHaveValue("alice");
  expect(password).toHaveValue("secret123");
  expect(checkbox).toBeChecked();
});

test("submitting as instructor navigates to /Instructor", async () => {
  window.localStorage.setItem("role", "instructor");
  render(<LoginPage />);

  const submitBtn = screen.getByRole("button", { name: /sign in/i });
  await userEvent.click(submitBtn);

  expect(mockPush).toHaveBeenCalledWith("/Instructor");
});

test("submitting as student navigates to /Student/HomePage", async () => {
  window.localStorage.setItem("role", "student");
  render(<LoginPage />);

  const submitBtn = screen.getByRole("button", { name: /sign in/i });
  await userEvent.click(submitBtn);

  expect(mockPush).toHaveBeenCalledWith("/Student/HomePage");
});

test("links 'Forgot password?' and 'Create an Account' exist with expected hrefs", () => {
  render(<LoginPage />);

  const forgot = screen.getByText(/Forgot password\?/i);
  const create = screen.getByText(/Create an Account/i);

  expect(forgot).toBeInTheDocument();
  expect(forgot.closest("a")).toHaveAttribute("href", "#");

  expect(create).toBeInTheDocument();
  expect(create.closest("a")).toHaveAttribute("href", "#");
});

test("importing the component when window is undefined does not throw (server-side early-return path)", () => {
  // isolate module loading and temporarily remove global.window to hit the typeof window === "undefined" guard
  const realWindow = global.window;
  try {
    // Remove window so module's useEffect detects "no window" at import-time path
    // Use resetModules + isolateModules to avoid polluting other tests
    jest.resetModules();
    // delete window reference for the duration of the require
    // (we don't render — just ensure import doesn't throw)
    // eslint-disable-next-line no-undef
    // @ts-ignore
    delete global.window;

    expect(() => {
      jest.isolateModules(() => {
        // require the module file — should succeed without throwing even when window is undefined
        // module uses useEffect that checks typeof window before accessing localStorage
        // eslint-disable-next-line global-require
        require("./login_page.jsx");
      });
    }).not.toThrow();
  } finally {
    // restore global.window for the remaining tests
    global.window = realWindow;
    jest.resetModules();
  }
}
