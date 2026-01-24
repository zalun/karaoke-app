import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HostedByOtherUserDialog } from "./HostedByOtherUserDialog";

// =============================================================================
// Type Definitions for Mocks
// =============================================================================

interface MockSessionState {
  showHostedByOtherUserDialog: boolean;
  closeHostedByOtherUserDialog: ReturnType<typeof vi.fn>;
}

let mockSessionStore: MockSessionState;

// =============================================================================
// Mock Definitions
// =============================================================================

vi.mock("../../stores", () => ({
  useSessionStore: (selector?: (state: MockSessionState) => unknown) => {
    if (selector) {
      return selector(mockSessionStore);
    }
    return mockSessionStore;
  },
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  X: () => <span data-testid="x-icon">×</span>,
  AlertTriangle: () => <span data-testid="alert-icon">⚠️</span>,
}));

// =============================================================================
// Test Setup
// =============================================================================

function setupMocks(options: { showDialog?: boolean } = {}) {
  mockSessionStore = {
    showHostedByOtherUserDialog: options.showDialog ?? false,
    closeHostedByOtherUserDialog: vi.fn(),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("HostedByOtherUserDialog", () => {
  beforeEach(() => {
    setupMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("when dialog is hidden", () => {
    it("renders nothing when showHostedByOtherUserDialog is false", () => {
      setupMocks({ showDialog: false });
      const { container } = render(<HostedByOtherUserDialog />);

      expect(container.firstChild).toBeNull();
    });
  });

  describe("when dialog is shown", () => {
    beforeEach(() => {
      setupMocks({ showDialog: true });
    });

    it("renders the dialog when showHostedByOtherUserDialog is true", () => {
      render(<HostedByOtherUserDialog />);

      expect(
        screen.getByText("Session hosted by another user")
      ).toBeInTheDocument();
    });

    it("displays anonymous text saying 'another user' not an email (UI-001)", () => {
      const { container } = render(<HostedByOtherUserDialog />);

      // Should say "another user", NOT show an email address
      expect(
        screen.getByText("This session was being hosted by another user.")
      ).toBeInTheDocument();

      // Verify no email-like text is present anywhere in the dialog
      const dialogContent = container.textContent || "";
      expect(dialogContent).not.toMatch(/@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);

      // Explicitly check that the word "email" is not present
      expect(dialogContent.toLowerCase()).not.toContain("email");
    });

    it("displays helpful instruction text", () => {
      render(<HostedByOtherUserDialog />);

      expect(
        screen.getByText(
          "They need to sign in and stop hosting, or the session will expire automatically."
        )
      ).toBeInTheDocument();
    });

    it("has an OK button to dismiss the dialog (UI-001)", () => {
      render(<HostedByOtherUserDialog />);

      const okButton = screen.getByRole("button", { name: "OK" });
      expect(okButton).toBeInTheDocument();
    });

    it("calls closeHostedByOtherUserDialog when OK button is clicked (UI-001)", async () => {
      render(<HostedByOtherUserDialog />);

      const okButton = screen.getByRole("button", { name: "OK" });
      await userEvent.click(okButton);

      expect(mockSessionStore.closeHostedByOtherUserDialog).toHaveBeenCalled();
    });

    it("calls closeHostedByOtherUserDialog when X button is clicked", async () => {
      render(<HostedByOtherUserDialog />);

      const xButton = screen.getByTitle("Dismiss");
      await userEvent.click(xButton);

      expect(mockSessionStore.closeHostedByOtherUserDialog).toHaveBeenCalled();
    });

    it("displays warning icon", () => {
      render(<HostedByOtherUserDialog />);

      expect(screen.getByTestId("alert-icon")).toBeInTheDocument();
    });
  });
});
