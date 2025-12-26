import { create } from "zustand";
import {
  displayManagerService,
  type DisplayConfiguration,
  type SavedDisplayConfig,
  type WindowState,
} from "../services/displayManager";
import { createLogger } from "../services/logger";

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
        log.info(
          `Setting auto_apply=true for config ${savedConfig.id}`
        );
        await displayManagerService.updateAutoApply(savedConfig.id, true);
      }

      // Apply window states
      for (const state of windowStates) {
        log.debug(
          `Restoring window: ${state.window_type} to (${state.x}, ${state.y}) ${state.width}x${state.height}`
        );
        // Window restoration will be handled by windowManager
        // For now, emit an event that the App can listen to
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

      // TODO: Capture and save window states
      // This will be implemented when we integrate with windowManager
    } catch (err) {
      log.error("Failed to save layout", err);
    } finally {
      set({ isLoading: false });
    }
  },
}));
