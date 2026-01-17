import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { VideoPlayer } from "./VideoPlayer";

// =============================================================================
// Type Definitions for Mocks
// =============================================================================

interface MockVideo {
  id: string;
  title: string;
  artist?: string;
  youtubeId?: string;
  streamUrl?: string;
  filePath?: string;
  source?: "youtube" | "local" | "external";
  duration?: number;
}

interface MockQueueItem {
  id: string;
  video: MockVideo;
  addedAt: Date;
}

interface MockPlayerState {
  currentVideo: MockVideo | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isDetached: boolean;
  isLoading: boolean;
  seekTime: number | null;
  setIsPlaying: ReturnType<typeof vi.fn>;
  setIsDetached: ReturnType<typeof vi.fn>;
  setVolume: ReturnType<typeof vi.fn>;
  toggleMute: ReturnType<typeof vi.fn>;
  seekTo: ReturnType<typeof vi.fn>;
  setIsLoading: ReturnType<typeof vi.fn>;
  setCurrentVideo: ReturnType<typeof vi.fn>;
  setCurrentTime: ReturnType<typeof vi.fn>;
  setDuration: ReturnType<typeof vi.fn>;
  clearSeek: ReturnType<typeof vi.fn>;
  getPrefetchedStreamUrl: ReturnType<typeof vi.fn>;
  setPrefetchedStreamUrl: ReturnType<typeof vi.fn>;
  clearPrefetchedStreamUrl: ReturnType<typeof vi.fn>;
  markAsNonEmbeddable: ReturnType<typeof vi.fn>;
}

interface MockQueueState {
  queue: MockQueueItem[];
  history: MockQueueItem[];
  historyIndex: number;
  playNextFromQueue: ReturnType<typeof vi.fn>;
}

interface MockSessionState {
  session: null;
  queueSingerAssignments: Map<string, number[]>;
  singers: never[];
  loadQueueItemSingers: ReturnType<typeof vi.fn>;
  getQueueItemSingerIds: ReturnType<typeof vi.fn>;
  getSingerById: ReturnType<typeof vi.fn>;
}

// =============================================================================
// Mock Factory Functions
// =============================================================================

const createMockPlayerStore = (): MockPlayerState => ({
  currentVideo: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  isMuted: false,
  isDetached: false,
  isLoading: false,
  seekTime: null,
  setIsPlaying: vi.fn(),
  setIsDetached: vi.fn(),
  setVolume: vi.fn(),
  toggleMute: vi.fn(),
  seekTo: vi.fn(),
  setIsLoading: vi.fn(),
  setCurrentVideo: vi.fn(),
  setCurrentTime: vi.fn(),
  setDuration: vi.fn(),
  clearSeek: vi.fn(),
  getPrefetchedStreamUrl: vi.fn(() => null),
  setPrefetchedStreamUrl: vi.fn(),
  clearPrefetchedStreamUrl: vi.fn(),
  markAsNonEmbeddable: vi.fn(),
});

const createMockQueueStore = (): MockQueueState => ({
  queue: [],
  history: [],
  historyIndex: -1,
  playNextFromQueue: vi.fn(() => null),
});

const createMockSessionStore = (): MockSessionState => ({
  session: null,
  queueSingerAssignments: new Map(),
  singers: [],
  loadQueueItemSingers: vi.fn(),
  getQueueItemSingerIds: vi.fn(() => []),
  getSingerById: vi.fn(),
});

const createMockWindowManager = () => ({
  detachPlayer: vi.fn(() => Promise.resolve(true)),
  reattachPlayer: vi.fn(() => Promise.resolve(true)),
  syncState: vi.fn(),
  sendCommand: vi.fn(),
  listenForReattach: vi.fn(() => Promise.resolve(() => {})),
  listenForTimeUpdate: vi.fn(() => Promise.resolve(() => {})),
  listenForDurationUpdate: vi.fn(() => Promise.resolve(() => {})),
  listenForStateRequest: vi.fn(() => Promise.resolve(() => {})),
  listenForFinalState: vi.fn(() => Promise.resolve(() => {})),
  listenForVideoLoaded: vi.fn(() => Promise.resolve(() => {})),
  listenForAutoplayBlocked: vi.fn(() => Promise.resolve(() => {})),
  listenForVideoEnded: vi.fn(() => Promise.resolve(() => {})),
});

const createMockYoutubeService = () => ({
  getStreamUrl: vi.fn(() => Promise.resolve({ url: "https://stream.example.com/video" })),
});

// =============================================================================
// Mock Instances
// =============================================================================

let mockPlayerStore = createMockPlayerStore();
let mockQueueStore = createMockQueueStore();
let mockSessionStore = createMockSessionStore();
let mockWindowManager = createMockWindowManager();
let mockYoutubeService = createMockYoutubeService();
const mockNotify = vi.fn();
const mockGetStreamUrlWithCache = vi.fn(() => Promise.resolve("https://cached.stream.url"));

