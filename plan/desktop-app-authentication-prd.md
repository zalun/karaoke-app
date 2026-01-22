# PRD: Desktop App Authentication

**Status:** Draft
**Author:** Claude Code
**Related:** plan/AUTH_FLOW.md, plan/cloud-playlists-web-api-spec.md

---

## Overview

Enable the HomeKaraoke desktop app (Tauri) to authenticate users and access their cloud playlists, song history, and host session features. Authentication uses OAuth via the website with deep linking to pass credentials back to the app.

---

## Problem Statement

The desktop app cannot currently access user playlists stored in the cloud. Users must manually manage playlists in both the app and website separately. The app needs to authenticate with Supabase to:

1. Fetch user's cloud playlists
2. Sync local playlists to the cloud
3. Access song history
4. Create and manage host sessions

---

## Goals

1. Allow desktop app users to sign in with their existing account (Google/Apple/Email)
2. Securely pass authentication tokens from website to app
3. Persist authentication across app restarts
4. Support sign out and account switching
5. Gracefully handle offline mode

---

## User Stories

1. **As a desktop app user**, I want to sign in with my Google account, so I can access my cloud playlists.
2. **As a signed-in user**, I want my session to persist when I restart the app, so I don't have to sign in every time.
3. **As a user**, I want to sign out of the app, so I can switch accounts or protect my privacy.
4. **As a user without internet**, I want to continue using local features, so the app remains functional offline.

---

## Authentication Flow

### Sequence Diagram

```
┌─────────┐          ┌─────────────┐          ┌──────────────┐          ┌──────────┐
│   App   │          │   Browser   │          │   Website    │          │ Supabase │
└────┬────┘          └──────┬──────┘          └──────┬───────┘          └────┬─────┘
     │                      │                        │                       │
     │  1. User clicks      │                        │                       │
     │     "Sign In"        │                        │                       │
     │──────────────────────┼───────────────────────>│                       │
     │                      │  2. Open browser to    │                       │
     │                      │     /auth/app-login    │                       │
     │                      │<───────────────────────│                       │
     │                      │                        │                       │
     │                      │  3. User authenticates │                       │
     │                      │     (Google/Apple/     │                       │
     │                      │      Email)            │                       │
     │                      │────────────────────────┼──────────────────────>│
     │                      │                        │                       │
     │                      │                        │  4. OAuth callback    │
     │                      │                        │<──────────────────────│
     │                      │                        │                       │
     │                      │  5. Redirect to        │                       │
     │                      │     homekaraoke://     │                       │
     │                      │     auth/callback      │                       │
     │                      │     ?token=...         │                       │
     │<─────────────────────│                        │                       │
     │                      │                        │                       │
     │  6. App receives     │                        │                       │
     │     deep link with   │                        │                       │
     │     session token    │                        │                       │
     │                      │                        │                       │
     │  7. Store token      │                        │                       │
     │     securely         │                        │                       │
     │                      │                        │                       │
     │  8. Fetch user       │                        │                       │
     │     profile &        │                        │                       │
     │     playlists        │                        │                       │
     │──────────────────────┼───────────────────────>│───────────────────────>
     │                      │                        │                       │
```

### Flow Steps

1. **User initiates sign-in** - Clicks "Sign In" button in app
2. **App opens browser** - Opens system browser to `https://homekaraoke.app/auth/app-login`
3. **User authenticates** - Uses Google, Apple, or email/password on website
4. **OAuth completes** - Supabase redirects to `/auth/app-callback` with session
5. **Website redirects to app** - Redirects to `homekaraoke://auth/callback?access_token=...&refresh_token=...&expires_at=...`
6. **App receives deep link** - Tauri deep link handler receives the URL
7. **App stores tokens** - Saves tokens securely (OS keychain or encrypted storage)
8. **App fetches data** - Uses tokens to call Supabase APIs

---

## Technical Specification

### Website Changes

#### New Page: `/auth/app-login`

Purpose: Entry point for desktop app authentication

```typescript
// app/auth/app-login/page.tsx

// URL params:
// - redirect_uri: homekaraoke://auth/callback (validated against allowlist)
// - state: Random string for CSRF protection (generated by app)

// Behavior:
// 1. Store redirect_uri and state in session/cookie
// 2. Redirect to /login with special flag
// 3. After OAuth completes, redirect to /auth/app-callback
```

