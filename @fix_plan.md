# Fix Plan

Prioritized list of tasks for Ralph autonomous development.

## Status Legend
- [ ] Not started
- [~] In progress
- [x] Complete

---

# Current: Host Session Feature (#201)

References:
- `plan/201-host-session.md` for full specification.
- `plan/201-host-session-tasks.md` for detailed task breakdown.

---

## Phase 1: Dependencies

### P1.1: Install QR code package
- [x] Run `npm install qrcode @types/qrcode`
- [x] Run `just check`

---

## Phase 2: Hosted Session Service

### P2.1: Create hostedSession service
- [x] Create `src/services/hostedSession.ts`
- [x] Export from `src/services/index.ts`
- [x] Define `HostedSession` interface (id, sessionCode, joinUrl, qrCodeUrl, expiresAt, status, stats)
- [x] Implement `createHostedSession(accessToken, sessionName?)` - POST /api/session/create
- [x] Implement `getSession(accessToken, sessionId)` - GET /api/session/[id]
- [x] Implement `endHostedSession(accessToken, sessionId)` - DELETE /api/session/[id]
- [x] Add logging with `createLogger("HostedSessionService")`

---

## Phase 3: Session Store Extensions

### P3.1: Add hosting state to sessionStore
- [x] Add `hostedSession: HostedSession | null` state
- [x] Add `isHosting` derived state (hostedSession !== null)
- [x] Add `showHostModal: boolean` state

### P3.2: Implement hosting actions
- [x] Implement `hostSession()` - create hosted session, start polling
- [x] Implement `stopHosting()` - end hosted session, stop polling
- [x] Implement `refreshHostedSession()` - poll for stats
- [x] Implement `openHostModal()` and `closeHostModal()`

### P3.3: Add polling loop
- [x] Create 30-second polling interval when hosting
- [x] Update `hostedSession.stats` on each poll
- [x] Clean up interval on stopHosting or unmount

---

## Phase 4: Session Bar UI

### P4.1: Add Host button to SessionBar
- [x] Add Globe icon "Host" button after session name
- [x] Show only when `isAuthenticated && session && !hostedSession`
- [x] Call `hostSession()` on click

### P4.2: Add join code badge
- [x] Show `HK-XXXX-XXXX` badge when hosting
- [x] Click opens host modal
- [x] Style for visibility (monospace, high contrast)

---

## Phase 5: Host Session Modal

### P5.1: Create HostSessionModal component
- [x] Create `src/components/session/HostSessionModal.tsx`
- [x] Export from `src/components/session/index.ts`
- [x] Large join code display (monospace, readable from distance)
- [x] QR code image from `qrCodeUrl`
- [x] Join URL text
- [x] "Copy Link" and "Copy Code" buttons
- [x] Stats display: guests connected, pending requests
- [x] "Stop Hosting" button
- [x] Modal opens via `showHostModal` state

### P5.2: Create JoinCodeQR component
- [x] Create `src/components/session/JoinCodeQR.tsx`
- [x] Export from `src/components/session/index.ts`
- [x] Display QR code image from URL
- [x] Accept `size` prop (default 200px)

---

## Phase 6: Video Player Integration

### P6.1: Enhance VideoPlayer idle state
- [x] When `hostedSession && !currentVideo && !isLoading`, show join overlay
- [x] Display large QR code (~300px)
- [x] Display join code `HK-XXXX-XXXX` in large text
- [x] Show "Scan to join or visit homekaraoke.app/join"

### P6.2: Enhance NextSongOverlay
- [x] Add optional `joinCode` prop
- [x] When provided, show subtle "Join: HK-XXXX-XXXX" in corner

---

## Phase 7: Detached Player Sync

### P7.1: Update windowManager sync
- [x] Include `hostedSession` in `PlayerStateSyncData`
- [x] Emit hostedSession changes to detached window

### P7.2: Update DetachedPlayer
- [x] Display join info overlay when idle and `state.hostedSession` exists
- [x] Match VideoPlayer idle state layout

---

## Phase 8: Testing

### P8.1: E2E tests
- [x] Create `tests/e2e/hosted-session.spec.ts`
- [x] Test Host button visibility (auth + session required)
- [x] Test modal displays join code and QR
- [x] Test copy buttons work
- [x] Test stop hosting ends session
- [x] Test join code appears in video idle state (skipped - requires manual testing)

### P8.2: Manual test cases (requires human QA)
> **Note:** These are manual QA tasks requiring real API calls and visual verification.

- [ ] Host button hidden when not authenticated
- [ ] Host button hidden when no active session
- [ ] Join code readable from distance
- [ ] QR code scans correctly and opens join page
- [ ] Copy buttons work
- [ ] Stats update on heartbeat
- [ ] Stop hosting clears state
- [ ] Join code shows in idle video player
- [ ] Join code shows in NextSongOverlay

---

## Phase 9: Documentation

### P9.1: Update CLAUDE.md
- [x] Document hostedSession service pattern
- [x] Document hosting state in sessionStore

### P9.2: Update changelog
- [x] Add "Host Session" feature to CHANGELOG.md

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
1. Ensure website API endpoints are deployed
2. Create GitHub issue #201 (done)
3. Create feature branch: `feature/201-host-session`

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

### npm dependencies:
```bash
npm install qrcode @types/qrcode
```

### Website API (already deployed):
- `POST /api/session/create` - Create hosted session
- `GET /api/session/[id]` - Get session + stats
- `DELETE /api/session/[id]` - End session

---

## New Files

### TypeScript
- `src/services/hostedSession.ts`
- `src/components/session/HostSessionModal.tsx`
- `src/components/session/JoinCodeQR.tsx`
- `tests/e2e/hosted-session.spec.ts`

## Modified Files

### TypeScript
- `src/stores/sessionStore.ts`
- `src/components/session/SessionBar.tsx`
- `src/components/session/index.ts`
- `src/components/player/VideoPlayer.tsx`
- `src/components/player/NextSongOverlay.tsx`
- `src/components/player/DetachedPlayer.tsx`
- `src/services/windowManager.ts`
- `src/services/index.ts`

---

## API Reference

### POST /api/session/create
**Request:** Bearer token in Authorization header
**Response:**
```json
{
  "session_id": "uuid",
  "session_code": "HK-ABCD-1234",
  "qr_code_url": "https://api.qrserver.com/...",
  "join_url": "https://homekaraoke.app/join/HK-ABCD-1234",
  "expires_at": "2024-01-24T..."
}
```

### GET /api/session/[id]
**Request:** Bearer token in Authorization header
**Response:**
```json
{
  "id": "uuid",
  "session_code": "HK-ABCD-1234",
  "status": "active",
  "stats": {
    "pending_requests": 2,
    "approved_requests": 5,
    "total_guests": 3
  }
}
```

### DELETE /api/session/[id]
**Request:** Bearer token in Authorization header
**Response:** 204 No Content
