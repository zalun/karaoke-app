import { useEffect, useCallback, useRef } from "react";
import { usePlayerStore, useQueueStore, playVideo } from "../stores";
import { createLogger } from "../services";

const log = createLogger("useKeyboardShortcuts");

// Volume change increment (10%)
const VOLUME_INCREMENT = 0.1;

// Seek increment in seconds
const SEEK_INCREMENT = 10;

/**
 * Check if the keyboard event target is an input element
 * (shortcuts should be inactive when focus is on text input)
 */
function isInputElement(element: EventTarget | null): boolean {
  if (!element || !(element instanceof Element)) return false;
  const tagName = element.tagName?.toLowerCase();
  if (!tagName) return false;
  if (tagName === "input" || tagName === "textarea") return true;
  // Check for contenteditable
  if (element.getAttribute("contenteditable") === "true") return true;
  return false;
}

export interface KeyboardShortcutsOptions {
  /**
   * Enable video window specific shortcuts (F, ESC, Left/Right)
   */
  enableVideoShortcuts?: boolean;
  /**
   * Callback when fullscreen should be toggled (video window only)
   */
  onToggleFullscreen?: () => void;
  /**
   * Callback when search should be focused (Cmd+F or /)
   * Main window only
   */
  onFocusSearch?: () => void;
}

/**
 * Hook to handle keyboard shortcuts for the player.
 *
 * Global shortcuts (both windows):
 * - Space: Play/pause
 * - M: Mute/unmute
 * - Up/Down: Volume +/-10%
 * - N: Next video
 *
 * Video window shortcuts (when enableVideoShortcuts is true):
 * - F: Toggle fullscreen
 * - ESC: Exit fullscreen
 * - Left/Right: Seek +/-10s
 *
 * Management window shortcuts:
 * - Cmd+F or /: Focus on search
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const { enableVideoShortcuts = false, onToggleFullscreen, onFocusSearch } = options;

  // Keep refs to latest callbacks to avoid stale closures
  const onToggleFullscreenRef = useRef(onToggleFullscreen);
  onToggleFullscreenRef.current = onToggleFullscreen;
  const onFocusSearchRef = useRef(onFocusSearch);
  onFocusSearchRef.current = onFocusSearch;

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Handle Cmd+F (or Ctrl+F) for search focus before other checks
    if ((event.metaKey || event.ctrlKey) && (event.key === "f" || event.key === "F")) {
      if (onFocusSearchRef.current) {
        event.preventDefault();
        log.debug("Keyboard: Focus search (Cmd+F)");
        onFocusSearchRef.current();
      }
      return;
    }

    // Skip if focus is on input element (but allow "/" to focus search from anywhere)
    if (isInputElement(event.target)) {
      return;
    }

    // Handle "/" for search focus (only when not in input)
    if (event.key === "/" && onFocusSearchRef.current) {
      event.preventDefault();
      log.debug("Keyboard: Focus search (/)");
      onFocusSearchRef.current();
      return;
    }

    // Skip if modifier keys are pressed (we already handled Cmd+F above)
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const {
      isPlaying,
      setIsPlaying,
      volume,
      setVolume,
      toggleMute,
      currentTime,
      duration,
      seekTo,
      currentVideo,
    } = usePlayerStore.getState();

    switch (event.key) {
      // Global: Play/Pause
      case " ": {
        event.preventDefault();
        if (currentVideo) {
          log.debug(`Keyboard: ${isPlaying ? "Pause" : "Play"}`);
          setIsPlaying(!isPlaying);
        }
        break;
      }

      // Global: Mute/Unmute
      case "m":
      case "M": {
        event.preventDefault();
        log.debug("Keyboard: Toggle mute");
        toggleMute();
        break;
      }

      // Global: Volume Up
      case "ArrowUp": {
        event.preventDefault();
        const newVolume = Math.min(1, volume + VOLUME_INCREMENT);
        log.debug(`Keyboard: Volume up to ${Math.round(newVolume * 100)}%`);
        setVolume(newVolume);
        break;
      }

      // Global: Volume Down
      case "ArrowDown": {
        event.preventDefault();
        const newVolume = Math.max(0, volume - VOLUME_INCREMENT);
        log.debug(`Keyboard: Volume down to ${Math.round(newVolume * 100)}%`);
        setVolume(newVolume);
        break;
      }

      // Global: Next video
      case "n":
      case "N": {
        event.preventDefault();
        log.debug("Keyboard: Next video");
        const { playNext, hasNext } = useQueueStore.getState();
        if (hasNext()) {
          const nextItem = playNext();
          if (nextItem) {
            playVideo(nextItem.video).catch((err) => {
              log.error("Failed to play next video:", err);
            });
          }
        }
        break;
      }

      // Video window: Toggle fullscreen
      case "f":
      case "F": {
        if (enableVideoShortcuts && onToggleFullscreenRef.current) {
          event.preventDefault();
          log.debug("Keyboard: Toggle fullscreen");
          onToggleFullscreenRef.current();
        }
        break;
      }

      // Video window: Exit fullscreen
      case "Escape": {
        if (enableVideoShortcuts && document.fullscreenElement) {
          event.preventDefault();
          log.debug("Keyboard: Exit fullscreen");
          document.exitFullscreen().catch((err) => {
            log.warn("Failed to exit fullscreen:", err);
          });
        }
        break;
      }

      // Video window: Seek backward
      case "ArrowLeft": {
        if (enableVideoShortcuts && currentVideo) {
          event.preventDefault();
          const newTime = Math.max(0, currentTime - SEEK_INCREMENT);
          log.debug(`Keyboard: Seek backward to ${newTime}s`);
          seekTo(newTime);
        }
        break;
      }

      // Video window: Seek forward
      case "ArrowRight": {
        if (enableVideoShortcuts && currentVideo) {
          event.preventDefault();
          const newTime = Math.min(duration, currentTime + SEEK_INCREMENT);
          log.debug(`Keyboard: Seek forward to ${newTime}s`);
          seekTo(newTime);
        }
        break;
      }
    }
  }, [enableVideoShortcuts]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    log.info(`Keyboard shortcuts enabled (video shortcuts: ${enableVideoShortcuts})`);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown, enableVideoShortcuts]);
}
