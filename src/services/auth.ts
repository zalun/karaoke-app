import { invoke } from "@tauri-apps/api/core";
import { createLogger } from "./logger";

const log = createLogger("AuthService");

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

// 5 minutes before expiry
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Generate a random state string for CSRF protection.
 */
function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

// Store the state for validation using sessionStorage.
// Why sessionStorage is safe here (desktop app context):
// - No cross-tab concerns (Tauri app has single webview, no tabs)
// - No cross-origin access (not a website, no untrusted content)
// - Isolated from other apps (webview sessionStorage is app-private)
// - Survives HMR reloads during development
// - Cleared on app restart (new session)
const PENDING_STATE_KEY = "homekaraoke_pending_auth_state";

function getPendingAuthState(): string | null {
  return sessionStorage.getItem(PENDING_STATE_KEY);
}

function setPendingAuthState(state: string | null): void {
  if (state) {
    sessionStorage.setItem(PENDING_STATE_KEY, state);
  } else {
    sessionStorage.removeItem(PENDING_STATE_KEY);
  }
}

export const authService = {
  /**
   * Store authentication tokens securely in the OS keychain.
   */
  async storeTokens(
    accessToken: string,
    refreshToken: string,
    expiresAt: number
  ): Promise<void> {
    log.info("Storing auth tokens");
    await invoke("auth_store_tokens", {
      accessToken,
      refreshToken,
      expiresAt,
    });
  },

  /**
   * Retrieve authentication tokens from the OS keychain.
   * Returns null if no tokens are stored.
   */
  async getTokens(): Promise<AuthTokens | null> {
    log.debug("Getting auth tokens");
    return await invoke<AuthTokens | null>("auth_get_tokens");
  },

  /**
   * Clear authentication tokens from the OS keychain.
   */
  async clearTokens(): Promise<void> {
    log.info("Clearing auth tokens");
    await invoke("auth_clear_tokens");
    setPendingAuthState(null);
  },

  /**
   * Open the system browser to the website login page for OAuth.
   * Generates and stores a state parameter for CSRF protection.
   */
  async openLogin(): Promise<void> {
    log.info("Opening browser for OAuth login");
    const state = generateState();
    setPendingAuthState(state);
    await invoke("auth_open_login", { state });
  },

  /**
   * Get the OAuth login URL without opening the browser.
   * Uses the current pending state, or generates a new one if none exists.
   * Useful for copying the URL to use in a different browser.
   */
  async getLoginUrl(): Promise<string> {
    let state = getPendingAuthState();
    if (!state) {
      state = generateState();
      setPendingAuthState(state);
    }
    return await invoke<string>("auth_get_login_url", { state });
  },

  /**
   * Get the OAuth login URL without opening the browser.
   * Uses the current pending state, or generates a new one if none exists.
   * Useful for copying the URL to use in a different browser.
   */
  async getLoginUrl(): Promise<string> {
    if (!pendingAuthState) {
      pendingAuthState = generateState();
    }
    return await invoke<string>("auth_get_login_url", { state: pendingAuthState });
  },

  /**
   * Get any pending auth callback that arrived before the listener was ready.
   * This handles the race condition when the app is launched via deep link.
   */
  async getPendingCallback(): Promise<Record<string, string> | null> {
    log.debug("Checking for pending auth callback");
    return await invoke<Record<string, string> | null>("auth_get_pending_callback");
  },

  /**
   * Validate the state parameter from the OAuth callback.
   * Returns true if the state matches the pending state.
   * Only clears pending state on successful validation to allow retries.
   */
  validateState(state: string): boolean {
    const pendingState = getPendingAuthState();
    if (!pendingState) {
      log.error("No pending auth state to validate");
      return false;
    }
    const isValid = state === pendingState;
    if (!isValid) {
      log.error("State mismatch - possible CSRF attack");
      return false; // Don't clear state - allow retry with correct state
    }
    setPendingAuthState(null); // Only clear on success
    return true;
  },

  /**
   * Check if tokens need to be refreshed based on expiry time.
   * Returns true if refresh is needed.
   */
  needsRefresh(expiresAt: number): boolean {
    const now = Date.now();
    const expiresAtMs = expiresAt * 1000;
    return now >= expiresAtMs - TOKEN_REFRESH_MARGIN_MS;
  },

  /**
   * Refresh the access token using the refresh token.
   * Returns new tokens or null if refresh failed.
   */
  async refreshTokenIfNeeded(): Promise<AuthTokens | null> {
    const tokens = await this.getTokens();
    if (!tokens) {
      log.debug("No tokens to refresh");
      return null;
    }

    if (!this.needsRefresh(tokens.expires_at)) {
      log.debug("Tokens still valid, no refresh needed");
      return tokens;
    }

    log.info("Refreshing auth tokens");
    try {
      // Import dynamically to avoid circular dependency issues
      const { createAuthenticatedClient } = await import("./supabase");
      const supabase = await createAuthenticatedClient(tokens);

      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: tokens.refresh_token,
      });

      if (error || !data.session) {
        log.error(`Token refresh failed: ${error?.message || "No session"}`);
        return null;
      }

      let expiresAt = data.session.expires_at;
      if (!expiresAt) {
        log.warn("Missing expires_at in refreshed session, using 1 hour fallback");
        expiresAt = Math.floor(Date.now() / 1000) + 3600;
      }

      const newTokens: AuthTokens = {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: expiresAt,
      };

      await this.storeTokens(
        newTokens.access_token,
        newTokens.refresh_token,
        newTokens.expires_at
      );

      log.info("Tokens refreshed successfully");
      return newTokens;
    } catch (err) {
      log.error(`Token refresh error: ${err}`);
      return null;
    }
  },
};
