import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { CurrentSingerOverlay, CURRENT_SINGER_OVERLAY_DURATION_MS } from "./CurrentSingerOverlay";
import type { Singer, Session } from "../../services";

// =============================================================================
// Type Definitions for Mocks
// =============================================================================

interface MockSessionState {
  session: Session | null;
  singers: Singer[];
  queueSingerAssignments: Map<string, number[]>;
  getQueueItemSingerIds: (id: string) => number[];
  getSingerById: (id: number) => Singer | undefined;
  loadQueueItemSingers: ReturnType<typeof vi.fn>;
}

interface MockQueueItem {
  id: string;
  title: string;
}

interface MockQueueState {
  getCurrentItem: () => MockQueueItem | null;
}

// =============================================================================
// Mock Data
// =============================================================================

const createMockSinger = (id: number, name: string, color: string): Singer => ({
  id,
  name,
  color,
  is_persistent: false,
  unique_name: null,
});

const createMockSession = (id: number = 1): Session => ({
  id,
  name: "Test Session",
  started_at: "2025-01-01T00:00:00Z",
  ended_at: null,
  is_active: true,
});

let mockSessionStore: MockSessionState;
let mockQueueStore: MockQueueState;

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
  useQueueStore: (selector?: (state: MockQueueState) => unknown) => {
    if (selector) {
      return selector(mockQueueStore);
    }
    return mockQueueStore;
  },
}));

// Mock SingerOverlayDisplay
vi.mock("./SingerOverlayDisplay", () => ({
  SingerOverlayDisplay: ({ singers }: { singers: Singer[] }) => (
    <div data-testid="singer-overlay-display">
      {singers.map((s) => (
        <span key={s.id} data-testid={`singer-${s.id}`}>
          {s.name}
        </span>
      ))}
    </div>
  ),
}));

// =============================================================================
// Test Setup
// =============================================================================

