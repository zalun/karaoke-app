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

  describe("Separate audio stream", () => {
    it("renders an audio element for the audio URL", () => {
      render(<NativePlayer {...defaultProps} audioUrl="https://example.com/audio.m4a" />);

      expect(document.querySelector("audio")?.src).toBe("https://example.com/audio.m4a");
    });

    it("renders no audio element without an audio URL", () => {
      render(<NativePlayer {...defaultProps} />);

      expect(document.querySelector("audio")).not.toBeInTheDocument();
    });

    it("starts split-stream playback on loadedmetadata without waiting for canplay", () => {
      const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      render(<NativePlayer {...defaultProps} isPlaying audioUrl="https://example.com/audio.m4a" />);

      document.querySelector("video")!.dispatchEvent(new Event("loadedmetadata"));

      expect(play).toHaveBeenCalled();
      play.mockRestore();
    });

    it("waits for canplay on loadedmetadata when there is no separate audio", () => {
      const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      render(<NativePlayer {...defaultProps} isPlaying />);

      document.querySelector("video")!.dispatchEvent(new Event("loadedmetadata"));

      expect(play).not.toHaveBeenCalled();
      play.mockRestore();
    });

    it("starts a split stream loaded while paused when play is pressed later", () => {
      const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
      const props = { ...defaultProps, audioUrl: "https://example.com/audio.m4a" };
      const { rerender } = render(<NativePlayer {...props} isPlaying={false} />);
      const video = document.querySelector("video")!;
      Object.defineProperty(video, "readyState", { configurable: true, value: 1 });

      video.dispatchEvent(new Event("loadedmetadata"));
      expect(play).not.toHaveBeenCalled();

      rerender(<NativePlayer {...props} isPlaying />);
      expect(play).toHaveBeenCalled();
      play.mockRestore();
    });

    it("reports only the first error when video and audio fail together", () => {
      const onError = vi.fn();
      render(<NativePlayer {...defaultProps} onError={onError} audioUrl="https://example.com/audio.m4a" />);

      document.querySelector("video")!.dispatchEvent(new Event("error"));
      document.querySelector("audio")!.dispatchEvent(new Event("error"));

      expect(onError).toHaveBeenCalledTimes(1);
    });

    it("shows error for an unsafe audio URL", () => {
      render(<NativePlayer {...defaultProps} audioUrl="javascript:alert('xss')" />);

      expect(screen.getByText("Invalid Stream URL")).toBeInTheDocument();
    });
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
