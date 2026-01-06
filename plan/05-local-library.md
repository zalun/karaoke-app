# Phase 5: Local Library & Offline Search

**Status:** Planned

**Result:** Searchable local video library with offline mode, supporting multiple directories and USB drives

## Overview

This phase introduces a complete **offline mode** for the karaoke app. Users can switch between YouTube (online) and Local (offline) search modes. Local mode searches video files from configured directories, using `.hkmeta.json` sidecar files for metadata.

## Goals

1. **Mode Switch** - Toggle between YouTube and Local search in the UI
2. **Local Library** - Scan video files from configured directories
3. **Offline Search** - Search by filename and metadata (artist, title, lyrics)
4. **File-based Metadata** - Use `.hkmeta.json` sidecar files (no DB caching for now)
5. **Missing File Handling** - Grey out unavailable files, show path in warning

## UI Changes

### Search Mode Toggle

Add a flip switch to SearchBar for Online/Local mode:

```
┌─────────────────────────────────────────────────────────────────────┐
│ [YouTube ○───● Local]  Search local files...          [Search]     │
└─────────────────────────────────────────────────────────────────────┘
```

- **YouTube mode**: Current behavior (yt-dlp search)
- **Local mode**: Search files in configured folders, works offline
- Mode persisted to settings
- Placeholder text changes based on mode

### Search Results (Local Mode)

Same layout as YouTube results, with differences:
- Source indicator: folder icon for local, USB icon for removable drives
- **No file path shown** (path only visible in PlayerControls and warnings)
- Missing files are **greyed out** with warning icon

### Missing File Behavior

When a file is missing (moved, deleted, or drive disconnected):
- Item is **greyed out** in search results, queue, and history
- **All actions allowed except Play** (can still add to queue, remove, reorder)
- **Click shows warning dialog** with the missing file path
- Allows user to locate the file or understand what's missing

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⚠️ File Not Found                                                   │
├─────────────────────────────────────────────────────────────────────┤
│ The video file could not be found at:                               │
│                                                                     │
│ /Volumes/KaraokeUSB/Videos/Queen - Bohemian Rhapsody.mp4           │
│                                                                     │
│ The file may have been moved, deleted, or the drive disconnected.  │
│                                                                     │
│                                              [Remove from Queue] [OK]│
└─────────────────────────────────────────────────────────────────────┘
```

### PlayerControls

File path shown only here (for local files):
```
┌─────────────────────────────────────────────────────────────────────┐
│ ▶  Bohemian Rhapsody - Queen                     advancement>       │
│    📁 /Users/me/Music/Karaoke/Queen - Bohemian Rhapsody.mp4        │
└─────────────────────────────────────────────────────────────────────┘
```

### Library Settings

New section in Settings dialog:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Local Library                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ Watched Folders:                                                    │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 📁 /Users/me/Music/Karaoke                    [Rescan] [Remove] │ │
│ │ 📁 /Volumes/KaraokeUSB                        [Rescan] [Remove] │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│ [+ Add Folder...]                                                   │
│                                                                     │
│ Rescan Options:                                                     │
│ ☑ Create .hkmeta.json files for new videos                         │
│ ☐ Fetch song info (MusicBrainz/Discogs)                            │
│ ☐ Fetch lyrics (Lrclib/Musixmatch/Genius/NetEase)                  │
│                                                                     │
│ Library Stats:                                                      │
│ 1,234 videos found • Last scan: 5 minutes ago                      │
│ [Rescan All]                                                        │
└─────────────────────────────────────────────────────────────────────┘
```

## Metadata Format

### HomeKaraoke Metadata File (`.hkmeta.json`)

Optional sidecar file for metadata. Placed alongside video file:

```
MyVideo.mp4
MyVideo.hkmeta.json
```

**All fields are optional.** Schema:

```json
{
  "$schema": "https://homekaraoke.app/schemas/hkmeta-v1.json",
  "version": 1,
  "title": "Bohemian Rhapsody",
  "artist": "Queen",
  "album": "A Night at the Opera",
  "year": 1975,
  "language": "en",
  "genre": "rock",
  "duration": 354,
  "lyrics": {
    "format": "lrc",
    "content": "Is this the real life?\nIs this just fantasy?..."
  },
  "tags": ["classic rock", "70s", "ballad"],
  "source": {
    "youtube_id": "fJ9rUzIMcZQ",
    "original_url": "https://youtube.com/watch?v=fJ9rUzIMcZQ"
  }
}
```

Notes:
- All fields optional - empty `{}` is valid
- `lyrics.content` can be plain text or LRC format with timings (optional)
- `source` tracks origin if downloaded from YouTube

### Metadata Sources (Priority Order)

1. **`.hkmeta.json` sidecar file** - Primary metadata source
2. **CDG companion file** - For MP3+G format (lyrics/graphics)
3. **LRC companion file** - Synced lyrics (e.g., `song.lrc` next to `song.mp4`)
4. **Filename parsing** - Extract artist/title from filename patterns:
   - `Artist - Title.mp4`
   - `Title (Artist).mp4`
   - `DISC01/Track 05 - Artist - Title.mp4`

