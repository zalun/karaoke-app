import { create } from "zustand";
import {
  createLogger,
  sessionService,
  hostedSessionService,
  persistSessionId,
  clearPersistedSessionId,
  HOSTED_SESSION_STATUS,
  ApiError,
  APP_SIGNALS,
  emitSignal,
  waitForSignalOrCondition,
  type Singer,
  type Session,
  type HostedSession,
} from "../services";
import type { SongRequest } from "../types";
import { authService, type User } from "../services/auth";
import { getNextSingerColor } from "../constants";
import { useQueueStore, flushPendingOperations } from "./queueStore";
import { notify } from "./notificationStore";
import { useAuthStore } from "./authStore";
import type { Video } from "./playerStore";

const log = createLogger("SessionStore");

// Polling interval for hosted session stats (30 seconds)
const HOSTED_SESSION_POLL_INTERVAL_MS = 30 * 1000;

// Buffer time before token expiry to consider it expired (5 minutes)
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

// Map to track pending singer creation operations by session_guest_id
// Prevents race condition where concurrent approvals create duplicate singers
const pendingSingerCreations = new Map<string, Promise<number>>();

/**
 * Helper to notify server of approval with one retry attempt.
 * If both attempts fail, shows a warning to the user.
 */
async function notifyServerWithRetry(
  accessToken: string,
  hostedSessionId: string,
  requestId: string,
  refreshSession: () => Promise<void>
): Promise<void> {
  const attempt = async () => {
    // Sequential: approve first, then refresh to get updated stats
    await hostedSessionService.approveRequest(accessToken, hostedSessionId, requestId);
    await refreshSession();
  };

  try {
    await attempt();
  } catch (firstError) {
    const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
    log.warn(`Server notification failed, retrying: ${firstMessage}`);

    try {
      await attempt();
    } catch (retryError) {
      const retryMessage = retryError instanceof Error ? retryError.message : String(retryError);
      log.error(`Server notification failed after retry: ${retryMessage}`);
      notify("warning", "Song added to queue, but server sync failed. Stats may be outdated.");
    }
  }
}

/**
 * Helper to add a song request to queue with singer assignment.
 * Shared by approveRequest and approveAllRequests.
 * @param request - The song request to add
 * @param storeGet - The store's get() function
 * @returns true if added successfully, false if request has no youtube_id
 */
async function addRequestToQueueWithSinger(
  request: SongRequest,
  storeGet: () => SessionState
): Promise<boolean> {
  if (!request.youtube_id) {
    log.warn(`Request ${request.id} has no youtube_id, cannot add to queue`);
    return false;
  }

  // Find or create singer for this guest
  // session_guest_id is stable per user, allowing cross-session singer identification
  const singerId = await storeGet().findOrCreateSingerForGuest(
    request.session_guest_id,
    request.guest_name
  );

  // Convert request to Video and add to queue
  const video: Video = {
    id: request.youtube_id,
    title: request.title,
    artist: request.artist,
    duration: request.duration,
    thumbnailUrl: request.thumbnail_url,
    source: "youtube",
    youtubeId: request.youtube_id,
  };
  const queueItem = await useQueueStore.getState().addToQueue(video);
  log.debug(`Added approved song to queue: ${video.title}`);

  // Assign the guest's singer to the queue item
  await storeGet().assignSingerToQueueItem(queueItem.id, singerId);
  log.debug(`Assigned singer ${singerId} to queue item ${queueItem.id}`);

  return true;
}

/**
 * Check if authentication token is still valid.
 * @param expiresAt - Token expiration time in Unix seconds
 * @returns true if token is valid (not expired and has at least TOKEN_EXPIRY_BUFFER_MS remaining)
 */
function isTokenValid(expiresAt: number): boolean {
  const expiresAtMs = expiresAt * 1000;
  return Date.now() < expiresAtMs - TOKEN_EXPIRY_BUFFER_MS;
}

interface SessionState {
  // Internal state for polling interval (not exposed to consumers)
  _hostedSessionPollInterval: ReturnType<typeof setInterval> | null;
  // Flag to prevent concurrent refresh requests
  _isRefreshingHostedSession: boolean;
  // Session state
  session: Session | null;
  isLoading: boolean;
  showRenameDialog: boolean;
  showLoadDialog: boolean;
  recentSessions: Session[];
  recentSessionSingers: Map<number, Singer[]>;

  // Hosted session state (for remote guest access)
  hostedSession: HostedSession | null;
  showHostModal: boolean;
  // Dialog shown when another user was hosting this session (RESTORE-006)
  showHostedByOtherUserDialog: boolean;

  // Song request approval state
  pendingRequests: SongRequest[];
  previousPendingCount: number;
  showRequestsModal: boolean;
  isLoadingRequests: boolean;
  processingRequestIds: Set<string>;

  // Singers state
  singers: Singer[];

  // Active singer for auto-assignment when adding songs
  activeSingerId: number | null;

  // Queue item singer assignments (queueItemId -> singerId[])
  queueSingerAssignments: Map<string, number[]>;

  // Session actions
  loadSession: () => Promise<void>;
  startSession: (name?: string) => Promise<void>;
  endSession: () => Promise<void>;
  renameSession: (name: string) => Promise<void>;
  switchToSession: (sessionId: number) => Promise<void>;

  // Dialog actions
  openRenameDialog: () => void;
  closeRenameDialog: () => void;
  openLoadDialog: () => Promise<void>;
  closeLoadDialog: () => void;
  deleteSession: (sessionId: number) => Promise<void>;
  renameStoredSession: (sessionId: number, name: string) => Promise<void>;

  // Hosting actions
  hostSession: () => Promise<void>;
  stopHosting: () => Promise<void>;
  refreshHostedSession: () => Promise<void>;
  restoreHostedSession: () => Promise<void>;
  openHostModal: () => void;
  closeHostModal: () => void;
  closeHostedByOtherUserDialog: () => void;

  // Song request actions
  loadPendingRequests: () => Promise<void>;
  approveRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  approveAllRequests: (guestName?: string) => Promise<void>;
  openRequestsModal: () => void;
  closeRequestsModal: () => void;

