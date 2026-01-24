import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSessionStore } from "./sessionStore";
import type { Singer, Session } from "../services";

// Mock the services
vi.mock("../services", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  sessionService: {
    getActiveSession: vi.fn(),
    startSession: vi.fn(),
    endSession: vi.fn(),
    renameSession: vi.fn(),
    loadSession: vi.fn(),
    getRecentSessions: vi.fn(),
    deleteSession: vi.fn(),
    getSessionSingers: vi.fn(),
    createSinger: vi.fn(),
    deleteSinger: vi.fn(),
    removeSingerFromSession: vi.fn(),
    addSingerToSession: vi.fn(),
    assignSingerToQueueItem: vi.fn(),
    removeSingerFromQueueItem: vi.fn(),
    clearQueueItemSingers: vi.fn(),
    getQueueItemSingers: vi.fn(),
    setActiveSinger: vi.fn(),
    getActiveSinger: vi.fn(),
  },
  hostedSessionService: {
    getSession: vi.fn(),
    createHostedSession: vi.fn(),
    endHostedSession: vi.fn(),
  },
  getPersistedSessionId: vi.fn(),
  clearPersistedSessionId: vi.fn(),
  persistSessionId: vi.fn(),
}));

// Mock auth service
vi.mock("../services/auth", () => ({
  authService: {
    getTokens: vi.fn(),
    storeTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

// Mock queueStore
vi.mock("./queueStore", () => ({
  useQueueStore: {
    getState: vi.fn(),
  },
  flushPendingOperations: vi.fn().mockResolvedValue(undefined),
}));

// Mock notificationStore
vi.mock("./notificationStore", () => ({
  notify: vi.fn(),
}));

// Helper to create a complete mock QueueState
 
function createMockQueueState(overrides?: {
  queue?: { id: string }[];
  history?: { id: string }[];
  loadPersistedState?: ReturnType<typeof vi.fn>;
  resetState?: ReturnType<typeof vi.fn>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}): any {
  return {
    queue: overrides?.queue ?? [],
    history: overrides?.history ?? [],
    historyIndex: -1,
    isInitialized: true,
    loadPersistedState: overrides?.loadPersistedState ?? vi.fn(),
    resetState: overrides?.resetState ?? vi.fn(),
    addToQueue: vi.fn(),
    addToQueueNext: vi.fn(),
    removeFromQueue: vi.fn(),
    reorderQueue: vi.fn(),
    clearQueue: vi.fn(),
    fairShuffle: vi.fn(),
    clearHistory: vi.fn(),
    moveAllHistoryToQueue: vi.fn(),
    playDirect: vi.fn(),
    playFromQueue: vi.fn(),
    playFromHistory: vi.fn(),
    playNext: vi.fn(),
    playNextFromQueue: vi.fn(),
    playPrevious: vi.fn(),
    getCurrentItem: vi.fn(),
    hasNext: vi.fn(),
    hasPrevious: vi.fn(),
  };
}

// Import mocked modules
import { sessionService, hostedSessionService, persistSessionId, getPersistedSessionId, clearPersistedSessionId } from "../services";
import { authService } from "../services/auth";
import { useQueueStore, flushPendingOperations } from "./queueStore";
import { notify } from "./notificationStore";

const mockSession: Session = {
  id: 1,
  name: "Test Session",
  started_at: "2025-01-01T00:00:00Z",
  ended_at: null,
  is_active: true,
};

const mockSinger1: Singer = {
  id: 1,
  name: "Alice",
  color: "#ff0000",
  is_persistent: false,
  unique_name: null,
};

const mockSinger2: Singer = {
  id: 2,
  name: "Bob",
  color: "#00ff00",
  is_persistent: false,
  unique_name: null,
};

const mockSinger3: Singer = {
  id: 3,
  name: "Charlie",
  color: "#0000ff",
  is_persistent: true,
  unique_name: "charlie123",
};

function resetStoreState() {
  useSessionStore.setState({
    session: null,
    isLoading: false,
    showRenameDialog: false,
    showLoadDialog: false,
    recentSessions: [],
    recentSessionSingers: new Map(),
    singers: [],
    activeSingerId: null,
    queueSingerAssignments: new Map(),
  });
}

describe("sessionStore - Singer CRUD", () => {
  beforeEach(() => {
    resetStoreState();
    vi.clearAllMocks();
  });

  describe("createSinger", () => {
    it("should create a singer and add to session", async () => {
      useSessionStore.setState({ session: mockSession, singers: [] });
      vi.mocked(sessionService.createSinger).mockResolvedValue(mockSinger1);
      vi.mocked(sessionService.addSingerToSession).mockResolvedValue();

      const singer = await useSessionStore.getState().createSinger("Alice", "#ff0000");

      expect(sessionService.createSinger).toHaveBeenCalledWith("Alice", "#ff0000", false);
      expect(sessionService.addSingerToSession).toHaveBeenCalledWith(1, 1);
      expect(singer).toEqual(mockSinger1);
      expect(useSessionStore.getState().singers).toContainEqual(mockSinger1);
    });

    it("should create a singer with auto-assigned color when not provided", async () => {
      useSessionStore.setState({ session: mockSession, singers: [mockSinger1] });
      vi.mocked(sessionService.createSinger).mockResolvedValue(mockSinger2);
      vi.mocked(sessionService.addSingerToSession).mockResolvedValue();

      await useSessionStore.getState().createSinger("Bob");

      // Should call createSinger with an auto-assigned color (not red since Alice has red)
      expect(sessionService.createSinger).toHaveBeenCalledWith(
        "Bob",
        expect.not.stringMatching(/#ff0000/i),
        false
      );
    });

    it("should create a persistent singer when isPersistent is true", async () => {
      useSessionStore.setState({ session: mockSession, singers: [] });
      vi.mocked(sessionService.createSinger).mockResolvedValue(mockSinger3);
      vi.mocked(sessionService.addSingerToSession).mockResolvedValue();

      await useSessionStore.getState().createSinger("Charlie", "#0000ff", true);

      expect(sessionService.createSinger).toHaveBeenCalledWith("Charlie", "#0000ff", true);
    });

    it("should create a singer without adding to session when no session exists", async () => {
      useSessionStore.setState({ session: null, singers: [] });
      vi.mocked(sessionService.createSinger).mockResolvedValue(mockSinger1);

      const singer = await useSessionStore.getState().createSinger("Alice", "#ff0000");

      expect(sessionService.createSinger).toHaveBeenCalled();
      expect(sessionService.addSingerToSession).not.toHaveBeenCalled();
      expect(singer).toEqual(mockSinger1);
    });
  });

  describe("deleteSinger", () => {
    it("should delete a singer and remove from state", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1, mockSinger2],
      });
      vi.mocked(sessionService.deleteSinger).mockResolvedValue();

      await useSessionStore.getState().deleteSinger(1);

      expect(sessionService.deleteSinger).toHaveBeenCalledWith(1);
      expect(useSessionStore.getState().singers).toHaveLength(1);
      expect(useSessionStore.getState().singers[0].id).toBe(2);
    });

    it("should remove singer from all queue assignments when deleted", async () => {
      const assignments = new Map<string, number[]>();
      assignments.set("item1", [1, 2]);
      assignments.set("item2", [1]);
      assignments.set("item3", [2, 3]);

      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1, mockSinger2, mockSinger3],
        queueSingerAssignments: assignments,
      });
      vi.mocked(sessionService.deleteSinger).mockResolvedValue();

      await useSessionStore.getState().deleteSinger(1);

      const newAssignments = useSessionStore.getState().queueSingerAssignments;
      expect(newAssignments.get("item1")).toEqual([2]);
      expect(newAssignments.has("item2")).toBe(false); // Empty assignment should be removed
      expect(newAssignments.get("item3")).toEqual([2, 3]);
    });
  });

  describe("removeSingerFromSession", () => {
    it("should throw error when no session exists", async () => {
      useSessionStore.setState({ session: null });

      await expect(useSessionStore.getState().removeSingerFromSession(1)).rejects.toThrow(
        "No active session"
      );
      expect(sessionService.removeSingerFromSession).not.toHaveBeenCalled();
    });

    it("should remove singer from session and update state", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1, mockSinger2],
      });
      vi.mocked(sessionService.removeSingerFromSession).mockResolvedValue();

      await useSessionStore.getState().removeSingerFromSession(1);

      expect(sessionService.removeSingerFromSession).toHaveBeenCalledWith(1, 1);
      expect(useSessionStore.getState().singers).toHaveLength(1);
      expect(useSessionStore.getState().singers[0].id).toBe(2);
    });

    it("should remove singer from all queue assignments when removed from session", async () => {
      const assignments = new Map<string, number[]>();
      assignments.set("item1", [1, 2]);
      assignments.set("item2", [1]);
      assignments.set("item3", [2, 3]);

      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1, mockSinger2, mockSinger3],
        queueSingerAssignments: assignments,
      });
      vi.mocked(sessionService.removeSingerFromSession).mockResolvedValue();

      await useSessionStore.getState().removeSingerFromSession(1);

      const newAssignments = useSessionStore.getState().queueSingerAssignments;
      expect(newAssignments.get("item1")).toEqual([2]);
      expect(newAssignments.has("item2")).toBe(false); // Empty assignment should be removed
      expect(newAssignments.get("item3")).toEqual([2, 3]);
    });

    it("should clear active singer if removed singer was active", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1, mockSinger2],
        activeSingerId: 1,
      });
      vi.mocked(sessionService.removeSingerFromSession).mockResolvedValue();

      await useSessionStore.getState().removeSingerFromSession(1);

      expect(useSessionStore.getState().activeSingerId).toBeNull();
    });

    it("should not clear active singer if different singer was removed", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1, mockSinger2],
        activeSingerId: 2,
      });
      vi.mocked(sessionService.removeSingerFromSession).mockResolvedValue();

      await useSessionStore.getState().removeSingerFromSession(1);

      expect(useSessionStore.getState().activeSingerId).toBe(2);
    });
  });

  describe("loadSingers", () => {
    it("should load singers for active session", async () => {
      useSessionStore.setState({ session: mockSession, singers: [] });
      vi.mocked(sessionService.getSessionSingers).mockResolvedValue([mockSinger1, mockSinger2]);

      await useSessionStore.getState().loadSingers();

      expect(sessionService.getSessionSingers).toHaveBeenCalledWith(1);
      expect(useSessionStore.getState().singers).toEqual([mockSinger1, mockSinger2]);
    });

    it("should clear singers when no session exists", async () => {
      useSessionStore.setState({
        session: null,
        singers: [mockSinger1],
      });

      await useSessionStore.getState().loadSingers();

      expect(sessionService.getSessionSingers).not.toHaveBeenCalled();
      expect(useSessionStore.getState().singers).toEqual([]);
    });
  });
});

