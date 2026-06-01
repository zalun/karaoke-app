import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DisplayRestoreErrorBoundary } from "./DisplayRestoreErrorBoundary";

const { dismissRestore, logError } = vi.hoisted(() => ({
  dismissRestore: vi.fn().mockResolvedValue(undefined),
  logError: vi.fn(),
}));

vi.mock("../../stores", () => ({
  useDisplayStore: {
    getState: () => ({ dismissRestore }),
  },
}));

vi.mock("../../services/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: logError,
  }),
}));

function Boom(): never {
  throw new Error("render boom");
}

describe("DisplayRestoreErrorBoundary", () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dismissRestore.mockReset().mockResolvedValue(undefined);
    logError.mockReset();
    // React logs caught errors to console.error; silence it in this test
    consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("renders children when no error", () => {
    render(
      <DisplayRestoreErrorBoundary>
        <div>healthy child</div>
      </DisplayRestoreErrorBoundary>,
    );
    expect(screen.getByText("healthy child")).toBeInTheDocument();
  });

  it("renders accessible fallback UI when a child throws", () => {
    render(
      <DisplayRestoreErrorBoundary>
        <Boom />
      </DisplayRestoreErrorBoundary>,
    );
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toBeInTheDocument();
    // aria-labelledby and aria-describedby point at rendered ids
    const title = screen.getByText("Couldn't restore display layout");
    expect(dialog.getAttribute("aria-labelledby")).toBe(title.id);
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)).toBeInTheDocument();
  });

  it("logs the captured error via componentDidCatch", () => {
    render(
      <DisplayRestoreErrorBoundary>
        <Boom />
      </DisplayRestoreErrorBoundary>,
    );
    expect(logError).toHaveBeenCalledWith(
      "DisplayRestoreDialog crashed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  it("autofocuses the Dismiss button when the fallback opens", () => {
    render(
      <DisplayRestoreErrorBoundary>
        <Boom />
      </DisplayRestoreErrorBoundary>,
    );
    expect(screen.getByRole("button", { name: "Dismiss" })).toHaveFocus();
  });

  it("dismisses the pending restore when Dismiss is clicked", async () => {
    const user = userEvent.setup();
    render(
      <DisplayRestoreErrorBoundary>
        <Boom />
      </DisplayRestoreErrorBoundary>,
    );

    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(dismissRestore).toHaveBeenCalledTimes(1);
  });

  it("also dismisses when the Close (X) button is clicked", async () => {
    const user = userEvent.setup();
    render(
      <DisplayRestoreErrorBoundary>
        <Boom />
      </DisplayRestoreErrorBoundary>,
    );

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(dismissRestore).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape", async () => {
    const user = userEvent.setup();
    render(
      <DisplayRestoreErrorBoundary>
        <Boom />
      </DisplayRestoreErrorBoundary>,
    );

    await user.keyboard("{Escape}");
    expect(dismissRestore).toHaveBeenCalledTimes(1);
  });

  it("logs and recovers when dismissRestore rejects", async () => {
    dismissRestore.mockRejectedValueOnce(new Error("store boom"));
    const user = userEvent.setup();

    render(
      <DisplayRestoreErrorBoundary>
        <Boom />
      </DisplayRestoreErrorBoundary>,
    );

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(dismissRestore).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      "dismissRestore failed during error recovery:",
      expect.any(Error),
    );
  });
});
