import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NativePlayer } from "./NativePlayer";

// Mock the logger
vi.mock("../../services", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("NativePlayer", () => {
  const defaultProps = {
    streamUrl: "https://example.com/video.mp4",
    isPlaying: false,
    volume: 1,
    isMuted: false,
    seekTime: null,
    onReady: vi.fn(),
    onTimeUpdate: vi.fn(),
    onEnded: vi.fn(),
    onError: vi.fn(),
    onDurationChange: vi.fn(),
    onClearSeek: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("URL Validation", () => {
    it("renders video element with valid HTTPS URL", () => {
      render(<NativePlayer {...defaultProps} streamUrl="https://example.com/video.mp4" />);

      const video = document.querySelector("video");
      expect(video).toBeInTheDocument();
      expect(video?.src).toBe("https://example.com/video.mp4");
    });

    it("renders video element with valid HTTP URL", () => {
      render(<NativePlayer {...defaultProps} streamUrl="http://example.com/video.mp4" />);

      const video = document.querySelector("video");
      expect(video).toBeInTheDocument();
      expect(video?.src).toBe("http://example.com/video.mp4");
    });

    it("shows error for javascript: URL (XSS prevention)", () => {
      render(<NativePlayer {...defaultProps} streamUrl="javascript:alert('xss')" />);

      expect(screen.getByText("Invalid Stream URL")).toBeInTheDocument();
      expect(document.querySelector("video")).not.toBeInTheDocument();
    });

    it("shows error for data: URL", () => {
      render(<NativePlayer {...defaultProps} streamUrl="data:text/html,<script>alert('xss')</script>" />);

      expect(screen.getByText("Invalid Stream URL")).toBeInTheDocument();
      expect(document.querySelector("video")).not.toBeInTheDocument();
    });

    it("shows error for file: URL", () => {
      render(<NativePlayer {...defaultProps} streamUrl="file:///etc/passwd" />);

      expect(screen.getByText("Invalid Stream URL")).toBeInTheDocument();
      expect(document.querySelector("video")).not.toBeInTheDocument();
    });

    it("shows error for invalid URL format", () => {
      render(<NativePlayer {...defaultProps} streamUrl="not-a-valid-url" />);

      expect(screen.getByText("Invalid Stream URL")).toBeInTheDocument();
      expect(document.querySelector("video")).not.toBeInTheDocument();
    });

    it("shows error for empty URL", () => {
      render(<NativePlayer {...defaultProps} streamUrl="" />);

      expect(screen.getByText("Invalid Stream URL")).toBeInTheDocument();
      expect(document.querySelector("video")).not.toBeInTheDocument();
    });
  });

  describe("Loading State", () => {
    it("shows loading spinner while loading", () => {
      render(<NativePlayer {...defaultProps} />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });
  });

  describe("Props Application", () => {
    it("applies className to container", () => {
      const { container } = render(
        <NativePlayer {...defaultProps} className="custom-class" />
      );

      expect(container.firstChild).toHaveClass("custom-class");
    });
  });
});
