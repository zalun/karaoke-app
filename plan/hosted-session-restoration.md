# Hosted Session Restoration Improvement

## Overview

Move hosted session persistence from the generic `settings` table to the `sessions` table, storing `hosted_session_id`, `hosted_by_user_id`, and `hosted_session_status`. This ensures proper ownership tracking, status caching, and cleaner restoration logic.

## Current Implementation

- `hosted_session_id` stored in `settings` table as key-value pair
- No tracking of which user started hosting
- No local caching of session status
- Restoration happens separately from session loading
- Race condition with auth initialization (recently patched)

## Proposed Implementation

### Database Changes

**New Migration (Migration 8):**
```sql
ALTER TABLE sessions ADD COLUMN hosted_session_id TEXT;
ALTER TABLE sessions ADD COLUMN hosted_by_user_id TEXT;
ALTER TABLE sessions ADD COLUMN hosted_session_status TEXT;  -- 'active' | 'paused' | 'ended'
```

**Files to modify:**
- `src-tauri/src/db/schema.rs` - Add migration
- `src-tauri/src/commands/session.rs` - Update Session struct and queries
- `src/services/session.ts` - Update Session interface

### New Tauri Commands

```rust
// Set hosted session info on a session
session_set_hosted(session_id: i64, hosted_session_id: String, hosted_by_user_id: String, status: String)

// Update hosted session status only
session_update_hosted_status(session_id: i64, status: String)
```

### Frontend Changes

**Files to modify:**
- `src/services/session.ts` - Add new service methods
- `src/stores/sessionStore.ts` - Update hostSession(), stopHosting(), loadSession()
- `src/services/hostedSession.ts` - Remove persistence functions (or keep as wrappers)

## Restoration Flow

```
loadSession()
    │
    ├── Load active session from DB
    │       → Session includes hosted_session_id, hosted_by_user_id, hosted_session_status
    │
    ├── No hosted_session_id?
    │       → Done (not hosting)
    │
    ├── hosted_session_status = 'ended'?
    │       → Don't try to restore
    │       → Keep fields (for reference until someone else hosts)
    │       → Done
    │
    ├── Get current auth state
    │       → Not authenticated?
    │           → Keep fields (owner might return)
    │           → Done
    │
    ├── Current user.id ≠ hosted_by_user_id?
    │       → Show dialog: "Another user was hosting this session"
    │       → Keep fields (owner might return)
    │       → Done
    │
    ├── Verify with backend API
    │       → Update hosted_session_status from API response
    │       → Session ended/expired?
    │           → Update status to 'ended' in DB
    │           → Done (no restore)
    │
    └── Restore hosted session
        → Start polling
        → Show "Reconnected to hosted session"
```

## Host Session Flow

```
hostSession()
    │
    ├── Check: session already has hosted_session_id?
    │       │
    │       ├── hosted_session_status = 'ended'?
    │       │       → OK to override, continue with new hosting
    │       │
    │       ├── hosted_by_user_id = current user?
    │       │       → Already hosting, show error or attempt reconnect
    │       │
    │       └── Different user + status = 'active' or 'paused'?
    │               → Error: "Another user is hosting this session"
    │               → Block hosting
    │
    ├── Create hosted session via API
    │
    └── Store in DB:
        → hosted_session_id = response.id
        → hosted_by_user_id = currentUser.id
        → hosted_session_status = 'active'
```

## Stop Hosting Flow

```
stopHosting()
    │
    ├── Call API to end hosted session
    │
    └── Update DB:
        → hosted_session_status = 'ended'
        → Keep hosted_session_id and hosted_by_user_id (for reference)
```

## Different User Scenarios

When `current_user.id !== hosted_by_user_id`:

### Case 1: Hosted Session Still Active (status = 'active' or 'paused')

**Behavior:** Inform user, keep fields intact for original owner.

```
┌─────────────────────────────────────────────────────────┐
│  ⚠️  Session hosted by another user                     │
│                                                         │
│  This session was being hosted by another user.         │
│  They need to sign in and stop hosting, or the          │
│  session will expire automatically.                     │
│                                                         │
│  [OK]                                                   │
└─────────────────────────────────────────────────────────┘
```

**Actions:**
- Show informational dialog (anonymous - no email shown)
- Keep all hosted fields in DB (owner might return)
- Do NOT end the remote session
- User cannot start their own hosted session until status = 'ended'

### Case 2: Hosted Session Already Ended (status = 'ended')

**Behavior:** No dialog, user can host if they want.

- Don't attempt restoration (status already 'ended')
- If user wants to host, they can - it will override the old values
- No notification needed

## Field Behavior Summary

