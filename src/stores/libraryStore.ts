import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "../services/logger";
import { useSettingsStore, SETTINGS_KEYS } from "./settingsStore";

const log = createLogger("LibraryStore");

// Cache TTL for file availability (1 minute)
const FILE_AVAILABILITY_CACHE_TTL_MS = 60_000;

/** Cache entry with timestamp for TTL */
interface CacheEntry {
  available: boolean;
  timestamp: number;
}

// Track in-flight file availability requests to prevent duplicate concurrent requests
const pendingFileChecks = new Map<string, Promise<boolean>>();

// Types matching Rust structs
export interface LibraryFolder {
  id: number;
  path: string;
  name: string;
  last_scan_at: string | null;
  file_count: number;
}

export interface LibraryVideo {
  file_path: string;
  file_name: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  has_lyrics: boolean;
  has_cdg: boolean;
  youtube_id: string | null;
  is_available: boolean;
  thumbnail_path: string | null;
}

export interface ScanOptions {
  create_hkmeta: boolean;
  fetch_song_info: boolean;
  fetch_lyrics: boolean;
  regenerate: boolean;
  generate_thumbnails: boolean;
}

export interface ScanResult {
  folder_id: number;
  files_found: number;
  hkmeta_created: number;
  hkmeta_existing: number;
  thumbnails_generated: number;
  thumbnails_failed: number;
  errors: string[];
  duration_ms: number;
}

export interface LibraryStats {
  total_folders: number;
  total_files: number;
  last_scan_at: string | null;
}

export type SearchMode = "youtube" | "local";

interface LibraryState {
  // Search mode
  searchMode: SearchMode;

  // Library data
  folders: LibraryFolder[];
  searchResults: LibraryVideo[];
  stats: LibraryStats | null;

  // Loading states
  isLoadingFolders: boolean;
  isSearching: boolean;
  isScanning: boolean;
  scanProgress: { current: number; total: number } | null;

  // File availability cache (file_path -> {available, timestamp}) with TTL
  fileAvailabilityCache: Map<string, CacheEntry>;

  // Actions
  setSearchMode: (mode: SearchMode) => void;
  loadFolders: () => Promise<void>;
  addFolder: (path: string) => Promise<LibraryFolder>;
  removeFolder: (folderId: number) => Promise<void>;
  scanFolder: (folderId: number, options?: Partial<ScanOptions>) => Promise<ScanResult>;
  scanAll: (options?: Partial<ScanOptions>) => Promise<ScanResult[]>;
  searchLibrary: (query: string, limit?: number) => Promise<void>;
  clearSearchResults: () => void;
  loadStats: () => Promise<void>;
  checkFileAvailable: (filePath: string) => Promise<boolean>;
  getCachedAvailability: (filePath: string) => boolean | undefined;
}

