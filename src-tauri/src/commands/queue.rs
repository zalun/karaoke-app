use super::errors::{CommandError, LockResultExt};
use crate::AppState;
use log::{debug, info};
use serde::{Deserialize, Serialize};
use tauri::State;

// ============ Data Structures ============

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QueueItemData {
    pub id: String,
    pub video_id: String,
    pub title: String,
    pub artist: Option<String>,
    pub duration: Option<i64>,
    pub thumbnail_url: Option<String>,
    pub source: String,
    pub youtube_id: Option<String>,
    pub file_path: Option<String>,
    pub position: i64,
    pub added_at: String,
    pub played_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueueState {
    pub queue: Vec<QueueItemData>,
    pub history: Vec<QueueItemData>,
    pub history_index: i64,
}

// ============ Helper Functions ============

fn get_active_session_id(db: &crate::db::Database) -> Result<i64, CommandError> {
    db.connection()
        .query_row(
            "SELECT id FROM sessions WHERE is_active = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => CommandError::NoActiveSession,
            _ => CommandError::Database(e),
        })
}

fn reorder_positions(
    db: &crate::db::Database,
    session_id: i64,
    item_type: &str,
) -> Result<(), CommandError> {
    // Validate item_type to prevent unexpected values
    if item_type != "queue" && item_type != "history" {
        return Err(CommandError::Validation(format!(
            "Invalid item_type: {}",
            item_type
        )));
    }

    // Re-number positions sequentially starting from 0
    db.connection().execute(
        "UPDATE queue_items SET position = (
                SELECT COUNT(*) FROM queue_items q2
                WHERE q2.session_id = queue_items.session_id
                AND q2.item_type = queue_items.item_type
                AND q2.rowid < queue_items.rowid
            )
            WHERE session_id = ?1 AND item_type = ?2",
        rusqlite::params![session_id, item_type],
    )?;
    Ok(())
}

// ============ Queue Commands ============

