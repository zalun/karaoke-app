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
} = {}) {
  mockSessionStore = {
    showRequestsModal: options.showRequestsModal ?? true,
    pendingRequests: options.pendingRequests ?? [],
    isLoadingRequests: options.isLoadingRequests ?? false,
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
});
