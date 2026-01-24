# Plan: Persist Hosted Sessions Across App Restarts

## Goal
When the app quits and reopens, reconnect to the existing hosted session instead of requiring the user to host again.

## Approach
Store only the hosted session ID locally (in SQLite settings table). On app startup, fetch the session from the backend to verify it's still active and restore state.

**Why this approach:**
- Backend is source of truth for session state (status, stats, code)
- Minimal local data avoids staleness issues
- Uses existing settings infrastructure (no migration needed)

---

## Changes

### 1. Add persistence helpers to `src/services/hostedSession.ts`

Add three functions using existing Tauri settings commands:

```typescript
const HOSTED_SESSION_KEY = "hosted_session_id";

async persistSessionId(sessionId: string): Promise<void>
async getPersistedSessionId(): Promise<string | null>
async clearPersistedSessionId(): Promise<void>
```

### 2. Update `src/stores/sessionStore.ts`

#### 2a. Add `restoreHostedSession()` action
- Called at end of `loadSession()` after session is loaded
- Skip if already hosting, no session, or not authenticated
- Fetch persisted session ID from settings
- Call `getSession()` API to verify session is still active
- If active: restore state and start polling
- If expired/ended/error: clear persisted ID
- Show notification on successful reconnect

#### 2b. Update `hostSession()`
- After creating session, call `persistSessionId(hostedSession.id)`

#### 2c. Update `stopHosting()`
- Call `clearPersistedSessionId()` before API call

#### 2d. Update `endSession()`
- Call `clearPersistedSessionId()` as safety cleanup

#### 2e. Update `refreshHostedSession()` error handling
- When session becomes invalid (404/401/403), call `clearPersistedSessionId()`

### 3. Update `src/stores/authStore.ts`

#### In `signOut()`:
- Call `clearPersistedSessionId()` before clearing tokens
- Prevents orphaned hosted session references

---

## Files to Modify

1. `src/services/hostedSession.ts` - Add persistence functions
2. `src/stores/sessionStore.ts` - Add restore logic, persist on host, clear on stop
3. `src/stores/authStore.ts` - Clear on sign out

---

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Session ended on backend | API returns 404, clear local, no error shown |
| User logged out | Clear on signOut, no restore attempted |
| Different user logged in | API returns 401/403, clear local |
| Token expired | Skip restore (auth refresh will handle) |
| Network offline | Skip restore, user can retry later |
| Already hosting | Skip restore (no-op) |

---

## Verification

1. **Manual test flow:**
   - Sign in, start session, click Host
   - Note the session code (e.g., HK-XXXX-XXXX)
   - Quit app completely (Cmd+Q)
   - Reopen app
   - Verify: notification shows "Reconnected to hosted session"
   - Verify: Host button shows hosted state
   - Verify: Same session code is restored

2. **Edge case tests:**
   - Host session -> Sign out -> Reopen -> Verify no hosted session restored
   - Host session -> Wait for backend to expire session -> Reopen -> Verify graceful handling

3. **Unit tests:** Test the new `restoreHostedSession()` action with mocked API responses