describe("sessionStore - Session Lifecycle", () => {
  beforeEach(() => {
    resetStoreState();
    vi.clearAllMocks();
  });

  describe("loadSession", () => {
    it("should load an active session and its data", async () => {
      vi.mocked(sessionService.getActiveSession).mockResolvedValue(mockSession);
      vi.mocked(sessionService.getSessionSingers).mockResolvedValue([mockSinger1]);
      vi.mocked(sessionService.getActiveSinger).mockResolvedValue(mockSinger1);
      vi.mocked(useQueueStore.getState).mockReturnValue(createMockQueueState());

      await useSessionStore.getState().loadSession();

      expect(sessionService.getActiveSession).toHaveBeenCalled();
      expect(useSessionStore.getState().session).toEqual(mockSession);
      expect(sessionService.getSessionSingers).toHaveBeenCalledWith(1);
      expect(sessionService.getActiveSinger).toHaveBeenCalledWith(1);
    });

    it("should handle no active session", async () => {
      vi.mocked(sessionService.getActiveSession).mockResolvedValue(null);

      await useSessionStore.getState().loadSession();

      expect(useSessionStore.getState().session).toBeNull();
      expect(sessionService.getSessionSingers).not.toHaveBeenCalled();
    });
  });

  describe("startSession", () => {
    it("should flush pending operations and start a new session", async () => {
      const newSession = { ...mockSession, id: 2, name: "New Session" };
      vi.mocked(sessionService.startSession).mockResolvedValue(newSession);
      vi.mocked(useQueueStore.getState).mockReturnValue(createMockQueueState());

      await useSessionStore.getState().startSession("New Session");

      expect(flushPendingOperations).toHaveBeenCalled();
      expect(sessionService.startSession).toHaveBeenCalledWith("New Session");
      expect(useSessionStore.getState().session).toEqual(newSession);
      expect(useSessionStore.getState().singers).toEqual([]);
      expect(useSessionStore.getState().activeSingerId).toBeNull();
    });

    it("should reset singer state when starting a new session", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1, mockSinger2],
        activeSingerId: 1,
        queueSingerAssignments: new Map([["item1", [1]]]),
      });

      const newSession = { ...mockSession, id: 2 };
      vi.mocked(sessionService.startSession).mockResolvedValue(newSession);
      vi.mocked(useQueueStore.getState).mockReturnValue(createMockQueueState());

      await useSessionStore.getState().startSession();

      expect(useSessionStore.getState().singers).toEqual([]);
      expect(useSessionStore.getState().activeSingerId).toBeNull();
      expect(useSessionStore.getState().queueSingerAssignments.size).toBe(0);
    });

    it("should set isLoading during session start", async () => {
      let loadingDuringStart = false;
      vi.mocked(sessionService.startSession).mockImplementation(async () => {
        loadingDuringStart = useSessionStore.getState().isLoading;
        return mockSession;
      });
      vi.mocked(useQueueStore.getState).mockReturnValue(createMockQueueState());

      await useSessionStore.getState().startSession();

      expect(loadingDuringStart).toBe(true);
      expect(useSessionStore.getState().isLoading).toBe(false);
    });

    it("should throw error when session start fails", async () => {
      vi.mocked(sessionService.startSession).mockRejectedValue(new Error("Database error"));

      await expect(useSessionStore.getState().startSession()).rejects.toThrow("Database error");
      expect(useSessionStore.getState().isLoading).toBe(false);
    });
  });

  describe("endSession", () => {
    it("should flush pending operations and end the session", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1],
        activeSingerId: 1,
      });
      vi.mocked(sessionService.endSession).mockResolvedValue();
      vi.mocked(useQueueStore.getState).mockReturnValue(createMockQueueState());

      await useSessionStore.getState().endSession();

      expect(flushPendingOperations).toHaveBeenCalled();
      expect(sessionService.endSession).toHaveBeenCalled();
      expect(useSessionStore.getState().session).toBeNull();
      expect(useSessionStore.getState().singers).toEqual([]);
      expect(useSessionStore.getState().activeSingerId).toBeNull();
    });

    it("should reset queue store when session ends", async () => {
      useSessionStore.setState({ session: mockSession });
      vi.mocked(sessionService.endSession).mockResolvedValue();
      const mockResetState = vi.fn();
      vi.mocked(useQueueStore.getState).mockReturnValue(createMockQueueState({ resetState: mockResetState }));

      await useSessionStore.getState().endSession();

      expect(mockResetState).toHaveBeenCalled();
    });
  });

  describe("switchToSession", () => {
    it("should flush operations and switch to a different session", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1],
        activeSingerId: 1,
        recentSessions: [mockSession, { ...mockSession, id: 2, is_active: false }],
      });

      const targetSession = { ...mockSession, id: 2, name: "Target Session" };
      vi.mocked(sessionService.loadSession).mockResolvedValue(targetSession);
      vi.mocked(sessionService.getSessionSingers).mockResolvedValue([mockSinger2]);
      vi.mocked(sessionService.getActiveSinger).mockResolvedValue(mockSinger2);
      vi.mocked(useQueueStore.getState).mockReturnValue(createMockQueueState());

      await useSessionStore.getState().switchToSession(2);

      expect(flushPendingOperations).toHaveBeenCalled();
      expect(sessionService.loadSession).toHaveBeenCalledWith(2);
      expect(useSessionStore.getState().session).toEqual(targetSession);
      expect(sessionService.getSessionSingers).toHaveBeenCalledWith(2);
      expect(sessionService.getActiveSinger).toHaveBeenCalledWith(2);
    });

    it("should update recentSessions to reflect new active session", async () => {
      const session1 = { ...mockSession, id: 1, is_active: true };
      const session2 = { ...mockSession, id: 2, is_active: false };

      useSessionStore.setState({
        session: session1,
        recentSessions: [session1, session2],
      });

      vi.mocked(sessionService.loadSession).mockResolvedValue({ ...session2, is_active: true });
      vi.mocked(sessionService.getSessionSingers).mockResolvedValue([]);
      vi.mocked(sessionService.getActiveSinger).mockResolvedValue(null);
      vi.mocked(useQueueStore.getState).mockReturnValue(createMockQueueState());

      await useSessionStore.getState().switchToSession(2);

      const recentSessions = useSessionStore.getState().recentSessions;
      expect(recentSessions.find(s => s.id === 1)?.is_active).toBe(false);
      expect(recentSessions.find(s => s.id === 2)?.is_active).toBe(true);
    });
  });

  describe("renameSession", () => {
    it("should rename the active session", async () => {
      useSessionStore.setState({ session: mockSession });
      const renamedSession = { ...mockSession, name: "Renamed Session" };
      vi.mocked(sessionService.renameSession).mockResolvedValue(renamedSession);

      await useSessionStore.getState().renameSession("Renamed Session");

      expect(sessionService.renameSession).toHaveBeenCalledWith(1, "Renamed Session");
      expect(useSessionStore.getState().session?.name).toBe("Renamed Session");
      expect(useSessionStore.getState().showRenameDialog).toBe(false);
    });

    it("should do nothing when no session exists", async () => {
      useSessionStore.setState({ session: null });

      await useSessionStore.getState().renameSession("New Name");

      expect(sessionService.renameSession).not.toHaveBeenCalled();
    });
  });

  describe("deleteSession", () => {
    it("should delete a session and remove from recent sessions", async () => {
      const session2 = { ...mockSession, id: 2, is_active: false };
      useSessionStore.setState({
        session: mockSession,
        recentSessions: [mockSession, session2],
      });
      vi.mocked(sessionService.deleteSession).mockResolvedValue();

      await useSessionStore.getState().deleteSession(2);

      expect(sessionService.deleteSession).toHaveBeenCalledWith(2);
      expect(useSessionStore.getState().recentSessions).toHaveLength(1);
      expect(useSessionStore.getState().recentSessions[0].id).toBe(1);
    });
  });
});

