# Fix Plan

Prioritized list of tasks for Ralph autonomous development.

## Status Legend
- [ ] Not started
- [~] In progress
- [x] Complete

---

# Current: Desktop App Authentication - Implementation

References:
- `plan/desktop-app-authentication-prd.md` for full specification.
- `plan/desktop-app-authentication-tasks.md` for detailed task breakdown.

---

## Phase 1: Deep Link Plugin Setup

### P1.1: Add deep-link dependency
- [ ] Add `tauri-plugin-deep-link = "2"` to `src-tauri/Cargo.toml`
- [ ] Run `cargo check`

### P1.2: Configure deep link scheme
- [ ] Add `deep-link` plugin config to `src-tauri/tauri.conf.json`
- [ ] Set scheme to `homekaraoke`

### P1.3: Initialize plugin
- [ ] Add `mod auth;` to `src-tauri/src/lib.rs`
- [ ] Add `.plugin(tauri_plugin_deep_link::init())` to builder
- [ ] Create `src-tauri/src/auth.rs` with URL handler
- [ ] Emit `auth:callback` event to frontend on deep link receive

---

## Phase 2: Keychain Storage

### P2.1: Add keyring dependency
- [ ] Add `keyring = "3"` to `src-tauri/Cargo.toml`
- [ ] Run `cargo check`

### P2.2: Create keychain module
- [ ] Create `src-tauri/src/keychain.rs`
- [ ] Add `mod keychain;` to `lib.rs`
- [ ] Implement `store_auth_tokens(access, refresh, expires_at)`
- [ ] Implement `get_auth_tokens() -> Option<AuthTokens>`
- [ ] Implement `clear_auth_tokens()`
- [ ] Handle keychain access errors gracefully

---

## Phase 3: Tauri Auth Commands

### P3.1: Create auth commands
- [ ] Create `src-tauri/src/commands/auth.rs`
- [ ] Add `mod auth;` to `commands/mod.rs`
- [ ] Implement `auth_store_tokens` command
- [ ] Implement `auth_get_tokens` command
- [ ] Implement `auth_clear_tokens` command
- [ ] Implement `auth_open_login` command (opens browser)

### P3.2: Register commands
- [ ] Add auth commands to `invoke_handler![]` in `lib.rs`
- [ ] Run `cargo check`

---

## Phase 4: Frontend Auth Service

### P4.1: Create auth service
- [ ] Create `src/services/auth.ts`
- [ ] Export from `src/services/index.ts`
- [ ] Implement `storeTokens(access, refresh, expiresAt)`
- [ ] Implement `getTokens(): Promise<AuthTokens | null>`
- [ ] Implement `clearTokens()`
- [ ] Implement `openLogin()`
- [ ] Add logging with `createLogger("AuthService")`

### P4.2: Add token refresh logic
- [ ] Implement `refreshTokenIfNeeded(): Promise<string | null>`
- [ ] Check expiry with 5-minute margin
- [ ] Call Supabase refresh endpoint
- [ ] Store new tokens on success

### P4.3: Create Supabase client wrapper
- [ ] Create `src/services/supabase.ts`
- [ ] Export from `src/services/index.ts`
- [ ] Add Supabase URL and anon key constants
- [ ] Implement `createAuthenticatedClient()`

---

## Phase 5: Auth Zustand Store

### P5.1: Create auth store
- [ ] Create `src/stores/authStore.ts`
- [ ] Export from `src/stores/index.ts`
- [ ] Define `AuthState` interface (user, isAuthenticated, isLoading, isOffline)
- [ ] Define `User` interface (id, email, displayName, avatarUrl)
- [ ] Initialize store with `create<AuthState>()`

### P5.2: Implement store actions
- [ ] Implement `initialize()` - check existing tokens on app start
- [ ] Implement `signIn()` - open browser for OAuth
- [ ] Implement `signOut()` - clear tokens and state
- [ ] Implement `handleAuthCallback(params)` - process deep link
- [ ] Implement `refreshSession()` - refresh tokens

### P5.3: Add deep link listener
- [ ] Listen for `auth:callback` Tauri event
- [ ] Parse URL params (access_token, refresh_token, expires_at, state)
- [ ] Validate state param for CSRF protection
- [ ] Call `handleAuthCallback` on valid callback