#### New Route: `/auth/app-callback`

Purpose: Generate tokens and redirect back to app

```typescript
// app/auth/app-callback/route.ts

// Behavior:
// 1. Verify user is authenticated
// 2. Retrieve stored redirect_uri and state from session
// 3. Validate redirect_uri is allowed (homekaraoke://)
// 4. Get current session tokens from Supabase
// 5. Redirect to: homekaraoke://auth/callback?
//    - access_token={token}
//    - refresh_token={token}
//    - expires_at={timestamp}
//    - state={original_state}
```

#### Security: Allowed Redirect URIs

```typescript
const ALLOWED_APP_SCHEMES = [
  'homekaraoke://',
  'com.homekaraoke.app://', // iOS-style bundle ID
];

function isValidRedirectUri(uri: string): boolean {
  return ALLOWED_APP_SCHEMES.some(scheme => uri.startsWith(scheme));
}
```

### Desktop App Changes

#### Tauri Configuration

```json
// tauri.conf.json
{
  "tauri": {
    "security": {
      "dangerousUseHttpScheme": true
    },
    "bundle": {
      "identifier": "com.homekaraoke.app"
    }
  },
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["homekaraoke"]
      }
    }
  }
}
```

#### Deep Link Handler

```rust
// src-tauri/src/main.rs or auth.rs

use tauri_plugin_deep_link::DeepLinkExt;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            app.deep_link().on_open_url(|event| {
                // Parse URL: homekaraoke://auth/callback?access_token=...
                let url = event.urls().first();
                if let Some(url) = url {
                    if url.path() == "/auth/callback" {
                        handle_auth_callback(url);
                    }
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running app");
}
```

#### Auth State Management

```typescript
// src/lib/auth.ts (Frontend)

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}
```

#### Secure Token Storage

```rust
// src-tauri/src/keychain.rs

use keyring::Entry;

const SERVICE_NAME: &str = "com.homekaraoke.app";

pub fn store_tokens(access_token: &str, refresh_token: &str) -> Result<(), Error> {
    let access_entry = Entry::new(SERVICE_NAME, "access_token")?;
    access_entry.set_password(access_token)?;

    let refresh_entry = Entry::new(SERVICE_NAME, "refresh_token")?;
    refresh_entry.set_password(refresh_token)?;

    Ok(())
}

pub fn get_tokens() -> Result<(String, String), Error> {
    let access_entry = Entry::new(SERVICE_NAME, "access_token")?;
    let refresh_entry = Entry::new(SERVICE_NAME, "refresh_token")?;

    Ok((access_entry.get_password()?, refresh_entry.get_password()?))
}

pub fn clear_tokens() -> Result<(), Error> {
    let access_entry = Entry::new(SERVICE_NAME, "access_token")?;
    let refresh_entry = Entry::new(SERVICE_NAME, "refresh_token")?;

    access_entry.delete_password()?;
    refresh_entry.delete_password()?;

    Ok(())
}
```

#### Supabase Client Initialization

```typescript
// src/lib/supabase.ts

import { createClient } from '@supabase/supabase-js';
import { invoke } from '@tauri-apps/api/core';

const supabaseUrl = 'https://your-project.supabase.co';
const supabaseAnonKey = 'your-anon-key';

export async function createAuthenticatedClient() {
  const tokens = await invoke<{ accessToken: string; refreshToken: string }>('get_tokens');

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: false, // We handle persistence via keychain
    },
  });

  // Set the session from stored tokens
  await supabase.auth.setSession({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });

  return supabase;
}
```

---

## Token Refresh Strategy

### Automatic Refresh

```typescript
// src/lib/auth.ts

const TOKEN_REFRESH_MARGIN = 5 * 60 * 1000; // 5 minutes before expiry

async function ensureValidToken(): Promise<string> {
  const state = getAuthState();

  if (!state.expiresAt || !state.refreshToken) {
    throw new Error('Not authenticated');
  }

  const now = Date.now();
  const expiresAt = state.expiresAt * 1000;

  if (now >= expiresAt - TOKEN_REFRESH_MARGIN) {
    // Token expired or expiring soon, refresh it
    const newSession = await refreshToken(state.refreshToken);
    await storeTokens(newSession);
    return newSession.access_token;
  }

  return state.accessToken!;
}

async function refreshToken(refreshToken: string): Promise<Session> {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error) throw error;
  return data.session!;
}
```