  // Singer actions
  loadSingers: () => Promise<void>;
  createSinger: (name: string, color?: string, isPersistent?: boolean, onlineId?: string) => Promise<Singer>;
  deleteSinger: (singerId: number) => Promise<void>;
  removeSingerFromSession: (singerId: number) => Promise<void>;
  findOrCreateSingerForGuest: (sessionGuestId: string, displayName: string) => Promise<number>;

  // Active singer actions
  setActiveSinger: (singerId: number | null) => Promise<void>;
  loadActiveSinger: () => Promise<void>;

  // Queue singer assignment actions
  assignSingerToQueueItem: (queueItemId: string, singerId: number) => Promise<void>;
  removeSingerFromQueueItem: (queueItemId: string, singerId: number) => Promise<void>;
  clearQueueItemSingers: (queueItemId: string) => Promise<void>;
  loadQueueItemSingers: (queueItemId: string) => Promise<void>;
  loadAllQueueItemSingers: () => Promise<void>;
  getQueueItemSingerIds: (queueItemId: string) => number[];
  getSingerById: (singerId: number) => Singer | undefined;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  _hostedSessionPollInterval: null,
  _isRefreshingHostedSession: false,
  session: null,
  isLoading: false,
  showRenameDialog: false,
  showLoadDialog: false,
  recentSessions: [],
  recentSessionSingers: new Map(),
  hostedSession: null,
  showHostModal: false,
  showHostedByOtherUserDialog: false,
  pendingRequests: [],
  previousPendingCount: -1,
  showRequestsModal: false,
  isLoadingRequests: false,
  processingRequestIds: new Set(),
  singers: [],
  activeSingerId: null,
  queueSingerAssignments: new Map(),

  loadSession: async () => {
    log.debug("Loading active session");
    try {
      const session = await sessionService.getActiveSession();
      set({ session });
      if (session) {
        log.info(`Active session loaded: ${session.id}`);
        // Load singers for the active session
        await get().loadSingers();
        // Load active singer for the session
        await get().loadActiveSinger();
        // Load persisted queue/history state
        await useQueueStore.getState().loadPersistedState();
        // Load singer assignments for all queue and history items
        await get().loadAllQueueItemSingers();

        // Attempt to restore hosted session from previous app run
        // Note: MIGRATE-002 legacy cleanup now runs once at app startup (App.tsx)
        await get().restoreHostedSession();

        // Emit signal after all session initialization is complete
        await emitSignal(APP_SIGNALS.SESSION_LOADED, undefined);
      }
    } catch (error) {
      log.error("Failed to load session:", error);
      notify("error", "Failed to load session. Please try restarting the app.");
    }
  },

  startSession: async (name?: string) => {
    log.info(`Starting new session: ${name || "(unnamed)"}`);
    set({ isLoading: true });
    try {
      // Flush any pending queue operations before starting session
      // This prevents race conditions where items are lost during session migration
      await flushPendingOperations();
      const session = await sessionService.startSession(name);
      set({ session, isLoading: false, singers: [], activeSingerId: null, queueSingerAssignments: new Map() });
      // Reload queue/history state (items were migrated to the new session in backend)
      await useQueueStore.getState().loadPersistedState();
      // Load singer assignments for all queue and history items
      await get().loadAllQueueItemSingers();
      log.info(`Session started: ${session.id}`);
      // Emit signal for other stores/components that depend on session start
      await emitSignal(APP_SIGNALS.SESSION_STARTED, undefined);
    } catch (error) {
      log.error("Failed to start session:", error);
      set({ isLoading: false });
      throw error;
    }
  },

  endSession: async () => {
    log.info("Ending session");
    set({ isLoading: true });
    try {
      // Stop hosting if active (before ending session)
      if (get().hostedSession) {
        await get().stopHosting();
      }
      // Safety cleanup: clear persisted session ID even if stopHosting() wasn't called
      // (e.g., if session was never hosted or if user somehow bypassed normal flow)
      await clearPersistedSessionId();
      // Flush any pending queue operations before ending session
      await flushPendingOperations();
      await sessionService.endSession();
      set({ session: null, isLoading: false, singers: [], activeSingerId: null, queueSingerAssignments: new Map(), hostedSession: null, showHostModal: false });
      // Clear pending singer creations to prevent memory leak
      pendingSingerCreations.clear();
      // Reset queue store (data already archived in DB)
      useQueueStore.getState().resetState();
      log.info("Session ended");
      // Emit signal for other stores/components that depend on session end
      await emitSignal(APP_SIGNALS.SESSION_ENDED, undefined);
    } catch (error) {
      log.error("Failed to end session:", error);
      set({ isLoading: false });
      throw error;
    }
  },

  renameSession: async (name: string) => {
    const { session } = get();
    if (!session) {
      log.warn("Cannot rename session: no active session");
      return;
    }
    log.info(`Renaming session to: ${name}`);
    try {
      const updatedSession = await sessionService.renameSession(session.id, name);
      set({ session: updatedSession, showRenameDialog: false });
      log.info("Session renamed successfully");
    } catch (error) {
      log.error("Failed to rename session:", error);
      throw error;
    }
  },

  switchToSession: async (sessionId: number) => {
    log.info(`Switching to session: ${sessionId}`);
    set({ isLoading: true });
    try {
      // Flush any pending queue operations before switching session
      await flushPendingOperations();
      const session = await sessionService.loadSession(sessionId);
      // Update session and recentSessions to reflect new active session
      set((state) => ({
        session,
        isLoading: false,
        singers: [],
        activeSingerId: null,
        queueSingerAssignments: new Map(),
        recentSessions: state.recentSessions.map((s) => ({
          ...s,
          is_active: s.id === sessionId,
        })),
      }));
      // Load singers and queue state for the new session
      await get().loadSingers();
      // Load active singer for the session
      await get().loadActiveSinger();
      await useQueueStore.getState().loadPersistedState();
      // Load singer assignments for all queue and history items
      await get().loadAllQueueItemSingers();
      log.info(`Switched to session: ${sessionId}`);
    } catch (error) {
      log.error("Failed to switch session:", error);
      set({ isLoading: false });
      throw error;
    }
  },

