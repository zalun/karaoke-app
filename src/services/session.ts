import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "./logger";

const log = createLogger("SessionService");

export interface Singer {
  id: number;
  name: string;
  color: string;
  is_persistent: boolean;
}

export interface Session {
  id: number;
  name: string | null;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
}

export const sessionService = {
  // Singer CRUD
  async createSinger(
    name: string,
    color: string,
    isPersistent: boolean = false
  ): Promise<Singer> {
    log.info(`Creating singer: ${name}`);
    return await invoke<Singer>("create_singer", {
      name,
      color,
      isPersistent,
    });
  },

  async getSingers(): Promise<Singer[]> {
    log.debug("Fetching all singers");
    return await invoke<Singer[]>("get_singers");
  },

  async deleteSinger(singerId: number): Promise<void> {
    log.info(`Deleting singer: ${singerId}`);
    await invoke("delete_singer", { singerId });
  },

  // Session management
  async startSession(name?: string): Promise<Session> {
    log.info(`Starting session: ${name || "(unnamed)"}`);
    return await invoke<Session>("start_session", { name: name || null });
  },

  async endSession(): Promise<void> {
    log.info("Ending active session");
    await invoke("end_session");
  },

  async getActiveSession(): Promise<Session | null> {
    log.debug("Fetching active session");
    return await invoke<Session | null>("get_active_session");
  },

  // Session-singer relationships
  async addSingerToSession(
    sessionId: number,
    singerId: number
  ): Promise<void> {
    log.debug(`Adding singer ${singerId} to session ${sessionId}`);
    await invoke("add_singer_to_session", { sessionId, singerId });
  },

  async getSessionSingers(sessionId: number): Promise<Singer[]> {
    log.debug(`Fetching singers for session ${sessionId}`);
    return await invoke<Singer[]>("get_session_singers", { sessionId });
  },

  // Queue-singer assignments
  async assignSingerToQueueItem(
    queueItemId: string,
    singerId: number
  ): Promise<void> {
    log.debug(`Assigning singer ${singerId} to queue item ${queueItemId}`);
    await invoke("assign_singer_to_queue_item", { queueItemId, singerId });
  },

  async removeSingerFromQueueItem(
    queueItemId: string,
    singerId: number
  ): Promise<void> {
    log.debug(`Removing singer ${singerId} from queue item ${queueItemId}`);
    await invoke("remove_singer_from_queue_item", { queueItemId, singerId });
  },

  async getQueueItemSingers(queueItemId: string): Promise<Singer[]> {
    log.debug(`Fetching singers for queue item ${queueItemId}`);
    return await invoke<Singer[]>("get_queue_item_singers", { queueItemId });
  },

  async clearQueueItemSingers(queueItemId: string): Promise<void> {
    log.debug(`Clearing singers from queue item ${queueItemId}`);
    await invoke("clear_queue_item_singers", { queueItemId });
  },

  // Session management
  async getRecentSessions(limit?: number): Promise<Session[]> {
    log.debug(`Fetching recent sessions (limit: ${limit || 10})`);
    return await invoke<Session[]>("get_recent_sessions", { limit: limit || null });
  },

  async renameSession(sessionId: number, name: string): Promise<Session> {
    log.info(`Renaming session ${sessionId} to: ${name}`);
    return await invoke<Session>("rename_session", { sessionId, name });
  },

  async loadSession(sessionId: number): Promise<Session> {
    log.info(`Loading session: ${sessionId}`);
    return await invoke<Session>("load_session", { sessionId });
  },

  async deleteSession(sessionId: number): Promise<void> {
    log.info(`Deleting session: ${sessionId}`);
    await invoke("delete_session", { sessionId });
  },
};
