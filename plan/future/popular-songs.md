# Feature: Popular Karaoke Songs List

## Summary

Provide curated lists of crowd-pleasing karaoke songs organized by genre, decade, and mood to help users find songs quickly.

## User Stories

1. As a new user, I want suggestions for good karaoke songs
2. As a host, I want quick access to crowd-pleasers when energy dips
3. As a singer unsure what to sing, I want to browse by genre/mood

## Data Source Options

### Option A: Bundled Static List (Recommended for MVP)

Ship the app with a curated JSON file of popular karaoke songs.

**Pros:** Works offline, fast, no API costs
**Cons:** Requires manual updates, limited size

### Option B: External API

Fetch from a karaoke song database or music API.

**Pros:** Always current, larger catalog
**Cons:** Requires internet, API costs, rate limits

### Option C: Community-Sourced

Allow users to contribute/vote on popular songs.

**Pros:** Organic growth, community engagement
**Cons:** Moderation needed, cold start problem

## Recommended: Option A (Static List)

Start with a curated list of ~500 songs. Can add API integration later.

## Implementation

### Data Structure

**Bundled File** (`src-tauri/resources/popular-songs.json`):
```json
{
  "version": "1.0",
  "updated": "2025-01-01",
  "songs": [
    {
      "title": "Bohemian Rhapsody",
      "artist": "Queen",
      "youtube_query": "Bohemian Rhapsody karaoke",
      "genres": ["rock", "classic"],
      "decade": "1970s",
      "mood": ["epic", "dramatic"],
      "difficulty": "hard",
      "popularity": 95
    }
  ],
  "categories": {
    "genres": ["pop", "rock", "country", "r&b", "disco", "80s", "90s", "2000s", "2010s", "2020s"],
    "moods": ["upbeat", "ballad", "party", "romantic", "epic", "funny"],
    "difficulties": ["easy", "medium", "hard"]
  }
}
```

### Backend

**New Commands:**
```rust
popular_get_categories() -> Categories
popular_get_songs(filters: PopularFilters) -> Vec<PopularSong>
popular_search(query: String) -> Vec<PopularSong>
```

**Filters:**
```rust
struct PopularFilters {
    genre: Option<String>,
    decade: Option<String>,
    mood: Option<String>,
    difficulty: Option<String>,
    limit: Option<u32>,
    offset: Option<u32>,
}
```

### Frontend

**New Components:**

**PopularSongsPanel:**
- Category chips (genre, decade, mood)
- Song list with search
- "Add to queue" / "Play now" buttons
- Difficulty indicator

**Integration with SearchBar:**
- Tab or toggle: "Search YouTube" / "Browse Popular"
- Or: Show popular suggestions when search is empty

## UI Mockup

```
Popular Songs Panel:
┌─────────────────────────────────────────────────┐
│ Popular Karaoke Songs                          │
├─────────────────────────────────────────────────┤
│ Genre:  [All] [Pop] [Rock] [Country] [R&B]     │
│ Decade: [All] [80s] [90s] [2000s] [2010s]      │
│ Mood:   [All] [Party] [Ballad] [Upbeat]        │
├─────────────────────────────────────────────────┤
│ Search: [_______________]                       │
├─────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐ │
│ │ 🎵 Don't Stop Believin' - Journey          │ │
│ │    Rock • 1980s • Party    ⭐⭐⭐ (Medium)   │ │
│ │    [▶ Play] [+ Queue]                       │ │
│ ├─────────────────────────────────────────────┤ │
│ │ 🎵 Sweet Caroline - Neil Diamond           │ │
│ │    Pop • 1960s • Party     ⭐⭐ (Easy)      │ │
│ │    [▶ Play] [+ Queue]                       │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Curated Song Categories

### By Genre
- **Pop** - Mainstream hits everyone knows
- **Rock** - Classic and modern rock anthems
- **Country** - Nashville favorites
- **R&B/Soul** - Motown and modern R&B
- **Disco/Dance** - Dance floor fillers
- **Musical Theater** - Broadway classics

### By Decade
- 1960s-70s Classics
- 1980s Hits
- 1990s Nostalgia
- 2000s Throwbacks
- 2010s Favorites
- 2020s Current

### By Mood
- **Party Starters** - High energy crowd pleasers
- **Ballads** - Emotional slow songs
- **Duets** - Songs for two singers
- **Group Songs** - Everyone can join in
- **Funny** - Comedy and novelty songs
- **Romantic** - Love songs

### By Difficulty
- **Easy** - Simple melodies, repetitive lyrics
- **Medium** - Moderate range and complexity
- **Hard** - Challenging vocals, complex timing

## Initial Song List (Sample)

| Song | Artist | Genre | Decade | Difficulty |
|------|--------|-------|--------|------------|
| Don't Stop Believin' | Journey | Rock | 1980s | Medium |
| Bohemian Rhapsody | Queen | Rock | 1970s | Hard |
| Sweet Caroline | Neil Diamond | Pop | 1960s | Easy |
| Livin' on a Prayer | Bon Jovi | Rock | 1980s | Medium |
| I Will Survive | Gloria Gaynor | Disco | 1970s | Medium |
| Total Eclipse of the Heart | Bonnie Tyler | Ballad | 1980s | Medium |
| Dancing Queen | ABBA | Disco | 1970s | Easy |
| Mr. Brightside | The Killers | Rock | 2000s | Medium |
| Shallow | Lady Gaga & Bradley Cooper | Ballad | 2010s | Hard |
| Uptown Funk | Bruno Mars | Pop | 2010s | Medium |

## Future Enhancements

1. **User ratings** - Let users rate songs after singing
2. **Personal history** - "Songs you've sung" section
3. **Recommendations** - "Based on your history..."
4. **Trending** - Show what's popular this week
5. **Auto-update** - Check for updated song list on app launch
6. **Regional lists** - Different popular songs by country
