# Plan: Karaoke Application for macOS

## Summary
Home karaoke application built with Tauri 2.0 + React. Features YouTube search and streaming, local library management, song queue system, and automatic USB drive import.

### Multi-window Mode
- Video window can be detached and moved to a secondary display (karaoke mode)
- Application remembers display configurations (e.g., "laptop only" vs "laptop + projector A")
- **Hotplug detection:** listens for display connect/disconnect events at runtime
- When a known configuration is detected:
  - If `auto_apply=true` → automatically restore saved window layout
  - If `auto_apply=false` → show dialog "Detected [Projector A]. Restore karaoke mode?"
    - [ ] Remember my choice (sets `auto_apply=true`)
- Menu: "Manage display configurations..." (edit/delete, toggle auto_apply)
- Menu: "Reset to single window"

## Technology Stack
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Rust (Tauri 2.0)
- **Database:** SQLite (rusqlite)
- **Video:** yt-dlp (subprocess)
- **State management:** Zustand

## Project Structure

```
karaoke-app/
├── src/                          # React Frontend
│   ├── components/
│   │   ├── layout/               # AppLayout, Sidebar, Header
│   │   ├── player/               # VideoPlayer, PlayerControls
│   │   ├── search/               # SearchBar, SearchResults
│   │   ├── library/              # LibraryView, VideoGrid
│   │   └── queue/                # QueuePanel, QueueItem
│   ├── stores/                   # Zustand stores
│   ├── services/                 # Tauri IPC wrappers
│   └── types/
├── src-tauri/                    # Rust Backend
│   ├── src/
│   │   ├── commands/             # youtube, library, queue, drives
│   │   ├── services/             # ytdlp, volume_watcher
│   │   ├── db/                   # schema, queries
│   │   └── models/
│   └── Cargo.toml
└── package.json
```

## Database Schema (SQLite)

### Table `videos`
```sql
CREATE TABLE videos (
    id INTEGER PRIMARY KEY,
    youtube_id TEXT UNIQUE,
    title TEXT NOT NULL,
    artist TEXT,
    duration_seconds INTEGER,
    source_type TEXT CHECK(source_type IN ('youtube', 'local', 'external')),
    file_path TEXT,
    thumbnail_url TEXT,
    external_drive_id INTEGER,
    last_played TIMESTAMP,
    play_count INTEGER DEFAULT 0
);
```

### Table `queue`
```sql
CREATE TABLE queue (
    id INTEGER PRIMARY KEY,
    video_id INTEGER,             -- from library (optional)
    youtube_id TEXT,              -- YT streaming (optional)
    youtube_title TEXT,
    local_file_path TEXT,         -- file from disk without import (optional)
    local_file_title TEXT,        -- display name for file
    position INTEGER NOT NULL,
    status TEXT DEFAULT 'pending'
);
-- One of: video_id, youtube_id, or local_file_path must be set
```

### Table `external_drives`
```sql
CREATE TABLE external_drives (
    id INTEGER PRIMARY KEY,
    volume_name TEXT,
    volume_path TEXT,
    uuid TEXT
);
```

### Table `download_queue`
```sql
CREATE TABLE download_queue (
    id INTEGER PRIMARY KEY,
    youtube_id TEXT UNIQUE,
    status TEXT DEFAULT 'pending',
    progress_percent INTEGER DEFAULT 0
);
```

### Table `display_configs`
```sql
CREATE TABLE display_configs (
    id INTEGER PRIMARY KEY,
    config_hash TEXT UNIQUE,      -- hash from sorted list of display IDs
    display_names TEXT,           -- JSON: ["Built-in Retina", "EPSON EB-X51"]
    description TEXT,             -- optional user description, e.g., "Living room with projector"
    auto_apply BOOLEAN DEFAULT 0, -- automatically restore layout
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Table `window_state`
```sql
CREATE TABLE window_state (
    id INTEGER PRIMARY KEY,
    display_config_id INTEGER,    -- link to display configuration
    window_type TEXT NOT NULL,    -- 'main', 'video'
    target_display_id TEXT,       -- which display the window should be on
    x INTEGER,
    y INTEGER,
    width INTEGER,
    height INTEGER,
    is_detached BOOLEAN DEFAULT 0,
    is_fullscreen BOOLEAN DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (display_config_id) REFERENCES display_configs(id)
);
```

### Table `singers`
```sql
CREATE TABLE singers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,          -- Hex color e.g., '#FF5733'
    is_persistent INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Table `groups`