#[tauri::command]
pub fn queue_add_item(state: State<'_, AppState>, item: QueueItemData) -> Result<(), CommandError> {
    debug!("Adding item to queue: {} - {}", item.id, item.title);
    let db = state.db.lock().map_lock_err()?;
    let conn = db.connection();

    let session_id = get_active_session_id(&db)?;

    // Use transaction for atomicity (prevent duplicate positions)
    conn.execute("BEGIN IMMEDIATE", [])?;

    let result = (|| -> Result<i64, CommandError> {
        // Get next position
        let position: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM queue_items WHERE session_id = ?1 AND item_type = 'queue'",
                [session_id],
                |row| row.get(0),
            )
            .unwrap_or(0);

        conn.execute(
            "INSERT INTO queue_items (id, session_id, item_type, video_id, title, artist, duration, thumbnail_url, source, youtube_id, file_path, position, added_at)
             VALUES (?1, ?2, 'queue', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            rusqlite::params![
                item.id,
                session_id,
                item.video_id,
                item.title,
                item.artist,
                item.duration,
                item.thumbnail_url,
                item.source,
                item.youtube_id,
                item.file_path,
                position,
                item.added_at
            ],
        )?;

        Ok(position)
    })();

    match result {
        Ok(position) => {
            conn.execute("COMMIT", [])?;
            info!("Added item to queue: {} at position {}", item.id, position);
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn queue_remove_item(state: State<'_, AppState>, item_id: String) -> Result<(), CommandError> {
    debug!("Removing item from queue: {}", item_id);
    let db = state.db.lock().map_lock_err()?;

    let session_id = get_active_session_id(&db)?;

    db.connection().execute(
        "DELETE FROM queue_items WHERE id = ?1 AND session_id = ?2 AND item_type = 'queue'",
        rusqlite::params![item_id, session_id],
    )?;

    // Reorder remaining items
    reorder_positions(&db, session_id, "queue")?;

    info!("Removed item from queue: {}", item_id);
    Ok(())
}

#[tauri::command]
pub fn queue_reorder(
    state: State<'_, AppState>,
    item_id: String,
    new_position: i64,
) -> Result<(), CommandError> {
    // Validate new_position is not negative
    if new_position < 0 {
        return Err(CommandError::Validation(
            "Position cannot be negative".to_string(),
        ));
    }

    debug!(
        "Reordering queue item {} to position {}",
        item_id, new_position
    );
    let db = state.db.lock().map_lock_err()?;
    let conn = db.connection();

    let session_id = get_active_session_id(&db)?;

    // Get max position to validate bounds
    let max_position: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), 0) FROM queue_items WHERE session_id = ?1 AND item_type = 'queue'",
            [session_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if new_position > max_position {
        return Err(CommandError::Validation(format!(
            "Position {} is out of bounds (max: {})",
            new_position, max_position
        )));
    }

    // Get current position
    let current_position: i64 = conn.query_row(
        "SELECT position FROM queue_items WHERE id = ?1 AND session_id = ?2 AND item_type = 'queue'",
        rusqlite::params![item_id, session_id],
        |row| row.get(0),
    )?;

    if current_position == new_position {
        return Ok(());
    }

    // Use transaction for atomicity
    conn.execute("BEGIN IMMEDIATE", [])?;

    let result = (|| -> Result<(), CommandError> {
        // Shift items between old and new positions
        if new_position < current_position {
            // Moving up: shift items down
            conn.execute(
                "UPDATE queue_items SET position = position + 1
                 WHERE session_id = ?1 AND item_type = 'queue'
                 AND position >= ?2 AND position < ?3",
                rusqlite::params![session_id, new_position, current_position],
            )?;
        } else {
            // Moving down: shift items up
            conn.execute(
                "UPDATE queue_items SET position = position - 1
                 WHERE session_id = ?1 AND item_type = 'queue'
                 AND position > ?2 AND position <= ?3",
                rusqlite::params![session_id, current_position, new_position],
            )?;
        }

        // Set new position for the item
        conn.execute(
            "UPDATE queue_items SET position = ?1 WHERE id = ?2",
            rusqlite::params![new_position, item_id],
        )?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", [])?;
            info!(
                "Reordered queue item {} to position {}",
                item_id, new_position
            );
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn queue_clear(state: State<'_, AppState>) -> Result<(), CommandError> {
    info!("Clearing queue");
    let db = state.db.lock().map_lock_err()?;

    let session_id = get_active_session_id(&db)?;

    db.connection().execute(
        "DELETE FROM queue_items WHERE session_id = ?1 AND item_type = 'queue'",
        [session_id],
    )?;

    Ok(())
}

// ============ History Commands ============

#[tauri::command]
pub fn queue_move_to_history(
    state: State<'_, AppState>,
    item_id: String,
) -> Result<(), CommandError> {
    debug!("Moving item to history: {}", item_id);
    let db = state.db.lock().map_lock_err()?;
    let conn = db.connection();

    let session_id = get_active_session_id(&db)?;

    // Use transaction for atomicity
    conn.execute("BEGIN IMMEDIATE", [])?;

    let result = (|| -> Result<(), CommandError> {
        // Get next history position
        let history_position: i64 = conn.query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM queue_items WHERE session_id = ?1 AND item_type = 'history'",
            [session_id],
            |row| row.get(0),
        )?;

        // Update item type and set played_at
        conn.execute(
            "UPDATE queue_items SET item_type = 'history', position = ?1, played_at = datetime('now')
             WHERE id = ?2 AND session_id = ?3",
            rusqlite::params![history_position, item_id, session_id],
        )?;

        // Reorder remaining queue items
        reorder_positions(&db, session_id, "queue")?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", [])?;
            info!("Moved item to history: {}", item_id);
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn queue_add_to_history(
    state: State<'_, AppState>,
    item: QueueItemData,
) -> Result<(), CommandError> {
    debug!(
        "Adding item directly to history: {} - {}",
        item.id, item.title
    );
    let db = state.db.lock().map_lock_err()?;
    let conn = db.connection();

    let session_id = get_active_session_id(&db)?;

    // Use transaction for atomicity (prevent duplicate positions)
    conn.execute("BEGIN IMMEDIATE", [])?;

    let result = (|| -> Result<i64, CommandError> {
        // Get next history position
        let position: i64 = conn.query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM queue_items WHERE session_id = ?1 AND item_type = 'history'",
            [session_id],
            |row| row.get(0),
        )?;

        conn.execute(
            "INSERT INTO queue_items (id, session_id, item_type, video_id, title, artist, duration, thumbnail_url, source, youtube_id, file_path, position, added_at, played_at)
             VALUES (?1, ?2, 'history', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now'))",
            rusqlite::params![
                item.id,
                session_id,
                item.video_id,
                item.title,
                item.artist,
                item.duration,
                item.thumbnail_url,
                item.source,
                item.youtube_id,
                item.file_path,
                position,
                item.added_at
            ],
        )?;

        Ok(position)
    })();

    match result {
        Ok(position) => {
            conn.execute("COMMIT", [])?;
            info!(
                "Added item directly to history: {} at position {}",
                item.id, position
            );
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn queue_clear_history(state: State<'_, AppState>) -> Result<(), CommandError> {
    info!("Clearing history");
    let db = state.db.lock().map_lock_err()?;

    let session_id = get_active_session_id(&db)?;

    db.connection().execute(
        "DELETE FROM queue_items WHERE session_id = ?1 AND item_type = 'history'",
        [session_id],
    )?;

    // Reset history index
    db.connection().execute(
        "UPDATE sessions SET history_index = -1 WHERE id = ?1",
        [session_id],
    )?;

    Ok(())
}

#[tauri::command]
pub fn queue_move_all_history_to_queue(state: State<'_, AppState>) -> Result<(), CommandError> {
    info!("Moving all history items to queue");
    let db = state.db.lock().map_lock_err()?;
    let conn = db.connection();

    let session_id = get_active_session_id(&db)?;

    // Use transaction for atomicity
    conn.execute("BEGIN IMMEDIATE", [])?;

    let result = (|| -> Result<(), CommandError> {
        // Get the current max position in the queue
        let queue_max_position: i64 = conn.query_row(
            "SELECT COALESCE(MAX(position), -1) FROM queue_items WHERE session_id = ?1 AND item_type = 'queue'",
            [session_id],
            |row| row.get(0),
        )?;

        // Move all history items to queue, preserving their original order.
        // New position = queue_max + 1 + (count of history items with smaller position)
        // This ensures history items maintain their relative order and are appended to the queue.
        conn.execute(
            "UPDATE queue_items
             SET item_type = 'queue',
                 position = ?1 + 1 + (
                     SELECT COUNT(*) FROM queue_items q2
                     WHERE q2.session_id = ?2
                     AND q2.item_type = 'history'
                     AND q2.position < queue_items.position
                 ),
                 played_at = NULL
             WHERE session_id = ?2 AND item_type = 'history'",
            rusqlite::params![queue_max_position, session_id],
        )?;

        // Reset history index since history is now empty
        conn.execute(
            "UPDATE sessions SET history_index = -1 WHERE id = ?1",
            [session_id],
        )?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", [])?;
            info!("Moved all history items to queue");
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn queue_set_history_index(state: State<'_, AppState>, index: i64) -> Result<(), CommandError> {
    debug!("Setting history index to {}", index);
    let db = state.db.lock().map_lock_err()?;

    let session_id = get_active_session_id(&db)?;

    db.connection().execute(
        "UPDATE sessions SET history_index = ?1 WHERE id = ?2",
        rusqlite::params![index, session_id],
    )?;

    Ok(())
}

// ============ Fair Shuffle Command ============

/// Constant for unassigned singer ID
const UNASSIGNED_SINGER_ID: i64 = -1;

/// Pure function that computes fair shuffle order.
/// Takes items as (id, singer_ids) and returns shuffled ids.
///
/// Algorithm: Greedy approach - repeatedly pick the item whose singers are most "due".
/// For duets, we wait until ALL singers are due (use MAX count, not MIN).
/// This ensures a duet with A+B isn't picked right after A just sang.
/// Tie-breaking: 1) earliest singer in appearance order, 2) original queue position.
///
/// Complexity: O(n² × s) where n = items, s = singers per item.
/// Acceptable for typical karaoke queues (<100 items).
fn compute_fair_shuffle_order(items: &[(String, Vec<i64>)]) -> Vec<String> {
    if items.len() <= 1 {
        return items.iter().map(|(id, _)| id.clone()).collect();
    }

    // Track order in which singers first appear (for deterministic tie-breaking)
    let mut singer_order: Vec<i64> = Vec::new();
    let mut seen_singers: std::collections::HashSet<i64> = std::collections::HashSet::new();
    for (_, singer_ids) in items {
        for sid in singer_ids {
            if seen_singers.insert(*sid) {
                singer_order.push(*sid);
            }
        }
    }

    // Track how many songs each singer has been assigned in output so far
    let mut singer_counts: std::collections::HashMap<i64, usize> =
        singer_order.iter().map(|&sid| (sid, 0)).collect();

    let mut remaining: Vec<(String, Vec<i64>, usize)> = items
        .iter()
        .enumerate()
        .map(|(orig_idx, (id, sids))| (id.clone(), sids.clone(), orig_idx))
        .collect();

    let mut shuffled_ids: Vec<String> = Vec::with_capacity(items.len());

    while !remaining.is_empty() {
        // Find the item with the lowest MAX singer count.
        // Using MAX ensures duets are placed when ALL their singers are due,
        // not just when any one of them is due.
        let best_idx = remaining
            .iter()
            .enumerate()
            .min_by(|(_, a), (_, b)| {
                let a_max = a.1.iter().map(|s| *singer_counts.get(s).unwrap_or(&0)).max().unwrap_or(0);
                let b_max = b.1.iter().map(|s| *singer_counts.get(s).unwrap_or(&0)).max().unwrap_or(0);

                a_max.cmp(&b_max)
                    .then_with(|| {
                        // Tie-break: prefer items with lower MIN count (more "due" overall)
                        let a_min = a.1.iter().map(|s| *singer_counts.get(s).unwrap_or(&0)).min().unwrap_or(0);
                        let b_min = b.1.iter().map(|s| *singer_counts.get(s).unwrap_or(&0)).min().unwrap_or(0);
                        a_min.cmp(&b_min)
                    })
                    .then_with(|| {
                        // Tie-break: earliest singer in appearance order
                        let a_earliest = a.1.iter().filter_map(|s| singer_order.iter().position(|x| x == s)).min().unwrap_or(usize::MAX);
                        let b_earliest = b.1.iter().filter_map(|s| singer_order.iter().position(|x| x == s)).min().unwrap_or(usize::MAX);
                        a_earliest.cmp(&b_earliest)
                    })
                    .then_with(|| a.2.cmp(&b.2))
            })
            .map(|(idx, _)| idx)
            .expect("remaining should not be empty during iteration");

        let (id, singer_ids, _) = remaining.remove(best_idx);
        shuffled_ids.push(id);

        for sid in &singer_ids {
            *singer_counts.entry(*sid).or_insert(0) += 1;
        }
    }

    shuffled_ids
}

/// Reorganize queue items into fair round-robin order by singer.
/// Multi-singer items (duets) count as one song for ALL singers involved.
/// Items without singers are treated as "Unassigned" group.
#[tauri::command]
pub fn queue_fair_shuffle(state: State<'_, AppState>) -> Result<(), CommandError> {
    info!("Fair shuffling queue");
    let db = state.db.lock().map_lock_err()?;
    let conn = db.connection();

    let session_id = get_active_session_id(&db)?;

    // Get all queue items with ALL their singer IDs
    let mut stmt = conn.prepare(
        "SELECT qi.id, qi.position,
                (SELECT GROUP_CONCAT(qs.singer_id, ',')
                 FROM queue_singers qs
                 WHERE qs.queue_item_id = qi.id
                 ORDER BY qs.position) as singer_ids
         FROM queue_items qi
         WHERE qi.session_id = ?1 AND qi.item_type = 'queue'
         ORDER BY qi.position",
    )?;

    // Collect items: (id, singer_ids)
    let items: Vec<(String, Vec<i64>)> = stmt
        .query_map([session_id], |row| {
            let id: String = row.get(0)?;
            let singer_ids_str: Option<String> = row.get(2)?;

            // Parse ALL singer IDs
            let singer_ids: Vec<i64> = singer_ids_str
                .map(|s| {
                    s.split(',')
                        .filter_map(|id| id.trim().parse::<i64>().ok())
                        .collect()
                })
                .unwrap_or_default();

            // If no singers, treat as "unassigned" group
            let singer_ids = if singer_ids.is_empty() {
                vec![UNASSIGNED_SINGER_ID]
            } else {
                singer_ids
            };

            Ok((id, singer_ids))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    if items.len() <= 1 {
        debug!("Queue has {} pending items, no shuffle needed", items.len());
        return Ok(());
    }

    // Compute fair shuffle order using extracted algorithm
    let shuffled_ids = compute_fair_shuffle_order(&items);

    // Update positions in database within a transaction
    conn.execute("BEGIN IMMEDIATE", [])?;

    let result = (|| -> Result<(), CommandError> {
        for (new_position, id) in shuffled_ids.iter().enumerate() {
            conn.execute(
                "UPDATE queue_items SET position = ?1 WHERE id = ?2 AND session_id = ?3",
                rusqlite::params![new_position as i64, id, session_id],
            )?;
        }
        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", [])?;
            info!("Fair shuffled {} queue items", shuffled_ids.len());
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

// ============ Fair Queue Position Command ============

/// Pure function that computes the fair insertion position for a new song.
/// Takes the current queue items as (singer_id) and the new singer_id.
/// Returns the position where the new song should be inserted.
///
/// Algorithm (from plan/permanent-shuffle.md):
/// 1. Count how many songs singer X already has in queue: N
/// 2. Iterate through queue, tracking each singer's cumulative song count
/// 3. Find the first position where ALL OTHER singers have sung at least N+1 times
/// 4. Insert X right after that position
/// 5. If round N+1 doesn't exist (queue ends first), append to end
///
/// The key insight: X waits for OTHER singers to have N+1 songs, not for X itself.
/// This ensures X gets their fair turn after others have caught up.
///
/// Examples:
/// - ABCABCABC + X (new, N=0) → round 1 ends at pos 2 → insert at 3 → ABCXABCABC
/// - AAABCABBC + X (new, N=0) → round 1 ends at pos 4 → insert at 5 → AAABCXABBC
/// - ABCXABCABC + X (N=1) → round 2 ends at pos 6 (A,B,C all have 2) → insert at 7
/// - AAA + X (new, N=0) → round 1 ends at pos 0 (only A, A has 1) → insert at 1 → AXAA
fn compute_fair_position(queue_singer_ids: &[i64], new_singer_id: i64) -> usize {
    if queue_singer_ids.is_empty() {
        return 0;
    }

    // Get all unique singers in the queue, EXCLUDING the new singer
    let other_singers: std::collections::HashSet<i64> = queue_singer_ids
        .iter()
        .copied()
        .filter(|&sid| sid != new_singer_id)
        .collect();

    // Count songs per singer in current queue (to find N)
    let mut singer_counts: std::collections::HashMap<i64, usize> = std::collections::HashMap::new();
    for &sid in queue_singer_ids {
        *singer_counts.entry(sid).or_insert(0) += 1;
    }

    // How many songs does the new singer already have? This is N.
    let n = *singer_counts.get(&new_singer_id).unwrap_or(&0);

    // Special case: if no other singers exist, the new singer is alone or first.
    // In this case, insert after the N+1th occurrence of the new singer (if exists),
    // otherwise append.
    if other_singers.is_empty() {
        // Count occurrences of new singer
        let mut count = 0;
        for (pos, &sid) in queue_singer_ids.iter().enumerate() {
            if sid == new_singer_id {
                count += 1;
                if count == n + 1 {
                    // This is the N+1th song of new singer. Insert after.
                    return pos + 1;
                }
            }
        }
        // N+1th song doesn't exist, append
        return queue_singer_ids.len();
    }

    // We need to find where round N+1 completes for OTHER singers.
    // Round N+1 completes when ALL other singers have sung at least N+1 times.
    let mut running_counts: std::collections::HashMap<i64, usize> = std::collections::HashMap::new();

    for (pos, &sid) in queue_singer_ids.iter().enumerate() {
        *running_counts.entry(sid).or_insert(0) += 1;

        // Check if round N+1 is complete for all OTHER singers at this position.
        let round_complete = other_singers
            .iter()
            .all(|singer| running_counts.get(singer).copied().unwrap_or(0) >= n + 1);

        if round_complete {
            // Insert right after this position
            return pos + 1;
        }
    }

    // Round N+1 never completed - append to end
    queue_singer_ids.len()
}

/// Compute the fair insertion position for a new song based on singer rotation.
/// Returns the position (0-indexed) where the new song should be inserted.
///
/// When singer has 0 songs in queue: returns 0 (top)
/// When singer has N songs: returns position after others have had fair turns
#[tauri::command]
pub fn queue_compute_fair_position(
    state: State<'_, AppState>,
    singer_id: Option<i64>,
) -> Result<i32, CommandError> {
    let effective_singer_id = singer_id.unwrap_or(UNASSIGNED_SINGER_ID);
    debug!(
        "Computing fair position for singer_id: {} (effective: {})",
        singer_id.map_or("None".to_string(), |id| id.to_string()),
        effective_singer_id
    );

    let db = state.db.lock().map_lock_err()?;
    let conn = db.connection();

    let session_id = get_active_session_id(&db)?;

    // Get all queue items with their primary singer ID (first singer assigned)
    // For simplicity, we use the first assigned singer; for duets we could use MAX
    let mut stmt = conn.prepare(
        "SELECT qi.id,
                (SELECT qs.singer_id
                 FROM queue_singers qs
                 WHERE qs.queue_item_id = qi.id
                 ORDER BY qs.position
                 LIMIT 1) as singer_id
         FROM queue_items qi
         WHERE qi.session_id = ?1 AND qi.item_type = 'queue'
         ORDER BY qi.position",
    )?;

    let queue_singer_ids: Vec<i64> = stmt
        .query_map([session_id], |row| {
            let singer_id: Option<i64> = row.get(1)?;
            Ok(singer_id.unwrap_or(UNASSIGNED_SINGER_ID))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let position = compute_fair_position(&queue_singer_ids, effective_singer_id);

    info!(
        "Computed fair position {} for singer {} (queue has {} items)",
        position,
        effective_singer_id,
        queue_singer_ids.len()
    );

    // Safe conversion from usize to i32
    let position_i32: i32 = position.try_into().map_err(|_| {
        CommandError::Validation(format!(
            "Fair position {} exceeds i32::MAX, queue too large",
            position
        ))
    })?;

    Ok(position_i32)
}

// ============ State Recovery Commands ============

#[tauri::command]
pub fn queue_get_state(state: State<'_, AppState>) -> Result<Option<QueueState>, CommandError> {
    debug!("Getting queue state");
    let db = state.db.lock().map_lock_err()?;

    // Get active session
    let session_result = db.connection().query_row(
        "SELECT id, history_index FROM sessions WHERE is_active = 1",
        [],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
    );

    let (session_id, history_index) = match session_result {
        Ok(result) => result,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(CommandError::Database(e)),
    };

    // Get queue items
    let mut stmt = db.connection().prepare(
        "SELECT id, video_id, title, artist, duration, thumbnail_url, source, youtube_id, file_path, position, added_at, played_at
             FROM queue_items
             WHERE session_id = ?1 AND item_type = 'queue'
             ORDER BY position",
    )?;

    let queue = stmt
        .query_map([session_id], |row| {
            Ok(QueueItemData {
                id: row.get(0)?,
                video_id: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                duration: row.get(4)?,
                thumbnail_url: row.get(5)?,
                source: row.get(6)?,
                youtube_id: row.get(7)?,
                file_path: row.get(8)?,
                position: row.get(9)?,
                added_at: row.get(10)?,
                played_at: row.get(11)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    // Get history items
    let mut stmt = db.connection().prepare(
        "SELECT id, video_id, title, artist, duration, thumbnail_url, source, youtube_id, file_path, position, added_at, played_at
             FROM queue_items
             WHERE session_id = ?1 AND item_type = 'history'
             ORDER BY position",
    )?;

    let history = stmt
        .query_map([session_id], |row| {
            Ok(QueueItemData {
                id: row.get(0)?,
                video_id: row.get(1)?,
                title: row.get(2)?,
                artist: row.get(3)?,
                duration: row.get(4)?,
                thumbnail_url: row.get(5)?,
                source: row.get(6)?,
                youtube_id: row.get(7)?,
                file_path: row.get(8)?,
                position: row.get(9)?,
                added_at: row.get(10)?,
                played_at: row.get(11)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    info!(
        "Loaded queue state: {} queue items, {} history items",
        queue.len(),
        history.len()
    );

    Ok(Some(QueueState {
        queue,
        history,
        history_index,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Helper to create test items with simple string IDs
    fn items(specs: &[(&str, &[i64])]) -> Vec<(String, Vec<i64>)> {
        specs
            .iter()
            .map(|(id, singers)| (id.to_string(), singers.to_vec()))
            .collect()
    }

    /// Helper to extract IDs from result
    fn ids(result: &[String]) -> Vec<&str> {
        result.iter().map(|s| s.as_str()).collect()
    }

    #[test]
    fn test_empty_queue() {
        let items = items(&[]);
        let result = compute_fair_shuffle_order(&items);
        assert!(result.is_empty());
    }

    #[test]
    fn test_single_item() {
        let items = items(&[("a", &[1])]);
        let result = compute_fair_shuffle_order(&items);
        assert_eq!(ids(&result), vec!["a"]);
    }

    #[test]
    fn test_two_singers_interleaved() {
        // A, A, B, B -> A, B, A, B
        let items = items(&[("a1", &[1]), ("a2", &[1]), ("b1", &[2]), ("b2", &[2])]);
        let result = compute_fair_shuffle_order(&items);
        assert_eq!(ids(&result), vec!["a1", "b1", "a2", "b2"]);
    }

    #[test]
    fn test_uneven_distribution() {
        // A has 4, B has 2 -> A, B, A, B, A, A
        let items = items(&[
            ("a1", &[1]),
            ("a2", &[1]),
            ("a3", &[1]),
            ("a4", &[1]),
            ("b1", &[2]),
            ("b2", &[2]),
        ]);
        let result = compute_fair_shuffle_order(&items);
        assert_eq!(ids(&result), vec!["a1", "b1", "a2", "b2", "a3", "a4"]);
    }

    #[test]
    fn test_duet_counts_for_both_singers() {
        // A, P, AP, P, A, PT -> A, P, PT, A, AP, P
        // PT comes early because T hasn't sung yet (max count = 0)
        // After PT, a2 (solo A, max=1) beats ap (duet A+P, max=2) because
        // duets wait until ALL their singers are due
        let items = items(&[
            ("a1", &[1]),      // A
            ("p1", &[2]),      // P
            ("ap", &[1, 2]),   // AP (duet)
            ("p2", &[2]),      // P
            ("a2", &[1]),      // A
            ("pt", &[2, 3]),   // PT (duet with new singer T)
        ]);
        let result = compute_fair_shuffle_order(&items);
        assert_eq!(ids(&result), vec!["a1", "p1", "pt", "a2", "ap", "p2"]);
    }

    #[test]
    fn test_all_same_singer() {
        // All same singer - should preserve original order
        let items = items(&[("a1", &[1]), ("a2", &[1]), ("a3", &[1])]);
        let result = compute_fair_shuffle_order(&items);
        assert_eq!(ids(&result), vec!["a1", "a2", "a3"]);
    }

    #[test]
    fn test_unassigned_songs() {
        // Mix of assigned and unassigned
        let items = items(&[
            ("a1", &[1]),
            ("u1", &[UNASSIGNED_SINGER_ID]),
            ("b1", &[2]),
            ("u2", &[UNASSIGNED_SINGER_ID]),
        ]);
        let result = compute_fair_shuffle_order(&items);
        // Should interleave: A, unassigned, B, unassigned
        assert_eq!(ids(&result), vec!["a1", "u1", "b1", "u2"]);
    }

    #[test]
    fn test_three_singers_round_robin() {
        // A, B, C each have 2 songs
        let items = items(&[
            ("a1", &[1]),
            ("a2", &[1]),
            ("b1", &[2]),
            ("b2", &[2]),
            ("c1", &[3]),
            ("c2", &[3]),
        ]);
        let result = compute_fair_shuffle_order(&items);
        assert_eq!(ids(&result), vec!["a1", "b1", "c1", "a2", "b2", "c2"]);
    }

    #[test]
    fn test_deterministic_with_same_input() {
        // Running twice should give same result
        let items = items(&[
            ("a1", &[1]),
            ("b1", &[2]),
            ("a2", &[1]),
            ("c1", &[3]),
        ]);
        let result1 = compute_fair_shuffle_order(&items);
        let result2 = compute_fair_shuffle_order(&items);
        assert_eq!(result1, result2);
    }

    #[test]
    fn test_singer_appearance_order_tiebreak() {
        // When counts are tied, earlier-appearing singer wins
        // A appears first, B second - both have 1 song
        let items = items(&[("a1", &[1]), ("b1", &[2])]);
        let result = compute_fair_shuffle_order(&items);
        assert_eq!(ids(&result), vec!["a1", "b1"]);
    }

    #[test]
    fn test_original_position_tiebreak() {
        // Same singer, same count - original position wins
        let items = items(&[("first", &[1]), ("second", &[1])]);
        let result = compute_fair_shuffle_order(&items);
        assert_eq!(ids(&result), vec!["first", "second"]);
    }

    // ============ Tests for compute_fair_position ============
    // Based on algorithm from plan/permanent-shuffle.md:
    // Insert new song after all singers have sung at least N+1 times,
    // where N = singer's current song count.

    #[test]
    fn test_fair_position_empty_queue() {
        // Empty queue -> position 0
        let queue: Vec<i64> = vec![];
        assert_eq!(compute_fair_position(&queue, 1), 0);
    }

    #[test]
    fn test_fair_position_example_abcabcabc_new_x() {
        // ABCABCABC + X (new, N=0) → round 1 ends at pos 2 → insert at 3
        // Result: ABCXABCABC
        let queue = vec![1, 2, 3, 1, 2, 3, 1, 2, 3]; // A=1, B=2, C=3
        assert_eq!(compute_fair_position(&queue, 4), 3); // X=4 is new
    }

    #[test]
    fn test_fair_position_example_aaabcabbc_new_x() {
        // AAABCABBC + X (new, N=0) → round 1 ends at pos 4 → insert at 5
        // Result: AAABCXABBC
        let queue = vec![1, 1, 1, 2, 3, 1, 2, 2, 3]; // A=1, B=2, C=3
        assert_eq!(compute_fair_position(&queue, 4), 5); // X=4 is new
    }

    #[test]
    fn test_fair_position_example_abcadab_new_x() {
        // ABCADAB + X (new, N=0) → round 1 ends at pos 4 (D) → insert at 5
        // Result: ABCADXAB
        let queue = vec![1, 2, 3, 1, 4, 1, 2]; // A=1, B=2, C=3, D=4
        assert_eq!(compute_fair_position(&queue, 5), 5); // X=5 is new
    }

    #[test]
    fn test_fair_position_example_abcxabcabc_x_has_1() {
        // ABCXABCABC + X (N=1) → round 2 ends at pos 6 → insert at 7
        // Result: ABCXABCXABC
        let queue = vec![1, 2, 3, 4, 1, 2, 3, 1, 2, 3]; // A=1, B=2, C=3, X=4
        assert_eq!(compute_fair_position(&queue, 4), 7); // X=4 has 1 song
    }

    #[test]
    fn test_fair_position_example_abxabx_x_has_2() {
        // ABXABX + X (N=2) → round 3 doesn't exist → append to end
        // Result: ABXABXX
        let queue = vec![1, 2, 3, 1, 2, 3]; // A=1, B=2, X=3
        assert_eq!(compute_fair_position(&queue, 3), 6); // X=3 has 2 songs, append
    }

    #[test]
    fn test_fair_position_example_aaa_new_x() {
        // AAA + X (new, N=0) → round 1 ends at pos 0 → insert at 1
        // Result: AXAA
        let queue = vec![1, 1, 1]; // A=1
        assert_eq!(compute_fair_position(&queue, 2), 1); // X=2 is new
    }

    #[test]
    fn test_fair_position_unassigned_new() {
        // Unassigned singer (id = -1) in empty queue
        let queue: Vec<i64> = vec![];
        assert_eq!(compute_fair_position(&queue, UNASSIGNED_SINGER_ID), 0);
    }

    #[test]
    fn test_fair_position_unassigned_mixed() {
        // A, U, B - unassigned has 1, others have 1 each
        // New unassigned: N=1, need round 2 to complete
        // Round 2 requires A:2, U:2, B:2 - doesn't exist, append
        let queue = vec![1, UNASSIGNED_SINGER_ID, 2]; // A=1, U=-1, B=2
        assert_eq!(compute_fair_position(&queue, UNASSIGNED_SINGER_ID), 3);
    }

    #[test]
    fn test_fair_position_single_singer_adding_more() {
        // A with 1 song, adding another A
        // N=1, need round 2 (all singers have 2). Only A exists, round 2 ends at pos 1.
        // But wait - there's only 1 A, so round 2 never completes. Append.
        let queue = vec![1]; // A=1 with 1 song
        assert_eq!(compute_fair_position(&queue, 1), 1); // Append
    }

    #[test]
    fn test_fair_position_single_singer_multiple_songs() {
        // A has 2 songs [A, A], adding another A
        // N=2, need round 3 (all have 3). Only A exists.
        // With only one singer, new song should append after existing songs.
        let queue = vec![1, 1]; // A=1 with 2 songs
        assert_eq!(compute_fair_position(&queue, 1), 2); // Append after both

        // A has 3 songs, adding 4th
        let queue = vec![1, 1, 1];
        assert_eq!(compute_fair_position(&queue, 1), 3); // Append
    }

    #[test]
    fn test_fair_position_two_singers_balanced() {
        // A, B - each has 1
        // Adding A: N=1, need round 2 to complete (all have 2)
        // Round 2 never exists with current queue, append
        let queue = vec![1, 2]; // A, B each have 1
        assert_eq!(compute_fair_position(&queue, 1), 2); // Append
    }

    #[test]
    fn test_fair_position_two_singers_interleaved() {
        // A, B, A, B - each has 2
        // Adding A: N=2, need round 3 (all have 3)
        // Round 3 doesn't exist, append
        let queue = vec![1, 2, 1, 2]; // A, B interleaved
        assert_eq!(compute_fair_position(&queue, 1), 4); // Append
    }

    #[test]
    fn test_fair_position_complex_scenario() {
        // A has 3, B has 2, C has 1
        // Queue: A, B, A, C, B, A (positions 0-5)
        let queue = vec![1, 2, 1, 3, 2, 1]; // A=1, B=2, C=3

        // Adding A: N=3, need OTHER singers (B,C) to have 4 songs each.
        // B only has 2 total, C only has 1 total. Round 4 never completes. Append = 6.
        assert_eq!(compute_fair_position(&queue, 1), 6);

        // Adding B: N=2, need OTHER singers (A,C) to have 3 songs each.
        // A reaches 3 at pos 5, but C only ever has 1. Round 3 never completes. Append = 6.
        assert_eq!(compute_fair_position(&queue, 2), 6);

        // Adding C: N=1, need OTHER singers (A,B) to have 2 songs each.
        // At pos 4 (B's second song), running counts: A:2, B:2, C:1. Round 2 complete. Insert at 5.
        assert_eq!(compute_fair_position(&queue, 3), 5);

        // Adding new singer D: N=0, need OTHER singers (A,B,C) to have 1 song each.
        // At pos 3 (C's first song), running counts: A:2, B:1, C:1. All have >=1. Insert at 4.
        assert_eq!(compute_fair_position(&queue, 4), 4);
    }

    #[test]
    fn test_fair_position_prd003_examples() {
        // From PRD-003 verification steps:

        // ABCABCABC + X (new) → ABCXABCABC (insert at pos 3, after round 1)
        let queue1 = vec![1, 2, 3, 1, 2, 3, 1, 2, 3];
        assert_eq!(compute_fair_position(&queue1, 4), 3);

        // AAABCABBC + X (new) → AAABCXABBC (insert at pos 5, after C completes round 1)
        let queue2 = vec![1, 1, 1, 2, 3, 1, 2, 2, 3];
        assert_eq!(compute_fair_position(&queue2, 4), 5);

        // ABCXABCABC + X (has 1) → ABCXABCXABC (insert at pos 7, after round 2)
        let queue3 = vec![1, 2, 3, 4, 1, 2, 3, 1, 2, 3];
        assert_eq!(compute_fair_position(&queue3, 4), 7);

        // ABXABX + X (has 2) → ABXABXX (append, round 3 doesn't exist)
        let queue4 = vec![1, 2, 3, 1, 2, 3];
        assert_eq!(compute_fair_position(&queue4, 3), 6);

        // AAA + X (new) → AXAA (insert at pos 1, after A completes round 1)
        let queue5 = vec![1, 1, 1];
        assert_eq!(compute_fair_position(&queue5, 2), 1);
    }

    #[test]
    fn test_fair_position_unassigned_as_separate_group() {
        // Unassigned songs treated as separate group
        // Empty queue
        let queue: Vec<i64> = vec![];
        assert_eq!(compute_fair_position(&queue, UNASSIGNED_SINGER_ID), 0);

        // All unassigned: UUU + U (N=3)
        // No OTHER singers exist, so we use special case: find N+1=4th occurrence.
        // Only 3 unassigned songs exist, so append = 3.
        let queue_all_unassigned = vec![UNASSIGNED_SINGER_ID, UNASSIGNED_SINGER_ID, UNASSIGNED_SINGER_ID];
        assert_eq!(compute_fair_position(&queue_all_unassigned, UNASSIGNED_SINGER_ID), 3);
    }
}
