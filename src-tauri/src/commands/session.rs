use crate::AppState;
use log::{debug, info};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Singer {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub is_persistent: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: i64,
    pub name: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub is_active: bool,
}

// ============ Singer Commands ============

const MAX_NAME_LENGTH: usize = 100;

#[tauri::command]
pub fn create_singer(
    state: State<'_, AppState>,
    name: String,
    color: String,
    is_persistent: bool,
) -> Result<Singer, String> {
    // Input validation
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Singer name cannot be empty".to_string());
    }
    if name.len() > MAX_NAME_LENGTH {
        return Err(format!("Singer name cannot exceed {} characters", MAX_NAME_LENGTH));
    }

    debug!("Creating singer: {} with color {}", name, color);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    db.connection()
        .execute(
            "INSERT INTO singers (name, color, is_persistent) VALUES (?1, ?2, ?3)",
            rusqlite::params![name, color, is_persistent],
        )
        .map_err(|e| e.to_string())?;

    let id = db.connection().last_insert_rowid();
    info!("Created singer: {} (id: {})", name, id);

    Ok(Singer {
        id,
        name,
        color,
        is_persistent,
    })
}

#[tauri::command]
pub fn get_singers(state: State<'_, AppState>) -> Result<Vec<Singer>, String> {
    debug!("Getting all singers");
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db
        .connection()
        .prepare("SELECT id, name, color, is_persistent FROM singers ORDER BY name")
        .map_err(|e| e.to_string())?;

    let singers = stmt
        .query_map([], |row| {
            Ok(Singer {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                is_persistent: row.get::<_, i32>(3)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(singers)
}

#[tauri::command]
pub fn delete_singer(state: State<'_, AppState>, singer_id: i64) -> Result<(), String> {
    info!("Deleting singer: {}", singer_id);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    db.connection()
        .execute("DELETE FROM singers WHERE id = ?1", [singer_id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============ Session Commands ============

#[tauri::command]
pub fn start_session(state: State<'_, AppState>, name: Option<String>) -> Result<Session, String> {
    // Input validation - trim and validate name if provided
    let name = name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    if let Some(ref n) = name {
        if n.len() > MAX_NAME_LENGTH {
            return Err(format!("Session name cannot exceed {} characters", MAX_NAME_LENGTH));
        }
    }

    info!("Starting new session: {:?}", name);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // End any active sessions first
    db.connection()
        .execute(
            "UPDATE sessions SET is_active = 0, ended_at = CURRENT_TIMESTAMP WHERE is_active = 1",
            [],
        )
        .map_err(|e| e.to_string())?;

    // Create new session
    db.connection()
        .execute(
            "INSERT INTO sessions (name, is_active) VALUES (?1, 1)",
            [&name],
        )
        .map_err(|e| e.to_string())?;

    let id = db.connection().last_insert_rowid();

    let session = db
        .connection()
        .query_row(
            "SELECT id, name, started_at, ended_at, is_active FROM sessions WHERE id = ?1",
            [id],
            |row| {
                Ok(Session {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    started_at: row.get(2)?,
                    ended_at: row.get(3)?,
                    is_active: row.get::<_, i32>(4)? != 0,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    info!("Session started: id={}", id);
    Ok(session)
}

#[tauri::command]
pub fn end_session(state: State<'_, AppState>) -> Result<(), String> {
    info!("Ending active session");
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Get the active session ID first
    let session_id: Option<i64> = db.connection()
        .query_row(
            "SELECT id FROM sessions WHERE is_active = 1",
            [],
            |row| row.get(0),
        )
        .ok();

    if let Some(session_id) = session_id {
        // Check if session has any content (queue items, history, or singers)
        let has_content: bool = db.connection()
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM queue_items WHERE session_id = ?1
                    UNION
                    SELECT 1 FROM session_singers WHERE session_id = ?1
                )",
                [session_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        if has_content {
            // Session has content - just mark as inactive
            db.connection()
                .execute(
                    "UPDATE sessions SET is_active = 0, ended_at = CURRENT_TIMESTAMP WHERE id = ?1",
                    [session_id],
                )
                .map_err(|e| e.to_string())?;
            info!("Session {} archived (has content)", session_id);
        } else {
            // Session is empty - delete it entirely
            db.connection()
                .execute("DELETE FROM sessions WHERE id = ?1", [session_id])
                .map_err(|e| e.to_string())?;
            info!("Session {} deleted (was empty)", session_id);
        }
    }

    // Clean up non-persistent singers that aren't associated with any session
    db.connection()
        .execute(
            "DELETE FROM singers WHERE is_persistent = 0 AND id NOT IN (SELECT singer_id FROM session_singers)",
            [],
        )
        .map_err(|e| e.to_string())?;

    // Clear queue singer assignments (for non-persistent data)
    db.connection()
        .execute("DELETE FROM queue_singers WHERE queue_item_id NOT IN (SELECT id FROM queue_items)", [])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_active_session(state: State<'_, AppState>) -> Result<Option<Session>, String> {
    debug!("Getting active session");
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let result = db.connection().query_row(
        "SELECT id, name, started_at, ended_at, is_active FROM sessions WHERE is_active = 1",
        [],
        |row| {
            Ok(Session {
                id: row.get(0)?,
                name: row.get(1)?,
                started_at: row.get(2)?,
                ended_at: row.get(3)?,
                is_active: row.get::<_, i32>(4)? != 0,
            })
        },
    );

    match result {
        Ok(session) => Ok(Some(session)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

// ============ Session Singer Commands ============

#[tauri::command]
pub fn add_singer_to_session(
    state: State<'_, AppState>,
    session_id: i64,
    singer_id: i64,
) -> Result<(), String> {
    debug!("Adding singer {} to session {}", singer_id, session_id);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    db.connection()
        .execute(
            "INSERT OR IGNORE INTO session_singers (session_id, singer_id) VALUES (?1, ?2)",
            [session_id, singer_id],
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_session_singers(state: State<'_, AppState>, session_id: i64) -> Result<Vec<Singer>, String> {
    debug!("Getting singers for session {}", session_id);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db
        .connection()
        .prepare(
            "SELECT s.id, s.name, s.color, s.is_persistent
             FROM singers s
             INNER JOIN session_singers ss ON s.id = ss.singer_id
             WHERE ss.session_id = ?1
             ORDER BY ss.joined_at",
        )
        .map_err(|e| e.to_string())?;

    let singers = stmt
        .query_map([session_id], |row| {
            Ok(Singer {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                is_persistent: row.get::<_, i32>(3)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(singers)
}

// ============ Queue Singer Assignment Commands ============

#[tauri::command]
pub fn assign_singer_to_queue_item(
    state: State<'_, AppState>,
    queue_item_id: String,
    singer_id: i64,
) -> Result<(), String> {
    debug!("Assigning singer {} to queue item {}", singer_id, queue_item_id);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Get next position for this queue item
    let position: i32 = db
        .connection()
        .query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM queue_singers WHERE queue_item_id = ?1",
            [&queue_item_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    db.connection()
        .execute(
            "INSERT INTO queue_singers (queue_item_id, singer_id, position) VALUES (?1, ?2, ?3)",
            rusqlite::params![queue_item_id, singer_id, position],
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn remove_singer_from_queue_item(
    state: State<'_, AppState>,
    queue_item_id: String,
    singer_id: i64,
) -> Result<(), String> {
    debug!("Removing singer {} from queue item {}", singer_id, queue_item_id);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    db.connection()
        .execute(
            "DELETE FROM queue_singers WHERE queue_item_id = ?1 AND singer_id = ?2",
            rusqlite::params![queue_item_id, singer_id],
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_queue_item_singers(
    state: State<'_, AppState>,
    queue_item_id: String,
) -> Result<Vec<Singer>, String> {
    debug!("Getting singers for queue item {}", queue_item_id);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db
        .connection()
        .prepare(
            "SELECT s.id, s.name, s.color, s.is_persistent
             FROM singers s
             INNER JOIN queue_singers qs ON s.id = qs.singer_id
             WHERE qs.queue_item_id = ?1
             ORDER BY qs.position",
        )
        .map_err(|e| e.to_string())?;

    let singers = stmt
        .query_map([&queue_item_id], |row| {
            Ok(Singer {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                is_persistent: row.get::<_, i32>(3)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(singers)
}

#[tauri::command]
pub fn clear_queue_item_singers(
    state: State<'_, AppState>,
    queue_item_id: String,
) -> Result<(), String> {
    debug!("Clearing singers from queue item {}", queue_item_id);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    db.connection()
        .execute(
            "DELETE FROM queue_singers WHERE queue_item_id = ?1",
            [&queue_item_id],
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

// ============ Session Management Commands ============

#[tauri::command]
pub fn get_recent_sessions(
    state: State<'_, AppState>,
    limit: Option<i32>,
) -> Result<Vec<Session>, String> {
    let limit = limit.unwrap_or(10);
    debug!("Getting recent sessions (limit: {})", limit);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db
        .connection()
        .prepare(
            "SELECT id, name, started_at, ended_at, is_active FROM sessions
             ORDER BY started_at DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let sessions = stmt
        .query_map([limit], |row| {
            Ok(Session {
                id: row.get(0)?,
                name: row.get(1)?,
                started_at: row.get(2)?,
                ended_at: row.get(3)?,
                is_active: row.get::<_, i32>(4)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(sessions)
}

#[tauri::command]
pub fn rename_session(
    state: State<'_, AppState>,
    session_id: i64,
    name: String,
) -> Result<Session, String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err("Session name cannot be empty".to_string());
    }
    if name.len() > MAX_NAME_LENGTH {
        return Err(format!("Session name cannot exceed {} characters", MAX_NAME_LENGTH));
    }

    info!("Renaming session {} to: {}", session_id, name);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    db.connection()
        .execute(
            "UPDATE sessions SET name = ?1 WHERE id = ?2",
            rusqlite::params![name, session_id],
        )
        .map_err(|e| e.to_string())?;

    let session = db
        .connection()
        .query_row(
            "SELECT id, name, started_at, ended_at, is_active FROM sessions WHERE id = ?1",
            [session_id],
            |row| {
                Ok(Session {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    started_at: row.get(2)?,
                    ended_at: row.get(3)?,
                    is_active: row.get::<_, i32>(4)? != 0,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    Ok(session)
}

#[tauri::command]
pub fn delete_session(state: State<'_, AppState>, session_id: i64) -> Result<(), String> {
    info!("Deleting session: {}", session_id);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Don't allow deleting the active session
    let is_active: bool = db
        .connection()
        .query_row(
            "SELECT is_active FROM sessions WHERE id = ?1",
            [session_id],
            |row| row.get::<_, i32>(0).map(|v| v != 0),
        )
        .unwrap_or(false);

    if is_active {
        return Err("Cannot delete the active session".to_string());
    }

    // Delete session (cascade will handle queue_items and session_singers)
    db.connection()
        .execute("DELETE FROM sessions WHERE id = ?1", [session_id])
        .map_err(|e| e.to_string())?;

    info!("Session {} deleted", session_id);
    Ok(())
}

#[tauri::command]
pub fn load_session(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<Session, String> {
    info!("Loading session: {}", session_id);
    let db = state.db.lock().map_err(|e| e.to_string())?;

    // End any active session first
    db.connection()
        .execute(
            "UPDATE sessions SET is_active = 0, ended_at = CURRENT_TIMESTAMP WHERE is_active = 1",
            [],
        )
        .map_err(|e| e.to_string())?;

    // Activate the selected session
    db.connection()
        .execute(
            "UPDATE sessions SET is_active = 1, ended_at = NULL WHERE id = ?1",
            [session_id],
        )
        .map_err(|e| e.to_string())?;

    let session = db
        .connection()
        .query_row(
            "SELECT id, name, started_at, ended_at, is_active FROM sessions WHERE id = ?1",
            [session_id],
            |row| {
                Ok(Session {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    started_at: row.get(2)?,
                    ended_at: row.get(3)?,
                    is_active: row.get::<_, i32>(4)? != 0,
                })
            },
        )
        .map_err(|e| e.to_string())?;

    info!("Session {} loaded and activated", session_id);
    Ok(session)
}
