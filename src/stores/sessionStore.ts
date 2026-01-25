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
import { authService, type User } from "../services/auth";
import { getNextSingerColor } from "../constants";
import { useQueueStore, flushPendingOperations } from "./queueStore";
import { notify } from "./notificationStore";
import { useAuthStore } from "./authStore";

const log = createLogger("SessionStore");

// Polling interval for hosted session stats (30 seconds)
const HOSTED_SESSION_POLL_INTERVAL_MS = 30 * 1000;

// Buffer time before token expiry to consider it expired (5 minutes)
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

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

  // Singer actions
  loadSingers: () => Promise<void>;
  createSinger: (name: string, color?: string, isPersistent?: boolean) => Promise<Singer>;
  deleteSinger: (singerId: number) => Promise<void>;
  removeSingerFromSession: (singerId: number) => Promise<void>;

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

  createSinger: async (name: string, color?: string, isPersistent: boolean = false) => {
    const { singers, session } = get();
    const usedColors = singers.map((s) => s.color);
    const singerColor = color || getNextSingerColor(usedColors);

    log.info(`Creating singer: ${name} (color: ${singerColor})`);
    const singer = await sessionService.createSinger(name, singerColor, isPersistent);

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
      });

      log.info(`Hosted session started: ${hostedSession.sessionCode}`);
      // Emit signal for other stores/components that depend on hosting start
      await emitSignal(APP_SIGNALS.HOSTING_STARTED, undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to start hosted session: ${message}`);
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
        });
      } else {
        set({ hostedSession: null, showHostModal: false, _hostedSessionPollInterval: null });
      }

      // Notify user if API call failed (backend may still think session is hosted)
      if (apiCallFailed) {
        notify("warning", "Could not end session on server. It may expire automatically.");
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

      // Only update stats, preserve other fields from the original session
      set((state) => ({
        hostedSession: state.hostedSession
          ? { ...state.hostedSession, stats: updated.stats, status: updated.status }
          : null,
      }));

      // Emit signal after successful stats update
      await emitSignal(APP_SIGNALS.HOSTED_SESSION_UPDATED, updated.stats);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to refresh hosted session: ${message}`);
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

      set({ hostedSession: restoredSession, _hostedSessionPollInterval: pollInterval });

      log.info(`Restored hosted session: ${restoredSession.sessionCode}`);
      notify("success", "Reconnected to hosted session");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(`Failed to restore hosted session: ${message}`);

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
}));
