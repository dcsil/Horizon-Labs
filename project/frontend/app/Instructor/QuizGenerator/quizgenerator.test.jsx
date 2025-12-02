// File-level: covers instructor QuizGenerator flow including mode toggles, file ingest validation, and routing.
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useRouter } from "next/navigation";
import QuizGeneratorPage from "./page";

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("next/font/google", () => ({
  Poppins: () => ({ className: "poppins-mock" }),
}));

describe("QuizGeneratorPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    global.fetch = jest.fn();
    useRouter.mockReturnValue({ push: jest.fn() });
  });

  it("renders the main heading and actions", () => {
    render(<QuizGeneratorPage />);

    expect(screen.getByText("Create a New Quiz")).toBeInTheDocument();
    expect(screen.getByText("Select a mode")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assessment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Practice" })).toBeInTheDocument();
  });

  it("disables Next until requirements are met in practice mode", () => {
    render(<QuizGeneratorPage />);
    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(nextButton).toBeDisabled();
  });

  it("navigates to assessment mode when Next is clicked", () => {
    const push = jest.fn();
    useRouter.mockReturnValue({ push });
    render(<QuizGeneratorPage />);

    fireEvent.click(screen.getByRole("button", { name: "Assessment" }));
    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(nextButton).not.toBeDisabled();

    fireEvent.click(nextButton);
    expect(push).toHaveBeenCalledWith("/Instructor/Assessment");
  });

  it("ingests a file and navigates to practice after success", async () => {
    const push = jest.fn();
    useRouter.mockReturnValue({ push });
    const ingestResponse = {
      ok: true,
      json: jest.fn().mockResolvedValue({
        document_id: "doc-123",
        slide_count: 2,
        chunk_count: 3,
      }),
    };
    global.fetch.mockResolvedValue(ingestResponse);

    render(<QuizGeneratorPage />);

    const fileInput = screen.getByLabelText(/Upload Slides\/Notes/i);
    const file = new File(["dummy"], "notes.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: "Ingest File" }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await screen.findByText(/Ingested 2 slides \(3 chunks\)\./i);

    const nextButton = screen.getByRole("button", { name: "Next" });
    expect(nextButton).not.toBeDisabled();
    fireEvent.click(nextButton);
    expect(push).toHaveBeenCalledWith("/Instructor/Practice");
  });
});
