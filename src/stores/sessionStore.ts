import { create } from "zustand";
import { createLogger, sessionService, hostedSessionService, type Singer, type Session, type HostedSession } from "../services";
import { authService } from "../services/auth";
import { getNextSingerColor } from "../constants";
import { useQueueStore, flushPendingOperations } from "./queueStore";
import { notify } from "./notificationStore";

const log = createLogger("SessionStore");

// Polling interval for hosted session stats (30 seconds)
const HOSTED_SESSION_POLL_INTERVAL_MS = 30 * 1000;

// Store polling interval reference for cleanup
let hostedSessionPollInterval: ReturnType<typeof setInterval> | null = null;

interface SessionState {
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
  openHostModal: () => void;
  closeHostModal: () => void;

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
  session: null,
  isLoading: false,
  showRenameDialog: false,
  showLoadDialog: false,
  recentSessions: [],
  recentSessionSingers: new Map(),
  hostedSession: null,
  showHostModal: false,
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
      }
    } catch (error) {
      log.error("Failed to load session:", error);
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
      // Flush any pending queue operations before ending session
      await flushPendingOperations();
      await sessionService.endSession();
      set({ session: null, isLoading: false, singers: [], activeSingerId: null, queueSingerAssignments: new Map(), hostedSession: null, showHostModal: false });
      // Reset queue store (data already archived in DB)
      useQueueStore.getState().resetState();
      log.info("Session ended");
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
    } catch (error) {
      log.error("Failed to load singers:", error);
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
      const tokens = await authService.getTokens();
      if (!tokens) {
        log.error("Cannot host session: not authenticated");
        throw new Error("Not authenticated");
      }

      const hostedSession = await hostedSessionService.createHostedSession(
        tokens.access_token,
        session.name ?? undefined
      );

      set({ hostedSession, showHostModal: true });

      // Start polling for stats
      if (hostedSessionPollInterval) {
        clearInterval(hostedSessionPollInterval);
      }
      hostedSessionPollInterval = setInterval(() => {
        get().refreshHostedSession();
      }, HOSTED_SESSION_POLL_INTERVAL_MS);

      log.info(`Hosted session started: ${hostedSession.sessionCode}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to start hosted session: ${message}`);
      throw error;
    }
  },

  stopHosting: async () => {
    const { hostedSession } = get();
    if (!hostedSession) {
      log.debug("No hosted session to stop");
      return;
    }

    log.info("Stopping hosted session");
    try {
      // Clear polling interval
      if (hostedSessionPollInterval) {
        clearInterval(hostedSessionPollInterval);
        hostedSessionPollInterval = null;
      }

      // Get access token from auth service
      const tokens = await authService.getTokens();
      if (tokens) {
        await hostedSessionService.endHostedSession(
          tokens.access_token,
          hostedSession.id
        );
      }

      set({ hostedSession: null, showHostModal: false });
      log.info("Hosted session stopped");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to stop hosted session: ${message}`);
      // Still clear local state even if API call fails
      set({ hostedSession: null, showHostModal: false });
      throw error;
    }
  },

  refreshHostedSession: async () => {
    const { hostedSession } = get();
    if (!hostedSession) {
      return;
    }

    log.debug("Refreshing hosted session stats");
    try {
      const tokens = await authService.getTokens();
      if (!tokens) {
        log.warn("Cannot refresh hosted session: not authenticated");
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Failed to refresh hosted session: ${message}`);
      // If session is ended or invalid, clear it
      if (message.includes("404") || message.includes("NOT_FOUND")) {
        log.warn("Hosted session no longer exists, clearing");
        if (hostedSessionPollInterval) {
          clearInterval(hostedSessionPollInterval);
          hostedSessionPollInterval = null;
        }
        set({ hostedSession: null, showHostModal: false });
        notify("warning", "Hosted session has ended or expired.");
      }
    }
  },

  openHostModal: () => {
    set({ showHostModal: true });
  },

  closeHostModal: () => {
    set({ showHostModal: false });
  },
}));
