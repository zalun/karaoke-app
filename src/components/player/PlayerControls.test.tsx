import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlayerControls } from "./PlayerControls";

// =============================================================================
// Type Definitions for Mocks
// =============================================================================

interface MockVideo {
  id: string;
  title: string;
  artist?: string;
  youtubeId?: string;
  streamUrl?: string;
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
  error: string | null;
  setIsPlaying: ReturnType<typeof vi.fn>;
  setIsDetached: ReturnType<typeof vi.fn>;
  setVolume: ReturnType<typeof vi.fn>;
  toggleMute: ReturnType<typeof vi.fn>;
  seekTo: ReturnType<typeof vi.fn>;
  setIsLoading: ReturnType<typeof vi.fn>;
  setCurrentVideo: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
}

interface MockQueueState {
  queue: MockQueueItem[];
  hasNext: ReturnType<typeof vi.fn>;
  hasPrevious: ReturnType<typeof vi.fn>;
  playNext: ReturnType<typeof vi.fn>;
  playPrevious: ReturnType<typeof vi.fn>;
  getCurrentItem: ReturnType<typeof vi.fn>;
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
  error: null,
  setIsPlaying: vi.fn(),
  setIsDetached: vi.fn(),
  setVolume: vi.fn(),
  toggleMute: vi.fn(),
  seekTo: vi.fn(),
  setIsLoading: vi.fn(),
  setCurrentVideo: vi.fn(),
  setError: vi.fn(),
});

const createMockQueueStore = (): MockQueueState => ({
  queue: [],
  hasNext: vi.fn(() => false),
  hasPrevious: vi.fn(() => false),
  playNext: vi.fn(),
  playPrevious: vi.fn(),
  getCurrentItem: vi.fn((): MockQueueItem | null => null),
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
  detachPlayer: vi.fn((_state: unknown) => Promise.resolve(true)),
  reattachPlayer: vi.fn(() => Promise.resolve(true)),
  syncState: vi.fn((_state: unknown) => {}),
  sendCommand: vi.fn((_cmd: unknown, _value?: unknown) => {}),
  listenForReattach: vi.fn((_cb: unknown) => Promise.resolve(() => {})),
  listenForTimeUpdate: vi.fn((_cb: unknown) => Promise.resolve(() => {})),
  listenForDurationUpdate: vi.fn((_cb: unknown) => Promise.resolve(() => {})),
  listenForStateRequest: vi.fn((_cb: unknown) => Promise.resolve(() => {})),
  listenForFinalState: vi.fn((_cb: unknown) => Promise.resolve(() => {})),
  listenForVideoLoaded: vi.fn((_cb: unknown) => Promise.resolve(() => {})),
  listenForAutoplayBlocked: vi.fn((_cb: unknown) => Promise.resolve(() => {})),
});

const createMockYoutubeService = () => ({
  getStreamUrl: vi.fn((_videoId: unknown) => Promise.resolve({ url: "https://stream.example.com/video" })),
});

// =============================================================================
// Mock Instances
// =============================================================================

let mockPlayerStore = createMockPlayerStore();
let mockQueueStore = createMockQueueStore();
let mockSessionStore = createMockSessionStore();
let mockWindowManager = createMockWindowManager();
let mockYoutubeService = createMockYoutubeService();
const mockPlayVideo = vi.fn();
const mockNotify = vi.fn();

// =============================================================================
// Mock Definitions
// =============================================================================

// Mock settings store
const mockSettingsStore = {
  getSetting: vi.fn((key: string) => {
    if (key === "playback_mode") return "youtube";
    return null;
  }),
};

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
  },
  playVideo: () => mockPlayVideo(),
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

// =============================================================================
// Test Helpers
// =============================================================================

