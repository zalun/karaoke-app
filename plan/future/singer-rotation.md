# Feature: Singer Rotation / Fair Queue

## Summary

Automatically alternate between singers so no one dominates the queue. When a singer adds multiple songs, their songs are spread throughout the queue to ensure fair rotation.

## User Stories

1. As a host, I want the queue to automatically rotate between singers so everyone gets equal turns
2. As a singer, I want to add multiple songs without worrying about hogging the queue
3. As a host, I want to toggle rotation mode on/off for different party styles

## Design Options

### Option A: Round-Robin Insertion

When a singer adds a song, it's inserted after the last song from other singers, ensuring each singer gets one turn before anyone repeats.

**Example:**
- Queue: Alice(1), Bob(1), Carol(1)
- Alice adds song -> Queue: Alice(1), Bob(1), Carol(1), Alice(2)
- Alice adds another -> Queue: Alice(1), Bob(1), Carol(1), Alice(2), [waits for Bob/Carol]

### Option B: Fair Shuffle

Periodically reorganize the queue to distribute songs evenly by singer, while preserving the "next up" position.

### Option C: Per-Singer Limits

Limit each singer to N songs in the "active" queue (e.g., 2 songs). Additional songs go to a "waiting" list.

## Recommended: Option A (Round-Robin)

Most intuitive for users and maintains queue predictability.

## Implementation

### Database Changes

```sql
-- Add rotation mode to sessions
ALTER TABLE sessions ADD COLUMN rotation_mode TEXT DEFAULT 'off';
-- Values: 'off', 'round_robin', 'fair_shuffle'
```

### Backend

**New Commands:**
```rust
session_set_rotation_mode(session_id, mode) -> ()
session_get_rotation_mode(session_id) -> String
queue_add_with_rotation(video_id, singer_id) -> QueueItem  // Calculates optimal position
```

**Rotation Algorithm:**
```rust
fn calculate_rotation_position(queue: &[QueueItem], singer_id: i64) -> usize {
    // Find last occurrence of each active singer
    // Insert after the round where all other singers have gone
    // If singer has no songs, insert at end
}
```

### Frontend

**SessionBar Changes:**
- Add rotation mode toggle button
- Show rotation indicator when active

**QueuePanel Changes:**
- Visual indicator showing rotation order
- "Your turn" highlight for next singer

**SingerPicker Changes:**
- When rotation is on, show estimated position in queue

## UI Mockup

```
SessionBar:
┌─────────────────────────────────────────────────┐
│ ● Karaoke Night    [🔄 Rotation: ON]   [End]   │
│ [Alice] [Bob] [Carol] [+]                       │
└─────────────────────────────────────────────────┘

Queue with rotation indicator:
┌─────────────────────────────────────────────────┐
│ Round 1:                                        │
│   1. "Song A" - Alice ▶ (playing)              │
│   2. "Song B" - Bob                             │
│   3. "Song C" - Carol                           │
│ Round 2:                                        │
│   4. "Song D" - Alice                           │
│   5. "Song E" - Bob                             │
└─────────────────────────────────────────────────┘
```

## Edge Cases

1. **Singer leaves mid-session** - Their songs remain, rotation continues with remaining singers
2. **New singer joins** - Gets slot in next round
3. **Unassigned songs** - Treated as "house" singer, rotates like any other
4. **Duets** - Counts as turn for all assigned singers
5. **Skip song** - Doesn't affect rotation (singer still "used" their turn)

## Testing

- Add 3 singers, each adds 3 songs -> verify round-robin order
- Toggle rotation off -> verify songs add at end
- Remove singer mid-rotation -> verify queue updates correctly
- Duet assignment -> verify counts for both singers
