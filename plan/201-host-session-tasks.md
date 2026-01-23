# Host Session Tasks (#201)

## Phase 1: Dependencies & Service Layer

### Task 1.1: Install QR code dependency
```bash
npm install qrcode @types/qrcode
```

### Task 1.2: Create HostedSession types
Create `src/services/hostedSession.ts` with TypeScript interfaces only:
- `HostedSession` interface
- `CreateSessionResponse` interface
- `SessionStats` interface

### Task 1.3: Implement createHostedSession API call
In `src/services/hostedSession.ts`:
- Add `createHostedSession(accessToken: string, sessionName?: string)` function
- POST to `https://homekaraoke.app/api/session/create`
- Pass `Authorization: Bearer ${accessToken}` header
- Return `HostedSession` object

### Task 1.4: Implement getSession API call
In `src/services/hostedSession.ts`:
- Add `getSession(accessToken: string, sessionId: string)` function
- GET to `https://homekaraoke.app/api/session/${sessionId}`
- Pass `Authorization: Bearer ${accessToken}` header
- Return `HostedSession` with stats

### Task 1.5: Implement endHostedSession API call
In `src/services/hostedSession.ts`:
- Add `endHostedSession(accessToken: string, sessionId: string)` function
- DELETE to `https://homekaraoke.app/api/session/${sessionId}`
- Pass `Authorization: Bearer ${accessToken}` header

### Task 1.6: Export hostedSessionService
In `src/services/hostedSession.ts`:
- Export `hostedSessionService` object with all functions
Update `src/services/index.ts`:
- Add export for `hostedSessionService`

---

## Phase 2: Session Store Extensions

### Task 2.1: Add hosting state to sessionStore
In `src/stores/sessionStore.ts`:
- Add to state: `hostedSession: HostedSession | null`
- Add to state: `showHostModal: boolean`
- Initialize both to `null` and `false`

### Task 2.2: Add openHostModal and closeHostModal actions
In `src/stores/sessionStore.ts`:
- Add `openHostModal: () => set({ showHostModal: true })`
- Add `closeHostModal: () => set({ showHostModal: false })`

### Task 2.3: Implement hostSession action
In `src/stores/sessionStore.ts`:
- Add `hostSession` async action
- Get access token from `useAuthStore.getState()`
- Get session name from current session
- Call `hostedSessionService.createHostedSession()`
- Set `hostedSession` state
- Start polling interval (30 seconds)

### Task 2.4: Implement stopHosting action
In `src/stores/sessionStore.ts`:
- Add `stopHosting` async action
- Get access token from `useAuthStore.getState()`
- Call `hostedSessionService.endHostedSession()`
- Clear polling interval
- Set `hostedSession` to `null`

### Task 2.5: Implement refreshHostedSession action
In `src/stores/sessionStore.ts`:
- Add `refreshHostedSession` async action
- Get access token from `useAuthStore.getState()`
- Call `hostedSessionService.getSession()`
- Update `hostedSession.stats`

### Task 2.6: Add polling cleanup on session end
In `src/stores/sessionStore.ts`:
- In `endSession` action, call `stopHosting` if `hostedSession` exists

---

## Phase 3: SessionBar UI

### Task 3.1: Import auth store in SessionBar
In `src/components/session/SessionBar.tsx`:
- Add import for `useAuthStore`
- Get `isAuthenticated` from auth store

### Task 3.2: Import hosting state in SessionBar
In `src/components/session/SessionBar.tsx`:
- Get `hostedSession`, `hostSession`, `openHostModal` from session store

### Task 3.3: Add Host button to SessionBar
In `src/components/session/SessionBar.tsx`:
- Add Globe icon import from lucide-react
- Add button after session name display
- Show only when: `session && isAuthenticated && !hostedSession`
- On click: call `hostSession()`

### Task 3.4: Add join code badge to SessionBar
In `src/components/session/SessionBar.tsx`:
- Add badge showing `hostedSession.sessionCode`
- Show only when: `hostedSession !== null`
- On click: call `openHostModal()`
- Style: blue background, white text, rounded

---

## Phase 4: Host Modal Components

### Task 4.1: Create JoinCodeQR component
Create `src/components/session/JoinCodeQR.tsx`:
- Props: `url: string`, `size?: number` (default 200)
- Render: `<img src={url} alt="Scan to join" />`
- Add loading state while image loads

### Task 4.2: Create HostSessionModal shell
Create `src/components/session/HostSessionModal.tsx`:
- Import from session store: `hostedSession`, `showHostModal`, `closeHostModal`, `stopHosting`
- Return null if `!showHostModal`
- Render modal overlay with close button

### Task 4.3: Add join code display to modal
In `src/components/session/HostSessionModal.tsx`:
- Display `hostedSession.sessionCode` in large monospace font
- Style: white text, high contrast, 2rem+ font size

