# HomeKaraoke Task Plan

This file tracks the prioritized task list for Ralph autonomous development.

## Priority Legend
- **P1**: Critical - blocks other work or user experience
- **P2**: High - important for next release
- **P3**: Medium - nice to have
- **P4**: Low - future consideration

---

## Current Sprint: Phase 5c - Local Library Polish

### P2: Scan Progress & Background Processing
- [ ] Scan progress indicator (show files scanned, metadata fetched)
- [ ] Background scanning (don't block UI during rescan)

### P2: Missing File UX
- [ ] File path display in PlayerControls for local files
- [ ] Incremental folder watching (detect new files without full rescan)

---

## Upcoming: Phase 6 - Downloads

See `plan/06-downloads.md` for full specification.

### P2: Download Infrastructure
- [ ] `youtube_download(video_id)` Tauri command with progress events
- [ ] Download progress UI (percentage, speed indicator)
- [ ] Download queue tracking (pending, downloading, completed, failed)
- [ ] Cancel download functionality

### P3: Downloaded Library Management
- [ ] Downloaded videos stored in app data directory
- [ ] Generate/cache thumbnails locally
- [ ] Delete downloaded video option
- [ ] Handle download interruption (resume support)

---

## Upcoming: Phase 7 - Polish

See `plan/07-polish.md` for full specification.

### P2: Fullscreen Video Mode
- [ ] Toggle fullscreen <-> windowed without interrupting playback
- [ ] Queue continues automatically in fullscreen
- [ ] Shortcuts: F or double-click -> toggle fullscreen
- [ ] ESC -> exit fullscreen (but not pause)

### P2: Keyboard Shortcuts - Global
- [ ] Space: Play/pause
- [ ] N: Next video
- [ ] M: Mute/unmute
- [ ] Up/Down: Volume +/-10%

### P2: Keyboard Shortcuts - Video Window
- [ ] F: Toggle fullscreen
- [ ] ESC: Exit fullscreen
- [ ] Left/Right: Seek +/-10s

### P3: Keyboard Shortcuts - Management Window
- [ ] Cmd+O: Add file to queue
- [ ] Cmd+F or /: Focus on search
- [ ] Delete: Remove selected from queue
- [ ] Enter: Play selected / confirm action

### P3: UX Polish
- [ ] Loading states for all async operations
- [ ] Empty states (no search results, empty queue, etc.)
- [ ] Tooltips on buttons
- [ ] Confirmation dialogs for destructive actions

---

## Future Features

See `plan/future/` for detailed specifications.

### High Priority
- [ ] Singer Rotation (fair turn-taking algorithm)
- [ ] QR Code Requests (audience song requests)
- [ ] Lyrics Display overlay

### Medium Priority
- [ ] Voting System (audience votes on queue order)
- [ ] Popular Songs recommendations
- [ ] Singer Stats (songs sung, favorites, etc.)

### Low Priority
- [ ] Smart Playlists (auto-generated themed playlists)
- [ ] AirPlay Integration

---

## Bug Fixes & Technical Debt

### P1: Known Issues
(None currently tracked)

### P3: Refactoring
- [ ] Improve E2E test stability (reduce flakiness)
- [ ] Add more unit test coverage for Rust backend

---

## Completion Criteria

A task is complete when:
1. Code compiles without warnings
2. `just check` passes (typecheck + lint + cargo check)
3. Existing tests pass (`just test`)
4. Manual smoke test confirms functionality
5. Changelog updated (if user-facing change)

## Notes for Ralph

- Always create a GitHub issue before starting work
- Create feature branch from issue
- Run `just check` before marking tasks complete
- Ask user before running E2E tests (`just e2e`)
- Update this file as tasks are completed
