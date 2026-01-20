import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SingerPicker } from "./SingerPicker";
import type { Singer, Session } from "../../services";

// =============================================================================
// Type Definitions for Mocks
// =============================================================================

interface MockSessionState {
  session: Session | null;
  singers: Singer[];
  getQueueItemSingerIds: (id: string) => number[];
  assignSingerToQueueItem: ReturnType<typeof vi.fn>;
  removeSingerFromQueueItem: ReturnType<typeof vi.fn>;
  createSinger: ReturnType<typeof vi.fn>;
  loadSingers: ReturnType<typeof vi.fn>;
}

interface MockFavoritesState {
  persistentSingers: Singer[];
  loadPersistentSingers: ReturnType<typeof vi.fn>;
}

// =============================================================================
// Mock Data
// =============================================================================

const createMockSinger = (
  id: number,
  name: string,
  color: string,
  isPersistent = false,
  uniqueName: string | null = null
): Singer => ({
  id,
  name,
  color,
  is_persistent: isPersistent,
  unique_name: uniqueName,
});

const createMockSession = (id: number = 1): Session => ({
  id,
  name: "Test Session",
  started_at: "2025-01-01T00:00:00Z",
  ended_at: null,
  is_active: true,
});

let mockSessionStore: MockSessionState;
let mockFavoritesStore: MockFavoritesState;
let mockAssignments: Map<string, number[]>;

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
  },
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Users: () => <span data-testid="users-icon">👥</span>,
  Check: () => <span data-testid="check-icon">✓</span>,
  UserPlus: () => <span data-testid="user-plus-icon">+</span>,
  Star: () => <span data-testid="star-icon">★</span>,
}));

// Mock SingerAvatar component
vi.mock("./SingerAvatar", () => ({
  SingerAvatar: ({ name, color }: { name: string; color: string }) => (
    <span data-testid={`avatar-${name}`} style={{ backgroundColor: color }}>
      {name[0]}
    </span>
  ),
}));

// =============================================================================
// Test Setup
// =============================================================================

