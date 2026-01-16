import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";
import { usePlayerStore } from "../stores";

// Mock the stores
vi.mock("../stores", () => ({
  usePlayerStore: {
    getState: vi.fn(),
  },
  useQueueStore: {
    getState: vi.fn(() => ({
      playNext: vi.fn(),
      hasNext: vi.fn(() => false),
    })),
  },
  playVideo: vi.fn(),
}));

// Mock the logger
vi.mock("../services", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("useKeyboardShortcuts", () => {
  let mockSetIsPlaying: ReturnType<typeof vi.fn>;
  let mockSetVolume: ReturnType<typeof vi.fn>;
  let mockToggleMute: ReturnType<typeof vi.fn>;
  let mockSeekTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSetIsPlaying = vi.fn();
    mockSetVolume = vi.fn();
    mockToggleMute = vi.fn();
    mockSeekTo = vi.fn();

    vi.mocked(usePlayerStore.getState).mockReturnValue({
      currentVideo: { id: "test", title: "Test Video" },
      isPlaying: false,
      volume: 0.5,
      isMuted: false,
      currentTime: 30,
      duration: 180,
      setIsPlaying: mockSetIsPlaying,
      setVolume: mockSetVolume,
      toggleMute: mockToggleMute,
      seekTo: mockSeekTo,
    } as unknown as ReturnType<typeof usePlayerStore.getState>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function simulateKeyDown(key: string, options: Partial<KeyboardEventInit> = {}) {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      ...options,
    });
    window.dispatchEvent(event);
  }

  it("should toggle play/pause on Space key", () => {
    renderHook(() => useKeyboardShortcuts());

    act(() => {
      simulateKeyDown(" ");
    });

    expect(mockSetIsPlaying).toHaveBeenCalledWith(true);
  });

  it("should toggle mute on M key", () => {
    renderHook(() => useKeyboardShortcuts());

    act(() => {
      simulateKeyDown("m");
    });

    expect(mockToggleMute).toHaveBeenCalled();
  });

  it("should increase volume on ArrowUp key", () => {
    renderHook(() => useKeyboardShortcuts());

    act(() => {
      simulateKeyDown("ArrowUp");
    });

    expect(mockSetVolume).toHaveBeenCalledWith(0.6); // 0.5 + 0.1
  });

  it("should decrease volume on ArrowDown key", () => {
    renderHook(() => useKeyboardShortcuts());

    act(() => {
      simulateKeyDown("ArrowDown");
    });

    expect(mockSetVolume).toHaveBeenCalledWith(0.4); // 0.5 - 0.1
  });

  it("should not exceed volume of 1 when pressing ArrowUp", () => {
    vi.mocked(usePlayerStore.getState).mockReturnValue({
      ...usePlayerStore.getState(),
      volume: 0.95,
    } as unknown as ReturnType<typeof usePlayerStore.getState>);

    renderHook(() => useKeyboardShortcuts());

    act(() => {
      simulateKeyDown("ArrowUp");
    });

    expect(mockSetVolume).toHaveBeenCalledWith(1);
  });

  it("should not go below volume of 0 when pressing ArrowDown", () => {
    vi.mocked(usePlayerStore.getState).mockReturnValue({
      ...usePlayerStore.getState(),
      volume: 0.05,
    } as unknown as ReturnType<typeof usePlayerStore.getState>);

    renderHook(() => useKeyboardShortcuts());

    act(() => {
      simulateKeyDown("ArrowDown");
    });

    expect(mockSetVolume).toHaveBeenCalledWith(0);
  });

  it("should not trigger shortcuts when modifier keys are pressed", () => {
    renderHook(() => useKeyboardShortcuts());

    act(() => {
      simulateKeyDown(" ", { metaKey: true });
      simulateKeyDown("m", { ctrlKey: true });
    });

    expect(mockSetIsPlaying).not.toHaveBeenCalled();
    expect(mockToggleMute).not.toHaveBeenCalled();
  });

  it("should not trigger shortcuts when focus is on input element", () => {
    renderHook(() => useKeyboardShortcuts());

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: " ",
        bubbles: true,
      });
      Object.defineProperty(event, "target", { value: input });
      window.dispatchEvent(event);
    });

    expect(mockSetIsPlaying).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  describe("video window shortcuts", () => {
    it("should call onToggleFullscreen on F key when enableVideoShortcuts is true", () => {
      const mockToggleFullscreen = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts({
          enableVideoShortcuts: true,
          onToggleFullscreen: mockToggleFullscreen,
        })
      );

      act(() => {
        simulateKeyDown("f");
      });

      expect(mockToggleFullscreen).toHaveBeenCalled();
    });

    it("should not call onToggleFullscreen on F key when enableVideoShortcuts is false", () => {
      const mockToggleFullscreen = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts({
          enableVideoShortcuts: false,
          onToggleFullscreen: mockToggleFullscreen,
        })
      );

      act(() => {
        simulateKeyDown("f");
      });

      expect(mockToggleFullscreen).not.toHaveBeenCalled();
    });

    it("should seek backward on ArrowLeft when enableVideoShortcuts is true", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          enableVideoShortcuts: true,
        })
      );

      act(() => {
        simulateKeyDown("ArrowLeft");
      });

      expect(mockSeekTo).toHaveBeenCalledWith(20); // 30 - 10
    });

    it("should seek forward on ArrowRight when enableVideoShortcuts is true", () => {
      renderHook(() =>
        useKeyboardShortcuts({
          enableVideoShortcuts: true,
        })
      );

      act(() => {
        simulateKeyDown("ArrowRight");
      });

      expect(mockSeekTo).toHaveBeenCalledWith(40); // 30 + 10
    });

    it("should not seek past the beginning when pressing ArrowLeft", () => {
      vi.mocked(usePlayerStore.getState).mockReturnValue({
        ...usePlayerStore.getState(),
        currentTime: 5,
      } as unknown as ReturnType<typeof usePlayerStore.getState>);

      renderHook(() =>
        useKeyboardShortcuts({
          enableVideoShortcuts: true,
        })
      );

      act(() => {
        simulateKeyDown("ArrowLeft");
      });

      expect(mockSeekTo).toHaveBeenCalledWith(0);
    });

    it("should not seek past the end when pressing ArrowRight", () => {
      vi.mocked(usePlayerStore.getState).mockReturnValue({
        ...usePlayerStore.getState(),
        currentTime: 175,
        duration: 180,
      } as unknown as ReturnType<typeof usePlayerStore.getState>);

      renderHook(() =>
        useKeyboardShortcuts({
          enableVideoShortcuts: true,
        })
      );

      act(() => {
        simulateKeyDown("ArrowRight");
      });

      expect(mockSeekTo).toHaveBeenCalledWith(180);
    });

    it("should not affect arrow keys volume when enableVideoShortcuts is true", () => {
      // Arrow keys should be seek instead of volume when video shortcuts enabled
      renderHook(() =>
        useKeyboardShortcuts({
          enableVideoShortcuts: true,
        })
      );

      // ArrowUp should still control volume
      act(() => {
        simulateKeyDown("ArrowUp");
      });

      expect(mockSetVolume).toHaveBeenCalledWith(0.6);
    });
  });

  it("should not play/pause when no video is playing", () => {
    vi.mocked(usePlayerStore.getState).mockReturnValue({
      ...usePlayerStore.getState(),
      currentVideo: null,
    } as unknown as ReturnType<typeof usePlayerStore.getState>);

    renderHook(() => useKeyboardShortcuts());

    act(() => {
      simulateKeyDown(" ");
    });

    expect(mockSetIsPlaying).not.toHaveBeenCalled();
  });

  describe("search focus shortcuts", () => {
    it("should call onFocusSearch on Cmd+F", () => {
      const mockFocusSearch = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts({
          onFocusSearch: mockFocusSearch,
        })
      );

      act(() => {
        simulateKeyDown("f", { metaKey: true });
      });

      expect(mockFocusSearch).toHaveBeenCalled();
    });

    it("should call onFocusSearch on Ctrl+F", () => {
      const mockFocusSearch = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts({
          onFocusSearch: mockFocusSearch,
        })
      );

      act(() => {
        simulateKeyDown("f", { ctrlKey: true });
      });

      expect(mockFocusSearch).toHaveBeenCalled();
    });

    it("should call onFocusSearch on / key", () => {
      const mockFocusSearch = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts({
          onFocusSearch: mockFocusSearch,
        })
      );

      act(() => {
        simulateKeyDown("/");
      });

      expect(mockFocusSearch).toHaveBeenCalled();
    });

    it("should not call onFocusSearch on / when in input field", () => {
      const mockFocusSearch = vi.fn();
      renderHook(() =>
        useKeyboardShortcuts({
          onFocusSearch: mockFocusSearch,
        })
      );

      const input = document.createElement("input");
      document.body.appendChild(input);
      input.focus();

      act(() => {
        const event = new KeyboardEvent("keydown", {
          key: "/",
          bubbles: true,
        });
        Object.defineProperty(event, "target", { value: input });
        window.dispatchEvent(event);
      });

      expect(mockFocusSearch).not.toHaveBeenCalled();

      document.body.removeChild(input);
    });
  });
});
