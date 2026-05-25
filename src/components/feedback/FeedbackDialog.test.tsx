import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FeedbackDialog } from "./FeedbackDialog";
import type { FeedbackType } from "../../stores/feedbackStore";

interface MockFeedbackState {
  open: boolean;
  initialType: FeedbackType;
  close: ReturnType<typeof vi.fn>;
}

let mockFeedbackStore: MockFeedbackState;
const mockNotify = vi.fn();
const mockCollectContext = vi.fn();
const mockSubmitFeedback = vi.fn();
const mockOpen = vi.fn();
const mockClipboardWrite = vi.fn().mockResolvedValue(undefined);

vi.mock("../../stores/feedbackStore", () => ({
  useFeedbackStore: () => mockFeedbackStore,
}));

vi.mock("../../stores/notificationStore", () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
}));

vi.mock("../../services", () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("../../services/feedback", () => ({
  collectContext: (...args: unknown[]) => mockCollectContext(...args),
  submitFeedback: (...args: unknown[]) => mockSubmitFeedback(...args),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: (...args: unknown[]) => mockOpen(...args),
}));

function setup(initialType: FeedbackType = "bug", open = true) {
  mockFeedbackStore = { open, initialType, close: vi.fn() };
  return render(<FeedbackDialog />);
}

function fillValidForm() {
  fireEvent.change(screen.getByTestId("feedback-title"), { target: { value: "Crash on play" } });
  fireEvent.change(screen.getByTestId("feedback-body"), { target: { value: "It crashes." } });
}

describe("FeedbackDialog", () => {
  beforeEach(() => {
    mockNotify.mockReset();
    mockCollectContext.mockReset();
    mockSubmitFeedback.mockReset();
    mockOpen.mockReset();
    mockClipboardWrite.mockClear();
    mockCollectContext.mockResolvedValue({ context: {}, logsFailed: false });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: mockClipboardWrite },
      configurable: true,
    });
  });

  it("renders nothing when closed", () => {
    setup("bug", false);
    expect(screen.queryByTestId("feedback-dialog")).toBeNull();
  });

  it("renders the verbatim privacy banner", () => {
    setup();
    expect(screen.getByTestId("feedback-banner")).toHaveTextContent(
      "⚠️ Tytuł i opis pojawią się publicznie na GitHubie. Email i logi zostaną tylko u nas (prywatnie)."
    );
  });

  it("pre-selects the type from the store", () => {
    setup("feature");
    expect(screen.getByText("Suggest a Feature")).toBeInTheDocument();
  });

  it("shows validation errors and does not submit when title and body are empty", async () => {
    setup();
    fireEvent.click(screen.getByTestId("feedback-submit"));

    expect(await screen.findByTestId("feedback-title-error")).toBeInTheDocument();
    expect(screen.getByTestId("feedback-body-error")).toBeInTheDocument();
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
  });

  it("shows an email error for a malformed email and does not submit", async () => {
    setup();
    fillValidForm();
    fireEvent.change(screen.getByTestId("feedback-email"), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByTestId("feedback-submit"));

    expect(await screen.findByTestId("feedback-email-error")).toBeInTheDocument();
    expect(mockSubmitFeedback).not.toHaveBeenCalled();
  });

  it("renders the GitHub URL on success when provided", async () => {
    mockSubmitFeedback.mockResolvedValue({
      status: 200,
      ok: true,
      githubIssueUrl: "https://github.com/zalun/karaoke-app/issues/42",
    });
    setup();
    fillValidForm();
    fireEvent.click(screen.getByTestId("feedback-submit"));

    const link = await screen.findByTestId("feedback-issue-url");
    expect(link).toHaveTextContent("https://github.com/zalun/karaoke-app/issues/42");
    expect(screen.getByTestId("feedback-open-issue")).toBeInTheDocument();
    expect(screen.getByTestId("feedback-copy-link")).toBeInTheDocument();
  });

  it("renders a follow-up message on success without a URL", async () => {
    mockSubmitFeedback.mockResolvedValue({ status: 200, ok: true });
    setup();
    fillValidForm();
    fireEvent.click(screen.getByTestId("feedback-submit"));

    await screen.findByTestId("feedback-success");
    expect(screen.queryByTestId("feedback-issue-url")).toBeNull();
    expect(screen.getByText(/odezwiemy się wkrótce/)).toBeInTheDocument();
  });

  it("keeps the form intact and toasts on a 429", async () => {
    mockSubmitFeedback.mockResolvedValue({ status: 429, ok: false });
    setup();
    fillValidForm();
    fireEvent.click(screen.getByTestId("feedback-submit"));

    await waitFor(() => expect(mockNotify).toHaveBeenCalled());
    expect(mockNotify).toHaveBeenCalledWith(
      "error",
      "Zbyt wiele zgłoszeń. Spróbuj ponownie za godzinę."
    );
    // Dialog stays open with the form and preserves the entered title.
    expect(screen.getByTestId("feedback-submit")).toBeInTheDocument();
    expect(screen.getByTestId("feedback-title")).toHaveValue("Crash on play");
    expect(screen.queryByTestId("feedback-success")).toBeNull();
  });

  it("toasts the server error and keeps the form on a non-429 failure", async () => {
    mockSubmitFeedback.mockResolvedValue({ status: 502, ok: false, error: "server boom" });
    setup();
    fillValidForm();
    fireEvent.click(screen.getByTestId("feedback-submit"));

    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith("error", "server boom"));
    expect(screen.getByTestId("feedback-submit")).toBeInTheDocument();
    expect(screen.queryByTestId("feedback-success")).toBeNull();
  });

  it("uses a Polish fallback message when the failure carries no error text", async () => {
    mockSubmitFeedback.mockResolvedValue({ status: 400, ok: false });
    setup();
    fillValidForm();
    fireEvent.click(screen.getByTestId("feedback-submit"));

    await waitFor(() =>
      expect(mockNotify).toHaveBeenCalledWith(
        "error",
        "Nie udało się wysłać zgłoszenia. Spróbuj ponownie."
      )
    );
  });

  it("warns but still submits when log collection failed", async () => {
    mockCollectContext.mockResolvedValue({ context: {}, logsFailed: true });
    mockSubmitFeedback.mockResolvedValue({
      status: 200,
      ok: true,
      githubIssueUrl: "https://github.com/zalun/karaoke-app/issues/5",
    });
    setup();
    fillValidForm();
    fireEvent.click(screen.getByTestId("feedback-submit"));

    await screen.findByTestId("feedback-success");
    expect(mockNotify).toHaveBeenCalledWith("warning", "Nie udało się dołączyć logów do zgłoszenia.");
    expect(mockSubmitFeedback).toHaveBeenCalledTimes(1);
  });

  it("omits email from the payload when left blank, includes it when provided", async () => {
    mockSubmitFeedback.mockResolvedValue({ status: 200, ok: true });
    setup();
    fillValidForm();
    fireEvent.click(screen.getByTestId("feedback-submit"));
    await screen.findByTestId("feedback-success");
    expect(mockSubmitFeedback.mock.calls[0][0]).not.toHaveProperty("email");

    mockSubmitFeedback.mockClear();
    setup();
    fillValidForm();
    fireEvent.change(screen.getByTestId("feedback-email"), { target: { value: "me@example.com" } });
    fireEvent.click(screen.getByTestId("feedback-submit"));
    await screen.findByTestId("feedback-success");
    expect(mockSubmitFeedback.mock.calls[0][0]).toMatchObject({ email: "me@example.com" });
  });

  it("opens a valid GitHub issue URL in the browser", async () => {
    mockSubmitFeedback.mockResolvedValue({
      status: 200,
      ok: true,
      githubIssueUrl: "https://github.com/zalun/karaoke-app/issues/8",
    });
    setup();
    fillValidForm();
    fireEvent.click(screen.getByTestId("feedback-submit"));

    fireEvent.click(await screen.findByTestId("feedback-open-issue"));
    await waitFor(() =>
      expect(mockOpen).toHaveBeenCalledWith("https://github.com/zalun/karaoke-app/issues/8")
    );
  });

  it("refuses to open a look-alike non-GitHub host", async () => {
    mockSubmitFeedback.mockResolvedValue({
      status: 200,
      ok: true,
      githubIssueUrl: "https://evilgithub.com/zalun/karaoke-app/issues/9",
    });
    setup();
    fillValidForm();
    fireEvent.click(screen.getByTestId("feedback-submit"));

    fireEvent.click(await screen.findByTestId("feedback-open-issue"));
    await waitFor(() => expect(mockNotify).toHaveBeenCalledWith("error", expect.any(String)));
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it("copies the issue link to the clipboard", async () => {
    mockSubmitFeedback.mockResolvedValue({
      status: 200,
      ok: true,
      githubIssueUrl: "https://github.com/zalun/karaoke-app/issues/10",
    });
    setup();
    fillValidForm();
    fireEvent.click(screen.getByTestId("feedback-submit"));

    fireEvent.click(await screen.findByTestId("feedback-copy-link"));
    await waitFor(() =>
      expect(mockClipboardWrite).toHaveBeenCalledWith("https://github.com/zalun/karaoke-app/issues/10")
    );
  });
});
