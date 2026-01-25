# App Signals System Implementation Plan

## Problem Statement

**Race condition (RACE-001):** `restoreHostedSession()` calls `useAuthStore.getState().user` before `fetchUserProfile()` completes, causing hosted session restoration to be skipped even when the user is actually authenticated.

**Current flow:**
```
App mounts → [initializeAuth()] ←parallel→ [SessionBar → loadSession() → restoreHostedSession()]
                    ↓                                              ↓
            fetchUserProfile() (async)              needs user (null - race!)
```

## Solution

Create an app-wide signal system following the existing `PLAYER_EVENTS` pattern in `src/services/windowManager.ts`. Auth emits `USER_LOGGED_IN` signal, and `restoreHostedSession()` waits for it.

**New flow:**
```
App mounts → initializeAuth() → fetchUserProfile() → emit USER_LOGGED_IN
                                                            ↓
SessionBar → loadSession() → restoreHostedSession() → waitForSignal(USER_LOGGED_IN)
                                                            ↓
                                                    user guaranteed available
```

---

## Implementation Steps

### Step 1: Create `src/services/appSignals.ts`

New file with:
- `APP_SIGNALS` constant (following `PLAYER_EVENTS` pattern from windowManager.ts)
- `SignalPayloads` interface for type-safe payloads
- `emitSignal<T>()` - fire-and-forget with error handling
- `listenForSignal<T>()` - returns UnlistenFn for cleanup
- `waitForSignal<T>()` - Promise-based with timeout
- `waitForSignalOrCondition<T>()` - checks current state first, then waits

**Signals to define:**
```typescript
export const APP_SIGNALS = {
  USER_LOGGED_IN: "app:user-logged-in",
  USER_LOGGED_OUT: "app:user-logged-out",
  SONG_STARTED: "app:song-started",
  SONG_STOPPED: "app:song-stopped",
  SONG_ENDED: "app:song-ended",
  QUEUE_ITEM_ADDED: "app:queue-item-added",
  QUEUE_ITEM_REMOVED: "app:queue-item-removed",
  SESSION_STARTED: "app:session-started",
  SESSION_ENDED: "app:session-ended",
  HOSTING_STARTED: "app:hosting-started",
  HOSTING_STOPPED: "app:hosting-stopped",
} as const;
```

### Step 2: Export from `src/services/index.ts`

Add exports for new signal utilities.

### Step 3: Modify `src/stores/authStore.ts`

In `fetchUserProfile()` after setting user state (~line 358):
```typescript
await emitSignal(APP_SIGNALS.USER_LOGGED_IN, authUser);
```

In `signOut()` after clearing state (~line 182):
```typescript
await emitSignal(APP_SIGNALS.USER_LOGGED_OUT, undefined);
```

### Step 4: Modify `src/stores/sessionStore.ts`

In `restoreHostedSession()`, replace direct user check (~line 848-854):

```typescript
// OLD: const currentUser = useAuthStore.getState().user;

// NEW: Wait for user or signal with 5s timeout
let currentUser: User | null = null;
try {
  currentUser = await waitForSignalOrCondition(
    APP_SIGNALS.USER_LOGGED_IN,
    () => useAuthStore.getState().user,
    5000
  );
} catch {
  log.debug("Skipping restore: user not available within timeout");
  return;
}
```

### Step 5: Create `src/services/appSignals.test.ts`

Unit tests for:
- `emitSignal` - emits with payload, handles errors gracefully
- `listenForSignal` - registers listener, calls callback
- `waitForSignal` - resolves on signal, rejects on timeout
- `waitForSignalOrCondition` - resolves immediately if condition met, waits otherwise

### Step 6: Update E2E mocks

Add `authDelay` option to `tests/e2e/fixtures/tauri-mocks.ts` for testing race condition fix.

### Step 7: Add E2E test

