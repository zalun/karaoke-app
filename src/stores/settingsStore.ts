import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "../services/logger";
import { youtubeService } from "../services";

const log = createLogger("SettingsStore");

// Settings keys
export const SETTINGS_KEYS = {
  // Playback
  VIDEO_QUALITY: "video_quality",
  AUTOPLAY_NEXT: "autoplay_next",
  DEFAULT_VOLUME: "default_volume",
  PREFETCH_SECONDS: "prefetch_seconds",
  // Display
  NEXT_SONG_OVERLAY_SECONDS: "next_song_overlay_seconds",
  SINGER_ANNOUNCEMENT_SECONDS: "singer_announcement_seconds",
  REMEMBER_PLAYER_POSITION: "remember_player_position",
  // Queue & History
  HISTORY_LIMIT: "history_limit",
  CLEAR_QUEUE_ON_EXIT: "clear_queue_on_exit",
  // Library
  SEARCH_INCLUDE_LYRICS: "search_include_lyrics", // include lyrics in local search
  // YouTube
  YOUTUBE_API_KEY: "youtube_api_key", // YouTube Data API v3 key
  YOUTUBE_SEARCH_METHOD: "youtube_search_method", // 'auto' | 'api' | 'ytdlp'
  // Advanced
  PLAYBACK_MODE: "playback_mode", // 'youtube' | 'ytdlp'
  // Internal (not shown in UI, used for caching)
  YTDLP_AVAILABLE: "ytdlp_available", // 'true' | 'false' | '' (not checked)
} as const;

// Default values
export const SETTINGS_DEFAULTS: Record<string, string> = {
  [SETTINGS_KEYS.VIDEO_QUALITY]: "best",
  [SETTINGS_KEYS.AUTOPLAY_NEXT]: "true",
  [SETTINGS_KEYS.DEFAULT_VOLUME]: "remember",
  [SETTINGS_KEYS.PREFETCH_SECONDS]: "20",
  [SETTINGS_KEYS.NEXT_SONG_OVERLAY_SECONDS]: "20",
  [SETTINGS_KEYS.SINGER_ANNOUNCEMENT_SECONDS]: "5",
  [SETTINGS_KEYS.REMEMBER_PLAYER_POSITION]: "true",
  [SETTINGS_KEYS.HISTORY_LIMIT]: "100",
  [SETTINGS_KEYS.CLEAR_QUEUE_ON_EXIT]: "never",
  [SETTINGS_KEYS.SEARCH_INCLUDE_LYRICS]: "true", // Default to including lyrics in search
  [SETTINGS_KEYS.YOUTUBE_SEARCH_METHOD]: "api", // Default to YouTube API
  [SETTINGS_KEYS.PLAYBACK_MODE]: "youtube", // Default to YouTube embed
};

export type SettingsTab = "playback" | "display" | "queue" | "library" | "advanced" | "about";

// Module-level promise prevents race conditions in checkYtDlpAvailability.
// Not stored in Zustand state because promises aren't serializable and we need
// a single shared reference across all concurrent calls.
let ytDlpCheckPromise: Promise<boolean> | null = null;

interface SettingsState {
  // Dialog state
  showSettingsDialog: boolean;
  activeTab: SettingsTab;

  // Settings values (loaded from DB)
  settings: Record<string, string>;
  isLoading: boolean;
  loadError: string | null;

  // yt-dlp availability (checked lazily when needed)
  ytDlpAvailable: boolean;
  ytDlpChecked: boolean;
  ytDlpChecking: boolean;

  // Actions
  openSettingsDialog: () => void;
  closeSettingsDialog: () => void;
  setActiveTab: (tab: SettingsTab) => void;
  loadSettings: () => Promise<void>;
  getSetting: (key: string) => string;
  setSetting: (key: string, value: string) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  checkYtDlpAvailability: (forceRecheck?: boolean) => Promise<boolean>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  // Dialog state
  showSettingsDialog: false,
  activeTab: "playback",

  // Settings values
  settings: { ...SETTINGS_DEFAULTS },
  isLoading: false,
  loadError: null,

