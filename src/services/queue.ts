import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "./logger";

const log = createLogger("QueueService");

export interface QueueItemData {
  id: string;
  video_id: string;
  title: string;
  artist?: string;
  duration?: number;
  thumbnail_url?: string;
  source: "youtube" | "local" | "external";
  youtube_id?: string;
  file_path?: string;
  position: number;
  added_at: string;
  played_at?: string;
}

export interface QueueState {
  queue: QueueItemData[];
  history: QueueItemData[];
  history_index: number;
}

export const queueService = {
  // Queue operations
  async addItem(item: QueueItemData): Promise<void> {
    log.debug(`Adding item to queue: ${item.id} - ${item.title}`);
    await invoke("queue_add_item", { item });
  },

  async removeItem(itemId: string): Promise<void> {
    log.debug(`Removing item from queue: ${itemId}`);
    await invoke("queue_remove_item", { itemId });
  },

  async reorder(itemId: string, newPosition: number): Promise<void> {
    log.debug(`Reordering queue item ${itemId} to position ${newPosition}`);
    await invoke("queue_reorder", { itemId, newPosition });
  },

  async clearQueue(): Promise<void> {
    log.info("Clearing queue");
    await invoke("queue_clear");
  },

  // History operations
  async moveToHistory(itemId: string): Promise<void> {
    log.debug(`Moving item to history: ${itemId}`);
    await invoke("queue_move_to_history", { itemId });
  },

  async addToHistory(item: QueueItemData): Promise<void> {
    log.debug(`Adding item directly to history: ${item.id} - ${item.title}`);
    await invoke("queue_add_to_history", { item });
  },

  async clearHistory(): Promise<void> {
    log.info("Clearing history");
    await invoke("queue_clear_history");
  },

  async setHistoryIndex(index: number): Promise<void> {
    log.debug(`Setting history index to ${index}`);
    await invoke("queue_set_history_index", { index });
  },

  // State recovery
  async getState(): Promise<QueueState | null> {
    log.debug("Fetching queue state");
    return await invoke<QueueState | null>("queue_get_state");
  },
};