### Rescan Behavior

When rescanning a folder:
1. Find all video files (`.mp4`, `.mkv`, `.webm`, `.avi`, `.mov`)
2. For files without `.hkmeta.json`:
   - If "Create .hkmeta.json" enabled: create with parsed filename data
   - If "Fetch metadata" enabled: search music database, enrich metadata
3. For files with `.hkmeta.json`: read and validate

### Metadata Fetch (Optional)

When "Fetch metadata from music database" is enabled during rescan:

#### Song Metadata (artist, album, year, genre)

Fallback chain:
1. **MusicBrainz** (primary) - Open API, no auth required
2. **Discogs** (fallback) - Larger catalog, requires free API token

```
Parse filename → MusicBrainz query → found? → save to .hkmeta.json
                      ↓ not found
                 Discogs query → found? → save to .hkmeta.json
```

#### Lyrics

Fallback chain (try in order until found):
1. **Lrclib** - Free, synced LRC lyrics, no auth
2. **Musixmatch** - Large catalog, requires API key
3. **Genius** - Plain text lyrics, requires API key
4. **NetEase** - Good for Asian songs, no auth

```
Search by title+artist → Lrclib → Musixmatch → Genius → NetEase
                              ↓ found
                    Save to .hkmeta.json lyrics.content
```

#### API Details

| Service | Auth | Lyrics Format | Notes |
|---------|------|---------------|-------|
| MusicBrainz | None | - | 1 req/sec rate limit |
| Discogs | Token | - | Free token, rate limited |
| Lrclib | None | LRC (synced) | Best for karaoke |
| Musixmatch | API Key | LRC (synced) | 30% of catalog synced |
| Genius | API Key | Plain text | No sync, but large catalog |
| NetEase | None | LRC (synced) | Good for CJK songs |

### Supported Video Formats

- `.mp4`, `.mkv`, `.webm`, `.avi`, `.mov`
- `.mp3` + `.cdg` pairs (MP3+G format)

## Database Schema

Minimal schema - only stores folder paths, not video metadata.

### Table `library_folders`

Configured directories to watch.

```sql
CREATE TABLE library_folders (
    id INTEGER PRIMARY KEY,
    path TEXT UNIQUE NOT NULL,
    name TEXT,                        -- Display name (defaults to folder name)
    last_scan_at TIMESTAMP,
    file_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**Note:** Video metadata is stored in `.hkmeta.json` files, not in the database. This keeps the architecture simple and makes libraries portable (copy folder = copy library). Database caching of metadata may be added in a future phase for performance optimization.

## Tauri Commands

### Library Management

```rust
// Folder management
library_add_folder(path: String) -> LibraryFolder
library_remove_folder(folder_id: i64) -> ()
library_get_folders() -> Vec<LibraryFolder>

// Scanning
library_scan_folder(folder_id: i64, options: ScanOptions) -> ScanResult
library_scan_all(options: ScanOptions) -> ScanResult

// Search (scans files on demand)
library_search(query: String, limit: u32) -> Vec<LibraryVideo>

// File operations
library_check_file(file_path: String) -> bool  // Check if file exists
library_get_metadata(file_path: String) -> VideoMetadata  // Read .hkmeta.json

// Stats
library_get_stats() -> LibraryStats
```

## Rust Types

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryFolder {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub last_scan_at: Option<String>,
    pub file_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryVideo {
    pub file_path: String,
    pub file_name: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: Option<u32>,
    pub has_lyrics: bool,
    pub youtube_id: Option<String>,
    pub is_available: bool,  // File exists check
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanOptions {
    pub create_hkmeta: bool,
    pub fetch_song_info: bool,  // MusicBrainz → Discogs
    pub fetch_lyrics: bool,     // Lrclib → Musixmatch → Genius → NetEase
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub folder_id: i64,
    pub files_found: u32,
    pub hkmeta_created: u32,
    pub hkmeta_existing: u32,
    pub song_info_fetched: u32,
    pub lyrics_fetched: u32,
    pub errors: Vec<String>,
    pub duration_ms: u64,
}

/// All fields optional - matches .hkmeta.json schema
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HkMeta {
    pub version: Option<u32>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<u32>,
    pub language: Option<String>,
    pub genre: Option<String>,
    pub duration: Option<u32>,
    pub lyrics: Option<HkMetaLyrics>,
    pub tags: Option<Vec<String>>,
    pub source: Option<HkMetaSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HkMetaLyrics {
    pub format: Option<String>,  // "plain", "lrc"
    pub content: Option<String>, // Plain text or LRC (timings optional)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HkMetaSource {
    pub youtube_id: Option<String>,
    pub original_url: Option<String>,
}
```

## Frontend Changes

### New Store: `libraryStore.ts`

