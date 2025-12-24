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
```

## Implementation Phases

> **Principle:** Each phase ends with working functionality. After completing a phase, the application is testable.

### Phase 1: Foundation
**Result:** Application launches and displays basic UI
- [ ] Initialize Tauri 2.0 + React + Vite project
- [ ] Configure Tailwind CSS
- [ ] Setup SQLite with migrations
- [ ] Basic application layout
- [ ] Configure Zustand stores

### Phase 2: YouTube Integration
**Result:** Can search YouTube videos and play them in the application
- [ ] Implement yt-dlp service in Rust
- [ ] YouTube search (ytsearch)
- [ ] Stream URL extraction
- [ ] VideoPlayer component (HTML5 video)
- [ ] SearchBar + SearchResults
- [ ] Click on result → play video

### Phase 3: Queue System
**Result:** Can add videos to queue, queue automatically advances to next
- [ ] Queue database operations
- [ ] Tauri commands for queue
- [ ] QueuePanel with drag-and-drop
- [ ] Integration with player (auto-advance)
- [ ] "Play Now" vs "Add to Queue" actions
- [ ] Add file from disk to queue:
  - "Add file..." button (file picker dialog)
  - Drag & drop file directly to queue
  - Handle files outside library (temporary, without import)

### Phase 4: Downloads and Library
**Result:** Can download videos from YT, browse and play from local library
- [ ] Download command with progress events
- [ ] Download progress UI
- [ ] LibraryView with thumbnail grid
- [ ] Library filtering and search
- [ ] Delete video

### Phase 5: USB Drive Support
**Result:** Connecting USB drive shows import dialog, can import videos
- [ ] Volume watcher on `/Volumes/`
- [ ] Mount/unmount events
- [ ] Video file scanning
- [ ] Import modal with checkboxes
- [ ] Selective or full import

### Phase 6: Multi-window and Display Detection
**Result:** Can detach video to projector, application remembers display configurations
- [ ] Detachable video window (Tauri WebviewWindow)
- [ ] Display Watcher - listen for display hotplug (CGDisplayRegisterReconfigurationCallback)
- [ ] `display_configs` table - save display configurations
- [ ] Logic for recognizing known configuration (config_hash)
- [ ] Dialog "Detected [display]. Restore layout?" with "Remember" checkbox
- [ ] Automatic layout restoration when `auto_apply=true`
- [ ] Menu: "Manage display configurations..." (list, edit description, toggle auto_apply, delete)
- [ ] Menu: "Detach video to display...", "Reset to single window"

### Phase 7: Polish
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
| yt-dlp distribution | Bundle with app or auto-download on first launch |
| UI blocking during download | Async Tokio tasks + Tauri events for progress |
| External drive detection | notify crate (kqueue) + fallback polling /Volumes/ every 5s |
| Video formats from USB drive | HTML5 video supports MP4/WebM, warning for others |

## Key Files to Create

1. `src-tauri/src/services/ytdlp.rs` - yt-dlp integration
2. `src-tauri/src/db/schema.rs` - database schema
3. `src-tauri/src/services/volume_watcher.rs` - drive detection
4. `src-tauri/src/services/display_watcher.rs` - display detection + hotplug
5. `src/stores/queueStore.ts` - queue management
6. `src/components/player/VideoPlayer.tsx` - video player

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
