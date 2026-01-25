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
});
