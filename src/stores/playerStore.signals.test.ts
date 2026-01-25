import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the services module before any imports that use it
vi.mock("../services", () => ({
  youtubeService: {
    getStreamUrl: vi.fn(() => Promise.resolve({ url: "https://example.com/stream" })),
  },
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  emitSignal: vi.fn().mockResolvedValue(undefined),
  APP_SIGNALS: {
    SONG_STARTED: "app:song-started",
    SONG_STOPPED: "app:song-stopped",
    SONG_ENDED: "app:song-ended",
  },
}));

// Mock platform detection
vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn(() => "macos"),
}));

// Import after mocking
import { usePlayerStore, playVideo, stopVideo, type Video } from "./playerStore";
import { useSettingsStore, SETTINGS_KEYS } from "./settingsStore";
import { emitSignal, APP_SIGNALS } from "../services";

const mockVideo: Video = {
  id: "video-1",
  title: "Test Song",
  artist: "Test Artist",
  source: "youtube",
  youtubeId: "abc123",
};

describe("playerStore signal emissions", () => {
  beforeEach(() => {
    // Reset player store to initial state
    usePlayerStore.setState({
      currentVideo: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      volume: 1,
      isMuted: false,
      isFullscreen: false,
      isLoading: false,
      isDetached: false,
      seekTime: null,
      prefetchedStreamUrl: null,
      nonEmbeddableVideoIds: new Set<string>(),
    });

    // Set default playback mode to YouTube embed
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        [SETTINGS_KEYS.PLAYBACK_MODE]: "youtube",
      },
      ytDlpAvailable: false,
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  describe("SONG_STARTED signal", () => {
    it("should emit SONG_STARTED signal when video starts playing via YouTube embed", async () => {
      await playVideo(mockVideo);

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.SONG_STARTED, undefined);
      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });

    it("should emit SONG_STARTED signal when video starts playing via yt-dlp", async () => {
      // Enable yt-dlp mode
      useSettingsStore.setState({
        settings: {
          ...useSettingsStore.getState().settings,
          [SETTINGS_KEYS.PLAYBACK_MODE]: "ytdlp",
        },
        ytDlpAvailable: true,
      });

      await playVideo(mockVideo);

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.SONG_STARTED, undefined);
      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });

    it("should not emit SONG_STARTED signal when video has no youtubeId", async () => {
      const videoWithoutId: Video = {
        id: "video-2",
        title: "Test Song",
        source: "local",
      };

      await playVideo(videoWithoutId);

      expect(emitSignal).not.toHaveBeenCalled();
    });
  });

  describe("SONG_STOPPED signal", () => {
    it("should emit SONG_STOPPED signal when video is manually stopped", async () => {
      // First, set up a playing video
      usePlayerStore.setState({
        currentVideo: mockVideo,
        isPlaying: true,
      });

      await stopVideo();

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.SONG_STOPPED, undefined);
      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });

    it("should not emit SONG_STOPPED signal when no video is playing", async () => {
      // No video loaded
      usePlayerStore.setState({
        currentVideo: null,
        isPlaying: false,
      });

      await stopVideo();

      expect(emitSignal).not.toHaveBeenCalled();
    });

    it("should not emit SONG_STOPPED signal when video is already paused", async () => {
      // Video loaded but not playing
      usePlayerStore.setState({
        currentVideo: mockVideo,
        isPlaying: false,
      });

      await stopVideo();

      expect(emitSignal).not.toHaveBeenCalled();
    });

    it("should emit SONG_STOPPED signal when switching to a new video", async () => {
      // Set up initial playing video
      usePlayerStore.setState({
        currentVideo: mockVideo,
        isPlaying: true,
      });

      // Play a new video (should stop the current one first)
      const newVideo: Video = {
        id: "video-2",
        title: "New Song",
        artist: "New Artist",
        source: "youtube",
        youtubeId: "xyz789",
      };

      await playVideo(newVideo);

      // Should emit SONG_STOPPED (for old video) and then SONG_STARTED (for new video)
      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.SONG_STOPPED, undefined);
      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.SONG_STARTED, undefined);
      expect(emitSignal).toHaveBeenCalledTimes(2);
    });
  });
});
