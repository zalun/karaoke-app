# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