### Refresh on App Launch

```typescript
// src/App.tsx or main entry

async function initializeAuth() {
  try {
    const tokens = await invoke('get_tokens');

    if (tokens) {
      // Try to refresh the session
      const supabase = await createAuthenticatedClient();
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error) {
        // Token invalid, clear and require re-auth
        await invoke('clear_tokens');
        setAuthState({ isAuthenticated: false });
      } else {
        setAuthState({ user, isAuthenticated: true });
      }
    }
  } catch (e) {
    // No stored tokens, user needs to sign in
    setAuthState({ isAuthenticated: false });
  }
}
```

---

## Sign Out Flow

```typescript
// src/lib/auth.ts

async function signOut() {
  try {
    // 1. Clear tokens from keychain
    await invoke('clear_tokens');

    // 2. Revoke session on server (optional but recommended)
    const supabase = await createAuthenticatedClient();
    await supabase.auth.signOut();

    // 3. Clear local state
    setAuthState({
      user: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      isAuthenticated: false,
    });

    // 4. Navigate to home/login screen
    navigate('/');
  } catch (e) {
    // Even if server call fails, clear local state
    await invoke('clear_tokens');
    setAuthState({ isAuthenticated: false });
  }
}
```

---

## Offline Mode

When the app is offline:

1. **Cached user info** - Display user name/avatar from last session
2. **Local playlists** - Continue working with locally cached playlists
3. **Queue sync** - Store changes locally, sync when online
4. **Auth status** - Don't require re-auth, trust stored tokens
5. **Visual indicator** - Show offline badge in UI

```typescript
// src/lib/offline.ts

async function checkOnlineStatus(): Promise<boolean> {
  try {
    const response = await fetch('https://homekaraoke.app/api/health', {
      method: 'HEAD',
      cache: 'no-cache',
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Sync pending changes when coming online
window.addEventListener('online', async () => {
  await syncPendingChanges();
});
```

---

## Error Handling

### Authentication Errors

| Error | Cause | User Action |
|-------|-------|-------------|
| `TOKEN_EXPIRED` | Refresh token expired | Re-authenticate |
| `INVALID_TOKEN` | Token corrupted/revoked | Re-authenticate |
| `NETWORK_ERROR` | No internet connection | Retry or work offline |
| `USER_CANCELLED` | User closed browser | Show sign-in option again |
| `STATE_MISMATCH` | CSRF protection triggered | Restart sign-in flow |

### Error UI

```typescript
// Handle auth errors gracefully
async function handleAuthError(error: AuthError) {
  switch (error.code) {
    case 'TOKEN_EXPIRED':
    case 'INVALID_TOKEN':
      await invoke('clear_tokens');
      showNotification('Session expired. Please sign in again.');
      navigate('/login');
      break;

    case 'NETWORK_ERROR':
      showNotification('No internet connection. Working offline.');
      setOfflineMode(true);
      break;

    default:
      showNotification(`Authentication error: ${error.message}`);
  }
}
```

---

## UI Components

### Sign In Screen

```
┌────────────────────────────────────────┐
│                                        │
│         🎤 HomeKaraoke                 │
│                                        │
│    Sign in to access your playlists    │
│    and host karaoke sessions           │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │   🔵 Sign in with Google         │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │   🍎 Sign in with Apple          │  │
│  └──────────────────────────────────┘  │
│                                        │
│  ┌──────────────────────────────────┐  │
│  │   ✉️  Sign in with Email          │  │
│  └──────────────────────────────────┘  │
│                                        │
│         [Continue without account]     │
│                                        │
└────────────────────────────────────────┘
```

### Signed In State (Header)

```
┌────────────────────────────────────────┐
│ 🎤 HomeKaraoke    [Playlists] [Host]   │
│                              👤 John ▼ │
└────────────────────────────────────────┘

Dropdown menu:
┌─────────────────────┐
│ john@example.com    │
├─────────────────────┤
│ Account Settings    │
│ Sign Out            │
└─────────────────────┘
```

