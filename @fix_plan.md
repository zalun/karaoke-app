# Cloud Playlists - Host Client Implementation

**GitHub Issue:** #194

See `plan/future/cloud-playlists.md` for feature specification.

**Prerequisites:** The homekaraoke.app backend must be deployed first (separate project). API contracts will be shared when ready.

---

## Phase 1: Authentication & API Client Setup

### P1.1: API Client Integration
- [ ] Create `src/services/api.ts` with base HTTP client for homekaraoke.app
- [ ] Add environment config for `API_BASE_URL`
- [ ] Create `.env.example` with required variables
- [ ] Handle auth token storage and refresh
- [ ] Add request/response interceptors for error handling

### P1.2: Auth Store & Service
- [ ] Create `src/stores/authStore.ts` (Zustand) with state: user, isAuthenticated, isLoading
- [ ] Create `src/services/authService.ts` for OAuth flows
- [ ] Implement Google OAuth login (opens browser, handles callback)
- [ ] Implement Apple OAuth login (opens browser, handles callback)
- [ ] Implement logout functionality
- [ ] Persist auth session across app restarts
- [ ] Handle token expiry and refresh

### P1.3: Login/Logout UI
- [ ] Create `src/components/auth/LoginDialog.tsx` with OAuth buttons
- [ ] Create `src/components/auth/UserMenu.tsx` (avatar, name, logout)
- [ ] Add user menu to app header/sidebar
- [ ] Show login prompt when accessing cloud features while logged out
- [ ] Handle OAuth callback deep links in Tauri

---

## Phase 2: Cloud Playlists

### P2.1: Cloud Playlist Store & Service
- [ ] Create `src/stores/cloudPlaylistStore.ts` with playlists, items, sync status
- [ ] Create `src/services/cloudPlaylistService.ts` for CRUD operations
- [ ] Implement `fetchPlaylists()` - list user's cloud playlists
- [ ] Implement `createPlaylist(name)` - create new playlist
- [ ] Implement `updatePlaylist(id, name)` - rename playlist
- [ ] Implement `deletePlaylist(id)` - delete playlist
- [ ] Implement `fetchPlaylistItems(playlistId)` - get playlist items
- [ ] Implement `addToPlaylist(playlistId, video)` - add song
- [ ] Implement `removeFromPlaylist(playlistId, itemId)` - remove song
- [ ] Implement `reorderPlaylistItems(playlistId, itemIds)` - reorder

### P2.2: Cloud Playlist UI
- [ ] Create `src/components/playlists/CloudPlaylistList.tsx`
- [ ] Create `src/components/playlists/CloudPlaylistItems.tsx`
- [ ] Create `src/components/playlists/CreatePlaylistDialog.tsx`
- [ ] Add "Add to Cloud Playlist" option in search results context menu
- [ ] Add "Add to Cloud Playlist" option in queue item context menu
- [ ] Add cloud playlist browser to Library view (new tab)
- [ ] Implement "Load to Queue" action for cloud playlists

### P2.3: Sync Indicator
- [ ] Add cloud/local indicator icon to playlist items
- [ ] Show sync status in playlist list (synced, syncing, error)
- [ ] Add "Sync Now" manual trigger button
- [ ] Handle offline gracefully (show cached data, queue changes)

---

## Phase 3: Host Sessions (Cloud-Connected)

### P3.1: Host Session Store
- [ ] Create `src/stores/hostSessionStore.ts` with:
  - `cloudSession`: active session info (id, code, status, config)
  - `connectedGuests`: list of connected guests
  - `pendingRequests`: song requests awaiting approval
  - `approvedRequests`: requests added to queue
- [ ] Create `src/services/hostSessionService.ts` for session management

### P3.2: Session Creation
- [ ] Implement `startCloudSession(config)` - calls Edge Function
- [ ] Create `src/components/session/StartCloudSessionDialog.tsx`:
  - Session name input
  - Mode toggle: "Require Approval" / "Direct to Queue"
  - Max song duration setting (optional)
  - Songs per guest limit (optional)
  - Session duration (default 8 hours)
- [ ] Generate and display session code (format: `HK-XXXX-XXXX`)
- [ ] Generate QR code URL for `homekaraoke.app/join/{code}`

### P3.3: QR Code Display
- [ ] Install QR code generation library (e.g., `qrcode.react`)
- [ ] Create `src/components/session/SessionQRCode.tsx`
- [ ] Display QR code in session controls panel
- [ ] Option to show QR code in NextSongOverlay (between songs)
- [ ] Option to show QR code on secondary display (full screen)
- [ ] Add "Copy Join Link" button

### P3.4: Real-Time Subscriptions
- [ ] Create `src/services/realtimeService.ts` for WebSocket connection
- [ ] Subscribe to song request events for session
- [ ] Subscribe to guest connect/disconnect events
- [ ] Handle new request notifications
- [ ] Implement heartbeat to keep session alive (every 30s)
- [ ] Handle reconnection after network interruption

### P3.5: Pending Requests Panel
- [ ] Create `src/components/session/PendingRequestsPanel.tsx`
- [ ] Group requests by guest
- [ ] Show song title, artist, duration for each request
- [ ] Highlight songs exceeding max duration limit
- [ ] Show "Already in queue" warning for duplicates
- [ ] Add notification badge for new requests count

