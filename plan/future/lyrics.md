# Feature: Lyrics Display

## Summary

Fetch and display synchronized lyrics as an overlay on the video, helping singers follow along even when the karaoke video doesn't have clear lyrics.

## User Stories

1. As a singer, I want to see lyrics when the video doesn't show them clearly
2. As a singer, I want lyrics synchronized with the music
3. As a host, I want to toggle lyrics on/off for different songs

## Data Sources

### Option A: LRC Files (Recommended for accuracy)

Synchronized lyrics in LRC format with timestamps.

**Sources:**
- Lrclib.net (free API)
- LRCGET
- User-provided LRC files

### Option B: Genius API

Lyrics without timestamps (text only).

**Pros:** Large database, accurate lyrics
**Cons:** No sync, requires API key, rate limits

### Option C: Musixmatch API

Synced lyrics available.

**Pros:** Large synced database
**Cons:** Paid API, strict usage terms

### Option D: User-Contributed

Allow users to upload/create LRC files.

## Recommended: Option A + D

Use Lrclib.net API with fallback to user-contributed LRC files.

## Implementation

### Database Changes

```sql
-- Cached lyrics
CREATE TABLE lyrics (
    id INTEGER PRIMARY KEY,
    youtube_id TEXT UNIQUE,
    source TEXT NOT NULL,         -- 'lrclib', 'genius', 'user'
    lyrics_text TEXT,             -- Plain text (Genius)
    lyrics_synced TEXT,           -- LRC format with timestamps
    language TEXT DEFAULT 'en',
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User corrections/contributions
CREATE TABLE lyrics_contributions (
    id INTEGER PRIMARY KEY,
    youtube_id TEXT NOT NULL,
    lyrics_synced TEXT NOT NULL,
    contributor_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### LRC Format

```
[ti:Song Title]
[ar:Artist Name]
[00:12.34]First line of lyrics
[00:15.67]Second line of lyrics
[00:18.90]Third line of lyrics
```

### Backend

**New Rust Dependencies:**
```toml
reqwest = { version = "0.12", features = ["json"] }
```

**New Commands:**
```rust
// Lyrics fetching
lyrics_fetch(youtube_id, title, artist) -> LyricsResult
lyrics_get_cached(youtube_id) -> Option<Lyrics>
lyrics_search(title, artist) -> Vec<LyricsMatch>

// User contributions
lyrics_contribute(youtube_id, lrc_content) -> ()
lyrics_get_contribution(youtube_id) -> Option<Lyrics>

// Settings
lyrics_set_enabled(enabled: bool) -> ()
lyrics_set_style(style: LyricsStyle) -> ()
```

**Lrclib API Integration:**
```rust
async fn fetch_from_lrclib(title: &str, artist: &str) -> Result<Lyrics> {
    // GET https://lrclib.net/api/search?track_name={title}&artist_name={artist}
    // Returns synced lyrics if available
}
```

### Frontend

**LyricsOverlay Component:**
- Displays current + upcoming lines
- Synchronized with video playback
- Customizable position and style
- Toggle visibility

**LyricsSettings Component:**
- Enable/disable lyrics
- Position: bottom, top, side panel
- Font size, color, background opacity
- Offset adjustment (sync fine-tuning)

**LyricsEditor Component (optional):**
- Manual LRC creation/editing
- Tap-to-sync interface
- Preview with video

## UI Mockup

```
Video with Lyrics Overlay:
┌─────────────────────────────────────────────────┐
│                                                 │
│                  [Video Content]                │
│                                                 │
│                                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │           Previous line (faded)             │ │
│ │         ♪ CURRENT LINE (bright) ♪           │ │
│ │            Next line (dimmed)               │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘

Lyrics Settings Panel:
┌─────────────────────────────────────────────────┐
│ Lyrics Settings                                 │
├─────────────────────────────────────────────────┤
│ ☑ Enable lyrics overlay                        │
│                                                 │
│ Position:  [Bottom ▼]                          │
│ Font size: [Large ▼]                           │
│ Background: [──●───] 60%                       │
│                                                 │
│ Sync offset: [-0.5s] [+0.5s]                   │
│                                                 │
│ [Reset to defaults]                            │
└─────────────────────────────────────────────────┘
```

## Lyrics Display Styles

### Style 1: Karaoke (Default)
- Current word highlighted
- Syllable-by-syllable highlighting (if data available)
- Bouncing ball effect (optional)

### Style 2: Teleprompter
- Scrolling text
- Current line highlighted
- Shows more context

### Style 3: Minimal
- Single line
- Fades in/out
- Least intrusive

## Sync Algorithm

```typescript
interface LyricLine {
  time: number;      // Start time in seconds
  text: string;
  endTime?: number;  // Optional end time
}

function getCurrentLine(lyrics: LyricLine[], currentTime: number): LyricLine | null {
  // Binary search for efficiency
  // Return line where time <= currentTime < nextTime
}
```

## Fallback Behavior

1. Try lrclib.net for synced lyrics
2. If not found, try Genius for plain text
3. If still not found, show "Lyrics not available" with search link
4. Allow manual LRC upload

## User-Contributed Lyrics

**Workflow:**
1. User notices missing/wrong lyrics
2. Click "Edit lyrics" button
3. Opens LRC editor with tap-to-sync
4. Submit contribution (stored locally)
5. Optional: Submit to lrclib.net

**Tap-to-Sync Editor:**
```
┌─────────────────────────────────────────────────┐
│ Create Synced Lyrics                           │
├─────────────────────────────────────────────────┤
│ [▶ Play video]  [Current time: 01:23.45]       │
├─────────────────────────────────────────────────┤
│ Paste plain lyrics below, then tap [SYNC]      │
│ as each line begins in the video:              │
│                                                 │
│ [00:00.00] [SYNC] First line of the song      │
│ [00:00.00] [SYNC] Second line of the song     │
│ [00:00.00] [SYNC] Third line of the song      │
│                                                 │
│ [Save] [Preview] [Cancel]                      │
└─────────────────────────────────────────────────┘
```

## Performance Considerations

1. **Caching** - Cache fetched lyrics in SQLite
2. **Prefetching** - Fetch lyrics for next song in queue
3. **Lazy loading** - Only fetch when lyrics toggle is on
4. **Memory** - Unload lyrics for played songs

## Edge Cases

1. **No lyrics found** - Show "Not available" with manual entry option
2. **Wrong lyrics** - Allow user to override with contribution
3. **Multiple matches** - Show selection dialog
4. **Instrumental sections** - Show "♪ Instrumental ♪"
5. **Language detection** - Auto-detect and show appropriate characters
6. **RTL languages** - Support right-to-left text
7. **Offset issues** - Allow manual sync adjustment

## Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `lyrics_enabled` | false | Show lyrics overlay |
| `lyrics_position` | bottom | Overlay position |
| `lyrics_font_size` | medium | Text size |
| `lyrics_bg_opacity` | 0.6 | Background transparency |
| `lyrics_offset` | 0 | Sync offset in seconds |
| `lyrics_style` | karaoke | Display style |

## Future Enhancements

1. **Sing-along mode** - Hide lyrics, show first letter hints
2. **Dual language** - Show original + translation
3. **Karaoke scoring** - Compare voice to expected timing
4. **Community database** - Share user contributions
5. **Auto-generate** - AI transcription of audio
