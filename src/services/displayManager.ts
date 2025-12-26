import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createLogger } from "./logger";

const log = createLogger("DisplayManager");

export interface DisplayInfo {
  display_id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  is_main: boolean;
}

export interface DisplayConfiguration {
  displays: DisplayInfo[];
  config_hash: string;
}

export interface SavedDisplayConfig {
  id: number;
  config_hash: string;
  display_names: string[];
  description: string | null;
  auto_apply: boolean;
  created_at: string;
}

export interface WindowState {
  id: number;
  display_config_id: number;
  window_type: string;
  target_display_id: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  is_detached: boolean;
  is_fullscreen: boolean;
}

export const displayManagerService = {
  /**
   * Get the current display configuration
   */
  async getConfiguration(): Promise<DisplayConfiguration> {
    log.debug("Getting current display configuration");
    return await invoke<DisplayConfiguration>("display_get_configuration");
  },

  /**
   * Save a display configuration to the database
   */
  async saveConfig(
    configHash: string,
    displayNames: string[],
    description: string | null,
    autoApply: boolean
  ): Promise<number> {
    log.info(`Saving display config: ${configHash.slice(0, 8)}...`);
    return await invoke<number>("display_save_config", {
      configHash,
      displayNames,
      description,
      autoApply,
    });
  },

  /**
   * Get a saved display configuration by its hash
   */
  async getSavedConfig(configHash: string): Promise<SavedDisplayConfig | null> {
    log.debug(`Getting saved config for hash: ${configHash.slice(0, 8)}...`);
    return await invoke<SavedDisplayConfig | null>("display_get_saved_config", {
      configHash,
    });
  },

  /**
   * Update the auto_apply setting for a display configuration
   */
  async updateAutoApply(configId: number, autoApply: boolean): Promise<void> {
    log.info(`Updating auto_apply for config ${configId}: ${autoApply}`);
    await invoke("display_update_auto_apply", { configId, autoApply });
  },

  /**
   * Delete a display configuration
   */
  async deleteConfig(configId: number): Promise<void> {
    log.info(`Deleting display config: ${configId}`);
    await invoke("display_delete_config", { configId });
  },

  /**
   * Save window state for a display configuration
   */
  async saveWindowState(
    displayConfigId: number,
    windowType: string,
    targetDisplayId: string | null,
    x: number,
    y: number,
    width: number,
    height: number,
    isDetached: boolean,
    isFullscreen: boolean
  ): Promise<number> {
    log.debug(
      `Saving window state: config=${displayConfigId}, type=${windowType}`
    );
    return await invoke<number>("window_save_state", {
      displayConfigId,
      windowType,
      targetDisplayId,
      x,
      y,
      width,
      height,
      isDetached,
      isFullscreen,
    });
  },

  /**
   * Get all window states for a display configuration
   */
  async getWindowStates(displayConfigId: number): Promise<WindowState[]> {
    log.debug(`Getting window states for config: ${displayConfigId}`);
    return await invoke<WindowState[]>("window_get_states", {
      displayConfigId,
    });
  },

  /**
   * Clear all window states for a display configuration
   */
  async clearWindowStates(displayConfigId: number): Promise<void> {
    log.debug(`Clearing window states for config: ${displayConfigId}`);
    await invoke("window_clear_states", { displayConfigId });
  },

  /**
   * Listen for display configuration changes
   */
  async onConfigurationChanged(
    callback: (config: DisplayConfiguration) => void
  ): Promise<UnlistenFn> {
    log.debug("Setting up display configuration change listener");
    return await listen<DisplayConfiguration>(
      "display:configuration-changed",
      (event) => {
        log.info(
          `Display configuration changed: ${event.payload.displays.length} displays`
        );
        callback(event.payload);
      }
    );
  },
};
