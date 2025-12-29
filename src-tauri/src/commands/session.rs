use super::errors::{CommandError, LockResultExt};
use crate::AppState;
use log::{debug, info};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Singer {
    pub id: i64,
    pub name: String,
    pub unique_name: Option<String>,
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
    unique_name: Option<String>,
) -> Result<Singer, CommandError> {
    // Input validation
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(CommandError::Validation(
            "Singer name cannot be empty".to_string(),
        ));
    }
    if name.len() > MAX_NAME_LENGTH {
        return Err(CommandError::Validation(format!(
            "Singer name cannot exceed {} characters",
            MAX_NAME_LENGTH
        )));
    }

    // Validate and normalize unique_name
    let unique_name = unique_name
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty());
    if let Some(ref un) = unique_name {
        if un.len() > MAX_NAME_LENGTH {
            return Err(CommandError::Validation(format!(
                "Unique name cannot exceed {} characters",
                MAX_NAME_LENGTH
            )));
        }
    }

    debug!("Creating singer: {} with color {}", name, color);
    let db = state.db.lock().map_lock_err()?;

    db.connection().execute(
        "INSERT INTO singers (name, color, is_persistent, unique_name) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![name, color, is_persistent, unique_name],
    )?;

    let id = db.connection().last_insert_rowid();
    info!("Created singer: {} (id: {})", name, id);

    Ok(Singer {
        id,
        name,
        unique_name,
        color,
        is_persistent,
    })
}

