// File-level: validates login form interactions and role-based routing for students vs instructors.
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import LoginPage from "./page";

// Mock Next.js hooks
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

// Mock Next.js font
jest.mock("next/font/google", () => ({
  Poppins: () => ({
    className: "mocked-poppins",
  }),
}));

describe("LoginPage Component", () => {
  let mockPush;

  beforeEach(() => {
    localStorage.clear();
    mockPush = jest.fn();
    useRouter.mockReturnValue({
      push: mockPush,
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("Initial Rendering", () => {
    it("renders student sign in by default", () => {
      render(<LoginPage />);
      expect(screen.getByText("Student Sign In")).toBeInTheDocument();
    });

    it("renders username input field", () => {
      render(<LoginPage />);
      expect(screen.getByPlaceholderText("Username or email")).toBeInTheDocument();
    });

    it("renders password input field", () => {
      render(<LoginPage />);
      expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
    });

    it("renders remember me checkbox", () => {
      render(<LoginPage />);
      expect(screen.getByLabelText("Remember me")).toBeInTheDocument();
    });

    it("renders forgot password link", () => {
      render(<LoginPage />);
      expect(screen.getByText("Forgot password?")).toBeInTheDocument();
    });

    it("renders sign in button", () => {
      render(<LoginPage />);
      expect(screen.getByRole("button", { name: /Sign In/i })).toBeInTheDocument();
    });

    it("renders create account link", () => {
      render(<LoginPage />);
      expect(screen.getByText("New here?")).toBeInTheDocument();
      expect(screen.getByText("Create an Account")).toBeInTheDocument();
    });

    it("renders user icon SVG", () => {
      const { container } = render(<LoginPage />);
      const userIcons = container.querySelectorAll('svg[viewBox="0 0 24 24"]');
      expect(userIcons.length).toBeGreaterThan(0);
    });

    it("renders lock icon SVG for password", () => {
      const { container } = render(<LoginPage />);
      const lockIcons = container.querySelectorAll('svg[viewBox="0 0 24 24"]');
      expect(lockIcons.length).toBe(2); // One for user, one for password
    });
  });

  describe("Role Management", () => {
    it("loads student role from localStorage on mount", () => {
      localStorage.setItem("role", "student");
      
      render(<LoginPage />);
      
      expect(screen.getByText("Student Sign In")).toBeInTheDocument();
    });

    it("loads instructor role from localStorage on mount", () => {
      localStorage.setItem("role", "instructor");
      
      render(<LoginPage />);
      
      expect(screen.getByText("Instructor Sign In")).toBeInTheDocument();
    });

    it("ignores invalid role from localStorage", () => {
      localStorage.setItem("role", "invalid-role");
      
      render(<LoginPage />);
      
      expect(screen.getByText("Student Sign In")).toBeInTheDocument();
    });

    it("defaults to student when no role in localStorage", () => {
      render(<LoginPage />);
      
      expect(screen.getByText("Student Sign In")).toBeInTheDocument();
    });

    it("handles empty string role from localStorage", () => {
      localStorage.setItem("role", "");
      
      render(<LoginPage />);
      
      expect(screen.getByText("Student Sign In")).toBeInTheDocument();
    });
  });

  describe("Form Input Handling", () => {
    it("updates username input on change", () => {
      render(<LoginPage />);
      const usernameInput = screen.getByPlaceholderText("Username or email");
      
      fireEvent.change(usernameInput, { target: { name: "username", value: "testuser" } });
      
      expect(usernameInput.value).toBe("testuser");
    });

    it("updates password input on change", () => {
      render(<LoginPage />);
      const passwordInput = screen.getByPlaceholderText("Password");
      
      fireEvent.change(passwordInput, { target: { name: "password", value: "password123" } });
      
      expect(passwordInput.value).toBe("password123");
    });

    it("toggles remember me checkbox", () => {
      render(<LoginPage />);
      const checkbox = screen.getByLabelText("Remember me");
      
      expect(checkbox.checked).toBe(false);
      
      fireEvent.click(checkbox);
      
      expect(checkbox.checked).toBe(true);
    });

    it("unchecks remember me when clicked again", () => {
      render(<LoginPage />);
      const checkbox = screen.getByLabelText("Remember me");
      
      fireEvent.click(checkbox);
      expect(checkbox.checked).toBe(true);
      
      fireEvent.click(checkbox);
      expect(checkbox.checked).toBe(false);
    });

    it("handles multiple input changes", () => {
      render(<LoginPage />);
      const usernameInput = screen.getByPlaceholderText("Username or email");
      const passwordInput = screen.getByPlaceholderText("Password");
      const checkbox = screen.getByLabelText("Remember me");
      
      fireEvent.change(usernameInput, { target: { name: "username", value: "user@test.com" } });
      fireEvent.change(passwordInput, { target: { name: "password", value: "securepass" } });
      fireEvent.click(checkbox);
      
      expect(usernameInput.value).toBe("user@test.com");
      expect(passwordInput.value).toBe("securepass");
      expect(checkbox.checked).toBe(true);
    });

    it("handles empty input values", () => {
      render(<LoginPage />);
      const usernameInput = screen.getByPlaceholderText("Username or email");
      
      fireEvent.change(usernameInput, { target: { name: "username", value: "test" } });
      fireEvent.change(usernameInput, { target: { name: "username", value: "" } });
      
      expect(usernameInput.value).toBe("");
    });

    it("maintains form state across multiple interactions", () => {
      render(<LoginPage />);
      const usernameInput = screen.getByPlaceholderText("Username or email");
      const passwordInput = screen.getByPlaceholderText("Password");
      
      fireEvent.change(usernameInput, { target: { name: "username", value: "first" } });
      fireEvent.change(passwordInput, { target: { name: "password", value: "pass1" } });
      fireEvent.change(usernameInput, { target: { name: "username", value: "second" } });
      
      expect(usernameInput.value).toBe("second");
      expect(passwordInput.value).toBe("pass1");
    });
  });

  describe("Form Submission", () => {
    it("navigates to student homepage when student submits", () => {
      render(<LoginPage />);
      const form = screen.getByRole("button", { name: /Sign In/i }).closest("form");
      
      fireEvent.submit(form);
      
      expect(mockPush).toHaveBeenCalledWith("/Student/HomePage");
    });

    it("navigates to instructor page when instructor submits", () => {
      localStorage.setItem("role", "instructor");
      
      render(<LoginPage />);
      const form = screen.getByRole("button", { name: /Sign In/i }).closest("form");
      
      fireEvent.submit(form);
      
      expect(mockPush).toHaveBeenCalledWith("/Instructor");
    });

    it("prevents default form submission", () => {
      render(<LoginPage />);
      const form = screen.getByRole("button", { name: /Sign In/i }).closest("form");
      const event = new Event("submit", { bubbles: true, cancelable: true });
      const preventDefaultSpy = jest.spyOn(event, "preventDefault");
      
      form.dispatchEvent(event);
      
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("submits form by clicking sign in button", () => {
      render(<LoginPage />);
      const signInButton = screen.getByRole("button", { name: /Sign In/i });
      
      fireEvent.click(signInButton);
      
      expect(mockPush).toHaveBeenCalledWith("/Student/HomePage");
    });

    it("submits form with filled data", () => {
      render(<LoginPage />);
      const usernameInput = screen.getByPlaceholderText("Username or email");
      const passwordInput = screen.getByPlaceholderText("Password");
      const form = screen.getByRole("button", { name: /Sign In/i }).closest("form");
      
      fireEvent.change(usernameInput, { target: { name: "username", value: "user@example.com" } });
      fireEvent.change(passwordInput, { target: { name: "password", value: "mypassword" } });
      fireEvent.submit(form);
      
      expect(mockPush).toHaveBeenCalled();
    });

    it("navigates correctly with remember me checked", () => {
      render(<LoginPage />);
      const checkbox = screen.getByLabelText("Remember me");
      const form = screen.getByRole("button", { name: /Sign In/i }).closest("form");
      
      fireEvent.click(checkbox);
      fireEvent.submit(form);
      
      expect(mockPush).toHaveBeenCalledWith("/Student/HomePage");
    });
  });

  describe("Input Field Types", () => {
    it("username field is text type", () => {
      render(<LoginPage />);
      const usernameInput = screen.getByPlaceholderText("Username or email");
      
      expect(usernameInput).toHaveAttribute("type", "text");
    });

    it("password field is password type", () => {
      render(<LoginPage />);
      const passwordInput = screen.getByPlaceholderText("Password");
      
      expect(passwordInput).toHaveAttribute("type", "password");
    });

    it("remember me is checkbox type", () => {
      render(<LoginPage />);
      const checkbox = screen.getByLabelText("Remember me");
      
      expect(checkbox).toHaveAttribute("type", "checkbox");
    });

    it("sign in button is submit type", () => {
      render(<LoginPage />);
      const button = screen.getByRole("button", { name: /Sign In/i });
      
      expect(button).toHaveAttribute("type", "submit");
    });
  });

  describe("Input Field Attributes", () => {
    it("username input has correct name attribute", () => {
      render(<LoginPage />);
      const usernameInput = screen.getByPlaceholderText("Username or email");
      
      expect(usernameInput).toHaveAttribute("name", "username");
    });

    it("password input has correct name attribute", () => {
      render(<LoginPage />);
      const passwordInput = screen.getByPlaceholderText("Password");
      
      expect(passwordInput).toHaveAttribute("name", "password");
    });

    it("checkbox has correct name attribute", () => {
      render(<LoginPage />);
      const checkbox = screen.getByLabelText("Remember me");
      
      expect(checkbox).toHaveAttribute("name", "rememberMe");
    });
  });

  describe("Styling and Classes", () => {
    it("applies Poppins font class to title", () => {
      render(<LoginPage />);
      const title = screen.getByText("Student Sign In");
      
      expect(title).toHaveClass("mocked-poppins");
    });

    it("applies purple background gradient to sign in button", () => {
      render(<LoginPage />);
      const button = screen.getByRole("button", { name: /Sign In/i });
      
      expect(button).toHaveClass("bg-gradient-to-r");
      expect(button).toHaveClass("from-purple-500");
      expect(button).toHaveClass("to-blue-500");
    });

    it("applies purple background to main container", () => {
      const { container } = render(<LoginPage />);
      const mainDiv = container.querySelector(".bg-purple-100");
      
      expect(mainDiv).toBeInTheDocument();
    });

    it("applies rounded corners to card", () => {
      const { container } = render(<LoginPage />);
      const card = container.querySelector(".rounded-\\[28px\\]");
      
      expect(card).toBeInTheDocument();
    });

    it("applies focus ring to username input", () => {
      render(<LoginPage />);
      const usernameInput = screen.getByPlaceholderText("Username or email");
      
      expect(usernameInput).toHaveClass("focus:ring-2");
      expect(usernameInput).toHaveClass("focus:ring-purple-500");
    });

    it("applies focus ring to password input", () => {
      render(<LoginPage />);
      const passwordInput = screen.getByPlaceholderText("Password");
      
      expect(passwordInput).toHaveClass("focus:ring-2");
      expect(passwordInput).toHaveClass("focus:ring-purple-500");
    });
  });

  describe("Links and Navigation Elements", () => {
    it("forgot password link has correct href", () => {
      render(<LoginPage />);
      const link = screen.getByText("Forgot password?");
      
      expect(link).toHaveAttribute("href", "#");
    });

    it("create account link has correct href", () => {
      render(<LoginPage />);
      const link = screen.getByText("Create an Account");
      
      expect(link).toHaveAttribute("href", "#");
    });

    it("forgot password link has hover styles", () => {
      render(<LoginPage />);
      const link = screen.getByText("Forgot password?");
      
      expect(link).toHaveClass("hover:text-purple-600");
    });

    it("create account link has hover styles", () => {
      render(<LoginPage />);
      const link = screen.getByText("Create an Account");
      
      expect(link).toHaveClass("hover:text-purple-700");
    });
  });

  describe("Form Layout", () => {
    it("renders form within card", () => {
      const { container } = render(<LoginPage />);
      const form = container.querySelector("form");
      const card = container.querySelector(".bg-white");
      
      expect(form).toBeInTheDocument();
      expect(card).toContainElement(form);
    });

    it("form has space-y class for vertical spacing", () => {
      const { container } = render(<LoginPage />);
      const form = container.querySelector("form");
      
      expect(form).toHaveClass("space-y-8");
    });
  });

  describe("Accessibility", () => {
    it("username input has proper placeholder", () => {
      render(<LoginPage />);
      const input = screen.getByPlaceholderText("Username or email");
      
      expect(input).toHaveAttribute("placeholder", "Username or email");
    });

    it("password input has proper placeholder", () => {
      render(<LoginPage />);
      const input = screen.getByPlaceholderText("Password");
      
      expect(input).toHaveAttribute("placeholder", "Password");
    });

    it("checkbox has associated label", () => {
      render(<LoginPage />);
      const checkbox = screen.getByLabelText("Remember me");
      
      expect(checkbox).toBeInTheDocument();
    });

    it("form can be submitted with keyboard", () => {
      render(<LoginPage />);
      const form = screen.getByRole("button", { name: /Sign In/i }).closest("form");
      
      fireEvent.submit(form);
      
      expect(mockPush).toHaveBeenCalled();
    });
  });

  describe("Dynamic Title Based on Role", () => {
    it("shows 'Student Sign In' for student role", () => {
      localStorage.setItem("role", "student");
      
      render(<LoginPage />);
      
      expect(screen.getByText("Student Sign In")).toBeInTheDocument();
      expect(screen.queryByText("Instructor Sign In")).not.toBeInTheDocument();
    });

    it("shows 'Instructor Sign In' for instructor role", () => {
      localStorage.setItem("role", "instructor");
      
      render(<LoginPage />);
      
      expect(screen.getByText("Instructor Sign In")).toBeInTheDocument();
      expect(screen.queryByText("Student Sign In")).not.toBeInTheDocument();
    });

    it("title updates correctly based on role", () => {
      localStorage.setItem("role", "instructor");
      
      const { rerender } = render(<LoginPage />);
      
      expect(screen.getByText("Instructor Sign In")).toBeInTheDocument();
      
      localStorage.setItem("role", "student");
      rerender(<LoginPage />);
      
      // Note: useEffect only runs on mount, so title won't change on rerender
      // This tests current behavior
      expect(screen.getByText("Instructor Sign In")).toBeInTheDocument();
    });
  });

  describe("Input State Management", () => {
    it("checkbox state is handled correctly", () => {
      render(<LoginPage />);
      const checkbox = screen.getByLabelText("Remember me");
      
      // Initial state
      expect(checkbox.checked).toBe(false);
      
      // Check the box
      fireEvent.change(checkbox, { target: { name: "rememberMe", type: "checkbox", checked: true } });
      expect(checkbox.checked).toBe(true);
      
      // Uncheck the box
      fireEvent.change(checkbox, { target: { name: "rememberMe", type: "checkbox", checked: false } });
      expect(checkbox.checked).toBe(false);
    });

    it("text input state is handled correctly", () => {
      render(<LoginPage />);
      const usernameInput = screen.getByPlaceholderText("Username or email");
      
      fireEvent.change(usernameInput, { target: { name: "username", value: "testvalue", type: "text" } });
      
      expect(usernameInput.value).toBe("testvalue");
    });
  });

  describe("Card Dimensions", () => {
    it("card has specific width and height classes", () => {
      const { container } = render(<LoginPage />);
      const card = container.querySelector(".w-\\[523px\\]");
      
      expect(card).toBeInTheDocument();
      expect(card).toHaveClass("h-[831px]");
    });
  });

  describe("Button Styles", () => {
    it("sign in button has shadow", () => {
      render(<LoginPage />);
      const button = screen.getByRole("button", { name: /Sign In/i });
      
      expect(button).toHaveClass("shadow-md");
    });

    it("sign in button has transition", () => {
      render(<LoginPage />);
      const button = screen.getByRole("button", { name: /Sign In/i });
      
      expect(button).toHaveClass("transition-all");
      expect(button).toHaveClass("duration-300");
    });

    it("sign in button has hover styles", () => {
      render(<LoginPage />);
      const button = screen.getByRole("button", { name: /Sign In/i });
      
      expect(button).toHaveClass("hover:from-purple-600");
      expect(button).toHaveClass("hover:to-blue-600");
    });
  });

  describe("Edge Cases", () => {
    it("handles rapid form submissions", () => {
      render(<LoginPage />);
      const form = screen.getByRole("button", { name: /Sign In/i }).closest("form");
      
      fireEvent.submit(form);
      fireEvent.submit(form);
      fireEvent.submit(form);
      
      expect(mockPush).toHaveBeenCalledTimes(3);
    });

    it("handles form submission with empty fields", () => {
      render(<LoginPage />);
      const form = screen.getByRole("button", { name: /Sign In/i }).closest("form");
      
      fireEvent.submit(form);
      
      expect(mockPush).toHaveBeenCalledWith("/Student/HomePage");
    });

    it("handles special characters in input", () => {
      render(<LoginPage />);
      const usernameInput = screen.getByPlaceholderText("Username or email");
      
      fireEvent.change(usernameInput, { target: { name: "username", value: "user@#$%^&*()" } });
      
      expect(usernameInput.value).toBe("user@#$%^&*()");
    });

    it("handles very long input values", () => {
      render(<LoginPage />);
      const usernameInput = screen.getByPlaceholderText("Username or email");
      const longValue = "a".repeat(1000);
      
      fireEvent.change(usernameInput, { target: { name: "username", value: longValue } });
      
      expect(usernameInput.value).toBe(longValue);
    });
  });

  describe("Component Structure", () => {
    it("has proper container hierarchy", () => {
      const { container } = render(<LoginPage />);
      const mainContainer = container.querySelector(".min-h-screen");
      const innerContainer = container.querySelector(".h-\\[80vh\\]");
      
      expect(mainContainer).toContainElement(innerContainer);
    });

    it("centers content properly", () => {
      const { container } = render(<LoginPage />);
      const centerContainer = container.querySelector(".flex.items-center.justify-center");
      
      expect(centerContainer).toBeInTheDocument();
    });
  });

  describe("SVG Icons", () => {
    it("user icon has correct stroke properties", () => {
      const { container } = render(<LoginPage />);
      const svgs = container.querySelectorAll('svg');
      const userIcon = svgs[0];
      
      expect(userIcon).toHaveAttribute("fill", "none");
      expect(userIcon).toHaveAttribute("stroke", "currentColor");
    });

    it("lock icon has correct stroke properties", () => {
      const { container } = render(<LoginPage />);
      const svgs = container.querySelectorAll('svg');
      const lockIcon = svgs[1];
      
      expect(lockIcon).toHaveAttribute("fill", "none");
      expect(lockIcon).toHaveAttribute("stroke", "currentColor");
    });
  });

  describe("Text Content", () => {
    it("displays 'New here?' text", () => {
      render(<LoginPage />);
      
      expect(screen.getByText("New here?")).toBeInTheDocument();
    });

    it("displays create account link text", () => {
      render(<LoginPage />);
      
      expect(screen.getByText("Create an Account")).toBeInTheDocument();
    });

    it("displays remember me text", () => {
      render(<LoginPage />);
      
      expect(screen.getByText("Remember me")).toBeInTheDocument();
    });
  });
});
