import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock Tauri event API
const mockEmit = vi.fn();
const mockListen = vi.fn();

vi.mock("@tauri-apps/api/event", () => ({
  emit: (...args: unknown[]) => mockEmit(...args),
  listen: (...args: unknown[]) => mockListen(...args),
}));

// Mock logger
vi.mock("./logger", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Import after mocking
import {
  APP_SIGNALS,
  emitSignal,
  listenForSignal,
  waitForSignal,
  waitForSignalOrCondition,
} from "./appSignals";

describe("APP_SIGNALS", () => {
  it("should have USER_LOGGED_IN defined correctly", () => {
    expect(APP_SIGNALS.USER_LOGGED_IN).toBe("app:user-logged-in");
  });

  it("should have USER_LOGGED_OUT defined correctly", () => {
    expect(APP_SIGNALS.USER_LOGGED_OUT).toBe("app:user-logged-out");
  });

  it("should have all expected signal names", () => {
    expect(APP_SIGNALS.SONG_STARTED).toBe("app:song-started");
    expect(APP_SIGNALS.SONG_STOPPED).toBe("app:song-stopped");
    expect(APP_SIGNALS.SONG_ENDED).toBe("app:song-ended");
    expect(APP_SIGNALS.QUEUE_ITEM_ADDED).toBe("app:queue-item-added");
    expect(APP_SIGNALS.QUEUE_ITEM_REMOVED).toBe("app:queue-item-removed");
    expect(APP_SIGNALS.SESSION_STARTED).toBe("app:session-started");
    expect(APP_SIGNALS.SESSION_ENDED).toBe("app:session-ended");
    expect(APP_SIGNALS.SESSION_LOADED).toBe("app:session-loaded");
    expect(APP_SIGNALS.SINGERS_LOADED).toBe("app:singers-loaded");
    expect(APP_SIGNALS.QUEUE_LOADED).toBe("app:queue-loaded");
    expect(APP_SIGNALS.HOSTING_STARTED).toBe("app:hosting-started");
    expect(APP_SIGNALS.HOSTING_STOPPED).toBe("app:hosting-stopped");
    expect(APP_SIGNALS.AUTH_INITIALIZED).toBe("app:auth-initialized");
    expect(APP_SIGNALS.TOKENS_REFRESHED).toBe("app:tokens-refreshed");
    expect(APP_SIGNALS.HOSTED_SESSION_UPDATED).toBe("app:hosted-session-updated");
    expect(APP_SIGNALS.PLAYBACK_STARTED).toBe("app:playback-started");
    expect(APP_SIGNALS.PLAYBACK_PAUSED).toBe("app:playback-paused");
    expect(APP_SIGNALS.PLAYBACK_ENDED).toBe("app:playback-ended");
    expect(APP_SIGNALS.VIDEO_METADATA_CHANGED).toBe("app:video-metadata-changed");
    expect(APP_SIGNALS.QUEUE_ORDER_CHANGED).toBe("app:queue-order-changed");
    expect(APP_SIGNALS.NEXT_SONG_CHANGED).toBe("app:next-song-changed");
    expect(APP_SIGNALS.QUEUE_OPERATION_FAILED).toBe("app:queue-operation-failed");
    expect(APP_SIGNALS.HOSTING_ERROR).toBe("app:hosting-error");
    expect(APP_SIGNALS.MIGRATION_COMPLETE).toBe("app:migration-complete");
    expect(APP_SIGNALS.YTDLP_AVAILABLE).toBe("app:ytdlp-available");
    expect(APP_SIGNALS.YTDLP_UNAVAILABLE).toBe("app:ytdlp-unavailable");
    expect(APP_SIGNALS.FILE_AVAILABILITY_CHECKED).toBe("app:file-availability-checked");
  });
});

describe("emitSignal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should emit event with correct name and payload", async () => {
    mockEmit.mockResolvedValue(undefined);
    const mockUser = { id: "user-123", email: "test@example.com" };

    await emitSignal(APP_SIGNALS.USER_LOGGED_IN, mockUser as never);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith(
      "app:user-logged-in",
      mockUser
    );
  });

  it("should emit event with undefined payload", async () => {
    mockEmit.mockResolvedValue(undefined);

    await emitSignal(APP_SIGNALS.USER_LOGGED_OUT, undefined);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith("app:user-logged-out", undefined);
  });

  it("should handle errors gracefully without throwing", async () => {
    mockEmit.mockRejectedValue(new Error("Emit failed"));

    // Should not throw
    await expect(
      emitSignal(APP_SIGNALS.USER_LOGGED_IN, { id: "test" } as never)
    ).resolves.toBeUndefined();

    expect(mockEmit).toHaveBeenCalledTimes(1);
  });

  it("should emit QUEUE_OPERATION_FAILED with operation type and message", async () => {
    mockEmit.mockResolvedValue(undefined);
    const payload = {
      operation: "moveAllHistoryToQueue" as const,
      message: "Database error occurred",
    };

    await emitSignal(APP_SIGNALS.QUEUE_OPERATION_FAILED, payload);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith(
      "app:queue-operation-failed",
      payload
    );
  });

  it("should emit HOSTING_ERROR with operation type and message", async () => {
    mockEmit.mockResolvedValue(undefined);
    const payload = {
      operation: "hostSession" as const,
      message: "Not authenticated",
    };

    await emitSignal(APP_SIGNALS.HOSTING_ERROR, payload);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith(
      "app:hosting-error",
      payload
    );
  });

  it("should emit MIGRATION_COMPLETE with undefined payload", async () => {
    mockEmit.mockResolvedValue(undefined);

    await emitSignal(APP_SIGNALS.MIGRATION_COMPLETE, undefined);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith("app:migration-complete", undefined);
  });

  it("should emit YTDLP_AVAILABLE with undefined payload", async () => {
    mockEmit.mockResolvedValue(undefined);

    await emitSignal(APP_SIGNALS.YTDLP_AVAILABLE, undefined);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith("app:ytdlp-available", undefined);
  });

  it("should emit YTDLP_UNAVAILABLE with undefined payload", async () => {
    mockEmit.mockResolvedValue(undefined);

    await emitSignal(APP_SIGNALS.YTDLP_UNAVAILABLE, undefined);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith("app:ytdlp-unavailable", undefined);
  });

  it("should emit FILE_AVAILABILITY_CHECKED with file path and availability status", async () => {
    mockEmit.mockResolvedValue(undefined);
    const payload = {
      filePath: "/path/to/song.mp4",
      available: true,
    };

    await emitSignal(APP_SIGNALS.FILE_AVAILABILITY_CHECKED, payload);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith(
      "app:file-availability-checked",
      payload
    );
  });

  it("should emit FILE_AVAILABILITY_CHECKED with unavailable status", async () => {
    mockEmit.mockResolvedValue(undefined);
    const payload = {
      filePath: "/path/to/missing.mp4",
      available: false,
    };

    await emitSignal(APP_SIGNALS.FILE_AVAILABILITY_CHECKED, payload);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit).toHaveBeenCalledWith(
      "app:file-availability-checked",
      payload
    );
  });
});