function setupMocks(options: {
  session?: Session | null;
  singers?: Singer[];
  currentItem?: MockQueueItem | null;
  queueSingerAssignments?: Map<string, number[]>;
} = {}) {
  const singers = options.singers || [];
  const assignments = options.queueSingerAssignments || new Map();

  mockSessionStore = {
    session: options.session ?? null,
    singers,
    queueSingerAssignments: assignments,
    getQueueItemSingerIds: (id: string) => assignments.get(id) || [],
    getSingerById: (id: number) => singers.find((s) => s.id === id),
    loadQueueItemSingers: vi.fn(),
  };

  mockQueueStore = {
    getCurrentItem: () => options.currentItem ?? null,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("CurrentSingerOverlay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setupMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders nothing when no session is active", () => {
      setupMocks({ session: null });
      const { container } = render(<CurrentSingerOverlay />);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when no current item", () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
        currentItem: null,
      });
      const { container } = render(<CurrentSingerOverlay />);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when no singers assigned to current item", () => {
      setupMocks({
        session: createMockSession(),
        singers: [createMockSinger(1, "Alice", "#ff0000")],
        currentItem: { id: "item1", title: "Test Song" },
        queueSingerAssignments: new Map(), // No assignments
      });
      const { container } = render(<CurrentSingerOverlay />);
      expect(container.firstChild).toBeNull();
    });

    it("renders overlay when session, current item, and singers exist", () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupMocks({
        session: createMockSession(),
        singers: [singer],
        currentItem: { id: "item1", title: "Test Song" },
        queueSingerAssignments: new Map([["item1", [1]]]),
      });

      render(<CurrentSingerOverlay />);

      expect(screen.getByTestId("singer-overlay-display")).toBeInTheDocument();
      expect(screen.getByTestId("singer-1")).toHaveTextContent("Alice");
    });

    it("renders multiple singers when assigned", () => {
      const singer1 = createMockSinger(1, "Alice", "#ff0000");
      const singer2 = createMockSinger(2, "Bob", "#00ff00");
      setupMocks({
        session: createMockSession(),
        singers: [singer1, singer2],
        currentItem: { id: "item1", title: "Test Song" },
        queueSingerAssignments: new Map([["item1", [1, 2]]]),
      });

      render(<CurrentSingerOverlay />);

      expect(screen.getByTestId("singer-1")).toHaveTextContent("Alice");
      expect(screen.getByTestId("singer-2")).toHaveTextContent("Bob");
    });
  });

  describe("Timer behavior", () => {
    it("exports the correct duration constant", () => {
      expect(CURRENT_SINGER_OVERLAY_DURATION_MS).toBe(5000);
    });

    it("should be visible initially", () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupMocks({
        session: createMockSession(),
        singers: [singer],
        currentItem: { id: "item1", title: "Test Song" },
        queueSingerAssignments: new Map([["item1", [1]]]),
      });

      render(<CurrentSingerOverlay />);

      expect(screen.getByTestId("singer-overlay-display")).toBeInTheDocument();
    });

    it("should hide after the duration", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupMocks({
        session: createMockSession(),
        singers: [singer],
        currentItem: { id: "item1", title: "Test Song" },
        queueSingerAssignments: new Map([["item1", [1]]]),
      });

      render(<CurrentSingerOverlay />);

      expect(screen.getByTestId("singer-overlay-display")).toBeInTheDocument();

      // Advance timers past the duration
      act(() => {
        vi.advanceTimersByTime(CURRENT_SINGER_OVERLAY_DURATION_MS);
      });

      // The overlay should now be hidden
      expect(screen.queryByTestId("singer-overlay-display")).not.toBeInTheDocument();
    });

    it("should remain visible before the duration", () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupMocks({
        session: createMockSession(),
        singers: [singer],
        currentItem: { id: "item1", title: "Test Song" },
        queueSingerAssignments: new Map([["item1", [1]]]),
      });

      render(<CurrentSingerOverlay />);

      // Advance timers to just before the duration
      act(() => {
        vi.advanceTimersByTime(CURRENT_SINGER_OVERLAY_DURATION_MS - 100);
      });

      // The overlay should still be visible
      expect(screen.getByTestId("singer-overlay-display")).toBeInTheDocument();
    });

    it("should cleanup timer on unmount", () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupMocks({
        session: createMockSession(),
        singers: [singer],
        currentItem: { id: "item1", title: "Test Song" },
        queueSingerAssignments: new Map([["item1", [1]]]),
      });

      const { unmount } = render(<CurrentSingerOverlay />);

      // Unmount before timer fires
      unmount();

      // Advance timers - should not cause any errors (test passes if no exception thrown)
      expect(() => {
        act(() => {
          vi.advanceTimersByTime(CURRENT_SINGER_OVERLAY_DURATION_MS);
        });
      }).not.toThrow();
    });
  });

  describe("Loading singers for current item", () => {
    it("should call loadQueueItemSingers when session and currentItemId exist", () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupMocks({
        session: createMockSession(),
        singers: [singer],
        currentItem: { id: "item1", title: "Test Song" },
        queueSingerAssignments: new Map([["item1", [1]]]),
      });

      render(<CurrentSingerOverlay />);

      expect(mockSessionStore.loadQueueItemSingers).toHaveBeenCalledWith("item1");
    });

    it("should not call loadQueueItemSingers when no session", () => {
      setupMocks({
        session: null,
        currentItem: { id: "item1", title: "Test Song" },
      });

      render(<CurrentSingerOverlay />);

      expect(mockSessionStore.loadQueueItemSingers).not.toHaveBeenCalled();
    });

    it("should not call loadQueueItemSingers when no current item", () => {
      setupMocks({
        session: createMockSession(),
        currentItem: null,
      });

      render(<CurrentSingerOverlay />);

      expect(mockSessionStore.loadQueueItemSingers).not.toHaveBeenCalled();
    });
  });

  describe("Singer filtering", () => {
    it("should only include singers that exist in the session", () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupMocks({
        session: createMockSession(),
        singers: [singer], // Only Alice in session
        currentItem: { id: "item1", title: "Test Song" },
        queueSingerAssignments: new Map([["item1", [1, 999]]]), // 999 doesn't exist
      });

      render(<CurrentSingerOverlay />);

      expect(screen.getByTestId("singer-1")).toHaveTextContent("Alice");
      expect(screen.queryByTestId("singer-999")).not.toBeInTheDocument();
    });
  });
});
