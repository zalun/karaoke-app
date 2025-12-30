import { create } from "zustand";
import { createLogger } from "../services";

const log = createLogger("NotificationStore");

// Auto-hide timeout in milliseconds
const AUTO_HIDE_TIMEOUT_MS = 10000;

// Animation duration in milliseconds (must match CSS)
const ANIMATION_DURATION_MS = 300;

export type NotificationType = "error" | "warning" | "success" | "info";

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  timestamp: number;
}

interface NotificationState {
  // State
  current: Notification | null;
  lastNotification: Notification | null;
  isVisible: boolean;
  isHiding: boolean; // For slide-down animation
  showLast: boolean;

  // Actions
  notify: (type: NotificationType, message: string) => void;
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

  notify: (type, message) => {
    log.info(`Notification [${type}]: ${message}`);

    // Clear any existing timeouts to prevent memory leaks
    clearAllTimeouts();

    const notification: Notification = {
      id: crypto.randomUUID(),
      type,
      message,
      timestamp: Date.now(),
    };

    set({
      current: notification,
      lastNotification: notification,
      isVisible: true,
      isHiding: false,
      showLast: false,
    });

    // Set up auto-hide
    autoHideTimeoutId = setTimeout(() => {
      const { isVisible } = get();
      if (isVisible) {
        // Start hiding animation
        set({ isHiding: true });

        // After animation completes, hide fully
        animationTimeoutId = setTimeout(() => {
          set({ isVisible: false, isHiding: false });
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
      set({ isVisible: false, isHiding: false });
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
export function notify(type: NotificationType, message: string): void {
  useNotificationStore.getState().notify(type, message);
}

// Expose notify to window for console testing in development
if (import.meta.env.DEV) {
  (window as unknown as { notify: typeof notify }).notify = notify;
}
