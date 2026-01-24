import { create } from "zustand";
import {
  createLogger,
  sessionService,
  favoritesService,
  type Singer,
  type FavoriteVideo,
  type SingerFavorite,
} from "../services";
import { useQueueStore } from "./queueStore";
import { useSessionStore } from "./sessionStore";

const log = createLogger("FavoritesStore");

interface FavoritesState {
  // Dialog states
  showLoadFavoritesDialog: boolean;
  showManageFavoritesDialog: boolean;

  // Data
  persistentSingers: Singer[];
  selectedSingerId: number | null;
  favorites: SingerFavorite[];
  isLoading: boolean;

  // History multi-select mode
  historySelectionMode: boolean;
  selectedHistoryIds: Set<string>;

  // Dialog actions
  openLoadFavoritesDialog: () => Promise<void>;
  closeLoadFavoritesDialog: () => void;
  openManageFavoritesDialog: () => Promise<void>;
  closeManageFavoritesDialog: () => void;

  // Singer actions
  loadPersistentSingers: () => Promise<void>;
  selectSinger: (singerId: number) => Promise<void>;

  // Favorites actions
  addFavorite: (singerId: number, video: FavoriteVideo) => Promise<void>;
  removeFavorite: (singerId: number, videoId: string) => Promise<void>;
  bulkAddFavorites: (singerId: number, videos: FavoriteVideo[]) => Promise<void>;
  loadFavoritesToQueue: (singerId: number, favoriteIds?: number[]) => Promise<void>;

  // History multi-select actions
  toggleHistorySelectionMode: () => void;
  toggleHistoryItemSelection: (itemId: string) => void;
  clearHistorySelection: () => void;
  addSelectedHistoryToFavorites: (singerId: number) => Promise<void>;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  showLoadFavoritesDialog: false,
  showManageFavoritesDialog: false,
  persistentSingers: [],
  selectedSingerId: null,
  favorites: [],
  isLoading: false,
  historySelectionMode: false,
  selectedHistoryIds: new Set(),

  openLoadFavoritesDialog: async () => {
    log.debug("Opening load favorites dialog");
    set({ showLoadFavoritesDialog: true, isLoading: true });
    try {
      await get().loadPersistentSingers();
    } finally {
      set({ isLoading: false });
    }
  },

  closeLoadFavoritesDialog: () => {
    log.debug("Closing load favorites dialog");
    set({
      showLoadFavoritesDialog: false,
      selectedSingerId: null,
      favorites: [],
    });
  },

  openManageFavoritesDialog: async () => {
    log.debug("Opening manage favorites dialog");
    set({ showManageFavoritesDialog: true, isLoading: true });
    try {
      await get().loadPersistentSingers();
    } finally {
      set({ isLoading: false });
    }
  },

  closeManageFavoritesDialog: () => {
    log.debug("Closing manage favorites dialog");
    set({
      showManageFavoritesDialog: false,
      selectedSingerId: null,
      favorites: [],
    });
  },

  loadPersistentSingers: async () => {
    log.debug("Loading persistent singers");
    try {
      const singers = await sessionService.getPersistentSingers();
      set({ persistentSingers: singers });
    } catch (error) {
      log.error("Failed to load persistent singers:", error);
    }
  },

  selectSinger: async (singerId: number) => {
    log.debug(`Selecting singer: ${singerId}`);
    set({ selectedSingerId: singerId, isLoading: true });
    try {
      const favorites = await favoritesService.getSingerFavorites(singerId);
      set({ favorites, isLoading: false });
    } catch (error) {
      log.error("Failed to load singer favorites:", error);
      set({ isLoading: false });
    }
  },

  addFavorite: async (singerId: number, video: FavoriteVideo) => {
    log.info(`Adding favorite for singer ${singerId}: ${video.title}`);
    try {
      const favorite = await favoritesService.addFavorite(singerId, video);
      // If this singer is currently selected, update the favorites list
      if (get().selectedSingerId === singerId) {
        set((state) => ({
          favorites: [favorite, ...state.favorites.filter((f) => f.id !== favorite.id)],
        }));
      }
    } catch (error) {
      log.error("Failed to add favorite:", error);
      throw error;
    }
  },

