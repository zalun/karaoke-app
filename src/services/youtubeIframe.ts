/**
 * YouTube IFrame API loader service
 * Handles dynamic loading of the YouTube IFrame Player API
 */

import { createLogger } from "./logger";

const log = createLogger("YouTubeIframe");

// Singleton promise for API loading
let apiLoadPromise: Promise<typeof YT> | null = null;

/**
 * Load the YouTube IFrame API dynamically.
 * Returns a promise that resolves with the YT namespace when ready.
 * Uses singleton pattern - only loads the API once.
 */
export function loadYouTubeAPI(): Promise<typeof YT> {
  if (apiLoadPromise) {
    return apiLoadPromise;
  }

  apiLoadPromise = new Promise<typeof YT>((resolve, reject) => {
    // Check if API is already loaded
    if (window.YT?.Player) {
      log.debug("YouTube API already loaded");
      resolve(window.YT);
      return;
    }

    // Track timeout for cleanup
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let settled = false;

    // Set up the callback before loading the script
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      log.info("YouTube IFrame API ready");
      // Clear timeout since API loaded successfully
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      // Call any previous callback (unlikely but safe)
      if (previousCallback) {
        previousCallback();
      }
      if (!settled) {
        settled = true;
        if (window.YT) {
          resolve(window.YT);
        } else {
          reject(new Error("YouTube API loaded but YT is undefined"));
        }
      }
    };

    // Load the API script
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      log.error("Failed to load YouTube IFrame API script");
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (!settled) {
        settled = true;
        apiLoadPromise = null; // Allow retry
        reject(new Error("Failed to load YouTube IFrame API"));
      }
    };

    log.debug("Loading YouTube IFrame API script");
    document.body.appendChild(script);

    // Timeout after 10 seconds
    timeoutId = setTimeout(() => {
      if (!settled && !window.YT?.Player) {
        settled = true;
        log.error("YouTube IFrame API load timeout");
        apiLoadPromise = null; // Allow retry
        reject(new Error("YouTube IFrame API load timeout"));
      }
    }, 10000);
  });

  return apiLoadPromise;
}

/**
 * Check if the YouTube API is already loaded and ready
 */
export function isYouTubeAPIReady(): boolean {
  return !!window.YT?.Player;
}

/**
 * YouTube player state constants for easier access
 */
export const YouTubePlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

/**
 * YouTube error codes with descriptions
 */
export const YouTubeErrorCodes: Record<number, string> = {
  2: "Invalid video ID parameter",
  5: "HTML5 player error - video cannot be played",
  100: "Video not found or has been removed",
  101: "Video owner does not allow embedding",
  150: "Video owner does not allow embedding (same as 101)",
};

/**
 * Get a human-readable error message for a YouTube error code
 */
export function getYouTubeErrorMessage(errorCode: number): string {
  return YouTubeErrorCodes[errorCode] || `Unknown error (code ${errorCode})`;
}

/**
 * Configuration for autoplay retry behavior
 */
export interface AutoplayRetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  onRetry?: (attempt: number, delay: number) => void;
  onMaxRetriesExceeded?: () => void;
}

/**
 * Creates an autoplay retry handler for YouTube player.
 * Manages retry attempts with exponential backoff.
 */
export function createAutoplayRetryHandler(config: AutoplayRetryConfig) {
  let retryCount = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return {
    /**
     * Attempt to retry playback. Returns true if retry was scheduled, false if max retries exceeded.
     */
    scheduleRetry(playCallback: () => void): boolean {
      retryCount++;

      if (retryCount > config.maxRetries) {
        config.onMaxRetriesExceeded?.();
        return false;
      }

      const delay = retryCount * config.baseDelayMs;
      config.onRetry?.(retryCount, delay);

      timeoutId = setTimeout(() => {
        playCallback();
      }, delay);

      return true;
    },

    /**
     * Reset retry count (call when playback succeeds)
     */
    reset() {
      retryCount = 0;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },

    /**
     * Get current retry count
     */
    getRetryCount(): number {
      return retryCount;
    },

    /**
     * Check if max retries exceeded
     */
    isExhausted(): boolean {
      return retryCount > config.maxRetries;
    },

    /**
     * Cleanup pending timeouts
     */
    cleanup() {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
}
