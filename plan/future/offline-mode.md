# Feature: Offline Mode

## Summary

Pre-download playlists and popular songs for venues without reliable WiFi, ensuring the karaoke night can continue even when internet is unavailable.

## User Stories

1. As a host at a venue with poor WiFi, I want to pre-download songs
2. As a user, I want to know which songs are available offline
3. As a host, I want to manage my offline library storage

## Implementation Overview

### Components

1. **Download Manager** - Queue and manage video downloads
2. **Offline Library** - Browse downloaded content
3. **Storage Manager** - Monitor and manage disk usage
4. **Sync Service** - Download playlists for offline use
5. **Offline Detection** - Switch to offline mode automatically

## Implementation

### Database Changes

```sql
-- Downloaded videos
CREATE TABLE downloads (
    id INTEGER PRIMARY KEY,
    youtube_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    duration_seconds INTEGER,
    file_path TEXT NOT NULL,         -- Local file path
    file_size_bytes INTEGER,
    thumbnail_path TEXT,             -- Local thumbnail
    quality TEXT DEFAULT '720p',     -- Downloaded quality
    status TEXT DEFAULT 'pending',   -- pending, downloading, completed, failed
    progress_percent INTEGER DEFAULT 0,
    error_message TEXT,
    downloaded_at TIMESTAMP,
    last_played TIMESTAMP,
    play_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Download queue
CREATE TABLE download_queue (
    id INTEGER PRIMARY KEY,
    youtube_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    priority INTEGER DEFAULT 0,      -- Higher = download first
    source TEXT,                     -- 'manual', 'playlist', 'popular'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Offline playlists
CREATE TABLE offline_playlists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    auto_sync BOOLEAN DEFAULT 0,     -- Auto-download new songs
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE offline_playlist_items (
    playlist_id INTEGER NOT NULL,
    youtube_id TEXT NOT NULL,
    position INTEGER,
    PRIMARY KEY (playlist_id, youtube_id),
    FOREIGN KEY (playlist_id) REFERENCES offline_playlists(id) ON DELETE CASCADE
);
```

### Backend

**New Rust Dependencies:**
```toml
indicatif = "0.17"     # Progress bars (optional, for CLI)
```

**Download Service** (`src-tauri/src/services/downloader.rs`):
```rust
pub struct DownloadManager {
    download_dir: PathBuf,
    max_concurrent: usize,
    current_downloads: Arc<Mutex<Vec<ActiveDownload>>>,
}

impl DownloadManager {
    // Uses yt-dlp for downloading
    async fn download_video(&self, youtube_id: &str, quality: &str) -> Result<DownloadResult>;
    async fn cancel_download(&self, youtube_id: &str) -> Result<()>;
    fn get_progress(&self, youtube_id: &str) -> Option<f32>;
}
```

**Tauri Commands:**
```rust
// Download management
download_start(youtube_id) -> ()
download_cancel(youtube_id) -> ()
download_retry(youtube_id) -> ()
download_delete(youtube_id) -> ()  // Remove file + DB entry
download_get_status(youtube_id) -> DownloadStatus
download_get_queue() -> Vec<QueuedDownload>
download_set_priority(youtube_id, priority) -> ()

// Library
offline_get_all() -> Vec<DownloadedVideo>
offline_search(query) -> Vec<DownloadedVideo>
offline_get_storage_usage() -> StorageInfo

// Playlists
offline_playlist_create(name) -> OfflinePlaylist
offline_playlist_add_song(playlist_id, youtube_id) -> ()
offline_playlist_sync(playlist_id) -> ()  // Download all songs
offline_playlist_get_all() -> Vec<OfflinePlaylist>

// Network
network_get_status() -> NetworkStatus
network_set_offline_mode(enabled: bool) -> ()
```

### Frontend

**DownloadButton Component:**
- Shows on search results and queue items
- States: not downloaded, downloading (with progress), downloaded
- Click to start/cancel download

**OfflineLibraryPanel Component:**
- Grid/list of downloaded videos
- Filter by: downloaded, downloading, failed
- Sort by: date, name, size, play count
- Storage usage indicator

**DownloadQueuePanel Component:**
- Active downloads with progress bars
- Queued downloads
- Pause/resume all
- Priority drag-and-drop

**OfflineIndicator Component:**
- Shows in header when offline
- Click to see offline library

## UI Mockup

