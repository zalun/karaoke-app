# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- Media controls event polling thread now shuts down gracefully on app exit (#40)
  - Added shutdown flag mechanism with `recv_timeout` for responsive termination
  - Thread handle stored in AppState for proper cleanup

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

[0.3.0]: https://github.com/zalun/karaoke-app/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/zalun/karaoke-app/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/zalun/karaoke-app/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/zalun/karaoke-app/releases/tag/v0.1.0
