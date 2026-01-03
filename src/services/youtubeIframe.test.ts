import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAutoplayRetryHandler } from "./youtubeIframe";

describe("createAutoplayRetryHandler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules retry with increasing delay", () => {
    const onRetry = vi.fn();
    const handler = createAutoplayRetryHandler({
      maxRetries: 3,
      baseDelayMs: 100,
      onRetry,
    });

    const playCallback = vi.fn();

    // First retry
    const scheduled1 = handler.scheduleRetry(playCallback);
    expect(scheduled1).toBe(true);
    expect(onRetry).toHaveBeenCalledWith(1, 100);

    vi.advanceTimersByTime(100);
    expect(playCallback).toHaveBeenCalledTimes(1);

    // Second retry
    const scheduled2 = handler.scheduleRetry(playCallback);
    expect(scheduled2).toBe(true);
    expect(onRetry).toHaveBeenCalledWith(2, 200);

    vi.advanceTimersByTime(200);
    expect(playCallback).toHaveBeenCalledTimes(2);
  });

  it("calls onMaxRetriesExceeded when max retries exceeded", () => {
    const onMaxRetriesExceeded = vi.fn();
    const handler = createAutoplayRetryHandler({
      maxRetries: 2,
      baseDelayMs: 100,
      onMaxRetriesExceeded,
    });

    const playCallback = vi.fn();

    // Use up all retries
    handler.scheduleRetry(playCallback);
    vi.advanceTimersByTime(100);

    handler.scheduleRetry(playCallback);
    vi.advanceTimersByTime(200);

    // Third attempt should fail
    const scheduled = handler.scheduleRetry(playCallback);
    expect(scheduled).toBe(false);
    expect(onMaxRetriesExceeded).toHaveBeenCalled();
  });

  it("resets retry count correctly", () => {
    const onRetry = vi.fn();
    const handler = createAutoplayRetryHandler({
      maxRetries: 2,
      baseDelayMs: 100,
      onRetry,
    });

    const playCallback = vi.fn();

    // Use up one retry
    handler.scheduleRetry(playCallback);
    expect(handler.getRetryCount()).toBe(1);

    // Reset
    handler.reset();
    expect(handler.getRetryCount()).toBe(0);

    // Should be able to retry again from 1
    handler.scheduleRetry(playCallback);
    expect(handler.getRetryCount()).toBe(1);
    expect(onRetry).toHaveBeenLastCalledWith(1, 100);
  });

  it("clears pending timeout on cleanup", () => {
    const handler = createAutoplayRetryHandler({
      maxRetries: 3,
      baseDelayMs: 100,
    });

    const playCallback = vi.fn();

    handler.scheduleRetry(playCallback);
    handler.cleanup();

    vi.advanceTimersByTime(100);
    expect(playCallback).not.toHaveBeenCalled();
  });

  it("clears pending timeout on reset", () => {
    const handler = createAutoplayRetryHandler({
      maxRetries: 3,
      baseDelayMs: 100,
    });

    const playCallback = vi.fn();

    handler.scheduleRetry(playCallback);
    handler.reset();

    vi.advanceTimersByTime(100);
    expect(playCallback).not.toHaveBeenCalled();
  });

  it("reports exhausted status correctly", () => {
    const handler = createAutoplayRetryHandler({
      maxRetries: 1,
      baseDelayMs: 100,
    });

    expect(handler.isExhausted()).toBe(false);

    handler.scheduleRetry(vi.fn());
    expect(handler.isExhausted()).toBe(false);

    handler.scheduleRetry(vi.fn()); // Exceeds max
    expect(handler.isExhausted()).toBe(true);
  });
});