  openRenameDialog: () => {
    set({ showRenameDialog: true });
  },

  closeRenameDialog: () => {
    set({ showRenameDialog: false });
  },

  openLoadDialog: async () => {
    log.debug("Opening load session dialog");
    try {
      const recentSessions = await sessionService.getRecentSessions(10);
      set({ showLoadDialog: true, recentSessions });

      // Fetch singers for each session in parallel
      const singersMap = new Map<number, Singer[]>();
      await Promise.all(
        recentSessions.map(async (session) => {
          try {
            const singers = await sessionService.getSessionSingers(session.id);
            singersMap.set(session.id, singers);
          } catch (error) {
            log.error(`Failed to load singers for session ${session.id}:`, error);
            singersMap.set(session.id, []);
          }
        })
      );
      set({ recentSessionSingers: singersMap });
    } catch (error) {
      log.error("Failed to load recent sessions:", error);
      set({ showLoadDialog: true, recentSessions: [], recentSessionSingers: new Map() });
    }
  },

  closeLoadDialog: () => {
    set({ showLoadDialog: false });
  },

  deleteSession: async (sessionId: number) => {
    log.info(`Deleting session: ${sessionId}`);
    try {
      await sessionService.deleteSession(sessionId);
      // Remove from recent sessions list
      set((state) => ({
        recentSessions: state.recentSessions.filter((s) => s.id !== sessionId),
      }));
      log.info(`Session ${sessionId} deleted`);
    } catch (error) {
      log.error("Failed to delete session:", error);
      throw error;
    }
  },

  renameStoredSession: async (sessionId: number, name: string) => {
    log.info(`Renaming stored session ${sessionId} to: ${name}`);
    try {
      const updatedSession = await sessionService.renameSession(sessionId, name);
      // Update in recent sessions list
      set((state) => ({
        recentSessions: state.recentSessions.map((s) =>
          s.id === sessionId ? updatedSession : s
        ),
        // Also update active session if it's the same one
        session: state.session?.id === sessionId ? updatedSession : state.session,
      }));
      log.info(`Stored session ${sessionId} renamed`);
    } catch (error) {
      log.error("Failed to rename stored session:", error);
      throw error;
    }
  },

  loadSingers: async () => {
    const { session } = get();
    if (!session) {
      log.debug("No active session, skipping singer load");
      set({ singers: [] });
      return;
    }
    log.debug(`Loading singers for session ${session.id}`);
    try {
      const singers = await sessionService.getSessionSingers(session.id);
      set({ singers });
      log.debug(`Loaded ${singers.length} singers for session ${session.id}`);
      // Emit signal after singers are loaded
      await emitSignal(APP_SIGNALS.SINGERS_LOADED, undefined);
    } catch (error) {
      log.error("Failed to load singers:", error);
      set({ singers: [] });
      notify("warning", "Could not load singers. They may appear after a refresh.");
    }
  },

  createSinger: async (name: string, color?: string, isPersistent: boolean = false, onlineId?: string) => {
    const { singers, session } = get();
    const usedColors = singers.map((s) => s.color);
    const singerColor = color || getNextSingerColor(usedColors);

    log.info(`Creating singer: ${name} (color: ${singerColor})${onlineId ? ` (online_id: ${onlineId})` : ""}`);
    const singer = await sessionService.createSinger(name, singerColor, isPersistent, undefined, onlineId);

    // Add to session if active
    if (session) {
      await sessionService.addSingerToSession(session.id, singer.id);
    }

    set((state) => ({ singers: [...state.singers, singer] }));
    return singer;
  },

  deleteSinger: async (singerId: number) => {
    log.info(`Deleting singer: ${singerId}`);
    await sessionService.deleteSinger(singerId);

    set((state) => {
      const singers = state.singers.filter((s) => s.id !== singerId);
      // Also remove from all queue assignments
      const queueSingerAssignments = new Map(state.queueSingerAssignments);
      for (const [itemId, singerIds] of queueSingerAssignments) {
        const filtered = singerIds.filter((id) => id !== singerId);
        if (filtered.length > 0) {
          queueSingerAssignments.set(itemId, filtered);
        } else {
          queueSingerAssignments.delete(itemId);
        }
      }
      // Clear active singer if it was the deleted one (backend already cleared it)
      const activeSingerId = state.activeSingerId === singerId ? null : state.activeSingerId;
      return { singers, queueSingerAssignments, activeSingerId };
    });
  },

  removeSingerFromSession: async (singerId: number) => {
    const { session } = get();
    if (!session) {
      log.error("Cannot remove singer from session: no active session");
      throw new Error("No active session");
    }

    log.info(`Removing singer ${singerId} from session ${session.id}`);
    await sessionService.removeSingerFromSession(session.id, singerId);

    set((state) => {
      const singers = state.singers.filter((s) => s.id !== singerId);
      // Also remove from all queue assignments
      const queueSingerAssignments = new Map(state.queueSingerAssignments);
      for (const [itemId, singerIds] of queueSingerAssignments) {
        const filtered = singerIds.filter((id) => id !== singerId);
        if (filtered.length > 0) {
          queueSingerAssignments.set(itemId, filtered);
        } else {
          queueSingerAssignments.delete(itemId);
        }
      }
      // Clear active singer if it was the removed one (backend already cleared it)
      const activeSingerId = state.activeSingerId === singerId ? null : state.activeSingerId;
      return { singers, queueSingerAssignments, activeSingerId };
    });
  },