describe("sessionStore - Queue Singer Assignments", () => {
  beforeEach(() => {
    resetStoreState();
    vi.clearAllMocks();
  });

  describe("assignSingerToQueueItem", () => {
    it("should assign a singer to a queue item", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1],
        queueSingerAssignments: new Map(),
      });
      vi.mocked(sessionService.assignSingerToQueueItem).mockResolvedValue();

      await useSessionStore.getState().assignSingerToQueueItem("item1", 1);

      expect(sessionService.assignSingerToQueueItem).toHaveBeenCalledWith("item1", 1);
      expect(useSessionStore.getState().queueSingerAssignments.get("item1")).toEqual([1]);
    });

    it("should add to existing assignments without duplicates", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1, mockSinger2],
        queueSingerAssignments: new Map([["item1", [1]]]),
      });
      vi.mocked(sessionService.assignSingerToQueueItem).mockResolvedValue();

      await useSessionStore.getState().assignSingerToQueueItem("item1", 2);

      expect(useSessionStore.getState().queueSingerAssignments.get("item1")).toEqual([1, 2]);
    });

    it("should not add duplicate singer assignment", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1],
        queueSingerAssignments: new Map([["item1", [1]]]),
      });
      vi.mocked(sessionService.assignSingerToQueueItem).mockResolvedValue();

      await useSessionStore.getState().assignSingerToQueueItem("item1", 1);

      expect(useSessionStore.getState().queueSingerAssignments.get("item1")).toEqual([1]);
    });
  });

  describe("removeSingerFromQueueItem", () => {
    it("should remove a singer from a queue item", async () => {
      useSessionStore.setState({
        session: mockSession,
        queueSingerAssignments: new Map([["item1", [1, 2]]]),
      });
      vi.mocked(sessionService.removeSingerFromQueueItem).mockResolvedValue();

      await useSessionStore.getState().removeSingerFromQueueItem("item1", 1);

      expect(sessionService.removeSingerFromQueueItem).toHaveBeenCalledWith("item1", 1);
      expect(useSessionStore.getState().queueSingerAssignments.get("item1")).toEqual([2]);
    });

    it("should remove the queue item entry when last singer is removed", async () => {
      useSessionStore.setState({
        session: mockSession,
        queueSingerAssignments: new Map([["item1", [1]]]),
      });
      vi.mocked(sessionService.removeSingerFromQueueItem).mockResolvedValue();

      await useSessionStore.getState().removeSingerFromQueueItem("item1", 1);

      expect(useSessionStore.getState().queueSingerAssignments.has("item1")).toBe(false);
    });
  });

  describe("clearQueueItemSingers", () => {
    it("should clear all singers from a queue item", async () => {
      useSessionStore.setState({
        session: mockSession,
        queueSingerAssignments: new Map([["item1", [1, 2, 3]]]),
      });
      vi.mocked(sessionService.clearQueueItemSingers).mockResolvedValue();

      await useSessionStore.getState().clearQueueItemSingers("item1");

      expect(sessionService.clearQueueItemSingers).toHaveBeenCalledWith("item1");
      expect(useSessionStore.getState().queueSingerAssignments.has("item1")).toBe(false);
    });
  });

  describe("loadQueueItemSingers", () => {
    it("should load singers for a specific queue item", async () => {
      useSessionStore.setState({
        session: mockSession,
        queueSingerAssignments: new Map(),
      });
      vi.mocked(sessionService.getQueueItemSingers).mockResolvedValue([mockSinger1, mockSinger2]);

      await useSessionStore.getState().loadQueueItemSingers("item1");

      expect(sessionService.getQueueItemSingers).toHaveBeenCalledWith("item1");
      expect(useSessionStore.getState().queueSingerAssignments.get("item1")).toEqual([1, 2]);
    });
  });

  describe("loadAllQueueItemSingers", () => {
    it("should load singers for all queue and history items", async () => {
      vi.mocked(useQueueStore.getState).mockReturnValue(createMockQueueState({
        queue: [{ id: "item1" }],
        history: [{ id: "item2" }],
      }));
      vi.mocked(sessionService.getQueueItemSingers)
        .mockResolvedValueOnce([mockSinger1])
        .mockResolvedValueOnce([mockSinger2]);

      await useSessionStore.getState().loadAllQueueItemSingers();

      expect(sessionService.getQueueItemSingers).toHaveBeenCalledWith("item1");
      expect(sessionService.getQueueItemSingers).toHaveBeenCalledWith("item2");
      expect(useSessionStore.getState().queueSingerAssignments.get("item1")).toEqual([1]);
      expect(useSessionStore.getState().queueSingerAssignments.get("item2")).toEqual([2]);
    });

    it("should skip items with no singers", async () => {
      vi.mocked(useQueueStore.getState).mockReturnValue(createMockQueueState({
        queue: [{ id: "item1" }, { id: "item2" }],
      }));
      vi.mocked(sessionService.getQueueItemSingers)
        .mockResolvedValueOnce([mockSinger1])
        .mockResolvedValueOnce([]);

      await useSessionStore.getState().loadAllQueueItemSingers();

      expect(useSessionStore.getState().queueSingerAssignments.get("item1")).toEqual([1]);
      expect(useSessionStore.getState().queueSingerAssignments.has("item2")).toBe(false);
    });
  });

  describe("getQueueItemSingerIds", () => {
    it("should return singer IDs for a queue item", () => {
      useSessionStore.setState({
        queueSingerAssignments: new Map([["item1", [1, 2, 3]]]),
      });

      const singerIds = useSessionStore.getState().getQueueItemSingerIds("item1");

      expect(singerIds).toEqual([1, 2, 3]);
    });

    it("should return empty array for unknown queue item", () => {
      useSessionStore.setState({
        queueSingerAssignments: new Map(),
      });

      const singerIds = useSessionStore.getState().getQueueItemSingerIds("unknown");

      expect(singerIds).toEqual([]);
    });
  });
});

