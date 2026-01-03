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

    // Set up the callback before loading the script
    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      log.info("YouTube IFrame API ready");
      // Call any previous callback (unlikely but safe)
      if (previousCallback) {
        previousCallback();
      }
      if (window.YT) {
        resolve(window.YT);
      } else {
        reject(new Error("YouTube API loaded but YT is undefined"));
      }
    };

    // Load the API script
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      log.error("Failed to load YouTube IFrame API script");
      apiLoadPromise = null; // Allow retry
      reject(new Error("Failed to load YouTube IFrame API"));
    };

    log.debug("Loading YouTube IFrame API script");
    document.body.appendChild(script);

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!window.YT?.Player) {
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