| Scenario | hosted_session_id | hosted_by_user_id | hosted_session_status | Action |
|----------|-------------------|-------------------|----------------------|--------|
| Not authenticated | Keep | Keep | Keep | No restore, owner might return |
| Different user, active | Keep | Keep | Keep | Show dialog, no restore |
| Different user, ended | Keep | Keep | 'ended' | No restore, can override |
| Same user, active (API) | Keep | Keep | Keep | Restore |
| Same user, ended (API) | Keep | Keep | → 'ended' | Update status, no restore |
| Same user, API error | Keep | Keep | Keep | Keep for retry |
| Stop hosting | Keep | Keep | → 'ended' | Update status |
| New user hosts (ended) | → new | → new | → 'active' | Override all |

## Test Cases

### Unit Tests

#### Database Layer
1. Migration adds all three columns correctly
2. `session_set_hosted` stores all three fields
3. `session_update_hosted_status` updates only status
4. `get_active_session` returns all hosted fields
5. Session deletion cascades (hosted fields go with it)

#### Session Store - hostSession()
6. Stores all three fields after API success
7. Stores `hosted_by_user_id` with current user's ID
8. Sets `hosted_session_status` to 'active'
9. Fails gracefully if user not authenticated
10. Fails gracefully if no active session
11. **Allows override when status = 'ended'**
12. **Blocks when different user + status = 'active'**
13. **Blocks when different user + status = 'paused'**

#### Session Store - stopHosting()
14. Updates status to 'ended'
15. Keeps hosted_session_id and hosted_by_user_id
16. Updates status even if API call fails
17. Works when already not hosting (no-op)

#### Session Store - loadSession() / Restoration
18. **No hosted_session_id** → No restoration attempted
19. **Status = 'ended'** → No restoration, keep fields
20. **User not authenticated** → No restoration, keep fields
21. **Same user, session active** → Restores successfully
22. **Same user, API returns ended** → Update status to 'ended', no restore
23. **Same user, API returns paused** → Update status, restore
24. **Different user, status active** → Shows dialog, keep fields
25. **Different user, status ended** → No dialog, no restore, keep fields
26. **API error (network)** → Preserves fields for retry
27. **API error (401/403)** → Update status to 'ended'

#### Edge Cases
28. **User signs out while hosting** → Keep fields (might return)
29. **Switch sessions** → Each session has independent hosted state
30. **Token expired, refresh succeeds** → Restoration continues
31. **Token expired, refresh fails** → Keep fields

### E2E Tests

32. **Full hosting flow**: Sign in → Host → Verify QR code → Stop → Verify status='ended'
33. **Restart restoration**: Host → Quit app → Reopen → Verify restored
34. **Ended session no restore**: Host → Stop → Quit → Reopen → Verify not hosting
35. **Override ended session**: Host → Stop → Host again → Verify new session

### Manual Test Scenarios

36. **Different user scenario (active)**:
    - User A signs in, hosts session
    - Quit app
    - User B signs in on same device
    - Reopen app
    - Verify: Dialog shown, fields preserved
    - User B cannot host (blocked)

37. **Different user scenario (ended)**:
    - User A signs in, hosts session
    - Stop hosting
    - Quit app
    - User B signs in on same device
    - Reopen app
    - Verify: No dialog, no restore
    - User B clicks Host → Works, overrides old values

38. **Owner returns after different user**:
    - User A signs in, hosts session
    - Quit app
    - User B signs in, sees dialog
    - Quit app
    - User A signs back in
    - Reopen app
    - Verify: Session restored for User A

39. **Same user, different device**:
    - User A hosts on Device 1
    - User A opens app on Device 2
    - Verify: Device 2 doesn't try to restore Device 1's session
    (Note: hosted_session_id is per-local-session, not per-user)

## Implementation Order

1. **Database migration** - Add three columns to sessions table
2. **Rust commands** - session_set_hosted, session_update_hosted_status
3. **Update Session types** - Rust struct and TypeScript interface
4. **Update hostSession()** - Store hosted info, check for conflicts
5. **Update stopHosting()** - Update status to 'ended'
6. **Update loadSession()** - New restoration logic with status check
7. **Add UI for different-user scenario** - Dialog component
8. **Remove old persistence** - Clean up settings-based storage
9. **Unit tests** - All new functionality
10. **E2E tests** - Critical paths

## Files to Modify

### Backend (Rust)
- `src-tauri/src/db/schema.rs` - Migration 8
- `src-tauri/src/commands/session.rs` - Session struct, new commands, updated queries

### Frontend (TypeScript)
- `src/services/session.ts` - Session interface, new service methods
- `src/stores/sessionStore.ts` - hostSession, stopHosting, loadSession
- `src/services/hostedSession.ts` - Remove or update persistence functions
- `src/components/session/` - Dialog for different-user scenario

### Tests
- `src/stores/sessionStore.test.ts` - Update existing, add new tests
- `tests/e2e/hosted-session.spec.ts` - E2E restoration tests

## Migration Notes

- Existing `hosted_session_id` in settings table should be migrated on first run:
  - Read from settings, write to active session with status='active', clear settings
- Or: Just clear it and let users re-host (simpler, minor inconvenience)
- Settings key `hosted_session_id` can be removed from `ALLOWED_SETTING_KEYS`

