import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SongRequestsModal } from "./SongRequestsModal";
import type { SongRequest } from "../../types";

// =============================================================================
// Type Definitions for Mocks
// =============================================================================

interface MockSessionState {
  showRequestsModal: boolean;
  pendingRequests: SongRequest[];
  isLoadingRequests: boolean;
  processingRequestIds: Set<string>;
  closeRequestsModal: ReturnType<typeof vi.fn>;
  approveRequest: ReturnType<typeof vi.fn>;
  rejectRequest: ReturnType<typeof vi.fn>;
  approveAllRequests: ReturnType<typeof vi.fn>;
}

// =============================================================================
// Mock Data
// =============================================================================

let mockSessionStore: MockSessionState;

const createMockRequest = (
  id: string,
  overrides: Partial<SongRequest> = {}
): SongRequest => ({
  id,
  title: `Song ${id}`,
  status: "pending",
  guest_name: "Test Guest",
  requested_at: "2025-01-01T12:00:00Z",
  ...overrides,
});

// =============================================================================
// Mock Definitions
// =============================================================================

vi.mock("../../stores", () => ({
  useSessionStore: () => mockSessionStore,
}));

vi.mock("lucide-react", () => ({
  X: () => <span data-testid="x-icon">×</span>,
  Check: () => <span data-testid="check-icon">✓</span>,
  XIcon: () => <span data-testid="x-reject-icon">×</span>,
  Loader2: ({ className }: { className?: string }) => (
    <span data-testid="loader-icon" className={className}>
      ⏳
    </span>
  ),
}));

// =============================================================================
// Test Setup
// =============================================================================