  removeFavorite: async (singerId: number, videoId: string) => {
    log.info(`Removing favorite for singer ${singerId}: ${videoId}`);
    try {
      await favoritesService.removeFavorite(singerId, videoId);
      // If this singer is currently selected, update the favorites list
      if (get().selectedSingerId === singerId) {
        set((state) => ({
          favorites: state.favorites.filter((f) => f.video.video_id !== videoId),
        }));
      }
    } catch (error) {
      log.error("Failed to remove favorite:", error);
      throw error;
    }
  },

  bulkAddFavorites: async (singerId: number, videos: FavoriteVideo[]) => {
    log.info(`Bulk adding ${videos.length} favorites for singer ${singerId}`);
    try {
      const favorites = await favoritesService.bulkAddFavorites(singerId, videos);
      // If this singer is currently selected, update the favorites list
      if (get().selectedSingerId === singerId) {
        set({ favorites });
      }
    } catch (error) {
      log.error("Failed to bulk add favorites:", error);
      throw error;
    }
  },

  loadFavoritesToQueue: async (singerId: number, favoriteIds?: number[]) => {
    log.info(`Loading favorites to queue for singer ${singerId}`);
    try {
      const allFavorites = await favoritesService.getSingerFavorites(singerId);
      const favoritesToLoad = favoriteIds
        ? allFavorites.filter((f) => favoriteIds.includes(f.id))
        : allFavorites;

      const queueStore = useQueueStore.getState();
      const sessionStore = useSessionStore.getState();
      const { session, singers, loadSingers } = sessionStore;

      // If singer is not in the current session, add them first
      if (session && !singers.some((s) => s.id === singerId)) {
        log.info(`Adding singer ${singerId} to session first`);
        await sessionService.addSingerToSession(session.id, singerId);
        await loadSingers();
      }

      for (const favorite of favoritesToLoad) {
        // addToQueue is async - waits for fair position calculation if enabled
        const queueItem = await queueStore.addToQueue({
          id: favorite.video.video_id,
          title: favorite.video.title,
          artist: favorite.video.artist,
          thumbnailUrl: favorite.video.thumbnail_url,
          duration: favorite.video.duration,
          source: favorite.video.source,
          youtubeId: favorite.video.youtube_id,
          filePath: favorite.video.file_path,
        });

        // Auto-assign the singer to this queue item
        await sessionStore.assignSingerToQueueItem(queueItem.id, singerId);
      }

      log.info(`Added ${favoritesToLoad.length} favorites to queue for singer ${singerId}`);
    } catch (error) {
      log.error("Failed to load favorites to queue:", error);
      throw error;
    }
  },

  toggleHistorySelectionMode: () => {
    set((state) => ({
      historySelectionMode: !state.historySelectionMode,
      selectedHistoryIds: new Set(),
    }));
  },

  toggleHistoryItemSelection: (itemId: string) => {
    set((state) => {
      const newSelection = new Set(state.selectedHistoryIds);
      if (newSelection.has(itemId)) {
        newSelection.delete(itemId);
      } else {
        newSelection.add(itemId);
      }
      return { selectedHistoryIds: newSelection };
    });
  },

  clearHistorySelection: () => {
    set({ selectedHistoryIds: new Set(), historySelectionMode: false });
  },

  addSelectedHistoryToFavorites: async (singerId: number) => {
    const { selectedHistoryIds } = get();
    const { history } = useQueueStore.getState();

    const selectedItems = history.filter((item) => selectedHistoryIds.has(item.id));
    const videos: FavoriteVideo[] = selectedItems.map((item) => ({
      video_id: item.video.id,
      title: item.video.title,
      artist: item.video.artist,
      duration: item.video.duration,
      thumbnail_url: item.video.thumbnailUrl,
      source: item.video.source,
      youtube_id: item.video.youtubeId,
      file_path: item.video.filePath,
    }));

    if (videos.length > 0) {
      await get().bulkAddFavorites(singerId, videos);
      get().clearHistorySelection();
    }
  },
}));
