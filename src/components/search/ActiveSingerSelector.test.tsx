import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ActiveSingerSelector } from "./ActiveSingerSelector";
import type { Singer, Session } from "../../services";

// =============================================================================
// Type Definitions for Mocks
// =============================================================================

interface MockSessionState {
  session: Session | null;
  singers: Singer[];
  activeSingerId: number | null;
  setActiveSinger: ReturnType<typeof vi.fn>;
  getSingerById: (id: number) => Singer | undefined;
}

// =============================================================================
// Mock Factory Functions
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

const createMockSessionStore = (): MockSessionState => {
  const singers: Singer[] = [];
  return {
    session: null,
    singers,
    activeSingerId: null,
    setActiveSinger: vi.fn(),
    getSingerById: (id: number) => singers.find((s) => s.id === id),
  };
};

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
}));

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  ChevronDown: () => <span data-testid="chevron-down">▼</span>,
  User: () => <span data-testid="user-icon">👤</span>,
}));

// Mock SingerAvatar component
vi.mock("../singers", () => ({
  SingerAvatar: ({ name, color }: { name: string; color: string }) => (
    <span data-testid={`avatar-${name}`} style={{ backgroundColor: color }}>
      {name[0]}
    </span>
  ),
}));

// =============================================================================
// Test Helpers
// =============================================================================

function resetMocks() {
  mockSessionStore = createMockSessionStore();
}

