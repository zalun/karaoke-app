import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionBar } from "./SessionBar";
import type { Singer, Session } from "../../services";

// =============================================================================
// Type Definitions for Mocks
// =============================================================================

interface MockSessionState {
  session: Session | null;
  singers: Singer[];
  isLoading: boolean;
  queueSingerAssignments: Map<string, number[]>;
  showRenameDialog: boolean;
  showLoadDialog: boolean;
  recentSessions: Session[];
  recentSessionSingers: Map<number, Singer[]>;
  startSession: ReturnType<typeof vi.fn>;
  endSession: ReturnType<typeof vi.fn>;
  loadSession: ReturnType<typeof vi.fn>;
  createSinger: ReturnType<typeof vi.fn>;
  removeSingerFromSession: ReturnType<typeof vi.fn>;
  renameSession: ReturnType<typeof vi.fn>;
  switchToSession: ReturnType<typeof vi.fn>;
  openRenameDialog: ReturnType<typeof vi.fn>;
  closeRenameDialog: ReturnType<typeof vi.fn>;
  openLoadDialog: ReturnType<typeof vi.fn>;
  closeLoadDialog: ReturnType<typeof vi.fn>;
  deleteSession: ReturnType<typeof vi.fn>;
  renameStoredSession: ReturnType<typeof vi.fn>;
  loadSingers: ReturnType<typeof vi.fn>;
}

interface MockFavoritesState {
  persistentSingers: Singer[];
  loadPersistentSingers: ReturnType<typeof vi.fn>;
  openLoadFavoritesDialog: ReturnType<typeof vi.fn>;
}

// =============================================================================
// Mock Data
// =============================================================================

const createMockSinger = (
  id: number,
  name: string,
  color: string,
  isPersistent = false
): Singer => ({
  id,
  name,
  color,
  is_persistent: isPersistent,
  unique_name: null,
});

const createMockSession = (id: number = 1, name: string | null = "Test Session"): Session => ({
  id,
  name,
  started_at: "2025-01-01T12:00:00Z",
  ended_at: null,
  is_active: true,
});

let mockSessionStore: MockSessionState;
let mockFavoritesStore: MockFavoritesState;
let mockListenCallback: ((payload: unknown) => void) | null = null;

// =============================================================================
// Mock Definitions
// =============================================================================

vi.mock("../../stores", () => ({
  useSessionStore: (selector?: (state: MockSessionState) => unknown) => {
    if (selector) {
      return selector(mockSessionStore);
    }
    return mockSessionStore;
  },
  useFavoritesStore: (selector?: (state: MockFavoritesState) => unknown) => {
    if (selector) {
      return selector(mockFavoritesStore);
    }
    return mockFavoritesStore;
  },
}));

