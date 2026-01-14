import type { Page } from "@playwright/test";

/**
 * Mock search result type matching src/types/youtube.ts
 */
export interface MockSearchResult {
  id: string;
  title: string;
  channel: string;
  duration?: number;
  thumbnail?: string;
  view_count?: number;
}

/**
 * Mock stream info type matching src/types/youtube.ts
 */
export interface MockStreamInfo {
  url: string;
  format: string;
  quality: string;
}

/**
 * Configuration for Tauri mocks
 */
export interface TauriMockConfig {
  /** Mock search results to return */
  searchResults?: MockSearchResult[];
  /** Mock stream URL info */
  streamUrl?: MockStreamInfo;
  /** Whether yt-dlp is available */
  ytdlpAvailable?: boolean;
  /** Whether search should fail */
  shouldFailSearch?: boolean;
  /** Whether stream URL fetch should fail */
  shouldFailStreamUrl?: boolean;
  /** Initial playback mode setting */
  playbackMode?: "youtube" | "ytdlp";
  /** Initial search method setting */
  searchMethod?: "api" | "ytdlp";
  /** Whether YouTube API key is configured */
  hasApiKey?: boolean;
  /** Whether API key validation should succeed */
  apiKeyValid?: boolean;
  /** Whether autoplay next song is enabled (default: true) */
  autoplayNext?: boolean;
  /** Default volume mode: "remember", "25", "50", "75", "100" */
  defaultVolume?: string;
  /** Last remembered volume (0-1 as string, used when defaultVolume is "remember") */
  lastVolume?: string;
  /** Initial queue state */
  queueState?: {
    queue: unknown[];
    history: unknown[];
    history_index: number;
  };
  /** Mock monitors for display management */
  monitors?: Array<{
    name: string;
    position: { x: number; y: number };
    size: { width: number; height: number };
    scaleFactor: number;
  }>;
  /** Initial search history */
  searchHistory?: string[];
}

/**
 * Inject Tauri API mocks into the page before navigating.
 * This must be called before `page.goto()`.
 *
 * @param page - Playwright Page object
 * @param config - Configuration for the mocks
 */
