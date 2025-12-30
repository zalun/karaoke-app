import { create } from "zustand";
import { updateService, createLogger } from "../services";
import type { UpdateInfo } from "../services";

const log = createLogger("UpdateStore");

// LocalStorage key for dismissed version
const DISMISSED_VERSION_KEY = "karaoke:dismissed-update-version";

interface UpdateState {
  // State
  updateInfo: UpdateInfo | null;
  isChecking: boolean;
  error: string | null;
  isDismissed: boolean;

  // Actions
  checkForUpdate: () => Promise<void>;
  dismissUpdate: () => void;
  clearDismissed: () => void;
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  updateInfo: null,
  isChecking: false,
  error: null,
  isDismissed: false,

  checkForUpdate: async () => {
    log.debug("Checking for updates...");
    set({ isChecking: true, error: null });

    try {
      const info = await updateService.checkForUpdate();

      // Check if user already dismissed this version
      const dismissedVersion = localStorage.getItem(DISMISSED_VERSION_KEY);
      const isDismissed = dismissedVersion === info.latest_version;

      if (info.update_available) {
        log.info(
          `Update available: ${info.current_version} -> ${info.latest_version}`
        );
      } else {
        log.debug("Already on latest version");
      }

      set({ updateInfo: info, isDismissed, isChecking: false });
    } catch (err) {
      // Silently handle errors - update check should never block the user
      log.debug("Update check failed (expected if offline)", err);
      set({ error: "Update check failed", isChecking: false });
    }
  },

  dismissUpdate: () => {
    const { updateInfo } = get();
    if (updateInfo) {
      log.info(
        `User dismissed update notification for version ${updateInfo.latest_version}`
      );
      localStorage.setItem(DISMISSED_VERSION_KEY, updateInfo.latest_version);
      set({ isDismissed: true });
    }
  },

  clearDismissed: () => {
    localStorage.removeItem(DISMISSED_VERSION_KEY);
    set({ isDismissed: false });
  },
}));
