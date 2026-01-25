/**
 * App-wide signal system for cross-store coordination.
 *
 * Follows the PLAYER_EVENTS pattern from windowManager.ts but designed
 * for app lifecycle events. Solves race conditions where components
 * need to wait for async operations to complete before proceeding.
 *
 * Example: restoreHostedSession() needs to wait for fetchUserProfile()
 * to complete before checking user ownership.
 */

import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createLogger } from "./logger";
import type { User } from "./auth";

const log = createLogger("AppSignals");

/**
 * App-wide signal names following the pattern from windowManager.ts PLAYER_EVENTS.
 * These signals coordinate async operations across different stores and components.
 */
export const APP_SIGNALS = {
  /** Emitted after fetchUserProfile() completes successfully */
  USER_LOGGED_IN: "app:user-logged-in",
  /** Emitted after signOut() clears auth state */
  USER_LOGGED_OUT: "app:user-logged-out",
  /** Emitted when a song starts playing */
  SONG_STARTED: "app:song-started",
  /** Emitted when a song is manually stopped */
  SONG_STOPPED: "app:song-stopped",
  /** Emitted when a song ends naturally */
  SONG_ENDED: "app:song-ended",
  /** Emitted when a queue item is added */
  QUEUE_ITEM_ADDED: "app:queue-item-added",
  /** Emitted when a queue item is removed */
  QUEUE_ITEM_REMOVED: "app:queue-item-removed",
  /** Emitted when a session starts */
  SESSION_STARTED: "app:session-started",
  /** Emitted when a session ends */
  SESSION_ENDED: "app:session-ended",
  /** Emitted when hosting a session starts */
  HOSTING_STARTED: "app:hosting-started",
  /** Emitted when hosting a session stops */
  HOSTING_STOPPED: "app:hosting-stopped",
} as const;

/** Type for signal names */
export type AppSignalName = (typeof APP_SIGNALS)[keyof typeof APP_SIGNALS];

/**
 * Payload types for each signal.
 * Maps signal names to their expected payload types.
 */
export interface SignalPayloads {
  [APP_SIGNALS.USER_LOGGED_IN]: User;
  [APP_SIGNALS.USER_LOGGED_OUT]: undefined;
  [APP_SIGNALS.SONG_STARTED]: undefined;
  [APP_SIGNALS.SONG_STOPPED]: undefined;
  [APP_SIGNALS.SONG_ENDED]: undefined;
  [APP_SIGNALS.QUEUE_ITEM_ADDED]: undefined;
  [APP_SIGNALS.QUEUE_ITEM_REMOVED]: undefined;
  [APP_SIGNALS.SESSION_STARTED]: undefined;
  [APP_SIGNALS.SESSION_ENDED]: undefined;
  [APP_SIGNALS.HOSTING_STARTED]: undefined;
  [APP_SIGNALS.HOSTING_STOPPED]: undefined;
}

/**
 * Emit a signal with an optional payload.
 * Fire-and-forget with error handling - errors are logged but not thrown.
 *
 * @param signal - The signal name from APP_SIGNALS
 * @param payload - The payload to send with the signal
 */
export async function emitSignal<T extends AppSignalName>(
  signal: T,
  payload: SignalPayloads[T]
): Promise<void> {
  try {
    log.debug(`Emitting signal: ${signal}`);
    await emit(signal, payload);
  } catch (error) {
    log.error(`Failed to emit signal ${signal}:`, error);
    // Fire-and-forget - don't rethrow
  }
}

/**
 * Listen for a signal and call the callback when it's received.
 * Returns an unlisten function for cleanup.
 *
 * @param signal - The signal name from APP_SIGNALS
 * @param callback - Function to call when signal is received
 * @returns UnlistenFn to stop listening
 */
export async function listenForSignal<T extends AppSignalName>(
  signal: T,
  callback: (payload: SignalPayloads[T]) => void
): Promise<UnlistenFn> {
  return listen<SignalPayloads[T]>(signal, (event) => {
    log.debug(`Received signal: ${signal}`);
    callback(event.payload);
  });
}

/**
 * Wait for a signal to be emitted, with a configurable timeout.
 * Resolves with the signal payload when received, rejects on timeout.
 *
 * @param signal - The signal name from APP_SIGNALS
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 5000)
 * @returns Promise that resolves with the signal payload
 * @throws Error if timeout is reached before signal is received
 */
export async function waitForSignal<T extends AppSignalName>(
  signal: T,
  timeoutMs: number = 5000
): Promise<SignalPayloads[T]> {
  return new Promise<SignalPayloads[T]>((resolve, reject) => {
    let unlisten: UnlistenFn | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (unlisten) {
        unlisten();
        unlisten = null;
      }
    };

    // Set up timeout
    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for signal: ${signal}`));
    }, timeoutMs);

    // Set up listener
    listen<SignalPayloads[T]>(signal, (event) => {
      log.debug(`waitForSignal: received ${signal}`);
      cleanup();
      resolve(event.payload);
    })
      .then((unlistenFn) => {
        unlisten = unlistenFn;
      })
      .catch((error) => {
        cleanup();
        reject(error);
      });
  });
}

/**
 * Wait for a signal OR return immediately if a condition is already met.
 * This is the key function for solving race conditions - it checks the
 * current state first before waiting for a signal.
 *
 * @param signal - The signal name from APP_SIGNALS
 * @param checkCondition - Function that returns the current value if available, or null/undefined if not
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 5000)
 * @returns Promise that resolves with either the condition result or signal payload
 * @throws Error if timeout is reached and condition is still not met
 */
export async function waitForSignalOrCondition<T extends AppSignalName>(
  signal: T,
  checkCondition: () => SignalPayloads[T] | null | undefined,
  timeoutMs: number = 5000
): Promise<SignalPayloads[T]> {
  // Check condition first - avoid race by checking before setting up listener
  const currentValue = checkCondition();
  if (currentValue !== null && currentValue !== undefined) {
    log.debug(`waitForSignalOrCondition: condition already met for ${signal}`);
    return currentValue;
  }

  // Condition not met, wait for signal
  log.debug(`waitForSignalOrCondition: waiting for ${signal}`);
  return waitForSignal(signal, timeoutMs);
}