export async function injectTauriMocks(
  page: Page,
  config: TauriMockConfig = {}
): Promise<void> {
  await page.addInitScript((mockConfig) => {
    // Store mock config globally for access in handlers
    (window as unknown as { __TAURI_MOCK_CONFIG__: typeof mockConfig }).__TAURI_MOCK_CONFIG__ = mockConfig;

    // Default settings matching SETTINGS_DEFAULTS from settingsStore.ts
    const defaultSettings: Record<string, string> = {
      video_quality: "best",
      autoplay_next: mockConfig.autoplayNext !== false ? "true" : "false",
      default_volume: mockConfig.defaultVolume ?? "remember",
      last_volume: mockConfig.lastVolume ?? "1",
      prefetch_seconds: "20",
      next_song_overlay_seconds: "20",
      singer_announcement_seconds: "5",
      remember_player_position: "true",
      history_limit: "100",
      clear_queue_on_exit: "never",
      search_include_lyrics: "true",
      playback_mode: mockConfig.playbackMode || "youtube",
      ytdlp_available: mockConfig.ytdlpAvailable !== false ? "true" : "",
      youtube_search_method: mockConfig.searchMethod || "api",
      youtube_api_key: mockConfig.hasApiKey !== false ? "AIzaTestKey123456789" : "",
      search_history_global: "true",
      search_history_session_limit: "50",
      search_history_global_limit: "50",
    };

    // In-memory settings store for tests
    const settingsStore: Record<string, string> = { ...defaultSettings };

    // In-memory queue state
    let queueState = mockConfig.queueState || {
      queue: [],
      history: [],
      history_index: -1,
    };

    // In-memory session state
    let sessionIdCounter = 1;
    let activeSession: { id: number; name: string | null; is_active: boolean; created_at: string } | null = null;

    // In-memory search history state
    const searchHistoryStore: { youtube: string[]; local: string[] } = {
      youtube: mockConfig.searchHistory || [],
      local: [],
    };

    // Callback storage for transformCallback
    let callbackId = 0;
    const callbacks: Record<number, (data: unknown) => void> = {};

    // Mock the Tauri __TAURI_INTERNALS__ object
    (window as unknown as { __TAURI_INTERNALS__: {
      invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
      transformCallback: (callback: (data: unknown) => void, once?: boolean) => number;
    } }).__TAURI_INTERNALS__ = {
      // Transform callback for event listeners
      transformCallback: (callback: (data: unknown) => void, once = false) => {
        const id = callbackId++;
        callbacks[id] = (data: unknown) => {
          callback(data);
          if (once) {
            delete callbacks[id];
          }
        };
        return id;
      },

      invoke: async (cmd: string, args?: Record<string, unknown>) => {
        const config = (window as unknown as { __TAURI_MOCK_CONFIG__: typeof mockConfig }).__TAURI_MOCK_CONFIG__ || {};

        // Console log for debugging in tests
        console.log(`[Tauri Mock] invoke: ${cmd}`, args);

        switch (cmd) {
          // YouTube service commands
          case "youtube_search":
            if (config.shouldFailSearch) {
              throw new Error("Search failed - yt-dlp not available");
            }
            return config.searchResults || [];

          case "youtube_get_stream_url":
            if (config.shouldFailStreamUrl) {
              throw new Error("Failed to get stream URL");
            }
            return (
              config.streamUrl || {
                url: "https://mock-stream.example.com/video.mp4",
                format: "mp4",
                quality: "720p",
              }
            );

          case "youtube_check_available":
            return config.ytdlpAvailable !== false;

          case "youtube_get_info":
            return {
              id: args?.videoId,
              title: "Mock Video Title",
              channel: "Mock Channel",
              duration: 180,
            };

          case "youtube_install_ytdlp":
            return { success: true, message: "Installed", output: "" };

          // YouTube Data API commands
          case "youtube_api_search":
            if (config.shouldFailSearch) {
              throw new Error("YouTube API search failed");
            }
            return config.searchResults || [];

          case "youtube_validate_api_key":
            if (config.apiKeyValid === false) {
              throw new Error("Invalid API key");
            }
            return true;

          case "youtube_get_search_method": {
            const apiKey = settingsStore["youtube_api_key"];
            const method = settingsStore["youtube_search_method"] || "api";
            if (method === "ytdlp") {
              return config.ytdlpAvailable !== false ? "ytdlp" : "none";
            }
            // Default to API mode
            return apiKey ? "api" : "none";
          }

          // Settings commands
          case "settings_get":
            return settingsStore[args?.key as string] ?? null;

          case "settings_get_all":
            return { ...settingsStore };

          case "settings_set":
            settingsStore[args?.key as string] = args?.value as string;
            return null;

          case "settings_reset_all":
            Object.assign(settingsStore, defaultSettings);
            return null;

          // Queue commands
          case "queue_add_item":
            queueState.queue.push(args?.item);
            return null;

          case "queue_remove_item":
            queueState.queue = queueState.queue.filter(
              (item: { id?: string }) => item.id !== args?.itemId
            );
            return null;

          case "queue_reorder":
            // Simple reorder - find item and move to new position
            const itemIndex = queueState.queue.findIndex(
              (item: { id?: string }) => item.id === args?.itemId
            );
            if (itemIndex !== -1) {
              const [item] = queueState.queue.splice(itemIndex, 1);
              queueState.queue.splice(args?.newPosition as number, 0, item);
            }
            return null;

          case "queue_clear":
            queueState.queue = [];
            return null;

          case "queue_fair_shuffle":
            // Simple shuffle for testing
            queueState.queue.sort(() => Math.random() - 0.5);
            return null;

          case "queue_move_to_history":
            const queueItem = queueState.queue.find(
              (item: { id?: string }) => item.id === args?.itemId
            );
            if (queueItem) {
              queueState.queue = queueState.queue.filter(
                (item: { id?: string }) => item.id !== args?.itemId
              );
              queueState.history.push(queueItem);
            }
            return null;

          case "queue_add_to_history":
            queueState.history.push(args?.item);
            return null;

          case "queue_clear_history":
            queueState.history = [];
            queueState.history_index = -1;
            return null;

          case "queue_move_all_history_to_queue":
            queueState.queue = [...queueState.history, ...queueState.queue];
            queueState.history = [];
            queueState.history_index = -1;
            return null;

          case "queue_set_history_index":
            queueState.history_index = args?.index as number;
            return null;

          case "queue_get_state":
            return queueState;

          // Session commands
          case "session_get_active":
          case "get_active_session":
            return activeSession;

          case "start_session": {
            // Create new session - queue items are preserved (simulating backend migration)
            const newSession = {
              id: sessionIdCounter++,
              name: (args?.name as string) || null,
              is_active: true,
              created_at: new Date().toISOString(),
            };
            activeSession = newSession;
            console.log(`[Tauri Mock] Session started: ${newSession.id}, queue has ${queueState.queue.length} items`);
            return newSession;
          }

          case "end_session":
            activeSession = null;
            // Queue is preserved in archived state (not cleared)
            return null;

          case "session_add_singer":
          case "session_remove_singer":
          case "session_set_active_singer":
          case "session_assign_singer":
            return null;

          case "session_get_singers":
            return [];

          // Persistent singers
          case "get_persistent_singers":
            return [];

          // Debug mode
          case "get_debug_mode":
            return false;

          case "set_debug_mode":
            return null;

          // Media controls stop (different name from media_stop)
          case "media_controls_stop":
            return null;

          // Library commands
          case "library_get_folders":
            return [];

          case "library_search":
            return [];

          case "library_browse":
            return { folders: [], files: [], totalCount: 0 };

          // Search history commands
          case "search_history_add": {
            const searchType = args?.searchType as "youtube" | "local";
            const query = (args?.query as string)?.trim();
            if (query && searchType) {
              // Remove if exists (dedup), then add to front
              const arr = searchHistoryStore[searchType];
              const idx = arr.indexOf(query);
              if (idx !== -1) arr.splice(idx, 1);
              arr.unshift(query);
              // Limit to 50 entries
              if (arr.length > 50) arr.pop();
            }
            return null;
          }

          case "search_history_get": {
            const searchType = args?.searchType as "youtube" | "local";
            const limit = (args?.limit as number) || 50;
            return searchHistoryStore[searchType]?.slice(0, limit) || [];
          }

          case "search_history_clear":
            searchHistoryStore.youtube = [];
            searchHistoryStore.local = [];
            return null;

          case "search_history_clear_session":
            // In tests, just clear everything for simplicity
            searchHistoryStore.youtube = [];
            searchHistoryStore.local = [];
            return null;

          // Display commands
          case "window_get_states":
          case "window_save_state":
          case "window_clear_states":
          case "display_get_configuration":
          case "display_save_config":
          case "display_get_saved_config":
          case "display_update_auto_apply":
          case "display_delete_config":
            return null;

          // Favorites commands
          case "favorites_get":
            return [];

          case "favorites_add":
          case "favorites_remove":
          case "favorites_bulk_add":
            return null;

          case "favorites_check_video":
            return { inFavorites: false };

          // Media controls
          case "media_update_metadata":
          case "media_update_playback":
          case "media_stop":
            return null;

          // Event listener commands (Tauri v2 plugin system)
          case "plugin:event|listen": {
            const eventName = args?.event as string;
            const handler = args?.handler as number;
            console.log(`[Tauri Mock] plugin:event|listen: ${eventName}, handler: ${handler}`);
            // Return a listener ID that can be used to unregister
            return handler;
          }

          case "plugin:event|unlisten":
            console.log(`[Tauri Mock] plugin:event|unlisten`);
            return null;

          case "plugin:event|emit":
            console.log(`[Tauri Mock] plugin:event|emit`, args);
            return null;

          // Window commands
          case "plugin:window|available_monitors":
            return mockMonitors;

          case "plugin:window|current_monitor":
            return mockMonitors[0];

          case "plugin:window|primary_monitor":
            return mockMonitors[0];

          case "plugin:webview|get_all_webviews":
            return [];

          default:
            console.warn(`[Tauri Mock] Unmocked command: ${cmd}`, args);
            return null;
        }
      },
    };

    // Mock Tauri event system
    type EventCallback = (event: { payload: unknown }) => void;
    const eventListeners = new Map<string, Set<EventCallback>>();
    const registeredListeners = new Map<number, { event: string; handler: EventCallback }>();
    let listenerId = 0;

    // Mock the internal event plugin used for unregistering listeners
    (window as unknown as { __TAURI_EVENT_PLUGIN_INTERNALS__: {
      unregisterListener: (id: number) => void;
    } }).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
      unregisterListener: (id: number) => {
        const listener = registeredListeners.get(id);
        if (listener) {
          eventListeners.get(listener.event)?.delete(listener.handler);
          registeredListeners.delete(id);
        }
      },
    };

    (window as unknown as { __TAURI_PLUGIN_EVENT__: {
      emit: (event: string, payload?: unknown) => Promise<void>;
      listen: (event: string, handler: EventCallback) => Promise<() => void>;
    } }).__TAURI_PLUGIN_EVENT__ = {
      emit: async (event: string, payload?: unknown) => {
        console.log(`[Tauri Mock] emit: ${event}`, payload);
        const listeners = eventListeners.get(event);
        if (listeners) {
          listeners.forEach((cb) => cb({ payload }));
        }
      },
      listen: async (event: string, handler: EventCallback) => {
        console.log(`[Tauri Mock] listen: ${event}`);
        if (!eventListeners.has(event)) {
          eventListeners.set(event, new Set());
        }
        eventListeners.get(event)!.add(handler);
        // Return unlisten function
        return () => {
          eventListeners.get(event)?.delete(handler);
        };
      },
    };

    // Mock WebviewWindow
    const mockMonitors = mockConfig.monitors || [
      {
        name: "Primary",
        position: { x: 0, y: 0 },
        size: { width: 1920, height: 1080 },
        scaleFactor: 2,
      },
    ];

    class MockWebviewWindow {
      label: string;
      constructor(label: string, _options?: unknown) {
        this.label = label;
        console.log(`[Tauri Mock] WebviewWindow created: ${label}`);
      }
      async close() {
        console.log(`[Tauri Mock] WebviewWindow.close: ${this.label}`);
      }
      async setFocus() {}
      async setPosition() {}
      async setSize() {}
      async innerPosition() {
        return { x: 100, y: 100 };
      }
      async innerSize() {
        return { width: 854, height: 480 };
      }
      async isVisible() {
        return true;
      }
      async setFullscreen() {}
      once(_event: string, handler: () => void) {
        // Simulate immediate creation success
        setTimeout(handler, 10);
      }
      onCloseRequested(_handler: () => void) {
        return () => {};
      }
    }

    (window as unknown as { WebviewWindow: typeof MockWebviewWindow }).WebviewWindow = MockWebviewWindow;
    (window as unknown as { __TAURI_PLUGIN_WEBVIEW_WINDOW__: {
      WebviewWindow: typeof MockWebviewWindow;
      getAllWebviewWindows: () => Promise<MockWebviewWindow[]>;
    } }).__TAURI_PLUGIN_WEBVIEW_WINDOW__ = {
      WebviewWindow: MockWebviewWindow,
      getAllWebviewWindows: async () => [],
    };

    // Mock window API
    (window as unknown as { __TAURI_PLUGIN_WINDOW__: {
      availableMonitors: () => Promise<typeof mockMonitors>;
    } }).__TAURI_PLUGIN_WINDOW__ = {
      availableMonitors: async () => mockMonitors,
    };

    // Mock DPI classes
    class LogicalPosition {
      x: number;
      y: number;
      constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
      }
    }
    class LogicalSize {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
    }
    (window as unknown as { __TAURI_PLUGIN_DPI__: {
      LogicalPosition: typeof LogicalPosition;
      LogicalSize: typeof LogicalSize;
    } }).__TAURI_PLUGIN_DPI__ = {
      LogicalPosition,
      LogicalSize,
    };

    // Mock the logger plugin
    (window as unknown as { __TAURI_PLUGIN_LOG__: {
      trace: () => void;
      debug: () => void;
      info: () => void;
      warn: () => void;
      error: () => void;
    } }).__TAURI_PLUGIN_LOG__ = {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };

    // Mock dialog plugin
    (window as unknown as { __TAURI_PLUGIN_DIALOG__: {
      open: () => Promise<null>;
      save: () => Promise<null>;
      message: () => Promise<void>;
      ask: () => Promise<boolean>;
      confirm: () => Promise<boolean>;
    } }).__TAURI_PLUGIN_DIALOG__ = {
      open: async () => null,
      save: async () => null,
      message: async () => {},
      ask: async () => true,
      confirm: async () => true,
    };

    // Mock shell plugin (used for opening URLs)
    (window as unknown as { __TAURI_PLUGIN_SHELL__: {
      open: () => Promise<void>;
    } }).__TAURI_PLUGIN_SHELL__ = {
      open: async () => {},
    };

    console.log("[Tauri Mock] Tauri APIs mocked successfully");
  }, config);
}

