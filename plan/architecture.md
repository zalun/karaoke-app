# Architecture

## Project Structure

```
karaoke-app/
├── src/                          # React Frontend
│   ├── components/
│   │   ├── layout/               # AppLayout, Sidebar
│   │   ├── player/               # VideoPlayer, PlayerControls, overlays
│   │   ├── search/               # SearchBar, SearchResults
│   │   ├── library/              # LibraryView, VideoGrid (future)
│   │   ├── queue/                # QueuePanel, DraggableQueueItem
│   │   ├── singers/              # SingerAvatar, SingerChip, SingerPicker
│   │   ├── session/              # SessionBar, SessionStartPanel
│   │   └── display/              # DisplayRestoreDialog
│   ├── stores/                   # Zustand stores
│   │   ├── playerStore.ts        # Video playback state
│   │   ├── queueStore.ts         # Queue and history
│   │   ├── sessionStore.ts       # Sessions and singers
│   │   ├── appStore.ts           # Global app state
│   │   └── displayStore.ts       # Display configuration
│   ├── services/                 # Tauri IPC wrappers
│   │   ├── youtube.ts
│   │   ├── queue.ts
│   │   ├── session.ts
│   │   ├── mediaControls.ts
│   │   ├── displayManager.ts
│   │   ├── windowManager.ts
│   │   ├── keepAwake.ts
│   │   └── logger.ts
│   ├── constants/
│   │   └── singerColors.ts       # 16-color palette
│   └── types/
├── src-tauri/                    # Rust Backend
│   ├── src/
│   │   ├── commands/             # Tauri command handlers
│   │   │   ├── youtube.rs
│   │   │   ├── queue.rs
│   │   │   ├── session.rs
│   │   │   ├── display.rs
│   │   │   ├── media_controls.rs
│   │   │   ├── keep_awake.rs
│   │   │   ├── settings.rs
│   │   │   └── errors.rs
│   │   ├── services/             # Background services
│   │   │   ├── ytdlp.rs          # yt-dlp subprocess
│   │   │   ├── media_controls.rs # souvlaki integration
│   │   │   └── display_watcher.rs # Display hotplug
│   │   ├── db/
│   │   │   ├── schema.rs         # Migrations
│   │   │   └── mod.rs            # Database wrapper
│   │   └── lib.rs                # App initialization
│   └── Cargo.toml
└── package.json
```

## Key Rust Components

### yt-dlp Service (`services/ytdlp.rs`)

```rust
search(query, max_results) -> Vec<SearchResult>
get_stream_url(video_id) -> StreamInfo
get_video_info(video_id) -> VideoInfo
download(video_id, progress_callback) -> ()  // Future
```

### Volume Watcher (`services/volume_watcher.rs`) - Future

- Watches `/Volumes/` via `notify` crate
- Events: `volume:mounted`, `volume:unmounted`, `volume:scan-complete`
- Scans for files: `.mp4`, `.mkv`, `.webm`, `.avi`

### Display Watcher (`services/display_watcher.rs`)

- Listens for display configuration changes
- macOS: `CGDisplayRegisterReconfigurationCallback`
- Events: `display:connected`, `display:disconnected`, `display:config-changed`
- Computes `config_hash` from current display list

### Media Controls Service (`services/media_controls.rs`)

- souvlaki library for macOS integration
- Now Playing widget updates
- Media key event handling
- Graceful shutdown with atomic flag

## Tauri Commands Overview

### YouTube (5 commands)
- `youtube_search`, `youtube_get_stream_url`, `youtube_get_video_info`
- `youtube_get_cached_url`, `youtube_prefetch_url`

### Queue (9 commands)
- `queue_load`, `queue_save`, `queue_clear`
- `queue_assign_singers`, `queue_get_singers`, `queue_get_all_assignments`
- `history_load`, `history_save`, `history_clear`

### Session (15 commands)
- Session: `session_start`, `session_end`, `session_get_active`, `session_get_recent`, `session_rename`, `session_load`, `session_delete`
- Singer: `singer_create`, `singer_delete`, `singer_list`, `singer_add_to_session`
- Group: `group_create`, `group_delete`, `group_list`
- Cleanup: `cleanup_temporary`

### Display (8 commands)
- `display_get_current_config`, `display_get_saved_configs`
- `display_set_auto_apply`, `display_update_description`, `display_delete_config`
- `window_save_state`, `window_restore_state`, `window_reset_to_single`

### Media Controls (3 commands)
- `media_controls_update`, `media_controls_set_playing`, `media_controls_clear`

### Keep Awake (2 commands)
- `keep_awake_enable`, `keep_awake_disable`

### Settings (3 commands)
- `settings_get`, `settings_set`, `settings_get_all`

## AppState Management

```rust
pub struct AppState {
    pub db: Mutex<Database>,
    pub keep_awake: Mutex<Option<KeepAwake>>,
    pub media_controls: Mutex<Option<MediaControlsService>>,
    pub display_watcher: Mutex<Option<DisplayWatcherService>>,
}
```

## Rust Dependencies

```toml
[dependencies]
tauri = { version = "2.0", features = ["tray-icon"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
rusqlite = { version = "0.32", features = ["bundled"] }
notify = "6.0"                    # File system watching
thiserror = "1.0"                 # Error handling
chrono = { version = "0.4", features = ["serde"] }
core-graphics = "0.24"            # macOS display detection
souvlaki = "0.7"                  # Media controls
```

## npm Dependencies

```json
{
  "dependencies": {
    "@tauri-apps/api": "^2.0",
    "react": "^18",
    "zustand": "^5",
    "@dnd-kit/core": "^6",
    "@dnd-kit/sortable": "^8",
    "lucide-react": "^0.400"
  },
  "devDependencies": {
    "@tauri-apps/cli": "^2.0",
    "vite": "^5",
    "tailwindcss": "^3",
    "typescript": "^5"
  }
}
```
