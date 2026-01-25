import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WindowState, SavedDisplayConfig, DisplayConfiguration } from "../services/displayManager";

// Mock the Tauri API
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getAllWebviewWindows: vi.fn().mockResolvedValue([]),
}));

// Mock services
vi.mock("../services/logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../services/displayManager", () => ({
  displayManagerService: {
    updateAutoApply: vi.fn(),
    saveConfig: vi.fn(),
    saveWindowState: vi.fn(),
  },
}));

vi.mock("../services/windowManager", () => ({
  windowManager: {
    detachPlayer: vi.fn(),
    reattachPlayer: vi.fn(),
    restoreWindowState: vi.fn(),
    captureWindowState: vi.fn(),
  },
}));

// Mock appSignals
const mockEmitSignal = vi.fn();
vi.mock("../services/appSignals", () => ({
  APP_SIGNALS: {
    LAYOUT_RESTORE_STARTED: "app:layout-restore-started",
    LAYOUT_RESTORE_COMPLETE: "app:layout-restore-complete",
  },
  emitSignal: (...args: unknown[]) => mockEmitSignal(...args),
}));

// Mock playerStore with a mutable state
vi.mock("./playerStore", () => {
  const mockState = {
    isDetached: false,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    isLoading: false,
    currentVideo: null,
    setIsDetached: vi.fn(),
    setIsLoading: vi.fn(),
  };
  return {
    usePlayerStore: {
      getState: () => mockState,
      // Expose state for test manipulation
      __mockState: mockState,
    },
  };
});

// Import after mocking
import { useDisplayStore } from "./displayStore";
import { usePlayerStore } from "./playerStore";
import { displayManagerService } from "../services/displayManager";
import { windowManager } from "../services/windowManager";

// Helper to access mock state
const getMockPlayerState = () => (usePlayerStore as unknown as { __mockState: ReturnType<typeof usePlayerStore.getState> }).__mockState;

// Helper to create mock window states
const createMockWindowState = (overrides: Partial<WindowState> = {}): WindowState => ({
  id: 1,
  display_config_id: 1,
  window_type: "main",
  target_display_id: null,
  x: 100,
  y: 100,
  width: 1280,
  height: 720,
  is_detached: false,
  is_fullscreen: false,
  ...overrides,
});

const createMockSavedConfig = (overrides: Partial<SavedDisplayConfig> = {}): SavedDisplayConfig => ({
  id: 1,
  config_hash: "test-hash-12345678",
  display_names: ["Built-in Display"],
  description: null,
  auto_apply: false,
  created_at: "2025-01-01T00:00:00Z",
  ...overrides,
});

const createMockDisplayConfig = (overrides: Partial<DisplayConfiguration> = {}): DisplayConfiguration => ({
  config_hash: "test-hash-12345678",
  displays: [
    {
      display_id: 1,
      name: "Built-in Display",
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      is_main: true,
    },
  ],
  ...overrides,
});

