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

    it("should append to end of queue when fair queue is disabled", async () => {
      const { addToQueue } = useQueueStore.getState();
      const item = await addToQueue(mockVideo);

      expect(item.video).toEqual(mockVideo);
      expect(useQueueStore.getState().queue).toHaveLength(1);
      expect(queueService.computeFairPosition).not.toHaveBeenCalled();
    });

    it("should append to end even with active singer when fair queue is disabled", async () => {
      // Set active singer
      useSessionStore.setState({ activeSingerId: 1 });

      const { addToQueue } = useQueueStore.getState();
      await addToQueue(mockVideo);

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
      await addToQueue(mockVideo);

      // Verify computeFairPosition was called with singer ID
      expect(queueService.computeFairPosition).toHaveBeenCalledWith(42);
    });

    it("should reorder item to fair position after adding", async () => {
      // Set active singer
      useSessionStore.setState({ activeSingerId: 42 });
      vi.mocked(queueService.computeFairPosition).mockResolvedValue(0);

      const { addToQueue } = useQueueStore.getState();
      const item = await addToQueue(mockVideo);

      // Verify service calls
      expect(queueService.addItem).toHaveBeenCalled();
      expect(queueService.reorder).toHaveBeenCalledWith(item.id, 0);
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
      const item = await addToQueue(mockVideo);

      // Verify reorder was called with correct position
      expect(queueService.reorder).toHaveBeenCalledWith(item.id, 0);

      // After reordering, the new item should be at position 0
      const queue = useQueueStore.getState().queue;
      expect(queue[0].id).toBe(item.id);
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
      const item = await addToQueue(mockVideo);

      // Verify reorder was called with correct position
      expect(queueService.reorder).toHaveBeenCalledWith(item.id, 2);

      // After reordering, the new item should be at position 2
      const queue = useQueueStore.getState().queue;
      expect(queue[2].id).toBe(item.id);
    });

    it("should not reshuffle existing queue items when adding a new song (PRD-008)", async () => {
      // Pre-populate queue with songs from different singers (simulated by their IDs)
      // Representing: Singer A song, Singer B song, Singer C song
      const existingQueue = [
        { id: "song-a1", video: { ...mockVideo, id: "v-a1", title: "Song A1" }, addedAt: new Date() },
        { id: "song-b1", video: { ...mockVideo, id: "v-b1", title: "Song B1" }, addedAt: new Date() },
        { id: "song-c1", video: { ...mockVideo, id: "v-c1", title: "Song C1" }, addedAt: new Date() },
      ];

      useQueueStore.setState({ queue: existingQueue });

      // Record original order of existing items
      const originalOrder = existingQueue.map((item) => item.id);

      // Set active singer (Singer A wants to add another song)
      useSessionStore.setState({ activeSingerId: 1 }); // Singer A

      // Fair position algorithm returns position 2 (after B and C get a turn)
      // Queue should become: [A1, B1, A2, C1] - but existing A1, B1, C1 stay in place
      vi.mocked(queueService.computeFairPosition).mockResolvedValue(2);

      // Add new song for Singer A
      const { addToQueue } = useQueueStore.getState();
      const newSong: Video = { ...mockVideo, id: "v-a2", title: "Song A2" };
      const addedItem = await addToQueue(newSong);

      // Wait for fair queue positioning to complete
      await vi.waitFor(() => {
        expect(queueService.reorder).toHaveBeenCalledWith(addedItem.id, 2);
      });

      // Verify existing items maintain their relative order
      await vi.waitFor(() => {
        const queue = useQueueStore.getState().queue;

        // Filter to only the original items
        const existingItemsInQueue = queue.filter((item) => originalOrder.includes(item.id));

        // Verify all original items are still present
        expect(existingItemsInQueue).toHaveLength(3);

        // Verify the relative order of existing items is preserved
        const existingItemOrder = existingItemsInQueue.map((item) => item.id);
        expect(existingItemOrder).toEqual(originalOrder);

        // Verify the new item was inserted (total should be 4)
        expect(queue).toHaveLength(4);

        // Verify the new item is at position 2
        expect(queue[2].id).toBe(addedItem.id);
      });
    });

    it("should insert first song for new singer at top of queue (PRD-009)", async () => {
      // PRD-009: Have existing queue with songs from singers A and B
      const existingQueue = [
        { id: "song-a1", video: { ...mockVideo, id: "v-a1", title: "Song A1" }, addedAt: new Date() },
        { id: "song-b1", video: { ...mockVideo, id: "v-b1", title: "Song B1" }, addedAt: new Date() },
      ];

      useQueueStore.setState({ queue: existingQueue });

      // PRD-009: Set active singer to new singer C (who has 0 songs)
      useSessionStore.setState({ activeSingerId: 3 }); // Singer C

      // Backend returns position 0 for singer with 0 songs in queue
      vi.mocked(queueService.computeFairPosition).mockResolvedValue(0);

      // PRD-009: Add a song
      const { addToQueue } = useQueueStore.getState();
      const newSong: Video = { ...mockVideo, id: "v-c1", title: "Song C1" };
      const addedItem = await addToQueue(newSong);

      // Wait for fair queue positioning to complete
      await vi.waitFor(() => {
        expect(queueService.computeFairPosition).toHaveBeenCalledWith(3);
      });

      await vi.waitFor(() => {
        expect(queueService.reorder).toHaveBeenCalledWith(addedItem.id, 0);
      });

      // PRD-009: Verify the song appears at position 0 (top of queue)
      await vi.waitFor(() => {
        const queue = useQueueStore.getState().queue;
        expect(queue[0].id).toBe(addedItem.id);
        expect(queue[0].video.title).toBe("Song C1");
      });
    });

    it("should preserve existing item positions when new singer's song goes to top (PRD-008)", async () => {
      // Queue has songs from Singer A and Singer B
      const existingQueue = [
        { id: "song-a1", video: { ...mockVideo, id: "v-a1", title: "Song A1" }, addedAt: new Date() },
        { id: "song-b1", video: { ...mockVideo, id: "v-b1", title: "Song B1" }, addedAt: new Date() },
        { id: "song-a2", video: { ...mockVideo, id: "v-a2", title: "Song A2" }, addedAt: new Date() },
      ];

      useQueueStore.setState({ queue: existingQueue });

      // Record original order
      const originalOrder = existingQueue.map((item) => item.id);

      // New singer C (with 0 songs) should go to top
      useSessionStore.setState({ activeSingerId: 3 }); // Singer C
      vi.mocked(queueService.computeFairPosition).mockResolvedValue(0);

      const { addToQueue } = useQueueStore.getState();
      const newSong: Video = { ...mockVideo, id: "v-c1", title: "Song C1" };
      const addedItem = await addToQueue(newSong);

      // Wait for fair queue positioning to complete
      await vi.waitFor(() => {
        expect(queueService.reorder).toHaveBeenCalledWith(addedItem.id, 0);
      });

      // Verify existing items are shifted but maintain relative order
      await vi.waitFor(() => {
        const queue = useQueueStore.getState().queue;

        // New item should be at position 0
        expect(queue[0].id).toBe(addedItem.id);

        // Existing items should be shifted down by 1 but maintain relative order
        const existingItemsInQueue = queue.filter((item) => originalOrder.includes(item.id));
        const existingItemOrder = existingItemsInQueue.map((item) => item.id);
        expect(existingItemOrder).toEqual(originalOrder);

        // Verify positions: new item at 0, then A1, B1, A2 at 1, 2, 3
        expect(queue[1].id).toBe("song-a1");
        expect(queue[2].id).toBe("song-b1");
        expect(queue[3].id).toBe("song-a2");
      });
    });

    it("should append to end when fair queue enabled but no active singer (PRD-011)", async () => {
      // PRD-011: Enable Fair Queue toggle, clear active singer, add a song
      // Verify song is appended to end (fallback behavior when no singer)

      // Pre-populate queue with existing songs
      const existingQueue = [
        { id: "song-a1", video: { ...mockVideo, id: "v-a1", title: "Song A1" }, addedAt: new Date() },
        { id: "song-b1", video: { ...mockVideo, id: "v-b1", title: "Song B1" }, addedAt: new Date() },
      ];
      useQueueStore.setState({ queue: existingQueue });

      // Fair Queue is enabled (set in beforeEach)
      // No active singer
      useSessionStore.setState({ activeSingerId: null });

      const { addToQueue } = useQueueStore.getState();
      const newSong: Video = { ...mockVideo, id: "v-new", title: "New Song" };
      const addedItem = await addToQueue(newSong);

      // PRD-011: Should NOT compute fair position when no singer
      expect(queueService.computeFairPosition).not.toHaveBeenCalled();

      // Song should be appended to end (fallback behavior)
      const queue = useQueueStore.getState().queue;
      expect(queue).toHaveLength(3);
      expect(queue[2].id).toBe(addedItem.id);
      expect(queue[2].video.title).toBe("New Song");

      // Existing items stay in place
      expect(queue[0].id).toBe("song-a1");
      expect(queue[1].id).toBe("song-b1");
    });
  });
});
