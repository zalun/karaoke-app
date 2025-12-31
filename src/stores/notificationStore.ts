import { create } from "zustand";
import { createLogger } from "../services";

const log = createLogger("NotificationStore");

// Auto-hide timeout in milliseconds
const AUTO_HIDE_TIMEOUT_MS = 4000;

// Animation duration in milliseconds (must match CSS)
const ANIMATION_DURATION_MS = 300;

export type NotificationType = "error" | "warning" | "success" | "info";

export interface NotificationAction {
  label: string;
  url: string;
}

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: number;
  action?: NotificationAction;
}

interface NotificationState {
  // State
  current: Notification | null;
  lastNotification: Notification | null;
  isVisible: boolean;
  isHiding: boolean; // For slide-down animation
  showLast: boolean;
  moreCount: number; // Count of additional notifications while one is visible

  // Actions
  notify: (type: NotificationType, message: string, action?: NotificationAction) => void;
  dismiss: () => void;
  toggleShowLast: () => void;
  hideLastIndicator: () => void;
}

// Store timeout IDs outside the store to avoid serialization issues
let autoHideTimeoutId: ReturnType<typeof setTimeout> | null = null;
let animationTimeoutId: ReturnType<typeof setTimeout> | null = null;

// Clear all pending timeouts
function clearAllTimeouts() {
  if (autoHideTimeoutId) {
    clearTimeout(autoHideTimeoutId);
    autoHideTimeoutId = null;
  }
  if (animationTimeoutId) {
    clearTimeout(animationTimeoutId);
    animationTimeoutId = null;
  }
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  current: null,
  lastNotification: null,
  isVisible: false,
  isHiding: false,
  showLast: false,
  moreCount: 0,

  notify: (type, message, action) => {
    log.info(`Notification [${type}]: ${message}`);

    const { isVisible, isHiding } = get();

    // If a notification is already visible (and not hiding), increment counter
    if (isVisible && !isHiding) {
      log.debug(`Notification queued, moreCount: ${get().moreCount + 1}`);
      set((state) => ({ moreCount: state.moreCount + 1 }));

      // Also update lastNotification for the indicator
      const notification: Notification = {
        id: crypto.randomUUID(),
        type,
        message,
        timestamp: Date.now(),
        action,
      };
      set({ lastNotification: notification });

      // Reset auto-hide timer to give user more time
      clearAllTimeouts();
      const currentId = get().current?.id;
      autoHideTimeoutId = setTimeout(() => {
        const state = get();
        if (state.isVisible && state.current?.id === currentId) {
          set({ isHiding: true });
          animationTimeoutId = setTimeout(() => {
            if (get().current?.id === currentId) {
              set({ isVisible: false, isHiding: false, moreCount: 0 });
            }
          }, ANIMATION_DURATION_MS);
        }
      }, AUTO_HIDE_TIMEOUT_MS);
      return;
    }

    // Clear any existing timeouts to prevent memory leaks
    clearAllTimeouts();

    const notification: Notification = {
      id: crypto.randomUUID(),
      type,
      message,
      timestamp: Date.now(),
      action,
    };

    set({
      current: notification,
      lastNotification: notification,
      isVisible: true,
      isHiding: false,
      showLast: false,
      moreCount: 0,
    });

    // Set up auto-hide with notification ID check to prevent race conditions
    const notificationId = notification.id;
    autoHideTimeoutId = setTimeout(() => {
      const { isVisible, current } = get();
      // Only hide if this notification is still current
      if (isVisible && current?.id === notificationId) {
        // Start hiding animation
        set({ isHiding: true });

        // After animation completes, hide fully
        animationTimeoutId = setTimeout(() => {
          // Double-check notification hasn't changed during animation
          if (get().current?.id === notificationId) {
            set({ isVisible: false, isHiding: false, moreCount: 0 });
          }
        }, ANIMATION_DURATION_MS);
      }
    }, AUTO_HIDE_TIMEOUT_MS);
  },

  dismiss: () => {
    log.debug("Notification dismissed by user");

    // Clear all timeouts to prevent memory leaks
    clearAllTimeouts();

    // Start hiding animation
    set({ isHiding: true });

    // After animation completes, hide fully
    animationTimeoutId = setTimeout(() => {
      set({ isVisible: false, isHiding: false, moreCount: 0 });
    }, ANIMATION_DURATION_MS);
  },

  toggleShowLast: () => {
    const { showLast, lastNotification } = get();
    if (!lastNotification) return;

    if (showLast) {
      log.debug("Hiding last notification");
      set({ showLast: false });
    } else {
      log.debug("Showing last notification");
      set({ showLast: true });
    }
  },

  hideLastIndicator: () => {
    set({ showLast: false });
  },
}));

// Helper function for easy notification access outside components
export function notify(
  type: NotificationType,
  message: string,
  action?: NotificationAction
): void {
  useNotificationStore.getState().notify(type, message, action);
}

// Expose notify to window for console testing in development
if (import.meta.env.DEV) {
  (window as unknown as { notify: typeof notify }).notify = notify;
}