  findOrCreateSingerForGuest: async (sessionGuestId: string, displayName: string) => {
    // 1. Try to find existing singer in memory (fast path)
    const existingSinger = get().singers.find((s) => s.online_id === sessionGuestId);
    if (existingSinger) {
      log.debug(`Found existing singer in memory for guest ${sessionGuestId}: ${existingSinger.name} (id: ${existingSinger.id})`);
      return existingSinger.id;
    }

    // 2. Check if we're already creating a singer for this guest (race condition protection)
    const pendingCreation = pendingSingerCreations.get(sessionGuestId);
    if (pendingCreation) {
      log.debug(`Waiting for pending singer creation for guest ${sessionGuestId}`);
      return pendingCreation;
    }

    // 3. Check database for existing singer (may exist from previous session)
    // session_guest_id is stable per user, so we can find returning guests
    const dbSinger = await sessionService.findSingerByOnlineId(sessionGuestId);
    if (dbSinger) {
      log.debug(`Found existing singer in database for guest ${sessionGuestId}: ${dbSinger.name} (id: ${dbSinger.id})`);
      // Add to in-memory list for future lookups
      set((state) => ({ singers: [...state.singers, dbSinger] }));
      return dbSinger.id;
    }

    // 4. Create new singer with online_id (with race condition protection)
    log.info(`Creating new singer for guest ${sessionGuestId}: ${displayName}`);
    const creationPromise = (async () => {
      try {
        const newSinger = await get().createSinger(displayName, undefined, false, sessionGuestId);
        return newSinger.id;
      } finally {
        // Clean up the pending map entry after creation completes
        pendingSingerCreations.delete(sessionGuestId);
      }
    })();

    // Store the promise so concurrent calls can wait on it
    pendingSingerCreations.set(sessionGuestId, creationPromise);
    return creationPromise;
  },

  assignSingerToQueueItem: async (queueItemId: string, singerId: number) => {
    log.debug(`Assigning singer ${singerId} to queue item ${queueItemId}`);
    await sessionService.assignSingerToQueueItem(queueItemId, singerId);

    set((state) => {
      const queueSingerAssignments = new Map(state.queueSingerAssignments);
      const current = queueSingerAssignments.get(queueItemId) || [];
      if (!current.includes(singerId)) {
        queueSingerAssignments.set(queueItemId, [...current, singerId]);
      }
      return { queueSingerAssignments };
    });
  },

  removeSingerFromQueueItem: async (queueItemId: string, singerId: number) => {
    log.debug(`Removing singer ${singerId} from queue item ${queueItemId}`);
    await sessionService.removeSingerFromQueueItem(queueItemId, singerId);

    set((state) => {
      const queueSingerAssignments = new Map(state.queueSingerAssignments);
      const current = queueSingerAssignments.get(queueItemId) || [];
      const filtered = current.filter((id) => id !== singerId);
      if (filtered.length > 0) {
        queueSingerAssignments.set(queueItemId, filtered);
      } else {
        queueSingerAssignments.delete(queueItemId);
      }
      return { queueSingerAssignments };
    });
  },

  clearQueueItemSingers: async (queueItemId: string) => {
    log.debug(`Clearing singers from queue item ${queueItemId}`);
    await sessionService.clearQueueItemSingers(queueItemId);

    set((state) => {
      const queueSingerAssignments = new Map(state.queueSingerAssignments);
      queueSingerAssignments.delete(queueItemId);
      return { queueSingerAssignments };
    });
  },

  loadQueueItemSingers: async (queueItemId: string) => {
    log.debug(`Loading singers for queue item ${queueItemId}`);
    try {
      const singers = await sessionService.getQueueItemSingers(queueItemId);
      set((state) => {
        const queueSingerAssignments = new Map(state.queueSingerAssignments);
        queueSingerAssignments.set(queueItemId, singers.map((s) => s.id));
        return { queueSingerAssignments };
      });
    } catch (error) {
      log.error("Failed to load queue item singers:", error);
      // Clear any stale entry to avoid showing incorrect data
      set((state) => {
        const queueSingerAssignments = new Map(state.queueSingerAssignments);
        queueSingerAssignments.delete(queueItemId);
        return { queueSingerAssignments };
      });
    }
  },

  loadAllQueueItemSingers: async () => {
    const { queue, history } = useQueueStore.getState();
    const allItems = [...queue, ...history];

    if (allItems.length === 0) {
      log.debug("No queue/history items to load singers for");
      return;
    }

    log.info(`Loading singer assignments for ${allItems.length} items`);
    const newAssignments = new Map<string, number[]>();

    // Load singer assignments for all items in parallel
    await Promise.all(
      allItems.map(async (item) => {
        try {
          const singers = await sessionService.getQueueItemSingers(item.id);
          if (singers.length > 0) {
            newAssignments.set(item.id, singers.map((s) => s.id));
          }
        } catch (error) {
          log.error(`Failed to load singers for item ${item.id}:`, error);
        }
      })
    );

    set({ queueSingerAssignments: newAssignments });
    log.info(`Loaded singer assignments for ${newAssignments.size} items`);
  },

  getQueueItemSingerIds: (queueItemId: string) => {
    return get().queueSingerAssignments.get(queueItemId) || [];
  },

  getSingerById: (singerId: number) => {
    return get().singers.find((s) => s.id === singerId);
  },

  setActiveSinger: async (singerId: number | null) => {
    const { session, singers } = get();
    if (!session) {
      log.warn("Cannot set active singer: no active session");
      return;
    }

    // Validate singer exists in session (if not clearing)
    if (singerId !== null && !singers.some((s) => s.id === singerId)) {
      log.warn(`Cannot set active singer: singer ${singerId} not in session`);
      return;
    }

    log.info(`Setting active singer: ${singerId}`);
    try {
      await sessionService.setActiveSinger(session.id, singerId);
      set({ activeSingerId: singerId });
      await emitSignal(APP_SIGNALS.ACTIVE_SINGER_CHANGED, singerId);
    } catch (error) {
      log.error("Failed to set active singer:", error);
      throw error;
    }
  },

  loadActiveSinger: async () => {
    const { session } = get();
    if (!session) {
      set({ activeSingerId: null });
      return;
    }

    log.debug(`Loading active singer for session ${session.id}`);
    try {
      const singer = await sessionService.getActiveSinger(session.id);
      set({ activeSingerId: singer?.id ?? null });
      log.debug(`Active singer loaded: ${singer?.id ?? "none"}`);
    } catch (error) {
      // Silent failure: active singer is non-critical UI state. If loading fails,
      // we default to null (no singer selected). The user can still select a singer
      // manually, and the error is logged for debugging. No notification needed.
      log.error("Failed to load active singer:", error);
      set({ activeSingerId: null });
    }
  },

