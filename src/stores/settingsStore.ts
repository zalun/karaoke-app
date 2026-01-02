import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "../services/logger";

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
};

export type SettingsTab = "playback" | "display" | "queue" | "advanced" | "about";

interface SettingsState {
  // Dialog state
  showSettingsDialog: boolean;
  activeTab: SettingsTab;

  // Settings values (loaded from DB)
  settings: Record<string, string>;
  isLoading: boolean;

  // Actions
  openSettingsDialog: () => void;
  closeSettingsDialog: () => void;
  setActiveTab: (tab: SettingsTab) => void;
  loadSettings: () => Promise<void>;
  getSetting: (key: string) => string;
  setSetting: (key: string, value: string) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  // Dialog state
  showSettingsDialog: false,
  activeTab: "playback",

  // Settings values
  settings: { ...SETTINGS_DEFAULTS },
  isLoading: false,

  // Actions
  openSettingsDialog: () => {
    set({ showSettingsDialog: true, isLoading: true });
    get().loadSettings();
  },

  closeSettingsDialog: () => {
    set({ showSettingsDialog: false });
  },

  setActiveTab: (tab: SettingsTab) => {
    set({ activeTab: tab });
  },

  loadSettings: async () => {
    set({ isLoading: true });
    try {
      const dbSettings = await invoke<Record<string, string>>("settings_get_all");
      log.debug("Loaded settings from database:", dbSettings);

      // Merge with defaults (DB values override defaults)
      const mergedSettings = { ...SETTINGS_DEFAULTS, ...dbSettings };
      set({ settings: mergedSettings });
    } catch (error) {
      log.error("Failed to load settings:", error);
    } finally {
      set({ isLoading: false });
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
      // Save all defaults to database
      for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
        await invoke("settings_set", { key, value });
      }
      log.info("Settings reset to defaults");

      // Update local state
      set({ settings: { ...SETTINGS_DEFAULTS } });
    } catch (error) {
      log.error("Failed to reset settings:", error);
      throw error;
    }
  },
}));
