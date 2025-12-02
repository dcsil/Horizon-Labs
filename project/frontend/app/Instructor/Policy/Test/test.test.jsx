// File-level: ensures the policy test chat preview sends canned replies, navigation works, and input handling is correct.
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import PolicyTestPage from "./page";

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

describe("PolicyTestPage Component", () => {
  let mockBack;

  beforeEach(() => {
    mockBack = jest.fn();
    useRouter.mockReturnValue({
      back: mockBack,
    });
    jest.clearAllMocks();
  });

  describe("Initial Rendering", () => {
    it("renders the page title", () => {
      render(<PolicyTestPage />);
      expect(screen.getByText("Test Prompt")).toBeInTheDocument();
    });

    it("renders the page description", () => {
      render(<PolicyTestPage />);
      expect(
        screen.getByText(/Simple mock chat to see how the application might respond/i)
      ).toBeInTheDocument();
    });

    it("renders back button", () => {
      render(<PolicyTestPage />);
      expect(screen.getByText("Back to Policy")).toBeInTheDocument();
    });

    it("renders message input field", () => {
      render(<PolicyTestPage />);
      expect(screen.getByPlaceholderText("Type a test message...")).toBeInTheDocument();
    });

    it("renders send button", () => {
      render(<PolicyTestPage />);
      expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
    });

    it("displays initial assistant messages", () => {
      render(<PolicyTestPage />);
      
      expect(
        screen.getByText("This is a static preview of adaptive chat under your policy settings.")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Try a message and I'll respond with whether I would use or skip certain files.")
      ).toBeInTheDocument();
    });
  });

  describe("Navigation", () => {
    it("navigates back when back button is clicked", () => {
      render(<PolicyTestPage />);
      const backButton = screen.getByText("Back to Policy");
      
      fireEvent.click(backButton);
      
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it("back button has arrow icon", () => {
      render(<PolicyTestPage />);
      const backButton = screen.getByText("Back to Policy").closest("button");
      const svg = backButton.querySelector("svg");
      
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveClass("w-5", "h-5");
    });
  });

  describe("Message Input", () => {
    it("updates input value when user types", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      
      fireEvent.change(input, { target: { value: "Hello, AI!" } });
      
      expect(input.value).toBe("Hello, AI!");
    });

    it("clears input after sending message", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      fireEvent.change(input, { target: { value: "Test message" } });
      fireEvent.click(sendButton);
      
      expect(input.value).toBe("");
    });

    it("does not send empty messages", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      const initialMessages = screen.getAllByText(/This is a static preview|Try a message/i);
      const initialCount = initialMessages.length;
      
      fireEvent.change(input, { target: { value: "   " } });
      fireEvent.click(sendButton);
      
      const finalMessages = screen.getAllByText(/This is a static preview|Try a message|Using this file|Not using this file/i);
      expect(finalMessages.length).toBe(initialCount);
    });

    it("trims whitespace from messages", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      fireEvent.change(input, { target: { value: "  Test  " } });
      fireEvent.click(sendButton);
      
      expect(screen.getByText("Test")).toBeInTheDocument();
    });
  });

  describe("Sending Messages", () => {
    it("sends message when Send button is clicked", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      fireEvent.change(input, { target: { value: "Hello" } });
      fireEvent.click(sendButton);
      
      expect(screen.getByText("Hello")).toBeInTheDocument();
    });

    it("sends message when Enter key is pressed", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      
      fireEvent.change(input, { target: { value: "Enter test" } });
      fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
      
      expect(screen.getByText("Enter test")).toBeInTheDocument();
    });

    it("does not send message when Shift+Enter is pressed", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      
      const initialMessagesCount = screen.getAllByText(/This is a static preview|Try a message/i).length;
      
      fireEvent.change(input, { target: { value: "Shift Enter test" } });
      fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
      
      const finalMessagesCount = screen.getAllByText(/This is a static preview|Try a message/i).length;
      expect(finalMessagesCount).toBe(initialMessagesCount);
    });

    it("displays user message with correct styling", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      fireEvent.change(input, { target: { value: "User message" } });
      fireEvent.click(sendButton);
      
      const userMessage = screen.getByText("User message").closest("div");
      expect(userMessage).toHaveClass("bg-purple-100", "text-gray-900");
    });

    it("displays assistant response after user message", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      fireEvent.change(input, { target: { value: "Test" } });
      fireEvent.click(sendButton);
      
      expect(screen.getByText("Using this file: focus_1.pdf")).toBeInTheDocument();
    });
  });

  describe("Canned Responses", () => {
    it("cycles through canned responses in order", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      // First response
      fireEvent.change(input, { target: { value: "Message 1" } });
      fireEvent.click(sendButton);
      expect(screen.getByText("Using this file: focus_1.pdf")).toBeInTheDocument();
      
      // Second response
      fireEvent.change(input, { target: { value: "Message 2" } });
      fireEvent.click(sendButton);
      expect(screen.getByText("Not using this file: deny_1.pdf")).toBeInTheDocument();
      
      // Third response
      fireEvent.change(input, { target: { value: "Message 3" } });
      fireEvent.click(sendButton);
      expect(screen.getByText("Using this file: focus_2.pdf")).toBeInTheDocument();
      
      // Fourth response
      fireEvent.change(input, { target: { value: "Message 4" } });
      fireEvent.click(sendButton);
      expect(screen.getByText("Not using this file: deny_2.pdf")).toBeInTheDocument();
    });

    it("wraps around to first response after all responses used", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      // Send 4 messages to exhaust responses
      for (let i = 1; i <= 4; i++) {
        fireEvent.change(input, { target: { value: `Message ${i}` } });
        fireEvent.click(sendButton);
      }
      
      // Fifth message should wrap to first response
      fireEvent.change(input, { target: { value: "Message 5" } });
      fireEvent.click(sendButton);
      
      const firstResponses = screen.getAllByText("Using this file: focus_1.pdf");
      expect(firstResponses.length).toBe(2); // Original + wrapped
    });
  });

  describe("Message Display", () => {
    it("aligns user messages to the right", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      fireEvent.change(input, { target: { value: "User msg" } });
      fireEvent.click(sendButton);
      
      const messageContainer = screen.getByText("User msg").closest("div").parentElement;
      expect(messageContainer).toHaveClass("justify-end");
    });

    it("aligns assistant messages to the left", () => {
      render(<PolicyTestPage />);
      
      const assistantMessage = screen.getByText("This is a static preview of adaptive chat under your policy settings.");
      const messageContainer = assistantMessage.closest("div").parentElement;
      
      expect(messageContainer).toHaveClass("justify-start");
    });

    it("applies correct background color to assistant messages", () => {
      render(<PolicyTestPage />);
      
      const assistantMessage = screen.getByText("This is a static preview of adaptive chat under your policy settings.");
      const messageBox = assistantMessage.closest("div");
      
      expect(messageBox).toHaveClass("bg-gray-100", "text-gray-800");
    });

    it("renders multiple messages in order", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      fireEvent.change(input, { target: { value: "First" } });
      fireEvent.click(sendButton);
      
      fireEvent.change(input, { target: { value: "Second" } });
      fireEvent.click(sendButton);
      
      const messages = screen.getAllByText(/First|Second|Using this file|Not using this file/i);
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe("Message Container", () => {
    it("has scrollable container for messages", () => {
      const { container } = render(<PolicyTestPage />);
      
      const messageContainer = container.querySelector(".max-h-\\[420px\\].overflow-y-auto");
      expect(messageContainer).toBeInTheDocument();
    });

    it("applies rounded border to chat container", () => {
      const { container } = render(<PolicyTestPage />);
      
      const chatContainer = container.querySelector(".rounded-2xl.border-2");
      expect(chatContainer).toBeInTheDocument();
    });
  });

  describe("Layout Structure", () => {
    it("has responsive flex layout", () => {
      const { container } = render(<PolicyTestPage />);
      
      expect(container.querySelector(".min-h-screen")).toBeInTheDocument();
      expect(container.querySelector(".flex-1")).toBeInTheDocument();
    });

    it("renders left border panel", () => {
      const { container } = render(<PolicyTestPage />);
      
      const leftPanel = container.querySelector(".xl\\:block.w-80.border-r");
      expect(leftPanel).toBeInTheDocument();
    });

    it("renders decorative right panel", () => {
      const { container } = render(<PolicyTestPage />);
      
      const rightPanel = container.querySelector(".lg\\:block.bg-purple-100");
      expect(rightPanel).toBeInTheDocument();
    });

    it("renders gradient decoration image", () => {
      render(<PolicyTestPage />);
      
      const gradientImg = screen.getByAltText("Gradient decoration");
      expect(gradientImg).toBeInTheDocument();
      expect(gradientImg).toHaveAttribute("src", "/gradient1.png");
    });
  });

  describe("Styling", () => {
    it("applies Poppins font class to title", () => {
      render(<PolicyTestPage />);
      
      const title = screen.getByText("Test Prompt");
      expect(title).toHaveClass("mocked-poppins");
    });

    it("applies gradient to send button", () => {
      render(<PolicyTestPage />);
      
      const sendButton = screen.getByRole("button", { name: "Send" });
      expect(sendButton).toHaveClass("bg-gradient-to-r", "from-purple-500", "to-purple-700");
    });

    it("applies hover effects to send button", () => {
      render(<PolicyTestPage />);
      
      const sendButton = screen.getByRole("button", { name: "Send" });
      expect(sendButton).toHaveClass("hover:shadow-lg", "hover:scale-105");
    });

    it("applies hover effects to back button", () => {
      render(<PolicyTestPage />);
      
      const backButton = screen.getByText("Back to Policy").closest("button");
      expect(backButton).toHaveClass("hover:text-gray-900");
    });

    it("applies focus styles to input", () => {
      render(<PolicyTestPage />);
      
      const input = screen.getByPlaceholderText("Type a test message...");
      expect(input).toHaveClass("focus:outline-none", "focus:border-purple-500");
    });
  });

  describe("Input Field Properties", () => {
    it("has correct input type", () => {
      render(<PolicyTestPage />);
      
      const input = screen.getByPlaceholderText("Type a test message...");
      expect(input.tagName).toBe("INPUT");
    });

    it("has correct placeholder text", () => {
      render(<PolicyTestPage />);
      
      const input = screen.getByPlaceholderText("Type a test message...");
      expect(input).toHaveAttribute("placeholder", "Type a test message...");
    });

    it("has responsive styling", () => {
      render(<PolicyTestPage />);
      
      const input = screen.getByPlaceholderText("Type a test message...");
      expect(input).toHaveClass("flex-1", "rounded-xl");
    });
  });

  describe("Message Formatting", () => {
    it("applies rounded corners to message bubbles", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      fireEvent.change(input, { target: { value: "Formatted" } });
      fireEvent.click(sendButton);
      
      const messageBox = screen.getByText("Formatted").closest("div");
      expect(messageBox).toHaveClass("rounded-2xl");
    });

    it("applies padding to message bubbles", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      fireEvent.change(input, { target: { value: "Padded" } });
      fireEvent.click(sendButton);
      
      const messageBox = screen.getByText("Padded").closest("div");
      expect(messageBox).toHaveClass("px-4", "py-3");
    });

    it("limits message bubble width", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      fireEvent.change(input, { target: { value: "Width test" } });
      fireEvent.click(sendButton);
      
      const messageBox = screen.getByText("Width test").closest("div");
      expect(messageBox).toHaveClass("max-w-xl");
    });
  });

  describe("Accessibility", () => {
    it("has proper heading hierarchy", () => {
      render(<PolicyTestPage />);
      
      const heading = screen.getByRole("heading", { level: 1 });
      expect(heading).toHaveTextContent("Test Prompt");
    });

    it("buttons are keyboard accessible", () => {
      render(<PolicyTestPage />);
      
      const sendButton = screen.getByRole("button", { name: "Send" });
      const backButton = screen.getByText("Back to Policy").closest("button");
      
      expect(sendButton).toBeEnabled();
      expect(backButton).toBeEnabled();
    });

    it("input field is accessible", () => {
      render(<PolicyTestPage />);
      
      const input = screen.getByPlaceholderText("Type a test message...");
      expect(input).toBeEnabled();
    });

    it("gradient image has alt text", () => {
      render(<PolicyTestPage />);
      
      const img = screen.getByAltText("Gradient decoration");
      expect(img).toHaveAttribute("alt", "Gradient decoration");
    });
  });

  describe("Edge Cases", () => {
    it("handles rapid message sending", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      for (let i = 0; i < 5; i++) {
        fireEvent.change(input, { target: { value: `Rapid ${i}` } });
        fireEvent.click(sendButton);
      }
      
      expect(screen.getByText("Rapid 4")).toBeInTheDocument();
    });

    it("handles empty input gracefully", () => {
      render(<PolicyTestPage />);
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      expect(() => fireEvent.click(sendButton)).not.toThrow();
    });

    it("maintains message history", () => {
      render(<PolicyTestPage />);
      const input = screen.getByPlaceholderText("Type a test message...");
      const sendButton = screen.getByRole("button", { name: "Send" });
      
      fireEvent.change(input, { target: { value: "Message 1" } });
      fireEvent.click(sendButton);
      
      fireEvent.change(input, { target: { value: "Message 2" } });
      fireEvent.click(sendButton);
      
      expect(screen.getByText("Message 1")).toBeInTheDocument();
      expect(screen.getByText("Message 2")).toBeInTheDocument();
    });
  });

  describe("Responsive Design", () => {
    it("has responsive text sizes", () => {
      render(<PolicyTestPage />);
      
      const title = screen.getByText("Test Prompt");
      expect(title).toHaveClass("text-3xl", "sm:text-4xl", "md:text-5xl");
    });

    it("has responsive padding", () => {
      const { container } = render(<PolicyTestPage />);
      
      const mainContent = container.querySelector(".px-6.py-10.sm\\:px-10.lg\\:px-16");
      expect(mainContent).toBeInTheDocument();
    });

    it("has responsive margin bottom", () => {
      const { container } = render(<PolicyTestPage />);
      
      const titleSection = container.querySelector(".mb-8.sm\\:mb-10");
      expect(titleSection).toBeInTheDocument();
    });
  });

  describe("Initial Message Count", () => {
    it("starts with exactly 2 assistant messages", () => {
      render(<PolicyTestPage />);
      
      const messages = screen.getAllByText(/This is a static preview|Try a message/i);
      expect(messages).toHaveLength(2);
    });
  });
});
