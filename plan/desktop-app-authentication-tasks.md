# Desktop App Authentication - Implementation Tasks

**Related:** [desktop-app-authentication-prd.md](./desktop-app-authentication-prd.md)

This document breaks down the authentication implementation into discrete, actionable tasks organized by phase.

---

## Phase 1: Deep Link Plugin Setup

### Task 1.1: Add tauri-plugin-deep-link dependency

**Files:**
- `src-tauri/Cargo.toml`

**Work:**
- Add `tauri-plugin-deep-link = "2"` to dependencies
- Run `cargo check` to verify

**Acceptance:**
- [ ] Dependency added and compiles

---

### Task 1.2: Configure deep link scheme in tauri.conf.json

**Files:**
- `src-tauri/tauri.conf.json`

**Work:**
- Add `deep-link` plugin configuration with `homekaraoke` scheme
- Configure for macOS (Info.plist gets updated automatically)

**Reference:**
```json
{
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["homekaraoke"]
      }
    }
  }
}
```

**Acceptance:**
- [ ] Deep link scheme registered
- [ ] App can be launched via `homekaraoke://` URL

---

### Task 1.3: Initialize deep link plugin in lib.rs

**Files:**
- `src-tauri/src/lib.rs`

**Work:**
- Import `tauri_plugin_deep_link::DeepLinkExt`
- Add `.plugin(tauri_plugin_deep_link::init())` to builder
- Register URL handler in setup closure
- Emit event to frontend when auth callback received

**Pattern (from lib.rs:228-231):**
```rust
builder
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init())  // Add this
```

**Acceptance:**
- [ ] Plugin initializes without error
- [ ] URL callback handler registered
- [ ] Frontend receives `auth:callback` event with URL params

---

## Phase 2: Secure Token Storage (Keychain)

### Task 2.1: Add keyring dependency

**Files:**
- `src-tauri/Cargo.toml`

**Work:**
- Add `keyring = "3"` to dependencies (latest v3 has better cross-platform support)
- Run `cargo check` to verify

**Acceptance:**
- [ ] Dependency added and compiles

---

### Task 2.2: Create keychain module

**Files:**
- `src-tauri/src/keychain.rs` (new)
- `src-tauri/src/lib.rs` (add mod declaration)

**Work:**
- Create keychain module with token storage functions
- Service name: `com.homekaraoke.app`
- Store: access_token, refresh_token, expires_at

**Functions:**
```rust
pub fn store_auth_tokens(access_token: &str, refresh_token: &str, expires_at: i64) -> Result<(), KeychainError>
pub fn get_auth_tokens() -> Result<Option<AuthTokens>, KeychainError>
pub fn clear_auth_tokens() -> Result<(), KeychainError>
```

**Acceptance:**
- [ ] Can store tokens in OS keychain
- [ ] Can retrieve tokens from OS keychain
- [ ] Can clear tokens from OS keychain
- [ ] Errors handled gracefully (keychain access denied, etc.)

---

## Phase 3: Auth Tauri Commands

### Task 3.1: Create auth commands module

**Files:**
- `src-tauri/src/commands/auth.rs` (new)
- `src-tauri/src/commands/mod.rs` (add mod declaration)

**Work:**
- Create auth commands module
- Implement commands that wrap keychain functions

**Commands:**
```rust
#[tauri::command]
pub fn auth_store_tokens(access_token: String, refresh_token: String, expires_at: i64) -> Result<(), String>

#[tauri::command]
pub fn auth_get_tokens() -> Result<Option<AuthTokens>, String>

#[tauri::command]
pub fn auth_clear_tokens() -> Result<(), String>

#[tauri::command]
pub fn auth_open_login() -> Result<(), String>  // Opens browser to website login
```

**Acceptance:**
- [ ] All commands callable from frontend
- [ ] Proper error handling and logging

---

### Task 3.2: Register auth commands in invoke_handler

**Files:**
- `src-tauri/src/lib.rs`

**Work:**
- Add auth commands to `invoke_handler` macro
- Follow existing pattern at lib.rs:260-352

**Acceptance:**
- [ ] Commands registered without compilation errors

---

## Phase 4: Frontend Auth Service

