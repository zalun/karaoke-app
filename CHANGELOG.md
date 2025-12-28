# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Reload button in PlayerControls for stuck videos (#69)
  - Re-fetches streaming URL and reloads video from the beginning
  - Useful when videos get stuck in loading state
- "Play Next" button in search results to add songs to top of queue (#72)
  - Inserts song at position 0 so it plays immediately after the current song
  - If nothing is playing, starts playback immediately
  - Button order: [+] Add to Queue, [⏭] Play Next (green), [▶] Play Now

### Changed
- Improve About dialog with description and GitHub link (#65)
  - Display app description and clickable GitHub repository link
  - Show author information and copyright with dynamic year
  - Use compile-time environment variables from Cargo.toml for consistency
- Use thiserror for structured error types in Rust backend (#57)
  - Replace string-based error handling with typed `CommandError` enum
  - Better error categorization (database, validation, not found, etc.)
  - Errors now include type information for easier debugging
  - Updated all command modules: display, queue, session, keep_awake, media_controls, youtube

### Fixed
- Associate existing queue and history with newly started session (#77)
  - Queue and history items are now migrated to the new session when clicking "Start Session"
  - Previous behavior would reset the UI and leave items orphaned in the old session
- Fix song duration display not updating when switching songs in detached mode (#71)
  - Duration from video metadata in detached window is now synced back to main window
  - Resets duration/currentTime when setting new video to prevent stale values
- Fix queue not continuing after playing from History or Search (#68)
  - Songs played from Search or History no longer cause auto-play to continue through history
  - When a song ends naturally, the next song always comes from the queue
  - "Next" button still navigates forward through history as expected
- Fix window restoring to wrong display and size (#60)
  - Use Tauri's monitor API for consistent physical pixel coordinates
  - Previously used CoreGraphics logical points which don't match window positions on Retina displays
  - Windows now correctly restore to their saved position on the correct monitor

## [0.3.5] - 2025-12-27

### Fixed
- Add missing Tauri permissions for window position/size operations
  - Fixes "window.set_position not allowed" error during layout restore

## [0.3.4] - 2025-12-27

### Added
- "Replay All" button in History panel to move all history items back to queue (#47)
  - Moves all played songs back to the queue in their original order
  - Clears history after moving items
  - Persisted to database for session recovery

### Fixed
- Validate window bounds before restoring position (#52)
  - Prevents windows from being positioned off-screen after display changes
  - Windows are centered on main display if saved position is no longer valid
  - Constrains window size if larger than current display

## [0.3.3] - 2025-12-26

### Added
- Display hotplug detection and window layout restore (#48)
  - Automatically detects when displays are connected/disconnected
  - Save current window layout via View → Save Display Layout menu
  - Restore dialog appears when a saved display configuration is detected
  - "Remember my choice" option for automatic restore without dialog
  - Auto-restore saved layouts on app startup
  - Detach button appears on hover over video player
  - Database storage for display configs and window states with proper migrations

### Changed
- Refactor: Extracted shared video playback logic into `playVideo` helper (#42)
  - Consolidated duplicate code from PlayerControls and useMediaControls
  - New `playVideo()` function in playerStore handles stream URL fetching, state updates, and error handling

### Fixed
- Media controls event polling thread now shuts down gracefully on app exit (#40)
  - Added shutdown flag mechanism with `recv_timeout` for responsive termination
  - Thread handle stored in AppState for proper cleanup
- Video loading indicator now works correctly when player is detached
- Fixed double audio issue when starting with detached player window

## [0.3.1] - 2025-12-26

### Added
- macOS Now Playing widget integration (#38)
  - Display song title and artist in Control Center, Touch Bar, and AirPods controls
  - Support for media key controls (play/pause, next, previous)
  - Album artwork from YouTube thumbnails
  - Playback position and progress tracking

## [0.3.0] - 2025-12-26

### Added
- Queue and history persistence across app restarts (#31)
  - Queue and history data saved to SQLite database per session
  - Sessions menu in macOS menu bar for managing stored sessions
  - Load, rename, and delete stored sessions from dialog
  - Singer assignments preserved with queue items
  - Empty sessions automatically cleaned up on end
  - Singer avatars displayed in stored sessions list
- Infinite scroll pagination for search results (#35)
  - Automatically loads more results when scrolling to bottom
  - Fetches up to 50 results per search (displays 15 at a time)
  - Shows "Loading more..." indicator while fetching
  - Displays "End of results" when all results are shown

## [0.2.1] - 2025-12-26

### Fixed
- Singer picker button now has better contrast against queue item tiles (#30)
- Singer picker button has distinct hover state with blue highlight (#30)
- Singer assignment dropdown now fits within window bounds (#32)
- Dropdown opens below button when insufficient space above
- Dropdown is scrollable when list of singers exceeds available space

## [0.2.0] - 2025-12-25

### Added
- Debug logging mode with macOS app menu toggle (#21, #22)
  - Persistent file logging via `tauri-plugin-log` (~20MB max, 4 rotated files)
  - View → Debug Mode menu toggle
  - View → Open Log Folder menu item
  - Structured logging with scoped loggers throughout the app
- Show next song overlay with countdown before video ends (#12, #17)
- Prefetch next video stream URL to reduce loading time (#11)
- Detachable video player window (#6, #7, #20)
  - Pop out video to separate window
  - State sync between main and detached windows
  - Reattach functionality
- Microphone app icon for all platforms (#14)
- UI Polish: Tabbed view, keep-awake, and draggable queue (#4, #8)
- YouTube integration with yt-dlp (#2, #3)
  - Search YouTube videos
  - Stream playback
  - Auto-install yt-dlp if missing

### Fixed
- yt-dlp detection in built .app bundles (#16)
- Detached player state synchronization issues (#20)
- Various seek, progress bar, and error handling improvements

## [0.1.0] - 2025-12-01

### Added
- Initial release
- Basic Tauri + React + TypeScript setup
- SQLite database for persistence
- Queue and history management
- Basic video player controls

[0.3.3]: https://github.com/zalun/karaoke-app/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/zalun/karaoke-app/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/zalun/karaoke-app/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/zalun/karaoke-app/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/zalun/karaoke-app/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/zalun/karaoke-app/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/zalun/karaoke-app/releases/tag/v0.1.0