describe("sessionStore - Dialog Actions", () => {
  beforeEach(() => {
    resetStoreState();
    vi.clearAllMocks();
  });

  describe("openRenameDialog / closeRenameDialog", () => {
    it("should open and close rename dialog", () => {
      expect(useSessionStore.getState().showRenameDialog).toBe(false);

      useSessionStore.getState().openRenameDialog();
      expect(useSessionStore.getState().showRenameDialog).toBe(true);

      useSessionStore.getState().closeRenameDialog();
      expect(useSessionStore.getState().showRenameDialog).toBe(false);
    });
  });

  describe("openLoadDialog / closeLoadDialog", () => {
    it("should open load dialog and fetch recent sessions", async () => {
      const recentSessions = [mockSession, { ...mockSession, id: 2 }];
      vi.mocked(sessionService.getRecentSessions).mockResolvedValue(recentSessions);
      vi.mocked(sessionService.getSessionSingers).mockResolvedValue([mockSinger1]);

      await useSessionStore.getState().openLoadDialog();

      expect(useSessionStore.getState().showLoadDialog).toBe(true);
      expect(sessionService.getRecentSessions).toHaveBeenCalledWith(10);
      expect(useSessionStore.getState().recentSessions).toEqual(recentSessions);
    });

    it("should load singers for each recent session", async () => {
      const recentSessions = [mockSession, { ...mockSession, id: 2 }];
      vi.mocked(sessionService.getRecentSessions).mockResolvedValue(recentSessions);
      vi.mocked(sessionService.getSessionSingers)
        .mockResolvedValueOnce([mockSinger1])
        .mockResolvedValueOnce([mockSinger2]);

      await useSessionStore.getState().openLoadDialog();

      expect(sessionService.getSessionSingers).toHaveBeenCalledWith(1);
      expect(sessionService.getSessionSingers).toHaveBeenCalledWith(2);
      expect(useSessionStore.getState().recentSessionSingers.get(1)).toEqual([mockSinger1]);
      expect(useSessionStore.getState().recentSessionSingers.get(2)).toEqual([mockSinger2]);
    });

    it("should close load dialog", () => {
      useSessionStore.setState({ showLoadDialog: true });

      useSessionStore.getState().closeLoadDialog();

      expect(useSessionStore.getState().showLoadDialog).toBe(false);
    });
  });

  describe("renameStoredSession", () => {
    it("should rename a stored session in recent sessions list", async () => {
      const session2 = { ...mockSession, id: 2, name: "Old Name" };
      useSessionStore.setState({
        recentSessions: [mockSession, session2],
      });
      const renamedSession = { ...session2, name: "New Name" };
      vi.mocked(sessionService.renameSession).mockResolvedValue(renamedSession);

      await useSessionStore.getState().renameStoredSession(2, "New Name");

      expect(sessionService.renameSession).toHaveBeenCalledWith(2, "New Name");
      const sessions = useSessionStore.getState().recentSessions;
      expect(sessions.find(s => s.id === 2)?.name).toBe("New Name");
    });

    it("should also update active session if it matches", async () => {
      useSessionStore.setState({
        session: mockSession,
        recentSessions: [mockSession],
      });
      const renamedSession = { ...mockSession, name: "New Name" };
      vi.mocked(sessionService.renameSession).mockResolvedValue(renamedSession);

      await useSessionStore.getState().renameStoredSession(1, "New Name");

      expect(useSessionStore.getState().session?.name).toBe("New Name");
    });
  });
});

