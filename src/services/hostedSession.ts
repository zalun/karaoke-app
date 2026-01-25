import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "./logger";
import { HOMEKARAOKE_API_URL, buildJoinUrl, buildQrCodeUrl } from "../constants";
import { HostedSessionStatus } from "./session";
import { SongRequest } from "../types/songRequest";

const log = createLogger("HostedSessionService");

/**
 * Custom error class for API errors with HTTP status codes.
 * Allows callers to distinguish between different error types (401, 403, 404, etc.)
 * using instanceof checks instead of error message string matching.
 */
export class ApiError extends Error {
  public readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.name = "ApiError";
    // Restore prototype chain (needed for instanceof to work with ES5 targets)
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

const HOSTED_SESSION_KEY = "hosted_session_id";
const LEGACY_MIGRATION_DONE_KEY = "hosted_session_legacy_migration_done";

/**
 * @deprecated Legacy function - sessions table is now the primary storage.
 *
 * Persist the hosted session ID to SQLite settings.
 * This was the original approach before Migration 8 added hosted_session_id,
 * hosted_by_user_id, and hosted_session_status columns to the sessions table.
 *
 * The sessions table approach is preferred because it:
 * - Tracks which user started hosting (ownership)
 * - Stores session status for proper restoration logic
 * - Keeps hosted info with the session it belongs to
 *
 * This function remains for backward compatibility but should not be used
 * for new code. Use sessionService.setHostedSession() instead.
 */
export async function persistSessionId(sessionId: string): Promise<void> {
  log.debug(`Persisting session ID: ${sessionId}`);
  await invoke("settings_set", { key: HOSTED_SESSION_KEY, value: sessionId });
}

/**
 * Run one-time migration to clear legacy hosted_session_id from settings table.
 *
 * The new system stores hosted info in the sessions table (hosted_session_id,
 * hosted_by_user_id, hosted_session_status). The old settings-based approach
 * didn't track ownership, so we can't migrate - just clear and let user re-host.
 *
 * This should be called during app initialization (before loadSession).
 * The migration is tracked via a settings flag to ensure it only runs once.
 */
export async function runLegacyHostedSessionMigration(): Promise<void> {
  try {
    // Check if migration was already done
    const migrationDone = await invoke<string | null>("settings_get", { key: LEGACY_MIGRATION_DONE_KEY });
    if (migrationDone === "true") {
      log.debug("Legacy hosted_session_id migration already completed");
      return;
    }

    // Check if there's a legacy hosted_session_id to clear
    const legacyId = await getPersistedSessionId();
    if (legacyId) {
      log.info("MIGRATE-002: Clearing legacy hosted_session_id from settings table");
      await clearPersistedSessionId();
    }

    // Mark migration as done
    await invoke("settings_set", { key: LEGACY_MIGRATION_DONE_KEY, value: "true" });
    log.debug("Legacy hosted_session_id migration completed");
  } catch (error) {
    // Log but don't throw - migration failure shouldn't block app startup
    const message = error instanceof Error ? error.message : String(error);
    log.error(`MIGRATE-002: Failed to run legacy migration: ${message}`);
  }
}

/**
 * @deprecated Legacy function - sessions table is now the primary storage.
 *
 * Get the persisted hosted session ID from SQLite settings.
 * Returns null if no session ID is stored.
 *
 * Used only by runLegacyHostedSessionMigration() to check for old data.
 * New code should read hosted_session_id from the Session object instead.
 */
export async function getPersistedSessionId(): Promise<string | null> {
  const sessionId = await invoke<string | null>("settings_get", { key: HOSTED_SESSION_KEY });
  // Treat empty string as null (clearPersistedSessionId sets empty string)
  const result = sessionId && sessionId.trim() !== "" ? sessionId : null;
  log.debug(`Retrieved persisted session ID: ${result ?? "none"}`);
  return result;
}

/**
 * @deprecated Legacy function - sessions table is now the primary storage.
 *
 * Clear the persisted hosted session ID from SQLite settings.
 *
 * Used only by runLegacyHostedSessionMigration() to clear old data.
 * New code should call sessionService.updateHostedSessionStatus() with 'ended'.
 */
export async function clearPersistedSessionId(): Promise<void> {
  log.debug("Clearing persisted session ID");
  await invoke("settings_set", { key: HOSTED_SESSION_KEY, value: "" });
}

export interface SessionStats {
  pendingRequests: number;
  approvedRequests: number;
  totalGuests: number;
}

export interface HostedSession {
  id: string;
  sessionCode: string;
  joinUrl: string;
  qrCodeUrl: string;
  expiresAt?: string;
  status: HostedSessionStatus;
  stats: SessionStats;
}

interface CreateSessionResponse {
  session_id: string;
  session_code: string;
  qr_code_url: string;
  join_url: string;
  expires_at: string;
}

interface GetSessionResponse {
  id: string;
  session_code: string;
  status: HostedSessionStatus;
  stats: {
    pending_requests: number;
    approved_requests: number;
    total_guests: number;
  };
}

interface SongRequestResponse {
  id: string;
  title: string;
  status: "pending" | "approved" | "rejected" | "played";
  guest_name: string;
  requested_at: string;
  youtube_id?: string;
  artist?: string;
  duration?: number;
  thumbnail_url?: string;
}

export const hostedSessionService = {
  /**
   * Create a new hosted session.
   * Returns the session with join code and QR code URL.
   */
  async createHostedSession(
    accessToken: string,
    sessionName?: string
  ): Promise<HostedSession> {
    if (!accessToken || accessToken.trim() === "") {
      throw new Error("Access token is required");
    }

    log.info("Creating hosted session");

    let response: Response;
    try {
      response = await fetch(`${HOMEKARAOKE_API_URL}/api/session/create`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: sessionName }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Network error creating hosted session: ${message}`);
      throw new Error(`Network error: ${message}`);
    }

    if (!response.ok) {
      const error = await response.text();
      log.error(`Failed to create hosted session (${response.status}): ${error}`);
      throw new ApiError(response.status, `Failed to create hosted session: ${error}`);
    }

    const data: CreateSessionResponse = await response.json();
    log.info(`Created hosted session: ${data.session_code}`);

    return {
      id: data.session_id,
      sessionCode: data.session_code,
      joinUrl: data.join_url,
      qrCodeUrl: data.qr_code_url,
      expiresAt: data.expires_at,
      status: "active",
      stats: {
        pendingRequests: 0,
        approvedRequests: 0,
        totalGuests: 0,
      },
    };
  },

  /**
   * Get session details and stats.
   * Used for polling to refresh stats.
   */
  async getSession(
    accessToken: string,
    sessionId: string
  ): Promise<HostedSession> {
    if (!accessToken || accessToken.trim() === "") {
      throw new Error("Access token is required");
    }
    if (!sessionId || sessionId.trim() === "") {
      throw new Error("Session ID is required");
    }

    log.debug(`Getting session: ${sessionId}`);

    let response: Response;
    try {
      response = await fetch(`${HOMEKARAOKE_API_URL}/api/session/${sessionId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Network error getting session: ${message}`);
      throw new Error(`Network error: ${message}`);
    }

    if (!response.ok) {
      const error = await response.text();
      log.error(`Failed to get session (${response.status}): ${error}`);
      throw new ApiError(response.status, `Failed to get session: ${error}`);
    }

    const data: GetSessionResponse = await response.json();

    const joinUrl = buildJoinUrl(data.session_code);
    return {
      id: data.id,
      sessionCode: data.session_code,
      joinUrl,
      qrCodeUrl: buildQrCodeUrl(joinUrl),
      status: data.status,
      stats: {
        pendingRequests: data.stats.pending_requests,
        approvedRequests: data.stats.approved_requests,
        totalGuests: data.stats.total_guests,
      },
    };
  },

  /**
   * Get song requests for a hosted session.
   * Can filter by status (pending, approved, rejected, played).
   */
  async getRequests(
    accessToken: string,
    sessionId: string,
    status?: string
  ): Promise<SongRequest[]> {
    if (!accessToken || accessToken.trim() === "") {
      throw new Error("Access token is required");
    }
    if (!sessionId || sessionId.trim() === "") {
      throw new Error("Session ID is required");
    }

    const url = new URL(`${HOMEKARAOKE_API_URL}/api/session/${sessionId}/requests`);
    if (status) {
      url.searchParams.set("status", status);
    }

    log.debug(`Getting requests for session: ${sessionId}${status ? ` (status=${status})` : ""}`);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Network error getting requests: ${message}`);
      throw new Error(`Network error: ${message}`);
    }

    if (!response.ok) {
      const error = await response.text();
      log.error(`Failed to get requests (${response.status}): ${error}`);
      throw new ApiError(response.status, `Failed to get requests: ${error}`);
    }

    const data: SongRequestResponse[] = await response.json();
    log.debug(`Retrieved ${data.length} requests`);

    return data.map((item) => ({
      id: item.id,
      title: item.title,
      status: item.status,
      guest_name: item.guest_name,
      requested_at: item.requested_at,
      youtube_id: item.youtube_id,
      artist: item.artist,
      duration: item.duration,
      thumbnail_url: item.thumbnail_url,
    }));
  },

  /**
   * Approve a song request.
   * The approved song will be added to the queue.
   */
  async approveRequest(
    accessToken: string,
    sessionId: string,
    requestId: string
  ): Promise<void> {
    if (!accessToken || accessToken.trim() === "") {
      throw new Error("Access token is required");
    }
    if (!sessionId || sessionId.trim() === "") {
      throw new Error("Session ID is required");
    }
    if (!requestId || requestId.trim() === "") {
      throw new Error("Request ID is required");
    }

    log.debug(`Approving request ${requestId} for session ${sessionId}`);

    let response: Response;
    try {
      response = await fetch(`${HOMEKARAOKE_API_URL}/api/session/${sessionId}/requests`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "approve", requestId }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Network error approving request: ${message}`);
      throw new Error(`Network error: ${message}`);
    }

    if (!response.ok) {
      const error = await response.text();
      log.error(`Failed to approve request (${response.status}): ${error}`);
      throw new ApiError(response.status, `Failed to approve request: ${error}`);
    }

    log.debug(`Request ${requestId} approved`);
  },

  /**
   * Reject a song request.
   * The request will be marked as rejected and won't be added to the queue.
   */
  async rejectRequest(
    accessToken: string,
    sessionId: string,
    requestId: string
  ): Promise<void> {
    if (!accessToken || accessToken.trim() === "") {
      throw new Error("Access token is required");
    }
    if (!sessionId || sessionId.trim() === "") {
      throw new Error("Session ID is required");
    }
    if (!requestId || requestId.trim() === "") {
      throw new Error("Request ID is required");
    }

    log.debug(`Rejecting request ${requestId} for session ${sessionId}`);

    let response: Response;
    try {
      response = await fetch(`${HOMEKARAOKE_API_URL}/api/session/${sessionId}/requests`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "reject", requestId }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Network error rejecting request: ${message}`);
      throw new Error(`Network error: ${message}`);
    }

    if (!response.ok) {
      const error = await response.text();
      log.error(`Failed to reject request (${response.status}): ${error}`);
      throw new ApiError(response.status, `Failed to reject request: ${error}`);
    }

    log.debug(`Request ${requestId} rejected`);
  },

  /**
   * End a hosted session.
   * Guests will no longer be able to join or submit songs.
   */
  async endHostedSession(
    accessToken: string,
    sessionId: string
  ): Promise<void> {
    if (!accessToken || accessToken.trim() === "") {
      throw new Error("Access token is required");
    }
    if (!sessionId || sessionId.trim() === "") {
      throw new Error("Session ID is required");
    }

    log.info(`Ending hosted session: ${sessionId}`);

    let response: Response;
    try {
      response = await fetch(`${HOMEKARAOKE_API_URL}/api/session/${sessionId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(`Network error ending session: ${message}`);
      throw new Error(`Network error: ${message}`);
    }

    if (!response.ok) {
      const error = await response.text();
      log.error(`Failed to end hosted session (${response.status}): ${error}`);
      throw new ApiError(response.status, `Failed to end hosted session: ${error}`);
    }

    log.info("Hosted session ended");
  },
};