function setupMocks(options: {
  showRequestsModal?: boolean;
  pendingRequests?: SongRequest[];
  isLoadingRequests?: boolean;
  processingRequestIds?: Set<string>;
} = {}) {
  mockSessionStore = {
    showRequestsModal: options.showRequestsModal ?? true,
    pendingRequests: options.pendingRequests ?? [],
    isLoadingRequests: options.isLoadingRequests ?? false,
    processingRequestIds: options.processingRequestIds ?? new Set(),
    closeRequestsModal: vi.fn(),
    approveRequest: vi.fn().mockResolvedValue(undefined),
    rejectRequest: vi.fn().mockResolvedValue(undefined),
    approveAllRequests: vi.fn().mockResolvedValue(undefined),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("SongRequestsModal", () => {
  beforeEach(() => {
    setupMocks();
  });

  describe("Thumbnail URL validation (SRA-031)", () => {
    it("renders thumbnail when URL is valid HTTPS", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [
          createMockRequest("1", {
            thumbnail_url: "https://i.ytimg.com/vi/abc123/default.jpg",
          }),
        ],
      });
      render(<SongRequestsModal />);

      // Image has alt="" which gives it role="presentation", so query by selector
      const img = document.querySelector("img");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute(
        "src",
        "https://i.ytimg.com/vi/abc123/default.jpg"
      );
    });

    it("renders placeholder when URL is undefined", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [
          createMockRequest("1", {
            thumbnail_url: undefined,
          }),
        ],
      });
      render(<SongRequestsModal />);

      // Should not render an img element
      expect(document.querySelector("img")).not.toBeInTheDocument();
      // Should render the placeholder div
      const placeholder = document.querySelector(".bg-gray-700");
      expect(placeholder).toBeInTheDocument();
    });

    it("renders placeholder when URL is HTTP (not HTTPS)", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [
          createMockRequest("1", {
            thumbnail_url: "http://example.com/image.jpg",
          }),
        ],
      });
      render(<SongRequestsModal />);

      // Should not render an img element for HTTP URLs
      expect(document.querySelector("img")).not.toBeInTheDocument();
      // Should render the placeholder div
      const placeholder = document.querySelector(".bg-gray-700");
      expect(placeholder).toBeInTheDocument();
    });

    it("renders placeholder when URL uses javascript: protocol (XSS attempt)", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [
          createMockRequest("1", {
            thumbnail_url: "javascript:alert('xss')",
          }),
        ],
      });
      render(<SongRequestsModal />);

      // Should not render an img element for javascript: URLs
      expect(document.querySelector("img")).not.toBeInTheDocument();
      // Should render the placeholder div
      const placeholder = document.querySelector(".bg-gray-700");
      expect(placeholder).toBeInTheDocument();
    });

    it("renders placeholder when URL uses data: protocol", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [
          createMockRequest("1", {
            thumbnail_url: "data:image/svg+xml,<svg onload='alert(1)'/>",
          }),
        ],
      });
      render(<SongRequestsModal />);

      // Should not render an img element for data: URLs
      expect(document.querySelector("img")).not.toBeInTheDocument();
    });

    it("renders placeholder when URL is malformed", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [
          createMockRequest("1", {
            thumbnail_url: "not-a-valid-url",
          }),
        ],
      });
      render(<SongRequestsModal />);

      // Should not render an img element for invalid URLs
      expect(document.querySelector("img")).not.toBeInTheDocument();
    });

    it("renders placeholder when URL is empty string", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [
          createMockRequest("1", {
            thumbnail_url: "",
          }),
        ],
      });
      render(<SongRequestsModal />);

      // Should not render an img element for empty URLs
      expect(document.querySelector("img")).not.toBeInTheDocument();
    });

    it("renders multiple thumbnails correctly based on validity", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [
          createMockRequest("1", {
            thumbnail_url: "https://example.com/valid.jpg",
          }),
          createMockRequest("2", {
            thumbnail_url: "javascript:alert('xss')",
          }),
          createMockRequest("3", {
            thumbnail_url: "https://example.com/another-valid.jpg",
          }),
        ],
      });
      render(<SongRequestsModal />);

      // Should only render 2 img elements (for the valid HTTPS URLs)
      // Image has alt="" which gives it role="presentation", so query by selector
      const images = document.querySelectorAll("img");
      expect(images).toHaveLength(2);
    });
  });

  describe("Modal visibility", () => {
    it("renders nothing when showRequestsModal is false", () => {
      setupMocks({ showRequestsModal: false });
      render(<SongRequestsModal />);

      expect(screen.queryByText("Song Requests")).not.toBeInTheDocument();
    });

    it("renders modal when showRequestsModal is true", () => {
      setupMocks({ showRequestsModal: true });
      render(<SongRequestsModal />);

      expect(screen.getByText("Song Requests")).toBeInTheDocument();
    });
  });

  describe("Empty state", () => {
    it("shows empty state when no pending requests", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [],
      });
      render(<SongRequestsModal />);

      expect(screen.getByText("No pending song requests")).toBeInTheDocument();
    });
  });

  describe("Loading state", () => {
    it("shows loading indicator when isLoadingRequests is true", () => {
      setupMocks({
        showRequestsModal: true,
        isLoadingRequests: true,
      });
      render(<SongRequestsModal />);

      expect(screen.getByTestId("loader-icon")).toBeInTheDocument();
    });
  });

  describe("Accessibility (SRA-033)", () => {
    it("modal container has role='dialog' attribute", () => {
      setupMocks({ showRequestsModal: true });
      render(<SongRequestsModal />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
    });

    it("modal container has aria-modal='true' attribute", () => {
      setupMocks({ showRequestsModal: true });
      render(<SongRequestsModal />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    it("modal container has aria-labelledby pointing to title element", () => {
      setupMocks({ showRequestsModal: true });
      render(<SongRequestsModal />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute(
        "aria-labelledby",
        "song-requests-modal-title"
      );
    });

    it("title element has correct id for aria-labelledby", () => {
      setupMocks({ showRequestsModal: true });
      render(<SongRequestsModal />);

      const title = screen.getByText("Song Requests");
      expect(title).toHaveAttribute("id", "song-requests-modal-title");
    });

    it("screen readers can identify modal as a dialog with correct title", () => {
      setupMocks({ showRequestsModal: true });
      render(<SongRequestsModal />);

      // getByRole with name option verifies the accessible name
      const dialog = screen.getByRole("dialog", { name: "Song Requests" });
      expect(dialog).toBeInTheDocument();
    });
  });

  describe("Broken thumbnail image handling (SRA-032)", () => {
    it("shows placeholder when image fails to load", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [
          createMockRequest("1", {
            thumbnail_url: "https://example.com/broken-image.jpg",
          }),
        ],
      });
      render(<SongRequestsModal />);

      // Initially the image should be present
      const img = document.querySelector("img");
      expect(img).toBeInTheDocument();

      // Simulate the image failing to load
      fireEvent.error(img!);

      // After error, image should be replaced with placeholder
      expect(document.querySelector("img")).not.toBeInTheDocument();
      const placeholder = document.querySelector(".bg-gray-700");
      expect(placeholder).toBeInTheDocument();
    });

    it("shows placeholder for broken image while keeping working images", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [
          createMockRequest("1", {
            thumbnail_url: "https://example.com/working.jpg",
          }),
          createMockRequest("2", {
            thumbnail_url: "https://example.com/broken.jpg",
          }),
        ],
      });
      render(<SongRequestsModal />);

      // Initially both images should be present
      const images = document.querySelectorAll("img");
      expect(images).toHaveLength(2);

      // Simulate the second image failing to load
      fireEvent.error(images[1]);

      // After error, only one image should remain
      const remainingImages = document.querySelectorAll("img");
      expect(remainingImages).toHaveLength(1);
      expect(remainingImages[0]).toHaveAttribute(
        "src",
        "https://example.com/working.jpg"
      );
    });

    it("tracks errors independently for each request", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [
          createMockRequest("1", {
            thumbnail_url: "https://example.com/img1.jpg",
          }),
          createMockRequest("2", {
            thumbnail_url: "https://example.com/img2.jpg",
          }),
          createMockRequest("3", {
            thumbnail_url: "https://example.com/img3.jpg",
          }),
        ],
      });
      render(<SongRequestsModal />);

      // Initially all three images should be present
      let images = document.querySelectorAll("img");
      expect(images).toHaveLength(3);

      // Simulate the first and third images failing
      fireEvent.error(images[0]);
      fireEvent.error(images[2]);

      // After errors, only the second image should remain
      images = document.querySelectorAll("img");
      expect(images).toHaveLength(1);
      expect(images[0]).toHaveAttribute(
        "src",
        "https://example.com/img2.jpg"
      );
    });
  });

  describe("Lazy loading for thumbnail images (SRA-051)", () => {
    it("thumbnail images have loading='lazy' attribute", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [
          createMockRequest("1", {
            thumbnail_url: "https://example.com/image1.jpg",
          }),
        ],
      });
      render(<SongRequestsModal />);

      const img = document.querySelector("img");
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("loading", "lazy");
    });

    it("all thumbnail images have loading='lazy' attribute with multiple requests", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [
          createMockRequest("1", {
            thumbnail_url: "https://example.com/image1.jpg",
          }),
          createMockRequest("2", {
            thumbnail_url: "https://example.com/image2.jpg",
          }),
          createMockRequest("3", {
            thumbnail_url: "https://example.com/image3.jpg",
          }),
        ],
      });
      render(<SongRequestsModal />);

      const images = document.querySelectorAll("img");
      expect(images).toHaveLength(3);

      // All images should have loading="lazy"
      images.forEach((img) => {
        expect(img).toHaveAttribute("loading", "lazy");
      });
    });
  });

  describe("Per-item loading spinners (SRA-038)", () => {
    it("shows check icon on approve button when not processing", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [createMockRequest("1")],
        processingRequestIds: new Set(),
      });
      render(<SongRequestsModal />);

      const approveButton = screen.getByRole("button", { name: "Approve request" });
      expect(approveButton.querySelector('[data-testid="check-icon"]')).toBeInTheDocument();
      expect(approveButton.querySelector('[data-testid="loader-icon"]')).not.toBeInTheDocument();
    });

    it("shows spinner on approve button when request is processing", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [createMockRequest("1")],
        processingRequestIds: new Set(["1"]),
      });
      render(<SongRequestsModal />);

      const approveButton = screen.getByRole("button", { name: "Approve request" });
      expect(approveButton.querySelector('[data-testid="loader-icon"]')).toBeInTheDocument();
      expect(approveButton.querySelector('[data-testid="check-icon"]')).not.toBeInTheDocument();
    });

    it("shows X icon on reject button when not processing", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [createMockRequest("1")],
        processingRequestIds: new Set(),
      });
      render(<SongRequestsModal />);

      const rejectButton = screen.getByRole("button", { name: "Reject request" });
      expect(rejectButton.querySelector('[data-testid="x-reject-icon"]')).toBeInTheDocument();
      expect(rejectButton.querySelector('[data-testid="loader-icon"]')).not.toBeInTheDocument();
    });

    it("shows spinner on reject button when request is processing", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [createMockRequest("1")],
        processingRequestIds: new Set(["1"]),
      });
      render(<SongRequestsModal />);

      const rejectButton = screen.getByRole("button", { name: "Reject request" });
      expect(rejectButton.querySelector('[data-testid="loader-icon"]')).toBeInTheDocument();
      expect(rejectButton.querySelector('[data-testid="x-reject-icon"]')).not.toBeInTheDocument();
    });

    it("disables approve button when request is processing", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [createMockRequest("1")],
        processingRequestIds: new Set(["1"]),
      });
      render(<SongRequestsModal />);

      const approveButton = screen.getByRole("button", { name: "Approve request" });
      expect(approveButton).toBeDisabled();
    });

    it("disables reject button when request is processing", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [createMockRequest("1")],
        processingRequestIds: new Set(["1"]),
      });
      render(<SongRequestsModal />);

      const rejectButton = screen.getByRole("button", { name: "Reject request" });
      expect(rejectButton).toBeDisabled();
    });

    it("enables buttons when request is not processing", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [createMockRequest("1")],
        processingRequestIds: new Set(),
      });
      render(<SongRequestsModal />);

      const approveButton = screen.getByRole("button", { name: "Approve request" });
      const rejectButton = screen.getByRole("button", { name: "Reject request" });
      expect(approveButton).not.toBeDisabled();
      expect(rejectButton).not.toBeDisabled();
    });

    it("shows spinner only for processing request, not others", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [
          createMockRequest("1"),
          createMockRequest("2"),
        ],
        processingRequestIds: new Set(["1"]),
      });
      render(<SongRequestsModal />);

      const approveButtons = screen.getAllByRole("button", { name: "Approve request" });
      const rejectButtons = screen.getAllByRole("button", { name: "Reject request" });

      // First request (id="1") should show spinners
      expect(approveButtons[0].querySelector('[data-testid="loader-icon"]')).toBeInTheDocument();
      expect(rejectButtons[0].querySelector('[data-testid="loader-icon"]')).toBeInTheDocument();

      // Second request (id="2") should show normal icons
      expect(approveButtons[1].querySelector('[data-testid="check-icon"]')).toBeInTheDocument();
      expect(rejectButtons[1].querySelector('[data-testid="x-reject-icon"]')).toBeInTheDocument();
    });
  });

  describe("Keyboard accessibility (SRA-050)", () => {
    it("closes modal when Escape key is pressed", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [createMockRequest("1")],
      });
      render(<SongRequestsModal />);

      // Verify modal is open
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // Press Escape key
      fireEvent.keyDown(document, { key: "Escape" });

      // Verify closeRequestsModal was called
      expect(mockSessionStore.closeRequestsModal).toHaveBeenCalled();
    });

    it("modal container has tabIndex for focusability", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [],
      });
      render(<SongRequestsModal />);

      const dialog = screen.getByRole("dialog");
      expect(dialog).toHaveAttribute("tabIndex", "-1");
    });

    it("traps focus when Tab pressed on last focusable element", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [createMockRequest("1")],
      });
      render(<SongRequestsModal />);

      // Get all buttons and find the last Approve All button (global one in footer)
      const allButtons = screen.getAllByRole("button");
      const globalApproveAllButton = allButtons[allButtons.length - 1];

      // Focus the last button
      globalApproveAllButton.focus();
      expect(document.activeElement).toBe(globalApproveAllButton);

      // Tab should wrap to first element (close button)
      fireEvent.keyDown(document, { key: "Tab" });

      // Close button should now have focus
      const closeButton = screen.getByRole("button", { name: "Close" });
      expect(document.activeElement).toBe(closeButton);
    });

    it("traps focus when Shift+Tab pressed on first focusable element", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [createMockRequest("1")],
      });
      render(<SongRequestsModal />);

      // Get the close button (first focusable element)
      const closeButton = screen.getByRole("button", { name: "Close" });

      // Focus the first button
      closeButton.focus();
      expect(document.activeElement).toBe(closeButton);

      // Shift+Tab should wrap to last element (global Approve All)
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

      // Global Approve All button should now have focus (last button)
      const allButtons = screen.getAllByRole("button");
      const globalApproveAllButton = allButtons[allButtons.length - 1];
      expect(document.activeElement).toBe(globalApproveAllButton);
    });

    it("closes modal when clicking backdrop", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [createMockRequest("1")],
      });
      render(<SongRequestsModal />);

      // Click the backdrop (the outer div with bg-black/50)
      const backdrop = document.querySelector('[data-tauri-drag-region]');
      fireEvent.click(backdrop!);

      // Verify closeRequestsModal was called
      expect(mockSessionStore.closeRequestsModal).toHaveBeenCalled();
    });

    it("does not close modal when clicking modal content", () => {
      setupMocks({
        showRequestsModal: true,
        pendingRequests: [createMockRequest("1")],
      });
      render(<SongRequestsModal />);

      // Click the dialog content
      const dialog = screen.getByRole("dialog");
      fireEvent.click(dialog);

      // Verify closeRequestsModal was NOT called (clicking content should not close)
      expect(mockSessionStore.closeRequestsModal).not.toHaveBeenCalled();
    });
  });
});