describe("displayStore", () => {
  beforeEach(() => {
    // Reset store state before each test
    useDisplayStore.setState({
      currentConfig: null,
      pendingRestore: null,
      showRestoreDialog: false,
      rememberChoice: false,
      isLoading: false,
    });

    // Reset mock player store state
    const mockState = getMockPlayerState();
    mockState.isDetached = false;
    mockState.currentVideo = null;

    // Clear all mocks
    vi.clearAllMocks();
  });

  describe("restoreLayout", () => {
    describe("when restoring a layout with detached player", () => {
      it("should detach player if currently attached and layout has is_detached=true", async () => {
        const savedConfig = createMockSavedConfig();
        const windowStates: WindowState[] = [
          createMockWindowState({ window_type: "main" }),
          createMockWindowState({
            window_type: "video",
            is_detached: true,
            x: 500,
            y: 200,
            width: 800,
            height: 600,
          }),
        ];

        // Player is currently attached
        getMockPlayerState().isDetached = false;

        // Call restoreLayout with direct parameters
        await useDisplayStore.getState().restoreLayout({
          savedConfig,
          windowStates,
        });

        // Should have called detachPlayer
        expect(windowManager.detachPlayer).toHaveBeenCalled();
        expect(getMockPlayerState().setIsDetached).toHaveBeenCalledWith(true);

        // Should restore video window position
        expect(windowManager.restoreWindowState).toHaveBeenCalledWith(
          "player",
          500,
          200,
          800,
          600
        );
      });

      it("should not detach player if already detached", async () => {
        const savedConfig = createMockSavedConfig();
        const windowStates: WindowState[] = [
          createMockWindowState({ window_type: "main" }),
          createMockWindowState({ window_type: "video", is_detached: true }),
        ];

        // Player is already detached
        getMockPlayerState().isDetached = true;

        await useDisplayStore.getState().restoreLayout({
          savedConfig,
          windowStates,
        });

        // Should NOT call detachPlayer since already detached
        expect(windowManager.detachPlayer).not.toHaveBeenCalled();

        // Should still restore window position
        expect(windowManager.restoreWindowState).toHaveBeenCalledWith(
          "player",
          expect.any(Number),
          expect.any(Number),
          expect.any(Number),
          expect.any(Number)
        );
      });
    });

    describe("when restoring a layout with attached player", () => {
      it("should reattach player if currently detached and layout has is_detached=false", async () => {
        const savedConfig = createMockSavedConfig();
        const windowStates: WindowState[] = [
          createMockWindowState({ window_type: "main" }),
          createMockWindowState({ window_type: "video", is_detached: false }),
        ];

        // Player is currently detached
        getMockPlayerState().isDetached = true;

        await useDisplayStore.getState().restoreLayout({
          savedConfig,
          windowStates,
        });

        // Should have called reattachPlayer
        expect(windowManager.reattachPlayer).toHaveBeenCalled();
        expect(getMockPlayerState().setIsDetached).toHaveBeenCalledWith(false);

        // Should NOT restore video window position (it's attached, no separate window)
        expect(windowManager.restoreWindowState).not.toHaveBeenCalledWith(
          "player",
          expect.any(Number),
          expect.any(Number),
          expect.any(Number),
          expect.any(Number)
        );
      });

      it("should reattach player if currently detached and no video state saved", async () => {
        const savedConfig = createMockSavedConfig();
        // No video window state - older layouts saved before this fix
        const windowStates: WindowState[] = [
          createMockWindowState({ window_type: "main" }),
        ];

        // Player is currently detached
        getMockPlayerState().isDetached = true;

        await useDisplayStore.getState().restoreLayout({
          savedConfig,
          windowStates,
        });

        // Should have called reattachPlayer
        expect(windowManager.reattachPlayer).toHaveBeenCalled();
        expect(getMockPlayerState().setIsDetached).toHaveBeenCalledWith(false);
      });

      it("should not reattach player if already attached", async () => {
        const savedConfig = createMockSavedConfig();
        const windowStates: WindowState[] = [
          createMockWindowState({ window_type: "main" }),
          createMockWindowState({ window_type: "video", is_detached: false }),
        ];

        // Player is already attached
        getMockPlayerState().isDetached = false;

        await useDisplayStore.getState().restoreLayout({
          savedConfig,
          windowStates,
        });

        // Should NOT call reattachPlayer since already attached
        expect(windowManager.reattachPlayer).not.toHaveBeenCalled();
        expect(getMockPlayerState().setIsDetached).not.toHaveBeenCalled();
      });
    });

    it("should always restore main window position", async () => {
      const savedConfig = createMockSavedConfig();
      const windowStates: WindowState[] = [
        createMockWindowState({
          window_type: "main",
          x: 200,
          y: 150,
          width: 1600,
          height: 900,
        }),
      ];

      await useDisplayStore.getState().restoreLayout({
        savedConfig,
        windowStates,
      });

      expect(windowManager.restoreWindowState).toHaveBeenCalledWith(
        "main",
        200,
        150,
        1600,
        900
      );
    });

    it("should clear pending restore state after completion", async () => {
      const savedConfig = createMockSavedConfig();
      const windowStates: WindowState[] = [
        createMockWindowState({ window_type: "main" }),
      ];

      // Set some initial state
      useDisplayStore.setState({
        pendingRestore: { savedConfig, windowStates },
        showRestoreDialog: true,
        rememberChoice: true,
      });

      await useDisplayStore.getState().restoreLayout({
        savedConfig,
        windowStates,
      });

      const state = useDisplayStore.getState();
      expect(state.pendingRestore).toBeNull();
      expect(state.showRestoreDialog).toBe(false);
      expect(state.rememberChoice).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    describe("signal emission", () => {
      it("should emit LAYOUT_RESTORE_STARTED before and LAYOUT_RESTORE_COMPLETE after restoration", async () => {
        mockEmitSignal.mockResolvedValue(undefined);
        const savedConfig = createMockSavedConfig();
        const windowStates: WindowState[] = [
          createMockWindowState({ window_type: "main" }),
        ];

        await useDisplayStore.getState().restoreLayout({
          savedConfig,
          windowStates,
        });

        // Should emit LAYOUT_RESTORE_STARTED first
        expect(mockEmitSignal).toHaveBeenNthCalledWith(
          1,
          "app:layout-restore-started",
          undefined
        );

        // Should emit LAYOUT_RESTORE_COMPLETE last
        expect(mockEmitSignal).toHaveBeenNthCalledWith(
          2,
          "app:layout-restore-complete",
          undefined
        );

        // Should have emitted exactly 2 signals
        expect(mockEmitSignal).toHaveBeenCalledTimes(2);
      });

      it("should emit LAYOUT_RESTORE_COMPLETE even when restoration fails", async () => {
        mockEmitSignal.mockResolvedValue(undefined);
        const savedConfig = createMockSavedConfig();
        const windowStates: WindowState[] = [
          createMockWindowState({
            window_type: "video",
            is_detached: true,
          }),
        ];

        // Player is attached, so detachPlayer will be called
        getMockPlayerState().isDetached = false;

        // Make detachPlayer fail
        vi.mocked(windowManager.detachPlayer).mockRejectedValue(new Error("Detach failed"));

        // Should not throw, error is handled internally
        await useDisplayStore.getState().restoreLayout({
          savedConfig,
          windowStates,
        });

        // Should still emit both signals
        expect(mockEmitSignal).toHaveBeenCalledWith(
          "app:layout-restore-started",
          undefined
        );
        expect(mockEmitSignal).toHaveBeenCalledWith(
          "app:layout-restore-complete",
          undefined
        );
      });

      it("should not emit signals when there is no pending restore", async () => {
        mockEmitSignal.mockClear();

        // No pending restore and no direct restore parameter
        await useDisplayStore.getState().restoreLayout();

        // Should not emit any signals
        expect(mockEmitSignal).not.toHaveBeenCalled();
      });
    });
  });

  describe("saveCurrentLayout", () => {
    beforeEach(() => {
      vi.mocked(displayManagerService.saveConfig).mockResolvedValue(1);
      vi.mocked(windowManager.captureWindowState).mockResolvedValue({
        x: 100,
        y: 100,
        width: 1280,
        height: 720,
      });
    });

    it("should save video state with is_detached=true when player is detached", async () => {
      const displayConfig = createMockDisplayConfig();
      useDisplayStore.setState({ currentConfig: displayConfig });

      getMockPlayerState().isDetached = true;

      await useDisplayStore.getState().saveCurrentLayout();

      // Should capture player window state
      expect(windowManager.captureWindowState).toHaveBeenCalledWith("player");

      // Should save video state with is_detached=true
      expect(displayManagerService.saveWindowState).toHaveBeenCalledWith(
        1, // configId
        "video",
        null, // target_display_id
        100, // x
        100, // y
        1280, // width
        720, // height
        true, // is_detached
        false // is_fullscreen
      );
    });

    it("should save video state with is_detached=false when player is attached", async () => {
      const displayConfig = createMockDisplayConfig();
      useDisplayStore.setState({ currentConfig: displayConfig });

      getMockPlayerState().isDetached = false;

      await useDisplayStore.getState().saveCurrentLayout();

      // Should NOT capture player window state (no separate window)
      expect(windowManager.captureWindowState).not.toHaveBeenCalledWith("player");

      // Should save video state with is_detached=false and placeholder values
      expect(displayManagerService.saveWindowState).toHaveBeenCalledWith(
        1, // configId
        "video",
        null, // target_display_id
        0, // x - not applicable
        0, // y - not applicable
        0, // width - not applicable
        0, // height - not applicable
        false, // is_detached
        false // is_fullscreen
      );
    });

    it("should always save main window state", async () => {
      const displayConfig = createMockDisplayConfig();
      useDisplayStore.setState({ currentConfig: displayConfig });

      await useDisplayStore.getState().saveCurrentLayout();

      // Should capture main window state
      expect(windowManager.captureWindowState).toHaveBeenCalledWith("main");

      // Should save main window state
      expect(displayManagerService.saveWindowState).toHaveBeenCalledWith(
        1, // configId
        "main",
        null, // target_display_id
        100, // x
        100, // y
        1280, // width
        720, // height
        false, // is_detached
        false // is_fullscreen
      );
    });

    it("should not save layout if no current config", async () => {
      useDisplayStore.setState({ currentConfig: null });

      await useDisplayStore.getState().saveCurrentLayout();

      expect(displayManagerService.saveConfig).not.toHaveBeenCalled();
      expect(displayManagerService.saveWindowState).not.toHaveBeenCalled();
    });
  });
});