### Task 4.4: Add QR code to modal
In `src/components/session/HostSessionModal.tsx`:
- Import `JoinCodeQR` component
- Display QR code using `hostedSession.qrCodeUrl`
- Size: 200px

### Task 4.5: Add join URL display to modal
In `src/components/session/HostSessionModal.tsx`:
- Display `hostedSession.joinUrl` as text
- Style: smaller gray text below QR code

### Task 4.6: Add Copy Code button to modal
In `src/components/session/HostSessionModal.tsx`:
- Add button "Copy Code"
- On click: `navigator.clipboard.writeText(hostedSession.sessionCode)`
- Show "Copied!" feedback

### Task 4.7: Add Copy Link button to modal
In `src/components/session/HostSessionModal.tsx`:
- Add button "Copy Link"
- On click: `navigator.clipboard.writeText(hostedSession.joinUrl)`
- Show "Copied!" feedback

### Task 4.8: Add stats display to modal
In `src/components/session/HostSessionModal.tsx`:
- Display `{stats.totalGuests} guests connected`
- Display `{stats.pendingRequests} pending requests`

### Task 4.9: Add Stop Hosting button to modal
In `src/components/session/HostSessionModal.tsx`:
- Add red "Stop Hosting" button
- On click: call `stopHosting()` then `closeHostModal()`

### Task 4.10: Export HostSessionModal
Update `src/components/session/index.ts`:
- Add export for `HostSessionModal`
- Add export for `JoinCodeQR`

### Task 4.11: Add HostSessionModal to SessionBar
In `src/components/session/SessionBar.tsx`:
- Import `HostSessionModal`
- Render `<HostSessionModal />` at end of component

---

## Phase 5: Video Player Overlays

### Task 5.1: Import hosting state in VideoPlayer
In `src/components/player/VideoPlayer.tsx`:
- Import `useSessionStore`
- Get `hostedSession` from session store

### Task 5.2: Create JoinInfoOverlay component
Create inline component in `src/components/player/VideoPlayer.tsx`:
- Display QR code (300px)
- Display join code in large text
- Display "Scan to join or visit homekaraoke.app/join"
- Centered on screen

### Task 5.3: Show JoinInfoOverlay in idle state
In `src/components/player/VideoPlayer.tsx`:
- In idle state section (no video playing)
- Render `JoinInfoOverlay` when `hostedSession && !currentVideo && !isLoading`

### Task 5.4: Add joinCode prop to NextSongOverlay
In `src/components/player/NextSongOverlay.tsx`:
- Add optional prop: `joinCode?: string`
- When provided, display small text in top-right corner
- Text: "Join: {joinCode}"
- Style: subtle, semi-transparent

### Task 5.5: Pass joinCode to NextSongOverlay
In `src/components/player/VideoPlayer.tsx`:
- Pass `joinCode={hostedSession?.sessionCode}` to `NextSongOverlay`

---

## Phase 6: Detached Player Support

### Task 6.1: Add hostedSession to PlayerStateSyncData
In `src/services/windowManager.ts`:
- Add `hostedSession?: HostedSession` to `PlayerStateSyncData` interface

### Task 6.2: Include hostedSession in state sync
In `src/components/player/VideoPlayer.tsx`:
- In `syncStateToDetached`, include `hostedSession`

### Task 6.3: Display join info in DetachedPlayer idle state
In `src/components/player/DetachedPlayer.tsx`:
- Import `JoinCodeQR` component
- In idle state, show join info if `state.hostedSession` exists
- Display QR code, join code, instructions

### Task 6.4: Pass joinCode to NextSongOverlay in DetachedPlayer
In `src/components/player/DetachedPlayer.tsx`:
- Pass `joinCode={state.hostedSession?.sessionCode}` to `NextSongOverlay`

---

## Phase 7: Testing

### Task 7.1: Create hosted-session E2E test file
Create `tests/e2e/hosted-session.spec.ts`:
- Import test utilities
- Add describe block for "Host Session"

### Task 7.2: Add test for Host button visibility
In `tests/e2e/hosted-session.spec.ts`:
- Test: Host button hidden when not authenticated
- Test: Host button hidden when no active session
- Test: Host button visible when authenticated + session active

### Task 7.3: Add test for modal display
In `tests/e2e/hosted-session.spec.ts`:
- Test: Modal shows join code
- Test: Modal shows QR code image
- Test: Modal shows copy buttons

### Task 7.4: Add test for copy functionality
In `tests/e2e/hosted-session.spec.ts`:
- Test: Copy Code button copies to clipboard
- Test: Copy Link button copies to clipboard

### Task 7.5: Add test for stop hosting
In `tests/e2e/hosted-session.spec.ts`:
- Test: Stop Hosting ends session
- Test: Host button reappears after stopping
