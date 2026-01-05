import {
  WebviewWindow,
  getAllWebviewWindows,
} from "@tauri-apps/api/webviewWindow";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { availableMonitors, type Monitor } from "@tauri-apps/api/window";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createLogger } from "./logger";

const log = createLogger("WindowManager");

// Event names for player window communication
const PLAYER_EVENTS = {
  REATTACHED: "player:reattached",
  STATE_SYNC: "player:state-sync",
  COMMAND: "player:command",
  TIME_UPDATE: "player:time-update",
  DURATION_UPDATE: "player:duration-update",
  REQUEST_STATE: "player:request-state",
  FINAL_STATE: "player:final-state",
  VIDEO_ENDED: "player:video-ended",
  VIDEO_LOADED: "player:video-loaded",
  AUTOPLAY_BLOCKED: "player:autoplay-blocked",
} as const;

export interface SongInfo {
  title: string;
  artist?: string;
  singers?: Array<{ id: number; name: string; unique_name?: string | null; color: string }>;
}

export interface PlayerState {
  streamUrl: string | null;
  videoId?: string | null;
  playbackMode?: "youtube" | "ytdlp";
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  currentSong?: SongInfo;
  nextSong?: SongInfo;
  /** Unique ID for each playback session - changes even when replaying the same video */
  playbackId?: string;
}

// Minimum number of pixels that must be visible on a display for a window to be considered "on screen"
const MIN_VISIBLE_PIXELS = 50;

/**
 * Get monitor bounds in physical pixels (same coordinate system as window positions).
 */
function getMonitorBounds(monitor: Monitor): { x: number; y: number; width: number; height: number } {
  const pos = monitor.position;
  const size = monitor.size;
  return {
    x: pos.x,
    y: pos.y,
    width: size.width,
    height: size.height,
  };
}

/**
 * Check if a window position falls within any of the current monitor bounds.
 * A window is considered visible if at least MIN_VISIBLE_PIXELS of it would be visible.
 * Uses physical pixel coordinates (same as Tauri window positions).
 */
function isWindowWithinMonitorBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  monitors: Monitor[]
): boolean {
  for (const monitor of monitors) {
    const bounds = getMonitorBounds(monitor);
    // Calculate the overlap between the window and this monitor
    const overlapLeft = Math.max(x, bounds.x);
    const overlapRight = Math.min(x + width, bounds.x + bounds.width);
    const overlapTop = Math.max(y, bounds.y);
    const overlapBottom = Math.min(y + height, bounds.y + bounds.height);

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
 * Find the monitor that contains the given point (e.g., window's top-left corner).
 * Uses physical pixel coordinates.
 * Note: This checks if a point is within a monitor, not if an entire window is visible.
 */
function findMonitorContainingPoint(x: number, y: number, monitors: Monitor[]): Monitor | null {
  for (const monitor of monitors) {
    const bounds = getMonitorBounds(monitor);
    if (x >= bounds.x && x < bounds.x + bounds.width &&
        y >= bounds.y && y < bounds.y + bounds.height) {
      return monitor;
    }
  }
  return null;
}

/**
 * Find the primary monitor.
 * Uses the monitor at origin (0, 0) as a reliable heuristic since Tauri
 * doesn't expose an is_primary field. Falls back to first monitor if none at origin.
 */
function findPrimaryMonitor(monitors: Monitor[]): Monitor | null {
  // Primary monitor is typically at origin (0, 0)
  const atOrigin = monitors.find((m) => {
    const bounds = getMonitorBounds(m);
    return bounds.x === 0 && bounds.y === 0;
  });
  return atOrigin || monitors[0] || null;
}

/**
 * Calculate a centered position on a monitor for a window of given size.
 * If window is larger than the monitor, positions at monitor origin to avoid negative offsets.
 * Uses physical pixel coordinates.
 */
function getCenteredPositionOnMonitor(
  width: number,
  height: number,
  monitor: Monitor
): { x: number; y: number } {
  const bounds = getMonitorBounds(monitor);
  // Use Math.max with monitor origin to handle oversized windows correctly
  // when monitor has non-zero coordinates (e.g., secondary monitor)
  return {
    x: Math.max(bounds.x, bounds.x + Math.round((bounds.width - width) / 2)),
    y: Math.max(bounds.y, bounds.y + Math.round((bounds.height - height) / 2)),
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
        title: "HomeKaraoke Player",
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

  async listenForDurationUpdate(callback: (duration: number) => void): Promise<UnlistenFn> {
    return listen<number>(PLAYER_EVENTS.DURATION_UPDATE, (event) => {
      callback(event.payload);
    });
  }

  async emitDurationUpdate(duration: number): Promise<void> {
    if (duration <= 0 || isNaN(duration) || !isFinite(duration)) {
      log.warn(`emitDurationUpdate: invalid duration value: ${duration}`);
      return;
    }
    try {
      await emit(PLAYER_EVENTS.DURATION_UPDATE, duration);
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

  async emitAutoplayBlocked(): Promise<void> {
    log.debug("emitAutoplayBlocked: autoplay was blocked in detached player");
    try {
      await emit(PLAYER_EVENTS.AUTOPLAY_BLOCKED);
    } catch {
      // Window might not exist anymore, ignore
    }
  }

  async listenForAutoplayBlocked(callback: () => void): Promise<UnlistenFn> {
    return listen(PLAYER_EVENTS.AUTOPLAY_BLOCKED, callback);
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
   * Validates that the target position is within current monitor bounds.
   * If the position would result in an off-screen window, centers it on the primary monitor.
   * Uses Tauri's monitor API for consistent physical pixel coordinates.
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

      // Get current monitor configuration to validate bounds
      // Using Tauri's monitor API ensures coordinates are in the same system as window positions
      let finalX = x;
      let finalY = y;
      let finalWidth = width;
      let finalHeight = height;

      try {
        const monitors = await availableMonitors();

        // Log all detected monitors (physical pixel coordinates)
        log.info(
          `restoreWindowState: Detected ${monitors.length} monitors: ${monitors
            .map((m) => {
              const b = getMonitorBounds(m);
              return `${m.name}(${b.x},${b.y} ${b.width}x${b.height} scale=${m.scaleFactor})`;
            })
            .join(", ")}`
        );

        if (monitors.length > 0) {
          // Find which monitor the target position belongs to
          const targetMonitor = findMonitorContainingPoint(x, y, monitors);
          const primaryMonitor = findPrimaryMonitor(monitors);

          if (targetMonitor) {
            const bounds = getMonitorBounds(targetMonitor);
            log.info(
              `restoreWindowState: Target position (${x}, ${y}) is on monitor "${targetMonitor.name}" bounds (${bounds.x},${bounds.y} ${bounds.width}x${bounds.height})`
            );
            // Constrain size to the TARGET monitor, not primary monitor
            if (width > bounds.width || height > bounds.height) {
              finalWidth = Math.min(width, bounds.width);
              finalHeight = Math.min(height, bounds.height);
              log.info(
                `restoreWindowState: ${windowLabel} size ${width}x${height} exceeds target monitor, constraining to ${finalWidth}x${finalHeight}`
              );
            }
            // Position is valid, use original coordinates
          } else {
            log.info(
              `restoreWindowState: Target position (${x}, ${y}) not found on any monitor`
            );
            // Target monitor doesn't exist, check if window would be visible anywhere
            if (!isWindowWithinMonitorBounds(x, y, width, height, monitors)) {
              // Window is truly off-screen, center on primary monitor
              if (primaryMonitor) {
                const bounds = getMonitorBounds(primaryMonitor);
                finalWidth = Math.min(width, bounds.width);
                finalHeight = Math.min(height, bounds.height);
                const centered = getCenteredPositionOnMonitor(finalWidth, finalHeight, primaryMonitor);
                finalX = centered.x;
                finalY = centered.y;
                log.warn(
                  `restoreWindowState: ${windowLabel} target (${x}, ${y}) is off-screen, centering on primary monitor "${primaryMonitor.name}" at (${finalX}, ${finalY})`
                );
              }
            } else {
              log.info(
                `restoreWindowState: Target position (${x}, ${y}) is partially visible, using original`
              );
            }
          }
        } else {
          log.warn(
            `restoreWindowState: No monitors detected, using original position for "${windowLabel}"`
          );
        }
      } catch (monitorErr) {
        // If we can't get monitor info, log warning but proceed with original coordinates
        log.warn(
          `restoreWindowState: Could not validate bounds for "${windowLabel}", using original position`,
          monitorErr
        );
      }

      // Find the scale factor for the target monitor to convert physical to logical coordinates
      // Tauri's setPosition/setSize work in logical coordinates on scaled displays
      let scaleFactor = 1;
      try {
        const monitors = await availableMonitors();
        const targetMon = findMonitorContainingPoint(finalX, finalY, monitors);
        if (targetMon) {
          scaleFactor = targetMon.scaleFactor;
        }
      } catch {
        // Use default scale factor of 1
      }

      // Convert physical pixels to logical pixels
      const logicalX = Math.round(finalX / scaleFactor);
      const logicalY = Math.round(finalY / scaleFactor);
      const logicalWidth = Math.round(finalWidth / scaleFactor);
      const logicalHeight = Math.round(finalHeight / scaleFactor);

      log.info(
        `restoreWindowState: ${windowLabel} to (${finalX}, ${finalY}) ${finalWidth}x${finalHeight} physical, (${logicalX}, ${logicalY}) ${logicalWidth}x${logicalHeight} logical (scale=${scaleFactor})`
      );

      await window.setPosition(new LogicalPosition(logicalX, logicalY));
      await window.setSize(new LogicalSize(logicalWidth, logicalHeight));

      // Verify the window actually moved to the correct position
      // Allow small tolerance for window decorations, snapping, and rounding
      const POSITION_TOLERANCE = 10;
      const SIZE_TOLERANCE = 10;
      const actualPos = await window.outerPosition();
      const actualSize = await window.outerSize();

      const positionDiff = Math.abs(actualPos.x - finalX) + Math.abs(actualPos.y - finalY);
      const sizeDiff = Math.abs(actualSize.width - finalWidth) + Math.abs(actualSize.height - finalHeight);

      if (positionDiff > POSITION_TOLERANCE) {
        log.warn(
          `restoreWindowState: ${windowLabel} position mismatch! Expected (${finalX}, ${finalY}), got (${actualPos.x}, ${actualPos.y})`
        );
      }
      if (sizeDiff > SIZE_TOLERANCE) {
        log.warn(
          `restoreWindowState: ${windowLabel} size mismatch! Expected ${finalWidth}x${finalHeight}, got ${actualSize.width}x${actualSize.height}`
        );
      }
      log.info(
        `restoreWindowState: ${windowLabel} actual position: (${actualPos.x}, ${actualPos.y}) ${actualSize.width}x${actualSize.height}`
      );

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