  // Hosting actions
  hostSession: async () => {
    const { session } = get();
    if (!session) {
      log.error("Cannot host session: no active session");
      throw new Error("No active session");
    }

    log.info("Starting hosted session");
    try {
      // Get access token from auth service
      let tokens = await authService.getTokens();
      if (!tokens) {
        log.error("Cannot host session: not authenticated");
        throw new Error("Not authenticated");
      }

      // If token is expired, try to refresh it first
      if (!isTokenValid(tokens.expires_at)) {
        log.debug("Token expired, attempting refresh before hosting");
        const refreshedTokens = await authService.refreshTokenIfNeeded();
        if (!refreshedTokens || !isTokenValid(refreshedTokens.expires_at)) {
          log.error("Cannot host session: token refresh failed");
          throw new Error("Session expired. Please sign in again.");
        }
        tokens = refreshedTokens;
        log.debug("Token refreshed successfully, proceeding with hosting");
      }

      // Get current user ID from auth store
      const currentUser = useAuthStore.getState().user;
      if (!currentUser) {
        log.error("Cannot host session: user not loaded");
        throw new Error("User not loaded. Please sign in again.");
      }

      // Check for existing hosted session conflicts
      // Block if a different user has an active or paused session
      if (
        session.hosted_session_id &&
        session.hosted_by_user_id &&
        session.hosted_by_user_id !== currentUser.id &&
        session.hosted_session_status !== HOSTED_SESSION_STATUS.ENDED
      ) {
        log.error("Cannot host session: another user is hosting");
        throw new Error(
          "Another user is currently hosting this session. They must stop hosting before you can host."
        );
      }

      const hostedSession = await hostedSessionService.createHostedSession(
        tokens.access_token,
        session.name ?? undefined
      );

      // Store hosted session info in the database
      // CONC-004: Backend performs atomic ownership check - may fail if another user
      // started hosting between our frontend check and this call (race condition)
      try {
        await sessionService.setHostedSession(
          session.id,
          hostedSession.id,
          currentUser.id,
          HOSTED_SESSION_STATUS.ACTIVE
        );
      } catch (dbError) {
        // Check if this is an ownership conflict from the backend
        const isOwnershipConflict =
          typeof dbError === "object" &&
          dbError !== null &&
          "type" in dbError &&
          (dbError as { type: string }).type === "ownership_conflict";

        if (isOwnershipConflict) {
          // Clean up the orphaned API session we just created
          log.warn("Backend detected ownership conflict - cleaning up orphaned API session");
          try {
            await hostedSessionService.endHostedSession(
              tokens.access_token,
              hostedSession.id
            );
          } catch (cleanupError) {
            // Log but don't fail - the session will expire eventually
            log.error("Failed to clean up orphaned API session:", cleanupError);
          }
          set({ showHostedByOtherUserDialog: true });
          // Don't throw - we've shown the dialog to inform the user
          return;
        }
        // Re-throw non-ownership errors
        throw dbError;
      }

      // Update local session state with hosted fields
      const updatedSession: Session = {
        ...session,
        hosted_session_id: hostedSession.id,
        hosted_by_user_id: currentUser.id,
        hosted_session_status: HOSTED_SESSION_STATUS.ACTIVE,
      };

      // LEGACY: Persist session ID to settings table for users upgrading from v0.7.7 or earlier.
      // The sessions table is now the primary storage (v0.8.0+). This duplication ensures users
      // who downgrade or have incomplete migrations can still recover their hosted session.
      // Can be removed after 2-3 releases when all users have upgraded past v0.8.0.
      await persistSessionId(hostedSession.id);

      // Clear any existing polling interval
      const existingInterval = get()._hostedSessionPollInterval;
      if (existingInterval) {
        clearInterval(existingInterval);
      }

      // Start polling for stats
      const pollInterval = setInterval(() => {
        get().refreshHostedSession();
      }, HOSTED_SESSION_POLL_INTERVAL_MS);

      set({
        session: updatedSession,
        hostedSession,
        showHostModal: true,
        _hostedSessionPollInterval: pollInterval,
        previousPendingCount: hostedSession.stats.pendingRequests,
      });

      log.info(`Hosted session started: ${hostedSession.sessionCode}`);
      // Emit signal for other stores/components that depend on hosting start
      await emitSignal(APP_SIGNALS.HOSTING_STARTED, undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to start hosted session: ${message}`);
      // Emit error signal for UI components to handle
      await emitSignal(APP_SIGNALS.HOSTING_ERROR, {
        operation: "hostSession",
        message,
      });
      throw error;
    }
  },

  stopHosting: async () => {
    const { session, hostedSession, _hostedSessionPollInterval } = get();
    if (!hostedSession) {
      log.debug("No hosted session to stop");
      return;
    }

    log.info("Stopping hosted session");

    // Clear persisted session ID first (before API call) to ensure
    // no orphaned reference remains even if API call fails
    await clearPersistedSessionId();

    // Update the hosted session status to 'ended' in the database
    // This preserves hosted_session_id and hosted_by_user_id for reference
    if (session) {
      try {
        await sessionService.updateHostedSessionStatus(session.id, HOSTED_SESSION_STATUS.ENDED);
        log.debug("Updated hosted session status to 'ended' in DB");
      } catch (dbError) {
        const dbMessage = dbError instanceof Error ? dbError.message : String(dbError);
        log.error(`Failed to update hosted session status in DB: ${dbMessage}`);
        // Continue anyway - this is not critical for stopping
      }
    }

    let apiCallFailed = false;
    try {
      // Get access token from auth service
      const tokens = await authService.getTokens();
      if (tokens) {
        await hostedSessionService.endHostedSession(
          tokens.access_token,
          hostedSession.id
        );
      }
      log.info("Hosted session stopped");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to stop hosted session: ${message}`);
      apiCallFailed = true;
      // Don't throw - we still want to clean up local state
    } finally {
      // Always clear polling interval and local state, even if API call fails
      if (_hostedSessionPollInterval) {
        clearInterval(_hostedSessionPollInterval);
      }

      // Update local session state to reflect ended status
      // while preserving hosted_session_id and hosted_by_user_id
      if (session) {
        set({
          session: { ...session, hosted_session_status: HOSTED_SESSION_STATUS.ENDED },
          hostedSession: null,
          showHostModal: false,
          _hostedSessionPollInterval: null,
          previousPendingCount: -1,
          processingRequestIds: new Set(),
        });
      } else {
        set({ hostedSession: null, showHostModal: false, _hostedSessionPollInterval: null, previousPendingCount: -1, processingRequestIds: new Set() });
      }

      // Notify user if API call failed (backend may still think session is hosted)
      if (apiCallFailed) {
        notify("warning", "Could not end session on server. It may expire automatically.");
        // Emit error signal for UI components to handle
        await emitSignal(APP_SIGNALS.HOSTING_ERROR, {
          operation: "stopHosting",
          message: "Could not end session on server. It may expire automatically.",
        });
      }

      // Emit signal for other stores/components that depend on hosting stop
      // Signal is emitted in finally block so it fires in both success and error paths
      await emitSignal(APP_SIGNALS.HOSTING_STOPPED, undefined);
    }
  },