---

## Phase 6: Auth UI Components

### P6.1: Create SignInPrompt component
- [ ] Create `src/components/auth/SignInPrompt.tsx`
- [ ] Add "Sign in with Google" button
- [ ] Add "Sign in with Apple" button
- [ ] Add "Sign in with Email" button
- [ ] Add "Continue without account" link
- [ ] Add loading spinner state

### P6.2: Create UserMenu component
- [ ] Create `src/components/auth/UserMenu.tsx`
- [ ] Show user avatar and name
- [ ] Add dropdown with "Account Settings" link
- [ ] Add "Sign Out" button in dropdown

### P6.3: Create AuthStatus wrapper
- [ ] Create `src/components/auth/AuthStatus.tsx`
- [ ] Create `src/components/auth/index.ts` barrel export
- [ ] Show SignInPrompt when not authenticated
- [ ] Show UserMenu when authenticated
- [ ] Handle loading state

---

## Phase 7: App Integration

### P7.1: Initialize auth on startup
- [ ] Import authStore in `src/App.tsx`
- [ ] Call `authStore.initialize()` in useEffect
- [ ] Set up token refresh interval (every 4 minutes)

### P7.2: Add AuthStatus to header
- [ ] Import AuthStatus in header component
- [ ] Position in top-right of header
- [ ] Verify responsive layout

### P7.3: Handle offline mode
- [ ] Add `isOffline` state to authStore
- [ ] Listen for `online`/`offline` window events
- [ ] Skip token refresh when offline
- [ ] Add offline indicator to UI

---

## Phase 8: Testing

### P8.1: Manual test cases
- [ ] Fresh sign in (no existing session)
- [ ] Session persistence (restart app, still signed in)
- [ ] Token refresh (wait for near-expiry)
- [ ] Sign out (clears everything)
- [ ] Cancel sign in (close browser mid-flow)
- [ ] Offline mode (disconnect network)
- [ ] Account switch (sign out, sign in different account)

### P8.2: E2E tests (mock callback)
- [ ] Create `tests/e2e/auth.spec.ts`
- [ ] Test sign-in button opens browser
- [ ] Test mock callback stores tokens
- [ ] Test sign-out clears state

---

## Phase 9: Documentation

### P9.1: Update CLAUDE.md
- [ ] Document authStore pattern
- [ ] Document auth service pattern
- [ ] Document keychain commands

### P9.2: Update deployment docs
- [ ] Note deep link requirements in `plan/deployment.md`
- [ ] Document any macOS entitlements needed

---

## Completion Criteria

A task is complete when:
1. Code compiles without warnings
2. `just check` passes
3. Tests added for testable functionality
4. All tests pass (`just test`)
5. Changelog updated (if user-facing)

---

## Workflow

### At Phase Start
1. Ensure website auth endpoints are deployed
2. Create GitHub issue and update line 3
3. Create feature branch: `feature/<issue>-desktop-auth`

### During Development
1. Pick next unchecked task
2. Write failing test first (when testable)
3. Implement until test passes
4. Run `just check`
5. Commit with descriptive message
6. Mark task done: `- [x]`
7. Push regularly

### At Phase End
1. Verify all tasks checked
2. Run `just test`
3. Update `CHANGELOG.md`
4. Create PR: `gh pr create`
5. **STOP** - wait for approval

---

## Dependencies

### Cargo dependencies:
```toml
tauri-plugin-deep-link = "2"
keyring = "3"
```

### npm dependencies:
```bash
npm install @supabase/supabase-js
```

### Environment variables:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

---

## New Files

### Rust
- `src-tauri/src/auth.rs`
- `src-tauri/src/keychain.rs`
- `src-tauri/src/commands/auth.rs`

### TypeScript
- `src/services/auth.ts`
- `src/services/supabase.ts`
- `src/stores/authStore.ts`
- `src/components/auth/SignInPrompt.tsx`
- `src/components/auth/UserMenu.tsx`
- `src/components/auth/AuthStatus.tsx`
- `src/components/auth/index.ts`
- `tests/e2e/auth.spec.ts`
