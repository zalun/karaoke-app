import {
  WebviewWindow,
  getAllWebviewWindows,
} from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createLogger } from "./logger";
import {
  displayManagerService,
  type DisplayInfo,
} from "./displayManager";

const log = createLogger("WindowManager");

// Event names for player window communication
const PLAYER_EVENTS = {
  REATTACHED: "player:reattached",
  STATE_SYNC: "player:state-sync",
  COMMAND: "player:command",
  TIME_UPDATE: "player:time-update",
  REQUEST_STATE: "player:request-state",
  FINAL_STATE: "player:final-state",
  VIDEO_ENDED: "player:video-ended",
  VIDEO_LOADED: "player:video-loaded",
} as const;

export interface SongInfo {
  title: string;
  artist?: string;
  singers?: Array<{ id: number; name: string; color: string }>;
}

export interface PlayerState {
  streamUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  currentSong?: SongInfo;
  nextSong?: SongInfo;
}

// Minimum number of pixels that must be visible on a display for a window to be considered "on screen"
const MIN_VISIBLE_PIXELS = 50;

/**
 * Check if a window position falls within any of the current display bounds.
 * A window is considered visible if at least MIN_VISIBLE_PIXELS of it would be visible.
 */
function isWindowWithinDisplayBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  displays: DisplayInfo[]
): boolean {
  for (const display of displays) {
    // Calculate the overlap between the window and this display
    const overlapLeft = Math.max(x, display.x);
    const overlapRight = Math.min(x + width, display.x + display.width);
    const overlapTop = Math.max(y, display.y);
    const overlapBottom = Math.min(y + height, display.y + display.height);

    const overlapWidth = overlapRight - overlapLeft;
    const overlapHeight = overlapBottom - overlapTop;

    // If there's enough overlap in both dimensions, window is visible
    if (overlapWidth >= MIN_VISIBLE_PIXELS && overlapHeight >= MIN_VISIBLE_PIXELS) {
      return true;
    }
  }
  return false;
}

/**
 * Find the main display from the list of displays.
 */
function findMainDisplay(displays: DisplayInfo[]): DisplayInfo | null {
  return displays.find((d) => d.is_main) || displays[0] || null;
}

/**
 * Calculate a centered position on a display for a window of given size.
 * If window is larger than the display, positions at display origin to avoid negative offsets.
 */
function getCenteredPosition(
  width: number,
  height: number,
  display: DisplayInfo
): { x: number; y: number } {
  return {
    x: display.x + Math.max(0, Math.round((display.width - width) / 2)),
    y: display.y + Math.max(0, Math.round((display.height - height) / 2)),
  };
}

class WindowManager {
  private playerWindow: WebviewWindow | null = null;
  private unlistenFns: UnlistenFn[] = [];

  get isDetached(): boolean {
    return this.playerWindow !== null;
  }

