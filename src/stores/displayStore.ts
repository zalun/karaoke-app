import { create } from "zustand";
import {
  displayManagerService,
  type DisplayConfiguration,
  type SavedDisplayConfig,
  type WindowState,
} from "../services/displayManager";
import { windowManager } from "../services/windowManager";
import { createLogger } from "../services/logger";
import { usePlayerStore } from "./playerStore";

const log = createLogger("DisplayStore");

// Delay after detaching player window before restoring its position
// This allows the window to be created before we try to move it
// TODO: Replace with proper window ready detection/polling
const WINDOW_CREATION_DELAY_MS = 300;

interface PendingRestore {
  savedConfig: SavedDisplayConfig;
  windowStates: WindowState[];
}

interface DisplayState {
  // Current display configuration
  currentConfig: DisplayConfiguration | null;

  // Pending restore dialog state
  pendingRestore: PendingRestore | null;
  showRestoreDialog: boolean;
  rememberChoice: boolean;

  // Loading states
  isLoading: boolean;

  // Actions
  setCurrentConfig: (config: DisplayConfiguration) => void;
  setPendingRestore: (
    savedConfig: SavedDisplayConfig,
    windowStates: WindowState[]
  ) => void;
  clearPendingRestore: () => void;
  setShowRestoreDialog: (show: boolean) => void;
  setRememberChoice: (remember: boolean) => void;

  // Async actions
  // restoreLayout can optionally accept direct parameters to avoid race conditions
  // when called immediately after setPendingRestore (Zustand batches state updates)
  restoreLayout: (directRestore?: PendingRestore) => Promise<void>;
  dismissRestore: () => Promise<void>;
  saveCurrentLayout: (description?: string) => Promise<void>;
}

