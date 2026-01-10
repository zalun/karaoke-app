# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [Unreleased]

## [0.7.1] - 2026-01-10

### Added
- YouTube Data API v3 for search (#149)
  - Official API replaces yt-dlp as default search method
  - Configure API key in Settings > YouTube tab
  - ~100 free searches per day with Google Cloud API key
  - Automatic fallback to yt-dlp if API key not configured
  - Video duration fetched via batch API call for efficiency
- Created GitHub issues for future settings (#152-160)
  - Playback: Video Quality, Autoplay, Default Volume, Prefetch
  - Display: Next Song Overlay, Singer Announcement, Player Position
  - Queue: History Limit, Clear on Exit

### Changed
- Settings reorganized: YouTube configuration moved to dedicated "YouTube" tab
- Unimplemented settings hidden until features are ready
- yt-dlp marked as "Unofficial" option in settings

### Fixed
- Console window no longer flashes when running yt-dlp/ffmpeg on Windows (#150)

## [0.7.0] - 2026-01-06

### Added
- Library browser now shows favorites star on each video (#139)
- Library view automatically refreshes after rescan completes (#139)
- Local build script for creating polished DMG releases (`scripts/build-and-release.sh`)
- Playwright E2E tests with 104 test cases across Chromium/WebKit (#125)
  - Test coverage for search, queue management, player controls, error handling
  - Tauri API mock infrastructure for browser-based testing
  - Comprehensive testing guide at `tests/e2e/GUIDE.md`
- Justfile with 70+ development workflow commands

### Changed
- Navigation tabs styled as proper tab headers instead of buttons (#137)
  - Player/Search/Library tabs (left panel)
  - Queue/History tabs (right panel)
  - Active tab visually connects to content panel
  - Added accessibility attributes (role="tab", aria-selected)

## [0.6.3] - 2026-01-06

### Added
- Enhanced metadata fetching for local library (Phase 5b) (#133)
  - Fetch song info from MusicBrainz (duration, album, year, artist credit)
  - Fetch synced lyrics from Lrclib API
  - Read companion .lrc files as fallback for lyrics
  - Detect MP3+G CDG companion files (shows has_cdg indicator)
  - Options enabled in Settings > Library > Rescan Options

## [0.6.2] - 2026-01-06

### Added
- Local video library support (Phase 5a) (#131)
  - Add folders from Settings > Library tab to scan for video files
  - Search local files with "Local" toggle in search bar
  - Supported formats: mp4, mkv, avi, webm, mov, m4v, wmv, flv
  - Filename parsing extracts artist/title (e.g., "Artist - Title.mp4")
  - Optional .hkmeta.json sidecar files for custom metadata
  - Missing file detection with visual feedback
  - Click-to-start overlay for browser autoplay compliance

### Security
- Path traversal protection with canonicalization
- System directory blocking (cannot add /System, /Library, etc.)
- Recursion depth limiting for directory scanning
- Symlink detection to prevent infinite loops

## [0.6.1] - 2026-01-04

### Changed
- yt-dlp availability check is now lazy (#127)
  - Only checks on startup if playback mode is set to 'ytdlp'
  - Checks when opening Settings > Advanced tab (with loading indicator)
  - Caches result to database to avoid redundant checks
  - Added "Recheck" button for manual re-check after installing yt-dlp

## [0.6.0] - 2026-01-03

### Added
- YouTube iframe as default playback mode (#123)
  - No external dependencies required - works out of the box
  - yt-dlp now optional, available in Settings > Advanced
  - Autoplay handling with retry logic and "Click to Play" fallback
  - Automatic skip for videos that block embedding (error 101/150)
- Settings dialog with tabbed interface (#122)
  - Access via HomeKaraoke > Settings or ⌘,
  - Tabs: Playback, Display, Queue & History, Advanced, About
  - Settings persist to SQLite database
  - Arrow key navigation between tabs
  - Check for Updates button in About tab
  - Open Log Folder button in About tab
  - Video streaming mode setting in Advanced tab

### Changed
- Update check now uses cached endpoint at homekaraoke.app (#121)
  - Avoids GitHub API rate limits (60 requests/hour per IP)
  - Falls back to GitHub API if cached endpoint is unavailable
- DependencyCheck no longer blocks app startup when yt-dlp is missing

## [0.5.9] - 2026-01-01

### Added
- Windows platform support (#105)
  - Windows build in CI (produces MSI and NSIS installers)
  - Media controls integration (play/pause from taskbar)
  - Note: No code signing yet (SmartScreen warnings expected)
  - Note: Multi-display support not available on Windows

## [0.5.8-beta] - 2026-01-01

### Fixed
- DMG containing Contents folder instead of HomeKaraoke.app bundle (#119)
  - create-dmg now receives staging directory instead of .app path directly
  - Added trap for guaranteed cleanup of temporary staging directory

## [0.5.7-beta] - 2025-12-31

### Fixed
- DMG installer missing custom background and having small icons in CI builds
  - Replaced Tauri's AppleScript-based DMG styling with create-dmg tool
  - Uses --sandbox-safe mode that works in headless GitHub Actions

## [0.5.6-beta] - 2025-12-31

### Added
- Prefetch first queue item when player is idle (faster playback start)

### Fixed
- Next song overlay showing wrong song during loading transition (#117)

### Changed
- Increased prefetch threshold from 20s to 30s for slower machines (#117)

## [0.5.5-beta] - 2025-12-31

### Fixed
- Seek bar not working when app starts with detached player (#116)

## [0.5.4-beta] - 2025-12-31

### Added
- Custom karaoke-themed background image for macOS DMG installer (#112)
- Active singer selection for auto-assigning singers when adding songs (#109)
  - "Adding as" dropdown in search panel to select active singer
  - Songs added to queue automatically assigned to selected singer
  - Active singer persisted per session

### Changed
- Notification duration now varies by type (#111)
  - Success: 3s, Info: 4s, Warning: 6s, Error: 8s

## [0.5.3-beta] - 2025-12-31

### Added
- Fair Shuffle button in Queue panel (#109)
  - Reorganizes queue into fair round-robin order by singer
  - Multi-singer items (duets) count for ALL singers involved
  - Uses MAX count algorithm: duets wait until all singers are due
  - 11 unit tests for shuffle algorithm
- Icon-only buttons for Queue and History panels
  - Shuffle, Trash, Star, and ListRestart icons from lucide-react
  - Improved accessibility with aria-labels

### Changed
- Reduced notification auto-hide duration from 10s to 4s

## [0.5.2-beta] - 2025-12-30

### Added
- Update notification on app startup (#99)
  - Checks GitHub releases API for newer versions
  - Shows notification with Download button linking to release page
  - Remembers dismissed versions to avoid repeated notifications
- Comprehensive CONTRIBUTING.md guide for new contributors (#103)
- In-app notification system for errors and messages (#98)
  - Notification bar slides up from bottom of screen
  - Support for error, warning, success, and info notification types
  - Auto-hide after 10 seconds with manual dismiss option
  - Indicator button to view last notification after it hides
  - Notifications can include action buttons with external links
  - Replaces silent errors with visible user feedback

### Fixed
- Fix choppy video playback in detached window on Fedora Linux (#100)
  - Disable WebKitGTK DMABuf renderer to resolve multi-window video rendering issues

## [0.5.1-beta] - 2025-12-30

### Fixed
- Fix video playback not working on Fedora Linux (#93)
  - Add GStreamer codec plugin dependencies for Linux packages
  - RPM: gstreamer1-plugins-base, gstreamer1-plugins-good, gstreamer1-libav
  - DEB: gstreamer1.0-plugins-base, gstreamer1.0-plugins-good, gstreamer1.0-libav
  - Prefer H.264 (avc) codec and exclude HLS streams for WebKitGTK compatibility

### Added
- Singer Favorites feature (#88)
  - Persistent singers can save favorite songs
  - Star button on search results and history items to add/remove favorites
  - Manage Favorites dialog (Singers menu) to view and manage favorites per singer
  - Load Favorites to Queue dialog to quickly add favorites to queue
  - Auto-assign singer when loading favorites to queue
  - Promote session singers to persistent via star icon
  - Add persistent singers to session from singer picker dropdown
  - `unique_name` field for singer disambiguation

## [0.5.0-beta] - 2025-12-29

### Changed
- Rename app from "Karaoke" to "HomeKaraoke" (#91)
  - Updated bundle identifier to `app.homekaraoke`
  - Updated all UI labels, window titles, and menu items
  - Updated D-Bus/MPRIS name for media controls

### Added
- Linux build support for Fedora and Debian (#89)
  - Builds .deb packages for Debian/Ubuntu
  - Builds .rpm packages for Fedora/RHEL
  - Builds .AppImage for other distributions
  - Media controls work via MPRIS/D-Bus
  - Note: Display layout save/restore not yet available on Linux
- Apple Developer code signing and notarization for macOS distribution (#85)
  - App is now signed with Developer ID certificate
  - Builds are notarized with Apple for Gatekeeper approval
  - GitHub Actions workflow updated to sign and notarize release builds

## [0.4.0] - 2025-12-28

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

[0.5.7-beta]: https://github.com/zalun/karaoke-app/compare/v0.5.6-beta...v0.5.7-beta
[0.5.6-beta]: https://github.com/zalun/karaoke-app/compare/v0.5.5-beta...v0.5.6-beta
[0.5.5-beta]: https://github.com/zalun/karaoke-app/compare/v0.5.4-beta...v0.5.5-beta
[0.5.4-beta]: https://github.com/zalun/karaoke-app/compare/v0.5.3-beta...v0.5.4-beta
[0.5.3-beta]: https://github.com/zalun/karaoke-app/compare/v0.5.2-beta...v0.5.3-beta
[0.5.2-beta]: https://github.com/zalun/karaoke-app/compare/v0.5.1-beta...v0.5.2-beta
[0.5.1-beta]: https://github.com/zalun/karaoke-app/compare/v0.5.0-beta...v0.5.1-beta
[0.5.0-beta]: https://github.com/zalun/karaoke-app/compare/v0.4.0...v0.5.0-beta
[0.4.0]: https://github.com/zalun/karaoke-app/compare/v0.3.5...v0.4.0
[0.3.5]: https://github.com/zalun/karaoke-app/compare/v0.3.4...v0.3.5
[0.3.4]: https://github.com/zalun/karaoke-app/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/zalun/karaoke-app/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/zalun/karaoke-app/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/zalun/karaoke-app/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/zalun/karaoke-app/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/zalun/karaoke-app/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/zalun/karaoke-app/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/zalun/karaoke-app/releases/tag/v0.1.0