function setupMocks(options: {
  session?: Session | null;
  singers?: Singer[];
  persistentSingers?: Singer[];
  queueItemAssignments?: number[];
} = {}) {
  const singers = options.singers || [];
  const queueItemAssignments = options.queueItemAssignments || [];
  mockAssignments = new Map([["item1", queueItemAssignments]]);

  mockSessionStore = {
    session: options.session ?? null,
    singers,
    getQueueItemSingerIds: (id: string) => mockAssignments.get(id) || [],
    assignSingerToQueueItem: vi.fn().mockResolvedValue(undefined),
    removeSingerFromQueueItem: vi.fn().mockResolvedValue(undefined),
    createSinger: vi.fn().mockImplementation(async (name: string) => {
      const newSinger = createMockSinger(100, name, "#abcdef");
      return newSinger;
    }),
    loadSingers: vi.fn().mockResolvedValue(undefined),
  };

  mockFavoritesStore = {
    persistentSingers: options.persistentSingers || [],
    loadPersistentSingers: vi.fn().mockResolvedValue(undefined),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("SingerPicker", () => {
  beforeEach(() => {
    setupMocks();
    // Create a portal container
    const portalRoot = document.createElement("div");
    portalRoot.setAttribute("id", "portal-root");
    document.body.appendChild(portalRoot);
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Clean up portal container
    const portalRoot = document.getElementById("portal-root");
    if (portalRoot) {
      document.body.removeChild(portalRoot);
    }
  });

  describe("Rendering", () => {
    it("renders nothing when no session is active", () => {
      setupMocks({ session: null });
      const { container } = render(<SingerPicker queueItemId="item1" />);
      expect(container.firstChild).toBeNull();
    });

    it("renders the button when session is active", () => {
      setupMocks({ session: createMockSession() });
      render(<SingerPicker queueItemId="item1" />);
      expect(screen.getByRole("button")).toBeInTheDocument();
      expect(screen.getByTestId("users-icon")).toBeInTheDocument();
    });

    it("applies custom className", () => {
      setupMocks({ session: createMockSession() });
      render(<SingerPicker queueItemId="item1" className="custom-class" />);
      const wrapper = screen.getByRole("button").parentElement;
      expect(wrapper).toHaveClass("custom-class");
    });
  });

  describe("Dropdown opening/closing", () => {
    it("opens dropdown when button is clicked", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      expect(screen.getByText("Session Singers")).toBeInTheDocument();
    });

    it("closes dropdown when clicking outside", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));
      expect(screen.getByText("Session Singers")).toBeInTheDocument();

      // Click outside
      fireEvent.mouseDown(document.body);

      await waitFor(() => {
        expect(screen.queryByText("Session Singers")).not.toBeInTheDocument();
      });
    });

    it("loads persistent singers when dropdown opens", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      expect(mockFavoritesStore.loadPersistentSingers).toHaveBeenCalled();
    });
  });

  describe("Session Singers section", () => {
    it("displays session singers in dropdown", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [
          createMockSinger(1, "Alice", "#ff0000"),
          createMockSinger(2, "Bob", "#00ff00"),
        ],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
    });

    it("shows checkmark for assigned singers", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [
          createMockSinger(1, "Alice", "#ff0000"),
          createMockSinger(2, "Bob", "#00ff00"),
        ],
        queueItemAssignments: [1], // Alice is assigned
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      // There should be one checkmark (for Alice)
      expect(screen.getAllByTestId("check-icon")).toHaveLength(1);
    });

    it("shows star icon for persistent session singers", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [
          createMockSinger(1, "Alice", "#ff0000", true), // Persistent
          createMockSinger(2, "Bob", "#00ff00", false), // Not persistent
        ],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      // Should have star icons: at least one for Alice and one in header
      const stars = screen.getAllByTestId("star-icon");
      expect(stars.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Persistent Singers section", () => {
    it("shows available persistent singers not in session", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
        persistentSingers: [
          createMockSinger(1, "Alice", "#ff0000", true), // Already in session
          createMockSinger(2, "Charlie", "#0000ff", true, "charlie123"), // Not in session
        ],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      // Charlie should be visible in persistent section
      expect(screen.getByText("Charlie")).toBeInTheDocument();
      expect(screen.getByText("(charlie123)")).toBeInTheDocument();
    });

    it("shows message when no persistent singers available", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [],
        persistentSingers: [], // No persistent singers at all
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      expect(screen.getByText(/No persistent singers yet/)).toBeInTheDocument();
    });

    it("shows message when all persistent singers are in session", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000", true)],
        persistentSingers: [createMockSinger(1, "Alice", "#ff0000", true)],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      expect(screen.getByText(/All persistent singers are in this session/)).toBeInTheDocument();
    });
  });

  describe("Singer toggle (assign/remove)", () => {
    it("assigns singer when clicking unassigned singer", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
        queueItemAssignments: [], // Alice not assigned
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));
      await userEvent.click(screen.getByText("Alice"));

      expect(mockSessionStore.assignSingerToQueueItem).toHaveBeenCalledWith("item1", 1);
    });

    it("removes singer when clicking assigned singer", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
        queueItemAssignments: [1], // Alice is assigned
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));
      await userEvent.click(screen.getByText("Alice"));

      expect(mockSessionStore.removeSingerFromQueueItem).toHaveBeenCalledWith("item1", 1);
    });
  });

  describe("Adding persistent singer to session", () => {
    it("adds persistent singer to session and assigns to queue item", async () => {
      const { sessionService } = await import("../../services");

      setupMocks({
        session: createMockSession(),
        singers: [],
        persistentSingers: [createMockSinger(2, "Charlie", "#0000ff", true)],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));
      await userEvent.click(screen.getByText("Charlie"));

      expect(sessionService.addSingerToSession).toHaveBeenCalledWith(1, 2);
      expect(mockSessionStore.loadSingers).toHaveBeenCalled();
      expect(mockSessionStore.assignSingerToQueueItem).toHaveBeenCalledWith("item1", 2);
    });
  });

  describe("Creating new singer", () => {
    it("shows new singer form when clicking new singer button", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));
      await userEvent.click(screen.getByText("New session singer..."));

      expect(screen.getByPlaceholderText("New session singer...")).toBeInTheDocument();
    });

    it("creates and assigns singer when form is submitted", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));
      await userEvent.click(screen.getByText("New session singer..."));

      const input = screen.getByPlaceholderText("New session singer...");
      await userEvent.type(input, "NewSinger");
      await userEvent.click(screen.getByText("Add"));

      expect(mockSessionStore.createSinger).toHaveBeenCalledWith("NewSinger");
      expect(mockSessionStore.assignSingerToQueueItem).toHaveBeenCalledWith("item1", 100);
    });

    it("creates singer on Enter key", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));
      await userEvent.click(screen.getByText("New session singer..."));

      const input = screen.getByPlaceholderText("New session singer...");
      await userEvent.type(input, "NewSinger{Enter}");

      expect(mockSessionStore.createSinger).toHaveBeenCalledWith("NewSinger");
    });

    it("cancels new singer form on Escape key", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));
      await userEvent.click(screen.getByText("New session singer..."));

      const input = screen.getByPlaceholderText("New session singer...");
      await userEvent.type(input, "NewSinger");
      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByPlaceholderText("New session singer...")).not.toBeInTheDocument();
      });
    });

    it("does not create singer with empty name", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));
      await userEvent.click(screen.getByText("New session singer..."));

      // Try to submit with empty input
      await userEvent.click(screen.getByText("Add"));

      expect(mockSessionStore.createSinger).not.toHaveBeenCalled();
    });

    it("disables Add button when input is empty", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));
      await userEvent.click(screen.getByText("New session singer..."));

      const addButton = screen.getByText("Add");
      expect(addButton).toBeDisabled();
    });

    it("closes dropdown after creating singer", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));
      await userEvent.click(screen.getByText("New session singer..."));

      const input = screen.getByPlaceholderText("New session singer...");
      await userEvent.type(input, "NewSinger{Enter}");

      await waitFor(() => {
        expect(screen.queryByText("Session Singers")).not.toBeInTheDocument();
      });
    });
  });

  describe("Keyboard navigation", () => {
    it("navigates to next option on ArrowDown", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [
          createMockSinger(1, "Alice", "#ff0000"),
          createMockSinger(2, "Bob", "#00ff00"),
        ],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      // First option should be focused initially
      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveAttribute("tabindex", "0");

      // Navigate down - fire on the focused option
      fireEvent.keyDown(options[0], { key: "ArrowDown" });

      await waitFor(() => {
        expect(options[1]).toHaveAttribute("tabindex", "0");
        expect(options[0]).toHaveAttribute("tabindex", "-1");
      });
    });

    it("navigates to previous option on ArrowUp", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [
          createMockSinger(1, "Alice", "#ff0000"),
          createMockSinger(2, "Bob", "#00ff00"),
        ],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      const options = screen.getAllByRole("option");

      // Navigate down first, then up - fire on the focused option
      fireEvent.keyDown(options[0], { key: "ArrowDown" });

      await waitFor(() => {
        expect(options[1]).toHaveAttribute("tabindex", "0");
      });

      fireEvent.keyDown(options[1], { key: "ArrowUp" });

      await waitFor(() => {
        expect(options[0]).toHaveAttribute("tabindex", "0");
      });
    });

    it("wraps to first option when pressing ArrowDown on last option", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [
          createMockSinger(1, "Alice", "#ff0000"),
          createMockSinger(2, "Bob", "#00ff00"),
        ],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      const options = screen.getAllByRole("option");

      // Navigate to last
      fireEvent.keyDown(options[0], { key: "ArrowDown" });

      await waitFor(() => {
        expect(options[1]).toHaveAttribute("tabindex", "0");
      });

      // Then down again to wrap
      fireEvent.keyDown(options[1], { key: "ArrowDown" });

      await waitFor(() => {
        expect(options[0]).toHaveAttribute("tabindex", "0");
      });
    });

    it("wraps to last option when pressing ArrowUp on first option", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [
          createMockSinger(1, "Alice", "#ff0000"),
          createMockSinger(2, "Bob", "#00ff00"),
        ],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      const options = screen.getAllByRole("option");

      // Navigate up from first (should wrap to last)
      fireEvent.keyDown(options[0], { key: "ArrowUp" });

      await waitFor(() => {
        expect(options[1]).toHaveAttribute("tabindex", "0");
      });
    });

    it("closes dropdown on Escape and returns focus to button", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
      });
      render(<SingerPicker queueItemId="item1" />);

      const triggerButton = screen.getByRole("button");
      await userEvent.click(triggerButton);

      expect(screen.getByRole("listbox")).toBeInTheDocument();

      // Fire keyDown on the focused option, not the listbox
      const option = screen.getByRole("option");
      fireEvent.keyDown(option, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
      expect(triggerButton).toHaveFocus();
    });

    it("closes dropdown on Tab key", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      // Fire keyDown on the focused option, not the listbox
      const option = screen.getByRole("option");
      fireEvent.keyDown(option, { key: "Tab" });

      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });

    it("activates option with Enter key", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      const option = screen.getByRole("option");
      expect(option).toHaveAttribute("aria-selected", "false");

      // Press Enter to toggle the singer
      fireEvent.keyDown(option, { key: "Enter" });

      await waitFor(() => {
        expect(mockSessionStore.assignSingerToQueueItem).toHaveBeenCalledWith("item1", 1);
      });
    });

    it("activates option with Space key", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      const option = screen.getByRole("option");

      // Press Space to toggle the singer
      fireEvent.keyDown(option, { key: " " });

      await waitFor(() => {
        expect(mockSessionStore.assignSingerToQueueItem).toHaveBeenCalledWith("item1", 1);
      });
    });

    it("does not crash when options list is empty", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [],
        persistentSingers: [],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      // With no options, there's nothing to navigate - just verify dropdown opens
      expect(screen.getByRole("listbox")).toBeInTheDocument();
      expect(screen.queryAllByRole("option")).toHaveLength(0);
    });

    it("keyboard navigation works when new singer input is not shown", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [
          createMockSinger(1, "Alice", "#ff0000"),
          createMockSinger(2, "Bob", "#00ff00"),
        ],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveAttribute("tabindex", "0");

      // Arrow down on first option should move to second
      fireEvent.keyDown(options[0], { key: "ArrowDown" });

      await waitFor(() => {
        expect(options[1]).toHaveAttribute("tabindex", "0");
        expect(options[0]).toHaveAttribute("tabindex", "-1");
      });
    });
  });

  describe("ARIA attributes", () => {
    it("has correct ARIA attributes on trigger button", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
      });
      render(<SingerPicker queueItemId="item1" />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-haspopup", "listbox");
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(button).toHaveAttribute("aria-label", "Assign singers");

      await userEvent.click(button);

      expect(button).toHaveAttribute("aria-expanded", "true");
    });

    it("has correct ARIA attributes on listbox", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      const listbox = screen.getByRole("listbox");
      expect(listbox).toHaveAttribute("aria-label", "Select singers");
    });

    it("has correct ARIA attributes on options", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
        queueItemAssignments: [1],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      const option = screen.getByRole("option", { name: /Remove Alice/i });
      expect(option).toHaveAttribute("aria-selected", "true");
    });

    it("shows correct aria-label for unassigned singer", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
        queueItemAssignments: [],
      });
      render(<SingerPicker queueItemId="item1" />);

      await userEvent.click(screen.getByRole("button"));

      const option = screen.getByRole("option", { name: /Assign Alice/i });
      expect(option).toHaveAttribute("aria-selected", "false");
    });
  });

  describe("Click propagation", () => {
    it("stops click propagation from button", async () => {
      setupMocks({ session: createMockSession() });
      const parentClickHandler = vi.fn();

      render(
        <div onClick={parentClickHandler}>
          <SingerPicker queueItemId="item1" />
        </div>
      );

      await userEvent.click(screen.getByRole("button"));

      expect(parentClickHandler).not.toHaveBeenCalled();
    });

    it("stops click propagation from dropdown", async () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
      });
      const parentClickHandler = vi.fn();

      render(
        <div onClick={parentClickHandler}>
          <SingerPicker queueItemId="item1" />
        </div>
      );

      await userEvent.click(screen.getByRole("button"));
      await userEvent.click(screen.getByText("Alice"));

      expect(parentClickHandler).not.toHaveBeenCalled();
    });
  });
});
