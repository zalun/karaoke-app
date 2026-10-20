import { invoke } from "@tauri-apps/api/core";

export interface UpdateInfo {
  latest_version: string;
  current_version: string;
  update_available: boolean;
  release_url: string;
  download_url: string;
  release_name?: string;
  /** Whether this platform installs updates in-app (macOS only) */
  can_install: boolean;
}

export const updateService = {
  async checkForUpdate(): Promise<UpdateInfo> {
    return invoke<UpdateInfo>("update_check");
  },

  /** Download, verify and install the latest release; takes effect after restart() */
  async install(): Promise<void> {
    return invoke("update_install");
  },

  async restart(): Promise<void> {
    return invoke("update_restart");
  },
};