describe("sessionStore - Hosted Session Restoration", () => {
  beforeEach(() => {
    resetStoreState();
    vi.clearAllMocks();
  });

  describe("restoreHostedSession", () => {
    it("should skip if already hosting a session", async () => {
      // Set up state with an existing hosted session
      useSessionStore.setState({
        session: mockSession,
        hostedSession: {
          id: "existing-session-id",
          sessionCode: "HK-TEST-1234",
          joinUrl: "https://example.com/join",
          qrCodeUrl: "https://example.com/qr",
          status: "active",
          stats: { pendingRequests: 0, approvedRequests: 0, totalGuests: 0 },
        },
      });

      await useSessionStore.getState().restoreHostedSession();

      // Should not have called any restore logic (verified by not throwing)
      expect(useSessionStore.getState().hostedSession).not.toBeNull();
    });

    it("should skip if no active session exists", async () => {
      useSessionStore.setState({ session: null, hostedSession: null });

      await useSessionStore.getState().restoreHostedSession();

      // Should complete without errors
      expect(useSessionStore.getState().hostedSession).toBeNull();
    });

    it("should skip if user is not authenticated", async () => {
      // Mock authStore to return not authenticated
      const { useAuthStore } = await import("./authStore");
      vi.spyOn(useAuthStore, "getState").mockReturnValue({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        isOffline: false,
        initialize: vi.fn(),
        signIn: vi.fn(),
        cancelSignIn: vi.fn(),
        signOut: vi.fn(),
        handleAuthCallback: vi.fn(),
        refreshSession: vi.fn(),
        setOffline: vi.fn(),
        _cleanup: vi.fn(),
        fetchUserProfile: vi.fn(),
      });

      useSessionStore.setState({ session: mockSession, hostedSession: null });

      await useSessionStore.getState().restoreHostedSession();

      // Should complete without errors
      expect(useSessionStore.getState().hostedSession).toBeNull();
    });
  });

  describe("loadSession calls restoreHostedSession", () => {
    it("should call restoreHostedSession at end of loadSession when session exists", async () => {
      // Mock authStore to return authenticated
      const { useAuthStore } = await import("./authStore");
      vi.spyOn(useAuthStore, "getState").mockReturnValue({
        isAuthenticated: true,
        user: { id: "user-1", email: "test@example.com", displayName: "Test User", avatarUrl: null },
        isLoading: false,
        isOffline: false,
        initialize: vi.fn(),
        signIn: vi.fn(),
        cancelSignIn: vi.fn(),
        signOut: vi.fn(),
        handleAuthCallback: vi.fn(),
        refreshSession: vi.fn(),
        setOffline: vi.fn(),
        _cleanup: vi.fn(),
        fetchUserProfile: vi.fn(),
      });

      vi.mocked(sessionService.getActiveSession).mockResolvedValue(mockSession);
      vi.mocked(sessionService.getSessionSingers).mockResolvedValue([]);
      vi.mocked(sessionService.getActiveSinger).mockResolvedValue(null);
      vi.mocked(useQueueStore.getState).mockReturnValue(createMockQueueState());

      // Spy on restoreHostedSession
      const restoreSpy = vi.spyOn(useSessionStore.getState(), "restoreHostedSession");

      await useSessionStore.getState().loadSession();

      expect(restoreSpy).toHaveBeenCalled();
    });
  });

  describe("restoreHostedSession - restoration logic", () => {
    const mockHostedSession = {
      id: "session-123",
      sessionCode: "HK-TEST-1234",
      joinUrl: "https://homekaraoke.app/join/HK-TEST-1234",
      qrCodeUrl: "https://example.com/qr",
      status: "active" as const,
      stats: { pendingRequests: 0, approvedRequests: 5, totalGuests: 3 },
    };

    const mockTokens = {
      access_token: "valid-access-token",
      refresh_token: "refresh-token",
      expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    };

    beforeEach(async () => {
      // Mock authStore to return authenticated
      const { useAuthStore } = await import("./authStore");
      vi.spyOn(useAuthStore, "getState").mockReturnValue({
        isAuthenticated: true,
        user: { id: "user-1", email: "test@example.com", displayName: "Test User", avatarUrl: null },
        isLoading: false,
        isOffline: false,
        initialize: vi.fn(),
        signIn: vi.fn(),
        cancelSignIn: vi.fn(),
        signOut: vi.fn(),
        handleAuthCallback: vi.fn(),
        refreshSession: vi.fn(),
        setOffline: vi.fn(),
        _cleanup: vi.fn(),
        fetchUserProfile: vi.fn(),
      });
    });

    it("should return early if no persisted session ID exists", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(getPersistedSessionId).mockResolvedValue(null);

      await useSessionStore.getState().restoreHostedSession();

      expect(getPersistedSessionId).toHaveBeenCalled();
      expect(hostedSessionService.getSession).not.toHaveBeenCalled();
      expect(useSessionStore.getState().hostedSession).toBeNull();
    });

    it("should return early if no auth tokens available", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(getPersistedSessionId).mockResolvedValue("session-123");
      vi.mocked(authService.getTokens).mockResolvedValue(null);

      await useSessionStore.getState().restoreHostedSession();

      expect(getPersistedSessionId).toHaveBeenCalled();
      expect(authService.getTokens).toHaveBeenCalled();
      expect(hostedSessionService.getSession).not.toHaveBeenCalled();
      expect(useSessionStore.getState().hostedSession).toBeNull();
    });

    it("should return early if token is expired", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(getPersistedSessionId).mockResolvedValue("session-123");
      // Token expired 1 hour ago
      vi.mocked(authService.getTokens).mockResolvedValue({
        access_token: "expired-token",
        refresh_token: "refresh",
        expires_at: Math.floor(Date.now() / 1000) - 3600,
      });

      await useSessionStore.getState().restoreHostedSession();

      expect(hostedSessionService.getSession).not.toHaveBeenCalled();
      expect(useSessionStore.getState().hostedSession).toBeNull();
    });

    it("should restore hosted session when valid persisted ID and tokens exist", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(getPersistedSessionId).mockResolvedValue("session-123");
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.getSession).mockResolvedValue(mockHostedSession);

      await useSessionStore.getState().restoreHostedSession();

      expect(hostedSessionService.getSession).toHaveBeenCalledWith("valid-access-token", "session-123");
      expect(useSessionStore.getState().hostedSession).toEqual(mockHostedSession);
    });

    it("should show success notification on successful reconnect", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(getPersistedSessionId).mockResolvedValue("session-123");
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.getSession).mockResolvedValue(mockHostedSession);

      await useSessionStore.getState().restoreHostedSession();

      expect(notify).toHaveBeenCalledWith("success", "Reconnected to hosted session");
    });

    it("should not show notification when no session to restore", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(getPersistedSessionId).mockResolvedValue(null);

      await useSessionStore.getState().restoreHostedSession();

      expect(notify).not.toHaveBeenCalled();
    });

    it("should start polling after successful restoration", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(getPersistedSessionId).mockResolvedValue("session-123");
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.getSession).mockResolvedValue(mockHostedSession);

      await useSessionStore.getState().restoreHostedSession();

      // Polling interval should be set
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = useSessionStore.getState() as any;
      expect(state._hostedSessionPollInterval).not.toBeNull();

      // Clean up interval to prevent memory leak in tests
      if (state._hostedSessionPollInterval) {
        clearInterval(state._hostedSessionPollInterval);
      }
    });

    it("should clear persisted ID if session is not active", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(getPersistedSessionId).mockResolvedValue("session-123");
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.getSession).mockResolvedValue({
        ...mockHostedSession,
        status: "ended",
      });

      await useSessionStore.getState().restoreHostedSession();

      expect(clearPersistedSessionId).toHaveBeenCalled();
      expect(useSessionStore.getState().hostedSession).toBeNull();
    });

    it("should clear persisted ID on 404 error (session not found)", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(getPersistedSessionId).mockResolvedValue("session-123");
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.getSession).mockRejectedValue(new Error("Failed to get session: 404 NOT_FOUND"));

      await useSessionStore.getState().restoreHostedSession();

      expect(clearPersistedSessionId).toHaveBeenCalled();
      expect(useSessionStore.getState().hostedSession).toBeNull();
    });

    it("should not show error notification on 404 error (expected cleanup)", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(getPersistedSessionId).mockResolvedValue("session-123");
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.getSession).mockRejectedValue(new Error("Failed to get session: 404 NOT_FOUND"));

      await useSessionStore.getState().restoreHostedSession();

      // No error notification should be shown for expected cleanup scenarios
      expect(notify).not.toHaveBeenCalled();
    });

    it("should clear persisted ID on 401 error (unauthorized)", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(getPersistedSessionId).mockResolvedValue("session-123");
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.getSession).mockRejectedValue(new Error("401 UNAUTHORIZED"));

      await useSessionStore.getState().restoreHostedSession();

      expect(clearPersistedSessionId).toHaveBeenCalled();
      expect(useSessionStore.getState().hostedSession).toBeNull();
    });

    it("should not show error notification on 401 error (expected cleanup)", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(getPersistedSessionId).mockResolvedValue("session-123");
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.getSession).mockRejectedValue(new Error("401 UNAUTHORIZED"));

      await useSessionStore.getState().restoreHostedSession();

      // No error notification should be shown for expected cleanup scenarios
      expect(notify).not.toHaveBeenCalled();
    });

    it("should clear persisted ID on 403 error (forbidden)", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(getPersistedSessionId).mockResolvedValue("session-123");
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.getSession).mockRejectedValue(new Error("403 Forbidden"));

      await useSessionStore.getState().restoreHostedSession();

      expect(clearPersistedSessionId).toHaveBeenCalled();
      expect(useSessionStore.getState().hostedSession).toBeNull();
    });

    it("should not show error notification on 403 error (expected cleanup)", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(getPersistedSessionId).mockResolvedValue("session-123");
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.getSession).mockRejectedValue(new Error("403 Forbidden"));

      await useSessionStore.getState().restoreHostedSession();

      // No error notification should be shown for expected cleanup scenarios
      expect(notify).not.toHaveBeenCalled();
    });

    it("should not clear persisted ID on network error (transient failure)", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(getPersistedSessionId).mockResolvedValue("session-123");
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.getSession).mockRejectedValue(new Error("Network error: connection refused"));

      await useSessionStore.getState().restoreHostedSession();

      // Should NOT clear persisted ID on network errors
      expect(clearPersistedSessionId).not.toHaveBeenCalled();
      expect(useSessionStore.getState().hostedSession).toBeNull();
    });
  });
});

