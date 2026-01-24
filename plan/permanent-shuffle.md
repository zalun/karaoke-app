# Fair Queue Toggle Implementation Plan

## Overview

Add a "Fair Queue" on/off toggle next to the existing Fair Shuffle button. When enabled, new songs are inserted at a fair position (based on singer rotation) instead of being appended to the end. Existing queue order is preserved.

## Key Files to Modify

1. **`src/stores/settingsStore.ts`** - Add `FAIR_QUEUE_ENABLED` setting
2. **`src-tauri/src/commands/queue.rs`** - Add `queue_compute_fair_position` command
3. **`src/services/queue.ts`** - Add `computeFairPosition()` service method
4. **`src/stores/queueStore.ts`** - Modify `addToQueue` to check setting and use fair insertion
5. **`src/App.tsx`** - Add toggle button next to Fair Shuffle button (lines ~978-997)

## Implementation Steps

### Step 1: Add Setting (settingsStore.ts)

Add to `SETTINGS_KEYS`:
```typescript
FAIR_QUEUE_ENABLED: "fair_queue_enabled",
```

Add default value:
```typescript
[SETTINGS_KEYS.FAIR_QUEUE_ENABLED]: "false",
```

### Step 2: Backend - Fair Position Calculation (queue.rs)

Add new command `queue_compute_fair_position` that:
1. Takes optional `singer_id` parameter
2. Counts each singer's pending songs in queue
3. Calculates the fair insertion position:
   - If singer has 0 songs → insert at position 0 (top)
   - If singer has N songs → insert after the Nth occurrence of any singer with N songs
4. Returns the computed position

### Step 3: Frontend Service (queue.ts)

Add method:
```typescript
async computeFairPosition(singerId: number | null): Promise<number>
```

### Step 4: Modify addToQueue (queueStore.ts)

In `addToQueue`:
```typescript
addToQueue: async (video: Video) => {
  const fairQueueEnabled = useSettingsStore.getState().getSetting(SETTINGS_KEYS.FAIR_QUEUE_ENABLED) === "true";
  const { activeSingerId } = useSessionStore.getState();

  if (fairQueueEnabled && activeSingerId) {
    const position = await queueService.computeFairPosition(activeSingerId);
    return addToQueueAt(video, position);
  }

  // Existing append-to-end logic
  ...
}
```

### Step 5: UI Toggle (App.tsx)

Add toggle button next to Fair Shuffle button:
```tsx
<button
  onClick={() => toggleFairQueue()}
  title={fairQueueEnabled ? "Fair Queue: ON" : "Fair Queue: OFF"}
  className={`p-2 rounded transition-colors ${
    fairQueueEnabled
      ? "text-blue-400 bg-blue-400/20"
      : "text-gray-400 hover:text-blue-400 hover:bg-gray-700"
  }`}
>
  <ListOrdered size={18} />  {/* or similar icon */}
</button>
```

## Fair Position Algorithm

**Rule:** Insert new song after all singers have sung at least N+1 times, where N = singer's current song count.

### Algorithm

1. Count how many songs singer X already has in queue: `N`
2. Iterate through queue, tracking each singer's cumulative song count
3. Find the first position where ALL singers have sung at least `N+1` times (round N+1 complete)
4. Insert X right after that position
5. If round N+1 doesn't exist (queue ends first), append to end

### Examples

| Queue | Adding X | X count | Round to complete | Insert at | Result |
|-------|----------|---------|-------------------|-----------|--------|
| `ABCABCABC` | X (new) | 0 | Round 1 ends at pos 2 | 3 | `ABCXABCABC` |
| `AAABCABBC` | X (new) | 0 | Round 1 ends at pos 4 | 5 | `AAABCXABBC` |
| `ABCADAB` | X (new) | 0 | Round 1 ends at pos 4 (D) | 5 | `ABCADXAB` |
| `ABCXABCABC` | X | 1 | Round 2 ends at pos 6 | 7 | `ABCXABCXABC` |
| `ABXABX` | X | 2 | Round 3 doesn't exist | end | `ABXABXX` |
| `AAA` | X (new) | 0 | Round 1 ends at pos 0 | 1 | `AXAA` |

### Edge Cases

- **Unassigned songs**: Treated as a separate "singer" group
- **Empty queue**: Insert at position 0
- **Singer has most/tied songs**: Append to end (their round doesn't exist yet)

## Verification

1. Enable Fair Queue toggle
2. Add songs for different singers and verify insertion positions match examples above
3. Disable toggle → songs append to end as before
4. Run E2E tests: `just e2e`

## Notes

- Toggle state persists via settings store (SQLite)
- Only affects new songs; existing queue order preserved
- Unassigned songs treated as separate "singer" group
