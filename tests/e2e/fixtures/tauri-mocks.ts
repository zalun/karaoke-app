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
/**
 * Mock auth tokens type
 */
export interface MockAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

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
  /** Initial auth tokens (if user is logged in) */
  authTokens?: MockAuthTokens | null;
  /** Whether auth_open_login should track that browser was opened */
  trackAuthLoginOpened?: boolean;
  /** Mock hosted session data (for testing session hosting) */
  hostedSession?: {
    id: string;
    sessionCode: string;
    qrCodeUrl: string;
    joinUrl: string;
    expiresAt: string;
  } | null;
  /** Whether creating a hosted session should fail */
  shouldFailHostSession?: boolean;
  /** Whether fair queue mode is enabled (default: false) */
  fairQueueEnabled?: boolean;
  /** Mock user for auth store (used when testing features requiring authenticated user) */
  mockUser?: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl?: string;
  } | null;
  /** Initial session state for restoration tests (simulates app restart with persisted session) */
  initialSession?: {
    id: number;
    name: string | null;
    hosted_session_id?: string;
    hosted_by_user_id?: string;
    hosted_session_status?: string;
  } | null;
  /** Whether session_set_hosted should return ownership conflict error */
  shouldFailWithOwnershipConflict?: boolean;
  /** Delay in ms before auth_get_tokens returns (simulates slow keychain/network) */
  authDelay?: number;
  /** Mock song requests for testing song request approval feature */
  songRequests?: Array<{
    id: string;
    title: string;
    status: "pending" | "approved" | "rejected" | "played";
    guest_name: string;
    requested_at: string;
    youtube_id?: string;
    artist?: string;
    duration?: number;
    thumbnail_url?: string;
  }>;
}

/**
 * Type definitions for HTTP mock window globals
 */
interface PendingHttpRequest {
  method: string;
  url: string;
  body: number[] | null;
  authToken?: string;
}

/**
 * Type definitions for HTTP mock window globals.
 * These are used inside addInitScript where window is available.
 */
interface _HttpMockGlobals {
  __PENDING_HTTP_REQUESTS__?: Map<number, PendingHttpRequest>;
  __HTTP_RESPONSE_BODIES__?: Map<number, Uint8Array>;
  __HTTP_BODIES_READ__?: Set<number>;
  __HTTP_NEXT_RID__?: number;
  __HOSTED_SESSION_CREATED__?: boolean;
  __HOSTED_SESSION_CODE__?: string;
  __HOSTED_SESSION_ID__?: string;
  __HOSTED_SESSION_STOPPED__?: boolean;
  __HOSTED_SESSION_STATUS__?: string;
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

    // --- HTTP Mock Helper Functions ---
    // These must be defined inside addInitScript where window is available

    interface HttpMockGlobalsInternal {
      __PENDING_HTTP_REQUESTS__?: Map<number, { method: string; url: string; body: number[] | null; authToken?: string }>;
      __HTTP_RESPONSE_BODIES__?: Map<number, Uint8Array>;
      __HTTP_BODIES_READ__?: Set<number>;
      __HTTP_NEXT_RID__?: number;
      __HOSTED_SESSION_CREATED__?: boolean;
      __HOSTED_SESSION_CODE__?: string;
      __HOSTED_SESSION_ID__?: string;
      __HOSTED_SESSION_STOPPED__?: boolean;
      __HOSTED_SESSION_STATUS__?: string;
      __SONG_REQUESTS__?: Array<{
        id: string;
        title: string;
        status: string;
        guest_name: string;
        requested_at: string;
        youtube_id?: string;
        artist?: string;
        duration?: number;
        thumbnail_url?: string;
      }>;
    }

    /** Helper to get typed access to HTTP mock globals */
    function getHttpMockGlobals(): HttpMockGlobalsInternal {
      return window as unknown as HttpMockGlobalsInternal;
    }

    /** Get next unique request ID (avoids collisions vs random) */
    function getNextRid(): number {
      const globals = getHttpMockGlobals();
      const rid = globals.__HTTP_NEXT_RID__ ?? 1;
      globals.__HTTP_NEXT_RID__ = rid + 1;
      return rid;
    }

