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

fn get_active_session_id(db: &crate::db::Database) -> Result<i64, String> {
    db.connection()
        .query_row(
            "SELECT id FROM sessions WHERE is_active = 1",
            [],
            |row| row.get(0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => "No active session".to_string(),
            _ => e.to_string(),
        })
}

fn reorder_positions(db: &crate::db::Database, session_id: i64, item_type: &str) -> Result<(), String> {
    // Validate item_type to prevent unexpected values
    if item_type != "queue" && item_type != "history" {
        return Err(format!("Invalid item_type: {}", item_type));
    }

    // Re-number positions sequentially starting from 0
    db.connection()
        .execute(
            "UPDATE queue_items SET position = (
                SELECT COUNT(*) FROM queue_items q2
                WHERE q2.session_id = queue_items.session_id
                AND q2.item_type = queue_items.item_type
                AND q2.rowid < queue_items.rowid
            )
            WHERE session_id = ?1 AND item_type = ?2",
            rusqlite::params![session_id, item_type],
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ============ Queue Commands ============

#[tauri::command]
pub fn queue_add_item(state: State<'_, AppState>, item: QueueItemData) -> Result<(), String> {
    debug!("Adding item to queue: {} - {}", item.id, item.title);
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.connection();

    let session_id = get_active_session_id(&db)?;

    // Use transaction for atomicity (prevent duplicate positions)
    conn.execute("BEGIN IMMEDIATE", [])
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<i64, String> {
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
        )
        .map_err(|e| e.to_string())?;

        Ok(position)
    })();

    match result {
        Ok(position) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
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
pub fn queue_remove_item(state: State<'_, AppState>, item_id: String) -> Result<(), String> {
    debug!("Removing item from queue: {}", item_id);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let session_id = get_active_session_id(&db)?;

    db.connection()
        .execute(
            "DELETE FROM queue_items WHERE id = ?1 AND session_id = ?2 AND item_type = 'queue'",
            rusqlite::params![item_id, session_id],
        )
        .map_err(|e| e.to_string())?;

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
) -> Result<(), String> {
    // Validate new_position is not negative
    if new_position < 0 {
        return Err("Position cannot be negative".to_string());
    }

    debug!("Reordering queue item {} to position {}", item_id, new_position);
    let db = state.db.lock().map_err(|e| e.to_string())?;
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
        return Err(format!("Position {} is out of bounds (max: {})", new_position, max_position));
    }

    // Get current position
    let current_position: i64 = conn
        .query_row(
            "SELECT position FROM queue_items WHERE id = ?1 AND session_id = ?2 AND item_type = 'queue'",
            rusqlite::params![item_id, session_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if current_position == new_position {
        return Ok(());
    }

    // Use transaction for atomicity
    conn.execute("BEGIN IMMEDIATE", [])
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // Shift items between old and new positions
        if new_position < current_position {
            // Moving up: shift items down
            conn.execute(
                "UPDATE queue_items SET position = position + 1
                 WHERE session_id = ?1 AND item_type = 'queue'
                 AND position >= ?2 AND position < ?3",
                rusqlite::params![session_id, new_position, current_position],
            )
            .map_err(|e| e.to_string())?;
        } else {
            // Moving down: shift items up
            conn.execute(
                "UPDATE queue_items SET position = position - 1
                 WHERE session_id = ?1 AND item_type = 'queue'
                 AND position > ?2 AND position <= ?3",
                rusqlite::params![session_id, current_position, new_position],
            )
            .map_err(|e| e.to_string())?;
        }

        // Set new position for the item
        conn.execute(
            "UPDATE queue_items SET position = ?1 WHERE id = ?2",
            rusqlite::params![new_position, item_id],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            info!("Reordered queue item {} to position {}", item_id, new_position);
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn queue_clear(state: State<'_, AppState>) -> Result<(), String> {
    info!("Clearing queue");
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let session_id = get_active_session_id(&db)?;

    db.connection()
        .execute(
            "DELETE FROM queue_items WHERE session_id = ?1 AND item_type = 'queue'",
            [session_id],
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============ History Commands ============

#[tauri::command]
pub fn queue_move_to_history(state: State<'_, AppState>, item_id: String) -> Result<(), String> {
    debug!("Moving item to history: {}", item_id);
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.connection();

    let session_id = get_active_session_id(&db)?;

    // Use transaction for atomicity
    conn.execute("BEGIN IMMEDIATE", [])
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // Get next history position
        let history_position: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM queue_items WHERE session_id = ?1 AND item_type = 'history'",
                [session_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        // Update item type and set played_at
        conn.execute(
            "UPDATE queue_items SET item_type = 'history', position = ?1, played_at = datetime('now')
             WHERE id = ?2 AND session_id = ?3",
            rusqlite::params![history_position, item_id, session_id],
        )
        .map_err(|e| e.to_string())?;

        // Reorder remaining queue items
        reorder_positions(&db, session_id, "queue")?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
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
pub fn queue_add_to_history(state: State<'_, AppState>, item: QueueItemData) -> Result<(), String> {
    debug!("Adding item directly to history: {} - {}", item.id, item.title);
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.connection();

    let session_id = get_active_session_id(&db)?;

    // Use transaction for atomicity (prevent duplicate positions)
    conn.execute("BEGIN IMMEDIATE", [])
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<i64, String> {
        // Get next history position
        let position: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM queue_items WHERE session_id = ?1 AND item_type = 'history'",
                [session_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

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
        )
        .map_err(|e| e.to_string())?;

        Ok(position)
    })();

    match result {
        Ok(position) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
            info!("Added item directly to history: {} at position {}", item.id, position);
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn queue_clear_history(state: State<'_, AppState>) -> Result<(), String> {
    info!("Clearing history");
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let session_id = get_active_session_id(&db)?;

    db.connection()
        .execute(
            "DELETE FROM queue_items WHERE session_id = ?1 AND item_type = 'history'",
            [session_id],
        )
        .map_err(|e| e.to_string())?;

    // Reset history index
    db.connection()
        .execute(
            "UPDATE sessions SET history_index = -1 WHERE id = ?1",
            [session_id],
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn queue_move_all_history_to_queue(state: State<'_, AppState>) -> Result<(), String> {
    info!("Moving all history items to queue");
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let conn = db.connection();

    let session_id = get_active_session_id(&db)?;

    // Use transaction for atomicity
    conn.execute("BEGIN IMMEDIATE", [])
        .map_err(|e| e.to_string())?;

    let result = (|| -> Result<(), String> {
        // Get the current max position in the queue
        let queue_max_position: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(position), -1) FROM queue_items WHERE session_id = ?1 AND item_type = 'queue'",
                [session_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

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
        )
        .map_err(|e| e.to_string())?;

        // Reset history index since history is now empty
        conn.execute(
            "UPDATE sessions SET history_index = -1 WHERE id = ?1",
            [session_id],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", []).map_err(|e| e.to_string())?;
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
pub fn queue_set_history_index(state: State<'_, AppState>, index: i64) -> Result<(), String> {
    debug!("Setting history index to {}", index);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let session_id = get_active_session_id(&db)?;

    db.connection()
        .execute(
            "UPDATE sessions SET history_index = ?1 WHERE id = ?2",
            rusqlite::params![index, session_id],
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============ State Recovery Commands ============

#[tauri::command]
pub fn queue_get_state(state: State<'_, AppState>) -> Result<Option<QueueState>, String> {
    debug!("Getting queue state");
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Get active session
    let session_result = db.connection().query_row(
        "SELECT id, history_index FROM sessions WHERE is_active = 1",
        [],
        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
    );

    let (session_id, history_index) = match session_result {
        Ok(result) => result,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(e) => return Err(e.to_string()),
    };

    // Get queue items
    let mut stmt = db
        .connection()
        .prepare(
            "SELECT id, video_id, title, artist, duration, thumbnail_url, source, youtube_id, file_path, position, added_at, played_at
             FROM queue_items
             WHERE session_id = ?1 AND item_type = 'queue'
             ORDER BY position",
        )
        .map_err(|e| e.to_string())?;

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
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Get history items
    let mut stmt = db
        .connection()
        .prepare(
            "SELECT id, video_id, title, artist, duration, thumbnail_url, source, youtube_id, file_path, position, added_at, played_at
             FROM queue_items
             WHERE session_id = ?1 AND item_type = 'history'
             ORDER BY position",
        )
        .map_err(|e| e.to_string())?;

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
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    info!("Loaded queue state: {} queue items, {} history items", queue.len(), history.len());

    Ok(Some(QueueState {
        queue,
        history,
        history_index,
    }))
}
