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
}));

// Mock queueStore
vi.mock("./queueStore", () => ({
  useQueueStore: {
    getState: vi.fn(),
  },
  flushPendingOperations: vi.fn().mockResolvedValue(undefined),
}));

// Helper to create a complete mock QueueState
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
import { sessionService } from "../services";
import { useQueueStore, flushPendingOperations } from "./queueStore";

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
