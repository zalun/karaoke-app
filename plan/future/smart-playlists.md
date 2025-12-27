# Feature: Smart Playlists

## Summary

Auto-generated playlists based on listening history, singer preferences, mood, and other criteria. Helps users discover songs and quickly build queues.

## User Stories

1. As a host, I want quick playlist suggestions based on the current mood
2. As a singer, I want recommendations based on songs I've enjoyed
3. As a host starting a session, I want to quickly populate the queue

## Playlist Types

### 1. History-Based

- **Recently Played** - Songs from last N sessions
- **Most Played** - All-time favorites by play count
- **Singer's History** - Songs a specific singer has performed

### 2. Mood/Energy-Based

- **Party Starters** - High-energy songs to kick things off
- **Wind Down** - Slower songs for late night
- **Crowd Pleasers** - Songs with high sing-along potential

### 3. Discovery

- **Similar To** - Songs similar to a selected song
- **If You Liked X** - Based on a singer's favorites
- **Never Played** - From popular list, never sung before

### 4. Session-Aware

- **Fill the Gap** - Suggest songs when queue is low
- **Singer Balance** - Songs for singers who haven't sung recently
- **Time-Based** - Appropriate for time of night

## Implementation

### Database Changes

```sql
-- Smart playlist definitions
CREATE TABLE smart_playlists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,           -- 'history', 'mood', 'discovery', 'session'
    criteria TEXT NOT NULL,       -- JSON with playlist rules
    is_system BOOLEAN DEFAULT 0,  -- Built-in vs user-created
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cache generated playlist results
CREATE TABLE smart_playlist_cache (
    playlist_id INTEGER NOT NULL,
    youtube_id TEXT NOT NULL,
    score REAL,                   -- Relevance score
    cached_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (playlist_id, youtube_id),
    FOREIGN KEY (playlist_id) REFERENCES smart_playlists(id) ON DELETE CASCADE
);
```

### Criteria Schema

```json
{
  "type": "history",
  "rules": {
    "min_play_count": 2,
    "days_since_last_play": { "min": 7, "max": 90 },
    "singer_id": null,
    "exclude_current_session": true
  },
  "sort": { "field": "play_count", "order": "desc" },
  "limit": 50
}
```

### Backend

**New Commands:**
```rust
// Playlist management
smart_playlist_list() -> Vec<SmartPlaylist>
smart_playlist_create(name, criteria) -> SmartPlaylist
smart_playlist_delete(playlist_id) -> ()
smart_playlist_update(playlist_id, name?, criteria?) -> SmartPlaylist

// Playlist execution
smart_playlist_generate(playlist_id) -> Vec<PlaylistSong>
smart_playlist_add_to_queue(playlist_id, count?) -> Vec<QueueItem>
smart_playlist_shuffle_to_queue(playlist_id, count?) -> Vec<QueueItem>

// Quick generators
smart_suggest_for_singer(singer_id, count?) -> Vec<PlaylistSong>
smart_suggest_similar(youtube_id, count?) -> Vec<PlaylistSong>
smart_suggest_fill_queue(count?) -> Vec<PlaylistSong>
```

### Frontend

**SmartPlaylistPanel Component:**
- List of available smart playlists
- Preview songs in playlist
- "Add all to queue" / "Shuffle to queue"
- Create custom playlist with rule builder

**Quick Suggestions Widget:**
- Appears when queue is empty or short
- "Need songs? Try these playlists..."
- One-click add from suggestions

**Singer Quick Picks:**
- When singer is selected, show their smart recommendations
- Based on history + similar songs

## UI Mockup

```
Smart Playlists Panel:
┌─────────────────────────────────────────────────┐
│ 🎯 Smart Playlists                             │
├─────────────────────────────────────────────────┤
│ Quick Actions                                   │
│ [🎉 Party Mix] [🌙 Chill Vibes] [🔥 Top Hits] │
├─────────────────────────────────────────────────┤
│ Based on Your History                           │
│ ┌─────────────────────────────────────────────┐ │
│ │ 📊 Most Played (23 songs)                   │ │
│ │    [Preview] [Add to Queue]                 │ │
│ ├─────────────────────────────────────────────┤ │
│ │ 🕐 Recently Played (15 songs)               │ │
│ │    [Preview] [Add to Queue]                 │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ For Singers                                     │
│ ┌─────────────────────────────────────────────┐ │
│ │ 👤 Alice's Favorites (12 songs)             │ │
│ │ 👤 Bob's Style (8 songs)                    │ │
│ └─────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────┤
│ [+ Create Custom Playlist]                      │
└─────────────────────────────────────────────────┘

Playlist Preview:
┌─────────────────────────────────────────────────┐
│ 🎉 Party Mix                      [Shuffle All]│
├─────────────────────────────────────────────────┤
│ 1. Don't Stop Believin' - Journey    [+ Add]   │
│ 2. Livin' on a Prayer - Bon Jovi     [+ Add]   │
│ 3. Sweet Caroline - Neil Diamond     [+ Add]   │
│ 4. Mr. Brightside - The Killers      [+ Add]   │
│ ...                                             │
│                                                 │
│ [Add All (12)] [Shuffle 5 to Queue]            │
└─────────────────────────────────────────────────┘
```

## Built-in Playlists

| Name | Type | Criteria |
|------|------|----------|
| Most Played | history | `play_count >= 2`, sorted by count |
| Recently Played | history | Last 30 days |
| Party Starters | mood | Popular + upbeat tag |
| Chill Vibes | mood | Ballad + romantic tags |
| Crowd Pleasers | mood | High sing-along score |
| New to You | discovery | From popular, never played |
| [Singer]'s Picks | singer | Singer's top played |

## Algorithm Details

### Similarity Scoring

For "Similar To" playlists:
1. Match genre tags (40% weight)
2. Match decade (20% weight)
3. Match mood (20% weight)
4. Match difficulty (10% weight)
5. Co-occurrence in sessions (10% weight)

### Fill Queue Logic

When queue is running low:
1. Check time of session (early = energy up, late = wind down)
2. Check singer rotation (suggest for underrepresented singers)
3. Mix familiar (history) and fresh (never played)
4. Avoid recently played songs

## Prerequisites

- Requires [Popular Songs](./popular-songs.md) for mood/genre data
- Enhanced by [Favorites](./favorites.md) for history data

## Future Enhancements

1. **AI-powered suggestions** - Use ML for better recommendations
2. **Mood detection** - Analyze queue to detect current mood
3. **Time-of-night adaptation** - Automatic energy curve
4. **Collaborative filtering** - "Singers like you also enjoyed..."
5. **Export/share playlists** - Share smart playlist criteria