```typescript
interface LibraryState {
  searchMode: 'youtube' | 'local';
  folders: LibraryFolder[];
  searchResults: LibraryVideo[];
  isSearching: boolean;
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  stats: LibraryStats | null;

  // Actions
  setSearchMode: (mode: 'youtube' | 'local') => void;
  searchLibrary: (query: string) => Promise<void>;
  addFolder: (path: string) => Promise<void>;
  removeFolder: (folderId: number) => Promise<void>;
  scanFolder: (folderId: number, options: ScanOptions) => Promise<void>;
  scanAll: (options: ScanOptions) => Promise<void>;
  checkFileAvailable: (filePath: string) => Promise<boolean>;
}

interface ScanOptions {
  createHkmeta: boolean;
  fetchSongInfo: boolean;   // MusicBrainz → Discogs fallback
  fetchLyrics: boolean;     // Lrclib → Musixmatch → Genius → NetEase
}
```

### Component Changes

1. **SearchBar.tsx** - Add mode toggle switch
2. **SearchResults.tsx** - Handle LibraryVideo type, grey out missing files
3. **QueuePanel.tsx** - Grey out missing files, show warning on click
4. **PlayerControls.tsx** - Show file path for local files
5. **SettingsDialog.tsx** - Add Library section with rescan options
6. **New: LibraryFolderList.tsx** - Folder management UI
7. **New: MissingFileDialog.tsx** - Warning dialog for missing files

## Backend Services

### Library Scanner (`src-tauri/src/services/library_scanner.rs`)

```rust
pub struct LibraryScanner;

impl LibraryScanner {
    /// Scan a folder for video files
    pub fn scan_folder(folder: &LibraryFolder, options: &ScanOptions) -> Result<ScanResult>;

    /// Search files by query (scans on demand)
    pub fn search(folders: &[LibraryFolder], query: &str, limit: u32) -> Vec<LibraryVideo>;

    /// Parse filename for artist/title
    fn parse_filename(filename: &str) -> (String, Option<String>);

    /// Read .hkmeta.json sidecar file
    fn read_hkmeta(video_path: &Path) -> Option<HkMeta>;

    /// Create .hkmeta.json from parsed filename
    fn create_hkmeta(video_path: &Path, parsed_title: &str, parsed_artist: Option<&str>) -> Result<()>;

    /// Find companion files (LRC, CDG)
    fn find_companions(video_path: &Path) -> CompanionFiles;

    /// Fetch song info: MusicBrainz → Discogs fallback
    async fn fetch_song_info(title: &str, artist: Option<&str>) -> Option<SongInfo>;

    /// Fetch lyrics: Lrclib → Musixmatch → Genius → NetEase fallback
    async fn fetch_lyrics(title: &str, artist: Option<&str>) -> Option<LyricsResult>;
}
```

## Implementation Tasks

### Phase 5a: Core Library (MVP)
- [ ] Database schema migration (library_folders only)
- [ ] LibraryScanner service with filename parsing
- [ ] .hkmeta.json read/write support
- [ ] library_* Tauri commands
- [ ] libraryStore.ts frontend store
- [ ] Search mode toggle in SearchBar
- [ ] Local search results display
- [ ] Library settings UI (add/remove folders)
- [ ] Missing file greyed out state
- [ ] Missing file warning dialog

### Phase 5b: Enhanced Metadata
- [ ] Rescan with .hkmeta.json creation
- [ ] Song info fetch: MusicBrainz → Discogs fallback
- [ ] Lyrics fetch: Lrclib → Musixmatch → Genius → NetEase fallback
- [ ] LRC companion file detection and reading
- [ ] CDG companion file detection (MP3+G support)

### Phase 5c: Polish
- [ ] Scan progress indicator
- [ ] Background scanning
- [ ] File path display in PlayerControls
- [ ] Incremental folder watching (detect new files)

## Follow-up: USB Drive Auto-detection (Future)

USB drive auto-detection is deferred to a future phase:

- **UsbWatcher service** - Watch `/Volumes/` for mount/unmount events
- **Auto-scan on mount** - Optionally scan connected drives
- **Drive disconnect handling** - Mark files as unavailable when drive removed

For now, users can manually add USB drive paths via "Add Folder..." button.

## File Verification Strategy

Simple approach for MVP:

1. **On Search** - Check file existence for each result
2. **On Queue Display** - Async verify, update UI if changed
3. **On Play** - Verify before attempting playback, show warning if missing
4. **Cached results** - Store availability in memory during session

## Technical Considerations

### Performance
- On-demand file scanning (no background indexing)
- Cache search results in memory during session
- Limit search results (default 50)

### Error Handling
- Handle permission errors (unreadable folders)
- Handle special characters in filenames
- Handle symlinks and aliases

### macOS Specific
- Request file system access permissions
- Handle sandboxing (user must grant folder access)

## Migration Notes

This replaces the previous Phase 5 (Local File Queue Support) and Phase 7 (USB Drive Support) plans, which are archived in `plan/archive/`.

Key differences:
- **File-based metadata** - `.hkmeta.json` files instead of database caching
- **Simpler architecture** - Portable libraries, copy folder = copy metadata
- **Mode toggle** - YouTube/Local switch instead of mixed results
- **Missing file UX** - Grey out with warning, not hard failure