### Task 4.1: Create auth service

**Files:**
- `src/services/auth.ts` (new)
- `src/services/index.ts` (export)

**Work:**
- Create auth service following session.ts pattern
- Wrap Tauri invoke calls
- Add token refresh logic

**Functions:**
```typescript
export const authService = {
  async storeTokens(accessToken: string, refreshToken: string, expiresAt: number): Promise<void>
  async getTokens(): Promise<AuthTokens | null>
  async clearTokens(): Promise<void>
  async openLogin(): Promise<void>
  async refreshTokenIfNeeded(): Promise<string | null>  // Returns new access token or null if failed
}
```

**Pattern (from session.ts:40-55):**
```typescript
export const sessionService = {
  async createSinger(...): Promise<Singer> {
    log.info(`Creating singer: ${name}`);
    return await invoke<Singer>("create_singer", { ... });
  },
}
```

**Acceptance:**
- [ ] Service exports all required functions
- [ ] Proper logging with createLogger
- [ ] Error handling for IPC failures

---

### Task 4.2: Create Supabase client wrapper

**Files:**
- `src/services/supabase.ts` (new)
- `src/services/index.ts` (export)

**Work:**
- Create authenticated Supabase client factory
- Handle token refresh on session set
- Export anon key and URL (from env or config)

**Note:** This will be used later for cloud playlist sync. For now, just set up the client infrastructure.

**Acceptance:**
- [ ] Can create authenticated client with stored tokens
- [ ] Client configured for desktop (no session persistence)

---

## Phase 5: Auth Store (Zustand)

### Task 5.1: Create auth store

**Files:**
- `src/stores/authStore.ts` (new)
- `src/stores/index.ts` (export)

**Work:**
- Create Zustand store following sessionStore.ts pattern
- Manage auth state: user, isAuthenticated, isLoading

**State:**
```typescript
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isOffline: boolean;

  // Actions
  initialize: () => Promise<void>;  // Check for existing tokens on app start
  signIn: () => Promise<void>;      // Open browser for OAuth
  signOut: () => Promise<void>;     // Clear tokens and state
  handleAuthCallback: (params: AuthCallbackParams) => Promise<void>;
  refreshSession: () => Promise<void>;
}

interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}
```

**Pattern (from sessionStore.ts:61-70):**
```typescript
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  // ...
}));
```

**Acceptance:**
- [ ] Store exports with all state and actions
- [ ] Follows existing Zustand patterns
- [ ] Proper logging

---

### Task 5.2: Add deep link event listener

**Files:**
- `src/stores/authStore.ts`

**Work:**
- Listen for `auth:callback` event from Tauri
- Parse URL params (access_token, refresh_token, expires_at, state)
- Validate state parameter (CSRF protection)
- Call handleAuthCallback to store tokens

**Acceptance:**
- [ ] Event listener registered on store creation
- [ ] URL params correctly parsed
- [ ] Tokens stored on successful callback

---

## Phase 6: Auth UI Components

### Task 6.1: Create SignInPrompt component

**Files:**
- `src/components/auth/SignInPrompt.tsx` (new)
- `src/components/auth/index.ts` (new, barrel export)
- `src/components/index.ts` (add export)

**Work:**
- Create sign-in prompt for unauthenticated users
- Buttons: "Sign in with Google", "Sign in with Apple", "Sign in with Email"
- "Continue without account" option
- Loading state while auth in progress

**Design:** Match existing dark theme (gray-900 background, Tailwind)

**Acceptance:**
- [ ] Component renders all sign-in options
- [ ] Loading state shows spinner
- [ ] Clicking buttons triggers signIn action

---

### Task 6.2: Create UserMenu component

**Files:**
- `src/components/auth/UserMenu.tsx` (new)

**Work:**
- Dropdown menu for signed-in users
- Show avatar and name
- Options: "Account Settings" (link to website), "Sign Out"
- Use existing dropdown patterns from codebase

**Acceptance:**
- [ ] Shows user avatar/name when authenticated
- [ ] Dropdown opens on click
- [ ] Sign out clears auth state

---

### Task 6.3: Create AuthStatus component

**Files:**
- `src/components/auth/AuthStatus.tsx` (new)