function resetMocks() {
  mockPlayerStore = createMockPlayerStore();
  mockQueueStore = createMockQueueStore();
  mockSessionStore = createMockSessionStore();
  mockWindowManager = createMockWindowManager();
  mockYoutubeService = createMockYoutubeService();
  mockPlayVideo.mockClear();
  mockNotify.mockClear();
  // Reset settings store to default (youtube mode)
  mockSettingsStore.getSetting.mockImplementation((key: string) => {
    if (key === "playback_mode") return "youtube";
    return null;
  });
}

function setupVideoPlaying(options: {
  hasNext?: boolean;
  hasPrevious?: boolean;
  isPlaying?: boolean;
  isDetached?: boolean;
  isLoading?: boolean;
  duration?: number;
  currentTime?: number;
} = {}) {
  const video: MockVideo = {
    id: "video-1",
    title: "Test Song",
    artist: "Test Artist",
    youtubeId: "abc123",
    streamUrl: "https://stream.example.com/video",
    duration: options.duration ?? 180,
  };

  mockPlayerStore.currentVideo = video;
  mockPlayerStore.isPlaying = options.isPlaying ?? false;
  mockPlayerStore.isDetached = options.isDetached ?? false;
  mockPlayerStore.isLoading = options.isLoading ?? false;
  mockPlayerStore.duration = options.duration ?? 180;
  mockPlayerStore.currentTime = options.currentTime ?? 0;

  mockQueueStore.hasNext.mockReturnValue(options.hasNext ?? false);
  mockQueueStore.hasPrevious.mockReturnValue(options.hasPrevious ?? false);
  mockQueueStore.getCurrentItem.mockReturnValue({
    id: "queue-item-1",
    video,
    addedAt: new Date(),
  });

  return video;
}

/**
 * Helper to find the main reload button (not the one in loading overlay)
 */
function getMainReloadButton() {
  const reloadButtons = screen.getAllByTitle("Reload video");
  return reloadButtons.find(btn => !btn.closest("[data-testid='loading-overlay']"));
}

// =============================================================================
// Tests
// =============================================================================