const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  create_hkmeta: true,
  fetch_song_info: true,
  fetch_lyrics: true,
  regenerate: false,
  generate_thumbnails: true,
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  // Initial state
  searchMode: "youtube",
  folders: [],
  searchResults: [],
  stats: null,
  isLoadingFolders: false,
  isSearching: false,
  isScanning: false,
  scanProgress: null,
  fileAvailabilityCache: new Map(),

  // Actions
  setSearchMode: (mode: SearchMode) => {
    log.info(`Setting search mode to: ${mode}`);
    set({ searchMode: mode, searchResults: [] });
  },

  loadFolders: async () => {
    log.debug("Loading library folders");
    set({ isLoadingFolders: true });

    try {
      const folders = await invoke<LibraryFolder[]>("library_get_folders");
      log.debug(`Loaded ${folders.length} folders`);
      set({ folders, isLoadingFolders: false });
    } catch (error) {
      log.error("Failed to load folders:", error);
      set({ isLoadingFolders: false });
      throw error;
    }
  },

  addFolder: async (path: string) => {
    log.info(`Adding folder: ${path}`);

    try {
      const folder = await invoke<LibraryFolder>("library_add_folder", { path });
      log.info(`Added folder: ${folder.name} (id: ${folder.id})`);

      set((state) => ({
        folders: [...state.folders, folder],
      }));

      return folder;
    } catch (error) {
      log.error("Failed to add folder:", error);
      throw error;
    }
  },

  removeFolder: async (folderId: number) => {
    log.info(`Removing folder: ${folderId}`);

    try {
      await invoke("library_remove_folder", { folderId });

      set((state) => ({
        folders: state.folders.filter((f) => f.id !== folderId),
      }));

      log.info(`Removed folder: ${folderId}`);
    } catch (error) {
      log.error("Failed to remove folder:", error);
      throw error;
    }
  },

  scanFolder: async (folderId: number, options?: Partial<ScanOptions>) => {
    const folder = get().folders.find((f) => f.id === folderId);
    if (!folder) {
      log.error(`Folder not found: ${folderId}`);
      throw new Error(`Folder ${folderId} not found`);
    }
    log.info(`Scanning folder: ${folder.name}`);
    set({ isScanning: true, scanProgress: { current: 0, total: 1 } });

    try {
      const scanOptions = { ...DEFAULT_SCAN_OPTIONS, ...options };
      const result = await invoke<ScanResult>("library_scan_folder", {
        folderId,
        options: scanOptions,
      });

      log.info(
        `Scan complete: ${result.files_found} files found, ${result.hkmeta_created} hkmeta created`
      );

      // Update folder in state with new file count
      set((state) => ({
        folders: state.folders.map((f) =>
          f.id === folderId
            ? { ...f, file_count: result.files_found, last_scan_at: new Date().toISOString() }
            : f
        ),
        isScanning: false,
        scanProgress: null,
      }));

      return result;
    } catch (error) {
      log.error("Failed to scan folder:", error);
      set({ isScanning: false, scanProgress: null });
      throw error;
    }
  },

  scanAll: async (options?: Partial<ScanOptions>) => {
    const { folders } = get();
    log.info(`Scanning all ${folders.length} folders`);
    set({ isScanning: true, scanProgress: { current: 0, total: folders.length } });

    try {
      const scanOptions = { ...DEFAULT_SCAN_OPTIONS, ...options };
      const results = await invoke<ScanResult[]>("library_scan_all", {
        options: scanOptions,
      });

      log.info(`Scan all complete: ${results.length} folders scanned`);

      // Reload folders to get updated stats
      await get().loadFolders();

      set({ isScanning: false, scanProgress: null });
      return results;
    } catch (error) {
      log.error("Failed to scan all folders:", error);
      set({ isScanning: false, scanProgress: null });
      throw error;
    }
  },

  searchLibrary: async (query: string, limit = 50) => {
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }

    // Get include_lyrics setting from settings store
    const includeLyrics = useSettingsStore.getState().getSetting(SETTINGS_KEYS.SEARCH_INCLUDE_LYRICS) === "true";

    log.debug(`Searching library for: "${query}" (limit: ${limit}, includeLyrics: ${includeLyrics})`);
    set({ isSearching: true });

    try {
      const results = await invoke<LibraryVideo[]>("library_search", {
        query,
        limit,
        includeLyrics,
      });

      log.debug(`Found ${results.length} results`);

      // Update file availability cache with timestamps using functional update
      // to prevent race condition with concurrent searches
      const now = Date.now();
      set((state) => {
        const cache = new Map(state.fileAvailabilityCache);
        for (const video of results) {
          cache.set(video.file_path, { available: video.is_available, timestamp: now });
        }
        return { searchResults: results, isSearching: false, fileAvailabilityCache: cache };
      });
    } catch (error) {
      log.error("Failed to search library:", error);
      set({ isSearching: false });
      throw error;
    }
  },

  clearSearchResults: () => {
    set({ searchResults: [] });
  },

  loadStats: async () => {
    log.debug("Loading library stats");

    try {
      const stats = await invoke<LibraryStats>("library_get_stats");
      log.debug(`Stats: ${stats.total_folders} folders, ${stats.total_files} files`);
      set({ stats });
    } catch (error) {
      log.error("Failed to load stats:", error);
      throw error;
    }
  },

  checkFileAvailable: async (filePath: string) => {
    // Check if there's already an in-flight request for this file
    const pending = pendingFileChecks.get(filePath);
    if (pending) {
      log.debug(`Reusing pending check for: ${filePath}`);
      return pending;
    }

    // Create and track the promise
    const checkPromise = (async () => {
      try {
        const available = await invoke<boolean>("library_check_file", { filePath });

        // Update cache with timestamp
        set((state) => {
          const cache = new Map(state.fileAvailabilityCache);
          cache.set(filePath, { available, timestamp: Date.now() });
          return { fileAvailabilityCache: cache };
        });

        return available;
      } catch (error) {
        log.error("Failed to check file availability:", error);
        return false;
      } finally {
        // Clean up pending request
        pendingFileChecks.delete(filePath);
      }
    })();

    pendingFileChecks.set(filePath, checkPromise);
    return checkPromise;
  },

  getCachedAvailability: (filePath: string) => {
    const cached = get().fileAvailabilityCache.get(filePath);
    if (!cached) return undefined;

    // Check if cache entry has expired
    if (Date.now() - cached.timestamp > FILE_AVAILABILITY_CACHE_TTL_MS) {
      return undefined; // Expired, return undefined to trigger fresh check
    }

    return cached.available;
  },
}));