function setupWithSession(options: {
  singers?: Singer[];
  activeSingerId?: number | null;
} = {}) {
  const singers = options.singers || [];
  mockSessionStore = {
    session: createMockSession(),
    singers,
    activeSingerId: options.activeSingerId ?? null,
    setActiveSinger: vi.fn(),
    getSingerById: (id: number) => singers.find((s) => s.id === id),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("ActiveSingerSelector", () => {
  beforeEach(() => {
    resetMocks();
  });

  describe("Rendering", () => {
    it("renders nothing when no session is active", () => {
      const { container } = render(<ActiveSingerSelector />);
      expect(container.firstChild).toBeNull();
    });

    it("renders the selector when session is active", () => {
      setupWithSession();
      render(<ActiveSingerSelector />);

      expect(screen.getByText("Adding as:")).toBeInTheDocument();
      expect(screen.getByText("No singer")).toBeInTheDocument();
    });

    it("displays active singer name when one is selected", () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer], activeSingerId: 1 });
      render(<ActiveSingerSelector />);

      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByTestId("avatar-Alice")).toBeInTheDocument();
    });

    it("displays 'No singer' when no active singer is set", () => {
      setupWithSession();
      render(<ActiveSingerSelector />);

      expect(screen.getByText("No singer")).toBeInTheDocument();
      expect(screen.getByTestId("user-icon")).toBeInTheDocument();
    });
  });

  describe("Dropdown functionality", () => {
    it("opens dropdown when button is clicked", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer] });
      render(<ActiveSingerSelector />);

      const button = screen.getByRole("button");
      await userEvent.click(button);

      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("closes dropdown when clicking outside", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer] });
      render(<ActiveSingerSelector />);

      const button = screen.getByRole("button");
      await userEvent.click(button);

      expect(screen.getByRole("listbox")).toBeInTheDocument();

      // Click outside the dropdown
      await userEvent.click(document.body);

      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });

    it("shows 'No singer' option in dropdown", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer] });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));

      // The dropdown should have a No singer option
      const listbox = screen.getByRole("listbox");
      const options = listbox.querySelectorAll('[role="option"]');
      expect(options.length).toBeGreaterThan(0);
      expect(options[0].textContent).toContain("No singer");
    });

    it("shows all singers in dropdown", async () => {
      const singers = [
        createMockSinger(1, "Alice", "#ff0000"),
        createMockSinger(2, "Bob", "#00ff00"),
        createMockSinger(3, "Charlie", "#0000ff"),
      ];
      setupWithSession({ singers });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));

      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });

    it("shows helpful message when no singers in session", async () => {
      setupWithSession({ singers: [] });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));

      expect(screen.getByText(/No singers in session/)).toBeInTheDocument();
    });
  });

  describe("Selection functionality", () => {
    it("calls setActiveSinger when a singer is selected", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer] });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));
      await userEvent.click(screen.getByText("Alice"));

      expect(mockSessionStore.setActiveSinger).toHaveBeenCalledWith(1);
    });

    it("calls setActiveSinger with null when 'No singer' is selected", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer], activeSingerId: 1 });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));

      // Click on the "No singer" option in the dropdown
      const noSingerOptions = screen.getAllByText("No singer");
      // The dropdown option is the one with role="option"
      const dropdownOption = noSingerOptions.find(
        (el) => el.closest('[role="option"]')
      );
      await userEvent.click(dropdownOption!);

      expect(mockSessionStore.setActiveSinger).toHaveBeenCalledWith(null);
    });

    it("closes dropdown after selection", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer] });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      await userEvent.click(screen.getByText("Alice"));

      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });
  });

  describe("Keyboard navigation", () => {
    it("opens dropdown with Enter key", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer] });
      render(<ActiveSingerSelector />);

      const button = screen.getByRole("button");
      button.focus();
      await userEvent.keyboard("{Enter}");

      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("opens dropdown with Space key", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer] });
      render(<ActiveSingerSelector />);

      const button = screen.getByRole("button");
      button.focus();
      await userEvent.keyboard(" ");

      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("opens dropdown with ArrowDown key", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer] });
      render(<ActiveSingerSelector />);

      const button = screen.getByRole("button");
      button.focus();
      await userEvent.keyboard("{ArrowDown}");

      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("closes dropdown with Escape key", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer] });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      await userEvent.keyboard("{Escape}");

      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });

    it("navigates options with ArrowDown key", async () => {
      const singers = [
        createMockSinger(1, "Alice", "#ff0000"),
        createMockSinger(2, "Bob", "#00ff00"),
      ];
      setupWithSession({ singers });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));

      // Initial focus should be on first option (No singer)
      await userEvent.keyboard("{ArrowDown}");

      // Verify the Alice option has focus ring
      const aliceOption = screen.getByText("Alice").closest('[role="option"]');
      expect(aliceOption).toHaveClass("ring-2");
    });

    it("navigates options with ArrowUp key", async () => {
      const singers = [
        createMockSinger(1, "Alice", "#ff0000"),
        createMockSinger(2, "Bob", "#00ff00"),
      ];
      setupWithSession({ singers });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));

      // Move down twice then up once
      await userEvent.keyboard("{ArrowDown}");
      await userEvent.keyboard("{ArrowDown}");
      await userEvent.keyboard("{ArrowUp}");

      const aliceOption = screen.getByText("Alice").closest('[role="option"]');
      expect(aliceOption).toHaveClass("ring-2");
    });

    it("selects focused option with Enter key", async () => {
      const singers = [
        createMockSinger(1, "Alice", "#ff0000"),
        createMockSinger(2, "Bob", "#00ff00"),
      ];
      setupWithSession({ singers });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));
      await userEvent.keyboard("{ArrowDown}"); // Focus on Alice

      await userEvent.keyboard("{Enter}");

      expect(mockSessionStore.setActiveSinger).toHaveBeenCalledWith(1);
    });

    it("selects focused option with Space key", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer] });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));
      await userEvent.keyboard("{ArrowDown}"); // Focus on Alice

      await userEvent.keyboard(" ");

      expect(mockSessionStore.setActiveSinger).toHaveBeenCalledWith(1);
    });

    it("closes dropdown with Tab key", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer] });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));
      expect(screen.getByRole("listbox")).toBeInTheDocument();

      await userEvent.keyboard("{Tab}");

      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });
  });

  describe("Accessibility", () => {
    it("has correct ARIA attributes on button", () => {
      setupWithSession();
      render(<ActiveSingerSelector />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-haspopup", "listbox");
      expect(button).toHaveAttribute("aria-expanded", "false");
    });

    it("updates aria-expanded when dropdown opens", async () => {
      setupWithSession();
      render(<ActiveSingerSelector />);

      const button = screen.getByRole("button");
      expect(button).toHaveAttribute("aria-expanded", "false");

      await userEvent.click(button);

      expect(button).toHaveAttribute("aria-expanded", "true");
    });

    it("has correct role on dropdown", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer] });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));

      expect(screen.getByRole("listbox")).toBeInTheDocument();
    });

    it("has correct role on options", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer] });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));

      const options = screen.getAllByRole("option");
      expect(options.length).toBeGreaterThan(0);
    });

    it("marks selected option with aria-selected", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer], activeSingerId: 1 });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));

      // Find Alice in the dropdown (not the button)
      const listbox = screen.getByRole("listbox");
      const aliceOption = listbox.querySelector('[role="option"][aria-selected="true"]');
      expect(aliceOption).toBeInTheDocument();
      expect(aliceOption?.textContent).toContain("Alice");
    });

    it("has aria-activedescendant when navigating", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer] });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));
      await userEvent.keyboard("{ArrowDown}");

      const listbox = screen.getByRole("listbox");
      expect(listbox).toHaveAttribute("aria-activedescendant");
    });
  });

  describe("Visual states", () => {
    it("highlights current selection in dropdown", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer], activeSingerId: 1 });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));

      // Find the selected Alice option in the dropdown
      const listbox = screen.getByRole("listbox");
      const aliceOption = listbox.querySelector('[role="option"][aria-selected="true"]');
      expect(aliceOption).toHaveClass("bg-gray-700");
    });

    it("highlights 'No singer' when no singer is selected", async () => {
      const singer = createMockSinger(1, "Alice", "#ff0000");
      setupWithSession({ singers: [singer], activeSingerId: null });
      render(<ActiveSingerSelector />);

      await userEvent.click(screen.getByRole("button"));

      const options = screen.getAllByRole("option");
      const noSingerOption = options[0]; // First option is "No singer"
      expect(noSingerOption).toHaveClass("bg-gray-700");
    });
  });
});
