# Feature: Singer Statistics

## Summary

Track and display statistics for each singer including songs sung, total time, favorite genres, and session participation.

## User Stories

1. As a singer, I want to see my karaoke history and statistics
2. As a host, I want to see who's been most active during a session
3. As a user, I want fun facts about my karaoke habits

## Statistics to Track

### Per Singer

- Total songs sung (all time)
- Total time singing (minutes)
- Sessions participated
- Average songs per session
- Favorite songs (most repeated)
- Favorite genres (if available)
- Duet count
- First song ever sung
- Most recent song

### Per Session

- Songs per singer
- Time per singer
- Session duration
- Total songs played
- Unique songs vs repeats

### All Time

- Total sessions hosted
- Total songs played
- Total unique songs
- Most popular songs overall
- Most active singers

## Implementation

### Database Changes

```sql
-- Singer statistics (cached/aggregated)
CREATE TABLE singer_stats (
    singer_id INTEGER PRIMARY KEY,
    total_songs INTEGER DEFAULT 0,
    total_duration_seconds INTEGER DEFAULT 0,
    session_count INTEGER DEFAULT 0,
    first_song_date TIMESTAMP,
    last_song_date TIMESTAMP,
    FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE CASCADE
);

-- Detailed song history (for analysis)
CREATE TABLE song_history (
    id INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL,
    singer_id INTEGER,            -- Can be null for unassigned songs
    youtube_id TEXT,
    title TEXT NOT NULL,
    duration_seconds INTEGER,
    played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed BOOLEAN DEFAULT 1,  -- False if skipped
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE SET NULL
);

-- Session statistics (cached)
CREATE TABLE session_stats (
    session_id INTEGER PRIMARY KEY,
    total_songs INTEGER DEFAULT 0,
    total_duration_seconds INTEGER DEFAULT 0,
    unique_songs INTEGER DEFAULT 0,
    singer_count INTEGER DEFAULT 0,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

### Backend

**New Commands:**
```rust
// Singer stats
stats_get_singer(singer_id) -> SingerStats
stats_get_singer_top_songs(singer_id, limit?) -> Vec<SongStat>
stats_get_singer_history(singer_id, limit?, offset?) -> Vec<HistoryEntry>

// Session stats
stats_get_session(session_id) -> SessionStats
stats_get_session_by_singer(session_id) -> Vec<SingerSessionStats>

// Global stats
stats_get_global() -> GlobalStats
stats_get_top_songs(limit?) -> Vec<SongStat>
stats_get_top_singers(limit?) -> Vec<SingerStat>
stats_get_recent_sessions(limit?) -> Vec<SessionSummary>

// Fun facts
stats_get_fun_facts(singer_id?) -> Vec<FunFact>
```

**Stats Calculation:**
```rust
// Called when song completes
fn update_stats_on_song_complete(
    session_id: i64,
    singer_ids: Vec<i64>,
    youtube_id: &str,
    duration: i32,
) {
    // Update singer_stats for each singer
    // Update session_stats
    // Insert into song_history
}
```

### Frontend

**StatsPanel Component:**
- Overview dashboard
- Singer leaderboard
- Session history with stats
- Charts and visualizations

**SingerStatsCard Component:**
- Compact stats for individual singer
- Shown in singer picker or session bar
- Expandable for full stats

**SessionSummary Component:**
- End-of-session stats display
- Shareable summary card
- Fun facts and highlights

## UI Mockup

```
Stats Dashboard:
┌─────────────────────────────────────────────────┐
│ 📊 Karaoke Statistics                          │
├─────────────────────────────────────────────────┤
│ All Time                                        │
│ ┌─────────┬─────────┬─────────┬─────────┐      │
│ │ 47      │ 156     │ 12.5hrs │ 89      │      │
│ │Sessions │ Songs   │ Total   │ Unique  │      │
│ └─────────┴─────────┴─────────┴─────────┘      │
├─────────────────────────────────────────────────┤
│ Top Singers                                     │
│ 1. 🥇 Alice    - 45 songs (4.2 hrs)           │
│ 2. 🥈 Bob      - 38 songs (3.5 hrs)           │
│ 3. 🥉 Carol    - 31 songs (2.8 hrs)           │
├─────────────────────────────────────────────────┤
│ Most Played Songs                               │
│ 1. "Don't Stop Believin'" - 12 times          │
│ 2. "Bohemian Rhapsody" - 9 times              │
│ 3. "Sweet Caroline" - 8 times                 │
└─────────────────────────────────────────────────┘