**Work:**
- Wrapper component that shows SignInPrompt or UserMenu based on auth state
- Used in header/sidebar for auth UI

**Acceptance:**
- [ ] Renders SignInPrompt when not authenticated
- [ ] Renders UserMenu when authenticated
- [ ] Handles loading state

---

## Phase 7: App Integration

### Task 7.1: Initialize auth on app startup

**Files:**
- `src/App.tsx` or main entry point

**Work:**
- Call authStore.initialize() on app mount
- Check for existing tokens and validate
- Set up token refresh interval

**Acceptance:**
- [ ] Auth state restored on app restart
- [ ] Invalid tokens cleared automatically
- [ ] Token refresh scheduled

---

### Task 7.2: Add AuthStatus to app header

**Files:**
- `src/components/layout/Header.tsx` (or equivalent)

**Work:**
- Add AuthStatus component to header
- Position in top-right (standard location)

**Acceptance:**
- [ ] Auth UI visible in app header
- [ ] Responsive design maintained

---

### Task 7.3: Handle offline mode

**Files:**
- `src/stores/authStore.ts`
- `src/App.tsx`

**Work:**
- Listen for online/offline events
- Update isOffline state
- Skip token refresh when offline
- Show offline indicator in UI

**Acceptance:**
- [ ] App detects online/offline status
- [ ] Works with cached user data when offline
- [ ] Visual indicator when offline

---

## Phase 8: Website Integration (Reference Only)

**Note:** These tasks are for the karaoke-website repository, documented here for completeness.

### Task 8.1: Create /auth/app-login page

- Accept redirect_uri and state params
- Validate redirect_uri against allowlist
- Store params in session
- Redirect to login flow

### Task 8.2: Create /auth/app-callback route

- Verify user authenticated
- Generate tokens
- Redirect to app via deep link with tokens

---

## Phase 9: Testing

### Task 9.1: Manual test plan execution

**Work:**
- Fresh sign in flow
- Session persistence across restarts
- Token refresh (wait for expiry)
- Sign out
- Cancel sign in (close browser)
- Offline mode
- Account switch

**Acceptance:**
- [ ] All manual tests pass

---

### Task 9.2: E2E test for auth flow

**Files:**
- `tests/e2e/auth.spec.ts` (new)

**Work:**
- Mock deep link callback
- Test sign in initiates browser open
- Test token storage
- Test sign out clears state

**Note:** Full OAuth flow can't be E2E tested, but we can test the app's handling of callbacks.

**Acceptance:**
- [ ] E2E tests pass for mockable auth flows

---

## Phase 10: Documentation

### Task 10.1: Update CLAUDE.md with auth patterns

**Files:**
- `CLAUDE.md`

**Work:**
- Document auth store pattern
- Document auth service pattern
- Document keychain usage

**Acceptance:**
- [ ] Auth patterns documented

---

### Task 10.2: Update plan/deployment.md if needed

**Files:**
- `plan/deployment.md`

**Work:**
- Document any new build requirements for deep links
- Note keychain entitlements if needed for macOS

**Acceptance:**
- [ ] Deployment docs updated

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1.1-1.3 | Deep link plugin setup |
| 2 | 2.1-2.2 | Keychain storage |
| 3 | 3.1-3.2 | Tauri auth commands |
| 4 | 4.1-4.2 | Frontend auth service |
| 5 | 5.1-5.2 | Auth Zustand store |
| 6 | 6.1-6.3 | Auth UI components |
| 7 | 7.1-7.3 | App integration |
| 8 | 8.1-8.2 | Website (reference) |
| 9 | 9.1-9.2 | Testing |
| 10 | 10.1-10.2 | Documentation |

**Total: 10 phases, 26 tasks**

---

## Dependencies

```
Phase 1 (Deep Link) ─┬─> Phase 3 (Commands) ──> Phase 4 (Service) ──> Phase 5 (Store) ──> Phase 6 (UI) ──> Phase 7 (Integration)
                     │
Phase 2 (Keychain) ──┘

Phase 8 (Website) ──────────────────────────────────────────────────────────────────────> Phase 9 (Testing)

Phase 10 (Docs) can run in parallel after Phase 7
```