## Decisions Made

1. **Privacy:** Keep notifications anonymous - say "another user" not their email
2. **Different user with active session:** Inform user, keep fields intact, block new hosting
3. **Field preservation:** Never clear fields - only update status to 'ended'
4. **Override rule:** Only allow override when status = 'ended'

## Open Questions

1. Should we add `hosted_at` timestamp for tracking when hosting started?
   - Nice to have, not essential for MVP

## Follow-up Tasks (from code review)

```json
[
  {
    "id": "REVIEW-001",
    "category": "Type Safety",
    "priority": "medium",
    "description": "Create TypeScript constants for hosted session status values instead of string literals",
    "details": "Status values ('active', 'paused', 'ended') are scattered as string literals. Create a const object and union type for type safety and refactoring ease.",
    "files": [
      "src/services/session.ts",
      "src/stores/sessionStore.ts"
    ],
    "steps_to_verify": [
      "Create HostedSessionStatus type as 'active' | 'paused' | 'ended'",
      "Create HOSTED_SESSION_STATUS const object with ACTIVE, PAUSED, ENDED keys",
      "Update Session interface to use HostedSessionStatus type",
      "Replace all string literals with constants",
      "Verify TypeScript compilation passes",
      "Run unit tests to confirm no regressions"
    ],
    "passes": false
  },
  {
    "id": "REVIEW-002",
    "category": "Database Integrity",
    "priority": "medium",
    "description": "Add CHECK constraint to migration for hosted_session_status validation",
    "details": "The migration adds columns without constraints. Add CHECK constraint to ensure only valid status values ('active', 'paused', 'ended', NULL) at the database level.",
    "files": [
      "src-tauri/src/db/schema.rs"
    ],
    "steps_to_verify": [
      "Add new migration (Migration 12) with CHECK constraint",
      "Constraint should allow NULL or values in ('active', 'paused', 'ended')",
      "Test that invalid status values are rejected by database",
      "Test that valid status values are accepted",
      "Verify existing data is not affected"
    ],
    "passes": false
  },
  {
    "id": "REVIEW-003",
    "category": "User Experience",
    "priority": "low",
    "description": "Improve error message when hosting is blocked by another user",
    "details": "Current message just says 'Another user is hosting this session'. Make it more actionable by explaining they must stop hosting first.",
    "files": [
      "src/stores/sessionStore.ts"
    ],
    "steps_to_verify": [
      "Update error message at line ~592 to be more actionable",
      "New message should explain: 'Another user is currently hosting this session. They must stop hosting before you can host.'",
      "Verify error is displayed correctly in UI",
      "Update any tests that check for the old error message"
    ],
    "passes": false
  },
  {
    "id": "REVIEW-004",
    "category": "Database Safety",
    "priority": "low",
    "description": "Wrap session_set_hosted command in database transaction",
    "details": "The session_set_hosted command performs validation and update but doesn't use a transaction. Add transaction wrapper for consistency.",
    "files": [
      "src-tauri/src/commands/session.rs"
    ],
    "steps_to_verify": [
      "Wrap session_set_hosted logic in transaction",
      "Ensure rollback on any failure",
      "Add test for transaction rollback scenario",
      "Verify command still works correctly"
    ],
    "passes": false
  },
  {
    "id": "REVIEW-005",
    "category": "Performance",
    "priority": "low",
    "description": "Move legacy migration cleanup to one-time app startup",
    "details": "MIGRATE-002 cleanup runs on every loadSession() call. Move to one-time migration during app startup to reduce unnecessary I/O.",
    "files": [
      "src/stores/sessionStore.ts",
      "src/App.tsx"
    ],
    "steps_to_verify": [
      "Create one-time migration function for legacy hosted_session_id cleanup",
      "Call migration during app initialization (before loadSession)",
      "Track migration completion in settings/database",
      "Remove cleanup code from loadSession()",
      "Verify legacy data is still migrated correctly on first run",
      "Consider removing after 1-2 releases when users have upgraded"
    ],
    "passes": false
  },
  {
    "id": "REVIEW-006",
    "category": "User Interface",
    "priority": "medium",
    "description": "Show hosted session icon in Stored Sessions modal",
    "details": "In the Load Session modal (stored sessions list), display the Radio icon next to sessions that have hosted_session_id. This helps users identify which sessions were previously hosted.",
    "files": [
      "src/components/session/SessionBar.tsx",
      "src/components/session/SessionBar.test.tsx"
    ],
    "steps_to_verify": [
      "Add Radio icon next to session name in recentSessions.map() (around line 405)",
      "Only show icon if session has hosted_session_id",
      "Consider different styling if hosted_session_status is 'active' vs 'ended' (e.g., green vs gray)",
      "Add tooltip explaining 'This session was hosted' or 'Currently hosting'",
      "Add unit tests for icon visibility based on hosted fields",
      "Verify icon displays correctly in the modal"
    ],
    "passes": false
  }
]
```
