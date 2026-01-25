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
import type { SessionStats } from "./hostedSession";

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
  /** Emitted after loadSession() completes all initialization */
  SESSION_LOADED: "app:session-loaded",
  /** Emitted after loadSingers() completes */
  SINGERS_LOADED: "app:singers-loaded",
  /** Emitted after loadPersistedState() completes in queueStore */
  QUEUE_LOADED: "app:queue-loaded",
  /** Emitted when hosting a session starts */
  HOSTING_STARTED: "app:hosting-started",
  /** Emitted when hosting a session stops */
  HOSTING_STOPPED: "app:hosting-stopped",
  /** Emitted after auth initialization completes (regardless of auth state) */
  AUTH_INITIALIZED: "app:auth-initialized",
  /** Emitted after successful token refresh in refreshSession() */
  TOKENS_REFRESHED: "app:tokens-refreshed",
  /** Emitted after refreshHostedSession() successfully updates stats */
  HOSTED_SESSION_UPDATED: "app:hosted-session-updated",
  /** Emitted when video playback starts (lower-level than SONG_STARTED) */
  PLAYBACK_STARTED: "app:playback-started",
  /** Emitted when video playback is paused */
  PLAYBACK_PAUSED: "app:playback-paused",
  /** Emitted when video playback ends (lower-level than SONG_ENDED) */
  PLAYBACK_ENDED: "app:playback-ended",
  /** Emitted when video metadata changes (new video loaded) */
  VIDEO_METADATA_CHANGED: "app:video-metadata-changed",
  /** Emitted when queue order changes (reorder, shuffle, etc.) */
  QUEUE_ORDER_CHANGED: "app:queue-order-changed",
  /** Emitted when the first pending item in queue changes */
  NEXT_SONG_CHANGED: "app:next-song-changed",
  /** Emitted when a critical queue operation fails */
  QUEUE_OPERATION_FAILED: "app:queue-operation-failed",
  /** Emitted when a hosting operation fails */
  HOSTING_ERROR: "app:hosting-error",
  /** Emitted after legacy hosted session migration completes (success or failure) */
  MIGRATION_COMPLETE: "app:migration-complete",
  /** Emitted when yt-dlp is confirmed available on the system */
  YTDLP_AVAILABLE: "app:ytdlp-available",
  /** Emitted when yt-dlp is confirmed unavailable on the system */
  YTDLP_UNAVAILABLE: "app:ytdlp-unavailable",
  /** Emitted when file availability is checked for a local library file */
  FILE_AVAILABILITY_CHECKED: "app:file-availability-checked",
  /** Emitted before layout restoration begins in displayStore */
  LAYOUT_RESTORE_STARTED: "app:layout-restore-started",
  /** Emitted after layout restoration completes in displayStore */
  LAYOUT_RESTORE_COMPLETE: "app:layout-restore-complete",
  /** Emitted after player window is detached successfully */
  PLAYER_DETACHED: "app:player-detached",
  /** Emitted after player window is reattached successfully */
  PLAYER_REATTACHED: "app:player-reattached",
  /** Emitted when the active singer changes in sessionStore.setActiveSinger() */
  ACTIVE_SINGER_CHANGED: "app:active-singer-changed",
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
  [APP_SIGNALS.SESSION_LOADED]: undefined;
  [APP_SIGNALS.SINGERS_LOADED]: undefined;
  [APP_SIGNALS.QUEUE_LOADED]: undefined;
  [APP_SIGNALS.HOSTING_STARTED]: undefined;
  [APP_SIGNALS.HOSTING_STOPPED]: undefined;
  /** Payload is boolean indicating whether user is authenticated */
  [APP_SIGNALS.AUTH_INITIALIZED]: boolean;
  /** No payload - just signals that tokens were refreshed successfully */
  [APP_SIGNALS.TOKENS_REFRESHED]: undefined;
  /** Payload is the updated session stats */
  [APP_SIGNALS.HOSTED_SESSION_UPDATED]: SessionStats;
  /** No payload - signals video playback has started */
  [APP_SIGNALS.PLAYBACK_STARTED]: undefined;
  /** No payload - signals video playback has been paused */
  [APP_SIGNALS.PLAYBACK_PAUSED]: undefined;
  /** No payload - signals video playback has ended */
  [APP_SIGNALS.PLAYBACK_ENDED]: undefined;
  /** Payload contains video metadata (title, artist, duration) */
  [APP_SIGNALS.VIDEO_METADATA_CHANGED]: VideoMetadata;
  /** No payload - signals queue order has changed */
  [APP_SIGNALS.QUEUE_ORDER_CHANGED]: undefined;
  /** Payload contains the new next song ID, or null if queue is empty */
  [APP_SIGNALS.NEXT_SONG_CHANGED]: NextSongPayload;
  /** Payload contains operation type and error message for failed queue operations */
  [APP_SIGNALS.QUEUE_OPERATION_FAILED]: QueueOperationFailedPayload;
  /** Payload contains operation type and error message for failed hosting operations */
  [APP_SIGNALS.HOSTING_ERROR]: HostingErrorPayload;
  /** No payload - signals that legacy migration has been attempted (success or failure) */
  [APP_SIGNALS.MIGRATION_COMPLETE]: undefined;
  /** No payload - signals that yt-dlp is available on the system */
  [APP_SIGNALS.YTDLP_AVAILABLE]: undefined;
  /** No payload - signals that yt-dlp is unavailable on the system */
  [APP_SIGNALS.YTDLP_UNAVAILABLE]: undefined;
  /** Payload contains file path and availability status */
  [APP_SIGNALS.FILE_AVAILABILITY_CHECKED]: FileAvailabilityPayload;
  /** No payload - signals that layout restoration is starting */
  [APP_SIGNALS.LAYOUT_RESTORE_STARTED]: undefined;
  /** No payload - signals that layout restoration has completed */
  [APP_SIGNALS.LAYOUT_RESTORE_COMPLETE]: undefined;
  /** No payload - signals that player window was detached */
  [APP_SIGNALS.PLAYER_DETACHED]: undefined;
  /** No payload - signals that player window was reattached */
  [APP_SIGNALS.PLAYER_REATTACHED]: undefined;
  /** Payload is the singer ID (number) or null when active singer is cleared */
  [APP_SIGNALS.ACTIVE_SINGER_CHANGED]: number | null;
}