  refreshHostedSession: async () => {
    const { hostedSession, _isRefreshingHostedSession } = get();
    if (!hostedSession) {
      return;
    }

    // Prevent concurrent refresh requests (race condition protection)
    if (_isRefreshingHostedSession) {
      log.debug("Skipping refresh: previous request still in flight");
      return;
    }

    log.debug("Refreshing hosted session stats");
    set({ _isRefreshingHostedSession: true });
    try {
      const tokens = await authService.getTokens();
      if (!tokens) {
        log.warn("Cannot refresh hosted session: not authenticated");
        return;
      }

      // Skip refresh if token is expired (will be handled by auth refresh)
      if (!isTokenValid(tokens.expires_at)) {
        log.warn("Cannot refresh hosted session: token expired");
        return;
      }

      const updated = await hostedSessionService.getSession(
        tokens.access_token,
        hostedSession.id
      );

      // Check for new requests and show notification
      const previousCount = get().previousPendingCount;
      const newCount = updated.stats.pendingRequests;

      if (newCount > previousCount && previousCount >= 0) {
        const diff = newCount - previousCount;
        notify("info", `${diff} new song request${diff > 1 ? "s" : ""}`, {
          label: "View",
          onClick: () => get().openRequestsModal(),
        });
      }

      // Only update stats, preserve other fields from the original session
      set((state) => ({
        hostedSession: state.hostedSession
          ? { ...state.hostedSession, stats: updated.stats, status: updated.status }
          : null,
        previousPendingCount: newCount,
      }));

      // Emit signal after successful stats update
      await emitSignal(APP_SIGNALS.HOSTED_SESSION_UPDATED, updated.stats);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to refresh hosted session: ${message}`);
      // Emit error signal for UI components to handle
      await emitSignal(APP_SIGNALS.HOSTING_ERROR, {
        operation: "refreshHostedSession",
        message,
      });
      // If session is ended, invalid, or auth failed, clear it
      // Use ApiError instanceof check for reliable status code detection
      const shouldClear =
        error instanceof ApiError && [401, 403, 404].includes(error.statusCode);
      if (shouldClear) {
        log.warn("Hosted session no longer valid, clearing");
        // Clear persisted session ID to prevent restore attempts on next startup
        await clearPersistedSessionId();
        const interval = get()._hostedSessionPollInterval;
        if (interval) {
          clearInterval(interval);
        }
        set({ hostedSession: null, showHostModal: false, _hostedSessionPollInterval: null });
        notify("warning", "Hosted session has ended or expired.");
      }
    } finally {
      set({ _isRefreshingHostedSession: false });
    }
  },

  restoreHostedSession: async () => {
    const { session, hostedSession } = get();

    // Skip if already hosting
    if (hostedSession) {
      log.debug("Skipping restore: already hosting a session");
      return;
    }

    // Skip if no session exists
    if (!session) {
      log.debug("Skipping restore: no active session");
      return;
    }

    // RESTORE-001: Skip if session has no hosted_session_id
    // This is the primary check - the session must have been hosted at some point
    if (!session.hosted_session_id) {
      log.debug("Skipping restore: no hosted_session_id on session");
      return;
    }

    // RESTORE-002: Skip if session status is 'ended'
    // No need to verify with backend or attempt restoration - the user already stopped hosting
    // Keep the hosted fields for reference (they can be overridden by hosting again)
    if (session.hosted_session_status === HOSTED_SESSION_STATUS.ENDED) {
      log.debug("Skipping restore: hosted_session_status is 'ended'");
      return;
    }

    log.debug("Attempting to restore hosted session");

    // RESTORE-003: Check if user is authenticated before attempting restoration
    // If not authenticated, we preserve hosted fields for when the owner returns
    let tokens = await authService.getTokens();
    if (!tokens) {
      log.debug("Skipping restore: user not authenticated (preserving hosted fields for owner)");
      return;
    }

    // RESTORE-004/RESTORE-006: Check if current user is the owner
    // Wait for user profile to load, or use immediately if already available
    // This fixes RACE-001 where restoreHostedSession() was called before fetchUserProfile() completed
    let currentUser: User | null = null;
    try {
      currentUser = await waitForSignalOrCondition(
        APP_SIGNALS.USER_LOGGED_IN,
        () => useAuthStore.getState().user,
        5000
      );
    } catch {
      log.debug("Skipping restore: user profile not available within timeout");
      return;
    }

    // RESTORE-006: Different user scenario - show dialog (skip restoration)
    // RESTORE-004: Same user scenario - proceed with restoration
    if (session.hosted_by_user_id && session.hosted_by_user_id !== currentUser.id) {
      log.debug("Skipping restore: different user (session belongs to another user)");
      // Show dialog informing the user (anonymous - no email shown for privacy)
      // Note: We only reach here if status is not 'ended' (checked earlier at RESTORE-002)
      set({ showHostedByOtherUserDialog: true });
      // Preserve fields for the original owner
      return;
    }

    // MIGRATE-002: Legacy fallback removed - old settings value cleared during app startup
    // Use hosted_session_id from session DB field (the only source of truth now)
    const sessionIdToRestore = session.hosted_session_id;
    // Note: This check is technically redundant since RESTORE-001 already verified
    // hosted_session_id exists. However, TypeScript's type narrowing doesn't persist
    // through async operations (tokens/user fetches above), so TS can't prove
    // session.hosted_session_id is still non-null here. This explicit check satisfies
    // the type system and provides defense against theoretical concurrent modifications.
    if (!sessionIdToRestore) {
      log.debug("No session ID available for restoration");
      return;
    }

    // If token is expired, try to refresh it first
    if (!isTokenValid(tokens.expires_at)) {
      log.debug("Token expired, attempting refresh before restore");
      const refreshedTokens = await authService.refreshTokenIfNeeded();
      if (!refreshedTokens || !isTokenValid(refreshedTokens.expires_at)) {
        log.debug("Token refresh failed or still expired, skipping session restore");
        return;
      }
      tokens = refreshedTokens;
      log.debug("Token refreshed successfully, proceeding with restore");
    }

    try {
      // Verify session is still active on backend
      const restoredSession = await hostedSessionService.getSession(
        tokens.access_token,
        sessionIdToRestore
      );

      // RESTORE-005: If API returns non-active status, update local status to 'ended'
      if (restoredSession.status !== HOSTED_SESSION_STATUS.ACTIVE) {
        log.info(`Persisted session is ${restoredSession.status}, updating status to 'ended'`);
        // Update hosted_session_status to 'ended' in DB
        await sessionService.updateHostedSessionStatus(session.id, HOSTED_SESSION_STATUS.ENDED);
        // Update local session state
        set({ session: { ...session, hosted_session_status: HOSTED_SESSION_STATUS.ENDED } });
        await clearPersistedSessionId();
        return;
      }

      // Clear any existing polling interval
      const existingInterval = get()._hostedSessionPollInterval;
      if (existingInterval) {
        clearInterval(existingInterval);
      }

      // Start polling for stats
      const pollInterval = setInterval(() => {
        get().refreshHostedSession();
      }, HOSTED_SESSION_POLL_INTERVAL_MS);

      set({
        hostedSession: restoredSession,
        _hostedSessionPollInterval: pollInterval,
        previousPendingCount: restoredSession.stats.pendingRequests,
      });

      log.info(`Restored hosted session: ${restoredSession.sessionCode}`);
      notify("success", "Reconnected to hosted session");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(`Failed to restore hosted session: ${message}`);
      // Emit error signal for UI components to handle (silent cleanup scenario)
      await emitSignal(APP_SIGNALS.HOSTING_ERROR, {
        operation: "restoreHostedSession",
        message,
      });

      // Clear persisted ID on auth errors or session not found
      // Use ApiError instanceof check for reliable status code detection
      const shouldClear =
        error instanceof ApiError && [401, 403, 404].includes(error.statusCode);

      if (shouldClear) {
        log.debug("Clearing invalid persisted session ID");
        await clearPersistedSessionId();

        // RESTORE-009: Update hosted_session_status to 'ended' on 401/403 errors
        // This prevents retry attempts for sessions that are no longer accessible
        const isAuthError =
          error instanceof ApiError && [401, 403].includes(error.statusCode);
        if (isAuthError) {
          log.debug("Updating hosted session status to 'ended' due to auth error");
          await sessionService.updateHostedSessionStatus(session.id, HOSTED_SESSION_STATUS.ENDED);
          set({ session: { ...session, hosted_session_status: HOSTED_SESSION_STATUS.ENDED } });
        }
      }
      // Don't show error to user - silent cleanup for expected scenarios
    }
  },

  openHostModal: () => {
    set({ showHostModal: true });
  },

  closeHostModal: () => {
    set({ showHostModal: false });
  },

  closeHostedByOtherUserDialog: () => {
    set({ showHostedByOtherUserDialog: false });
  },

  // Song request actions
  loadPendingRequests: async () => {
    const { hostedSession } = get();
    if (!hostedSession) {
      log.debug("Cannot load pending requests: no hosted session");
      return;
    }

    log.debug("Loading pending requests");
    set({ isLoadingRequests: true });
    try {
      const tokens = await authService.getTokens();
      if (!tokens) {
        log.warn("Cannot load pending requests: not authenticated");
        set({ isLoadingRequests: false });
        return;
      }

      const requests = await hostedSessionService.getRequests(
        tokens.access_token,
        hostedSession.id,
        "pending"
      );

      set({ pendingRequests: requests, isLoadingRequests: false });
      log.debug(`Loaded ${requests.length} pending requests`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to load pending requests: ${message}`);
      set({ isLoadingRequests: false });
      notify("error", "Failed to load song requests");
    }
  },

  approveRequest: async (requestId: string) => {
    const { hostedSession, pendingRequests, processingRequestIds } = get();
    if (!hostedSession) {
      log.error("Cannot approve request: no hosted session");
      throw new Error("No hosted session");
    }

    // Prevent duplicate clicks while request is processing
    if (processingRequestIds.has(requestId)) {
      log.debug(`Request ${requestId} is already being processed`);
      return;
    }

    // Find the request to get song details
    const request = pendingRequests.find((r) => r.id === requestId);
    if (!request) {
      log.error(`Cannot approve request: request ${requestId} not found`);
      throw new Error("Request not found");
    }

    log.debug(`Approving request: ${requestId}`);
    // Add to processing set
    set({ processingRequestIds: new Set(processingRequestIds).add(requestId) });

    try {
      // Add song to queue with singer assignment
      const added = await addRequestToQueueWithSinger(request, get);
      if (!added) {
        log.warn(`Request ${requestId} skipped: no youtube_id`);
        notify("warning", "Song request has no video - cannot add to queue");
        // Still remove from pending since it can't be added anyway
      }

      // Remove from pending requests and update stats immediately (optimistic update)
      set((state) => ({
        pendingRequests: state.pendingRequests.filter((r) => r.id !== requestId),
        // Optimistically update the badge count
        hostedSession: state.hostedSession ? {
          ...state.hostedSession,
          stats: {
            ...state.hostedSession.stats,
            pendingRequests: Math.max(0, state.hostedSession.stats.pendingRequests - 1),
          },
        } : null,
      }));

      log.debug(`Request ${requestId} approved locally${added ? "" : " (skipped - no video)"}`);


      // Notify server and refresh stats in background (non-blocking, with retry)
      authService.getTokens().then((tokens) => {
        if (!tokens) {
          log.warn("Cannot notify server of approval: not authenticated");
          return;
        }
        notifyServerWithRetry(
          tokens.access_token,
          hostedSession.id,
          requestId,
          () => get().refreshHostedSession()
        );
      }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`Failed to get tokens for server notification: ${message}`);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to approve request: ${message}`);
      notify("error", "Failed to approve request");
      throw error;
    } finally {
      // Always remove from processing set, even on failure
      const currentProcessing = get().processingRequestIds;
      const newProcessing = new Set(currentProcessing);
      newProcessing.delete(requestId);
      set({ processingRequestIds: newProcessing });
    }
  },

  rejectRequest: async (requestId: string) => {
    const { hostedSession, processingRequestIds } = get();
    if (!hostedSession) {
      log.error("Cannot reject request: no hosted session");
      throw new Error("No hosted session");
    }

    // Prevent duplicate clicks while request is processing
    if (processingRequestIds.has(requestId)) {
      log.debug(`Request ${requestId} is already being processed`);
      return;
    }

    log.debug(`Rejecting request: ${requestId}`);
    // Add to processing set
    set({ processingRequestIds: new Set(processingRequestIds).add(requestId) });

    try {
      const tokens = await authService.getTokens();
      if (!tokens) {
        log.error("Cannot reject request: not authenticated");
        throw new Error("Not authenticated");
      }

      await hostedSessionService.rejectRequest(
        tokens.access_token,
        hostedSession.id,
        requestId
      );

      // Refresh hosted session to update stats
      await get().refreshHostedSession();

      // Remove from pending requests after successful refresh
      // Use get().pendingRequests to get the most current list after refresh
      set({
        pendingRequests: get().pendingRequests.filter((r) => r.id !== requestId),
      });

      log.debug(`Request ${requestId} rejected`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to reject request: ${message}`);
      notify("error", "Failed to reject request");
      throw error;
    } finally {
      // Always remove from processing set, even on failure
      const currentProcessing = get().processingRequestIds;
      const newProcessing = new Set(currentProcessing);
      newProcessing.delete(requestId);
      set({ processingRequestIds: newProcessing });
    }
  },

  approveAllRequests: async (guestName?: string) => {
    const { hostedSession, pendingRequests, processingRequestIds } = get();
    if (!hostedSession) {
      log.error("Cannot approve all requests: no hosted session");
      throw new Error("No hosted session");
    }

    // Filter requests by guest name if provided
    const requestsToApprove = guestName
      ? pendingRequests.filter((r) => r.guest_name === guestName)
      : pendingRequests;

    if (requestsToApprove.length === 0) {
      log.debug("No requests to approve");
      return;
    }

    const requestIds = requestsToApprove.map((r) => r.id);
    log.debug(`Approving ${requestIds.length} requests${guestName ? ` from ${guestName}` : ""}`);

    // Add all request IDs to processing set
    const newProcessing = new Set(processingRequestIds);
    for (const id of requestIds) {
      newProcessing.add(id);
    }
    set({ processingRequestIds: newProcessing });

    try {
      // Add all songs to queue and assign singers (critical path)
      let addedCount = 0;
      let skippedCount = 0;
      for (const request of requestsToApprove) {
        const added = await addRequestToQueueWithSinger(request, get);
        if (added) {
          addedCount++;
        } else {
          skippedCount++;
        }
      }

      if (skippedCount > 0) {
        log.warn(`${skippedCount} requests skipped: no youtube_id`);
        notify("warning", `${skippedCount} request(s) skipped - no video`);
      }

      // Remove all requests from pending and update stats immediately (optimistic update)
      const approvedCount = requestIds.length;
      set((state) => ({
        pendingRequests: state.pendingRequests.filter((r) => !requestIds.includes(r.id)),
        // Optimistically update the badge count
        hostedSession: state.hostedSession ? {
          ...state.hostedSession,
          stats: {
            ...state.hostedSession.stats,
            pendingRequests: Math.max(0, state.hostedSession.stats.pendingRequests - approvedCount),
          },
        } : null,
      }));

      log.debug(`${addedCount} requests added to queue, ${skippedCount} skipped`);

      // Notify server and refresh stats in background (non-blocking)
      authService.getTokens().then(async (tokens) => {
        if (!tokens) {
          log.warn("Cannot notify server of approvals: not authenticated");
          return;
        }
        // Approve all requests on server (parallel, partial failures allowed)
        const results = await Promise.allSettled(
          requestIds.map((requestId) =>
            hostedSessionService.approveRequest(tokens.access_token, hostedSession.id, requestId)
          )
        );

        // Log results for debugging
        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          log.warn(`Server notification: ${succeeded} succeeded, ${failed} failed`);
          results.forEach((r, i) => {
            if (r.status === "rejected") {
              const message = r.reason instanceof Error ? r.reason.message : String(r.reason);
              log.warn(`  Failed request ${requestIds[i]}: ${message}`);
            }
          });
        }

        // Refresh once after all approvals complete
        await get().refreshHostedSession();
      }).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`Failed to get tokens for server notification: ${message}`);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to approve requests: ${message}`);
      notify("error", "Failed to approve requests");
      throw error;
    } finally {
      // Always remove all request IDs from processing set, even on failure
      const currentProcessing = get().processingRequestIds;
      const updatedProcessing = new Set(currentProcessing);
      for (const id of requestIds) {
        updatedProcessing.delete(id);
      }
      set({ processingRequestIds: updatedProcessing });
    }
  },

  openRequestsModal: () => {
    set({ showRequestsModal: true });
    // Fetch fresh data when opening the modal
    get().loadPendingRequests();
  },

  closeRequestsModal: () => {
    set({ showRequestsModal: false, processingRequestIds: new Set() });
  },
}));