describe("PlayerControls", () => {
  beforeEach(() => {
    resetMocks();
  });

  describe("Core functionality - Play/Pause", () => {
    it("shows play button when paused", () => {
      setupVideoPlaying({ isPlaying: false });
      render(<PlayerControls />);

      const playPauseButton = screen.getByRole("button", { name: /▶|⏸/ });
      expect(playPauseButton.textContent).toBe("▶");
    });

    it("shows pause button when playing", () => {
      setupVideoPlaying({ isPlaying: true });
      render(<PlayerControls />);

      const playPauseButton = screen.getByRole("button", { name: /▶|⏸/ });
      expect(playPauseButton.textContent).toBe("⏸");
    });

    it("toggles play state when play/pause button is clicked", async () => {
      setupVideoPlaying({ isPlaying: false });
      render(<PlayerControls />);

      const playPauseButton = screen.getByRole("button", { name: /▶|⏸/ });
      await userEvent.click(playPauseButton);

      expect(mockPlayerStore.setIsPlaying).toHaveBeenCalledWith(true);
    });

    it("play/pause button is disabled when no video is loaded", () => {
      render(<PlayerControls />);

      const playPauseButton = screen.getByRole("button", { name: /▶|⏸/ });
      expect(playPauseButton).toBeDisabled();
    });
  });

  describe("Core functionality - Navigation", () => {
    it("previous button is disabled when no previous songs", () => {
      setupVideoPlaying({ hasPrevious: false });
      render(<PlayerControls />);

      const prevButton = screen.getByTitle("Previous");
      expect(prevButton).toBeDisabled();
    });

    it("previous button is enabled when previous songs exist", () => {
      setupVideoPlaying({ hasPrevious: true });
      render(<PlayerControls />);

      const prevButton = screen.getByTitle("Previous");
      expect(prevButton).not.toBeDisabled();
    });

    it("next button is disabled when no next songs", () => {
      setupVideoPlaying({ hasNext: false });
      render(<PlayerControls />);

      const nextButton = screen.getByTitle("Next");
      expect(nextButton).toBeDisabled();
    });

    it("next button is enabled when next songs exist", () => {
      setupVideoPlaying({ hasNext: true });
      render(<PlayerControls />);

      const nextButton = screen.getByTitle("Next");
      expect(nextButton).not.toBeDisabled();
    });

    it("clicking previous plays the previous song", async () => {
      const prevVideo = { id: "prev-1", title: "Prev Song", youtubeId: "prev123" };
      mockQueueStore.playPrevious.mockReturnValue({ id: "queue-prev", video: prevVideo, addedAt: new Date() });
      setupVideoPlaying({ hasPrevious: true });
      render(<PlayerControls />);

      const prevButton = screen.getByTitle("Previous");
      await userEvent.click(prevButton);

      expect(mockQueueStore.playPrevious).toHaveBeenCalled();
    });

    it("clicking next plays the next song", async () => {
      const nextVideo = { id: "next-1", title: "Next Song", youtubeId: "next123" };
      mockQueueStore.playNext.mockReturnValue({ id: "queue-next", video: nextVideo, addedAt: new Date() });
      setupVideoPlaying({ hasNext: true });
      render(<PlayerControls />);

      const nextButton = screen.getByTitle("Next");
      await userEvent.click(nextButton);

      expect(mockQueueStore.playNext).toHaveBeenCalled();
    });

    it("navigation buttons are disabled when no video is loaded", () => {
      render(<PlayerControls />);

      const prevButton = screen.getByTitle("Previous");
      const nextButton = screen.getByTitle("Next");

      expect(prevButton).toBeDisabled();
      expect(nextButton).toBeDisabled();
    });
  });

  describe("Volume controls", () => {
    it("shows correct volume icon for full volume", () => {
      setupVideoPlaying();
      mockPlayerStore.volume = 1;
      mockPlayerStore.isMuted = false;
      render(<PlayerControls />);

      const volumeButton = screen.getByText("🔊").closest("button");
      expect(volumeButton).toBeInTheDocument();
    });

    it("shows correct volume icon for low volume", () => {
      setupVideoPlaying();
      mockPlayerStore.volume = 0.3;
      mockPlayerStore.isMuted = false;
      render(<PlayerControls />);

      const volumeButton = screen.getByText("🔉").closest("button");
      expect(volumeButton).toBeInTheDocument();
    });

    it("shows muted icon when muted", () => {
      setupVideoPlaying();
      mockPlayerStore.isMuted = true;
      render(<PlayerControls />);

      const volumeButton = screen.getByText("🔇").closest("button");
      expect(volumeButton).toBeInTheDocument();
    });

    it("shows muted icon when volume is 0", () => {
      setupVideoPlaying();
      mockPlayerStore.volume = 0;
      mockPlayerStore.isMuted = false;
      render(<PlayerControls />);

      const volumeButton = screen.getByText("🔇").closest("button");
      expect(volumeButton).toBeInTheDocument();
    });

    it("toggles mute when volume icon is clicked", async () => {
      setupVideoPlaying();
      render(<PlayerControls />);

      const volumeButton = screen.getByText("🔊").closest("button");
      await userEvent.click(volumeButton!);

      expect(mockPlayerStore.toggleMute).toHaveBeenCalled();
    });

    it("updates volume when slider is changed", async () => {
      setupVideoPlaying();
      render(<PlayerControls />);

      const volumeSlider = screen.getByRole("slider");
      fireEvent.change(volumeSlider, { target: { value: "0.5" } });

      expect(mockPlayerStore.setVolume).toHaveBeenCalledWith(0.5);
    });

    it("volume slider shows muted value when muted", () => {
      setupVideoPlaying();
      mockPlayerStore.volume = 0.8;
      mockPlayerStore.isMuted = true;
      render(<PlayerControls />);

      const volumeSlider = screen.getByRole("slider");
      expect(volumeSlider).toHaveValue("0");
    });

    it("volume slider is disabled when no video is loaded", () => {
      render(<PlayerControls />);

      const volumeSlider = screen.getByRole("slider");
      expect(volumeSlider).toBeDisabled();
    });
  });

  describe("Progress bar seeking", () => {
    it("displays current time and duration", () => {
      setupVideoPlaying({ currentTime: 65, duration: 180 });
      render(<PlayerControls />);

      expect(screen.getByText("1:05")).toBeInTheDocument();
      expect(screen.getByText("3:00")).toBeInTheDocument();
    });

    it("shows --:-- when no video is loaded", () => {
      render(<PlayerControls />);

      const timeDisplays = screen.getAllByText("--:--");
      expect(timeDisplays).toHaveLength(2);
    });

    it("seeks when progress bar is clicked", async () => {
      setupVideoPlaying({ duration: 100 });
      render(<PlayerControls />);

      const progressBar = screen.getByTestId("progress-bar");
      expect(progressBar).toBeInTheDocument();

      // We need to mock getBoundingClientRect because jsdom doesn't implement
      // actual layout. The component uses the click position relative to the
      // element's bounds to calculate the seek percentage. Without this mock,
      // rect.width would be 0, causing division issues.
      const originalGetBoundingClientRect = progressBar.getBoundingClientRect;
      progressBar.getBoundingClientRect = () => ({
        left: 0,
        right: 100,
        width: 100,
        top: 0,
        bottom: 10,
        height: 10,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Click at 50% position (clientX=50 on a 100px wide bar)
      fireEvent.click(progressBar, { clientX: 50 });

      expect(mockPlayerStore.seekTo).toHaveBeenCalledWith(50);

      // Restore original function
      progressBar.getBoundingClientRect = originalGetBoundingClientRect;
    });

    it("progress bar is not clickable during loading", () => {
      setupVideoPlaying({ isLoading: true, duration: 100 });
      render(<PlayerControls />);

      const progressBar = screen.getByTestId("progress-bar");
      expect(progressBar).toHaveClass("cursor-not-allowed");
    });
  });

  describe("Reload button functionality", () => {
    it("reload button is disabled when no video is loaded", () => {
      render(<PlayerControls />);

      const reloadButton = getMainReloadButton();
      expect(reloadButton).toBeDisabled();
    });

    it("reload button is enabled when video has youtubeId and not detached", () => {
      setupVideoPlaying({ isDetached: false });
      render(<PlayerControls />);

      const reloadButton = getMainReloadButton();
      expect(reloadButton).not.toBeDisabled();
    });

    it("reload button is disabled when player is detached", () => {
      setupVideoPlaying({ isDetached: true });
      render(<PlayerControls />);

      const reloadButton = getMainReloadButton();
      expect(reloadButton).toBeDisabled();
    });

    it("reload button is enabled during loading state (to recover from stuck loads)", () => {
      setupVideoPlaying({ isLoading: true, isDetached: false });
      render(<PlayerControls />);

      const loadingOverlay = screen.getByTestId("loading-overlay");
      expect(loadingOverlay).toBeInTheDocument();

      const reloadButtonInOverlay = loadingOverlay.querySelector('button[title="Reload video"]');
      expect(reloadButtonInOverlay).not.toBeDisabled();
    });

    it("clicking reload fetches new URL and updates state (ytdlp mode)", async () => {
      setupVideoPlaying();
      // Set playback mode to ytdlp for this test
      mockSettingsStore.getSetting.mockImplementation(((key: string) =>
        key === "playback_mode" ? "ytdlp" : null
      ) as typeof mockSettingsStore.getSetting);
      render(<PlayerControls />);

      const reloadButton = getMainReloadButton();
      await userEvent.click(reloadButton!);

      expect(mockYoutubeService.getStreamUrl).toHaveBeenCalledWith("abc123");

      await waitFor(() => {
        expect(mockPlayerStore.setCurrentVideo).toHaveBeenCalled();
        expect(mockPlayerStore.setIsPlaying).toHaveBeenCalledWith(true);
        expect(mockPlayerStore.seekTo).toHaveBeenCalledWith(0);
      });
    });

    it("clicking reload re-initializes player (youtube mode)", async () => {
      setupVideoPlaying();
      // Default is youtube mode
      mockSettingsStore.getSetting.mockImplementation((key: string) =>
        key === "playback_mode" ? "youtube" : null
      );
      render(<PlayerControls />);

      const reloadButton = getMainReloadButton();
      await userEvent.click(reloadButton!);

      // YouTube mode clears and restores the video to force re-initialization
      expect(mockPlayerStore.setCurrentVideo).toHaveBeenCalledWith(null);

      await waitFor(() => {
        expect(mockPlayerStore.setIsPlaying).toHaveBeenCalledWith(true);
        expect(mockPlayerStore.seekTo).toHaveBeenCalledWith(0);
      });
    });

    it("reload handles errors gracefully (ytdlp mode)", async () => {
      setupVideoPlaying();
      mockSettingsStore.getSetting.mockImplementation(((key: string) =>
        key === "playback_mode" ? "ytdlp" : null
      ) as typeof mockSettingsStore.getSetting);
      mockYoutubeService.getStreamUrl.mockRejectedValue(new Error("Network error"));
      render(<PlayerControls />);

      const reloadButton = getMainReloadButton();
      await userEvent.click(reloadButton!);

      await waitFor(() => {
        expect(mockNotify).toHaveBeenCalledWith("error", "Failed to reload video");
        expect(mockPlayerStore.setIsLoading).toHaveBeenCalledWith(false);
      });
    });

    it("reload sets loading state before and after fetch (ytdlp mode)", async () => {
      setupVideoPlaying();
      mockSettingsStore.getSetting.mockImplementation(((key: string) =>
        key === "playback_mode" ? "ytdlp" : null
      ) as typeof mockSettingsStore.getSetting);

      let resolvePromise: ((value: { url: string }) => void) | undefined;
      mockYoutubeService.getStreamUrl.mockImplementation(() =>
        new Promise(resolve => { resolvePromise = resolve; })
      );

      render(<PlayerControls />);

      const reloadButton = getMainReloadButton();
      await userEvent.click(reloadButton!);

      expect(mockPlayerStore.setIsLoading).toHaveBeenCalledWith(true);

      resolvePromise!({ url: "https://stream.example.com/new" });

      await waitFor(() => {
        expect(mockPlayerStore.setIsLoading).toHaveBeenCalledWith(false);
      });
    });

    it("reload resets playback position to 0", async () => {
      setupVideoPlaying({ currentTime: 90 });
      render(<PlayerControls />);

      const reloadButton = getMainReloadButton();
      await userEvent.click(reloadButton!);

      await waitFor(() => {
        expect(mockPlayerStore.seekTo).toHaveBeenCalledWith(0);
      });
    });

    // Note: Component no longer uses setError - it uses notify() for user-facing errors.
    // The notification system handles error display separately from the error state.

    it("reload uses currentVideo fallback when getCurrentItem returns null", async () => {
      setupVideoPlaying();
      // Override getCurrentItem to return null (edge case: queue cleared during operation)
      mockQueueStore.getCurrentItem.mockReturnValue(null);
      render(<PlayerControls />);

      const reloadButton = getMainReloadButton();
      await userEvent.click(reloadButton!);

      // Should still work using currentVideo fallback from playerStore
      // In YouTube mode (default), it clears and restores the video
      expect(mockPlayerStore.setIsLoading).toHaveBeenCalledWith(true);
      // First call clears video (null), second call restores it
      expect(mockPlayerStore.setCurrentVideo).toHaveBeenNthCalledWith(1, null);
    });
  });

  describe("Detach/Reattach functionality", () => {
    it("shows detach button when not detached", () => {
      setupVideoPlaying({ isDetached: false });
      render(<PlayerControls />);

      const detachButton = screen.getByTitle("Detach player");
      expect(detachButton).toBeInTheDocument();
      expect(detachButton.textContent).toBe("⧉");
    });

    it("shows reattach button when detached", () => {
      setupVideoPlaying({ isDetached: true });
      render(<PlayerControls />);

      const reattachButton = screen.getByTitle("Reattach player");
      expect(reattachButton).toBeInTheDocument();
      expect(reattachButton.textContent).toBe("⊡");
    });

    it("detach button is disabled when no video is loaded", () => {
      render(<PlayerControls />);

      const detachButton = screen.getByTitle("Detach player");
      expect(detachButton).toBeDisabled();
    });

    it("clicking detach opens separate window", async () => {
      setupVideoPlaying({ isDetached: false, isPlaying: true });
      render(<PlayerControls />);

      const detachButton = screen.getByTitle("Detach player");
      await userEvent.click(detachButton);

      expect(mockPlayerStore.setIsPlaying).toHaveBeenCalledWith(false);

      await waitFor(() => {
        expect(mockWindowManager.detachPlayer).toHaveBeenCalled();
        expect(mockPlayerStore.setIsDetached).toHaveBeenCalledWith(true);
      });
    });

    it("clicking reattach closes detached window", async () => {
      setupVideoPlaying({ isDetached: true });
      render(<PlayerControls />);

      const reattachButton = screen.getByTitle("Reattach player");
      await userEvent.click(reattachButton);

      await waitFor(() => {
        expect(mockWindowManager.reattachPlayer).toHaveBeenCalled();
        expect(mockPlayerStore.setIsDetached).toHaveBeenCalledWith(false);
      });
    });

    it("detach pauses playback before detaching", async () => {
      setupVideoPlaying({ isDetached: false, isPlaying: true });
      render(<PlayerControls />);

      const detachButton = screen.getByTitle("Detach player");
      await userEvent.click(detachButton);

      expect(mockPlayerStore.setIsPlaying).toHaveBeenCalledWith(false);
    });
  });

  describe("Video info display", () => {
    it("displays video title", () => {
      setupVideoPlaying();
      render(<PlayerControls />);

      expect(screen.getByText("Test Song")).toBeInTheDocument();
    });

    it("displays video artist", () => {
      setupVideoPlaying();
      render(<PlayerControls />);

      expect(screen.getByText("Test Artist")).toBeInTheDocument();
    });

    it("shows 'No video selected' when no video is loaded", () => {
      render(<PlayerControls />);

      expect(screen.getByText("No video selected")).toBeInTheDocument();
    });
  });

  describe("Loading state", () => {
    it("shows loading spinner when loading", () => {
      setupVideoPlaying({ isLoading: true });
      render(<PlayerControls />);

      const loadingOverlay = screen.getByTestId("loading-overlay");
      expect(loadingOverlay).toBeInTheDocument();

      const spinner = screen.getByTestId("loading-spinner");
      expect(spinner).toBeInTheDocument();
    });

    it("hides loading spinner when not loading", () => {
      setupVideoPlaying({ isLoading: false });
      render(<PlayerControls />);

      expect(screen.queryByTestId("loading-overlay")).not.toBeInTheDocument();
    });
  });

  describe("Disabled state styling", () => {
    it("has reduced opacity when disabled", () => {
      render(<PlayerControls />);

      const container = screen.getByTestId("player-controls");
      expect(container).toHaveClass("opacity-60");
    });

    it("has normal opacity when video is loaded", () => {
      setupVideoPlaying();
      render(<PlayerControls />);

      const container = screen.getByTestId("player-controls");
      expect(container).not.toHaveClass("opacity-60");
    });
  });
});
