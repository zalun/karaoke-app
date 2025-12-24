import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface PlayerState {
  streamUrl: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
}

class WindowManager {
  private playerWindow: WebviewWindow | null = null;
  private unlistenFns: UnlistenFn[] = [];

  get isDetached(): boolean {
    return this.playerWindow !== null;
  }

  async detachPlayer(initialState: PlayerState): Promise<boolean> {
    console.log("[windowManager] detachPlayer called", initialState);

    if (this.playerWindow) {
      // Already detached, focus the window
      console.log("[windowManager] Window already exists, focusing");
      await this.playerWindow.setFocus();
      return true;
    }

    try {
      console.log("[windowManager] Creating new window");
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
          console.log("[windowManager] Window created successfully");
          resolve();
        });
        this.playerWindow!.once("tauri://error", (e) => {
          console.error("[windowManager] Window creation error:", e);
          reject(e);
        });
      });

      // Listen for window close
      const unlistenClose = await this.playerWindow.onCloseRequested(async () => {
        await this.reattachPlayer();
      });
      this.unlistenFns.push(unlistenClose);

      // Send initial state to the player window
      await this.syncState(initialState);

      return true;
    } catch (error) {
      console.error("Failed to create player window:", error);
      this.playerWindow = null;
      return false;
    }
  }

  async reattachPlayer(): Promise<void> {
    if (!this.playerWindow) return;

    try {
      // Clean up listeners
      this.unlistenFns.forEach((fn) => fn());
      this.unlistenFns = [];

      // Close the window
      await this.playerWindow.close();
    } catch (error) {
      console.error("Failed to close player window:", error);
    } finally {
      this.playerWindow = null;
      // Notify main window that player was reattached
      await emit("player:reattached");
    }
  }

  async syncState(state: PlayerState): Promise<void> {
    await emit("player:state-sync", state);
  }

  async sendCommand(command: "play" | "pause" | "seek", value?: number): Promise<void> {
    await emit("player:command", { command, value });
  }

  async listenForReattach(callback: () => void): Promise<UnlistenFn> {
    return listen("player:reattached", callback);
  }

  async listenForStateSync(callback: (state: PlayerState) => void): Promise<UnlistenFn> {
    return listen<PlayerState>("player:state-sync", (event) => {
      callback(event.payload);
    });
  }

  async listenForCommands(
    callback: (command: { command: "play" | "pause" | "seek"; value?: number }) => void
  ): Promise<UnlistenFn> {
    return listen<{ command: "play" | "pause" | "seek"; value?: number }>(
      "player:command",
      (event) => {
        callback(event.payload);
      }
    );
  }

  async listenForTimeUpdate(callback: (time: number) => void): Promise<UnlistenFn> {
    return listen<number>("player:time-update", (event) => {
      callback(event.payload);
    });
  }

  async emitTimeUpdate(time: number): Promise<void> {
    await emit("player:time-update", time);
  }

  async requestInitialState(): Promise<void> {
    await emit("player:request-state");
  }

  async listenForStateRequest(callback: () => void): Promise<UnlistenFn> {
    return listen("player:request-state", callback);
  }
}

export const windowManager = new WindowManager();