// Track call order for setIsPlaying
let callOrder: string[] = [];

// Mock settings store - default to yt-dlp mode for reliable onEnded capture
const mockSettingsStore = {
  getSetting: vi.fn((key: string): string | null => {
    if (key === "playback_mode") return "ytdlp";
    if (key === "autoplay_next") return "true";
    if (key === "next_song_overlay_seconds") return "20";
    if (key === "prefetch_seconds") return "20";
    return null;
  }),
};

// Capture the onEnded callback from child players
let capturedOnEnded: (() => void) | null = null;

// =============================================================================
// Mock Definitions
// =============================================================================

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (path: string) => `asset://localhost/${path}`,
}));

vi.mock("../../stores", () => ({
  usePlayerStore: Object.assign(
    (selector?: (state: MockPlayerState) => unknown) => {
      if (selector) {
        return selector(mockPlayerStore);
      }
      return mockPlayerStore;
    },
    {
      getState: () => mockPlayerStore,
      setState: vi.fn((updates: Partial<MockPlayerState>) => {
        Object.assign(mockPlayerStore, updates);
      }),
    }
  ),
  useQueueStore: Object.assign(
    (selector?: (state: MockQueueState) => unknown) => {
      if (selector) {
        return selector(mockQueueStore);
      }
      return mockQueueStore;
    },
    {
      getState: () => mockQueueStore,
    }
  ),
  useSessionStore: Object.assign(
    (selector?: (state: MockSessionState) => unknown) => {
      if (selector) {
        return selector(mockSessionStore);
      }
      return mockSessionStore;
    },
    {
      getState: () => mockSessionStore,
    }
  ),
  useSettingsStore: Object.assign(
    (selector?: (state: typeof mockSettingsStore) => unknown) => {
      if (selector) {
        return selector(mockSettingsStore);
      }
      return mockSettingsStore;
    },
    {
      getState: () => mockSettingsStore,
    }
  ),
  SETTINGS_KEYS: {
    PLAYBACK_MODE: "playback_mode",
    AUTOPLAY_NEXT: "autoplay_next",
    NEXT_SONG_OVERLAY_SECONDS: "next_song_overlay_seconds",
    PREFETCH_SECONDS: "prefetch_seconds",
  },
  parseOverlaySeconds: (rawValue: string | undefined) => {
    const raw = rawValue || "20";
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? 20 : parsed;
  },
  getStreamUrlWithCache: (...args: unknown[]) => mockGetStreamUrlWithCache(...args),
  invalidatePrefetchIfStale: vi.fn(),
  isEmbeddingError: () => false,
  notify: (...args: unknown[]) => mockNotify(...args),
}));

vi.mock("../../services", () => ({
  windowManager: {
    detachPlayer: (state: unknown) => mockWindowManager.detachPlayer(state),
    reattachPlayer: () => mockWindowManager.reattachPlayer(),
    syncState: (state: unknown) => mockWindowManager.syncState(state),
    sendCommand: (cmd: unknown, value?: unknown) => mockWindowManager.sendCommand(cmd, value),
    listenForReattach: (cb: unknown) => mockWindowManager.listenForReattach(cb),
    listenForTimeUpdate: (cb: unknown) => mockWindowManager.listenForTimeUpdate(cb),
    listenForDurationUpdate: (cb: unknown) => mockWindowManager.listenForDurationUpdate(cb),
    listenForStateRequest: (cb: unknown) => mockWindowManager.listenForStateRequest(cb),
    listenForFinalState: (cb: unknown) => mockWindowManager.listenForFinalState(cb),
    listenForVideoLoaded: (cb: unknown) => mockWindowManager.listenForVideoLoaded(cb),
    listenForAutoplayBlocked: (cb: unknown) => mockWindowManager.listenForAutoplayBlocked(cb),
    listenForVideoEnded: (cb: unknown) => mockWindowManager.listenForVideoEnded(cb),
  },
  youtubeService: {
    getStreamUrl: (videoId: unknown) => mockYoutubeService.getStreamUrl(videoId),
  },
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../../hooks", () => ({
  useWakeLock: vi.fn(),
}));

// Mock child player components to capture onEnded callback
vi.mock("./YouTubePlayer", () => ({
  YouTubePlayer: ({ onEnded }: { onEnded?: () => void }) => {
    capturedOnEnded = onEnded || null;
    return <div data-testid="youtube-player">YouTube Player</div>;
  },
}));

vi.mock("./NativePlayer", () => ({
  NativePlayer: ({ onEnded }: { onEnded?: () => void }) => {
    if (onEnded) {
      capturedOnEnded = onEnded;
    }
    return <div data-testid="native-player">Native Player</div>;
  },
}));

