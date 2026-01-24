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

For a new song by Singer A with current queue state `{A: 2, B: 1, C: 1}`:

1. A has 2 songs (most), so A should wait for others to catch up
2. Position = after all singers with count < A's count have had their next turn
3. Simplified formula: Insert at position where A's (count+1)th song would appear in a fair rotation

**Logic:**
- Count songs per singer in current queue
- New song's singer count = N
- Find the position after N complete "rounds" of all active singers
- This ensures fair rotation without reshuffling existing items

## Verification

1. Enable Fair Queue toggle
2. Set active singer to "Alice"
3. Add song → should appear at top (Alice has 0 songs)
4. Add another song for Alice → should appear after other singers' songs
5. Switch to "Bob", add song → should appear at position based on Bob's count
6. Disable toggle → songs append to end as before
7. Run E2E tests: `just e2e`

## Notes

- Toggle state persists via settings store (SQLite)
- Only affects new songs; existing queue untouched
- Works with unassigned songs (treated as separate "singer")
- Duets: use MAX singer count (consistent with fair shuffle algorithm)
