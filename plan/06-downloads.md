# Phase 6: Downloads and Library

**Status:** Planned

**Result:** Can download videos from YT, browse and play from local library

## Tasks

- [ ] Download command with progress events
- [ ] Download progress UI
- [ ] LibraryView with thumbnail grid
- [ ] Library filtering and search
- [ ] Delete video

## Tauri Commands

```rust
youtube_download(video_id) -> ()  // emits progress events

library_get_all(filter, search, limit, offset) -> LibraryResponse
library_delete_video(video_id) -> ()
```

## Database Schema

```sql
CREATE TABLE download_queue (
    id INTEGER PRIMARY KEY,
    youtube_id TEXT UNIQUE,
    status TEXT DEFAULT 'pending',  -- pending, downloading, completed, failed
    progress_percent INTEGER DEFAULT 0
);

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

## UI Components

### Download UI

- Download button on search results
- Download progress indicator (percentage, speed)
- Download queue panel (optional)
- Cancel download button

### Library View

- Thumbnail grid layout
- Filter by: source type, recently played, most played
- Search by title/artist
- Context menu: Play, Add to queue, Delete
- Delete confirmation dialog

## Technical Considerations

- yt-dlp download with progress callbacks
- Store videos in app data directory
- Generate/cache thumbnails locally
- Handle download interruption (resume support)