```sql
CREATE TABLE groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    is_persistent INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Table `singer_groups`
```sql
CREATE TABLE singer_groups (
    singer_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    PRIMARY KEY (singer_id, group_id),
    FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);
```

### Table `sessions`
```sql
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY,
    name TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    is_active INTEGER DEFAULT 1
);
```

### Table `session_singers`
```sql
CREATE TABLE session_singers (
    session_id INTEGER NOT NULL,
    singer_id INTEGER NOT NULL,
    PRIMARY KEY (session_id, singer_id),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE CASCADE
);
```

### Table `queue_singers`
```sql
CREATE TABLE queue_singers (
    queue_item_id TEXT NOT NULL,  -- Frontend UUID from queueStore
    singer_id INTEGER NOT NULL,
    position INTEGER DEFAULT 0,   -- For ordering multiple singers (duets)
    PRIMARY KEY (queue_item_id, singer_id),
    FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE CASCADE
);
```

## Key Rust Components

### yt-dlp Service (`services/ytdlp.rs`)
- `search(query, max_results)` - YouTube search
- `get_stream_url(video_id)` - streaming URL
- `download(video_id, progress_callback)` - download with progress events
- `get_video_info(video_id)` - video metadata

### Volume Watcher (`services/volume_watcher.rs`)
- Watches `/Volumes/` via `notify` crate
- Events: `volume:mounted`, `volume:unmounted`, `volume:scan-complete`
- Scans for files: `.mp4`, `.mkv`, `.webm`, `.avi`

### Display Watcher (`services/display_watcher.rs`)
- Listens for display configuration changes (macOS: CGDisplayRegisterReconfigurationCallback)
- Events: `display:connected`, `display:disconnected`, `display:config-changed`
- Computes `config_hash` from current display list
- Checks if configuration exists in `display_configs`

### Tauri Commands
```rust
// YouTube
youtube_search(query, max_results) -> Vec<SearchResult>
youtube_get_stream_url(video_id) -> StreamInfo
youtube_download(video_id) -> () // emits progress events

// Library
library_get_all(filter, search, limit, offset) -> LibraryResponse
library_import_from_drive(volume_path, paths) -> ImportResult
library_delete_video(video_id) -> ()

// Queue
queue_get_all() -> Vec<QueueItem>
queue_add(video_id | youtube_id) -> QueueItem
queue_add_file(file_path) -> QueueItem   // Add file from disk without import
queue_remove(item_id) -> ()
queue_reorder(item_id, new_position) -> ()
queue_next() -> Option<QueueItem>
queue_clear() -> ()

// Drives
drives_get_mounted() -> Vec<MountedDrive>
drives_scan(volume_path) -> ScanResult
drives_import_selected(volume_path, files, copy) -> ImportResult

// Window Management
window_detach_video() -> ()              // Detach video window
window_attach_video() -> ()              // Return video to main window
window_save_state() -> ()                // Save window positions for current config
window_restore_state() -> ()             // Restore state for current config
window_reset_to_single() -> ()           // Reset to single-window mode
window_get_displays() -> Vec<Display>    // List available displays

// Display Configuration Management
display_get_current_config() -> DisplayConfig      // Current display configuration
display_get_saved_configs() -> Vec<DisplayConfig>  // All saved configurations
display_set_auto_apply(config_id, bool) -> ()      // Set auto_apply for configuration
display_update_description(config_id, desc) -> ()  // Change configuration description
display_delete_config(config_id) -> ()             // Delete saved configuration
display_apply_config(config_id) -> ()              // Manually apply configuration

// Sessions
session_start(name?) -> Session                    // Start karaoke session
session_end(session_id) -> ()                      // End session
session_get_active() -> Option<Session>            // Get current active session

