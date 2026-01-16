import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

// Mock the stores
vi.mock("../stores", () => ({
  usePlayerStore: {
    getState: vi.fn(() => ({
      isPlaying: false,
      setIsPlaying: vi.fn(),
      volume: 0.5,
      setVolume: vi.fn(),
      toggleMute: vi.fn(),
      currentTime: 30,
      duration: 180,
      seekTo: vi.fn(),
      currentVideo: null,
    })),
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
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe("useKeyboardShortcuts", () => {
  let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let removeEventListenerSpy: ReturnType<typeof vi.spyOn>;
  let keydownHandlers: ((event: KeyboardEvent) => void)[] = [];

  beforeEach(() => {
    keydownHandlers = [];
    addEventListenerSpy = vi.spyOn(window, "addEventListener").mockImplementation(
      (type, handler) => {
        if (type === "keydown" && typeof handler === "function") {
          keydownHandlers.push(handler as (event: KeyboardEvent) => void);
        }
      }
    );
    removeEventListenerSpy = vi.spyOn(window, "removeEventListener").mockImplementation(() => {});
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
    vi.clearAllMocks();
  });

  const simulateKeydown = (key: string, options: Partial<KeyboardEvent> = {}) => {
    const event = new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      ...options,
    });
    // Make preventDefault mockable
    const preventDefaultSpy = vi.fn();
    Object.defineProperty(event, "preventDefault", {
      value: preventDefaultSpy,
      writable: true,
    });
    keydownHandlers.forEach((handler) => handler(event));
    return { event, preventDefaultSpy };
  };

  it("should add keydown event listener on mount", () => {
    renderHook(() => useKeyboardShortcuts());
    expect(addEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  it("should remove keydown event listener on unmount", () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts());
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });

  describe("Cmd+F / Ctrl+F - Focus search", () => {
    it("should call onFocusSearch when Cmd+F is pressed", () => {
      const onFocusSearch = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onFocusSearch }));

      const { preventDefaultSpy } = simulateKeydown("f", { metaKey: true });

      expect(onFocusSearch).toHaveBeenCalled();
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("should call onFocusSearch when Ctrl+F is pressed", () => {
      const onFocusSearch = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onFocusSearch }));

      const { preventDefaultSpy } = simulateKeydown("f", { ctrlKey: true });

      expect(onFocusSearch).toHaveBeenCalled();
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("should not call onFocusSearch when F is pressed without modifier", () => {
      const onFocusSearch = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onFocusSearch }));

      simulateKeydown("f");

      expect(onFocusSearch).not.toHaveBeenCalled();
    });
  });

  describe("Cmd+O / Ctrl+O - Add file", () => {
    it("should call onAddFile when Cmd+O is pressed", () => {
      const onAddFile = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onAddFile }));

      const { preventDefaultSpy } = simulateKeydown("o", { metaKey: true });

      expect(onAddFile).toHaveBeenCalled();
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("should call onAddFile when Ctrl+O is pressed", () => {
      const onAddFile = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onAddFile }));

      const { preventDefaultSpy } = simulateKeydown("o", { ctrlKey: true });

      expect(onAddFile).toHaveBeenCalled();
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("should not call onAddFile when O is pressed without modifier", () => {
      const onAddFile = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onAddFile }));

      simulateKeydown("o");

      expect(onAddFile).not.toHaveBeenCalled();
    });

    it("should not call onAddFile when callback is not provided", () => {
      renderHook(() => useKeyboardShortcuts({}));

      // Should not throw
      const { preventDefaultSpy } = simulateKeydown("o", { metaKey: true });

      // preventDefault should not be called since there's no handler
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });

  describe("/ - Focus search from non-input", () => {
    it("should call onFocusSearch when / is pressed outside input", () => {
      const onFocusSearch = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onFocusSearch }));

      // Simulate target that is not an input
      const event = new KeyboardEvent("keydown", { key: "/", bubbles: true });
      Object.defineProperty(event, "target", { value: document.body, writable: true });
      const preventDefaultSpy = vi.fn();
      Object.defineProperty(event, "preventDefault", { value: preventDefaultSpy, writable: true });

      keydownHandlers.forEach((handler) => handler(event));

      expect(onFocusSearch).toHaveBeenCalled();
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("should not call onFocusSearch when / is pressed inside input", () => {
      const onFocusSearch = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onFocusSearch }));

      // Simulate target that is an input
      const input = document.createElement("input");
      const event = new KeyboardEvent("keydown", { key: "/", bubbles: true });
      Object.defineProperty(event, "target", { value: input, writable: true });

      keydownHandlers.forEach((handler) => handler(event));

      expect(onFocusSearch).not.toHaveBeenCalled();
    });
  });

  describe("Tab - Switch panel", () => {
    it("should call onSwitchPanel when Tab is pressed outside input", () => {
      const onSwitchPanel = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onSwitchPanel }));

      // Simulate target that is not an input
      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
      Object.defineProperty(event, "target", { value: document.body, writable: true });
      const preventDefaultSpy = vi.fn();
      Object.defineProperty(event, "preventDefault", { value: preventDefaultSpy, writable: true });

      keydownHandlers.forEach((handler) => handler(event));

      expect(onSwitchPanel).toHaveBeenCalled();
      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it("should not call onSwitchPanel when Tab is pressed inside input", () => {
      const onSwitchPanel = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onSwitchPanel }));

      // Simulate target that is an input
      const input = document.createElement("input");
      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
      Object.defineProperty(event, "target", { value: input, writable: true });

      keydownHandlers.forEach((handler) => handler(event));

      expect(onSwitchPanel).not.toHaveBeenCalled();
    });

    it("should not call onSwitchPanel when Shift+Tab is pressed", () => {
      const onSwitchPanel = vi.fn();
      renderHook(() => useKeyboardShortcuts({ onSwitchPanel }));

      // Simulate target that is not an input
      const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true });
      Object.defineProperty(event, "target", { value: document.body, writable: true });

      keydownHandlers.forEach((handler) => handler(event));

      expect(onSwitchPanel).not.toHaveBeenCalled();
    });

    it("should not call onSwitchPanel when callback is not provided", () => {
      renderHook(() => useKeyboardShortcuts({}));

      // Simulate target that is not an input
      const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
      Object.defineProperty(event, "target", { value: document.body, writable: true });
      const preventDefaultSpy = vi.fn();
      Object.defineProperty(event, "preventDefault", { value: preventDefaultSpy, writable: true });

      keydownHandlers.forEach((handler) => handler(event));

      // preventDefault should not be called since there's no handler
      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });
  });
});
