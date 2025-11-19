/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// mock the Poppins font to avoid runtime font differences
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// mock feature flags BEFORE importing the component
jest.mock("../../../lib/flag.js", () => ({ flags: { showInstructorBanner: true } }));

// ensure stable ids in tests
if (!global.crypto) global.crypto = {};
global.crypto.randomUUID = global.crypto.randomUUID || (() => "test-uuid-1");

// helper to build a reader for streaming tests
function makeReader(chunks = []) {
  const encodedChunks = chunks.map((s) => new TextEncoder().encode(s));
  let i = 0;
  return {
    getReader: () => ({
      read: () =>
        Promise.resolve(
          i < encodedChunks.length
            ? { value: encodedChunks[i++], done: false }
            : { value: undefined, done: true }
        ),
    }),
  };
}

// import component after mocks
import ChatPage from "./chat_page2.jsx";

beforeEach(() => {
  cleanup();
  jest.clearAllMocks();
  window.localStorage.clear();

  // default fetch harmless implementation (can be overridden per-test)
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      body: makeReader([]),
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(""),
    })
  );
});

afterEach(() => {
  jest.restoreAllMocks();
  cleanup();
});

test("renders welcome UI, typing enables Send, and successful stream appends assistant tokens", async () => {
  // prepare streaming chunks that contain two token events then end
  const sse = [
    'data: {"type":"token","data":"Hello "}\n\n',
    'data: {"type":"token","data":"world!"}\n\n',
  ];
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      body: makeReader(sse),
    })
  );

  render(<ChatPage />);

  // initial welcome text
  expect(screen.getByText(/New Chat Session/i)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/What do you need help with today\?/i)).toBeInTheDocument();

  // Send button disabled until input
  const sendBtn = screen.getByRole("button", { name: "" }); // send button has no accessible name; use query by role
  const input = screen.getByPlaceholderText(/What do you need help with today\?/i);
  await userEvent.type(input, "What's 2+2?");
  expect(sendBtn).toBeEnabled();

  // click Send -> user message and assistant placeholder are added
  await userEvent.click(sendBtn);

  // user message appears
  expect(await screen.findByText("What's 2+2?")).toBeInTheDocument();

  // assistant tokens should be stitched together and appear
  await waitFor(() => {
    expect(screen.getByText(/Hello world!/i)).toBeInTheDocument();
  });
});

test("stream emits error event -> assistant shows error badge and error text visible", async () => {
  const errorEvent = ['event: error\ndata: {"message":"stream failed"}\n\n'];
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      body: makeReader(errorEvent),
    })
  );

  render(<ChatPage />);

  const input = screen.getByPlaceholderText(/What do you need help with today\?/i);
  await userEvent.type(input, "Trigger error");
  const sendBtn = screen.getByRole("button", { name: "" });

  await userEvent.click(sendBtn);

  // assistant message prefixed with warning symbol and message
  await waitFor(() => {
    expect(screen.getByText(/⚠️ stream failed/i)).toBeInTheDocument();
    expect(screen.getByText(/stream failed/i)).toBeInTheDocument();
  });
});

test("malformed JSON in stream triggers parse-failure branch and displays parse error", async () => {
  const badJsonEvent = ['data: not-a-json\n\n'];
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      body: makeReader(badJsonEvent),
    })
  );

  render(<ChatPage />);

  const input = screen.getByPlaceholderText(/What do you need help with today\?/i);
  await userEvent.type(input, "Broken");
  const sendBtn = screen.getByRole("button", { name: "" });

  await userEvent.click(sendBtn);

  await waitFor(() => {
    expect(screen.getByText(/⚠️ Failed to parse response from server\./i)).toBeInTheDocument();
  });
});

test("non-ok response or missing body results in request failure message shown to user", async () => {
  // simulate 500 without body
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: false,
      status: 500,
      body: null,
    })
  );

  render(<ChatPage />);

  const input = screen.getByPlaceholderText(/What do you need help with today\?/i);
  await userEvent.type(input, "Will fail");
  const sendBtn = screen.getByRole("button", { name: "" });

  await userEvent.click(sendBtn);

  await waitFor(() => {
    // error message includes the thrown message
    expect(screen.getByText(/⚠️ Request failed with status 500/i)).toBeInTheDocument();
  });
});