describe("sessionStore - Host Session", () => {
  const mockCreatedSession = {
    id: "new-session-123",
    sessionCode: "HK-NEW-5678",
    joinUrl: "https://homekaraoke.app/join/HK-NEW-5678",
    qrCodeUrl: "https://example.com/qr",
    status: "active" as const,
    stats: { pendingRequests: 0, approvedRequests: 0, totalGuests: 0 },
  };

  const mockTokens = {
    access_token: "valid-access-token",
    refresh_token: "refresh-token",
    expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
  };

  beforeEach(() => {
    resetStoreState();
    vi.clearAllMocks();
  });

  describe("hostSession", () => {
    it("should throw error when no active session exists", async () => {
      useSessionStore.setState({ session: null, hostedSession: null });

      await expect(useSessionStore.getState().hostSession()).rejects.toThrow("No active session");

      expect(hostedSessionService.createHostedSession).not.toHaveBeenCalled();
    });

    it("should throw error when not authenticated", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(authService.getTokens).mockResolvedValue(null);

      await expect(useSessionStore.getState().hostSession()).rejects.toThrow("Not authenticated");

      expect(hostedSessionService.createHostedSession).not.toHaveBeenCalled();
    });

    it("should throw error when token is expired", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(authService.getTokens).mockResolvedValue({
        access_token: "expired-token",
        refresh_token: "refresh",
        expires_at: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      });

      await expect(useSessionStore.getState().hostSession()).rejects.toThrow("Session expired. Please sign in again.");

      expect(hostedSessionService.createHostedSession).not.toHaveBeenCalled();
    });

    it("should create hosted session and persist session ID", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.createHostedSession).mockResolvedValue(mockCreatedSession);

      await useSessionStore.getState().hostSession();

      expect(hostedSessionService.createHostedSession).toHaveBeenCalledWith(
        "valid-access-token",
        "Test Session"
      );
      expect(persistSessionId).toHaveBeenCalledWith("new-session-123");
      expect(useSessionStore.getState().hostedSession).toEqual(mockCreatedSession);
    });

    it("should persist session ID after createHostedSession succeeds", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.createHostedSession).mockResolvedValue(mockCreatedSession);

      // Track call order
      const callOrder: string[] = [];
      vi.mocked(hostedSessionService.createHostedSession).mockImplementation(async () => {
        callOrder.push("createHostedSession");
        return mockCreatedSession;
      });
      vi.mocked(persistSessionId).mockImplementation(async () => {
        callOrder.push("persistSessionId");
      });

      await useSessionStore.getState().hostSession();

      // Verify persistSessionId is called after createHostedSession
      expect(callOrder).toEqual(["createHostedSession", "persistSessionId"]);
      expect(persistSessionId).toHaveBeenCalledWith("new-session-123");
    });

    it("should open host modal after successful creation", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null, showHostModal: false });
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.createHostedSession).mockResolvedValue(mockCreatedSession);

      await useSessionStore.getState().hostSession();

      expect(useSessionStore.getState().showHostModal).toBe(true);
    });

    it("should start polling interval after successful creation", async () => {
      useSessionStore.setState({ session: mockSession, hostedSession: null });
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.createHostedSession).mockResolvedValue(mockCreatedSession);

      await useSessionStore.getState().hostSession();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = useSessionStore.getState() as any;
      expect(state._hostedSessionPollInterval).not.toBeNull();

      // Clean up interval
      if (state._hostedSessionPollInterval) {
        clearInterval(state._hostedSessionPollInterval);
      }
    });

    it("should clear existing polling interval before starting new one", async () => {
      const existingInterval = setInterval(() => {}, 1000);
      useSessionStore.setState({
        session: mockSession,
        hostedSession: null,
        _hostedSessionPollInterval: existingInterval,
      } as Parameters<typeof useSessionStore.setState>[0]);
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.createHostedSession).mockResolvedValue(mockCreatedSession);

      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      await useSessionStore.getState().hostSession();

      expect(clearIntervalSpy).toHaveBeenCalledWith(existingInterval);

      // Clean up new interval
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = useSessionStore.getState() as any;
      if (state._hostedSessionPollInterval) {
        clearInterval(state._hostedSessionPollInterval);
      }
    });

    it("should pass session name to createHostedSession", async () => {
      const namedSession = { ...mockSession, name: "My Karaoke Party" };
      useSessionStore.setState({ session: namedSession, hostedSession: null });
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.createHostedSession).mockResolvedValue(mockCreatedSession);

      await useSessionStore.getState().hostSession();

      expect(hostedSessionService.createHostedSession).toHaveBeenCalledWith(
        "valid-access-token",
        "My Karaoke Party"
      );
    });

    it("should pass undefined for unnamed session", async () => {
      const unnamedSession = { ...mockSession, name: null };
      useSessionStore.setState({ session: unnamedSession, hostedSession: null });
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.createHostedSession).mockResolvedValue(mockCreatedSession);

      await useSessionStore.getState().hostSession();

      expect(hostedSessionService.createHostedSession).toHaveBeenCalledWith(
        "valid-access-token",
        undefined
      );
    });
  });

  describe("stopHosting", () => {
    const mockHostedSession = {
      id: "session-to-stop",
      sessionCode: "HK-STOP-1234",
      joinUrl: "https://homekaraoke.app/join/HK-STOP-1234",
      qrCodeUrl: "https://example.com/qr",
      status: "active" as const,
      stats: { pendingRequests: 0, approvedRequests: 0, totalGuests: 0 },
    };

    it("should do nothing if no hosted session exists", async () => {
      useSessionStore.setState({ hostedSession: null });

      await useSessionStore.getState().stopHosting();

      expect(clearPersistedSessionId).not.toHaveBeenCalled();
      expect(hostedSessionService.endHostedSession).not.toHaveBeenCalled();
    });

    it("should clear persisted session ID before API call", async () => {
      useSessionStore.setState({
        session: mockSession,
        hostedSession: mockHostedSession,
      });
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.endHostedSession).mockResolvedValue();

      // Track call order to verify clearPersistedSessionId is called first
      const callOrder: string[] = [];
      vi.mocked(clearPersistedSessionId).mockImplementation(async () => {
        callOrder.push("clearPersistedSessionId");
      });
      vi.mocked(hostedSessionService.endHostedSession).mockImplementation(async () => {
        callOrder.push("endHostedSession");
      });

      await useSessionStore.getState().stopHosting();

      // Verify clearPersistedSessionId is called before endHostedSession
      expect(callOrder).toEqual(["clearPersistedSessionId", "endHostedSession"]);
    });

    it("should clear persisted session ID even if API call fails", async () => {
      useSessionStore.setState({
        session: mockSession,
        hostedSession: mockHostedSession,
      });
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.endHostedSession).mockRejectedValue(new Error("Network error"));

      await useSessionStore.getState().stopHosting();

      expect(clearPersistedSessionId).toHaveBeenCalled();
      // Local state should still be cleared
      expect(useSessionStore.getState().hostedSession).toBeNull();
    });

    it("should clear polling interval on stop", async () => {
      const pollInterval = setInterval(() => {}, 1000);
      useSessionStore.setState({
        session: mockSession,
        hostedSession: mockHostedSession,
        _hostedSessionPollInterval: pollInterval,
      } as Parameters<typeof useSessionStore.setState>[0]);
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.endHostedSession).mockResolvedValue();

      const clearIntervalSpy = vi.spyOn(global, "clearInterval");

      await useSessionStore.getState().stopHosting();

      expect(clearIntervalSpy).toHaveBeenCalledWith(pollInterval);
    });

    it("should clear local state even if no auth tokens available", async () => {
      useSessionStore.setState({
        session: mockSession,
        hostedSession: mockHostedSession,
        showHostModal: true,
      });
      vi.mocked(authService.getTokens).mockResolvedValue(null);

      await useSessionStore.getState().stopHosting();

      expect(clearPersistedSessionId).toHaveBeenCalled();
      expect(useSessionStore.getState().hostedSession).toBeNull();
      expect(useSessionStore.getState().showHostModal).toBe(false);
    });

    it("should show warning notification when API call fails", async () => {
      useSessionStore.setState({
        session: mockSession,
        hostedSession: mockHostedSession,
      });
      vi.mocked(authService.getTokens).mockResolvedValue(mockTokens);
      vi.mocked(hostedSessionService.endHostedSession).mockRejectedValue(new Error("Server error"));

      await useSessionStore.getState().stopHosting();

      expect(notify).toHaveBeenCalledWith(
        "warning",
        "Could not end session on server. It may expire automatically."
      );
    });
  });
});
