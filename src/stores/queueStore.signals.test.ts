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
  emitSignal: vi.fn().mockResolvedValue(undefined),
  APP_SIGNALS: {
    QUEUE_ITEM_ADDED: "app:queue-item-added",
    QUEUE_ITEM_REMOVED: "app:queue-item-removed",
    QUEUE_LOADED: "app:queue-loaded",
  },
}));

// Import after mocking
import { useQueueStore } from "./queueStore";
import { useSettingsStore, SETTINGS_KEYS } from "./settingsStore";
import { useSessionStore } from "./sessionStore";
import { emitSignal, APP_SIGNALS } from "../services";

const mockVideo: Video = {
  id: "video-1",
  title: "Test Song",
  artist: "Test Artist",
  source: "youtube",
  youtubeId: "abc123",
};

describe("queueStore signal emissions", () => {
  beforeEach(() => {
    // Reset all stores to initial state
    useQueueStore.setState({
      queue: [],
      history: [],
      historyIndex: -1,
      isInitialized: true,
    });

    // Disable fair queue for simpler tests
    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        [SETTINGS_KEYS.FAIR_QUEUE_ENABLED]: "false",
      },
    });

    // No active singer
    useSessionStore.setState({ activeSingerId: null });

    // Reset mocks
    vi.clearAllMocks();
  });

  describe("QUEUE_ITEM_ADDED signal", () => {
    it("should emit QUEUE_ITEM_ADDED signal when item is added to queue", async () => {
      const { addToQueue } = useQueueStore.getState();
      await addToQueue(mockVideo);

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.QUEUE_ITEM_ADDED, undefined);
    });

    it("should emit QUEUE_ITEM_ADDED signal when item is added via addToQueueNext", () => {
      const { addToQueueNext } = useQueueStore.getState();
      addToQueueNext(mockVideo);

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.QUEUE_ITEM_ADDED, undefined);
    });

    it("should emit QUEUE_ITEM_ADDED signal when fair queue adds item", async () => {
      // Enable fair queue
      useSettingsStore.setState({
        settings: {
          ...useSettingsStore.getState().settings,
          [SETTINGS_KEYS.FAIR_QUEUE_ENABLED]: "true",
        },
      });
      useSessionStore.setState({ activeSingerId: 1 });

      const { addToQueue } = useQueueStore.getState();
      await addToQueue(mockVideo);

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.QUEUE_ITEM_ADDED, undefined);
    });
  });

  describe("QUEUE_ITEM_REMOVED signal", () => {
    it("should emit QUEUE_ITEM_REMOVED signal when item is removed from queue", async () => {
      // First add an item to the queue
      const { addToQueue, removeFromQueue } = useQueueStore.getState();
      const item = await addToQueue(mockVideo);

      // Clear mocks to only track the removeFromQueue call
      vi.clearAllMocks();

      // Remove the item
      removeFromQueue(item.id);

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.QUEUE_ITEM_REMOVED, undefined);
    });
  });

  describe("QUEUE_LOADED signal", () => {
    it("should emit QUEUE_LOADED signal after loadPersistedState() loads state", async () => {
      // Import the mock to configure it for this test
      const { queueService } = await import("../services");
      vi.mocked(queueService.getState).mockResolvedValueOnce({
        queue: [
          {
            id: "item-1",
            video_id: "video-1",
            title: "Test Song",
            artist: "Test Artist",
            duration: 180,
            thumbnail_url: null,
            source: "youtube",
            youtube_id: "abc123",
            file_path: null,
            position: 0,
            added_at: new Date().toISOString(),
          },
        ],
        history: [],
        history_index: -1,
      });

      const { loadPersistedState } = useQueueStore.getState();
      await loadPersistedState();

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.QUEUE_LOADED, undefined);
    });

    it("should emit QUEUE_LOADED signal when no persisted state exists", async () => {
      // Import the mock to configure it for this test
      const { queueService } = await import("../services");
      vi.mocked(queueService.getState).mockResolvedValueOnce(null);

      const { loadPersistedState } = useQueueStore.getState();
      await loadPersistedState();

      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.QUEUE_LOADED, undefined);
    });

    it("should emit QUEUE_LOADED signal even when loadPersistedState() fails", async () => {
      // Import the mock to configure it for this test
      const { queueService } = await import("../services");
      vi.mocked(queueService.getState).mockRejectedValueOnce(new Error("Database error"));

      const { loadPersistedState } = useQueueStore.getState();
      await loadPersistedState();

      // Signal should still be emitted on error
      expect(emitSignal).toHaveBeenCalledWith(APP_SIGNALS.QUEUE_LOADED, undefined);
    });
  });
});
