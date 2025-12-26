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
  restoreLayout: () => Promise<void>;
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

  restoreLayout: async () => {
    const { pendingRestore, rememberChoice } = get();
    if (!pendingRestore) {
      log.warn("No pending restore to apply");
      return;
    }

    set({ isLoading: true });

    try {
      const { savedConfig, windowStates } = pendingRestore;

      // If user checked "Remember my choice", update auto_apply
      if (rememberChoice) {
        log.info(`Setting auto_apply=true for config ${savedConfig.id}`);
        await displayManagerService.updateAutoApply(savedConfig.id, true);
      }

      // Log what window states we received
      log.info(
        `Restoring layout with ${windowStates.length} window states: ${windowStates.map((s) => `${s.window_type}(detached=${s.is_detached})`).join(", ")}`
      );

      // Find video window state
      const videoState = windowStates.find((s) => s.window_type === "video");
      const mainState = windowStates.find((s) => s.window_type === "main");

      log.debug(`Video state: ${videoState ? "found" : "not found"}`);
      log.debug(`Main state: ${mainState ? "found" : "not found"}`);

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

          // Wait a bit for window to be created
          await new Promise((resolve) => setTimeout(resolve, 300));
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
