# App Signals System

This document describes the app-wide signal system used for cross-store coordination in the HomeKaraoke desktop application. It explains the architecture, available signals, and common patterns.

---

## Table of Contents

1. [Overview](#overview)
2. [Problem: Race Conditions](#problem-race-conditions)
3. [Solution: Signal System](#solution-signal-system)
4. [API Reference](#api-reference)
5. [Available Signals](#available-signals)
6. [Usage Patterns](#usage-patterns)
7. [Hosted Session Restoration Flow](#hosted-session-restoration-flow)
8. [Token Refresh Logic](#token-refresh-logic)
9. [Testing](#testing)

---

## Overview

The app signals system provides a way for different parts of the application to coordinate asynchronous operations. It follows the existing `PLAYER_EVENTS` pattern from `windowManager.ts` but is designed for app lifecycle events.

**Location:** `src/services/appSignals.ts`

**Key Features:**
- Type-safe signal names and payloads
- Fire-and-forget emission with error handling
- Promise-based waiting with configurable timeouts
- Condition-first checking to avoid unnecessary waits

---

## Problem: Race Conditions

### RACE-001: User Profile Not Loaded

When the app starts, multiple initialization flows run in parallel:

```
App mounts → [initializeAuth()]        ←parallel→  [SessionBar → loadSession()]
                    ↓                                         ↓
            fetchUserProfile() (async)          restoreHostedSession()
                    ↓                                         ↓
              user available                      needs user (null - race!)
```

The `restoreHostedSession()` function needs to check if the current user owns the hosted session. If it reads `useAuthStore.getState().user` before `fetchUserProfile()` completes, it gets `null` and skips restoration even though the user is authenticated.

---

## Solution: Signal System

The signal system solves this by allowing `restoreHostedSession()` to wait for the user to be available:

```
App mounts → initializeAuth() → fetchUserProfile() → emit USER_LOGGED_IN
                                                            ↓
SessionBar → loadSession() → restoreHostedSession() → waitForSignalOrCondition()
                                                            ↓
                                                    user guaranteed available
```

### Key Insight: Check First, Then Wait

The `waitForSignalOrCondition()` function implements a crucial optimization:

1. **Check condition first** - If the user is already loaded, return immediately
2. **Wait for signal** - Only if condition not met, wait for the signal
3. **Timeout** - Give up after a configurable timeout (default 5s)

This handles both scenarios:
- **Fast auth:** User loads before restoration starts → immediate return
- **Slow auth:** Restoration starts first → waits for signal

---

## API Reference

### `APP_SIGNALS`

Constant object containing all signal names:

```typescript
export const APP_SIGNALS = {
  USER_LOGGED_IN: "app:user-logged-in",
  USER_LOGGED_OUT: "app:user-logged-out",
  // ... other signals
} as const;
```

### `emitSignal<T>(signal, payload)`

Fire-and-forget signal emission with error handling.

```typescript
await emitSignal(APP_SIGNALS.USER_LOGGED_IN, user);
```

- Errors are logged but not thrown (fire-and-forget)
- Returns `Promise<void>`

### `listenForSignal<T>(signal, callback)`

Register a listener for a signal. Returns an unlisten function.

```typescript
const unlisten = await listenForSignal(APP_SIGNALS.USER_LOGGED_IN, (user) => {
  console.log("User logged in:", user.email);
});

// Later: cleanup
unlisten();
```

### `waitForSignal<T>(signal, timeoutMs?)`

Wait for a signal with a timeout. Rejects if timeout is reached.

```typescript
try {
  const user = await waitForSignal(APP_SIGNALS.USER_LOGGED_IN, 5000);
  console.log("Got user:", user);
} catch (error) {
  console.log("Timeout waiting for user");
}
```

### `waitForSignalOrCondition<T>(signal, checkCondition, timeoutMs?)`

**The most commonly used function.** Checks a condition first, then waits for signal if needed.

```typescript
const user = await waitForSignalOrCondition(
  APP_SIGNALS.USER_LOGGED_IN,
  () => useAuthStore.getState().user,  // Check current state
  5000  // Timeout
);
```

**Behavior:**
1. Calls `checkCondition()`
2. If result is not null/undefined → returns immediately
3. Otherwise → waits for signal up to timeout
4. If timeout → throws error

---

## Available Signals

### Authentication Signals

| Signal | Payload | Emitted When |
|--------|---------|--------------|
| `USER_LOGGED_IN` | `User` | After `fetchUserProfile()` sets user in state |
| `USER_LOGGED_OUT` | `undefined` | After `signOut()` clears auth state |

### Playback Signals (Future)

| Signal | Payload | Emitted When |
|--------|---------|--------------|
| `SONG_STARTED` | `undefined` | When a song starts playing |
| `SONG_STOPPED` | `undefined` | When a song is manually stopped |
| `SONG_ENDED` | `undefined` | When a song ends naturally |

### Queue Signals (Future)

| Signal | Payload | Emitted When |
|--------|---------|--------------|
| `QUEUE_ITEM_ADDED` | `undefined` | When item is added to queue |
| `QUEUE_ITEM_REMOVED` | `undefined` | When item is removed from queue |

### Session Signals (Future)

| Signal | Payload | Emitted When |
|--------|---------|--------------|
| `SESSION_STARTED` | `undefined` | When a new session starts |
| `SESSION_ENDED` | `undefined` | When a session ends |
| `HOSTING_STARTED` | `undefined` | When hosted session begins |
| `HOSTING_STOPPED` | `undefined` | When hosted session stops |

---

## Usage Patterns

### Pattern 1: Emit After State Change

Always emit signals **after** the state has been updated:

```typescript
// In authStore.ts fetchUserProfile()
set({ isAuthenticated: true, user: authUser });  // State updated first
await emitSignal(APP_SIGNALS.USER_LOGGED_IN, authUser);  // Then emit
```

### Pattern 2: Wait for Dependency

When your code depends on state that may not be ready:

```typescript
// In sessionStore.ts restoreHostedSession()
let currentUser: User | null = null;
try {
  currentUser = await waitForSignalOrCondition(
    APP_SIGNALS.USER_LOGGED_IN,
    () => useAuthStore.getState().user,
    5000
  );
} catch {
  log.debug("Skipping: user not available within timeout");
  return;
}
// Now currentUser is guaranteed to be available
```

### Pattern 3: Cleanup on Logout

Listen for logout to cleanup dependent state:

```typescript
const unlisten = await listenForSignal(APP_SIGNALS.USER_LOGGED_OUT, () => {
  // Clear user-specific data
  clearHostedSession();
});
```

---

## Hosted Session Restoration Flow

When the app restarts, it attempts to restore any previously active hosted session.

### Restoration Decision Tree

```
restoreHostedSession()
    │
    ├─► Already hosting? → SKIP
    │
    ├─► No active session? → SKIP
    │
    ├─► No hosted_session_id? → SKIP (never hosted)
    │
    ├─► Status is 'ended'? → SKIP (user stopped hosting)
    │
    ├─► Not authenticated? → SKIP (preserve for owner)
    │
    ├─► Wait for user (signal) → Timeout? → SKIP
    │
    ├─► Different user? → Show dialog, SKIP
    │
    ├─► Token expired? → Try refresh → Failed? → SKIP
    │
    └─► Verify with backend API
            │
            ├─► 404/401/403? → Mark as 'ended', SKIP
            │
            ├─► Status not 'active'? → Mark as 'ended', SKIP
            │
            └─► SUCCESS → Restore session, start polling
```

### Code References

| Step | Location | Description |
|------|----------|-------------|
| RESTORE-001 | sessionStore.ts:830 | Check hosted_session_id exists |
| RESTORE-002 | sessionStore.ts:838 | Check status not 'ended' |
| RESTORE-003 | sessionStore.ts:847 | Check authenticated |
| RESTORE-004 | sessionStore.ts:858 | Wait for user signal |
| RESTORE-005 | sessionStore.ts:907 | Handle non-active API status |
| RESTORE-006 | sessionStore.ts:867 | Different user dialog |
| RESTORE-009 | sessionStore.ts:949 | Update status on auth error |

---

## Token Refresh Logic

### Token Validation

Tokens are validated with a 5-minute buffer before expiry:

```typescript
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

function isTokenValid(expiresAt: number): boolean {
  const expiresAtMs = expiresAt * 1000;
  return Date.now() < expiresAtMs - TOKEN_EXPIRY_BUFFER_MS;
}
```

### Refresh Before Fail Pattern

Both `hostSession()` and `restoreHostedSession()` attempt token refresh before failing:

```typescript
// Get tokens
let tokens = await authService.getTokens();

// Check if expired
if (!isTokenValid(tokens.expires_at)) {
  // Try to refresh
  const refreshedTokens = await authService.refreshTokenIfNeeded();

  if (!refreshedTokens || !isTokenValid(refreshedTokens.expires_at)) {
    // Refresh failed - give up
    throw new Error("Session expired. Please sign in again.");
  }

  // Use refreshed tokens
  tokens = refreshedTokens;
}

// Proceed with valid tokens
await hostedSessionService.createHostedSession(tokens.access_token, ...);
```

---

## Testing

### Unit Tests

The signal system has comprehensive unit tests in `src/services/appSignals.test.ts`:

```bash
npm test -- appSignals.test.ts
```

**Test Coverage:**
- APP_SIGNALS constant values
- emitSignal with payload and error handling
- listenForSignal registration and callback
- waitForSignal resolution and timeout
- waitForSignalOrCondition immediate return and waiting

### E2E Tests

The race condition fix is tested in `tests/e2e/specs/hosted-session.spec.ts`:

```bash
just e2e-grep "E2E-005"
```

**Test:** `E2E-005: restores hosted session even with delayed auth`
- Uses `authDelay: 2000` to simulate slow authentication
- Verifies restoration waits for user signal
- Confirms session is restored after auth completes

### Mock Configuration

For E2E tests, use `authDelay` in Tauri mocks:

```typescript
await injectTauriMocks(page, {
  authDelay: 2000,  // Delay auth_get_tokens by 2 seconds
  // ... other options
});
```

---

## Future Expansion

The signal system is designed for expansion. See `plan/207-app-signals.md` for:

- Priority 2: Session & Queue initialization signals
- Priority 3: Token refresh signals
- Priority 4: Player & playback signals
- Priority 5-8: Error recovery, availability checks, display coordination

Each priority level can be implemented incrementally as needed.
