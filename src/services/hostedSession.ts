import { fetch } from "@tauri-apps/plugin-http";
import { createLogger } from "./logger";
import { HOMEKARAOKE_API_URL, buildJoinUrl, buildQrCodeUrl } from "../constants";

const log = createLogger("HostedSessionService");

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
  status: "active" | "paused" | "ended";
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
  status: "active" | "paused" | "ended";
  stats: {
    pending_requests: number;
    approved_requests: number;
    total_guests: number;
  };
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
      throw new Error(`Failed to create hosted session: ${error}`);
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
      throw new Error(`Failed to get session: ${error}`);
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
      throw new Error(`Failed to end hosted session: ${error}`);
    }

    log.info("Hosted session ended");
  },
};
