import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "../services/logger";
import { useSettingsStore, SETTINGS_KEYS } from "./settingsStore";
import { useSessionStore } from "./sessionStore";

const log = createLogger("SearchHistoryStore");

export type SearchType = "youtube" | "local";

interface SearchHistoryState {
  // Suggestions for current search context
  suggestions: string[];
  isLoading: boolean;

  // Currently active search type for suggestions
  activeSearchType: SearchType;

  // Actions
  recordSearch: (searchType: SearchType, query: string) => Promise<void>;
  getSuggestions: (searchType: SearchType) => Promise<string[]>;
  clearHistory: () => Promise<void>;
  clearSessionHistory: () => Promise<void>;
  filterSuggestions: (query: string) => string[];
}

export const useSearchHistoryStore = create<SearchHistoryState>((set, get) => ({
  suggestions: [],
  isLoading: false,
  activeSearchType: "youtube",

  recordSearch: async (searchType: SearchType, query: string) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    const session = useSessionStore.getState().session;
    if (!session) {
      log.warn("No active session, cannot record search history");
      return;
    }

    try {
      await invoke("search_history_add", {
        sessionId: session.id,
        searchType,
        query: trimmedQuery,
      });

      // Refresh suggestions to include the new search
      await get().getSuggestions(searchType);

      log.debug(`Recorded search: "${trimmedQuery}" (${searchType})`);
    } catch (error) {
      log.error("Failed to record search:", error);
      // Don't throw - recording history is non-critical
    }
  },

  getSuggestions: async (searchType: SearchType) => {
    const session = useSessionStore.getState().session;
    const settings = useSettingsStore.getState();

    const globalEnabled =
      settings.getSetting(SETTINGS_KEYS.SEARCH_HISTORY_GLOBAL) === "true";
    const sessionLimit =
      parseInt(settings.getSetting(SETTINGS_KEYS.SEARCH_HISTORY_SESSION_LIMIT), 10) || 50;
    const globalLimit =
      parseInt(settings.getSetting(SETTINGS_KEYS.SEARCH_HISTORY_GLOBAL_LIMIT), 10) || 50;

    const limit = globalEnabled ? globalLimit : sessionLimit;

    set({ isLoading: true, activeSearchType: searchType });

    try {
      const suggestions = await invoke<string[]>("search_history_get", {
        searchType,
        sessionId: session?.id ?? null,
        limit,
        global: globalEnabled,
      });

      set({ suggestions, isLoading: false });
      log.debug(`Loaded ${suggestions.length} suggestions for ${searchType}`);
      return suggestions;
    } catch (error) {
      log.error("Failed to get suggestions:", error);
      set({ suggestions: [], isLoading: false });
      return [];
    }
  },

  clearHistory: async () => {
    try {
      await invoke("search_history_clear");
      set({ suggestions: [] });
      log.info("Cleared all search history");
    } catch (error) {
      log.error("Failed to clear history:", error);
      throw error;
    }
  },

  clearSessionHistory: async () => {
    const session = useSessionStore.getState().session;
    if (!session) return;

    try {
      await invoke("search_history_clear_session", { sessionId: session.id });

      // Refresh suggestions
      await get().getSuggestions(get().activeSearchType);
      log.info("Cleared session search history");
    } catch (error) {
      log.error("Failed to clear session history:", error);
      throw error;
    }
  },

  filterSuggestions: (query: string) => {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) return get().suggestions;

    return get().suggestions.filter((s) => s.toLowerCase().includes(trimmedQuery));
  },
}));
