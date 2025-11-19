/**
 * @jest-environment jsdom
 */
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// mock next/font/google to avoid runtime font logic
jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-class" }),
}));

// mock next/navigation BEFORE importing component
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

import QuizGeneratorPage from "./quiz_generator.jsx";

beforeEach(() => {
  cleanup();
  mockPush.mockClear();
  window.localStorage.clear();

  // stable crypto.randomUUID for tests
  if (!global.crypto) global.crypto = {};
  global.crypto.randomUUID = global.crypto.randomUUID || (() => "mock-uuid-123");

  // default fetch resolves so unexpected calls won't hang tests
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(""),
    })
  );
});

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
  cleanup();
});

test("ensureSessionId creates session id in localStorage on ingest attempt", async () => {
  render(<QuizGeneratorPage />);

  // no session initially
  expect(localStorage.getItem("quizGeneratorSessionId")).toBeNull();

  // try uploading and ingesting to trigger ensureSessionId
  const file = new File(["a"], "sample.pdf", { type: "application/pdf" });
  const input = document.getElementById("file-upload");
  fireEvent.change(input, { target: { files: [file] } });

  // mock ingest response OK
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ document_id: "doc-1", slide_count: 0, chunk_count: 1 }),
    })
  );

  const ingestBtn = screen.getByRole("button", { name: /ingest file/i });
  await userEvent.click(ingestBtn);

  // wait for ingest success message and for session id to be created
  await waitFor(() => expect(screen.getByText(/Ingested the uploaded file|Ingested/i)).toBeTruthy());
  expect(localStorage.getItem("quizGeneratorSessionId")).toBeTruthy();
});

test("selecting Assessment enables Next and navigates without upload", async () => {
  render(<QuizGeneratorPage />);

  // select Assessment
  const assessmentBtn = screen.getByRole("button", { name: /assessment/i });
  await userEvent.click(assessmentBtn);

  // Next should be enabled because assessment bypasses ingestion
  const nextBtn = screen.getByRole("button", { name: /^next$/i });
  expect(nextBtn).toBeEnabled();

  await userEvent.click(nextBtn);
  expect(mockPush).toHaveBeenCalledWith("/Instructor/Assessment");

  // quizGeneratorSeed saved with mode assessment
  const seed = JSON.parse(localStorage.getItem("quizGeneratorSeed") || "{}");
  expect(seed.mode).toBe("assessment");
});

test("practice Next without upload shows helpful ingest error", async () => {
  render(<QuizGeneratorPage />);

  // ensure practice selected (default)
  const nextBtn = screen.getByRole("button", { name: /^next$/i });
  await userEvent.click(nextBtn);

  await waitFor(() => {
    expect(screen.getByText(/Please upload a file before continuing\./i)).toBeTruthy();
  });
});

test("successful ingest sets ingestSuccessMessage and allows Next to navigate and save seed", async () => {
  render(<QuizGeneratorPage />);

  // upload file
  const file = new File(["d"], "notes.pdf", { type: "application/pdf" });
  const input = document.getElementById("file-upload");
  fireEvent.change(input, { target: { files: [file] } });

  expect(screen.getByText("notes.pdf")).toBeTruthy();

  // mock ingest POST to return document_id etc
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ document_id: "doc-123", slide_count: 0, chunk_count: 5 }),
    })
  );

  // click ingest
  const ingestBtn = screen.getByRole("button", { name: /ingest file/i });
  await userEvent.click(ingestBtn);

  await waitFor(() => expect(screen.getByText(/Ingested/i)).toBeTruthy(), { timeout: 2000 });

  // Next should now be enabled and navigation saves seed
  const nextBtn = screen.getByRole("button", { name: /^next$/i });
  expect(nextBtn).toBeEnabled();
  await userEvent.click(nextBtn);

  expect(mockPush).toHaveBeenCalledWith("/Instructor/Practice");
  const seed = JSON.parse(localStorage.getItem("quizGeneratorSeed") || "{}");
  expect(seed.documentId).toBe("doc-123");
  expect(seed.filename).toBe("notes.pdf");
});

