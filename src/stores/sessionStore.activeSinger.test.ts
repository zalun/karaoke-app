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
    getState: vi.fn(() => ({
      queue: [],
      history: [],
      loadPersistedState: vi.fn(),
      resetState: vi.fn(),
    })),
  },
}));

// Import mocked modules
import { sessionService } from "../services";

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

describe("sessionStore - Active Singer", () => {
  beforeEach(() => {
    // Reset store state before each test
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
    vi.clearAllMocks();
  });

  describe("setActiveSinger", () => {
    it("should set active singer when session exists and singer is in session", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1, mockSinger2],
      });
      vi.mocked(sessionService.setActiveSinger).mockResolvedValue();

      await useSessionStore.getState().setActiveSinger(1);

      expect(sessionService.setActiveSinger).toHaveBeenCalledWith(1, 1);
      expect(useSessionStore.getState().activeSingerId).toBe(1);
    });

    it("should clear active singer when passing null", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1],
        activeSingerId: 1,
      });
      vi.mocked(sessionService.setActiveSinger).mockResolvedValue();

      await useSessionStore.getState().setActiveSinger(null);

      expect(sessionService.setActiveSinger).toHaveBeenCalledWith(1, null);
      expect(useSessionStore.getState().activeSingerId).toBeNull();
    });

    it("should not set active singer when no session exists", async () => {
      useSessionStore.setState({
        session: null,
        singers: [mockSinger1],
      });

      await useSessionStore.getState().setActiveSinger(1);

      expect(sessionService.setActiveSinger).not.toHaveBeenCalled();
      expect(useSessionStore.getState().activeSingerId).toBeNull();
    });

    it("should not set active singer when singer is not in session", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1], // Only singer 1 is in session
      });

      await useSessionStore.getState().setActiveSinger(999); // Singer 999 doesn't exist

      expect(sessionService.setActiveSinger).not.toHaveBeenCalled();
      expect(useSessionStore.getState().activeSingerId).toBeNull();
    });

    it("should throw error when backend call fails", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1],
      });
      vi.mocked(sessionService.setActiveSinger).mockRejectedValue(
        new Error("Database error")
      );

      await expect(
        useSessionStore.getState().setActiveSinger(1)
      ).rejects.toThrow("Database error");
    });
  });

  describe("loadActiveSinger", () => {
    it("should load active singer from backend", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1, mockSinger2],
      });
      vi.mocked(sessionService.getActiveSinger).mockResolvedValue(mockSinger1);

      await useSessionStore.getState().loadActiveSinger();

      expect(sessionService.getActiveSinger).toHaveBeenCalledWith(1);
      expect(useSessionStore.getState().activeSingerId).toBe(1);
    });

    it("should set activeSingerId to null when no active singer", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1],
        activeSingerId: 1, // Start with active singer
      });
      vi.mocked(sessionService.getActiveSinger).mockResolvedValue(null);

      await useSessionStore.getState().loadActiveSinger();

      expect(useSessionStore.getState().activeSingerId).toBeNull();
    });

    it("should set activeSingerId to null when no session exists", async () => {
      useSessionStore.setState({
        session: null,
        activeSingerId: 1, // Start with active singer
      });

      await useSessionStore.getState().loadActiveSinger();

      expect(sessionService.getActiveSinger).not.toHaveBeenCalled();
      expect(useSessionStore.getState().activeSingerId).toBeNull();
    });

    it("should set activeSingerId to null on error", async () => {
      useSessionStore.setState({
        session: mockSession,
        activeSingerId: 1,
      });
      vi.mocked(sessionService.getActiveSinger).mockRejectedValue(
        new Error("Network error")
      );

      await useSessionStore.getState().loadActiveSinger();

      expect(useSessionStore.getState().activeSingerId).toBeNull();
    });
  });

  describe("deleteSinger - clears active singer", () => {
    it("should clear activeSingerId when deleting the active singer", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1, mockSinger2],
        activeSingerId: 1,
      });
      vi.mocked(sessionService.deleteSinger).mockResolvedValue();

      await useSessionStore.getState().deleteSinger(1);

      expect(useSessionStore.getState().activeSingerId).toBeNull();
      expect(useSessionStore.getState().singers).toHaveLength(1);
      expect(useSessionStore.getState().singers[0].id).toBe(2);
    });

    it("should not clear activeSingerId when deleting a different singer", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1, mockSinger2],
        activeSingerId: 1,
      });
      vi.mocked(sessionService.deleteSinger).mockResolvedValue();

      await useSessionStore.getState().deleteSinger(2);

      expect(useSessionStore.getState().activeSingerId).toBe(1);
    });
  });

  describe("startSession - clears active singer", () => {
    it("should clear activeSingerId when starting a new session", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1],
        activeSingerId: 1,
      });
      vi.mocked(sessionService.startSession).mockResolvedValue({
        ...mockSession,
        id: 2,
      });

      await useSessionStore.getState().startSession("New Session");

      expect(useSessionStore.getState().activeSingerId).toBeNull();
    });
  });

  describe("endSession - clears active singer", () => {
    it("should clear activeSingerId when ending a session", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1],
        activeSingerId: 1,
      });
      vi.mocked(sessionService.endSession).mockResolvedValue();

      await useSessionStore.getState().endSession();

      expect(useSessionStore.getState().activeSingerId).toBeNull();
    });
  });

  describe("switchToSession - loads active singer", () => {
    it("should load activeSingerId when switching to a different session", async () => {
      useSessionStore.setState({
        session: mockSession,
        singers: [mockSinger1],
        activeSingerId: 1,
      });
      vi.mocked(sessionService.loadSession).mockResolvedValue({
        ...mockSession,
        id: 2,
      });
      vi.mocked(sessionService.getSessionSingers).mockResolvedValue([mockSinger2]);
      vi.mocked(sessionService.getActiveSinger).mockResolvedValue(mockSinger2);

      await useSessionStore.getState().switchToSession(2);

      expect(sessionService.getActiveSinger).toHaveBeenCalledWith(2);
      expect(useSessionStore.getState().activeSingerId).toBe(2);
    });
  });

  describe("getSingerById", () => {
    it("should return the singer when it exists", () => {
      useSessionStore.setState({
        singers: [mockSinger1, mockSinger2],
      });

      const singer = useSessionStore.getState().getSingerById(1);

      expect(singer).toEqual(mockSinger1);
    });

    it("should return undefined when singer does not exist", () => {
      useSessionStore.setState({
        singers: [mockSinger1, mockSinger2],
      });

      const singer = useSessionStore.getState().getSingerById(999);

      expect(singer).toBeUndefined();
    });
  });
});
