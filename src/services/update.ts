import { invoke } from "@tauri-apps/api/core";

export interface UpdateInfo {
  latest_version: string;
  current_version: string;
  update_available: boolean;
  release_url: string;
  download_url: string;
  release_name?: string;
}

export const updateService = {
  async checkForUpdate(): Promise<UpdateInfo> {
    return invoke<UpdateInfo>("update_check");
  },
};