    /** Clean up HTTP mock resources for a given request ID */
    function cleanupHttpResources(rid: number): void {
      const globals = getHttpMockGlobals();
      globals.__HTTP_RESPONSE_BODIES__?.delete(rid);
      globals.__HTTP_BODIES_READ__?.delete(rid);
    }

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
      fair_queue_enabled: mockConfig.fairQueueEnabled ? "true" : "false",
    };

    // In-memory settings store for tests
    const settingsStore: Record<string, string> = { ...defaultSettings };

    // In-memory queue state
    const queueState = mockConfig.queueState || {
      queue: [],
      history: [],
      history_index: -1,
    };

    // In-memory session state
    let sessionIdCounter = 1;
    let activeSession: {
      id: number;
      name: string | null;
      is_active: boolean;
      created_at: string;
      hosted_session_id?: string;
      hosted_by_user_id?: string;
      hosted_session_status?: string;
    } | null = mockConfig.initialSession ? {
      id: mockConfig.initialSession.id,
      name: mockConfig.initialSession.name,
      is_active: true,
      created_at: new Date().toISOString(),
      hosted_session_id: mockConfig.initialSession.hosted_session_id,
      hosted_by_user_id: mockConfig.initialSession.hosted_by_user_id,
      hosted_session_status: mockConfig.initialSession.hosted_session_status,
    } : null;

    // Track hosted session ID for restoration tests
    if (mockConfig.initialSession?.hosted_session_id) {
      const globals = getHttpMockGlobals();
      globals.__HOSTED_SESSION_ID__ = mockConfig.initialSession.hosted_session_id;
      globals.__HOSTED_SESSION_CODE__ = "HK-" + mockConfig.initialSession.hosted_session_id.slice(-8).toUpperCase().replace(/-/g, "").slice(0, 4) + "-" + mockConfig.initialSession.hosted_session_id.slice(-4).toUpperCase();
      globals.__HOSTED_SESSION_STATUS__ = mockConfig.initialSession.hosted_session_status || null;
      if (mockConfig.initialSession.hosted_session_status === "active") {
        globals.__HOSTED_SESSION_CREATED__ = true;
      }
    }

    // Initialize song requests from config (always initialize, even if empty)
    {
      const globals = getHttpMockGlobals();
      globals.__SONG_REQUESTS__ = mockConfig.songRequests ? [...mockConfig.songRequests] : [];
    }

    // In-memory search history state
    const searchHistoryStore: { youtube: string[]; local: string[] } = {
      youtube: mockConfig.searchHistory || [],
      local: [],
    };

    // In-memory auth state (simulating keychain storage)
    let authTokens: { access_token: string; refresh_token: string; expires_at: number } | null = mockConfig.authTokens || null;
    let _authLoginOpened = false;

    // Callback storage for transformCallback
    let callbackId = 0;
    const callbacks: Record<number, (data: unknown) => void> = {};

    // Event listener storage for plugin:event|listen
    const pluginEventListeners = new Map<string, Set<number>>();

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

          case "queue_reorder": {
            // Simple reorder - find item and move to new position
            const itemIndex = queueState.queue.findIndex(
              (item: { id?: string }) => item.id === args?.itemId
            );
            if (itemIndex !== -1) {
              const [item] = queueState.queue.splice(itemIndex, 1);
              queueState.queue.splice(args?.newPosition as number, 0, item);
            }
            return null;
          }

          case "queue_clear":
            queueState.queue = [];
            return null;

          case "queue_fair_shuffle":
            // Simple shuffle for testing
            queueState.queue.sort(() => Math.random() - 0.5);
            return null;

          case "queue_compute_fair_position": {
            // Compute fair position for a singer
            // For testing: if singer has 0 songs in queue, return 0 (top)
            // Otherwise return queue length (end)
            const singerId = args?.singerId as number | null;
            if (singerId === null) {
              return queueState.queue.length;
            }
            // Count how many songs this singer has in the queue
            // In the mock, we track singer assignments through a simple counter
            // For simplicity, return 0 if this appears to be the singer's first song
            // (simulating fair queue putting new singer's first song at top)
            const singerSongCount = (queueState as unknown as { singerCounts?: Record<number, number> }).singerCounts?.[singerId] || 0;
            if (singerSongCount === 0) {
              return 0; // First song goes to top
            }
            return queueState.queue.length; // Subsequent songs go to end for simplicity
          }

          case "queue_move_to_history": {
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
          }

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
          case "add_singer_to_session":
          case "remove_singer_from_session":
            return null;

          case "session_get_singers":
          case "get_session_singers":
            return [];

          case "session_get_active_singer":
            return null;

          // Hosted session commands
          case "session_set_hosted": {
            const sessionId = args?.sessionId as number;
            const hostedSessionId = args?.hostedSessionId as string;
            const hostedByUserId = args?.hostedByUserId as string;
            const status = args?.status as string;
            console.log(`[Tauri Mock] session_set_hosted: session=${sessionId}, hostedId=${hostedSessionId}, userId=${hostedByUserId}, status=${status}`);

            // CONC-006: Support simulating ownership conflict for E2E tests
            if (config.shouldFailWithOwnershipConflict) {
              console.log("[Tauri Mock] session_set_hosted: simulating ownership conflict");
              // Return error object matching CommandError::OwnershipConflict serialization
              throw {
                type: "ownership_conflict",
                message: "Another user is currently hosting this session. They must stop hosting before you can host.",
              };
            }

            if (activeSession && activeSession.id === sessionId) {
              activeSession.hosted_session_id = hostedSessionId;
              activeSession.hosted_by_user_id = hostedByUserId;
              activeSession.hosted_session_status = status;
              // Track for test assertions
              const sessionGlobals = getHttpMockGlobals();
              sessionGlobals.__HOSTED_SESSION_STATUS__ = status;
            }
            return null;
          }

          case "session_update_hosted_status": {
            const sessionId = args?.sessionId as number;
            const status = args?.status as string;
            console.log(`[Tauri Mock] session_update_hosted_status: session=${sessionId}, status=${status}`);
            if (activeSession && activeSession.id === sessionId) {
              activeSession.hosted_session_status = status;
              // Track for test assertions
              const sessionGlobals = getHttpMockGlobals();
              sessionGlobals.__HOSTED_SESSION_STATUS__ = status;
            }
            return null;
          }

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

          // Auth commands (keychain storage)
          case "auth_store_tokens":
            // Service uses camelCase: accessToken, refreshToken, expiresAt
            authTokens = {
              access_token: args?.accessToken as string,
              refresh_token: args?.refreshToken as string,
              expires_at: args?.expiresAt as number,
            };
            console.log(`[Tauri Mock] auth_store_tokens: tokens stored`, authTokens);
            return null;

          case "auth_get_tokens": {
            console.log(`[Tauri Mock] auth_get_tokens: ${authTokens ? "found" : "not found"}${config.authDelay ? ` (delayed ${config.authDelay}ms)` : ""}`);
            // Support authDelay option to simulate slow keychain/network access
            if (config.authDelay && config.authDelay > 0) {
              await new Promise((resolve) => setTimeout(resolve, config.authDelay));
            }
            return authTokens;
          }

          case "auth_clear_tokens":
            authTokens = null;
            console.log(`[Tauri Mock] auth_clear_tokens: tokens cleared`);
            return null;

          case "auth_open_login": {
            _authLoginOpened = true;
            const state = args?.state as string;
            console.log(`[Tauri Mock] auth_open_login: browser opened, state: ${state?.slice(0, 10)}...`);
            // Track that login was opened for test assertions
            if (config.trackAuthLoginOpened) {
              (window as unknown as { __AUTH_LOGIN_OPENED__: boolean }).__AUTH_LOGIN_OPENED__ = true;
            }
            // Store the state for tests to use in callback simulation
            (window as unknown as { __AUTH_PENDING_STATE__: string | null }).__AUTH_PENDING_STATE__ = state;
            return null;
          }

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
            // Store the handler ID for this event
            if (!pluginEventListeners.has(eventName)) {
              pluginEventListeners.set(eventName, new Set());
            }
            pluginEventListeners.get(eventName)!.add(handler);
            // Return a listener ID that can be used to unregister
            return handler;
          }

          case "plugin:event|unlisten": {
            const eventName = args?.event as string;
            const handler = args?.id as number;
            console.log(`[Tauri Mock] plugin:event|unlisten: ${eventName}, handler: ${handler}`);
            pluginEventListeners.get(eventName)?.delete(handler);
            return null;
          }

          case "plugin:event|emit": {
            const eventName = args?.event as string;
            const payload = args?.payload;
            console.log(`[Tauri Mock] plugin:event|emit: ${eventName}`, payload);
            // Call handlers registered via plugin:event|listen
            const pluginListeners = pluginEventListeners.get(eventName);
            if (pluginListeners) {
              pluginListeners.forEach((handlerId) => {
                const cb = callbacks[handlerId];
                if (cb) {
                  console.log(`[Tauri Mock] emit calling callback ${handlerId} for event ${eventName}`);
                  cb({ event: eventName, payload });
                }
              });
            }
            // Also call handlers registered via __TAURI_PLUGIN_EVENT__.listen
            const listeners = eventListeners.get(eventName);
            if (listeners) {
              listeners.forEach((cb) => cb({ payload }));
            }
            return null;
          }

          // Window commands
          case "plugin:window|available_monitors":
            return mockMonitors;

          case "plugin:window|current_monitor":
            return mockMonitors[0];

          case "plugin:window|primary_monitor":
            return mockMonitors[0];

          case "plugin:webview|get_all_webviews":
            return [];

          // HTTP plugin mock for hosted session API calls
          // The plugin uses a multi-step process: fetch -> fetch_send -> fetch_read_body
          case "plugin:http|fetch": {
            const clientConfig = (args as { clientConfig: { method: string; url: string; headers: [string, string][]; data: number[] | null } }).clientConfig;
            const url = clientConfig.url;
            const method = clientConfig.method || "GET";
            const headers = clientConfig.headers || [];

            // Extract Authorization header for validation
            const authHeader = headers.find(([key]) => key.toLowerCase() === "authorization");
            const authToken = authHeader?.[1];

            console.log(`[Tauri Mock] HTTP fetch init: ${method} ${url}`);

            // Store the pending request for fetch_send
            const globals = getHttpMockGlobals();
            const rid = getNextRid();
            const pendingRequests = globals.__PENDING_HTTP_REQUESTS__ || new Map();
            pendingRequests.set(rid, { method, url, body: clientConfig.data, authToken });
            globals.__PENDING_HTTP_REQUESTS__ = pendingRequests;

            return rid;
          }

          case "plugin:http|fetch_send": {
            const rid = (args as { rid: number }).rid;
            const globals = getHttpMockGlobals();
            const request = globals.__PENDING_HTTP_REQUESTS__?.get(rid);

            if (!request) {
              throw new Error("Request not found");
            }

            const { method, url, authToken } = request;
            console.log(`[Tauri Mock] HTTP fetch send: ${method} ${url}`);

            let responseBody = "{}";
            let status = 200;
            let statusText = "OK";

            // Handle hosted session API endpoints
            if (url.includes("homekaraoke.app/api/session")) {
              // Validate Authorization header for session endpoints
              // Note: Mock only validates Bearer prefix, not token content
              if (!authToken?.startsWith("Bearer ")) {
                status = 401;
                statusText = "Unauthorized";
                responseBody = JSON.stringify({ error: "Missing or invalid authorization token" });

                // Store response and return early
                const responseRid = getNextRid();
                const responseBodies = globals.__HTTP_RESPONSE_BODIES__ || new Map();
                responseBodies.set(responseRid, new TextEncoder().encode(responseBody));
                globals.__HTTP_RESPONSE_BODIES__ = responseBodies;

                return {
                  status,
                  statusText,
                  url,
                  headers: [["content-type", "application/json"]],
                  rid: responseRid,
                };
              }
              // POST /api/session/create - Create hosted session
              if (url.endsWith("/api/session/create") && method === "POST") {
                if (config.shouldFailHostSession) {
                  status = 500;
                  statusText = "Internal Server Error";
                  responseBody = JSON.stringify({ error: "Failed to create session" });
                } else {
                  const sessionId = "mock-session-" + Math.random().toString(36).substring(7);
                  const sessionCode = "HK-" + Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
                  const joinUrl = `https://homekaraoke.app/join/${sessionCode}`;
                  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(joinUrl)}`;
                  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

                  // Track state for test assertions
                  const sessionGlobals = getHttpMockGlobals();
                  sessionGlobals.__HOSTED_SESSION_CREATED__ = true;
                  sessionGlobals.__HOSTED_SESSION_CODE__ = sessionCode;
                  sessionGlobals.__HOSTED_SESSION_ID__ = sessionId;

                  responseBody = JSON.stringify({
                    session_id: sessionId,
                    session_code: sessionCode,
                    qr_code_url: qrCodeUrl,
                    join_url: joinUrl,
                    expires_at: expiresAt,
                  });
                }
              }
              // GET /api/session/[id]/requests - Get song requests
              else if (url.match(/\/api\/session\/[^/]+\/requests/) && method === "GET") {
                const requestsGlobals = getHttpMockGlobals();
                const songRequests = requestsGlobals.__SONG_REQUESTS__ || [];
                // Parse status filter from URL query params
                const urlObj = new URL(url);
                const statusFilter = urlObj.searchParams.get("status");
                const filteredRequests = statusFilter
                  ? songRequests.filter((r: { status: string }) => r.status === statusFilter)
                  : songRequests;
                responseBody = JSON.stringify(filteredRequests);
              }
              // PATCH /api/session/[id]/requests - Approve/reject requests
              else if (url.match(/\/api\/session\/[^/]+\/requests/) && method === "PATCH") {
                const requestsGlobals = getHttpMockGlobals();
                const songRequests = requestsGlobals.__SONG_REQUESTS__ || [];
                // Parse request body
                const bodyBytes = request.body;
                if (bodyBytes) {
                  const bodyStr = new TextDecoder().decode(new Uint8Array(bodyBytes));
                  const body = JSON.parse(bodyStr);
                  const action = body.action;
                  const requestId = body.requestId;
                  const requestIds = body.requestIds || (requestId ? [requestId] : []);

                  // Update request statuses
                  for (const id of requestIds) {
                    const req = songRequests.find((r: { id: string }) => r.id === id);
                    if (req) {
                      req.status = action === "approve" ? "approved" : "rejected";
                    }
                  }
                  requestsGlobals.__SONG_REQUESTS__ = songRequests;
                }
                responseBody = "{}";
              }
              // GET /api/session/[id] - Get session stats
              else if (url.match(/\/api\/session\/[^/]+$/) && method === "GET") {
                const statsGlobals = getHttpMockGlobals();
                const sessionId = statsGlobals.__HOSTED_SESSION_ID__;
                const sessionCode = statsGlobals.__HOSTED_SESSION_CODE__;

                if (!sessionId || !sessionCode) {
                  status = 404;
                  statusText = "Not Found";
                  responseBody = JSON.stringify({ error: "Session not found" });
                } else {
                  // Calculate pending requests from song requests
                  const songRequests = statsGlobals.__SONG_REQUESTS__ || [];
                  const pendingCount = songRequests.filter((r: { status: string }) => r.status === "pending").length;
                  responseBody = JSON.stringify({
                    id: sessionId,
                    session_code: sessionCode,
                    status: "active",
                    stats: { pending_requests: pendingCount, approved_requests: 0, total_guests: 0 },
                  });
                }
              }
              // DELETE /api/session/[id] - End session
              else if (url.match(/\/api\/session\/[^/]+$/) && method === "DELETE") {
                getHttpMockGlobals().__HOSTED_SESSION_STOPPED__ = true;
                responseBody = "{}";
              }
            } else {
              console.warn(`[Tauri Mock] Unmocked HTTP request: ${method} ${url}`);
              status = 404;
              statusText = "Not Found";
              responseBody = "Not found";
            }

            // Store response body for fetch_read_body
            const responseRid = getNextRid();
            const responseBodies = globals.__HTTP_RESPONSE_BODIES__ || new Map();
            responseBodies.set(responseRid, new TextEncoder().encode(responseBody));
            globals.__HTTP_RESPONSE_BODIES__ = responseBodies;

            return {
              status,
              statusText,
              url,
              headers: [["content-type", "application/json"]],
              rid: responseRid,
            };
          }

          /**
           * Tauri's HTTP plugin streams response bodies in two calls:
           * 1. First call returns body data with trailing 0 byte (more data signal)
           * 2. Second call returns [1] (end of stream signal)
           */
          case "plugin:http|fetch_read_body": {
            const rid = (args as { rid: number }).rid;
            const bodyGlobals = getHttpMockGlobals();
            const body = bodyGlobals.__HTTP_RESPONSE_BODIES__?.get(rid);

            // Body not found or already cleaned up
            if (!body) {
              return [1]; // Signal end of body
            }

            const bodiesRead = bodyGlobals.__HTTP_BODIES_READ__ || new Set();
            bodyGlobals.__HTTP_BODIES_READ__ = bodiesRead;

            if (!bodiesRead.has(rid)) {
              // First call: return body data with trailing 0 (more data coming)
              bodiesRead.add(rid);
              const result = new Uint8Array(body.length + 1);
              result.set(body);
              result[body.length] = 0; // Signal more data may come
              return Array.from(result);
            } else {
              // Second call: cleanup and return end signal
              cleanupHttpResources(rid);
              return [1]; // Signal end of body
            }
          }

          case "plugin:http|fetch_cancel":
          case "plugin:http|fetch_cancel_body":
            return null;

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
    const _listenerId = 0;

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
        // Call handlers registered via __TAURI_PLUGIN_EVENT__.listen
        const listeners = eventListeners.get(event);
        if (listeners) {
          listeners.forEach((cb) => cb({ payload }));
        }
        // Also call handlers registered via plugin:event|listen (Tauri API's listen function)
        const pluginListeners = pluginEventListeners.get(event);
        if (pluginListeners) {
          pluginListeners.forEach((handlerId) => {
            const cb = callbacks[handlerId];
            if (cb) {
              console.log(`[Tauri Mock] calling callback ${handlerId} for event ${event}`);
              cb({ event, payload });
            }
          });
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

    // Browser API mocks needed for E2E tests
    // Clipboard API is mocked here (rather than in a separate function) because:
    // 1. It's needed alongside Tauri mocks for copy buttons in hosted session modal
    // 2. Must be injected before page load via addInitScript
    // 3. Playwright's context.grantPermissions doesn't work reliably for clipboard
    const mockClipboard = {
      writeText: async (_text: string) => {
        console.log("[Tauri Mock] Clipboard writeText:", _text);
        return Promise.resolve();
      },
      readText: async () => "",
    };
    try {
      Object.defineProperty(navigator, "clipboard", {
        value: mockClipboard,
        writable: true,
        configurable: true,
      });
    } catch (e) {
      // If defineProperty fails (some browsers), try direct assignment
      console.warn("[Tauri Mock] Failed to defineProperty clipboard, using direct assignment", e);
      (navigator as unknown as { clipboard: typeof mockClipboard }).clipboard = mockClipboard;
    }

    // Store mock user for authStore to pick up
    if (mockConfig.mockUser) {
      (window as unknown as { __MOCK_USER__: typeof mockConfig.mockUser }).__MOCK_USER__ = mockConfig.mockUser;
      console.log("[Tauri Mock] Mock user set:", mockConfig.mockUser.email);
    }

    console.log("[Tauri Mock] Tauri APIs mocked successfully");
  }, config);
}

/**
 * Clean up HTTP mock resources after tests.
 * Call this in test.afterEach to prevent memory leaks during long test runs.
 *
 * @param page - Playwright Page object
 */
export async function cleanupHttpMocks(page: Page): Promise<void> {
  await page.evaluate(() => {
    const globals = window as unknown as {
      __HTTP_RESPONSE_BODIES__?: Map<number, Uint8Array>;
      __PENDING_HTTP_REQUESTS__?: Map<number, unknown>;
      __HTTP_BODIES_READ__?: Set<number>;
      __HTTP_NEXT_RID__?: number;
    };
    globals.__HTTP_RESPONSE_BODIES__?.clear();
    globals.__PENDING_HTTP_REQUESTS__?.clear();
    globals.__HTTP_BODIES_READ__?.clear();
    globals.__HTTP_NEXT_RID__ = 1;
  });
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

/**
 * Interface for checking hosted session state in tests
 */
interface HostedSessionTestState {
  created: boolean;
  sessionCode: string | null;
  stopped: boolean;
  status: string | null;
}

/**
 * Get hosted session test state from the page
 */
export async function getHostedSessionState(page: Page): Promise<HostedSessionTestState> {
  return page.evaluate(() => {
    return {
      created: !!(window as unknown as { __HOSTED_SESSION_CREATED__?: boolean }).__HOSTED_SESSION_CREATED__,
      sessionCode: (window as unknown as { __HOSTED_SESSION_CODE__?: string }).__HOSTED_SESSION_CODE__ ?? null,
      stopped: !!(window as unknown as { __HOSTED_SESSION_STOPPED__?: boolean }).__HOSTED_SESSION_STOPPED__,
      status: (window as unknown as { __HOSTED_SESSION_STATUS__?: string }).__HOSTED_SESSION_STATUS__ ?? null,
    };
  });
}

/**
 * Mock song request type for creating test data
 */
export interface MockSongRequest {
  id: string;
  title: string;
  status: "pending" | "approved" | "rejected" | "played";
  guest_name: string;
  requested_at: string;
  youtube_id?: string;
  artist?: string;
  duration?: number;
  thumbnail_url?: string;
}

/**
 * Helper function to create mock song requests for testing.
 * @param count - Number of requests to create
 * @param guestNames - Optional array of guest names to use (cycles through if fewer than count)
 */
export function createMockSongRequests(
  count = 3,
  guestNames: string[] = ["Alice", "Bob"]
): MockSongRequest[] {
  const videoIds = [
    "dQw4w9WgXcQ",
    "jNQXAC9IVRw",
    "kJQP7kiw5Fk",
    "9bZkp7q19f0",
    "RgKAFK5djSk",
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: `request-${i + 1}`,
    title: `Test Song Request ${i + 1}`,
    status: "pending" as const,
    guest_name: guestNames[i % guestNames.length],
    requested_at: new Date(Date.now() - i * 60000).toISOString(),
    youtube_id: videoIds[i % videoIds.length],
    artist: `Artist ${i + 1}`,
    duration: 180 + i * 30,
    thumbnail_url: `https://i.ytimg.com/vi/${videoIds[i % videoIds.length]}/hqdefault.jpg`,
  }));
}

/**
 * Interface for checking song requests state in tests
 */
interface SongRequestsTestState {
  requests: MockSongRequest[];
  pendingCount: number;
}

/**
 * Get song requests test state from the page
 */
export async function getSongRequestsState(page: Page): Promise<SongRequestsTestState> {
  return page.evaluate(() => {
    const requests = (window as unknown as { __SONG_REQUESTS__?: MockSongRequest[] }).__SONG_REQUESTS__ || [];
    return {
      requests,
      pendingCount: requests.filter((r) => r.status === "pending").length,
    };
  });
}

/**
 * Update song requests state dynamically during a test
 */
export async function updateSongRequests(
  page: Page,
  requests: MockSongRequest[]
): Promise<void> {
  await page.evaluate((newRequests) => {
    (window as unknown as { __SONG_REQUESTS__: typeof newRequests }).__SONG_REQUESTS__ = newRequests;
  }, requests);
}
