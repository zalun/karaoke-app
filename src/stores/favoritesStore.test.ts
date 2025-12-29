import { describe, it, expect, vi, beforeEach } from "vitest";
import { useFavoritesStore } from "./favoritesStore";
import type { Singer, SingerFavorite, FavoriteVideo } from "../services";

// Mock the services
vi.mock("../services", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  }),
  sessionService: {
    getPersistentSingers: vi.fn(),
    addSingerToSession: vi.fn(),
  },
  favoritesService: {
    getSingerFavorites: vi.fn(),
    addFavorite: vi.fn(),
    removeFavorite: vi.fn(),
    bulkAddFavorites: vi.fn(),
    checkVideoFavorites: vi.fn(),
  },
}));

// Mock other stores
vi.mock("./queueStore", () => ({
  useQueueStore: {
    getState: vi.fn(() => ({
      history: [],
      addToQueue: vi.fn(() => ({ id: "queue-item-1" })),
    })),
  },
}));

vi.mock("./sessionStore", () => ({
  useSessionStore: {
    getState: vi.fn(() => ({
      session: { id: 1 },
      singers: [],
      loadSingers: vi.fn(),
      assignSingerToQueueItem: vi.fn(),
    })),
  },
}));

// Import mocked modules
import { sessionService, favoritesService } from "../services";
import { useQueueStore } from "./queueStore";
import { useSessionStore } from "./sessionStore";

const mockSinger: Singer = {
  id: 1,
  name: "Test Singer",
  color: "#ff0000",
  is_persistent: true,
  unique_name: null,
};

const mockFavoriteVideo: FavoriteVideo = {
  video_id: "video-123",
  title: "Test Song",
  artist: "Test Artist",
  duration: 180,
  thumbnail_url: "https://example.com/thumb.jpg",
  source: "youtube",
  youtube_id: "abc123",
  file_path: undefined,
};

const mockSingerFavorite: SingerFavorite = {
  id: 1,
  singer_id: 1,
  video: mockFavoriteVideo,
  added_at: "2025-01-01T00:00:00Z",
};

