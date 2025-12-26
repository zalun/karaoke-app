import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createLogger } from "./logger";

const log = createLogger("MediaControls");

export interface MediaControlsMetadata {
  title: string;
  artist?: string;
  durationSecs?: number;
  thumbnailUrl?: string;
}

export const mediaControlsService = {
  async updateMetadata(metadata: MediaControlsMetadata): Promise<void> {
    try {
      log.info(
        `Updating metadata: title="${metadata.title}", artist="${metadata.artist}", thumbnail="${metadata.thumbnailUrl}"`
      );
      await invoke("media_controls_update_metadata", {
        title: metadata.title,
        artist: metadata.artist ?? null,
        durationSecs: metadata.durationSecs ?? null,
        thumbnailUrl: metadata.thumbnailUrl ?? null,
      });
      log.info(`Metadata updated successfully`);
    } catch (err) {
      log.error("Failed to update metadata", err);
    }
  },

  async updatePlayback(isPlaying: boolean, positionSecs: number): Promise<void> {
    try {
      await invoke("media_controls_update_playback", {
        isPlaying,
        positionSecs,
      });
    } catch {
      // Throttled updates may fail silently
    }
  },

  async stop(): Promise<void> {
    try {
      await invoke("media_controls_stop");
      log.debug("Media controls stopped");
    } catch (err) {
      log.error("Failed to stop media controls", err);
    }
  },

  // Event listeners for media key presses
  async onPlay(callback: () => void): Promise<UnlistenFn> {
    return listen("media-control:play", () => callback());
  },

  async onPause(callback: () => void): Promise<UnlistenFn> {
    return listen("media-control:pause", () => callback());
  },

  async onToggle(callback: () => void): Promise<UnlistenFn> {
    return listen("media-control:toggle", () => callback());
  },

  async onNext(callback: () => void): Promise<UnlistenFn> {
    return listen("media-control:next", () => callback());
  },

  async onPrevious(callback: () => void): Promise<UnlistenFn> {
    return listen("media-control:previous", () => callback());
  },

  async onStop(callback: () => void): Promise<UnlistenFn> {
    return listen("media-control:stop", () => callback());
  },

  async onSeek(callback: (deltaSeconds: number) => void): Promise<UnlistenFn> {
    return listen<number>("media-control:seek", (event) => callback(event.payload));
  },

  async onSetPosition(callback: (positionSeconds: number) => void): Promise<UnlistenFn> {
    return listen<number>("media-control:set-position", (event) =>
      callback(event.payload)
    );
  },
};