// Singers
singer_create(name, color, is_persistent) -> Singer
singer_update(id, name, color, is_persistent) -> Singer
singer_delete(id) -> ()                            // Cascades to queue_singers
singer_list(include_temporary) -> Vec<Singer>
singer_add_to_session(singer_id, session_id) -> ()

// Groups
group_create(name, is_persistent, singer_ids) -> Group
group_update(id, name, is_persistent, singer_ids) -> Group
group_delete(id) -> ()
group_list(include_temporary) -> Vec<Group>

// Queue Singer Assignment
queue_assign_singers(queue_item_id, singer_ids) -> ()
queue_get_singers(queue_item_id) -> Vec<Singer>
queue_get_all_assignments() -> Vec<QueueSingerAssignment>
cleanup_temporary() -> ()                          // Delete non-persistent singers/groups
```

## Implementation Phases

> **Principle:** Each phase ends with working functionality. After completing a phase, the application is testable.

### Phase 1: Foundation
**Result:** Application launches and displays basic UI
- [x] Initialize Tauri 2.0 + React + Vite project
- [x] Configure Tailwind CSS
- [x] Setup SQLite with migrations
- [x] Basic application layout
- [x] Configure Zustand stores

### Phase 2: YouTube Integration
**Result:** Can search YouTube videos and play them in the application
- [x] Implement yt-dlp service in Rust
- [x] YouTube search (ytsearch)
- [x] Stream URL extraction
- [x] VideoPlayer component (HTML5 video)
- [x] SearchBar + SearchResults
- [x] Click on result → play video
- [x] Queue UI with drag-and-drop (in-memory)
- [x] Integration with player (auto-advance)
- [x] NextSongOverlay with countdown
- [x] Detached player with window sync
- [ ] yt-dlp dependency check:
  - On app startup, verify yt-dlp is installed
  - If missing, show user-friendly error with install options
  - "Install with Homebrew" button (runs `brew install yt-dlp`)
  - Manual install instructions as fallback
  - Re-check button after installation

### Phase 3: Sessions and Singers
**Result:** Can start karaoke sessions, add singers, assign singers to queue items
**Dependencies:** Phase 1 (SQLite), Phase 2 (Queue UI, NextSongOverlay, window sync) - all complete

- [ ] Database migration 2: singers, groups, sessions, queue_singers tables
- [ ] Rust commands: session_*, singer_*, group_*, queue_assign_singers
- [ ] Frontend sessionStore.ts with singer/group/assignment state
- [ ] SingerAvatar component (circle with first letter + auto-assigned color)
- [ ] SingerChip component (avatar + name in pill)
- [ ] SessionStartPanel ("Start Karaoke Night" button)
- [ ] SessionBar (shows active session + singer avatars)
- [ ] SingerPicker dropdown (select/create singers for queue item)
- [ ] DraggableQueueItem enhancement (show singer chips, click-to-assign)
- [ ] Drag-drop singer assignment (drag avatar onto queue item)
- [ ] NextSongOverlay enhancement (show singer avatars with colors)
- [ ] Sync singer data to detached player via PlayerState.nextSong
- [ ] Group management UI (optional singer collections)
- [ ] Persistent vs temporary toggle for singers/groups
- [ ] Session end with cleanup prompt

### Phase 4: Queue Persistence
**Result:** Queue survives app restart, can add local files
- [ ] Queue database operations (persist to SQLite)
- [ ] Tauri commands for queue persistence
- [ ] "Play Now" vs "Add to Queue" actions
- [ ] Add file from disk to queue:
  - "Add file..." button (file picker dialog)
  - Drag & drop file directly to queue
  - Handle files outside library (temporary, without import)

### Phase 5: Downloads and Library
**Result:** Can download videos from YT, browse and play from local library
- [ ] Download command with progress events
- [ ] Download progress UI
- [ ] LibraryView with thumbnail grid
- [ ] Library filtering and search
- [ ] Delete video

### Phase 6: USB Drive Support
**Result:** Connecting USB drive shows import dialog, can import videos
- [ ] Volume watcher on `/Volumes/`
- [ ] Mount/unmount events
- [ ] Video file scanning
- [ ] Import modal with checkboxes
- [ ] Selective or full import

### Phase 7: Multi-window and Display Detection
**Result:** Can detach video to projector, application remembers display configurations
- [ ] Detachable video window (Tauri WebviewWindow)
- [ ] Display Watcher - listen for display hotplug (CGDisplayRegisterReconfigurationCallback)
- [ ] `display_configs` table - save display configurations
- [ ] Logic for recognizing known configuration (config_hash)
- [ ] Dialog "Detected [display]. Restore layout?" with "Remember" checkbox
- [ ] Automatic layout restoration when `auto_apply=true`
- [ ] Menu: "Manage display configurations..." (list, edit description, toggle auto_apply, delete)
- [ ] Menu: "Detach video to display...", "Reset to single window"

### Phase 8: Polish
**Result:** Application ready for daily use
- [ ] Fullscreen video mode:
  - Toggle fullscreen ↔ windowed without interrupting playback
  - Queue continues automatically in fullscreen (without exiting)
  - Shortcut: F or double-click → toggle fullscreen
  - ESC → exit fullscreen (but not pause)
- [ ] Keyboard shortcuts:

  > Shortcuts inactive when focus is on text input (input/textarea)

  **Global (both windows):**
  - `Space` - play/pause
  - `N` - next video
  - `M` - mute/unmute
  - `↑` / `↓` - volume ±10%

  **Video window:**
  - `F` - toggle fullscreen
  - `ESC` - exit fullscreen
  - `→` / `←` - seek ±10s

  **Management window:**
  - `Cmd+O` - add file to queue
  - `Cmd+F` / `/` - focus on search
  - `Delete` - remove selected from queue
  - `Enter` - play selected / confirm action
- [ ] Error handling and feedback
- [ ] Loading states
- [ ] Application icon

## Potential Challenges and Solutions

| Challenge | Solution |
|-----------|----------|
| Multi-window synchronization | Tauri events between windows + shared state in Rust |
| Display hotplug detection | macOS: `CGDisplayRegisterReconfigurationCallback` in Rust via `core-graphics` crate |
| Fullscreen without interrupting playback | Use native fullscreen API (don't reload component), preserve `<video>` element reference |
| YT streaming URL expiration | Fetch fresh URL immediately before playback |
| yt-dlp dependency | Check on startup, show install prompt with Homebrew button if missing |
| UI blocking during download | Async Tokio tasks + Tauri events for progress |
| External drive detection | notify crate (kqueue) + fallback polling /Volumes/ every 5s |
| Video formats from USB drive | HTML5 video supports MP4/WebM, warning for others |
| Singer assignment to queue | queue_singers table links frontend UUIDs to singers; cascade delete on singer removal |
| Singer colors | 16-color palette with auto-assignment; fallback to random if all used |

## Key Files to Create

1. `src-tauri/src/services/ytdlp.rs` - yt-dlp integration
2. `src-tauri/src/db/schema.rs` - database schema
3. `src-tauri/src/services/volume_watcher.rs` - drive detection
4. `src-tauri/src/services/display_watcher.rs` - display detection + hotplug
5. `src/stores/queueStore.ts` - queue management
6. `src/components/player/VideoPlayer.tsx` - video player
7. `src-tauri/src/commands/session.rs` - session/singer/group commands
8. `src/stores/sessionStore.ts` - session/singer state management
9. `src/constants/colors.ts` - singer color palette
10. `src/components/singers/SingerAvatar.tsx` - avatar component
11. `src/components/singers/SingerChip.tsx` - avatar + name pill
12. `src/components/singers/SingerPicker.tsx` - singer selection dropdown
13. `src/components/session/SessionBar.tsx` - active session header
14. `src/components/session/SessionStartPanel.tsx` - start session UI

## Rust Dependencies (Cargo.toml)

```toml
[dependencies]
tauri = { version = "2.0", features = ["tray-icon"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
rusqlite = { version = "0.32", features = ["bundled"] }
notify = "6.0"
thiserror = "1.0"
chrono = { version = "0.4", features = ["serde"] }
core-graphics = "0.24"          # macOS display detection
```

## npm Dependencies

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2.0",
    "react": "^18",
    "zustand": "^5",
    "react-beautiful-dnd": "^13"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0",
    "vite": "^5",
    "tailwindcss": "^3",
    "typescript": "^5"
  }
}
```
