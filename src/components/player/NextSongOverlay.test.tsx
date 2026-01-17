import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
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

// =============================================================================
// Mock Instances
// =============================================================================

let mockPlayerStore = createMockPlayerStore();
let mockQueueStore = createMockQueueStore();
let mockSessionStore = createMockSessionStore();
let mockWindowManager = createMockWindowManager();

// Mock settings store
const mockSettingsStore = {
  getSetting: vi.fn((key: string): string | null => {
    if (key === "playback_mode") return "ytdlp";
    if (key === "autoplay_next") return "true";
    if (key === "next_song_overlay_seconds") return "20";
    if (key === "prefetch_seconds") return "20";
    return null;
  }),
};

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
  getStreamUrlWithCache: vi.fn(() => Promise.resolve("https://cached.stream.url")),
  invalidatePrefetchIfStale: vi.fn(),
  isEmbeddingError: () => false,
  notify: vi.fn(),
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
    getStreamUrl: vi.fn(() => Promise.resolve({ url: "https://stream.example.com/video" })),
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

// Mock child player components
vi.mock("./YouTubePlayer", () => ({
  YouTubePlayer: () => <div data-testid="youtube-player">YouTube Player</div>,
}));

vi.mock("./NativePlayer", () => ({
  NativePlayer: () => <div data-testid="native-player">Native Player</div>,
}));

// Real NextSongOverlay component (not mocked) to test overlay rendering
vi.mock("./NextSongOverlay", () => ({
  NextSongOverlay: ({ title }: { title: string }) => (
    <div data-testid="next-song-overlay">Up next: {title}</div>
  ),
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

describe("NextSongOverlay same-video check", () => {
  beforeEach(() => {
    resetMocks();
  });

  describe("when next queue item matches current video", () => {
    it("should not show overlay when YouTube video IDs match", () => {
      // Setup: current video playing with youtubeId "abc123"
      mockPlayerStore.currentVideo = {
        id: "video-1",
        title: "Current Song",
        youtubeId: "abc123",
        streamUrl: "https://stream.example.com/current",
        source: "youtube",
      };
      mockPlayerStore.isPlaying = true;
      mockPlayerStore.duration = 180; // 3 minutes
      mockPlayerStore.currentTime = 165; // 15 seconds remaining (within overlay threshold)

      // Queue has the same video (same youtubeId)
      mockQueueStore.queue = [
        {
          id: "queue-item-1",
          video: {
            id: "video-1",
            title: "Current Song",
            youtubeId: "abc123", // Same youtubeId as currentVideo
            source: "youtube",
          },
          addedAt: new Date(),
        },
      ];

      render(<VideoPlayer />);

      // Overlay should NOT be shown because next song is same as current
      expect(screen.queryByTestId("next-song-overlay")).not.toBeInTheDocument();
    });

    it("should not show overlay when local file paths match", () => {
      // Setup: current local file playing
      mockPlayerStore.currentVideo = {
        id: "/path/to/song.mp4",
        title: "Local Song",
        filePath: "/path/to/song.mp4",
        source: "local",
      };
      mockPlayerStore.isPlaying = true;
      mockPlayerStore.duration = 180;
      mockPlayerStore.currentTime = 165;

      // Queue has the same local file
      mockQueueStore.queue = [
        {
          id: "queue-item-1",
          video: {
            id: "/path/to/song.mp4",
            title: "Local Song",
            filePath: "/path/to/song.mp4", // Same filePath as currentVideo
            source: "local",
          },
          addedAt: new Date(),
        },
      ];

      render(<VideoPlayer />);

      // Overlay should NOT be shown because next song is same as current
      expect(screen.queryByTestId("next-song-overlay")).not.toBeInTheDocument();
    });
  });

  describe("when next queue item is different from current video", () => {
    it("should show overlay when YouTube video IDs differ", () => {
      // Setup: current video playing
      mockPlayerStore.currentVideo = {
        id: "video-1",
        title: "Current Song",
        youtubeId: "abc123",
        streamUrl: "https://stream.example.com/current",
        source: "youtube",
      };
      mockPlayerStore.isPlaying = true;
      mockPlayerStore.duration = 180;
      mockPlayerStore.currentTime = 165; // Within overlay threshold
      mockPlayerStore.isLoading = false;

      // Queue has a different video
      mockQueueStore.queue = [
        {
          id: "queue-item-2",
          video: {
            id: "video-2",
            title: "Next Song",
            youtubeId: "def456", // Different youtubeId
            source: "youtube",
          },
          addedAt: new Date(),
        },
      ];

      render(<VideoPlayer />);

      // Overlay SHOULD be shown because next song is different
      expect(screen.getByTestId("next-song-overlay")).toBeInTheDocument();
      expect(screen.getByText("Up next: Next Song")).toBeInTheDocument();
    });

    it("should show overlay when local file paths differ", () => {
      // Setup: current local file playing
      mockPlayerStore.currentVideo = {
        id: "/path/to/song1.mp4",
        title: "Local Song 1",
        filePath: "/path/to/song1.mp4",
        source: "local",
      };
      mockPlayerStore.isPlaying = true;
      mockPlayerStore.duration = 180;
      mockPlayerStore.currentTime = 165;
      mockPlayerStore.isLoading = false;

      // Queue has a different local file
      mockQueueStore.queue = [
        {
          id: "queue-item-2",
          video: {
            id: "/path/to/song2.mp4",
            title: "Local Song 2",
            filePath: "/path/to/song2.mp4", // Different filePath
            source: "local",
          },
          addedAt: new Date(),
        },
      ];

      render(<VideoPlayer />);

      // Overlay SHOULD be shown because next song is different
      expect(screen.getByTestId("next-song-overlay")).toBeInTheDocument();
      expect(screen.getByText("Up next: Local Song 2")).toBeInTheDocument();
    });
  });

  describe("edge cases", () => {
    it("should not show overlay when queue is empty", () => {
      mockPlayerStore.currentVideo = {
        id: "video-1",
        title: "Current Song",
        youtubeId: "abc123",
        streamUrl: "https://stream.example.com/current",
        source: "youtube",
      };
      mockPlayerStore.isPlaying = true;
      mockPlayerStore.duration = 180;
      mockPlayerStore.currentTime = 165;

      mockQueueStore.queue = []; // Empty queue

      render(<VideoPlayer />);

      expect(screen.queryByTestId("next-song-overlay")).not.toBeInTheDocument();
    });

    it("should not show overlay when not within time threshold", () => {
      mockPlayerStore.currentVideo = {
        id: "video-1",
        title: "Current Song",
        youtubeId: "abc123",
        streamUrl: "https://stream.example.com/current",
        source: "youtube",
      };
      mockPlayerStore.isPlaying = true;
      mockPlayerStore.duration = 180;
      mockPlayerStore.currentTime = 60; // 2 minutes remaining (outside threshold)

      mockQueueStore.queue = [
        {
          id: "queue-item-2",
          video: {
            id: "video-2",
            title: "Next Song",
            youtubeId: "def456",
            source: "youtube",
          },
          addedAt: new Date(),
        },
      ];

      render(<VideoPlayer />);

      expect(screen.queryByTestId("next-song-overlay")).not.toBeInTheDocument();
    });
  });
});
