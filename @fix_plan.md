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
- [x] Add `tauri-plugin-deep-link = "2"` to `src-tauri/Cargo.toml`
- [x] Run `cargo check`

### P1.2: Configure deep link scheme
- [x] Add `deep-link` plugin config to `src-tauri/tauri.conf.json`
- [x] Set scheme to `homekaraoke`

### P1.3: Initialize plugin
- [x] Add `mod keychain;` to `src-tauri/src/lib.rs`
- [x] Add `.plugin(tauri_plugin_deep_link::init())` to builder
- [x] Register deep link handler in setup closure
- [x] Emit `auth:callback` event to frontend on deep link receive

---

## Phase 2: Keychain Storage

### P2.1: Add keyring dependency
- [x] Add `keyring = "3"` to `src-tauri/Cargo.toml`
- [x] Run `cargo check`

### P2.2: Create keychain module
- [x] Create `src-tauri/src/keychain.rs`
- [x] Add `mod keychain;` to `lib.rs`
- [x] Implement `store_auth_tokens(access, refresh, expires_at)`
- [x] Implement `get_auth_tokens() -> Option<AuthTokens>`
- [x] Implement `clear_auth_tokens()`
- [x] Handle keychain access errors gracefully

---

## Phase 3: Tauri Auth Commands

### P3.1: Create auth commands
- [x] Create `src-tauri/src/commands/auth.rs`
- [x] Add `mod auth;` to `commands/mod.rs`
- [x] Implement `auth_store_tokens` command
- [x] Implement `auth_get_tokens` command
- [x] Implement `auth_clear_tokens` command
- [x] Implement `auth_open_login` command (opens browser)

### P3.2: Register commands
- [x] Add auth commands to `invoke_handler![]` in `lib.rs`
- [x] Run `cargo check`

---

## Phase 4: Frontend Auth Service

### P4.1: Create auth service
- [x] Create `src/services/auth.ts`
- [x] Export from `src/services/index.ts`
- [x] Implement `storeTokens(access, refresh, expiresAt)`
- [x] Implement `getTokens(): Promise<AuthTokens | null>`
- [x] Implement `clearTokens()`
- [x] Implement `openLogin()`
- [x] Add logging with `createLogger("AuthService")`

### P4.2: Add token refresh logic
- [x] Implement `refreshTokenIfNeeded(): Promise<string | null>`
- [x] Check expiry with 5-minute margin
- [x] Call Supabase refresh endpoint
- [x] Store new tokens on success

### P4.3: Create Supabase client wrapper
- [x] Create `src/services/supabase.ts`
- [x] Export from `src/services/index.ts`
- [x] Add Supabase URL and anon key constants
- [x] Implement `createAuthenticatedClient()`

---

## Phase 5: Auth Zustand Store

### P5.1: Create auth store
- [x] Create `src/stores/authStore.ts`
- [x] Export from `src/stores/index.ts`
- [x] Define `AuthState` interface (user, isAuthenticated, isLoading, isOffline)
- [x] Define `User` interface (id, email, displayName, avatarUrl)
- [x] Initialize store with `create<AuthState>()`

### P5.2: Implement store actions
- [x] Implement `initialize()` - check existing tokens on app start
- [x] Implement `signIn()` - open browser for OAuth
- [x] Implement `signOut()` - clear tokens and state
- [x] Implement `handleAuthCallback(params)` - process deep link
- [x] Implement `refreshSession()` - refresh tokens

### P5.3: Add deep link listener
- [x] Listen for `auth:callback` Tauri event
- [x] Parse URL params (access_token, refresh_token, expires_at, state)
- [x] Validate state param for CSRF protection
- [x] Call `handleAuthCallback` on valid callback

---

## Phase 6: Auth UI Components

### P6.1: Create SignInPrompt component
- [x] Create `src/components/auth/SignInPrompt.tsx`
- [x] Add "Sign in with Google" button
- [x] Add "Sign in with Apple" button
- [x] Add "Sign in with Email" button
- [x] Add "Continue without account" link
- [x] Add loading spinner state

### P6.2: Create UserMenu component
- [x] Create `src/components/auth/UserMenu.tsx`
- [x] Show user avatar and name
- [x] Add dropdown with "Account Settings" link
- [x] Add "Sign Out" button in dropdown

### P6.3: Create AuthStatus wrapper
- [x] Create `src/components/auth/AuthStatus.tsx`
- [x] Create `src/components/auth/index.ts` barrel export
- [x] Show compact Sign In button when not authenticated
- [x] Show UserMenu when authenticated
- [x] Handle loading state

---

## Phase 7: App Integration

### P7.1: Initialize auth on startup
- [x] Import authStore in `src/App.tsx`
- [x] Call `authStore.initialize()` in useEffect
- [ ] Set up token refresh interval (every 4 minutes)

### P7.2: Add AuthStatus to header
- [x] Import AuthStatus in App.tsx
- [x] Position next to SearchBar in header area
- [x] Verify responsive layout

### P7.3: Handle offline mode
- [x] Add `isOffline` state to authStore
- [x] Listen for `online`/`offline` window events
- [x] Skip token refresh when offline
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