Test case `E2E-005`: Verify restoration works even with delayed auth.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/services/appSignals.ts` | **NEW** - Signal system |
| `src/services/index.ts` | Export signal utilities |
| `src/stores/authStore.ts` | Emit USER_LOGGED_IN/OUT signals |
| `src/stores/sessionStore.ts` | Wait for signal in restoreHostedSession |
| `src/services/appSignals.test.ts` | **NEW** - Unit tests |
| `tests/e2e/fixtures/tauri-mocks.ts` | Add authDelay option |
| `tests/e2e/specs/hosted-session.spec.ts` | Add E2E-005 test |

---

## Verification

1. **Unit tests**: `npm test -- appSignals.test.ts`
2. **All tests pass**: `npm test`
3. **Rust tests**: `cargo test`
4. **TypeScript check**: `npm run typecheck`
5. **E2E tests**: `just e2e`
6. **Manual test**:
   - Sign out → Sign in → Verify hosted session restores
   - Add console.log to confirm signal timing

---

## Future Use & Expansion Opportunities

The signal system can be expanded to solve coordination problems across the codebase. Below is a comprehensive analysis of areas that would benefit from signals, organized by priority.

---

### Priority 1: Critical Dependencies (Implement Now)

These are the signals needed for the immediate race condition fix:

| Signal | Location | Current Problem |
|--------|----------|-----------------|
| `USER_LOGGED_IN` | authStore.ts:358 | Session restoration races with user profile loading |
| `USER_LOGGED_OUT` | authStore.ts:182 | Dependent stores need to react to logout |

---

### Priority 2: Session & Queue Initialization

**Session Initialization Sequence** (`sessionStore.ts:126-150`)

Current flow has 5+ sequential operations without coordination:
```
loadSession() → singers → active singer → queue → queue assignments → hosted session
```

**Signals to add:**
| Signal | Emit Location | Consumers | Benefit |
|--------|---------------|-----------|---------|
| `SESSION_LOADED` | sessionStore after loadSession() | Components showing session-dependent UI | Know when session is fully ready |
| `SINGERS_LOADED` | sessionStore after loadSingers() | Queue item components | Can show singer assignments immediately |
| `QUEUE_LOADED` | queueStore after loadPersistedState() | Player prefetch, singer assignment loader | Coordinate dependent operations |

**Queue Operation Tracking** (`queueStore.ts:9-29`)

Currently uses global `pendingOperations` Set with manual `flushPendingOperations()` calls.

| Signal | Emit Location | Consumers | Benefit |
|--------|---------------|-----------|---------|
| `QUEUE_OPERATIONS_PENDING` | queueStore when operation starts | Session transitions | Wait for safe transition point |
| `QUEUE_OPERATIONS_COMPLETE` | queueStore when all operations done | Session end/switch | Know it's safe to proceed |

---

### Priority 3: Token & Auth Lifecycle

**Token Refresh** (`authStore.ts:265-296`)

Token refresh happens on 4-minute interval; dependent stores don't know when tokens are fresh.

| Signal | Emit Location | Consumers | Benefit |
|--------|---------------|-----------|---------|
| `TOKENS_REFRESHED` | authStore after refreshSession() | hostedSessionService, API calls | Retry failed requests with fresh tokens |
| `AUTH_INITIALIZED` | authStore at end of initialize() | App.tsx, DependencyCheck | Single signal for "auth is ready" |

**Hosted Session Polling** (`sessionStore.ts:746-805`)

Currently polls every 30 seconds with weak coordination to auth state.

| Signal | Emit Location | Consumers | Benefit |
|--------|---------------|-----------|---------|
| `HOSTED_SESSION_UPDATED` | sessionStore after refreshHostedSession() | HostSessionModal, SessionBar | React to stat changes without polling UI |
| `HOSTING_STARTED` | sessionStore after hostSession() | Player (show join code), analytics | Coordinate feature enablement |
| `HOSTING_STOPPED` | sessionStore after stopHosting() | Player, analytics | Clean up dependent state |

---

### Priority 4: Player & Playback Coordination

**Player State Sync** (`playerStore.ts:220-304`, `PlayerControls.tsx:49-80`)

Multiple components read player state for sync to detached window.

| Signal | Emit Location | Consumers | Benefit |
|--------|---------------|-----------|---------|
| `PLAYBACK_STARTED` | playerStore after playVideo() | Queue (mark playing), media controls | Single source of truth for playback start |
| `PLAYBACK_PAUSED` | playerStore after pause() | Media controls, detached player | Coordinate pause state |
| `PLAYBACK_ENDED` | playerStore after video ends | Queue (advance), session (log) | Trigger queue advancement |
| `VIDEO_METADATA_CHANGED` | playerStore when video changes | Media controls, detached player | Update system media info once |

**Prefetch Cache Invalidation** (`VideoPlayer.tsx:145-187`)

Queue changes don't notify player of stale prefetch cache; manual `invalidatePrefetchIfStale()` calls scattered.

| Signal | Emit Location | Consumers | Benefit |
|--------|---------------|-----------|---------|
| `QUEUE_ORDER_CHANGED` | queueStore after reorder/remove | VideoPlayer prefetch logic | Invalidate cache automatically |
| `NEXT_SONG_CHANGED` | queueStore when first pending item changes | VideoPlayer, next song overlay | Prefetch correct video |

---

### Priority 5: Error & Recovery Coordination

**Optimistic Updates with Rollback** (`queueStore.ts:363-396`)

Complex error recovery in `moveAllHistoryToQueue()` with silent rollback.

| Signal | Emit Location | Consumers | Benefit |
|--------|---------------|-----------|---------|
| `QUEUE_OPERATION_FAILED` | queueStore on critical failures | UI components, error boundary | Show meaningful error state |
| `HOSTING_ERROR` | sessionStore on hosting failures | HostSessionModal | Specific error handling |

**Session Migration** (`hostedSession.ts:59-83`)

Legacy migration runs once at startup with no signal when complete.

| Signal | Emit Location | Consumers | Benefit |
|--------|---------------|-----------|---------|
| `MIGRATION_COMPLETE` | App.tsx after runLegacyHostedSessionMigration() | Session restore logic | Know it's safe to restore |

---

### Priority 6: Settings & Availability Checks

**yt-dlp Availability** (`settingsStore.ts:198-245`)

Module-level promise caching to prevent concurrent checks.

| Signal | Emit Location | Consumers | Benefit |
|--------|---------------|-----------|---------|
| `YTDLP_AVAILABLE` | settingsStore after check | Player mode selector, search results | Unified availability state |
| `YTDLP_UNAVAILABLE` | settingsStore if check fails | Settings panel | Show installation prompt |

**Local File Availability** (`libraryStore.ts:300-333`)

`pendingFileChecks` Map deduplicates concurrent requests.

| Signal | Emit Location | Consumers | Benefit |
|--------|---------------|-----------|---------|
| `FILE_AVAILABILITY_CHECKED` | libraryStore after check | Library items, queue items | Update UI once per file |

---

### Priority 7: Display & Window Coordination

**Display Restoration** (`displayStore.ts:65-100`, `97-216`)

Comment notes workaround for race condition with batched Zustand updates.

| Signal | Emit Location | Consumers | Benefit |
|--------|---------------|-----------|---------|
| `LAYOUT_RESTORE_STARTED` | displayStore before restoreLayout() | Player window | Pause state sync during restore |
| `LAYOUT_RESTORE_COMPLETE` | displayStore after restoreLayout() | Player window | Resume normal operation |
| `PLAYER_DETACHED` | displayStore after detachPlayer() | Main window, queue | Update UI for detached state |
| `PLAYER_REATTACHED` | displayStore after reattachPlayer() | Main window | Update UI for attached state |

---

### Priority 8: UI & Notification Coordination

**Notification Lifecycle** (`notificationStore.ts:93-148`)

Complex timeout management with external cleanup.

| Signal | Emit Location | Consumers | Benefit |
|--------|---------------|-----------|---------|
| `NOTIFICATION_SHOWING` | notificationStore after show() | Accessibility, analytics | Track notification visibility |
| `NOTIFICATION_HIDDEN` | notificationStore after hide() | Cleanup listeners | Coordinate dependent state |

**Active Singer Changes** (`sessionStore.ts:507-528`)

Singer selection affects auto-assignment in queue.

| Signal | Emit Location | Consumers | Benefit |
|--------|---------------|-----------|---------|
| `ACTIVE_SINGER_CHANGED` | sessionStore after setActiveSinger() | Queue add operations | Auto-assign to correct singer |

---

## Expanded Signal Definitions

```typescript
export const APP_SIGNALS = {
  // Auth lifecycle (Priority 1)
  USER_LOGGED_IN: "app:user-logged-in",
  USER_LOGGED_OUT: "app:user-logged-out",
  AUTH_INITIALIZED: "app:auth-initialized",
  TOKENS_REFRESHED: "app:tokens-refreshed",

  // Session lifecycle (Priority 2)
  SESSION_LOADED: "app:session-loaded",
  SESSION_STARTED: "app:session-started",
  SESSION_ENDED: "app:session-ended",
  SINGERS_LOADED: "app:singers-loaded",
  ACTIVE_SINGER_CHANGED: "app:active-singer-changed",

  // Queue coordination (Priority 2)
  QUEUE_LOADED: "app:queue-loaded",
  QUEUE_ORDER_CHANGED: "app:queue-order-changed",
  QUEUE_ITEM_ADDED: "app:queue-item-added",
  QUEUE_ITEM_REMOVED: "app:queue-item-removed",
  QUEUE_OPERATIONS_PENDING: "app:queue-operations-pending",
  QUEUE_OPERATIONS_COMPLETE: "app:queue-operations-complete",
  NEXT_SONG_CHANGED: "app:next-song-changed",

  // Hosting (Priority 3)
  HOSTING_STARTED: "app:hosting-started",
  HOSTING_STOPPED: "app:hosting-stopped",
  HOSTED_SESSION_UPDATED: "app:hosted-session-updated",

  // Playback (Priority 4)
  PLAYBACK_STARTED: "app:playback-started",
  PLAYBACK_PAUSED: "app:playback-paused",
  PLAYBACK_ENDED: "app:playback-ended",
  VIDEO_METADATA_CHANGED: "app:video-metadata-changed",

  // Errors (Priority 5)
  QUEUE_OPERATION_FAILED: "app:queue-operation-failed",
  HOSTING_ERROR: "app:hosting-error",
  MIGRATION_COMPLETE: "app:migration-complete",

  // Availability (Priority 6)
  YTDLP_AVAILABLE: "app:ytdlp-available",
  YTDLP_UNAVAILABLE: "app:ytdlp-unavailable",
  FILE_AVAILABILITY_CHECKED: "app:file-availability-checked",

  // Display (Priority 7)
  LAYOUT_RESTORE_STARTED: "app:layout-restore-started",
  LAYOUT_RESTORE_COMPLETE: "app:layout-restore-complete",
  PLAYER_DETACHED: "app:player-detached",
  PLAYER_REATTACHED: "app:player-reattached",

  // UI (Priority 8)
  NOTIFICATION_SHOWING: "app:notification-showing",
  NOTIFICATION_HIDDEN: "app:notification-hidden",
} as const;
```

---

## Impact Summary

| Category | Current Pattern | With Signals | Files Affected |
|----------|-----------------|--------------|----------------|
| Race conditions | Manual guards, hope for timing | Guaranteed ordering | 5+ stores |
| Cross-store reads | `getState()` at arbitrary times | Wait for signal | 8+ locations |
| Polling | 30s/4min intervals regardless of state | Event-driven updates | 3 stores |
| Error recovery | Silent rollback | Broadcast failure | 4+ operations |
| Cache invalidation | Manual calls scattered | Automatic on signal | VideoPlayer, queueStore |

**Total impact: 25+ distinct code locations** would benefit from unified signal coordination.
