import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useNotificationStore } from "./notificationStore";

// Mock the services
vi.mock("../services", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  APP_SIGNALS: {
    NOTIFICATION_SHOWING: "app:notification-showing",
    NOTIFICATION_HIDDEN: "app:notification-hidden",
  },
  emitSignal: vi.fn().mockResolvedValue(undefined),
}));

// Import mocked modules
import { emitSignal, APP_SIGNALS } from "../services";

describe("notificationStore - Signals", () => {
  beforeEach(() => {
    // Reset store state before each test
    useNotificationStore.setState({
      current: null,
      lastNotification: null,
      isVisible: false,
      isHiding: false,
      showLast: false,
      moreCount: 0,
    });
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("NOTIFICATION_SHOWING signal", () => {
    it("should emit NOTIFICATION_SHOWING signal when notification is shown", () => {
      useNotificationStore.getState().notify("info", "Test message");

      expect(emitSignal).toHaveBeenCalledWith(
        APP_SIGNALS.NOTIFICATION_SHOWING,
        expect.objectContaining({
          type: "info",
        })
      );
      // Verify the ID is a string (UUID)
      const call = vi.mocked(emitSignal).mock.calls.find(
        (c) => c[0] === APP_SIGNALS.NOTIFICATION_SHOWING
      );
      expect(call).toBeDefined();
      expect(typeof call![1].id).toBe("string");
    });

    it("should emit NOTIFICATION_SHOWING with correct type for different notification types", () => {
      const types = ["error", "warning", "success", "info"] as const;

      for (const type of types) {
        vi.clearAllMocks();
        useNotificationStore.setState({
          current: null,
          isVisible: false,
          isHiding: false,
        });

        useNotificationStore.getState().notify(type, `Test ${type}`);

        expect(emitSignal).toHaveBeenCalledWith(
          APP_SIGNALS.NOTIFICATION_SHOWING,
          expect.objectContaining({
            type,
          })
        );
      }
    });

    it("should not emit NOTIFICATION_SHOWING when notification is queued (another visible)", () => {
      // Show first notification
      useNotificationStore.getState().notify("info", "First message");
      vi.clearAllMocks();

      // Try to show second notification while first is visible
      useNotificationStore.getState().notify("info", "Second message");

      // Should NOT emit NOTIFICATION_SHOWING for queued notification
      expect(emitSignal).not.toHaveBeenCalledWith(
        APP_SIGNALS.NOTIFICATION_SHOWING,
        expect.anything()
      );
    });
  });

  describe("NOTIFICATION_HIDDEN signal", () => {
    it("should emit NOTIFICATION_HIDDEN signal when notification auto-hides", () => {
      useNotificationStore.getState().notify("info", "Test message");
      const notificationId = useNotificationStore.getState().current?.id;

      vi.clearAllMocks();

      // Fast-forward past auto-hide timeout (4000ms for info) + animation (300ms)
      vi.advanceTimersByTime(4300);

      expect(emitSignal).toHaveBeenCalledWith(
        APP_SIGNALS.NOTIFICATION_HIDDEN,
        { id: notificationId }
      );
    });

    it("should emit NOTIFICATION_HIDDEN signal when notification is dismissed", () => {
      useNotificationStore.getState().notify("info", "Test message");
      const notificationId = useNotificationStore.getState().current?.id;

      vi.clearAllMocks();

      useNotificationStore.getState().dismiss();

      // Fast-forward past animation duration
      vi.advanceTimersByTime(300);

      expect(emitSignal).toHaveBeenCalledWith(
        APP_SIGNALS.NOTIFICATION_HIDDEN,
        { id: notificationId }
      );
    });

    it("should emit NOTIFICATION_HIDDEN with correct ID for different auto-hide timeouts", () => {
      // Test error notification (8000ms timeout)
      useNotificationStore.getState().notify("error", "Error message");
      const errorId = useNotificationStore.getState().current?.id;

      vi.clearAllMocks();

      // Fast-forward past error auto-hide timeout (8000ms) + animation (300ms)
      vi.advanceTimersByTime(8300);

      expect(emitSignal).toHaveBeenCalledWith(
        APP_SIGNALS.NOTIFICATION_HIDDEN,
        { id: errorId }
      );
    });

    it("should emit NOTIFICATION_HIDDEN when queued notification auto-hides", () => {
      // Show first notification
      useNotificationStore.getState().notify("info", "First message");
      const firstId = useNotificationStore.getState().current?.id;

      // Queue second notification
      useNotificationStore.getState().notify("info", "Second message");

      vi.clearAllMocks();

      // Fast-forward past extended auto-hide timeout + animation
      // When a notification is queued, the timer resets, so it's 4000ms from the queue time + 300ms
      vi.advanceTimersByTime(4300);

      expect(emitSignal).toHaveBeenCalledWith(
        APP_SIGNALS.NOTIFICATION_HIDDEN,
        { id: firstId }
      );
    });
  });

  describe("Signal emission order", () => {
    it("should emit NOTIFICATION_SHOWING before NOTIFICATION_HIDDEN for same notification", () => {
      const emitOrder: string[] = [];
      vi.mocked(emitSignal).mockImplementation((signal) => {
        emitOrder.push(signal);
        return Promise.resolve();
      });

      useNotificationStore.getState().notify("success", "Test message");

      // Fast-forward past auto-hide timeout (3000ms for success) + animation (300ms)
      vi.advanceTimersByTime(3300);

      expect(emitOrder).toEqual([
        APP_SIGNALS.NOTIFICATION_SHOWING,
        APP_SIGNALS.NOTIFICATION_HIDDEN,
      ]);
    });
  });
});
