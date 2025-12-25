import { invoke } from "@tauri-apps/api/core";

export const keepAwakeService = {
  async enable(): Promise<void> {
    try {
      await invoke("keep_awake_enable");
      console.log("[KeepAwake] Enabled via native API");
    } catch (err) {
      console.error("[KeepAwake] Failed to enable:", err);
    }
  },

  async disable(): Promise<void> {
    try {
      await invoke("keep_awake_disable");
      console.log("[KeepAwake] Disabled via native API");
    } catch (err) {
      console.error("[KeepAwake] Failed to disable:", err);
    }
  },
};