export const useDisplayStore = create<DisplayState>((set, get) => ({
  currentConfig: null,
  pendingRestore: null,
  showRestoreDialog: false,
  rememberChoice: false,
  isLoading: false,

  setCurrentConfig: (currentConfig) => set({ currentConfig }),

  setPendingRestore: (savedConfig, windowStates) =>
    set({
      pendingRestore: { savedConfig, windowStates },
    }),

  clearPendingRestore: () =>
    set({
      pendingRestore: null,
      showRestoreDialog: false,
      rememberChoice: false,
    }),

  setShowRestoreDialog: (showRestoreDialog) => set({ showRestoreDialog }),

  setRememberChoice: (rememberChoice) => set({ rememberChoice }),

  restoreLayout: async (directRestore?: PendingRestore) => {
    // Use directRestore if provided (avoids race condition with batched state updates)
    // Otherwise fall back to reading from store state
    const restoreData = directRestore || get().pendingRestore;
    const { rememberChoice } = get();

    if (!restoreData) {
      log.warn("No pending restore to apply");
      return;
    }

    set({ isLoading: true });

    try {
      const { savedConfig, windowStates } = restoreData;

      // If user checked "Remember my choice", update auto_apply
      if (rememberChoice) {
        log.info(`Setting auto_apply=true for config ${savedConfig.id}`);
        await displayManagerService.updateAutoApply(savedConfig.id, true);
      }

      // Log current display configuration
      const currentDisplays = get().currentConfig;
      if (currentDisplays) {
        log.debug(
          `restoreLayout: Current displays: ${currentDisplays.displays
            .map((d) => `${d.name}(${d.x},${d.y} ${d.width}x${d.height}${d.is_main ? " MAIN" : ""})`)
            .join(", ")}`
        );
      }

      // Log what window states we received with full coordinates
      log.info(
        `Restoring layout with ${windowStates.length} window states:`
      );
      for (const state of windowStates) {
        log.info(
          `  - ${state.window_type}: (${state.x}, ${state.y}) ${state.width}x${state.height} detached=${state.is_detached}`
        );
      }

      // Find video window state
      const videoState = windowStates.find((s) => s.window_type === "video");
      const mainState = windowStates.find((s) => s.window_type === "main");

      // Check if we need to detach the player
      if (videoState && videoState.is_detached) {
        const playerStore = usePlayerStore.getState();

        // If player is not already detached, detach it
        if (!playerStore.isDetached) {
          log.info("Detaching player window for restore");
          // Build a minimal player state for detaching
          const playerState = {
            streamUrl: playerStore.currentVideo?.streamUrl || null,
            isPlaying: playerStore.isPlaying,
            currentTime: playerStore.currentTime,
            duration: playerStore.duration,
            volume: playerStore.volume,
            isMuted: playerStore.isMuted,
          };
          await windowManager.detachPlayer(playerState);
          playerStore.setIsDetached(true);
          // Clear loading state - loading now happens in detached window
          playerStore.setIsLoading(false);

          // Wait for window to be created before restoring position
          await new Promise((resolve) => setTimeout(resolve, WINDOW_CREATION_DELAY_MS));
        }

        // Restore video window position
        log.info(
          `Restoring video window to (${videoState.x}, ${videoState.y}) ${videoState.width}x${videoState.height}`
        );
        await windowManager.restoreWindowState(
          "player",
          videoState.x,
          videoState.y,
          videoState.width,
          videoState.height
        );
      }

      // Restore main window position
      if (mainState) {
        log.info(
          `Restoring main window to (${mainState.x}, ${mainState.y}) ${mainState.width}x${mainState.height}`
        );
        await windowManager.restoreWindowState(
          "main",
          mainState.x,
          mainState.y,
          mainState.width,
          mainState.height
        );
      }

      log.info(
        `Restored layout for config: ${savedConfig.config_hash.slice(0, 8)}...`
      );
    } catch (err) {
      log.error("Failed to restore layout", err);
    } finally {
      set({
        isLoading: false,
        pendingRestore: null,
        showRestoreDialog: false,
        rememberChoice: false,
      });
    }
  },

  dismissRestore: async () => {
    const { pendingRestore, rememberChoice } = get();

    // If user checked "Remember my choice" and dismissed, set auto_apply=false
    // (Actually, dismissing with "Remember" doesn't make much sense, so we just clear)
    if (rememberChoice && pendingRestore) {
      log.info("User dismissed with 'Remember' - not setting auto_apply");
    }

    set({
      pendingRestore: null,
      showRestoreDialog: false,
      rememberChoice: false,
    });
  },

  saveCurrentLayout: async (description?: string) => {
    const { currentConfig } = get();
    if (!currentConfig) {
      log.warn("No current config to save");
      return;
    }

    set({ isLoading: true });

    try {
      // Log current display configuration for debugging
      log.debug(
        `saveCurrentLayout: Current displays: ${currentConfig.displays
          .map((d) => `${d.name}(${d.x},${d.y} ${d.width}x${d.height}${d.is_main ? " MAIN" : ""})`)
          .join(", ")}`
      );

      const displayNames = currentConfig.displays.map((d) => d.name);

      // Save or update the config
      const configId = await displayManagerService.saveConfig(
        currentConfig.config_hash,
        displayNames,
        description || null,
        false // auto_apply starts as false
      );

      log.info(
        `Saved display config ${configId}: ${currentConfig.config_hash.slice(0, 8)}...`
      );

      // Capture and save main window state
      const mainState = await windowManager.captureWindowState("main");
      if (mainState) {
        await displayManagerService.saveWindowState(
          configId,
          "main",
          null, // target_display_id
          mainState.x,
          mainState.y,
          mainState.width,
          mainState.height,
          false, // is_detached
          false // is_fullscreen
        );
        log.info(
          `Saved main window state: (${mainState.x}, ${mainState.y}) ${mainState.width}x${mainState.height}`
        );
      }

      // Capture and save player window state if detached
      const playerStore = usePlayerStore.getState();
      log.info(`Player isDetached: ${playerStore.isDetached}`);
      if (playerStore.isDetached) {
        const playerState = await windowManager.captureWindowState("player");
        if (playerState) {
          await displayManagerService.saveWindowState(
            configId,
            "video",
            null, // target_display_id
            playerState.x,
            playerState.y,
            playerState.width,
            playerState.height,
            true, // is_detached
            false // is_fullscreen
          );
          log.info(
            `Saved video window state (detached=true): (${playerState.x}, ${playerState.y}) ${playerState.width}x${playerState.height}`
          );
        } else {
          log.warn("Player is detached but could not capture window state");
        }
      } else {
        log.info("Player is not detached, skipping video window state");
      }

      log.info("Display layout saved successfully");
    } catch (err) {
      log.error("Failed to save layout", err);
    } finally {
      set({ isLoading: false });
    }
  },
}));
