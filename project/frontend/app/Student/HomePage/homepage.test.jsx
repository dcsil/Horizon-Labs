/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// mock Poppins font to avoid runtime font logic
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// mock next/navigation router BEFORE importing component
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import StudentHomePage from "./homepage.jsx";

beforeEach(() => {
  cleanup();
  mockPush.mockClear();
  // stabilize displayed date
  jest.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue("January 2, 2025");
});

afterEach(() => {
  jest.restoreAllMocks();
  cleanup();
});

test("renders heading, formatted date and decorative image", () => {
  render(<StudentHomePage />);

  expect(screen.getByRole("heading", { name: /Welcome Student/i })).toBeInTheDocument();
  expect(screen.getByText("January 2, 2025")).toBeInTheDocument();
  expect(screen.getByAltText("Gradient decoration")).toBeInTheDocument();
});

test("Chat and Quiz cards render and navigate when clicked", async () => {
  render(<StudentHomePage />);

  // Ensure cards present
  const chatTitle = screen.getByText(/Chat with AI Assistant/i);
  const quizTitle = screen.getByText(/Assessment & Practice Quizzes/i);

  // images present
  expect(screen.getByAltText("Chat")).toBeInTheDocument();
  expect(screen.getByAltText("Quiz")).toBeInTheDocument();

  // click chat card (title is inside button)
  const chatBtn = chatTitle.closest("button");
  expect(chatBtn).toBeTruthy();
  await userEvent.click(chatBtn);
  expect(mockPush).toHaveBeenCalledWith("/Student/chat");

  // click quiz card
  const quizBtn = quizTitle.closest("button");
  expect(quizBtn).toBeTruthy();
  await userEvent.click(quizBtn);
  expect(mockPush).toHaveBeenCalledWith("/Student/Quizzes");
});
```// filepath: c:\Users\vivia\csc491\Horizon-Labs\project\frontend\app\Student\HomePage\homepage.test.jsx
/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// mock Poppins font to avoid runtime font logic
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// mock next/navigation router BEFORE importing component
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import StudentHomePage from "./homepage.jsx";

beforeEach(() => {
  cleanup();
  mockPush.mockClear();
  // stabilize displayed date
  jest.spyOn(Date.prototype, "toLocaleDateString").mockReturnValue("January 2, 2025");
});

afterEach(() => {
  jest.restoreAllMocks();
  cleanup();
});

test("renders heading, formatted date and decorative image", () => {
  render(<StudentHomePage />);

  expect(screen.getByRole("heading", { name: /Welcome Student/i })).toBeInTheDocument();
  expect(screen.getByText("January 2, 2025")).toBeInTheDocument();
  expect(screen.getByAltText("Gradient decoration")).toBeInTheDocument();
});

test("Chat and Quiz cards render and navigate when clicked", async () => {
  render(<StudentHomePage />);

  // Ensure cards present
  const chatTitle = screen.getByText(/Chat with AI Assistant/i);
  const quizTitle = screen.getByText(/Assessment & Practice Quizzes/i);

  // images present
  expect(screen.getByAltText("Chat")).toBeInTheDocument();
  expect(screen.getByAltText("Quiz")).toBeInTheDocument();

  // click chat card (title is inside button)
  const chatBtn = chatTitle.closest("button");
  expect(chatBtn).toBeTruthy();
  await userEvent.click(chatBtn);
  expect(mockPush).toHaveBeenCalledWith("/Student/chat");

  // click quiz card
  const quizBtn = quizTitle.closest("button");
  expect(quizBtn).toBeTruthy();
  await userEvent.click(quizBtn);
  expect(mockPush).toHaveBeenCalledWith("/Student/Quizzes");
});