/**
 * Helper function to create mock search results
 * Video IDs must be exactly 11 characters (YouTube format) to pass filtering
 */
export function createMockSearchResults(count = 5): MockSearchResult[] {
  // Generate 11-character video IDs (YouTube format)
  const videoIds = [
    "dQw4w9WgXcQ", // 11 chars
    "jNQXAC9IVRw", // 11 chars
    "kJQP7kiw5Fk", // 11 chars
    "9bZkp7q19f0", // 11 chars
    "RgKAFK5djSk", // 11 chars
    "2Vv-BfVoq4g", // 11 chars
    "fRh_vgS2dFE", // 11 chars
    "JGwWNGJdvx8", // 11 chars
    "hT_nvWreIhg", // 11 chars
    "kXYiU_JCYtU", // 11 chars
  ];

  return Array.from({ length: Math.min(count, videoIds.length) }, (_, i) => ({
    id: videoIds[i],
    title: `Test Karaoke Song ${i + 1}`,
    channel: `Karaoke Channel ${i + 1}`,
    duration: 180 + i * 30,
    thumbnail: `https://i.ytimg.com/vi/${videoIds[i]}/hqdefault.jpg`,
    view_count: 1000000 + i * 100000,
  }));
}

/**
 * Helper to emit a Tauri event from test code
 */
export async function emitTauriEvent(
  page: Page,
  event: string,
  payload?: unknown
): Promise<void> {
  await page.evaluate(
    ({ event, payload }) => {
      const plugin = (window as unknown as { __TAURI_PLUGIN_EVENT__?: { emit: (event: string, payload?: unknown) => Promise<void> } }).__TAURI_PLUGIN_EVENT__;
      if (plugin) {
        plugin.emit(event, payload);
      }
    },
    { event, payload }
  );
}

/**
 * Update mock config dynamically after page load.
 * Use this to change mock behavior during a test.
 */
export async function updateMockConfig(
  page: Page,
  config: Partial<TauriMockConfig>
): Promise<void> {
  await page.evaluate((newConfig) => {
    const currentConfig = (window as unknown as { __TAURI_MOCK_CONFIG__?: TauriMockConfig }).__TAURI_MOCK_CONFIG__ || {};
    (window as unknown as { __TAURI_MOCK_CONFIG__: TauriMockConfig }).__TAURI_MOCK_CONFIG__ = {
      ...currentConfig,
      ...newConfig,
    };
  }, config);
}
