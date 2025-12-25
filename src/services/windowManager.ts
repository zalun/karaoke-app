import { WebviewWindow, getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

// Event names for player window communication
const PLAYER_EVENTS = {
  REATTACHED: "player:reattached",
  STATE_SYNC: "player:state-sync",
  COMMAND: "player:command",
  TIME_UPDATE: "player:time-update",
  REQUEST_STATE: "player:request-state",
  FINAL_STATE: "player:final-state",
} as const;

export interface PlayerState {
  streamUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  nextSong?: { title: string; artist?: string };
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
      await this.playerWindow.setFocus();
      return true;
    }

    try {
      // Check if a stale player window exists and close it
      const existingWindows = await getAllWebviewWindows();
      const existingPlayer = existingWindows.find(w => w.label === "player");
      if (existingPlayer) {
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
          resolve();
        });
        this.playerWindow!.once("tauri://error", (e) => {
          reject(e);
        });
      });

      // Listen for window close request
      const unlistenClose = await this.playerWindow.onCloseRequested(async () => {
        await this.reattachPlayer();
      });
      this.unlistenFns.push(unlistenClose);

      // Listen for unexpected window destruction (crash, etc.)
      const unlistenDestroy = await this.playerWindow.once("tauri://destroyed", async () => {
        this.unlistenFns.forEach((fn) => fn());
        this.unlistenFns = [];
        this.playerWindow = null;
        await emit(PLAYER_EVENTS.REATTACHED);
      });
      this.unlistenFns.push(unlistenDestroy);

      // Send initial state to the player window
      await this.syncState(initialState);

      return true;
    } catch (error) {
      console.error("Failed to create player window:", error);
      this.playerWindow = null;
      return false;
    }
  }

  async reattachPlayer(): Promise<boolean> {
    if (!this.playerWindow) return true;

    try {
      // Clean up listeners
      this.unlistenFns.forEach((fn) => fn());
      this.unlistenFns = [];

      // Close the window
      await this.playerWindow.close();
      return true;
    } catch (error) {
      console.error("Failed to close player window:", error);
      return false;
    } finally {
      this.playerWindow = null;
      // Notify main window that player was reattached
      await emit(PLAYER_EVENTS.REATTACHED);
    }
  }

  async syncState(state: PlayerState): Promise<void> {
    try {
      await emit(PLAYER_EVENTS.STATE_SYNC, state);
    } catch {
      // Window might not exist yet, ignore
    }
  }

  async sendCommand(command: "play" | "pause" | "seek", value?: number): Promise<void> {
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
}

export const windowManager = new WindowManager();