### P3.6: Request Approval UI
- [ ] Implement approve single request
- [ ] Implement reject single request (with optional reason)
- [ ] Implement "Approve All" for a guest's batch
- [ ] Implement "Reject All" for a guest's batch
- [ ] Auto-add approved songs to local queue with guest name as singer
- [ ] Update request status in cloud (triggers guest notification)

---

## Phase 4: Session Management

### P4.1: Session Controls
- [ ] Create `src/components/session/CloudSessionControls.tsx`
- [ ] Implement pause session (guests see "Session Paused")
- [ ] Implement resume session
- [ ] Implement end session (with confirmation)
- [ ] Implement regenerate session code
- [ ] Show session duration timer
- [ ] Show connected guests count

### P4.2: Connected Guests Panel
- [ ] Create `src/components/session/ConnectedGuestsPanel.tsx`
- [ ] List all connected guests with:
  - Display name
  - Account status (logged in vs anonymous)
  - Request count (total, pending)
- [ ] Implement remove guest action
- [ ] Implement promote to co-host action (if guest has account)

### P4.3: Co-Host Management
- [ ] Create `src/components/session/CoHostsPanel.tsx`
- [ ] Add co-host by email input
- [ ] List current co-hosts
- [ ] Remove co-host action
- [ ] Co-hosts receive same real-time notifications as host

### P4.4: Session Rules
- [ ] Create `src/components/session/SessionRulesPanel.tsx`
- [ ] Edit max song duration mid-session
- [ ] Edit songs per guest limit mid-session
- [ ] Toggle approval mode mid-session (with warning about pending requests)

---

## Phase 5: Edge Cases & Polish

### P5.1: Offline Handling
- [ ] Detect network disconnection
- [ ] Continue local playback when offline
- [ ] Queue cloud operations for when reconnected
- [ ] Show "Offline" indicator in session panel
- [ ] Auto-reconnect and sync when back online

### P5.2: Error Handling
- [ ] Handle session expiry gracefully
- [ ] Handle API errors with user-friendly messages
- [ ] Handle rate limiting from server
- [ ] Handle YouTube API quota exceeded (via server)

### P5.3: Notifications
- [ ] In-app notification for new song requests
- [ ] In-app notification for guest joins
- [ ] Sound notification option for requests (configurable)

---

## Completion Criteria

A task is complete when:
1. Code compiles without warnings
2. `just check` passes (typecheck + lint + cargo check)
3. **New tests added** for testable functionality
4. All tests pass (`just test`)
5. Changelog updated (if user-facing change)

---

## Workflow

### At Phase Start
1. Ensure web backend is deployed and accessible
2. Update the "GitHub Issue:" line at the top of this file
3. Create/use feature branch: `feature/194-cloud-playlists`

### During Development Loop
1. Pick next unchecked task
2. **Write failing test first** (when testable):
   - Unit test in `src/**/*.test.ts` for logic/utilities
   - Component test for React components
   - Skip tests for pure UI changes (styles, layouts)
3. Implement the feature until test passes
4. Run `just check` before committing
5. Commit with descriptive message
6. **Add comment to the GitHub issue** noting completed task
7. Mark task as done in this file: `- [x]`
8. Push commits regularly
9. Repeat until all tasks in current phase are checked

### At Phase End
1. Verify all tasks in phase are `[x]` checked
2. Run `just test` to confirm no regressions
3. Update `CHANGELOG.md` with user-facing changes
4. Create PR referencing the issue: `gh pr create`
5. **STOP** - wait for human approval before next phase

### Guidelines
- **Web backend must exist first** - don't implement API calls until backend is deployed
- Test with real Supabase project (not mocks) for integration testing
- Ask user before running E2E tests (`just e2e`)
- Do not merge PRs - only humans can approve and merge
- If stuck on a task, comment on the issue and move to next task

---

## Dependencies

### npm packages to install:
```bash
npm install qrcode.react
```

### Environment variables needed:
```env
VITE_API_BASE_URL=https://homekaraoke.app/api
```

---

## New Files to Create

### Stores (Zustand)
- `src/stores/authStore.ts`
- `src/stores/cloudPlaylistStore.ts`
- `src/stores/hostSessionStore.ts`

### Services
- `src/services/api.ts`
- `src/services/authService.ts`
- `src/services/realtimeService.ts`
- `src/services/cloudPlaylistService.ts`
- `src/services/hostSessionService.ts`

### Components
- `src/components/auth/LoginDialog.tsx`
- `src/components/auth/UserMenu.tsx`
- `src/components/auth/index.ts`
- `src/components/playlists/CloudPlaylistList.tsx`
- `src/components/playlists/CloudPlaylistItems.tsx`
- `src/components/playlists/CreatePlaylistDialog.tsx`
- `src/components/playlists/index.ts`
- `src/components/session/StartCloudSessionDialog.tsx`
- `src/components/session/SessionQRCode.tsx`
- `src/components/session/PendingRequestsPanel.tsx`
- `src/components/session/CloudSessionControls.tsx`
- `src/components/session/ConnectedGuestsPanel.tsx`
- `src/components/session/CoHostsPanel.tsx`
- `src/components/session/SessionRulesPanel.tsx`
- `src/components/session/index.ts`