  async detachPlayer(initialState: PlayerState): Promise<boolean> {
    if (this.playerWindow) {
      // Already detached, focus the window
      log.debug("detachPlayer: window already exists, focusing");
      await this.playerWindow.setFocus();
      return true;
    }

    try {
      log.info("detachPlayer: creating player window");
      // Check if a stale player window exists and close it
      const existingWindows = await getAllWebviewWindows();
      const existingPlayer = existingWindows.find(w => w.label === "player");
      if (existingPlayer) {
        log.debug("detachPlayer: closing stale player window");
        await existingPlayer.close();
        // Small delay to ensure window is closed
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      // Create the player window
      this.playerWindow = new WebviewWindow("player", {
        url: "/#/player",
        title: "Karaoke Player",
        width: 854,
        height: 480,
        minWidth: 320,
        minHeight: 180,
        resizable: true,
        decorations: true,
        center: true,
      });

      // Wait for the window to be created
      await new Promise<void>((resolve, reject) => {
        this.playerWindow!.once("tauri://created", () => {
          log.debug("detachPlayer: window created");
          resolve();
        });
        this.playerWindow!.once("tauri://error", (e) => {
          log.error("detachPlayer: window creation error", e);
          reject(e);
        });
      });

      // Listen for window close request
      const unlistenClose = await this.playerWindow.onCloseRequested(async () => {
        log.debug("detachPlayer: close requested");
        await this.reattachPlayer();
      });
      this.unlistenFns.push(unlistenClose);

      // Listen for unexpected window destruction (crash, etc.)
      const unlistenDestroy = await this.playerWindow.once("tauri://destroyed", async () => {
        log.warn("detachPlayer: window destroyed unexpectedly");
        this.unlistenFns.forEach((fn) => fn());
        this.unlistenFns = [];
        this.playerWindow = null;
        await emit(PLAYER_EVENTS.REATTACHED);
      });
      this.unlistenFns.push(unlistenDestroy);

      // Send initial state to the player window
      await this.syncState(initialState);

      log.info("detachPlayer: success");
      return true;
    } catch (error) {
      log.error("detachPlayer: failed", error);
      this.playerWindow = null;
      return false;
    }
  }

  async reattachPlayer(): Promise<boolean> {
    if (!this.playerWindow) return true;

    log.info("reattachPlayer: closing player window");
    try {
      // Clean up listeners
      this.unlistenFns.forEach((fn) => fn());
      this.unlistenFns = [];

      // Close the window
      await this.playerWindow.close();
      log.info("reattachPlayer: success");
      return true;
    } catch (error) {
      log.error("reattachPlayer: failed", error);
      return false;
    } finally {
      this.playerWindow = null;
      // Notify main window that player was reattached
      await emit(PLAYER_EVENTS.REATTACHED);
    }
  }

  async syncState(state: PlayerState): Promise<void> {
    log.debug(`syncState: isPlaying=${state.isPlaying}, currentTime=${state.currentTime.toFixed(1)}`);
    try {
      await emit(PLAYER_EVENTS.STATE_SYNC, state);
    } catch {
      // Window might not exist yet, ignore
    }
  }

  async sendCommand(command: "play" | "pause" | "seek", value?: number): Promise<void> {
    log.debug(`sendCommand: ${command}${value !== undefined ? ` (${value})` : ""}`);
    try {
      await emit(PLAYER_EVENTS.COMMAND, { command, value });
    } catch {
      // Window might not exist yet, ignore
    }
  }

  async listenForReattach(callback: () => void): Promise<UnlistenFn> {
    return listen(PLAYER_EVENTS.REATTACHED, callback);
  }

  async listenForStateSync(callback: (state: PlayerState) => void): Promise<UnlistenFn> {
    return listen<PlayerState>(PLAYER_EVENTS.STATE_SYNC, (event) => {
      callback(event.payload);
    });
  }

  async listenForCommands(
    callback: (command: { command: "play" | "pause" | "seek"; value?: number }) => void
  ): Promise<UnlistenFn> {
    return listen<{ command: "play" | "pause" | "seek"; value?: number }>(
      PLAYER_EVENTS.COMMAND,
      (event) => {
        callback(event.payload);
      }
    );
  }

  async listenForTimeUpdate(callback: (time: number) => void): Promise<UnlistenFn> {
    return listen<number>(PLAYER_EVENTS.TIME_UPDATE, (event) => {
      callback(event.payload);
    });
  }

  async emitTimeUpdate(time: number): Promise<void> {
    try {
      await emit(PLAYER_EVENTS.TIME_UPDATE, time);
    } catch {
      // Window might not exist anymore, ignore
    }
  }

  async requestInitialState(): Promise<void> {
    try {
      await emit(PLAYER_EVENTS.REQUEST_STATE);
    } catch {
      // Window might not exist yet, ignore
    }
  }

  async listenForStateRequest(callback: () => void): Promise<UnlistenFn> {
    return listen(PLAYER_EVENTS.REQUEST_STATE, callback);
  }

  async emitFinalState(state: PlayerState): Promise<void> {
    try {
      await emit(PLAYER_EVENTS.FINAL_STATE, state);
    } catch {
      // Window might not exist anymore, ignore
    }
  }

  async listenForFinalState(callback: (state: PlayerState) => void): Promise<UnlistenFn> {
    return listen<PlayerState>(PLAYER_EVENTS.FINAL_STATE, (event) => {
      callback(event.payload);
    });
  }

  async emitVideoEnded(): Promise<void> {
    log.debug("emitVideoEnded: video ended in detached player");
    try {
      await emit(PLAYER_EVENTS.VIDEO_ENDED);
    } catch {
      // Window might not exist anymore, ignore
    }
  }

  async listenForVideoEnded(callback: () => void): Promise<UnlistenFn> {
    return listen(PLAYER_EVENTS.VIDEO_ENDED, callback);
  }

  async emitVideoLoaded(): Promise<void> {
    log.debug("emitVideoLoaded: video loaded in detached player");
    try {
      await emit(PLAYER_EVENTS.VIDEO_LOADED);
    } catch {
      // Window might not exist anymore, ignore
    }
  }

  async listenForVideoLoaded(callback: () => void): Promise<UnlistenFn> {
    return listen(PLAYER_EVENTS.VIDEO_LOADED, callback);
  }

  /**
   * Capture the current position and size of a window
   */
  async captureWindowState(
    windowLabel: string
  ): Promise<{ x: number; y: number; width: number; height: number } | null> {
    try {
      const allWindows = await getAllWebviewWindows();
      const window = allWindows.find((w) => w.label === windowLabel);
      if (!window) {
        log.debug(`captureWindowState: window "${windowLabel}" not found`);
        return null;
      }

      const position = await window.outerPosition();
      const size = await window.outerSize();

      log.debug(
        `captureWindowState: ${windowLabel} at (${position.x}, ${position.y}) ${size.width}x${size.height}`
      );

      return {
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      };
    } catch (err) {
      log.error(`captureWindowState: failed for "${windowLabel}"`, err);
      return null;
    }
  }

  /**
   * Restore a window to a specific position and size.
   * Validates that the target position is within current display bounds.
   * If the position would result in an off-screen window, centers it on the main display.
   */
  async restoreWindowState(
    windowLabel: string,
    x: number,
    y: number,
    width: number,
    height: number
  ): Promise<boolean> {
    try {
      const allWindows = await getAllWebviewWindows();
      const window = allWindows.find((w) => w.label === windowLabel);
      if (!window) {
        log.debug(`restoreWindowState: window "${windowLabel}" not found`);
        return false;
      }

      // Get current display configuration to validate bounds
      let finalX = x;
      let finalY = y;
      let finalWidth = width;
      let finalHeight = height;

      try {
        const displayConfig = await displayManagerService.getConfiguration();
        const displays = displayConfig.displays;

        if (displays.length > 0) {
          const mainDisplay = findMainDisplay(displays);

          // Constrain window size to fit within main display if too large
          if (mainDisplay) {
            if (width > mainDisplay.width || height > mainDisplay.height) {
              finalWidth = Math.min(width, mainDisplay.width);
              finalHeight = Math.min(height, mainDisplay.height);
              log.warn(
                `restoreWindowState: ${windowLabel} size ${width}x${height} exceeds display, constraining to ${finalWidth}x${finalHeight}`
              );
            }
          }

          if (!isWindowWithinDisplayBounds(x, y, finalWidth, finalHeight, displays)) {
            // Target position is off-screen, center on main display
            if (mainDisplay) {
              const centered = getCenteredPosition(finalWidth, finalHeight, mainDisplay);
              finalX = centered.x;
              finalY = centered.y;
              log.warn(
                `restoreWindowState: ${windowLabel} target (${x}, ${y}) is off-screen, centering on main display at (${finalX}, ${finalY})`
              );
            }
          }
        } else {
          log.warn(
            `restoreWindowState: No displays detected, using original position for "${windowLabel}"`
          );
        }
      } catch (displayErr) {
        // If we can't get display info, log warning but proceed with original coordinates
        log.warn(
          `restoreWindowState: Could not validate bounds for "${windowLabel}", using original position`,
          displayErr
        );
      }

      log.info(
        `restoreWindowState: ${windowLabel} to (${finalX}, ${finalY}) ${finalWidth}x${finalHeight}`
      );

      await window.setPosition(new PhysicalPosition(finalX, finalY));
      await window.setSize(new PhysicalSize(finalWidth, finalHeight));

      return true;
    } catch (err) {
      log.error(`restoreWindowState: failed for "${windowLabel}"`, err);
      return false;
    }
  }

  /**
   * Get the main window
   */
  async getMainWindow(): Promise<WebviewWindow | null> {
    try {
      const allWindows = await getAllWebviewWindows();
      return allWindows.find((w) => w.label === "main") || null;
    } catch {
      return null;
    }
  }
}

export const windowManager = new WindowManager();
