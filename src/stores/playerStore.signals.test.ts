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
    PLAYBACK_STARTED: "app:playback-started",
    PLAYBACK_PAUSED: "app:playback-paused",
    PLAYBACK_ENDED: "app:playback-ended",
    VIDEO_METADATA_CHANGED: "app:video-metadata-changed",
  },
}));

// Mock platform detection
vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn(() => "macos"),
}));

// Import after mocking
import { usePlayerStore, playVideo, stopVideo, pausePlayback, resumePlayback, notifyPlaybackEnded, emitVideoMetadataChanged, type Video } from "./playerStore";
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
      lastMetadataVideoId: null,
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

      // Should emit SONG_STOPPED (for old video), then VIDEO_METADATA_CHANGED, SONG_STARTED and PLAYBACK_STARTED (for new video)
      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.SONG_STOPPED, undefined);
      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.VIDEO_METADATA_CHANGED, expect.any(Object));
      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.SONG_STARTED, undefined);
      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.PLAYBACK_STARTED, undefined);
      expect(emitSignal).toHaveBeenCalledTimes(4);
    });
  });

  describe("PLAYBACK_STARTED signal", () => {
    it("should emit PLAYBACK_STARTED signal when video starts via playVideo", async () => {
      await playVideo(mockVideo);

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.PLAYBACK_STARTED, undefined);
    });

    it("should emit PLAYBACK_STARTED signal when resuming playback", async () => {
      // Set up paused video
      usePlayerStore.setState({
        currentVideo: mockVideo,
        isPlaying: false,
      });

      await resumePlayback();

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.PLAYBACK_STARTED, undefined);
      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });

    it("should not emit PLAYBACK_STARTED signal when no video is loaded", async () => {
      usePlayerStore.setState({
        currentVideo: null,
        isPlaying: false,
      });

      await resumePlayback();

      expect(emitSignal).not.toHaveBeenCalled();
    });

    it("should not emit PLAYBACK_STARTED signal when already playing", async () => {
      usePlayerStore.setState({
        currentVideo: mockVideo,
        isPlaying: true,
      });

      await resumePlayback();

      expect(emitSignal).not.toHaveBeenCalled();
    });
  });

  describe("PLAYBACK_PAUSED signal", () => {
    it("should emit PLAYBACK_PAUSED signal when pausing playback", async () => {
      // Set up playing video
      usePlayerStore.setState({
        currentVideo: mockVideo,
        isPlaying: true,
      });

      await pausePlayback();

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.PLAYBACK_PAUSED, undefined);
      expect(usePlayerStore.getState().isPlaying).toBe(false);
    });

    it("should not emit PLAYBACK_PAUSED signal when no video is playing", async () => {
      usePlayerStore.setState({
        currentVideo: null,
        isPlaying: false,
      });

      await pausePlayback();

      expect(emitSignal).not.toHaveBeenCalled();
    });

    it("should not emit PLAYBACK_PAUSED signal when video is already paused", async () => {
      usePlayerStore.setState({
        currentVideo: mockVideo,
        isPlaying: false,
      });

      await pausePlayback();

      expect(emitSignal).not.toHaveBeenCalled();
    });
  });

  describe("PLAYBACK_ENDED signal", () => {
    it("should emit PLAYBACK_ENDED signal via notifyPlaybackEnded", async () => {
      await notifyPlaybackEnded();

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.PLAYBACK_ENDED, undefined);
    });
  });

  describe("VIDEO_METADATA_CHANGED signal", () => {
    it("should emit VIDEO_METADATA_CHANGED signal when new video is played", async () => {
      await playVideo(mockVideo);

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.VIDEO_METADATA_CHANGED, {
        title: mockVideo.title,
        artist: mockVideo.artist,
        duration: mockVideo.duration,
        videoId: mockVideo.youtubeId,
      });
    });

    it("should emit VIDEO_METADATA_CHANGED signal via emitVideoMetadataChanged", async () => {
      await emitVideoMetadataChanged(mockVideo);

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.VIDEO_METADATA_CHANGED, {
        title: mockVideo.title,
        artist: mockVideo.artist,
        duration: mockVideo.duration,
        videoId: mockVideo.youtubeId,
      });
      expect(usePlayerStore.getState().lastMetadataVideoId).toBe(mockVideo.youtubeId);
    });

    it("should NOT emit VIDEO_METADATA_CHANGED signal for same video replay", async () => {
      // First play - should emit
      await emitVideoMetadataChanged(mockVideo);
      expect(emitSignal).toHaveBeenCalledTimes(1);

      // Clear mocks to check next call
      vi.clearAllMocks();

      // Second play of same video - should NOT emit
      await emitVideoMetadataChanged(mockVideo);
      expect(emitSignal).not.toHaveBeenCalled();
    });

    it("should emit VIDEO_METADATA_CHANGED signal when switching to different video", async () => {
      // First video
      await emitVideoMetadataChanged(mockVideo);
      expect(emitSignal).toHaveBeenCalledTimes(1);

      vi.clearAllMocks();

      // Different video
      const newVideo: Video = {
        id: "video-2",
        title: "New Song",
        artist: "New Artist",
        duration: 180,
        source: "youtube",
        youtubeId: "xyz789",
      };

      await emitVideoMetadataChanged(newVideo);

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.VIDEO_METADATA_CHANGED, {
        title: newVideo.title,
        artist: newVideo.artist,
        duration: newVideo.duration,
        videoId: newVideo.youtubeId,
      });
      expect(usePlayerStore.getState().lastMetadataVideoId).toBe(newVideo.youtubeId);
    });

    it("should use id as videoId when youtubeId is not available", async () => {
      const localVideo: Video = {
        id: "local-video-1",
        title: "Local Song",
        source: "local",
        // No youtubeId
      };

      await emitVideoMetadataChanged(localVideo);

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.VIDEO_METADATA_CHANGED, {
        title: localVideo.title,
        artist: undefined,
        duration: undefined,
        videoId: localVideo.id,
      });
    });
  });
});