/** Video metadata payload for VIDEO_METADATA_CHANGED signal */
export interface VideoMetadata {
  /** Video title */
  title: string;
  /** Artist name, if available */
  artist?: string;
  /** Video duration in seconds, if available */
  duration?: number;
  /** Video ID for deduplication (prevents emitting for same video) */
  videoId: string;
}

/** Payload for NEXT_SONG_CHANGED signal */
export interface NextSongPayload {
  /** The queue item ID of the next song, or null if queue is empty */
  nextItemId: string | null;
  /** The video ID of the next song, or null if queue is empty */
  nextVideoId: string | null;
}

/** Payload for QUEUE_OPERATION_FAILED signal */
export interface QueueOperationFailedPayload {
  /** The type of operation that failed */
  operation: "moveAllHistoryToQueue" | "addToQueue" | "removeFromQueue" | "reorderQueue" | "clearQueue" | "fairShuffle";
  /** Human-readable error message */
  message: string;
}

/** Payload for HOSTING_ERROR signal */
export interface HostingErrorPayload {
  /** The type of hosting operation that failed */
  operation: "hostSession" | "stopHosting" | "refreshHostedSession" | "restoreHostedSession";
  /** Human-readable error message */
  message: string;
}

/** Payload for FILE_AVAILABILITY_CHECKED signal */
export interface FileAvailabilityPayload {
  /** The file path that was checked */
  filePath: string;
  /** Whether the file is available */
  available: boolean;
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
