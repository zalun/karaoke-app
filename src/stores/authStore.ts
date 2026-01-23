import { create } from "zustand";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createLogger } from "../services";
import { authService, type AuthTokens, type User } from "../services/auth";
import { createAuthenticatedClient, isSupabaseConfigured } from "../services/supabase";
import { notify } from "./notificationStore";

const log = createLogger("AuthStore");

// Token refresh interval: 4 minutes (tokens expire in ~1 hour, refresh well before)
const TOKEN_REFRESH_INTERVAL_MS = 4 * 60 * 1000;

export interface AuthState {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isOffline: boolean;

  // Actions
  initialize: () => Promise<void>;
  signIn: () => Promise<void>;
  cancelSignIn: () => void;
  signOut: () => Promise<void>;
  handleAuthCallback: (params: Record<string, string>) => Promise<void>;
  refreshSession: () => Promise<void>;
  setOffline: (offline: boolean) => void;

  // Internal
  _cleanup: () => void;
  fetchUserProfile: (tokens: AuthTokens) => Promise<void>;
}

// Store unlisten function and interval for cleanup
let unlistenDeepLink: UnlistenFn | null = null;
let refreshInterval: ReturnType<typeof setInterval> | null = null;

// Store references to event handlers for cleanup (fix memory leak)
let onlineHandler: (() => void) | null = null;
let offlineHandler: (() => void) | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isOffline: false,

  initialize: async () => {
    log.info("Initializing auth store");
    set({ isLoading: true });

    try {
      // Set up deep link listener for auth callback
      if (!unlistenDeepLink) {
        unlistenDeepLink = await listen<Record<string, string>>(
          "auth:callback",
          (event) => {
            log.info("Received auth callback event");
            get().handleAuthCallback(event.payload);
          }
        );
        log.debug("Deep link listener registered");

        // Check for pending callback that arrived before listener was ready
        // (handles race condition when app is launched via deep link)
        const pendingCallback = await authService.getPendingCallback();
        if (pendingCallback) {
          log.info("Found pending auth callback, processing...");
          await get().handleAuthCallback(pendingCallback);
          return; // handleAuthCallback will set the final state
        }
      }

      // Set up online/offline listeners (store references for cleanup)
      if (!onlineHandler) {
        onlineHandler = () => get().setOffline(false);
        offlineHandler = () => get().setOffline(true);
        window.addEventListener("online", onlineHandler);
        window.addEventListener("offline", offlineHandler);
      }
      set({ isOffline: !navigator.onLine });

      // Check for existing tokens
      const tokens = await authService.getTokens();
      if (!tokens) {
        log.info("No stored tokens found");
        set({ isLoading: false, isAuthenticated: false });
        return;
      }

      log.info("Found stored tokens, validating...");

      // Try to validate and refresh tokens
      const validTokens = await authService.refreshTokenIfNeeded();
      if (!validTokens) {
        log.warn("Stored tokens are invalid, clearing");
        await authService.clearTokens();
        set({ isLoading: false, isAuthenticated: false, user: null });
        return;
      }

      // Fetch user profile
      await get().fetchUserProfile(validTokens);

      // Set up token refresh interval (clear any existing to prevent duplicates)
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
      refreshInterval = setInterval(() => {
        if (!get().isOffline) {
          get().refreshSession();
        }
      }, TOKEN_REFRESH_INTERVAL_MS);
      log.debug("Token refresh interval set");

      set({ isLoading: false });
    } catch (error) {
      log.error(`Initialize error: ${error}`);
      set({ isLoading: false, isAuthenticated: false, user: null });
    }
  },

  signIn: async () => {
    log.info("Starting sign in flow");
    set({ isLoading: true });

    try {
      await authService.openLogin();
      // Loading state will be cleared when callback is received
      // or if user cancels via cancelSignIn
    } catch (error) {
      log.error(`Sign in error: ${error}`);
      set({ isLoading: false });
      notify("error", "Failed to open sign in page");
      throw error;
    }
  },

  cancelSignIn: () => {
    log.info("Sign in cancelled");
    set({ isLoading: false });
  },

  signOut: async () => {
    log.info("Signing out");
    set({ isLoading: true });

    try {
      // Try to sign out from Supabase (optional, may fail if offline)
      const tokens = await authService.getTokens();
      if (tokens && isSupabaseConfigured()) {
        try {
          const supabase = await createAuthenticatedClient(tokens);
          await supabase.auth.signOut();
        } catch (e) {
          log.warn(`Supabase sign out failed (continuing): ${e}`);
        }
      }

      // Always clear local tokens
      await authService.clearTokens();

      // Clear refresh interval
      if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
      }

      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });

      log.info("Sign out complete");
    } catch (error) {
      log.error(`Sign out error: ${error}`);
      // Still clear local state even if server call fails
      await authService.clearTokens();
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  handleAuthCallback: async (params: Record<string, string>) => {
    log.info("Handling auth callback");
    set({ isLoading: true });

    try {
      const { access_token, refresh_token, expires_at, state } = params;

      // Validate required params
      if (!access_token || !refresh_token) {
        log.error("Missing tokens in callback");
        notify("error", "Sign in failed: missing authentication tokens");
        set({ isLoading: false });
        return;
      }

      // Validate state for CSRF protection (required - reject if missing or invalid)
      if (!state) {
        log.error("Missing state parameter - possible CSRF attack");
        notify("error", "Sign in failed: security validation error");
        set({ isLoading: false });
        return;
      }
      if (!authService.validateState(state)) {
        log.error("Invalid state parameter - possible CSRF attack");
        notify("error", "Sign in failed: security validation error");
        set({ isLoading: false });
        return;
      }

      // Parse expires_at (comes as string from URL params)
      let expiresAt = parseInt(expires_at, 10);
      if (isNaN(expiresAt) || expiresAt <= 0) {
        log.warn("Invalid or missing expires_at, using 1 hour fallback");
        expiresAt = Math.floor(Date.now() / 1000) + 3600;
      }

      // Store tokens securely
      await authService.storeTokens(access_token, refresh_token, expiresAt);

      const tokens: AuthTokens = {
        access_token,
        refresh_token,
        expires_at: expiresAt,
      };

      // Fetch user profile
      await get().fetchUserProfile(tokens);

      // Set up token refresh interval (clear any existing to prevent duplicates)
      if (refreshInterval) {
        clearInterval(refreshInterval);
      }
      refreshInterval = setInterval(() => {
        if (!get().isOffline) {
          get().refreshSession();
        }
      }, TOKEN_REFRESH_INTERVAL_MS);
      log.debug("Token refresh interval set");

      set({ isLoading: false });
      log.info("Auth callback handled successfully");
    } catch (error) {
      log.error(`Auth callback error: ${error}`);
      notify("error", "Sign in failed: unable to complete authentication");
      set({ isLoading: false, isAuthenticated: false, user: null });
    }
  },

  refreshSession: async () => {
    if (get().isOffline) {
      log.debug("Skipping token refresh (offline)");
      return;
    }

    log.debug("Refreshing session");

    try {
      const tokens = await authService.refreshTokenIfNeeded();
      if (!tokens) {
        log.warn("Token refresh failed, signing out");
        await get().signOut();
        return;
      }

      // Update user profile in case it changed
      await get().fetchUserProfile(tokens);
    } catch (error) {
      log.error(`Session refresh error: ${error}`);
    }
  },

  setOffline: (offline: boolean) => {
    log.info(`Online status changed: ${offline ? "offline" : "online"}`);
    set({ isOffline: offline });

    // When coming back online, refresh session
    if (!offline && get().isAuthenticated) {
      get().refreshSession();
    }
  },

  _cleanup: () => {
    if (unlistenDeepLink) {
      unlistenDeepLink();
      unlistenDeepLink = null;
    }
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
    // Remove online/offline listeners to prevent memory leak
    if (onlineHandler) {
      window.removeEventListener("online", onlineHandler);
      onlineHandler = null;
    }
    if (offlineHandler) {
      window.removeEventListener("offline", offlineHandler);
      offlineHandler = null;
    }
  },

  // Internal helper to fetch user profile
  fetchUserProfile: async (tokens: AuthTokens) => {
    if (!isSupabaseConfigured()) {
      log.warn("Supabase not configured, skipping profile fetch");
      set({ isAuthenticated: true, user: null });
      return;
    }

    try {
      const supabase = await createAuthenticatedClient(tokens);
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        log.error(`Failed to fetch user profile: ${error?.message || "No user"}`);
        notify("error", "Sign in failed: unable to load user profile");
        // Clear tokens and refresh interval to avoid inconsistent state
        await authService.clearTokens();
        if (refreshInterval) {
          clearInterval(refreshInterval);
          refreshInterval = null;
        }
        set({ isAuthenticated: false, user: null });
        return;
      }

      const authUser: User = {
        id: user.id,
        email: user.email || "",
        displayName: user.user_metadata?.full_name || user.user_metadata?.name || user.email || "User",
        avatarUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture || null,
      };

      set({ isAuthenticated: true, user: authUser });
      log.info(`User profile loaded: ${authUser.email}`);
    } catch (error) {
      log.error(`Profile fetch error: ${error}`);
      // Still mark as authenticated if tokens are valid
      set({ isAuthenticated: true, user: null });
    }
  },
}));
