import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "./logger";

const log = createLogger("SessionService");

/**
 * Status values for hosted sessions.
 * - active: Session is currently being hosted
 * - paused: Session is temporarily paused (reserved for future use)
 * - ended: Session hosting has ended
 */
export type HostedSessionStatus = "active" | "paused" | "ended" | "expired";

/**
 * Constants for hosted session status values.
 * Use these instead of string literals for type safety.
 */
export const HOSTED_SESSION_STATUS = {
  ACTIVE: "active",
  PAUSED: "paused",
  ENDED: "ended",
  EXPIRED: "expired",
} as const satisfies Record<string, HostedSessionStatus>;

export interface Singer {
  id: number;
  name: string;
  unique_name: string | null;
  color: string;
  is_persistent: boolean;
}

export interface FavoriteVideo {
  video_id: string;
  title: string;
  artist?: string;
  duration?: number;
  thumbnail_url?: string;
  source: "youtube" | "local" | "external";
  youtube_id?: string;
  file_path?: string;
}

export interface SingerFavorite {
  id: number;
  singer_id: number;
  video: FavoriteVideo;
  added_at: string;
}

/**
 * Represents a karaoke session stored in the local database.
 *
 * ## Hosted Session Fields
 *
 * The three hosted fields form a logical unit for tracking remote hosting state:
 * - `hosted_session_id` - The remote session ID from the homekaraoke.app backend
 * - `hosted_by_user_id` - The Supabase user ID of who started hosting
 * - `hosted_session_status` - Current status: 'active', 'paused', or 'ended'
 *
 * These fields are set together via `sessionService.setHostedSession()` when hosting
 * starts, and the status is updated via `sessionService.updateHostedSessionStatus()`
 * when hosting ends. The fields are intentionally never cleared—only the status
 * changes to 'ended'—to preserve ownership info for scenarios like:
 * - A different user signing in on the same device
 * - The original user returning to resume hosting
 * - Debugging and audit purposes
 */
export interface Session {
  id: number;
  name: string | null;
  started_at: string;
  ended_at: string | null;
  is_active: boolean;
  /** Remote hosted session ID from homekaraoke.app backend. Set with hosted_by_user_id and hosted_session_status. */
  hosted_session_id?: string;
  /** Supabase user ID of who started hosting. Used to verify ownership on restoration. */
  hosted_by_user_id?: string;
  /** Current hosting status. Only this field changes after initial set—never cleared. */
  hosted_session_status?: HostedSessionStatus;
}

export const sessionService = {
  // Singer CRUD
  async createSinger(
    name: string,
    color: string,
    isPersistent: boolean = false,
    uniqueName?: string
  ): Promise<Singer> {
    log.info(`Creating singer: ${name}`);
    return await invoke<Singer>("create_singer", {
      name,
      color,
      isPersistent,
      uniqueName: uniqueName || null,
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

  async updateSinger(
    singerId: number,
    updates: { name?: string; uniqueName?: string; color?: string; isPersistent?: boolean }
  ): Promise<Singer> {
    log.info(`Updating singer: ${singerId}`);
    return await invoke<Singer>("update_singer", {
      singerId,
      name: updates.name ?? null,
      uniqueName: updates.uniqueName ?? null,
      color: updates.color ?? null,
      isPersistent: updates.isPersistent ?? null,
    });
  },

  async getPersistentSingers(): Promise<Singer[]> {
    log.debug("Fetching persistent singers");
    return await invoke<Singer[]>("get_persistent_singers");
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

  async removeSingerFromSession(
    sessionId: number,
    singerId: number
  ): Promise<void> {
    log.debug(`Removing singer ${singerId} from session ${sessionId}`);
    await invoke("remove_singer_from_session", { sessionId, singerId });
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

  // Active singer management
  async setActiveSinger(sessionId: number, singerId: number | null): Promise<void> {
    log.debug(`Setting active singer for session ${sessionId}: ${singerId}`);
    await invoke("session_set_active_singer", { sessionId, singerId });
  },

  async getActiveSinger(sessionId: number): Promise<Singer | null> {
    log.debug(`Getting active singer for session ${sessionId}`);
    return await invoke<Singer | null>("session_get_active_singer", { sessionId });
  },

  // Hosted session management
  async setHostedSession(
    sessionId: number,
    hostedSessionId: string,
    hostedByUserId: string,
    status: HostedSessionStatus
  ): Promise<void> {
    log.debug(`Setting hosted session for session ${sessionId}: hosted_id=${hostedSessionId}, status=${status}`);
    await invoke("session_set_hosted", { sessionId, hostedSessionId, hostedByUserId, status });
  },

  async updateHostedSessionStatus(
    sessionId: number,
    status: HostedSessionStatus
  ): Promise<void> {
    log.debug(`Updating hosted session status for session ${sessionId}: ${status}`);
    await invoke("session_update_hosted_status", { sessionId, status });
  },
};
