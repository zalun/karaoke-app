# Feature: Voting System

## Summary

Let the audience vote on which song should play next, adding an interactive element to karaoke nights.

## User Stories

1. As a guest, I want to vote for songs I'm excited to hear
2. As a host, I want to engage the audience in song selection
3. As a singer, I want to see how much support my song has

## Design Options

### Option A: Upvote Queue Items

Guests can upvote songs in the queue. Higher votes = higher priority.

### Option B: "Next Song" Poll

Before each song, show 2-3 options and let guests vote on what plays next.

### Option C: Hybrid

Votes influence order, but host can override. Songs with enough votes get "boosted."

## Recommended: Option A with Thresholds

Simple upvoting with configurable boost threshold.

## Implementation

### Prerequisites

Requires [QR Code Requests](./qr-requests.md) feature for guest participation.

### Database Changes

```sql
-- Add votes to queue items
ALTER TABLE queue ADD COLUMN vote_count INTEGER DEFAULT 0;

-- Track individual votes (prevent double-voting)
CREATE TABLE queue_votes (
    queue_item_id TEXT NOT NULL,
    voter_id TEXT NOT NULL,  -- Guest device ID or singer ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (queue_item_id, voter_id)
);
```

### Backend

**New Commands:**
```rust
queue_vote(queue_item_id, voter_id) -> i32        // Returns new vote count
queue_unvote(queue_item_id, voter_id) -> i32
queue_get_votes(queue_item_id) -> Vec<Vote>
voting_set_enabled(session_id, enabled: bool) -> ()
voting_set_boost_threshold(session_id, threshold: i32) -> ()
```

**Vote Boost Logic:**
```rust
fn recalculate_queue_order(queue: &mut Vec<QueueItem>, threshold: i32) {
    // Songs with votes >= threshold move up
    // Preserve relative order among boosted songs
    // Preserve relative order among non-boosted songs
    // Currently playing song is never affected
}
```

### Frontend (Host)

**Voting Settings:**
- Toggle voting on/off
- Set boost threshold (default: 3 votes)
- Show vote counts on queue items

**Queue Item Changes:**
- Display vote count badge
- Highlight "boosted" songs
- Animation when song gets boosted

### Guest Web App

```
Queue view with voting:
┌─────────────────────────────────┐
│ Coming Up:                      │
│                                 │
│ 1. "Song A" - Alice      ▶     │
│    [🔥 5 votes]                │
│                                 │
│ 2. "Song B" - Bob              │
│    [👍 Vote] 2 votes           │
│                                 │
│ 3. "Song C" - Carol            │
│    [👍 Vote] 0 votes           │
│                                 │
│ ─────────────────────────────  │
│ Your votes remaining: 2        │
└─────────────────────────────────┘
```

## Voting Rules

1. **Vote limit** - Each guest gets N votes per session (configurable, default: 5)
2. **No self-voting** - Can't vote for your own songs (optional)
3. **Vote expiry** - Votes reset when song plays
4. **Boost threshold** - Songs need N votes to move up (default: 3)
5. **Max boost** - Boosted songs move up by N positions max (prevents jumping to #1)

## UI Mockup (Host Queue)

```
Queue Panel with votes:
┌─────────────────────────────────────────────────┐
│ Queue                          [Voting: ON]    │
├─────────────────────────────────────────────────┤
│ 1. ▶ "Bohemian Rhapsody"                       │
│    Alice                                        │
│                                                 │
│ 2. 🔥 "Don't Stop Believin'" [5 votes]         │
│    Bob                         BOOSTED         │
│                                                 │
│ 3. "Sweet Caroline" [2 votes]                  │
│    Carol                                        │
│                                                 │
│ 4. "Dancing Queen" [0 votes]                   │
│    Alice                                        │
└─────────────────────────────────────────────────┘
```

## Edge Cases

1. **Tie breaker** - Original queue order preserved for ties
2. **Song skipped** - Votes are lost (don't transfer)
3. **Singer removes song** - Votes returned to voters
4. **Late joiner** - Gets full vote allocation
5. **Voting disabled mid-session** - Existing votes preserved but hidden

## Configuration Options

| Setting | Default | Description |
|---------|---------|-------------|
| `voting_enabled` | false | Enable/disable voting |
| `votes_per_guest` | 5 | Max votes per guest per session |
| `boost_threshold` | 3 | Votes needed to boost |
| `max_boost_positions` | 3 | Max positions a song can jump |
| `allow_self_vote` | false | Can singers vote for own songs |

## Future Enhancements

- Emoji reactions (🔥 ❤️ 😂)
- "Golden vote" - Host can give a super-vote worth 3x
- Vote history and statistics
- Real-time vote animations on video overlay