Singer Stats Card (expanded):
┌─────────────────────────────────────────────────┐
│ 👤 Alice's Stats                               │
├─────────────────────────────────────────────────┤
│ ┌─────────┬─────────┬─────────┬─────────┐      │
│ │ 45      │ 4.2hrs  │ 8       │ 3       │      │
│ │ Songs   │ Time    │Sessions │ Duets   │      │
│ └─────────┴─────────┴─────────┴─────────┘      │
├─────────────────────────────────────────────────┤
│ Top Songs:                                      │
│ • "Total Eclipse of the Heart" (5x)            │
│ • "I Will Survive" (4x)                        │
│ • "Dancing Queen" (3x)                         │
├─────────────────────────────────────────────────┤
│ 🎯 Fun Fact: Alice has sung more ballads      │
│    than anyone else!                           │
└─────────────────────────────────────────────────┘

End of Session Summary:
┌─────────────────────────────────────────────────┐
│ 🎤 Session Complete!                           │
│ "Friday Night Karaoke"                         │
├─────────────────────────────────────────────────┤
│ Duration: 2h 34m  •  Songs: 23  •  Singers: 4  │
├─────────────────────────────────────────────────┤
│ 🏆 Most Songs:     Alice (8)                   │
│ ⏱️ Most Time:      Bob (45 min)                │
│ 🎵 Song of Night:  "Bohemian Rhapsody"         │
├─────────────────────────────────────────────────┤
│ Fun Facts:                                      │
│ • Carol sang her first duet tonight!           │
│ • 3 songs were new to the group                │
│ • Alice hit a 5-song streak                    │
├─────────────────────────────────────────────────┤
│ [Share Summary]  [View Full Stats]  [Close]    │
└─────────────────────────────────────────────────┘
```

## Fun Facts Generator

Dynamic fun facts based on data:

```typescript
interface FunFact {
  icon: string;
  text: string;
  category: 'milestone' | 'comparison' | 'streak' | 'preference';
}

const funFactGenerators = [
  // Milestones
  { check: (s) => s.totalSongs === 100, text: "🎯 100 songs sung!" },
  { check: (s) => s.totalSongs === 50, text: "🎯 Half-century of songs!" },

  // Comparisons
  { check: (s) => s.balladPercent > 50, text: "❤️ More ballads than any other singer" },

  // Streaks
  { check: (s) => s.consecutiveSessions >= 5, text: "🔥 5 sessions in a row!" },

  // Preferences
  { check: (s) => s.duetPercent > 30, text: "👥 Loves singing duets" },
];
```

## Visualization Ideas

1. **Song timeline** - Calendar heatmap of singing activity
2. **Genre pie chart** - Distribution of song genres
3. **Duet network** - Who sings with whom most often
4. **Session trends** - Songs per session over time
5. **Personal bests** - Longest session, most songs in one night

## Privacy Considerations

- Stats are local only (no cloud sync by default)
- Option to hide/show individual singer stats
- Clear stats option for fresh start
- No external sharing without explicit consent

## Future Enhancements

1. **Export stats** - PDF/image for sharing
2. **Achievements/badges** - Gamification elements
3. **Yearly wrapped** - Annual summary (like Spotify Wrapped)
4. **Competitive mode** - Real-time leaderboard during session
5. **Song recommendations** - Based on singer stats