### Loading/Authenticating State

```
┌────────────────────────────────────────┐
│                                        │
│              ⏳                        │
│                                        │
│    Completing sign in...               │
│                                        │
│    Waiting for browser authentication  │
│                                        │
│            [Cancel]                    │
│                                        │
└────────────────────────────────────────┘
```

---

## Platform-Specific Notes

### macOS

- Deep link scheme registered in `Info.plist`
- Tokens stored in macOS Keychain
- Universal links optional (`https://homekaraoke.app/open/...`)

### Windows

- Deep link scheme registered in Windows Registry
- Tokens stored in Windows Credential Manager
- May require admin for protocol registration during install

### Linux

- Deep link via `.desktop` file with `MimeType`
- Tokens stored via `libsecret` (GNOME Keyring / KDE Wallet)
- Some distros may need manual protocol handler setup

---

## Files to Create/Modify

### Website (karaoke-website)

| File | Action | Description |
|------|--------|-------------|
| `app/auth/app-login/page.tsx` | CREATE | Entry point for app auth |
| `app/auth/app-callback/route.ts` | CREATE | Token handoff to app |
| `lib/auth/app-redirect.ts` | CREATE | Validation utilities |
| `app/login/page.tsx` | MODIFY | Handle app auth flow flag |

### Desktop App (karaoke-app)

| File | Action | Description |
|------|--------|-------------|
| `tauri.conf.json` | MODIFY | Add deep-link plugin |
| `Cargo.toml` | MODIFY | Add keyring dependency |
| `src-tauri/src/auth.rs` | CREATE | Auth command handlers |
| `src-tauri/src/keychain.rs` | CREATE | Secure token storage |
| `src/lib/auth.ts` | CREATE | Frontend auth state |
| `src/lib/supabase.ts` | MODIFY | Auth-aware client |
| `src/components/SignIn.tsx` | CREATE | Sign in UI |
| `src/components/UserMenu.tsx` | CREATE | Signed-in user dropdown |

---

## Acceptance Criteria

### Website

- [ ] `/auth/app-login` page accepts `redirect_uri` and `state` params
- [ ] Only allows `homekaraoke://` scheme redirect URIs
- [ ] `/auth/app-callback` correctly passes tokens via deep link
- [ ] State parameter validated to prevent CSRF
- [ ] Works with Google, Apple, and Email auth methods

### Desktop App

- [ ] "Sign In" button opens system browser
- [ ] App receives deep link callback after auth
- [ ] Tokens stored securely in OS keychain
- [ ] User profile displayed after sign in
- [ ] Session persists across app restarts
- [ ] Token automatically refreshed before expiry
- [ ] "Sign Out" clears all stored credentials
- [ ] Offline mode works with cached data
- [ ] Error states handled gracefully

---

## Testing Plan

### Manual Testing

1. **Fresh sign in** - No existing session, complete OAuth flow
2. **Session persistence** - Sign in, close app, reopen → still signed in
3. **Token refresh** - Wait for token to near expiry → auto-refreshes
4. **Sign out** - Clears tokens, returns to signed-out state
5. **Cancel sign in** - Close browser during auth → app handles gracefully
6. **Offline mode** - Disconnect network → app works with cached data
7. **Account switch** - Sign out, sign in with different account
8. **Cross-platform** - Test on macOS, Windows, Linux

### Edge Cases

- Browser already has active website session
- User denies OAuth permissions
- Network drops during token exchange
- Keychain access denied by OS
- Multiple app instances running

---

## Security Considerations

1. **Token storage** - Use OS keychain, not plaintext files
2. **CSRF protection** - Validate state parameter
3. **Scheme validation** - Only allow registered deep link schemes
4. **Token scope** - Use minimal required Supabase permissions
5. **Token exposure** - Never log tokens, even in debug mode
6. **HTTPS only** - All auth endpoints over HTTPS

---

## Future Enhancements

1. **Biometric unlock** - Touch ID / Face ID to unlock stored session
2. **Multiple accounts** - Switch between accounts without full re-auth
3. **Session management** - View/revoke sessions from website
4. **Magic link** - Email magic link that opens directly in app
5. **QR code auth** - Scan QR on website to auth app
