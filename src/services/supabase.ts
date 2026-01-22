import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createLogger } from "./logger";
import type { AuthTokens } from "./auth";

const log = createLogger("SupabaseService");

// Supabase configuration from environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

/**
 * Check if Supabase is configured.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Create a Supabase client without authentication.
 * Use this for anonymous operations only.
 */
export function createAnonClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Create an authenticated Supabase client using the provided tokens.
 * The client will not auto-refresh tokens - the app handles refresh separately.
 */
export async function createAuthenticatedClient(
  tokens: AuthTokens
): Promise<SupabaseClient> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  log.debug("Creating authenticated Supabase client");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false, // We handle persistence via OS keychain
    },
  });

  // Set the session from stored tokens
  const { error } = await supabase.auth.setSession({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
  });

  if (error) {
    log.error(`Failed to set session: ${error.message}`);
    throw error;
  }

  return supabase;
}