```
Search Result with Download:
┌─────────────────────────────────────────────────┐
│ [Thumb] "Don't Stop Believin'" - Journey       │
│         5:02            [⬇️ 45%] [⭐] [▶] [+]   │
└─────────────────────────────────────────────────┘
                          ^ download progress

Downloaded indicator:
┌─────────────────────────────────────────────────┐
│ [Thumb] "Sweet Caroline" - Neil Diamond        │
│         3:21              [✓] [⭐] [▶] [+]      │
└─────────────────────────────────────────────────┘
                           ^ downloaded checkmark

Offline Library Panel:
┌─────────────────────────────────────────────────┐
│ 📥 Offline Library           Storage: 2.3 GB   │
├─────────────────────────────────────────────────┤
│ [All] [Downloaded] [Downloading] [Failed]      │
├─────────────────────────────────────────────────┤
│ Search: [_______________]                       │
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐ │
│ │ ✓ "Bohemian Rhapsody" - Queen              │ │
│ │   720p • 156 MB • Downloaded 2 days ago    │ │
│ │   [▶ Play] [+ Queue] [🗑️ Delete]            │ │
│ ├─────────────────────────────────────────────┤ │
│ │ ⬇️ "Living on a Prayer" - Bon Jovi  [67%]  │ │
│ │   720p • ~120 MB                           │ │
│ │   [⏸️ Pause] [✕ Cancel]                     │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

Download Queue:
┌─────────────────────────────────────────────────┐
│ Download Queue (3 pending)    [⏸️ Pause All]   │
├─────────────────────────────────────────────────┤
│ 1. ⬇️ "Mr. Brightside" [████████░░] 82%        │
│ 2. ⏳ "Dancing Queen"                           │
│ 3. ⏳ "Sweet Child O' Mine"                     │
└─────────────────────────────────────────────────┘

Offline Mode Banner:
┌─────────────────────────────────────────────────┐
│ ⚠️ Offline Mode - Playing from downloaded songs │
│                              [Go Online]        │
└─────────────────────────────────────────────────┘
```

## Download Quality Options

| Quality | Resolution | Approx. Size (4 min) |
|---------|------------|---------------------|
| Low | 360p | 30-50 MB |
| Medium | 480p | 50-80 MB |
| High (default) | 720p | 100-150 MB |
| Best | 1080p | 200-400 MB |

## Storage Management

**Settings:**
- Maximum storage limit (default: 10 GB)
- Auto-cleanup: remove least-played when limit reached
- Keep last N sessions' songs
- Quality preference

**Storage Info Display:**
```
Storage Usage:
┌──────────────────────────────────────┐
│ Downloaded: 2.3 GB / 10 GB          │
│ [████████░░░░░░░░░░░░] 23%          │
│                                      │
│ 47 videos • ~3.2 hours of content   │
│                                      │
│ [Clear Failed] [Manage Downloads]   │
└──────────────────────────────────────┘
```

## Offline Detection

```typescript
// Network status monitoring
window.addEventListener('online', () => setOfflineMode(false));
window.addEventListener('offline', () => setOfflineMode(true));

// Manual toggle in settings
// Useful when WiFi is unreliable but technically "connected"
```

## Playback Priority

When playing a song:
1. Check if downloaded version exists
2. If yes, use local file
3. If no and online, stream from YouTube
4. If no and offline, show "Not available offline"

## Sync Features

**Playlist Sync:**
- Download entire favorites list
- Download popular songs list
- Download songs from recent sessions

**Smart Sync:**
- Pre-download queue items
- Download based on listening history
- Background downloads when on WiFi

## Edge Cases

1. **Partial download** - Resume from where left off
2. **Corrupted file** - Detect and re-download
3. **Video removed from YouTube** - Keep local copy, mark as "YouTube unavailable"
4. **Storage full** - Warn before download, suggest cleanup
5. **Download during playback** - Throttle to prevent stuttering
6. **App quit during download** - Resume on next launch

## Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `download_quality` | 720p | Default video quality |
| `max_storage_gb` | 10 | Maximum storage for downloads |
| `auto_download_queue` | false | Download queue items automatically |
| `wifi_only` | true | Only download on WiFi |
| `concurrent_downloads` | 2 | Max simultaneous downloads |
| `auto_cleanup` | true | Remove old downloads when full |

## Future Enhancements

1. **Smart preloading** - Predict and download likely songs
2. **Cloud sync** - Sync download list across devices
3. **Export to USB** - Copy downloads to external drive
4. **Audio-only mode** - Smaller downloads for audio karaoke
5. **Scheduled downloads** - Download overnight
