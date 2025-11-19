/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the Poppins font to avoid runtime font logic
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// Provide a push mock for next/navigation BEFORE importing the component
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// now import the component under test
import InstructorPage from "./instructor.jsx";

beforeEach(() => {
  mockPush.mockClear();
  // stabilize displayed date
  jest.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue("January 2, 2025");
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("renders heading and formatted date", () => {
  render(<InstructorPage />);

  expect(screen.getByRole("heading", { name: /welcome instructor/i })).toBeInTheDocument();
  // formatted date from mocked toLocaleDateString
  expect(screen.getByText("January 2, 2025")).toBeInTheDocument();
});

test("renders Quiz Generator card and image", () => {
  render(<InstructorPage />);

  // the card title should be present
  expect(screen.getByText("Quiz Generator")).toBeInTheDocument();

  // image alt text should exist
  expect(screen.getByAltText("Quiz Generator")).toBeInTheDocument();
});

test("clicking Quiz Generator button calls router.push to quizzes", async () => {
  render(<InstructorPage />);

  // find the title element and get its closest button to click
  const titleEl = screen.getByText("Quiz Generator");
  const btn = titleEl.closest("button");
  expect(btn).toBeTruthy();

  await userEvent.click(btn);

  expect(mockPush).toHaveBeenCalledWith("/Instructor/Quizzes");
});
```// filepath: c:\Users\vivia\csc491\Horizon-Labs\project\frontend\app\Instructor\instructor.test.jsx
/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the Poppins font to avoid runtime font logic
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// Provide a push mock for next/navigation BEFORE importing the component
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// now import the component under test
import InstructorPage from "./instructor.jsx";

beforeEach(() => {
  mockPush.mockClear();
  // stabilize displayed date
  jest.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue("January 2, 2025");
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("renders heading and formatted date", () => {
  render(<InstructorPage />);

  expect(screen.getByRole("heading", { name: /welcome instructor/i })).toBeInTheDocument();
  // formatted date from mocked toLocaleDateString
  expect(screen.getByText("January 2, 2025")).toBeInTheDocument();
});

test("renders Quiz Generator card and image", () => {
  render(<InstructorPage />);

  // the card title should be present
  expect(screen.getByText("Quiz Generator")).toBeInTheDocument();

  // image alt text should exist
  expect(screen.getByAltText("Quiz Generator")).toBeInTheDocument();
});

test("clicking Quiz Generator button calls router.push to quizzes", async () => {
  render(<InstructorPage />);

  // find the title element and get its closest button to click
  const titleEl = screen.getByText("Quiz Generator");
  const btn = titleEl.closest("button");
  expect(btn).toBeTruthy();

  await userEvent.click(btn);

  expect(mockPush).toHaveBeenCalledWith("/Instructor/Quizzes");
});