vi.mock("../../services", () => ({
  sessionService: {
    addSingerToSession: vi.fn().mockResolvedValue(undefined),
    updateSinger: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn((eventName: string, callback: (event: unknown) => void) => {
    mockListenCallback = callback;
    return Promise.resolve(() => {
      mockListenCallback = null;
    });
  }),
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Play: () => <span data-testid="play-icon">▶</span>,
  Square: () => <span data-testid="stop-icon">■</span>,
  Users: () => <span data-testid="users-icon">👥</span>,
  UserPlus: () => <span data-testid="user-plus-icon">+</span>,
  X: () => <span data-testid="x-icon">×</span>,
  Trash2: () => <span data-testid="trash-icon">🗑</span>,
  Pencil: () => <span data-testid="pencil-icon">✏</span>,
  Check: () => <span data-testid="check-icon">✓</span>,
  FolderOpen: () => <span data-testid="folder-icon">📁</span>,
  Star: () => <span data-testid="star-icon">★</span>,
}));

// Mock singer components
vi.mock("../singers", () => ({
  SingerAvatar: ({ name, color }: { name: string; color: string }) => (
    <span data-testid={`avatar-${name}`} style={{ backgroundColor: color }}>
      {name[0]}
    </span>
  ),
  SingerChip: ({
    name,
    onRemove,
    faded,
  }: {
    name: string;
    color: string;
    onRemove: () => void;
    faded: boolean;
  }) => (
    <span data-testid={`chip-${name}`} className={faded ? "faded" : ""}>
      {name}
      <button data-testid={`remove-${name}`} onClick={onRemove}>
        ×
      </button>
    </span>
  ),
}));

// =============================================================================
// Test Setup
// =============================================================================

function setupMocks(options: {
  session?: Session | null;
  singers?: Singer[];
  isLoading?: boolean;
  showRenameDialog?: boolean;
  showLoadDialog?: boolean;
  recentSessions?: Session[];
  recentSessionSingers?: Map<number, Singer[]>;
  queueSingerAssignments?: Map<string, number[]>;
  persistentSingers?: Singer[];
} = {}) {
  mockSessionStore = {
    session: options.session ?? null,
    singers: options.singers || [],
    isLoading: options.isLoading || false,
    queueSingerAssignments: options.queueSingerAssignments || new Map(),
    showRenameDialog: options.showRenameDialog || false,
    showLoadDialog: options.showLoadDialog || false,
    recentSessions: options.recentSessions || [],
    recentSessionSingers: options.recentSessionSingers || new Map(),
    startSession: vi.fn().mockResolvedValue(undefined),
    endSession: vi.fn().mockResolvedValue(undefined),
    loadSession: vi.fn().mockResolvedValue(undefined),
    createSinger: vi.fn().mockResolvedValue(createMockSinger(100, "NewSinger", "#abcdef")),
    removeSingerFromSession: vi.fn().mockResolvedValue(undefined),
    renameSession: vi.fn().mockResolvedValue(undefined),
    switchToSession: vi.fn().mockResolvedValue(undefined),
    openRenameDialog: vi.fn(),
    closeRenameDialog: vi.fn(),
    openLoadDialog: vi.fn().mockResolvedValue(undefined),
    closeLoadDialog: vi.fn(),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    renameStoredSession: vi.fn().mockResolvedValue(undefined),
    loadSingers: vi.fn().mockResolvedValue(undefined),
  };

  mockFavoritesStore = {
    persistentSingers: options.persistentSingers || [],
    loadPersistentSingers: vi.fn().mockResolvedValue(undefined),
    openLoadFavoritesDialog: vi.fn(),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("SessionBar", () => {
  beforeEach(() => {
    setupMocks();
    mockListenCallback = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("No active session state", () => {
    it("renders start session and stored sessions buttons when no session", () => {
      setupMocks({ session: null });
      render(<SessionBar />);

      expect(screen.getByText("Start Session")).toBeInTheDocument();
      expect(screen.getByText("Stored Sessions")).toBeInTheDocument();
    });

    it("calls startSession when Start Session is clicked", async () => {
      setupMocks({ session: null });
      render(<SessionBar />);

      await userEvent.click(screen.getByText("Start Session"));

      expect(mockSessionStore.startSession).toHaveBeenCalled();
    });

    it("opens load dialog when Stored Sessions is clicked", async () => {
      setupMocks({ session: null });
      render(<SessionBar />);

      await userEvent.click(screen.getByText("Stored Sessions"));

      expect(mockSessionStore.openLoadDialog).toHaveBeenCalled();
    });

    it("disables Start Session button when loading", () => {
      setupMocks({ session: null, isLoading: true });
      render(<SessionBar />);

      expect(screen.getByText("Start Session")).toBeDisabled();
    });
  });

  describe("Active session state", () => {
    it("renders session name when session has name", () => {
      setupMocks({ session: createMockSession(1, "My Session") });
      render(<SessionBar />);

      expect(screen.getByText("My Session")).toBeInTheDocument();
    });

    it("renders green pulsing indicator", () => {
      setupMocks({ session: createMockSession() });
      render(<SessionBar />);

      const indicator = document.querySelector(".bg-green-500.animate-pulse");
      expect(indicator).toBeInTheDocument();
    });

    it("renders singer avatars when singers exist", () => {
      setupMocks({
        session: createMockSession(),
        singers: [
          createMockSinger(1, "Alice", "#ff0000"),
          createMockSinger(2, "Bob", "#00ff00"),
        ],
      });
      render(<SessionBar />);

      expect(screen.getByTestId("avatar-Alice")).toBeInTheDocument();
      expect(screen.getByTestId("avatar-Bob")).toBeInTheDocument();
    });

    it("shows 'No singers' when no singers", () => {
      setupMocks({ session: createMockSession(), singers: [] });
      render(<SessionBar />);

      expect(screen.getByText("No singers")).toBeInTheDocument();
    });

    it("shows +N indicator when more than max singers", () => {
      const manySingers = Array.from({ length: 12 }, (_, i) =>
        createMockSinger(i + 1, `Singer${i + 1}`, "#000000")
      );
      setupMocks({ session: createMockSession(), singers: manySingers });
      render(<SessionBar />);

      // MAX_VISIBLE_SINGERS is 10, so should show +2
      expect(screen.getByText("+2")).toBeInTheDocument();
    });
  });

  describe("End session", () => {
    it("calls endSession when stop button is clicked", async () => {
      setupMocks({ session: createMockSession() });
      render(<SessionBar />);

      const stopButton = screen.getByTitle("End Session");
      await userEvent.click(stopButton);

      expect(mockSessionStore.endSession).toHaveBeenCalled();
    });

    it("disables stop button when loading", () => {
      setupMocks({ session: createMockSession(), isLoading: true });
      render(<SessionBar />);

      const stopButton = screen.getByTitle("End Session");
      expect(stopButton).toBeDisabled();
    });
  });

  describe("Expandable singers panel", () => {
    it("expands singers panel when clicking singers indicator", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
      });
      render(<SessionBar />);

      // Click the singers indicator button
      await userEvent.click(screen.getByTestId("users-icon").closest("button")!);

      // Should show singer chips in expanded panel
      expect(screen.getByTestId("chip-Alice")).toBeInTheDocument();
    });

    it("shows singer as faded when not assigned to any queue item", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
        queueSingerAssignments: new Map(), // Alice not assigned
      });
      render(<SessionBar />);

      await userEvent.click(screen.getByTestId("users-icon").closest("button")!);

      const chip = screen.getByTestId("chip-Alice");
      expect(chip).toHaveClass("faded");
    });

    it("shows singer as not faded when assigned to queue item", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
        queueSingerAssignments: new Map([["item1", [1]]]), // Alice assigned
      });
      render(<SessionBar />);

      await userEvent.click(screen.getByTestId("users-icon").closest("button")!);

      const chip = screen.getByTestId("chip-Alice");
      expect(chip).not.toHaveClass("faded");
    });

    it("removes singer from session when remove button is clicked", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
      });
      render(<SessionBar />);

      await userEvent.click(screen.getByTestId("users-icon").closest("button")!);
      await userEvent.click(screen.getByTestId("remove-Alice"));

      expect(mockSessionStore.removeSingerFromSession).toHaveBeenCalledWith(1);
    });

    it("shows filled star for persistent singer", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000", true)],
      });
      render(<SessionBar />);

      await userEvent.click(screen.getByTestId("users-icon").closest("button")!);

      // Should have star icons for persistent singer
      const stars = screen.getAllByTestId("star-icon");
      expect(stars.length).toBeGreaterThan(0);
    });
  });

  describe("Create new singer", () => {
    it("shows new singer form when clicking New Session Singer", async () => {
      setupMocks({ session: createMockSession(), singers: [] });
      render(<SessionBar />);

      await userEvent.click(screen.getByTestId("users-icon").closest("button")!);
      await userEvent.click(screen.getByText("New Session Singer"));

      expect(screen.getByPlaceholderText("Singer name...")).toBeInTheDocument();
    });

    it("creates singer when form is submitted", async () => {
      setupMocks({ session: createMockSession(), singers: [] });
      render(<SessionBar />);

      await userEvent.click(screen.getByTestId("users-icon").closest("button")!);
      await userEvent.click(screen.getByText("New Session Singer"));

      const input = screen.getByPlaceholderText("Singer name...");
      await userEvent.type(input, "NewSinger");
      await userEvent.click(screen.getByText("Add"));

      expect(mockSessionStore.createSinger).toHaveBeenCalledWith("NewSinger");
    });

    it("creates singer on Enter key", async () => {
      setupMocks({ session: createMockSession(), singers: [] });
      render(<SessionBar />);

      await userEvent.click(screen.getByTestId("users-icon").closest("button")!);
      await userEvent.click(screen.getByText("New Session Singer"));

      const input = screen.getByPlaceholderText("Singer name...");
      await userEvent.type(input, "NewSinger{Enter}");

      expect(mockSessionStore.createSinger).toHaveBeenCalledWith("NewSinger");
    });

    it("cancels new singer form on Escape key", async () => {
      setupMocks({ session: createMockSession(), singers: [] });
      render(<SessionBar />);

      await userEvent.click(screen.getByTestId("users-icon").closest("button")!);
      await userEvent.click(screen.getByText("New Session Singer"));

      const input = screen.getByPlaceholderText("Singer name...");
      await userEvent.type(input, "NewSinger");
      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByPlaceholderText("Singer name...")).not.toBeInTheDocument();
      });
    });

    it("shows error message when createSinger fails", async () => {
      setupMocks({ session: createMockSession(), singers: [] });
      mockSessionStore.createSinger = vi.fn().mockRejectedValue(new Error("Name too long"));
      render(<SessionBar />);

      await userEvent.click(screen.getByTestId("users-icon").closest("button")!);
      await userEvent.click(screen.getByText("New Session Singer"));

      const input = screen.getByPlaceholderText("Singer name...");
      await userEvent.type(input, "NewSinger{Enter}");

      await waitFor(() => {
        expect(screen.getByText("Name too long")).toBeInTheDocument();
      });
    });
  });

  describe("Rename session dialog", () => {
    it("shows rename dialog when showRenameDialog is true", () => {
      setupMocks({ session: createMockSession(), showRenameDialog: true });
      render(<SessionBar />);

      expect(screen.getByText("Save Session As")).toBeInTheDocument();
    });

    it("calls renameSession when Save is clicked", async () => {
      setupMocks({ session: createMockSession(), showRenameDialog: true });
      render(<SessionBar />);

      const input = screen.getByPlaceholderText("Session name...");
      await userEvent.clear(input);
      await userEvent.type(input, "New Name");
      await userEvent.click(screen.getByText("Save"));

      expect(mockSessionStore.renameSession).toHaveBeenCalledWith("New Name");
    });

    it("calls renameSession on Enter key", async () => {
      setupMocks({ session: createMockSession(), showRenameDialog: true });
      render(<SessionBar />);

      const input = screen.getByPlaceholderText("Session name...");
      await userEvent.clear(input);
      await userEvent.type(input, "New Name{Enter}");

      expect(mockSessionStore.renameSession).toHaveBeenCalledWith("New Name");
    });

    it("closes dialog on Escape key", async () => {
      setupMocks({ session: createMockSession(), showRenameDialog: true });
      render(<SessionBar />);

      const input = screen.getByPlaceholderText("Session name...");
      await userEvent.keyboard("{Escape}");

      expect(mockSessionStore.closeRenameDialog).toHaveBeenCalled();
    });

    it("closes dialog when Cancel is clicked", async () => {
      setupMocks({ session: createMockSession(), showRenameDialog: true });
      render(<SessionBar />);

      await userEvent.click(screen.getByText("Cancel"));

      expect(mockSessionStore.closeRenameDialog).toHaveBeenCalled();
    });

    it("disables Save button when input is empty", () => {
      setupMocks({ session: createMockSession(), showRenameDialog: true });
      render(<SessionBar />);

      const input = screen.getByPlaceholderText("Session name...");
      fireEvent.change(input, { target: { value: "" } });

      expect(screen.getByText("Save")).toBeDisabled();
    });
  });

  describe("Load session dialog", () => {
    it("shows load dialog when showLoadDialog is true", () => {
      setupMocks({
        session: null,
        showLoadDialog: true,
        recentSessions: [],
      });
      render(<SessionBar />);

      // Dialog should show - look for the dialog header specifically
      const dialogHeader = screen.getByRole("heading", { name: "Stored Sessions" });
      expect(dialogHeader).toBeInTheDocument();
    });

    it("shows 'No saved sessions' when no recent sessions", () => {
      setupMocks({
        session: null,
        showLoadDialog: true,
        recentSessions: [],
      });
      render(<SessionBar />);

      expect(screen.getByText("No saved sessions")).toBeInTheDocument();
    });

    it("displays recent sessions with date and singers", () => {
      const session1 = createMockSession(1, "Session 1");
      const session2 = createMockSession(2, "Session 2");
      setupMocks({
        session: null,
        showLoadDialog: true,
        recentSessions: [session1, session2],
        recentSessionSingers: new Map([
          [1, [createMockSinger(1, "Alice", "#ff0000")]],
          [2, []],
        ]),
      });
      render(<SessionBar />);

      expect(screen.getByText("Session 1")).toBeInTheDocument();
      expect(screen.getByText("Session 2")).toBeInTheDocument();
      expect(screen.getByTestId("avatar-Alice")).toBeInTheDocument();
    });

    it("marks current session with Current badge", () => {
      const activeSession = createMockSession(1, "Active Session");
      setupMocks({
        session: activeSession,
        showLoadDialog: true,
        recentSessions: [activeSession],
      });
      render(<SessionBar />);

      expect(screen.getByText("Current")).toBeInTheDocument();
    });

    it("disables switching to current session", async () => {
      const activeSession = createMockSession(1, "Active Session");
      setupMocks({
        session: activeSession,
        showLoadDialog: true,
        recentSessions: [activeSession],
      });
      render(<SessionBar />);

      // Find the session button inside the dialog (has disabled attribute)
      const disabledButton = screen.getByRole("button", { name: /Active Session/i });
      expect(disabledButton).toBeDisabled();
    });

    it("calls switchToSession when clicking a different session", async () => {
      const activeSession = createMockSession(1, "Active Session");
      const otherSession = { ...createMockSession(2, "Other Session"), is_active: false };
      setupMocks({
        session: activeSession,
        showLoadDialog: true,
        recentSessions: [activeSession, otherSession],
      });
      render(<SessionBar />);

      await userEvent.click(screen.getByText("Other Session"));

      expect(mockSessionStore.switchToSession).toHaveBeenCalledWith(2);
    });

    it("calls deleteSession when delete button is clicked", async () => {
      const activeSession = createMockSession(1, "Active Session");
      const otherSession = { ...createMockSession(2, "Other Session"), is_active: false };
      setupMocks({
        session: activeSession,
        showLoadDialog: true,
        recentSessions: [activeSession, otherSession],
      });
      render(<SessionBar />);

      const deleteButtons = screen.getAllByTestId("trash-icon");
      await userEvent.click(deleteButtons[0].closest("button")!);

      expect(mockSessionStore.deleteSession).toHaveBeenCalledWith(2);
    });

    it("does not show delete button for current session", () => {
      const activeSession = createMockSession(1, "Active Session");
      setupMocks({
        session: activeSession,
        showLoadDialog: true,
        recentSessions: [activeSession],
      });
      render(<SessionBar />);

      // Should not have a trash icon next to the current session
      expect(screen.queryByTestId("trash-icon")).not.toBeInTheDocument();
    });

    it("closes dialog when Cancel is clicked", async () => {
      setupMocks({
        session: null,
        showLoadDialog: true,
        recentSessions: [],
      });
      render(<SessionBar />);

      await userEvent.click(screen.getByText("Cancel"));

      expect(mockSessionStore.closeLoadDialog).toHaveBeenCalled();
    });
  });

  describe("Rename stored session", () => {
    it("shows edit form when pencil button is clicked", async () => {
      const session = createMockSession(1, "Test Session");
      setupMocks({
        session: null,
        showLoadDialog: true,
        recentSessions: [session],
      });
      render(<SessionBar />);

      const pencilButton = screen.getByTestId("pencil-icon").closest("button")!;
      await userEvent.click(pencilButton);

      // Should show input field with current name
      const input = screen.getByDisplayValue("Test Session");
      expect(input).toBeInTheDocument();
    });

    it("saves edited session name on Enter", async () => {
      const session = createMockSession(1, "Test Session");
      setupMocks({
        session: null,
        showLoadDialog: true,
        recentSessions: [session],
      });
      render(<SessionBar />);

      await userEvent.click(screen.getByTestId("pencil-icon").closest("button")!);

      const input = screen.getByDisplayValue("Test Session");
      await userEvent.clear(input);
      await userEvent.type(input, "New Name{Enter}");

      expect(mockSessionStore.renameStoredSession).toHaveBeenCalledWith(1, "New Name");
    });

    it("cancels editing on Escape", async () => {
      const session = createMockSession(1, "Test Session");
      setupMocks({
        session: null,
        showLoadDialog: true,
        recentSessions: [session],
      });
      render(<SessionBar />);

      await userEvent.click(screen.getByTestId("pencil-icon").closest("button")!);

      const input = screen.getByDisplayValue("Test Session");
      await userEvent.type(input, "Changed");
      await userEvent.keyboard("{Escape}");

      // Should go back to showing the session name (not the input)
      await waitFor(() => {
        expect(screen.queryByDisplayValue("Test SessionChanged")).not.toBeInTheDocument();
      });
    });
  });

  describe("Load favorites button", () => {
    it("opens favorites dialog when star button is clicked", async () => {
      setupMocks({ session: createMockSession() });
      render(<SessionBar />);

      const starButton = screen.getByTitle("Load Favorites to Queue");
      await userEvent.click(starButton);

      expect(mockFavoritesStore.openLoadFavoritesDialog).toHaveBeenCalled();
    });
  });

  describe("Session load on mount", () => {
    it("calls loadSession on mount", () => {
      setupMocks({ session: null });
      render(<SessionBar />);

      expect(mockSessionStore.loadSession).toHaveBeenCalled();
    });
  });
});