test("Banner is rendered when feature flag enabled", () => {
  render(<ChatPage />);
  // flag mock set to true at top; Banner should render its text
  expect(screen.getByText(/Instructor Mode Banner/i)).toBeInTheDocument();
});
```// filepath: c:\Users\vivia\csc491\Horizon-Labs\project\frontend\app\Student\chat\chat_page2.test.jsx
/**
 * @jest-environment jsdom
 */

import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// mock the Poppins font to avoid runtime font differences
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// mock feature flags BEFORE importing the component
jest.mock("../../../lib/flag.js", () => ({ flags: { showInstructorBanner: true } }));

// ensure stable ids in tests
if (!global.crypto) global.crypto = {};
global.crypto.randomUUID = global.crypto.randomUUID || (() => "test-uuid-1");

// helper to build a reader for streaming tests
function makeReader(chunks = []) {
  const encodedChunks = chunks.map((s) => new TextEncoder().encode(s));
  let i = 0;
  return {
    getReader: () => ({
      read: () =>
        Promise.resolve(
          i < encodedChunks.length
            ? { value: encodedChunks[i++], done: false }
            : { value: undefined, done: true }
        ),
    }),
  };
}

// import component after mocks
import ChatPage from "./chat_page2.jsx";

beforeEach(() => {
  cleanup();
  jest.clearAllMocks();
  window.localStorage.clear();

  // default fetch harmless implementation (can be overridden per-test)
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      body: makeReader([]),
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(""),
    })
  );
});

afterEach(() => {
  jest.restoreAllMocks();
  cleanup();
});

test("renders welcome UI, typing enables Send, and successful stream appends assistant tokens", async () => {
  // prepare streaming chunks that contain two token events then end
  const sse = [
    'data: {"type":"token","data":"Hello "}\n\n',
    'data: {"type":"token","data":"world!"}\n\n',
  ];
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      body: makeReader(sse),
    })
  );

  render(<ChatPage />);

  // initial welcome text
  expect(screen.getByText(/New Chat Session/i)).toBeInTheDocument();
  expect(screen.getByPlaceholderText(/What do you need help with today\?/i)).toBeInTheDocument();

  // Send button disabled until input
  const sendBtn = screen.getByRole("button", { name: "" }); // send button has no accessible name; use query by role
  const input = screen.getByPlaceholderText(/What do you need help with today\?/i);
  await userEvent.type(input, "What's 2+2?");
  expect(sendBtn).toBeEnabled();

  // click Send -> user message and assistant placeholder are added
  await userEvent.click(sendBtn);

  // user message appears
  expect(await screen.findByText("What's 2+2?")).toBeInTheDocument();

  // assistant tokens should be stitched together and appear
  await waitFor(() => {
    expect(screen.getByText(/Hello world!/i)).toBeInTheDocument();
  });
});

test("stream emits error event -> assistant shows error badge and error text visible", async () => {
  const errorEvent = ['event: error\ndata: {"message":"stream failed"}\n\n'];
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      body: makeReader(errorEvent),
    })
  );

  render(<ChatPage />);

  const input = screen.getByPlaceholderText(/What do you need help with today\?/i);
  await userEvent.type(input, "Trigger error");
  const sendBtn = screen.getByRole("button", { name: "" });

  await userEvent.click(sendBtn);

  // assistant message prefixed with warning symbol and message
  await waitFor(() => {
    expect(screen.getByText(/⚠️ stream failed/i)).toBeInTheDocument();
    expect(screen.getByText(/stream failed/i)).toBeInTheDocument();
  });
});

test("malformed JSON in stream triggers parse-failure branch and displays parse error", async () => {
  const badJsonEvent = ['data: not-a-json\n\n'];
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      body: makeReader(badJsonEvent),
    })
  );

  render(<ChatPage />);

  const input = screen.getByPlaceholderText(/What do you need help with today\?/i);
  await userEvent.type(input, "Broken");
  const sendBtn = screen.getByRole("button", { name: "" });

  await userEvent.click(sendBtn);

  await waitFor(() => {
    expect(screen.getByText(/⚠️ Failed to parse response from server\./i)).toBeInTheDocument();
  });
});

test("non-ok response or missing body results in request failure message shown to user", async () => {
  // simulate 500 without body
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: false,
      status: 500,
      body: null,
    })
  );

  render(<ChatPage />);

  const input = screen.getByPlaceholderText(/What do you need help with today\?/i);
  await userEvent.type(input, "Will fail");
  const sendBtn = screen.getByRole("button", { name: "" });

  await userEvent.click(sendBtn);

  await waitFor(() => {
    // error message includes the thrown message
    expect(screen.getByText(/⚠️ Request failed with status 500/i)).toBeInTheDocument();
  });
});

test("Banner is rendered when feature flag enabled", () => {
  render(<ChatPage />);
  // flag mock set to true at top; Banner should render its text
  expect(screen.getByText(/Instructor Mode Banner/i)).toBeInTheDocument();
});