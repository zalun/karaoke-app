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
- [ ] Run `npm install qrcode @types/qrcode`
- [ ] Run `just check`

---

## Phase 2: Hosted Session Service

### P2.1: Create hostedSession service
- [ ] Create `src/services/hostedSession.ts`
- [ ] Export from `src/services/index.ts`
- [ ] Define `HostedSession` interface (id, sessionCode, joinUrl, qrCodeUrl, expiresAt, status, stats)
- [ ] Implement `createHostedSession(accessToken, sessionName?)` - POST /api/session/create
- [ ] Implement `getSession(accessToken, sessionId)` - GET /api/session/[id]
- [ ] Implement `endHostedSession(accessToken, sessionId)` - DELETE /api/session/[id]
- [ ] Add logging with `createLogger("HostedSessionService")`

---

## Phase 3: Session Store Extensions

### P3.1: Add hosting state to sessionStore
- [ ] Add `hostedSession: HostedSession | null` state
- [ ] Add `isHosting` derived state (hostedSession !== null)
- [ ] Add `showHostModal: boolean` state

### P3.2: Implement hosting actions
- [ ] Implement `hostSession()` - create hosted session, start polling
- [ ] Implement `stopHosting()` - end hosted session, stop polling
- [ ] Implement `refreshHostedSession()` - poll for stats
- [ ] Implement `openHostModal()` and `closeHostModal()`

### P3.3: Add polling loop
- [ ] Create 30-second polling interval when hosting
- [ ] Update `hostedSession.stats` on each poll
- [ ] Clean up interval on stopHosting or unmount

---

## Phase 4: Session Bar UI

### P4.1: Add Host button to SessionBar
- [ ] Add Globe icon "Host" button after session name
- [ ] Show only when `isAuthenticated && session && !hostedSession`
- [ ] Call `hostSession()` on click

### P4.2: Add join code badge
- [ ] Show `HK-XXXX-XXXX` badge when hosting
- [ ] Click opens host modal
- [ ] Style for visibility (monospace, high contrast)

---

## Phase 5: Host Session Modal

### P5.1: Create HostSessionModal component
- [ ] Create `src/components/session/HostSessionModal.tsx`
- [ ] Export from `src/components/session/index.ts`
- [ ] Large join code display (monospace, readable from distance)
- [ ] QR code image from `qrCodeUrl`
- [ ] Join URL text
- [ ] "Copy Link" and "Copy Code" buttons
- [ ] Stats display: guests connected, pending requests
- [ ] "Stop Hosting" button
- [ ] Modal opens via `showHostModal` state

### P5.2: Create JoinCodeQR component
- [ ] Create `src/components/session/JoinCodeQR.tsx`
- [ ] Export from `src/components/session/index.ts`
- [ ] Display QR code image from URL
- [ ] Accept `size` prop (default 200px)

---

## Phase 6: Video Player Integration

### P6.1: Enhance VideoPlayer idle state
- [ ] When `hostedSession && !currentVideo && !isLoading`, show join overlay
- [ ] Display large QR code (~300px)
- [ ] Display join code `HK-XXXX-XXXX` in large text
- [ ] Show "Scan to join or visit homekaraoke.app/join"

### P6.2: Enhance NextSongOverlay
- [ ] Add optional `joinCode` prop
- [ ] When provided, show subtle "Join: HK-XXXX-XXXX" in corner

---

## Phase 7: Detached Player Sync

### P7.1: Update windowManager sync
- [ ] Include `hostedSession` in `PlayerStateSyncData`
- [ ] Emit hostedSession changes to detached window

### P7.2: Update DetachedPlayer
- [ ] Display join info overlay when idle and `state.hostedSession` exists
- [ ] Match VideoPlayer idle state layout

---

## Phase 8: Testing

### P8.1: E2E tests
- [ ] Create `tests/e2e/hosted-session.spec.ts`
- [ ] Test Host button visibility (auth + session required)
- [ ] Test modal displays join code and QR
- [ ] Test copy buttons work
- [ ] Test stop hosting ends session
- [ ] Test join code appears in video idle state

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
- [ ] Document hostedSession service pattern
- [ ] Document hosting state in sessionStore

### P9.2: Update changelog
- [ ] Add "Host Session" feature to CHANGELOG.md

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
