# Feature: Favorites / Starred Songs

## Summary

Allow users to star/favorite songs for quick access, building a personal library of go-to karaoke tracks.

## User Stories

1. As a singer, I want to quickly find songs I've enjoyed before
2. As a host, I want quick access to crowd favorites from past sessions
3. As a user, I want to organize my favorites into custom lists

## Implementation

### Database Changes

```sql
-- Favorites table
CREATE TABLE favorites (
    id INTEGER PRIMARY KEY,
    youtube_id TEXT,              -- For YouTube songs
    video_id INTEGER,             -- For library songs (future)
    title TEXT NOT NULL,
    artist TEXT,
    thumbnail_url TEXT,
    singer_id INTEGER,            -- Optional: which singer favorited it
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_played TIMESTAMP,
    play_count INTEGER DEFAULT 0,
    UNIQUE(youtube_id, singer_id),
    FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE SET NULL
);

-- Optional: Custom playlists/lists
CREATE TABLE favorite_lists (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    singer_id INTEGER,            -- Owner (null = shared)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE CASCADE
);

CREATE TABLE favorite_list_items (
    list_id INTEGER NOT NULL,
    favorite_id INTEGER NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (list_id, favorite_id),
    FOREIGN KEY (list_id) REFERENCES favorite_lists(id) ON DELETE CASCADE,
    FOREIGN KEY (favorite_id) REFERENCES favorites(id) ON DELETE CASCADE
);
```

### Backend

**New Commands:**
```rust
// Favorites CRUD
favorite_add(youtube_id, title, artist, thumbnail_url, singer_id?) -> Favorite
favorite_remove(favorite_id) -> ()
favorite_list(singer_id?, search?, limit?, offset?) -> Vec<Favorite>
favorite_toggle(youtube_id, singer_id?) -> bool  // Returns new state

// Statistics
favorite_get_most_played(limit?) -> Vec<Favorite>
favorite_get_recent(limit?) -> Vec<Favorite>

// Lists (optional)
favorite_list_create(name, singer_id?) -> FavoriteList
favorite_list_delete(list_id) -> ()
favorite_list_add_song(list_id, favorite_id) -> ()
favorite_list_remove_song(list_id, favorite_id) -> ()
favorite_list_get_all(singer_id?) -> Vec<FavoriteList>
```

### Frontend

**Star Button Integration:**
- Add star icon to:
  - SearchResultItem
  - QueueItem
  - HistoryItem
  - Now Playing display
- Toggle on click, animate fill

**FavoritesPanel Component:**
- Accessible from sidebar or tab
- Search/filter favorites
- Sort by: date added, most played, alphabetical
- Quick actions: Play, Add to queue

**SingerPicker Integration:**
- Option to show singer's favorites
- "Add from favorites" when assigning songs

## UI Mockup

```
Search Result with Star:
┌─────────────────────────────────────────────────┐
│ [Thumbnail] "Don't Stop Believin'" - Journey   │
│             5:02                    [⭐] [▶] [+]│
└─────────────────────────────────────────────────┘
                                      ^ star button

Favorites Panel:
┌─────────────────────────────────────────────────┐
│ ⭐ Favorites                    [Sort: Recent ▼]│
├─────────────────────────────────────────────────┤
│ Search: [_______________]                       │
├─────────────────────────────────────────────────┤
│ All Favorites (23)                              │
│ ├─ My Go-To Songs (8)                          │
│ ├─ Party Starters (5)                          │
│ └─ Duets (3)                                   │
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐ │
│ │ ⭐ "Bohemian Rhapsody" - Queen              │ │
│ │    Played 12 times • Last: 2 days ago       │ │
│ │    [▶ Play] [+ Queue] [⋮]                   │ │
│ ├─────────────────────────────────────────────┤ │
│ │ ⭐ "Sweet Caroline" - Neil Diamond          │ │
│ │    Played 8 times • Last: 1 week ago        │ │
│ │    [▶ Play] [+ Queue] [⋮]                   │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Singer-Specific Favorites

When a session has singers:
- Each singer can have their own favorites
- Star button shows who favorited the song
- Filter favorites by singer
- "Quick add from [Singer]'s favorites"

```
Singer's Favorites Quick Access:
┌─────────────────────────────────────────────────┐
│ 🎤 Alice's turn                                │
│ Quick picks from Alice's favorites:            │
│ [Sweet Caroline] [Bohemian Rhapsody] [Total...]│
└─────────────────────────────────────────────────┘
```

## Keyboard Shortcuts

| Key | Context | Action |
|-----|---------|--------|
| `F` | Queue/History item | Toggle favorite |
| `Cmd+Shift+F` | Global | Open favorites panel |

## Statistics Tracked

- Total play count (across all sessions)
- Last played date
- Date added to favorites
- Which singers have favorited (if applicable)

## Data Migration

For users upgrading:
- Scan history for frequently played songs
- Prompt: "We found songs you've played 3+ times. Add to favorites?"
- Or: Auto-add songs played 5+ times

## Edge Cases

1. **Same song, multiple versions** - Different YouTube IDs treated separately
2. **Song removed from YouTube** - Keep in favorites, show "unavailable" badge
3. **Singer deleted** - Favorites become "shared" (singer_id = null)
4. **Duplicate prevention** - Can't favorite same song twice per singer
5. **Import/export** - JSON export of favorites for backup

## Future Enhancements

1. **Sync across devices** - Cloud backup of favorites
2. **Share favorites** - Generate shareable link
3. **Collaborative lists** - Multiple singers can edit a list
4. **Smart suggestions** - "Add to favorites?" after playing 3+ times
5. **Favorites widget** - Quick access on session start screen
