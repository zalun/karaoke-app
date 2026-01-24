import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Video } from "./playerStore";

// Mock the services module before any imports that use it
vi.mock("../services", () => ({
  queueService: {
    addItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
    reorder: vi.fn(() => Promise.resolve()),
    computeFairPosition: vi.fn(() => Promise.resolve(0)),
    getState: vi.fn(() => Promise.resolve(null)),
    clearQueue: vi.fn(() => Promise.resolve()),
    clearHistory: vi.fn(() => Promise.resolve()),
    moveToHistory: vi.fn(() => Promise.resolve()),
    addToHistory: vi.fn(() => Promise.resolve()),
    setHistoryIndex: vi.fn(() => Promise.resolve()),
    fairShuffle: vi.fn(() => Promise.resolve()),
    moveAllHistoryToQueue: vi.fn(() => Promise.resolve()),
  },
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocking
import { useQueueStore } from "./queueStore";
import { useSettingsStore, SETTINGS_KEYS } from "./settingsStore";
import { useSessionStore } from "./sessionStore";
import { queueService } from "../services";

const mockVideo: Video = {
  id: "video-1",
  title: "Test Song",
  artist: "Test Artist",
  source: "youtube",
  youtubeId: "abc123",
};

describe("queueStore fair queue functionality", () => {
  beforeEach(() => {
    // Reset all stores to initial state
    useQueueStore.setState({
      queue: [],
      history: [],
      historyIndex: -1,
      isInitialized: true,
    });

    // Reset mocks
    vi.clearAllMocks();
  });

  describe("addToQueue with fair queue disabled", () => {
    beforeEach(() => {
      // Ensure fair queue is disabled
      useSettingsStore.setState({
        settings: {
          ...useSettingsStore.getState().settings,
          [SETTINGS_KEYS.FAIR_QUEUE_ENABLED]: "false",
        },
      });
    });

    it("should append to end of queue when fair queue is disabled", () => {
      const { addToQueue } = useQueueStore.getState();
      const item = addToQueue(mockVideo);

      expect(item.video).toEqual(mockVideo);
      expect(useQueueStore.getState().queue).toHaveLength(1);
      expect(queueService.computeFairPosition).not.toHaveBeenCalled();
    });

    it("should append to end even with active singer when fair queue is disabled", () => {
      // Set active singer
      useSessionStore.setState({ activeSingerId: 1 });

      const { addToQueue } = useQueueStore.getState();
      addToQueue(mockVideo);

      expect(queueService.computeFairPosition).not.toHaveBeenCalled();
    });
  });

  describe("addToQueue with fair queue enabled", () => {
    beforeEach(() => {
      // Enable fair queue
      useSettingsStore.setState({
        settings: {
          ...useSettingsStore.getState().settings,
          [SETTINGS_KEYS.FAIR_QUEUE_ENABLED]: "true",
        },
      });
    });

    it("should fall back to append when no active singer is set", () => {
      // No active singer
      useSessionStore.setState({ activeSingerId: null });

      const { addToQueue } = useQueueStore.getState();
      addToQueue(mockVideo);

      expect(queueService.computeFairPosition).not.toHaveBeenCalled();
    });

    it("should compute fair position when fair queue is enabled and singer is set", async () => {
      // Set active singer
      useSessionStore.setState({ activeSingerId: 42 });

      const { addToQueue } = useQueueStore.getState();
      addToQueue(mockVideo);

      // Wait for async operations
      await vi.waitFor(() => {
        expect(queueService.computeFairPosition).toHaveBeenCalledWith(42);
      });
    });

    it("should reorder item to fair position after adding", async () => {
      // Set active singer
      useSessionStore.setState({ activeSingerId: 42 });
      vi.mocked(queueService.computeFairPosition).mockResolvedValue(0);

      const { addToQueue } = useQueueStore.getState();
      const item = addToQueue(mockVideo);

      // Wait for async operations
      await vi.waitFor(() => {
        expect(queueService.addItem).toHaveBeenCalled();
      });

      await vi.waitFor(() => {
        expect(queueService.reorder).toHaveBeenCalledWith(item.id, 0);
      });
    });

    it("should insert at position 0 for singer with no songs", async () => {
      // Pre-populate queue with other items
      useQueueStore.setState({
        queue: [
          { id: "existing-1", video: { ...mockVideo, id: "v1" }, addedAt: new Date() },
          { id: "existing-2", video: { ...mockVideo, id: "v2" }, addedAt: new Date() },
        ],
      });

      // Set active singer and fair position
      useSessionStore.setState({ activeSingerId: 42 });
      vi.mocked(queueService.computeFairPosition).mockResolvedValue(0);

      const { addToQueue } = useQueueStore.getState();
      const item = addToQueue(mockVideo);

      // Wait for async operations to complete
      await vi.waitFor(() => {
        expect(queueService.reorder).toHaveBeenCalledWith(item.id, 0);
      });

      // After reordering, the new item should be at position 0
      await vi.waitFor(() => {
        const queue = useQueueStore.getState().queue;
        expect(queue[0].id).toBe(item.id);
      });
    });

    it("should insert at calculated fair position for singer with existing songs", async () => {
      // Pre-populate queue
      useQueueStore.setState({
        queue: [
          { id: "existing-1", video: { ...mockVideo, id: "v1" }, addedAt: new Date() },
          { id: "existing-2", video: { ...mockVideo, id: "v2" }, addedAt: new Date() },
          { id: "existing-3", video: { ...mockVideo, id: "v3" }, addedAt: new Date() },
        ],
      });

      // Set active singer and fair position to 2 (middle of queue)
      useSessionStore.setState({ activeSingerId: 42 });
      vi.mocked(queueService.computeFairPosition).mockResolvedValue(2);

      const { addToQueue } = useQueueStore.getState();
      const item = addToQueue(mockVideo);

      // Wait for async operations
      await vi.waitFor(() => {
        expect(queueService.reorder).toHaveBeenCalledWith(item.id, 2);
      });

      // After reordering, the new item should be at position 2
      await vi.waitFor(() => {
        const queue = useQueueStore.getState().queue;
        expect(queue[2].id).toBe(item.id);
      });
    });
  });
});
