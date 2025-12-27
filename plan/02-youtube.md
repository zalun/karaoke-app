# Phase 2: YouTube Integration

**Status:** Complete

**Result:** Can search YouTube videos and play them in the application

## Completed Tasks

- [x] Implement yt-dlp service in Rust
- [x] YouTube search (ytsearch)
- [x] Stream URL extraction
- [x] VideoPlayer component (HTML5 video)
- [x] SearchBar + SearchResults
- [x] Click on result -> play video
- [x] Queue UI with drag-and-drop (in-memory)
- [x] Integration with player (auto-advance)
- [x] NextSongOverlay with countdown
- [x] Detached player with window sync

## Remaining Tasks

- [ ] yt-dlp dependency check:
  - On app startup, verify yt-dlp is installed
  - If missing, show user-friendly error with install options
  - "Install with Homebrew" button (runs `brew install yt-dlp`)
  - Manual install instructions as fallback
  - Re-check button after installation

## Key Components

### Backend (Rust)

**yt-dlp Service** (`src-tauri/src/services/ytdlp.rs`):
- `search(query, max_results)` - YouTube search
- `get_stream_url(video_id)` - streaming URL extraction
- `get_video_info(video_id)` - video metadata

**Tauri Commands**:
```rust
youtube_search(query, max_results) -> Vec<SearchResult>
youtube_get_stream_url(video_id) -> StreamInfo
youtube_get_video_info(video_id) -> VideoInfo
```

### Frontend (React)

- `SearchBar` - Input field with search icon
- `SearchResults` - Infinite scroll list (fetches 50, displays 15 at a time)
- `SearchResultItem` - Single result with play/add buttons
- `VideoPlayer` - HTML5 video element with native controls
- `PlayerControls` - Play/pause, skip, progress bar, volume
- `NextSongOverlay` - Shows upcoming song with countdown (last 15s)

## Technical Details

### Stream URL Caching

YouTube streaming URLs expire after ~6 hours. The app caches URLs for 5 hours to avoid re-fetching:

```typescript
// playerStore.ts
streamingUrls: Map<string, { url: string; expiresAt: number }>
```

### Prefetching

To reduce loading delays, the next video URL is prefetched 20 seconds before the current video ends.