  // yt-dlp availability (checked lazily)
  ytDlpAvailable: false,
  ytDlpChecked: false,
  ytDlpChecking: false,

  // Actions
  openSettingsDialog: () => {
    set({ showSettingsDialog: true, isLoading: true, loadError: null });
    get().loadSettings();
  },

  closeSettingsDialog: () => {
    set({ showSettingsDialog: false });
  },

  setActiveTab: (tab: SettingsTab) => {
    set({ activeTab: tab });
    // Check yt-dlp availability when switching to Advanced tab
    if (tab === "advanced" && !get().ytDlpChecked) {
      get().checkYtDlpAvailability();
    }
  },

  loadSettings: async () => {
    set({ isLoading: true, loadError: null });
    try {
      const dbSettings = await invoke<Record<string, string>>("settings_get_all");
      log.debug("Loaded settings from database:", dbSettings);

      // Merge with defaults (DB values override defaults)
      const mergedSettings = { ...SETTINGS_DEFAULTS, ...dbSettings };
      set({ settings: mergedSettings, isLoading: false });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.error("Failed to load settings:", error);
      set({ loadError: errorMessage, isLoading: false });
    }
  },

  getSetting: (key: string) => {
    const { settings } = get();
    return settings[key] ?? SETTINGS_DEFAULTS[key] ?? "";
  },

  setSetting: async (key: string, value: string) => {
    try {
      await invoke("settings_set", { key, value });
      log.debug(`Setting saved: ${key} = ${value}`);

      // Update local state
      set((state) => ({
        settings: { ...state.settings, [key]: value },
      }));
    } catch (error) {
      log.error(`Failed to save setting ${key}:`, error);
      throw error;
    }
  },

  resetToDefaults: async () => {
    try {
      // Use batch command for single transaction
      await invoke("settings_reset_all", { defaults: SETTINGS_DEFAULTS });

      // Clear the cached yt-dlp availability (not in defaults, so reset separately)
      await invoke("settings_set", { key: SETTINGS_KEYS.YTDLP_AVAILABLE, value: "" });

      log.info("Settings reset to defaults");

      // Update local state and clear yt-dlp check cache (forces re-check)
      set({
        settings: { ...SETTINGS_DEFAULTS, [SETTINGS_KEYS.YTDLP_AVAILABLE]: "" },
        ytDlpChecked: false,
        ytDlpAvailable: false,
        ytDlpChecking: false,
      });
    } catch (error) {
      log.error("Failed to reset settings:", error);
      throw error;
    }
  },

  checkYtDlpAvailability: async (forceRecheck = false) => {
    // If a check is already in progress
    if (ytDlpCheckPromise) {
      if (!forceRecheck) {
        // Return existing promise for concurrent calls
        return ytDlpCheckPromise;
      } else {
        // Wait for current check to finish before rechecking
        await ytDlpCheckPromise;
      }
    }

    // Check cached value from DB (unless force recheck)
    if (!forceRecheck) {
      const cached = get().getSetting(SETTINGS_KEYS.YTDLP_AVAILABLE);
      if (cached === "true" || cached === "false") {
        const available = cached === "true";
        log.info(`Using cached yt-dlp availability: ${available}`);
        set({ ytDlpAvailable: available, ytDlpChecked: true });
        return available;
      }
    }

    log.info("Checking yt-dlp availability on system");
    set({ ytDlpChecking: true });

    // Create and store the promise to prevent race conditions
    ytDlpCheckPromise = (async () => {
      try {
        const available = await youtubeService.checkAvailable();
        log.info(`yt-dlp available: ${available}`);

        // Cache result to DB
        await get().setSetting(SETTINGS_KEYS.YTDLP_AVAILABLE, available ? "true" : "false");

        set({ ytDlpAvailable: available, ytDlpChecked: true, ytDlpChecking: false });
        return available;
      } catch (err) {
        log.warn("Failed to check yt-dlp availability", err);
        set({ ytDlpAvailable: false, ytDlpChecked: true, ytDlpChecking: false });
        return false;
      } finally {
        ytDlpCheckPromise = null;
      }
    })();

    return ytDlpCheckPromise;
  },
}));