describe("listenForSignal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should register listener and call callback with payload", async () => {
    const mockUnlisten = vi.fn();
    let capturedCallback: ((event: { payload: unknown }) => void) | null = null;

    mockListen.mockImplementation(
      (
        _signal: string,
        callback: (event: { payload: unknown }) => void
      ) => {
        capturedCallback = callback;
        return Promise.resolve(mockUnlisten);
      }
    );

    const callback = vi.fn();
    await listenForSignal(APP_SIGNALS.USER_LOGGED_IN, callback);

    expect(mockListen).toHaveBeenCalledTimes(1);
    expect(mockListen).toHaveBeenCalledWith(
      "app:user-logged-in",
      expect.any(Function)
    );

    // Simulate signal received
    const mockPayload = { id: "user-456", email: "test@example.com" };
    capturedCallback!({ payload: mockPayload });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(mockPayload);
  });

  it("should return unlisten function that works", async () => {
    const mockUnlisten = vi.fn();
    mockListen.mockResolvedValue(mockUnlisten);

    const unlisten = await listenForSignal(APP_SIGNALS.USER_LOGGED_OUT, vi.fn());

    expect(typeof unlisten).toBe("function");

    unlisten();

    expect(mockUnlisten).toHaveBeenCalledTimes(1);
  });
});

describe("waitForSignal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should resolve when signal is received", async () => {
    const mockUnlisten = vi.fn();
    let capturedCallback: ((event: { payload: unknown }) => void) | null = null;

    mockListen.mockImplementation(
      (
        _signal: string,
        callback: (event: { payload: unknown }) => void
      ) => {
        capturedCallback = callback;
        return Promise.resolve(mockUnlisten);
      }
    );

    const mockPayload = { id: "user-789", email: "wait@example.com" };
    const promise = waitForSignal(APP_SIGNALS.USER_LOGGED_IN);

    // Allow listen setup to complete
    await vi.advanceTimersByTimeAsync(0);

    // Simulate signal received
    capturedCallback!({ payload: mockPayload });

    const result = await promise;
    expect(result).toEqual(mockPayload);
    expect(mockUnlisten).toHaveBeenCalled();
  });

  it("should reject with timeout error after timeout", async () => {
    const mockUnlisten = vi.fn();
    mockListen.mockResolvedValue(mockUnlisten);

    const promise = waitForSignal(APP_SIGNALS.USER_LOGGED_IN, 1000);

    // Allow listen setup to complete
    await vi.advanceTimersByTimeAsync(0);

    // Advance past timeout - await the rejection in same tick
    vi.advanceTimersByTime(1001);

    await expect(promise).rejects.toThrow(
      "Timeout waiting for signal: app:user-logged-in"
    );
    expect(mockUnlisten).toHaveBeenCalled();
  });

  it("should use default timeout of 5000ms", async () => {
    const mockUnlisten = vi.fn();
    mockListen.mockResolvedValue(mockUnlisten);

    const promise = waitForSignal(APP_SIGNALS.USER_LOGGED_IN);

    // Allow listen setup to complete
    await vi.advanceTimersByTimeAsync(0);

    // At 4999ms should not have timed out yet
    vi.advanceTimersByTime(4999);
    expect(mockUnlisten).not.toHaveBeenCalled();

    // At 5001ms should timeout - use sync to catch rejection in same tick
    vi.advanceTimersByTime(2);

    await expect(promise).rejects.toThrow("Timeout waiting for signal");
  });

  it("should reject if listen fails", async () => {
    mockListen.mockRejectedValue(new Error("Listen failed"));

    // Catch the rejection immediately
    await expect(waitForSignal(APP_SIGNALS.USER_LOGGED_IN)).rejects.toThrow(
      "Listen failed"
    );
  });
});