#[tauri::command]
pub fn get_singers(state: State<'_, AppState>) -> Result<Vec<Singer>, CommandError> {
    debug!("Getting all singers");
    let db = state.db.lock().map_lock_err()?;

    let mut stmt = db
        .connection()
        .prepare("SELECT id, name, unique_name, color, is_persistent FROM singers ORDER BY name")?;

    let singers = stmt
        .query_map([], |row| {
            Ok(Singer {
                id: row.get(0)?,
                name: row.get(1)?,
                unique_name: row.get(2)?,
                color: row.get(3)?,
                is_persistent: row.get::<_, i32>(4)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(singers)
}

#[tauri::command]
pub fn delete_singer(state: State<'_, AppState>, singer_id: i64) -> Result<(), CommandError> {
    info!("Deleting singer: {}", singer_id);
    let db = state.db.lock().map_lock_err()?;

    db.connection()
        .execute("DELETE FROM singers WHERE id = ?1", [singer_id])?;

    Ok(())
}

#[tauri::command]
pub fn update_singer(
    state: State<'_, AppState>,
    singer_id: i64,
    name: Option<String>,
    unique_name: Option<String>,
    color: Option<String>,
    is_persistent: Option<bool>,
) -> Result<Singer, CommandError> {
    info!("Updating singer: {}", singer_id);
    let db = state.db.lock().map_lock_err()?;

    // Validate name if provided
    if let Some(ref n) = name {
        let n = n.trim();
        if n.is_empty() {
            return Err(CommandError::Validation(
                "Singer name cannot be empty".to_string(),
            ));
        }
        if n.len() > MAX_NAME_LENGTH {
            return Err(CommandError::Validation(format!(
                "Singer name cannot exceed {} characters",
                MAX_NAME_LENGTH
            )));
        }
    }

    // Validate unique_name if provided
    if let Some(ref un) = unique_name {
        let un = un.trim();
        if !un.is_empty() && un.len() > MAX_NAME_LENGTH {
            return Err(CommandError::Validation(format!(
                "Unique name cannot exceed {} characters",
                MAX_NAME_LENGTH
            )));
        }
    }

    // Build dynamic update query
    let mut updates = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(n) = name {
        updates.push("name = ?");
        params.push(Box::new(n.trim().to_string()));
    }
    if let Some(un) = unique_name {
        updates.push("unique_name = ?");
        let un_trimmed = un.trim();
        params.push(Box::new(if un_trimmed.is_empty() {
            None::<String>
        } else {
            Some(un_trimmed.to_string())
        }));
    }
    if let Some(c) = color {
        updates.push("color = ?");
        params.push(Box::new(c));
    }
    if let Some(p) = is_persistent {
        updates.push("is_persistent = ?");
        params.push(Box::new(if p { 1 } else { 0 }));
    }

    if updates.is_empty() {
        return Err(CommandError::Validation(
            "No fields to update".to_string(),
        ));
    }

    params.push(Box::new(singer_id));
    let sql = format!(
        "UPDATE singers SET {} WHERE id = ?",
        updates.join(", ")
    );

    let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
    db.connection().execute(&sql, params_refs.as_slice())?;

    // Return updated singer
    let singer = db.connection().query_row(
        "SELECT id, name, unique_name, color, is_persistent FROM singers WHERE id = ?1",
        [singer_id],
        |row| {
            Ok(Singer {
                id: row.get(0)?,
                name: row.get(1)?,
                unique_name: row.get(2)?,
                color: row.get(3)?,
                is_persistent: row.get::<_, i32>(4)? != 0,
            })
        },
    )?;

    Ok(singer)
}

#[tauri::command]
pub fn get_persistent_singers(state: State<'_, AppState>) -> Result<Vec<Singer>, CommandError> {
    debug!("Getting persistent singers");
    let db = state.db.lock().map_lock_err()?;

    let mut stmt = db.connection().prepare(
        "SELECT id, name, unique_name, color, is_persistent FROM singers WHERE is_persistent = 1 ORDER BY name",
    )?;

    let singers = stmt
        .query_map([], |row| {
            Ok(Singer {
                id: row.get(0)?,
                name: row.get(1)?,
                unique_name: row.get(2)?,
                color: row.get(3)?,
                is_persistent: row.get::<_, i32>(4)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(singers)
}

// ============ Session Commands ============

#[tauri::command]
pub fn start_session(
    state: State<'_, AppState>,
    name: Option<String>,
) -> Result<Session, CommandError> {
    // Input validation - trim and validate name if provided
    let name = name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());
    if let Some(ref n) = name {
        if n.len() > MAX_NAME_LENGTH {
            return Err(CommandError::Validation(format!(
                "Session name cannot exceed {} characters",
                MAX_NAME_LENGTH
            )));
        }
    }

    info!("Starting new session: {:?}", name);
    let db = state.db.lock().map_lock_err()?;
    let conn = db.connection();

    // Use transaction for atomicity
    conn.execute("BEGIN IMMEDIATE", [])?;

    let result = (|| -> Result<Session, CommandError> {
        // Get the current active session ID (if any) before ending it
        let old_session_id: Option<i64> = conn
            .query_row(
                "SELECT id FROM sessions WHERE is_active = 1",
                [],
                |row| row.get(0),
            )
            .ok();

        // End old session first to avoid having two active sessions
        if old_session_id.is_some() {
            conn.execute(
                "UPDATE sessions SET is_active = 0, ended_at = CURRENT_TIMESTAMP WHERE is_active = 1",
                [],
            )?;
        }

        // Create new session
        conn.execute(
            "INSERT INTO sessions (name, is_active) VALUES (?1, 1)",
            [&name],
        )?;

        let new_session_id = conn.last_insert_rowid();

        // Migrate queue/history items from old session to new session
        if let Some(old_id) = old_session_id {
            let migrated_count = conn.execute(
                "UPDATE queue_items SET session_id = ?1 WHERE session_id = ?2",
                rusqlite::params![new_session_id, old_id],
            )?;
            info!(
                "Migrated {} queue/history items from session {} to session {}",
                migrated_count, old_id, new_session_id
            );
        }

        let session = conn.query_row(
            "SELECT id, name, started_at, ended_at, is_active FROM sessions WHERE id = ?1",
            [new_session_id],
            |row| {
                Ok(Session {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    started_at: row.get(2)?,
                    ended_at: row.get(3)?,
                    is_active: row.get::<_, i32>(4)? != 0,
                })
            },
        )?;

        Ok(session)
    })();

    match result {
        Ok(session) => {
            conn.execute("COMMIT", [])?;
            info!("Session started: id={}", session.id);
            Ok(session)
        }
        Err(e) => {
            if let Err(rollback_err) = conn.execute("ROLLBACK", []) {
                log::error!("Failed to rollback transaction: {}", rollback_err);
            }
            Err(e)
        }
    }
}

#[tauri::command]
pub fn end_session(state: State<'_, AppState>) -> Result<(), CommandError> {
    info!("Ending active session");
    let db = state.db.lock().map_lock_err()?;

    // Get the active session ID first
    let session_id: Option<i64> = db
        .connection()
        .query_row(
            "SELECT id FROM sessions WHERE is_active = 1",
            [],
            |row| row.get(0),
        )
        .ok();

    if let Some(session_id) = session_id {
        // Check if session has any content (queue items, history, or singers)
        let has_content: bool = db.connection().query_row(
            "SELECT EXISTS(
                    SELECT 1 FROM queue_items WHERE session_id = ?1
                    UNION
                    SELECT 1 FROM session_singers WHERE session_id = ?1
                )",
            [session_id],
            |row| row.get(0),
        )?;

        if has_content {
            // Session has content - just mark as inactive
            db.connection().execute(
                "UPDATE sessions SET is_active = 0, ended_at = CURRENT_TIMESTAMP WHERE id = ?1",
                [session_id],
            )?;
            info!("Session {} archived (has content)", session_id);
        } else {
            // Session is empty - delete it entirely
            db.connection()
                .execute("DELETE FROM sessions WHERE id = ?1", [session_id])?;
            info!("Session {} deleted (was empty)", session_id);
        }
    }

    // Clean up non-persistent singers that aren't associated with any session
    db.connection().execute(
        "DELETE FROM singers WHERE is_persistent = 0 AND id NOT IN (SELECT singer_id FROM session_singers)",
        [],
    )?;

    // Clear queue singer assignments (for non-persistent data)
    db.connection().execute(
        "DELETE FROM queue_singers WHERE queue_item_id NOT IN (SELECT id FROM queue_items)",
        [],
    )?;

    Ok(())
}

#[tauri::command]
pub fn get_active_session(state: State<'_, AppState>) -> Result<Option<Session>, CommandError> {
    debug!("Getting active session");
    let db = state.db.lock().map_lock_err()?;

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
        Err(e) => Err(CommandError::Database(e)),
    }
}

// ============ Session Singer Commands ============

#[tauri::command]
pub fn add_singer_to_session(
    state: State<'_, AppState>,
    session_id: i64,
    singer_id: i64,
) -> Result<(), CommandError> {
    debug!("Adding singer {} to session {}", singer_id, session_id);
    let db = state.db.lock().map_lock_err()?;

    db.connection().execute(
        "INSERT OR IGNORE INTO session_singers (session_id, singer_id) VALUES (?1, ?2)",
        [session_id, singer_id],
    )?;

    Ok(())
}

#[tauri::command]
pub fn get_session_singers(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<Vec<Singer>, CommandError> {
    debug!("Getting singers for session {}", session_id);
    let db = state.db.lock().map_lock_err()?;

    let mut stmt = db.connection().prepare(
        "SELECT s.id, s.name, s.unique_name, s.color, s.is_persistent
             FROM singers s
             INNER JOIN session_singers ss ON s.id = ss.singer_id
             WHERE ss.session_id = ?1
             ORDER BY ss.joined_at",
    )?;

    let singers = stmt
        .query_map([session_id], |row| {
            Ok(Singer {
                id: row.get(0)?,
                name: row.get(1)?,
                unique_name: row.get(2)?,
                color: row.get(3)?,
                is_persistent: row.get::<_, i32>(4)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(singers)
}

// ============ Queue Singer Assignment Commands ============

#[tauri::command]
pub fn assign_singer_to_queue_item(
    state: State<'_, AppState>,
    queue_item_id: String,
    singer_id: i64,
) -> Result<(), CommandError> {
    debug!(
        "Assigning singer {} to queue item {}",
        singer_id, queue_item_id
    );
    let db = state.db.lock().map_lock_err()?;

    // Get next position for this queue item
    let position: i32 = db
        .connection()
        .query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM queue_singers WHERE queue_item_id = ?1",
            [&queue_item_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    db.connection().execute(
        "INSERT INTO queue_singers (queue_item_id, singer_id, position) VALUES (?1, ?2, ?3)",
        rusqlite::params![queue_item_id, singer_id, position],
    )?;

    Ok(())
}

#[tauri::command]
pub fn remove_singer_from_queue_item(
    state: State<'_, AppState>,
    queue_item_id: String,
    singer_id: i64,
) -> Result<(), CommandError> {
    debug!(
        "Removing singer {} from queue item {}",
        singer_id, queue_item_id
    );
    let db = state.db.lock().map_lock_err()?;

    db.connection().execute(
        "DELETE FROM queue_singers WHERE queue_item_id = ?1 AND singer_id = ?2",
        rusqlite::params![queue_item_id, singer_id],
    )?;

    Ok(())
}

#[tauri::command]
pub fn get_queue_item_singers(
    state: State<'_, AppState>,
    queue_item_id: String,
) -> Result<Vec<Singer>, CommandError> {
    debug!("Getting singers for queue item {}", queue_item_id);
    let db = state.db.lock().map_lock_err()?;

    let mut stmt = db.connection().prepare(
        "SELECT s.id, s.name, s.unique_name, s.color, s.is_persistent
             FROM singers s
             INNER JOIN queue_singers qs ON s.id = qs.singer_id
             WHERE qs.queue_item_id = ?1
             ORDER BY qs.position",
    )?;

    let singers = stmt
        .query_map([&queue_item_id], |row| {
            Ok(Singer {
                id: row.get(0)?,
                name: row.get(1)?,
                unique_name: row.get(2)?,
                color: row.get(3)?,
                is_persistent: row.get::<_, i32>(4)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(singers)
}

#[tauri::command]
pub fn clear_queue_item_singers(
    state: State<'_, AppState>,
    queue_item_id: String,
) -> Result<(), CommandError> {
    debug!("Clearing singers from queue item {}", queue_item_id);
    let db = state.db.lock().map_lock_err()?;

    db.connection().execute(
        "DELETE FROM queue_singers WHERE queue_item_id = ?1",
        [&queue_item_id],
    )?;

    Ok(())
}

// ============ Session Management Commands ============

#[tauri::command]
pub fn get_recent_sessions(
    state: State<'_, AppState>,
    limit: Option<i32>,
) -> Result<Vec<Session>, CommandError> {
    let limit = limit.unwrap_or(10);
    debug!("Getting recent sessions (limit: {})", limit);
    let db = state.db.lock().map_lock_err()?;

    let mut stmt = db.connection().prepare(
        "SELECT id, name, started_at, ended_at, is_active FROM sessions
             ORDER BY started_at DESC LIMIT ?1",
    )?;

    let sessions = stmt
        .query_map([limit], |row| {
            Ok(Session {
                id: row.get(0)?,
                name: row.get(1)?,
                started_at: row.get(2)?,
                ended_at: row.get(3)?,
                is_active: row.get::<_, i32>(4)? != 0,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(sessions)
}

#[tauri::command]
pub fn rename_session(
    state: State<'_, AppState>,
    session_id: i64,
    name: String,
) -> Result<Session, CommandError> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(CommandError::Validation(
            "Session name cannot be empty".to_string(),
        ));
    }
    if name.len() > MAX_NAME_LENGTH {
        return Err(CommandError::Validation(format!(
            "Session name cannot exceed {} characters",
            MAX_NAME_LENGTH
        )));
    }

    info!("Renaming session {} to: {}", session_id, name);
    let db = state.db.lock().map_lock_err()?;

    db.connection().execute(
        "UPDATE sessions SET name = ?1 WHERE id = ?2",
        rusqlite::params![name, session_id],
    )?;

    let session = db.connection().query_row(
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
    )?;

    Ok(session)
}

#[tauri::command]
pub fn delete_session(state: State<'_, AppState>, session_id: i64) -> Result<(), CommandError> {
    info!("Deleting session: {}", session_id);
    let db = state.db.lock().map_lock_err()?;

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
        return Err(CommandError::Validation(
            "Cannot delete the active session".to_string(),
        ));
    }

    // Delete session (cascade will handle queue_items and session_singers)
    db.connection()
        .execute("DELETE FROM sessions WHERE id = ?1", [session_id])?;

    // Clean up non-persistent singers that are now orphaned
    db.connection().execute(
        "DELETE FROM singers WHERE is_persistent = 0 AND id NOT IN (SELECT singer_id FROM session_singers)",
        [],
    )?;

    // Clean up orphaned queue singer assignments
    db.connection().execute(
        "DELETE FROM queue_singers WHERE queue_item_id NOT IN (SELECT id FROM queue_items)",
        [],
    )?;

    info!("Session {} deleted", session_id);
    Ok(())
}

#[tauri::command]
pub fn load_session(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<Session, CommandError> {
    info!("Loading session: {}", session_id);
    let db = state.db.lock().map_lock_err()?;
    let conn = db.connection();

    // Use transaction for atomicity
    conn.execute("BEGIN IMMEDIATE", [])?;

    let result = (|| -> Result<Session, CommandError> {
        // End any active session first
        conn.execute(
            "UPDATE sessions SET is_active = 0, ended_at = CURRENT_TIMESTAMP WHERE is_active = 1",
            [],
        )?;

        // Activate the selected session
        conn.execute(
            "UPDATE sessions SET is_active = 1, ended_at = NULL WHERE id = ?1",
            [session_id],
        )?;

        let session = conn.query_row(
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
        )?;

        Ok(session)
    })();

    match result {
        Ok(session) => {
            conn.execute("COMMIT", [])?;
            info!("Session {} loaded and activated", session_id);
            Ok(session)
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
}