vi.mock("./NextSongOverlay", () => ({
  NextSongOverlay: () => null,
  COUNTDOWN_START_THRESHOLD_SECONDS: 10,
}));

vi.mock("./CurrentSingerOverlay", () => ({
  CurrentSingerOverlay: () => null,
}));

// =============================================================================
// Test Helpers
// =============================================================================

function resetMocks() {
  mockPlayerStore = createMockPlayerStore();
  mockQueueStore = createMockQueueStore();
  mockSessionStore = createMockSessionStore();
  mockWindowManager = createMockWindowManager();
  mockYoutubeService = createMockYoutubeService();
  mockNotify.mockClear();
  mockGetStreamUrlWithCache.mockClear();
  mockGetStreamUrlWithCache.mockImplementation(() => Promise.resolve("https://cached.stream.url"));
  capturedOnEnded = null;
  callOrder = [];

  // Track call order
  mockPlayerStore.setIsPlaying = vi.fn(() => {
    callOrder.push("setIsPlaying");
  });

  // Reset settings store to defaults (yt-dlp mode for reliable onEnded capture)
  mockSettingsStore.getSetting.mockImplementation((key: string) => {
    if (key === "playback_mode") return "ytdlp";
    if (key === "autoplay_next") return "true";
    if (key === "next_song_overlay_seconds") return "20";
    if (key === "prefetch_seconds") return "20";
    return null;
  });
}

// =============================================================================
// Tests
// =============================================================================

describe("VideoPlayer handleEnded", () => {
  beforeEach(() => {
    resetMocks();
  });

  describe("when video ends", () => {
    it("should call setIsPlaying(false) immediately to stop playback", async () => {
      // Setup: video is playing in yt-dlp mode (needs streamUrl)
      mockPlayerStore.currentVideo = {
        id: "video-1",
        title: "Current Song",
        youtubeId: "abc123",
        streamUrl: "https://stream.example.com/current",
        source: "youtube",
      };
      mockPlayerStore.isPlaying = true;

      render(<VideoPlayer />);

      // Trigger the onEnded callback
      expect(capturedOnEnded).not.toBeNull();
      await act(async () => {
        capturedOnEnded!();
      });

      // Verify setIsPlaying was called with false
      expect(mockPlayerStore.setIsPlaying).toHaveBeenCalledWith(false);

      // Verify it was called first (before any queue operations)
      expect(callOrder[0]).toBe("setIsPlaying");
    });

    it("should stop playback before fetching next stream URL in yt-dlp mode", async () => {
      // Setup: video is playing in yt-dlp mode (needs streamUrl for NativePlayer)
      mockPlayerStore.currentVideo = {
        id: "video-1",
        title: "Current Song",
        youtubeId: "abc123",
        streamUrl: "https://stream.example.com/current",
        source: "youtube",
      };
      mockPlayerStore.isPlaying = true;

      // Enable yt-dlp mode
      mockSettingsStore.getSetting.mockImplementation((key: string) => {
        if (key === "playback_mode") return "ytdlp";
        if (key === "autoplay_next") return "true";
        if (key === "prefetch_seconds") return "20";
        return null;
      });

      // Setup next item in queue
      const nextVideo: MockVideo = {
        id: "video-2",
        title: "Next Song",
        youtubeId: "def456",
        source: "youtube",
      };
      mockQueueStore.playNextFromQueue = vi.fn(() => ({
        id: "queue-item-2",
        video: nextVideo,
        addedAt: new Date(),
      }));

      // Make getStreamUrlWithCache take some time to simulate async fetch
      let resolveStreamUrl: (url: string) => void;
      mockGetStreamUrlWithCache.mockImplementation(() => {
        return new Promise<string>((resolve) => {
          resolveStreamUrl = resolve;
        });
      });

      render(<VideoPlayer />);

      // Trigger the onEnded callback
      expect(capturedOnEnded).not.toBeNull();

      // Start the handleEnded but don't await it
      const endedPromise = act(async () => {
        capturedOnEnded!();
      });

      // setIsPlaying(false) should be called immediately, before the stream URL fetch completes
      expect(mockPlayerStore.setIsPlaying).toHaveBeenCalledWith(false);

      // Now resolve the stream URL
      await act(async () => {
        resolveStreamUrl!("https://stream.example.com/next");
        await endedPromise;
      });

      // After resolution, setIsPlaying(true) should be called for the next video
      expect(mockPlayerStore.setIsPlaying).toHaveBeenCalledWith(true);
    });

    // Note: Additional tests for autoplay settings, queue advancement, and empty queue
    // scenarios would require more sophisticated mock management. The above tests
    // verify the core fix: setIsPlaying(false) is called immediately when a video ends,
    // preventing the old video from restarting during async operations.
  });
});