describe("waitForSignalOrCondition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should resolve immediately if condition is already met", async () => {
    const mockUser = { id: "existing-user", email: "existing@example.com" };
    const checkCondition = vi.fn().mockReturnValue(mockUser);

    const result = await waitForSignalOrCondition(
      APP_SIGNALS.USER_LOGGED_IN,
      checkCondition
    );

    expect(result).toEqual(mockUser);
    expect(checkCondition).toHaveBeenCalledTimes(1);
    // Should not set up listener if condition is met
    expect(mockListen).not.toHaveBeenCalled();
  });

  it("should wait for signal if condition returns null", async () => {
    const mockUnlisten = vi.fn();
    let capturedCallback: ((event: { payload: unknown }) => void) | null = null;

    mockListen.mockImplementation(
      (
        _signal: string,
        callback: (event: { payload: unknown }) => void
      ) => {
        capturedCallback = callback;
        return Promise.resolve(mockUnlisten);
      }
    );

    const checkCondition = vi.fn().mockReturnValue(null);
    const mockPayload = { id: "signal-user", email: "signal@example.com" };

    const promise = waitForSignalOrCondition(
      APP_SIGNALS.USER_LOGGED_IN,
      checkCondition
    );

    // Allow listen setup to complete
    await vi.advanceTimersByTimeAsync(0);

    expect(mockListen).toHaveBeenCalled();

    // Simulate signal received
    capturedCallback!({ payload: mockPayload });

    const result = await promise;
    expect(result).toEqual(mockPayload);
  });

  it("should wait for signal if condition returns undefined", async () => {
    const mockUnlisten = vi.fn();
    let capturedCallback: ((event: { payload: unknown }) => void) | null = null;

    mockListen.mockImplementation(
      (
        _signal: string,
        callback: (event: { payload: unknown }) => void
      ) => {
        capturedCallback = callback;
        return Promise.resolve(mockUnlisten);
      }
    );

    const checkCondition = vi.fn().mockReturnValue(undefined);
    const mockPayload = { id: "signal-user-2" };

    const promise = waitForSignalOrCondition(
      APP_SIGNALS.USER_LOGGED_IN,
      checkCondition
    );

    // Allow listen setup to complete
    await vi.advanceTimersByTimeAsync(0);

    expect(mockListen).toHaveBeenCalled();

    // Simulate signal received
    capturedCallback!({ payload: mockPayload });

    const result = await promise;
    expect(result).toEqual(mockPayload);
  });

  it("should reject on timeout if condition stays false and no signal", async () => {
    const mockUnlisten = vi.fn();
    mockListen.mockResolvedValue(mockUnlisten);

    const checkCondition = vi.fn().mockReturnValue(null);

    const promise = waitForSignalOrCondition(
      APP_SIGNALS.USER_LOGGED_IN,
      checkCondition,
      2000
    );

    // Allow listen setup to complete
    await vi.advanceTimersByTimeAsync(0);

    // Advance past timeout - use sync to catch rejection in same tick
    vi.advanceTimersByTime(2001);

    await expect(promise).rejects.toThrow("Timeout waiting for signal");
  });

  it("should use custom timeout value", async () => {
    const mockUnlisten = vi.fn();
    mockListen.mockResolvedValue(mockUnlisten);

    const checkCondition = vi.fn().mockReturnValue(null);

    const promise = waitForSignalOrCondition(
      APP_SIGNALS.USER_LOGGED_IN,
      checkCondition,
      500
    );

    // Allow listen setup to complete
    await vi.advanceTimersByTimeAsync(0);

    // At 499ms should not have timed out
    vi.advanceTimersByTime(499);
    expect(mockUnlisten).not.toHaveBeenCalled();

    // At 501ms should timeout - use sync to catch rejection in same tick
    vi.advanceTimersByTime(2);

    await expect(promise).rejects.toThrow("Timeout waiting for signal");
  });
});