describe("favoritesStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useFavoritesStore.setState({
      showLoadFavoritesDialog: false,
      showManageFavoritesDialog: false,
      persistentSingers: [],
      selectedSingerId: null,
      favorites: [],
      isLoading: false,
      historySelectionMode: false,
      selectedHistoryIds: new Set(),
    });
    vi.clearAllMocks();
  });

  describe("dialog actions", () => {
    it("should open load favorites dialog and load singers", async () => {
      vi.mocked(sessionService.getPersistentSingers).mockResolvedValue([mockSinger]);

      await useFavoritesStore.getState().openLoadFavoritesDialog();

      expect(useFavoritesStore.getState().showLoadFavoritesDialog).toBe(true);
      expect(useFavoritesStore.getState().persistentSingers).toEqual([mockSinger]);
      expect(useFavoritesStore.getState().isLoading).toBe(false);
    });

    it("should close load favorites dialog and reset state", () => {
      useFavoritesStore.setState({
        showLoadFavoritesDialog: true,
        selectedSingerId: 1,
        favorites: [mockSingerFavorite],
      });

      useFavoritesStore.getState().closeLoadFavoritesDialog();

      expect(useFavoritesStore.getState().showLoadFavoritesDialog).toBe(false);
      expect(useFavoritesStore.getState().selectedSingerId).toBeNull();
      expect(useFavoritesStore.getState().favorites).toEqual([]);
    });

    it("should open manage favorites dialog and load singers", async () => {
      vi.mocked(sessionService.getPersistentSingers).mockResolvedValue([mockSinger]);

      await useFavoritesStore.getState().openManageFavoritesDialog();

      expect(useFavoritesStore.getState().showManageFavoritesDialog).toBe(true);
      expect(useFavoritesStore.getState().persistentSingers).toEqual([mockSinger]);
    });

    it("should close manage favorites dialog and reset state", () => {
      useFavoritesStore.setState({
        showManageFavoritesDialog: true,
        selectedSingerId: 1,
        favorites: [mockSingerFavorite],
      });

      useFavoritesStore.getState().closeManageFavoritesDialog();

      expect(useFavoritesStore.getState().showManageFavoritesDialog).toBe(false);
      expect(useFavoritesStore.getState().selectedSingerId).toBeNull();
      expect(useFavoritesStore.getState().favorites).toEqual([]);
    });
  });

  describe("singer actions", () => {
    it("should load persistent singers", async () => {
      vi.mocked(sessionService.getPersistentSingers).mockResolvedValue([mockSinger]);

      await useFavoritesStore.getState().loadPersistentSingers();

      expect(useFavoritesStore.getState().persistentSingers).toEqual([mockSinger]);
    });

    it("should handle error when loading persistent singers", async () => {
      vi.mocked(sessionService.getPersistentSingers).mockRejectedValue(new Error("Network error"));

      await useFavoritesStore.getState().loadPersistentSingers();

      expect(useFavoritesStore.getState().persistentSingers).toEqual([]);
    });

    it("should select singer and load their favorites", async () => {
      vi.mocked(favoritesService.getSingerFavorites).mockResolvedValue([mockSingerFavorite]);

      await useFavoritesStore.getState().selectSinger(1);

      expect(useFavoritesStore.getState().selectedSingerId).toBe(1);
      expect(useFavoritesStore.getState().favorites).toEqual([mockSingerFavorite]);
      expect(useFavoritesStore.getState().isLoading).toBe(false);
    });
  });

  describe("favorites actions", () => {
    it("should add favorite and update list if singer is selected", async () => {
      useFavoritesStore.setState({ selectedSingerId: 1, favorites: [] });
      vi.mocked(favoritesService.addFavorite).mockResolvedValue(mockSingerFavorite);

      await useFavoritesStore.getState().addFavorite(1, mockFavoriteVideo);

      expect(favoritesService.addFavorite).toHaveBeenCalledWith(1, mockFavoriteVideo);
      expect(useFavoritesStore.getState().favorites).toContainEqual(mockSingerFavorite);
    });

    it("should not update favorites list if different singer is selected", async () => {
      useFavoritesStore.setState({ selectedSingerId: 2, favorites: [] });
      vi.mocked(favoritesService.addFavorite).mockResolvedValue(mockSingerFavorite);

      await useFavoritesStore.getState().addFavorite(1, mockFavoriteVideo);

      expect(useFavoritesStore.getState().favorites).toEqual([]);
    });

    it("should remove favorite and update list", async () => {
      useFavoritesStore.setState({ selectedSingerId: 1, favorites: [mockSingerFavorite] });
      vi.mocked(favoritesService.removeFavorite).mockResolvedValue();

      await useFavoritesStore.getState().removeFavorite(1, "video-123");

      expect(favoritesService.removeFavorite).toHaveBeenCalledWith(1, "video-123");
      expect(useFavoritesStore.getState().favorites).toEqual([]);
    });

    it("should bulk add favorites", async () => {
      useFavoritesStore.setState({ selectedSingerId: 1 });
      vi.mocked(favoritesService.bulkAddFavorites).mockResolvedValue([mockSingerFavorite]);

      await useFavoritesStore.getState().bulkAddFavorites(1, [mockFavoriteVideo]);

      expect(favoritesService.bulkAddFavorites).toHaveBeenCalledWith(1, [mockFavoriteVideo]);
      expect(useFavoritesStore.getState().favorites).toEqual([mockSingerFavorite]);
    });

    it("should throw error when add favorite fails", async () => {
      vi.mocked(favoritesService.addFavorite).mockRejectedValue(new Error("Failed"));

      await expect(
        useFavoritesStore.getState().addFavorite(1, mockFavoriteVideo)
      ).rejects.toThrow("Failed");
    });
  });

  describe("loadFavoritesToQueue", () => {
    it("should load all favorites to queue when no IDs specified", async () => {
      vi.mocked(favoritesService.getSingerFavorites).mockResolvedValue([mockSingerFavorite]);
      const mockAddToQueue = vi.fn(() => ({ id: "queue-item-1" }));
      const mockAssignSinger = vi.fn();

      vi.mocked(useQueueStore.getState).mockReturnValue({
        history: [],
        addToQueue: mockAddToQueue,
      } as unknown as ReturnType<typeof useQueueStore.getState>);

      vi.mocked(useSessionStore.getState).mockReturnValue({
        session: { id: 1 },
        singers: [mockSinger],
        loadSingers: vi.fn(),
        assignSingerToQueueItem: mockAssignSinger,
      } as unknown as ReturnType<typeof useSessionStore.getState>);

      await useFavoritesStore.getState().loadFavoritesToQueue(1);

      expect(mockAddToQueue).toHaveBeenCalledWith({
        id: "video-123",
        title: "Test Song",
        artist: "Test Artist",
        thumbnailUrl: "https://example.com/thumb.jpg",
        duration: 180,
        source: "youtube",
        youtubeId: "abc123",
        filePath: undefined,
      });
      expect(mockAssignSinger).toHaveBeenCalledWith("queue-item-1", 1);
    });

    it("should add singer to session if not already present", async () => {
      vi.mocked(favoritesService.getSingerFavorites).mockResolvedValue([mockSingerFavorite]);
      const mockLoadSingers = vi.fn();

      vi.mocked(useSessionStore.getState).mockReturnValue({
        session: { id: 1 },
        singers: [], // Singer not in session
        loadSingers: mockLoadSingers,
        assignSingerToQueueItem: vi.fn(),
      } as unknown as ReturnType<typeof useSessionStore.getState>);

      await useFavoritesStore.getState().loadFavoritesToQueue(1);

      expect(sessionService.addSingerToSession).toHaveBeenCalledWith(1, 1);
      expect(mockLoadSingers).toHaveBeenCalled();
    });
  });

  describe("history selection", () => {
    it("should toggle history selection mode", () => {
      expect(useFavoritesStore.getState().historySelectionMode).toBe(false);

      useFavoritesStore.getState().toggleHistorySelectionMode();
      expect(useFavoritesStore.getState().historySelectionMode).toBe(true);

      useFavoritesStore.getState().toggleHistorySelectionMode();
      expect(useFavoritesStore.getState().historySelectionMode).toBe(false);
    });

    it("should toggle item selection", () => {
      useFavoritesStore.getState().toggleHistoryItemSelection("item-1");
      expect(useFavoritesStore.getState().selectedHistoryIds.has("item-1")).toBe(true);

      useFavoritesStore.getState().toggleHistoryItemSelection("item-1");
      expect(useFavoritesStore.getState().selectedHistoryIds.has("item-1")).toBe(false);
    });

    it("should clear history selection", () => {
      useFavoritesStore.setState({
        historySelectionMode: true,
        selectedHistoryIds: new Set(["item-1", "item-2"]),
      });

      useFavoritesStore.getState().clearHistorySelection();

      expect(useFavoritesStore.getState().historySelectionMode).toBe(false);
      expect(useFavoritesStore.getState().selectedHistoryIds.size).toBe(0);
    });
  });
});