test("ingest handles delete-of-previous-doc failure and surfaces error", async () => {
  render(<QuizGeneratorPage />);

  // first ingest a file to produce an ingestedDocumentId
  const file1 = new File(["a"], "one.pdf", { type: "application/pdf" });
  fireEvent.change(document.getElementById("file-upload"), { target: { files: [file1] } });
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ document_id: "doc-old", chunk_count: 1 }) })
  );
  await userEvent.click(screen.getByRole("button", { name: /ingest file/i }));
  await waitFor(() => expect(screen.getByText(/Ingested/i)).toBeTruthy());

  // upload a new file and mock delete response NOT OK (simulate delete failure)
  const file2 = new File(["b"], "two.pdf", { type: "application/pdf" });
  fireEvent.change(document.getElementById("file-upload"), { target: { files: [file2] } });

  // first fetch called will be delete (return not ok)
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
  );

  // ingest should catch and display error
  await userEvent.click(screen.getByRole("button", { name: /ingest file/i }));
  await waitFor(() => {
    expect(screen.getByText(/Unable to delete previously ingested document\./i)).toBeTruthy();
  });
});

test("ingest surfaces server-provided detail when ingestResponse is not ok", async () => {
  render(<QuizGeneratorPage />);

  const f = new File(["c"], "bad.pdf", { type: "application/pdf" });
  fireEvent.change(document.getElementById("file-upload"), { target: { files: [f] } });

  // mock ingest response not ok with detail
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ detail: "Bad payload" }),
    })
  );

  await userEvent.click(screen.getByRole("button", { name: /ingest file/i }));
  await waitFor(() => {
    expect(screen.getByText(/Bad payload/i)).toBeTruthy();
  });
});

test("back to quiz list opens modal and Leave triggers DELETE (if present) then navigates", async () => {
  render(<QuizGeneratorPage />);

  // set an ingestedDocumentId by performing a successful ingest
  const file = new File(["x"], "x.pdf", { type: "application/pdf" });
  fireEvent.change(document.getElementById("file-upload"), { target: { files: [file] } });
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ document_id: "doc-exit", chunk_count: 1 }) })
  );
  await userEvent.click(screen.getByRole("button", { name: /ingest file/i }));
  await waitFor(() => expect(screen.getByText(/Ingested/i)).toBeTruthy());

  // click Back to Quiz List to open modal
  const backBtn = screen.getByRole("button", { name: /← Back to Quiz List/i });
  await userEvent.click(backBtn);

  // Leave button should be visible
  const leaveBtn = await screen.findByRole("button", { name: /Leave/i });
  // mock DELETE call for proceed exit
  global.fetch.mockImplementationOnce(() => Promise.resolve({ ok: true, text: () => Promise.resolve("") }));

  await userEvent.click(leaveBtn);

  await waitFor(() => {
    expect(mockPush).toHaveBeenCalledWith("/Instructor/Quizzes");
  });
});

test("handleProceedExit still navigates even if delete throws", async () => {
  render(<QuizGeneratorPage />);

  // set ingestedDocumentId via a successful ingest
  const file = new File(["y"], "y.pdf", { type: "application/pdf" });
  fireEvent.change(document.getElementById("file-upload"), { target: { files: [file] } });
  global.fetch.mockImplementationOnce(() =>
    Promise.resolve({ ok: true, json: () => Promise.resolve({ document_id: "doc-exit2", chunk_count: 1 }) })
  );
  await userEvent.click(screen.getByRole("button", { name: /ingest file/i }));
  await waitFor(() => expect(screen.getByText(/Ingested/i)).toBeTruthy());

  // open modal
  await userEvent.click(screen.getByRole("button", { name: /← Back to Quiz List/i }));
  const leaveBtn = await screen.findByRole("button", { name: /Leave/i });

  // simulate fetch throwing
  global.fetch.mockImplementationOnce(() => Promise.reject(new Error("network fail")));

  await userEvent.click(leaveBtn);

  await waitFor(() => {
    expect(mockPush).toHaveBeenCalledWith("/Instructor/Quizzes");
  });
});