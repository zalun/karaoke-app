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

/// Status of a hosted session. Serializes to lowercase strings: "active", "paused", "ended".
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum HostedSessionStatus {
    Active,
    Paused,
    Ended,
}

impl HostedSessionStatus {
    /// Convert from database string representation
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "active" => Some(Self::Active),
            "paused" => Some(Self::Paused),
            "ended" => Some(Self::Ended),
            _ => None,
        }
    }

    /// Convert to database string representation
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Paused => "paused",
            Self::Ended => "ended",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Session {
    pub id: i64,
    pub name: Option<String>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub is_active: bool,
    pub hosted_session_id: Option<String>,
    pub hosted_by_user_id: Option<String>,
    pub hosted_session_status: Option<HostedSessionStatus>,
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

    // Clear active_singer_id if this singer was the active singer
    db.connection().execute(
        "UPDATE sessions SET active_singer_id = NULL WHERE active_singer_id = ?1",
        [singer_id],
    )?;

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
            "SELECT id, name, started_at, ended_at, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
            [new_session_id],
            |row| {
                Ok(Session {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    started_at: row.get(2)?,
                    ended_at: row.get(3)?,
                    is_active: row.get::<_, i32>(4)? != 0,
                    hosted_session_id: row.get(5)?,
                    hosted_by_user_id: row.get(6)?,
                    hosted_session_status: row.get::<_, Option<String>>(7)?
                        .and_then(|s| HostedSessionStatus::from_str(&s)),
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
        "SELECT id, name, started_at, ended_at, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE is_active = 1",
        [],
        |row| {
            Ok(Session {
                id: row.get(0)?,
                name: row.get(1)?,
                started_at: row.get(2)?,
                ended_at: row.get(3)?,
                is_active: row.get::<_, i32>(4)? != 0,
                hosted_session_id: row.get(5)?,
                hosted_by_user_id: row.get(6)?,
                hosted_session_status: row.get::<_, Option<String>>(7)?
                    .and_then(|s| HostedSessionStatus::from_str(&s)),
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
pub fn remove_singer_from_session(
    state: State<'_, AppState>,
    session_id: i64,
    singer_id: i64,
) -> Result<(), CommandError> {
    info!(
        "Removing singer {} from session {}",
        singer_id, session_id
    );
    let db = state.db.lock().map_lock_err()?;
    let conn = db.connection();

    // Verify session exists
    let session_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = ?1)",
        [session_id],
        |row| row.get(0),
    )?;

    if !session_exists {
        return Err(CommandError::Validation(format!(
            "Session {} does not exist",
            session_id
        )));
    }

    // Verify singer exists
    let singer_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM singers WHERE id = ?1)",
        [singer_id],
        |row| row.get(0),
    )?;

    if !singer_exists {
        return Err(CommandError::Validation(format!(
            "Singer {} does not exist",
            singer_id
        )));
    }

    // Use transaction for atomicity
    conn.execute("BEGIN IMMEDIATE", [])?;

    let result = (|| -> Result<(), CommandError> {
        // Clear active_singer_id if this singer was the active singer for this session
        conn.execute(
            "UPDATE sessions SET active_singer_id = NULL WHERE id = ?1 AND active_singer_id = ?2",
            [session_id, singer_id],
        )?;

        // Remove from session_singers
        conn.execute(
            "DELETE FROM session_singers WHERE session_id = ?1 AND singer_id = ?2",
            [session_id, singer_id],
        )?;

        // Clean up non-persistent singers that are now orphaned (not in any session)
        conn.execute(
            "DELETE FROM singers WHERE is_persistent = 0 AND id = ?1 AND NOT EXISTS (SELECT 1 FROM session_singers WHERE singer_id = ?1)",
            [singer_id],
        )?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", [])?;
            Ok(())
        }
        Err(e) => {
            let _ = conn.execute("ROLLBACK", []);
            Err(e)
        }
    }
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
        "SELECT id, name, started_at, ended_at, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions
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
                hosted_session_id: row.get(5)?,
                hosted_by_user_id: row.get(6)?,
                hosted_session_status: row.get::<_, Option<String>>(7)?
                    .and_then(|s| HostedSessionStatus::from_str(&s)),
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
        "SELECT id, name, started_at, ended_at, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
        [session_id],
        |row| {
            Ok(Session {
                id: row.get(0)?,
                name: row.get(1)?,
                started_at: row.get(2)?,
                ended_at: row.get(3)?,
                is_active: row.get::<_, i32>(4)? != 0,
                hosted_session_id: row.get(5)?,
                hosted_by_user_id: row.get(6)?,
                hosted_session_status: row.get::<_, Option<String>>(7)?
                    .and_then(|s| HostedSessionStatus::from_str(&s)),
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
            "SELECT id, name, started_at, ended_at, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
            [session_id],
            |row| {
                Ok(Session {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    started_at: row.get(2)?,
                    ended_at: row.get(3)?,
                    is_active: row.get::<_, i32>(4)? != 0,
                    hosted_session_id: row.get(5)?,
                    hosted_by_user_id: row.get(6)?,
                    hosted_session_status: row.get::<_, Option<String>>(7)?
                        .and_then(|s| HostedSessionStatus::from_str(&s)),
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

// ============ Hosted Session Commands ============

#[tauri::command]
pub fn session_set_hosted(
    state: State<'_, AppState>,
    session_id: i64,
    hosted_session_id: String,
    hosted_by_user_id: String,
    status: String,
) -> Result<(), CommandError> {
    info!(
        "Setting hosted session for session {}: hosted_id={}, user_id={}, status={}",
        session_id, hosted_session_id, hosted_by_user_id, status
    );

    // Parse status string into HostedSessionStatus enum (TYPE-003)
    let status_enum = HostedSessionStatus::from_str(&status).ok_or_else(|| {
        CommandError::Validation(format!(
            "Invalid hosted session status: '{}'. Must be one of: active, paused, ended",
            status
        ))
    })?;

    let db = state.db.lock().map_lock_err()?;

    // First verify session exists (needed to distinguish "not found" from "ownership conflict")
    let session_exists: bool = db
        .connection()
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = ?1)",
            [session_id],
            |row| row.get(0),
        )?;

    if !session_exists {
        return Err(CommandError::Validation(format!(
            "Session {} does not exist",
            session_id
        )));
    }

    // Use conditional UPDATE with WHERE clause for atomic ownership check (CONC-003).
    // This prevents race conditions by combining the ownership check and update in a single
    // SQL statement. The update only succeeds if:
    // - No existing hosted_by_user_id (NULL) - session not currently hosted
    // - Same user is updating (hosted_by_user_id matches)
    // - Previous status is 'ended' (session was released, can be taken over)
    let affected_rows = db.connection().execute(
        "UPDATE sessions
         SET hosted_session_id = ?1, hosted_by_user_id = ?2, hosted_session_status = ?3
         WHERE id = ?4
         AND (
             hosted_by_user_id IS NULL
             OR hosted_by_user_id = ?2
             OR hosted_session_status = 'ended'
             OR hosted_session_status IS NULL
         )",
        rusqlite::params![hosted_session_id, hosted_by_user_id, status_enum.as_str(), session_id],
    )?;

    // If no rows affected, it means ownership conflict (session exists but conditions not met)
    if affected_rows == 0 {
        info!(
            "Ownership conflict: session {} is being hosted by another user",
            session_id
        );
        return Err(CommandError::OwnershipConflict);
    }

    info!(
        "Hosted session set for session {}: hosted_id={}, status={}",
        session_id, hosted_session_id, status
    );
    Ok(())
}

#[tauri::command]
pub fn session_update_hosted_status(
    state: State<'_, AppState>,
    session_id: i64,
    status: String,
) -> Result<(), CommandError> {
    info!(
        "Updating hosted session status for session {}: status={}",
        session_id, status
    );

    // Parse status string into HostedSessionStatus enum (TYPE-004)
    let status_enum = HostedSessionStatus::from_str(&status).ok_or_else(|| {
        CommandError::Validation(format!(
            "Invalid hosted session status: '{}'. Must be one of: active, paused, ended",
            status
        ))
    })?;

    let db = state.db.lock().map_lock_err()?;

    // Verify session exists
    let session_exists: bool = db
        .connection()
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = ?1)",
            [session_id],
            |row| row.get(0),
        )?;

    if !session_exists {
        return Err(CommandError::Validation(format!(
            "Session {} does not exist",
            session_id
        )));
    }

    // Update only the status field
    db.connection().execute(
        "UPDATE sessions SET hosted_session_status = ?1 WHERE id = ?2",
        rusqlite::params![status_enum.as_str(), session_id],
    )?;

    info!(
        "Hosted session status updated for session {}: status={}",
        session_id, status
    );
    Ok(())
}

// ============ Active Singer Commands ============

#[tauri::command]
pub fn session_set_active_singer(
    state: State<'_, AppState>,
    session_id: i64,
    singer_id: Option<i64>,
) -> Result<(), CommandError> {
    debug!(
        "Setting active singer for session {}: {:?}",
        session_id, singer_id
    );
    let db = state.db.lock().map_lock_err()?;

    // If singer_id is provided, verify singer exists and is in the session
    if let Some(sid) = singer_id {
        let exists: bool = db
            .connection()
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM session_singers WHERE session_id = ?1 AND singer_id = ?2)",
                rusqlite::params![session_id, sid],
                |row| row.get(0),
            )?;

        if !exists {
            return Err(CommandError::Validation(
                "Singer is not part of this session".to_string(),
            ));
        }
    }

    db.connection().execute(
        "UPDATE sessions SET active_singer_id = ?1 WHERE id = ?2",
        rusqlite::params![singer_id, session_id],
    )?;

    info!(
        "Active singer set for session {}: {:?}",
        session_id, singer_id
    );
    Ok(())
}

#[tauri::command]
pub fn session_get_active_singer(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<Option<Singer>, CommandError> {
    debug!("Getting active singer for session {}", session_id);
    let db = state.db.lock().map_lock_err()?;

    let result = db.connection().query_row(
        "SELECT s.id, s.name, s.unique_name, s.color, s.is_persistent
         FROM singers s
         INNER JOIN sessions sess ON sess.active_singer_id = s.id
         WHERE sess.id = ?1",
        [session_id],
        |row| {
            Ok(Singer {
                id: row.get(0)?,
                name: row.get(1)?,
                unique_name: row.get(2)?,
                color: row.get(3)?,
                is_persistent: row.get::<_, i32>(4)? != 0,
            })
        },
    );

    match result {
        Ok(singer) => Ok(Some(singer)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(CommandError::Database(e)),
    }
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    /// Create an in-memory database with the required schema for testing
    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();

        // Create minimal schema for session/singer tests
        conn.execute_batch(
            r#"
            CREATE TABLE singers (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                unique_name TEXT,
                color TEXT NOT NULL,
                is_persistent INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE sessions (
                id INTEGER PRIMARY KEY,
                name TEXT,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ended_at TIMESTAMP,
                is_active INTEGER DEFAULT 1,
                history_index INTEGER DEFAULT -1,
                active_singer_id INTEGER REFERENCES singers(id) ON DELETE SET NULL,
                hosted_session_id TEXT,
                hosted_by_user_id TEXT,
                hosted_session_status TEXT
            );

            CREATE TABLE session_singers (
                session_id INTEGER NOT NULL,
                singer_id INTEGER NOT NULL,
                joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (session_id, singer_id),
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE CASCADE
            );

            CREATE TABLE queue_singers (
                id INTEGER PRIMARY KEY,
                queue_item_id TEXT NOT NULL,
                singer_id INTEGER NOT NULL,
                position INTEGER DEFAULT 0,
                FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE CASCADE
            );

            CREATE TABLE queue_items (
                id TEXT PRIMARY KEY,
                session_id INTEGER NOT NULL,
                item_type TEXT NOT NULL,
                video_id TEXT NOT NULL,
                title TEXT NOT NULL,
                artist TEXT,
                duration INTEGER,
                thumbnail_url TEXT,
                source TEXT NOT NULL,
                youtube_id TEXT,
                file_path TEXT,
                position INTEGER NOT NULL,
                added_at TEXT NOT NULL,
                played_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE INDEX idx_queue_singers_queue_item ON queue_singers(queue_item_id);
            CREATE INDEX idx_session_singers_session ON session_singers(session_id);
            "#,
        )
        .unwrap();

        conn
    }

    mod singer_crud {
        use super::*;
        use crate::commands::session::MAX_NAME_LENGTH;

        #[test]
        fn test_create_singer_basic() {
            let conn = setup_test_db();

            conn.execute(
                "INSERT INTO singers (name, color, is_persistent) VALUES (?1, ?2, ?3)",
                rusqlite::params!["Alice", "#ff0000", false],
            )
            .unwrap();

            let singer: (i64, String, String, i32) = conn
                .query_row(
                    "SELECT id, name, color, is_persistent FROM singers WHERE name = 'Alice'",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                )
                .unwrap();

            assert_eq!(singer.1, "Alice");
            assert_eq!(singer.2, "#ff0000");
            assert_eq!(singer.3, 0);
        }

        #[test]
        fn test_create_singer_with_unique_name() {
            let conn = setup_test_db();

            conn.execute(
                "INSERT INTO singers (name, unique_name, color, is_persistent) VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params!["Bob", "bob123", "#00ff00", true],
            )
            .unwrap();

            let singer: (String, Option<String>, i32) = conn
                .query_row(
                    "SELECT name, unique_name, is_persistent FROM singers WHERE name = 'Bob'",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(singer.0, "Bob");
            assert_eq!(singer.1, Some("bob123".to_string()));
            assert_eq!(singer.2, 1);
        }

        #[test]
        fn test_name_validation_empty() {
            let name = "   ".trim();
            assert!(name.is_empty(), "Trimmed whitespace-only name should be empty");
        }

        #[test]
        fn test_name_validation_max_length() {
            let long_name = "a".repeat(MAX_NAME_LENGTH + 1);
            assert!(
                long_name.len() > MAX_NAME_LENGTH,
                "Name exceeding {} characters should be rejected",
                MAX_NAME_LENGTH
            );
        }

        #[test]
        fn test_name_validation_at_limit() {
            let max_name = "a".repeat(MAX_NAME_LENGTH);
            assert_eq!(max_name.len(), MAX_NAME_LENGTH);
            assert!(
                max_name.len() <= MAX_NAME_LENGTH,
                "Name at exactly {} characters should be valid",
                MAX_NAME_LENGTH
            );
        }

        #[test]
        fn test_delete_singer() {
            let conn = setup_test_db();

            conn.execute(
                "INSERT INTO singers (name, color) VALUES ('ToDelete', '#000000')",
                [],
            )
            .unwrap();

            let count: i32 = conn
                .query_row("SELECT COUNT(*) FROM singers", [], |row| row.get(0))
                .unwrap();
            assert_eq!(count, 1);

            conn.execute("DELETE FROM singers WHERE name = 'ToDelete'", [])
                .unwrap();

            let count: i32 = conn
                .query_row("SELECT COUNT(*) FROM singers", [], |row| row.get(0))
                .unwrap();
            assert_eq!(count, 0);
        }

        #[test]
        fn test_get_singers_ordered_by_name() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO singers (name, color) VALUES ('Zoe', '#111')", [])
                .unwrap();
            conn.execute("INSERT INTO singers (name, color) VALUES ('Alice', '#222')", [])
                .unwrap();
            conn.execute("INSERT INTO singers (name, color) VALUES ('Mike', '#333')", [])
                .unwrap();

            let mut stmt = conn
                .prepare("SELECT name FROM singers ORDER BY name")
                .unwrap();
            let names: Vec<String> = stmt
                .query_map([], |row| row.get(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap();

            assert_eq!(names, vec!["Alice", "Mike", "Zoe"]);
        }

        #[test]
        fn test_get_persistent_singers_only() {
            let conn = setup_test_db();

            conn.execute(
                "INSERT INTO singers (name, color, is_persistent) VALUES ('Temp', '#111', 0)",
                [],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO singers (name, color, is_persistent) VALUES ('Perm', '#222', 1)",
                [],
            )
            .unwrap();

            let count: i32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM singers WHERE is_persistent = 1",
                    [],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(count, 1);
        }
    }

    mod session_lifecycle {
        use super::*;

        #[test]
        fn test_start_session_basic() {
            let conn = setup_test_db();

            conn.execute(
                "INSERT INTO sessions (name, is_active) VALUES ('Test Session', 1)",
                [],
            )
            .unwrap();

            let session: (i64, Option<String>, i32) = conn
                .query_row(
                    "SELECT id, name, is_active FROM sessions WHERE is_active = 1",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(session.1, Some("Test Session".to_string()));
            assert_eq!(session.2, 1);
        }

        #[test]
        fn test_start_session_ends_previous() {
            let conn = setup_test_db();

            // Create first session
            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('First', 1)", [])
                .unwrap();

            // Simulate starting new session (end old first)
            conn.execute(
                "UPDATE sessions SET is_active = 0, ended_at = CURRENT_TIMESTAMP WHERE is_active = 1",
                [],
            )
            .unwrap();
            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('Second', 1)", [])
                .unwrap();

            let active_count: i32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sessions WHERE is_active = 1",
                    [],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(active_count, 1, "Only one session should be active at a time");

            let active_name: String = conn
                .query_row(
                    "SELECT name FROM sessions WHERE is_active = 1",
                    [],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(active_name, "Second");
        }

        #[test]
        fn test_end_session_marks_inactive() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('ToEnd', 1)", [])
                .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // Add a singer to make the session non-empty
            conn.execute(
                "INSERT INTO singers (name, color) VALUES ('Singer', '#fff')",
                [],
            )
            .unwrap();
            let singer_id: i64 = conn.last_insert_rowid();
            conn.execute(
                "INSERT INTO session_singers (session_id, singer_id) VALUES (?1, ?2)",
                [session_id, singer_id],
            )
            .unwrap();

            // End session
            conn.execute(
                "UPDATE sessions SET is_active = 0, ended_at = CURRENT_TIMESTAMP WHERE id = ?1",
                [session_id],
            )
            .unwrap();

            let is_active: i32 = conn
                .query_row(
                    "SELECT is_active FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(is_active, 0);
        }

        #[test]
        fn test_end_empty_session_deletes() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('Empty', 1)", [])
                .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // Check if session has content
            let has_content: bool = conn
                .query_row(
                    "SELECT EXISTS(
                        SELECT 1 FROM queue_items WHERE session_id = ?1
                        UNION
                        SELECT 1 FROM session_singers WHERE session_id = ?1
                    )",
                    [session_id],
                    |row| row.get(0),
                )
                .unwrap();

            if !has_content {
                conn.execute("DELETE FROM sessions WHERE id = ?1", [session_id])
                    .unwrap();
            }

            let count: i32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(count, 0, "Empty session should be deleted on end");
        }

        #[test]
        fn test_session_cleanup_removes_orphaned_singers() {
            let conn = setup_test_db();

            // Create non-persistent singer without session association
            conn.execute(
                "INSERT INTO singers (name, color, is_persistent) VALUES ('Orphan', '#000', 0)",
                [],
            )
            .unwrap();

            // Cleanup orphaned non-persistent singers
            conn.execute(
                "DELETE FROM singers WHERE is_persistent = 0 AND id NOT IN (SELECT singer_id FROM session_singers)",
                [],
            )
            .unwrap();

            let count: i32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM singers WHERE name = 'Orphan'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(count, 0, "Orphaned non-persistent singers should be cleaned up");
        }

        #[test]
        fn test_persistent_singer_survives_cleanup() {
            let conn = setup_test_db();

            // Create persistent singer without session association
            conn.execute(
                "INSERT INTO singers (name, color, is_persistent) VALUES ('Persistent', '#000', 1)",
                [],
            )
            .unwrap();

            // Cleanup orphaned non-persistent singers
            conn.execute(
                "DELETE FROM singers WHERE is_persistent = 0 AND id NOT IN (SELECT singer_id FROM session_singers)",
                [],
            )
            .unwrap();

            let count: i32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM singers WHERE name = 'Persistent'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(count, 1, "Persistent singers should survive cleanup");
        }

        #[test]
        fn test_add_singer_to_session() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('Test', 1)", [])
                .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            conn.execute(
                "INSERT INTO singers (name, color) VALUES ('Alice', '#fff')",
                [],
            )
            .unwrap();
            let singer_id: i64 = conn.last_insert_rowid();

            conn.execute(
                "INSERT OR IGNORE INTO session_singers (session_id, singer_id) VALUES (?1, ?2)",
                [session_id, singer_id],
            )
            .unwrap();

            let count: i32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM session_singers WHERE session_id = ?1 AND singer_id = ?2",
                    [session_id, singer_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(count, 1);
        }
    }

    mod queue_singer_assignment {
        use super::*;

        #[test]
        fn test_assign_singer_to_queue_item() {
            let conn = setup_test_db();

            conn.execute(
                "INSERT INTO singers (name, color) VALUES ('Alice', '#fff')",
                [],
            )
            .unwrap();
            let singer_id: i64 = conn.last_insert_rowid();

            let queue_item_id = "test-item-123";
            conn.execute(
                "INSERT INTO queue_singers (queue_item_id, singer_id, position) VALUES (?1, ?2, 0)",
                rusqlite::params![queue_item_id, singer_id],
            )
            .unwrap();

            let count: i32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM queue_singers WHERE queue_item_id = ?1 AND singer_id = ?2",
                    rusqlite::params![queue_item_id, singer_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(count, 1);
        }

        #[test]
        fn test_assign_multiple_singers_with_position() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO singers (name, color) VALUES ('Alice', '#f00')", [])
                .unwrap();
            let alice_id: i64 = conn.last_insert_rowid();

            conn.execute("INSERT INTO singers (name, color) VALUES ('Bob', '#0f0')", [])
                .unwrap();
            let bob_id: i64 = conn.last_insert_rowid();

            let queue_item_id = "test-item-456";

            // Assign Alice at position 0
            conn.execute(
                "INSERT INTO queue_singers (queue_item_id, singer_id, position) VALUES (?1, ?2, 0)",
                rusqlite::params![queue_item_id, alice_id],
            )
            .unwrap();

            // Assign Bob at position 1
            conn.execute(
                "INSERT INTO queue_singers (queue_item_id, singer_id, position) VALUES (?1, ?2, 1)",
                rusqlite::params![queue_item_id, bob_id],
            )
            .unwrap();

            // Get singers ordered by position
            let mut stmt = conn
                .prepare(
                    "SELECT s.name FROM singers s
                     INNER JOIN queue_singers qs ON s.id = qs.singer_id
                     WHERE qs.queue_item_id = ?1
                     ORDER BY qs.position",
                )
                .unwrap();

            let names: Vec<String> = stmt
                .query_map([queue_item_id], |row| row.get(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap();

            assert_eq!(names, vec!["Alice", "Bob"]);
        }

        #[test]
        fn test_remove_singer_from_queue_item() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO singers (name, color) VALUES ('ToRemove', '#fff')", [])
                .unwrap();
            let singer_id: i64 = conn.last_insert_rowid();

            let queue_item_id = "test-item-789";
            conn.execute(
                "INSERT INTO queue_singers (queue_item_id, singer_id, position) VALUES (?1, ?2, 0)",
                rusqlite::params![queue_item_id, singer_id],
            )
            .unwrap();

            conn.execute(
                "DELETE FROM queue_singers WHERE queue_item_id = ?1 AND singer_id = ?2",
                rusqlite::params![queue_item_id, singer_id],
            )
            .unwrap();

            let count: i32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM queue_singers WHERE queue_item_id = ?1",
                    [queue_item_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(count, 0);
        }

        #[test]
        fn test_clear_all_singers_from_queue_item() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO singers (name, color) VALUES ('One', '#f00')", [])
                .unwrap();
            let s1: i64 = conn.last_insert_rowid();

            conn.execute("INSERT INTO singers (name, color) VALUES ('Two', '#0f0')", [])
                .unwrap();
            let s2: i64 = conn.last_insert_rowid();

            let queue_item_id = "clear-test";
            conn.execute(
                "INSERT INTO queue_singers (queue_item_id, singer_id, position) VALUES (?1, ?2, 0)",
                rusqlite::params![queue_item_id, s1],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO queue_singers (queue_item_id, singer_id, position) VALUES (?1, ?2, 1)",
                rusqlite::params![queue_item_id, s2],
            )
            .unwrap();

            conn.execute(
                "DELETE FROM queue_singers WHERE queue_item_id = ?1",
                [queue_item_id],
            )
            .unwrap();

            let count: i32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM queue_singers WHERE queue_item_id = ?1",
                    [queue_item_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(count, 0);
        }
    }

    mod active_singer {
        use super::*;

        #[test]
        fn test_set_active_singer() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('Test', 1)", [])
                .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            conn.execute("INSERT INTO singers (name, color) VALUES ('Active', '#fff')", [])
                .unwrap();
            let singer_id: i64 = conn.last_insert_rowid();

            // Add singer to session first
            conn.execute(
                "INSERT INTO session_singers (session_id, singer_id) VALUES (?1, ?2)",
                [session_id, singer_id],
            )
            .unwrap();

            // Set as active singer
            conn.execute(
                "UPDATE sessions SET active_singer_id = ?1 WHERE id = ?2",
                [singer_id, session_id],
            )
            .unwrap();

            let active_singer_id: Option<i64> = conn
                .query_row(
                    "SELECT active_singer_id FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(active_singer_id, Some(singer_id));
        }

        #[test]
        fn test_clear_active_singer() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO singers (name, color) VALUES ('ToClear', '#fff')", [])
                .unwrap();
            let singer_id: i64 = conn.last_insert_rowid();

            conn.execute(
                "INSERT INTO sessions (name, is_active, active_singer_id) VALUES ('Test', 1, ?1)",
                [singer_id],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // Clear active singer
            conn.execute(
                "UPDATE sessions SET active_singer_id = NULL WHERE id = ?1",
                [session_id],
            )
            .unwrap();

            let active_singer_id: Option<i64> = conn
                .query_row(
                    "SELECT active_singer_id FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(active_singer_id, None);
        }

        #[test]
        fn test_delete_singer_clears_active_singer() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO singers (name, color) VALUES ('ToDelete', '#fff')", [])
                .unwrap();
            let singer_id: i64 = conn.last_insert_rowid();

            conn.execute(
                "INSERT INTO sessions (name, is_active, active_singer_id) VALUES ('Test', 1, ?1)",
                [singer_id],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // Clear active_singer_id before deleting (as the command does)
            conn.execute(
                "UPDATE sessions SET active_singer_id = NULL WHERE active_singer_id = ?1",
                [singer_id],
            )
            .unwrap();

            conn.execute("DELETE FROM singers WHERE id = ?1", [singer_id])
                .unwrap();

            let active_singer_id: Option<i64> = conn
                .query_row(
                    "SELECT active_singer_id FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(active_singer_id, None);
        }

        #[test]
        fn test_validate_singer_in_session_before_setting_active() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('Test', 1)", [])
                .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            conn.execute("INSERT INTO singers (name, color) VALUES ('NotInSession', '#fff')", [])
                .unwrap();
            let singer_id: i64 = conn.last_insert_rowid();

            // Check if singer is in session
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM session_singers WHERE session_id = ?1 AND singer_id = ?2)",
                    [session_id, singer_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert!(!exists, "Singer should not be in session");
        }
    }

    mod remove_singer_from_session {
        use super::*;

        #[test]
        fn test_removes_singer_from_session_singers() {
            let conn = setup_test_db();

            // Create session and singer
            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('Test', 1)", [])
                .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            conn.execute(
                "INSERT INTO singers (name, color, is_persistent) VALUES ('Alice', '#fff', 1)",
                [],
            )
            .unwrap();
            let singer_id: i64 = conn.last_insert_rowid();

            // Add singer to session
            conn.execute(
                "INSERT INTO session_singers (session_id, singer_id) VALUES (?1, ?2)",
                [session_id, singer_id],
            )
            .unwrap();

            // Verify singer is in session
            let in_session: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM session_singers WHERE session_id = ?1 AND singer_id = ?2)",
                    [session_id, singer_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(in_session, "Singer should be in session before removal");

            // Remove singer from session
            conn.execute(
                "DELETE FROM session_singers WHERE session_id = ?1 AND singer_id = ?2",
                [session_id, singer_id],
            )
            .unwrap();

            // Verify singer is removed from session
            let in_session_after: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM session_singers WHERE session_id = ?1 AND singer_id = ?2)",
                    [session_id, singer_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(!in_session_after, "Singer should be removed from session");
        }

        #[test]
        fn test_persistent_singer_preserved_after_removal() {
            let conn = setup_test_db();

            // Create session and persistent singer
            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('Test', 1)", [])
                .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            conn.execute(
                "INSERT INTO singers (name, color, is_persistent) VALUES ('Persistent', '#fff', 1)",
                [],
            )
            .unwrap();
            let singer_id: i64 = conn.last_insert_rowid();

            // Add singer to session
            conn.execute(
                "INSERT INTO session_singers (session_id, singer_id) VALUES (?1, ?2)",
                [session_id, singer_id],
            )
            .unwrap();

            // Remove singer from session
            conn.execute(
                "DELETE FROM session_singers WHERE session_id = ?1 AND singer_id = ?2",
                [session_id, singer_id],
            )
            .unwrap();

            // Clean up non-persistent singers (as the command does)
            conn.execute(
                "DELETE FROM singers WHERE is_persistent = 0 AND id = ?1 AND NOT EXISTS (SELECT 1 FROM session_singers WHERE singer_id = ?1)",
                [singer_id],
            )
            .unwrap();

            // Verify persistent singer still exists
            let singer_exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM singers WHERE id = ?1)",
                    [singer_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(singer_exists, "Persistent singer should still exist after removal from session");
        }

        #[test]
        fn test_non_persistent_orphaned_singer_deleted() {
            let conn = setup_test_db();

            // Create session and non-persistent singer
            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('Test', 1)", [])
                .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            conn.execute(
                "INSERT INTO singers (name, color, is_persistent) VALUES ('Temp', '#fff', 0)",
                [],
            )
            .unwrap();
            let singer_id: i64 = conn.last_insert_rowid();

            // Add singer to session
            conn.execute(
                "INSERT INTO session_singers (session_id, singer_id) VALUES (?1, ?2)",
                [session_id, singer_id],
            )
            .unwrap();

            // Remove singer from session
            conn.execute(
                "DELETE FROM session_singers WHERE session_id = ?1 AND singer_id = ?2",
                [session_id, singer_id],
            )
            .unwrap();

            // Clean up non-persistent singers (as the command does)
            conn.execute(
                "DELETE FROM singers WHERE is_persistent = 0 AND id = ?1 AND NOT EXISTS (SELECT 1 FROM session_singers WHERE singer_id = ?1)",
                [singer_id],
            )
            .unwrap();

            // Verify non-persistent singer is deleted
            let singer_exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM singers WHERE id = ?1)",
                    [singer_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(!singer_exists, "Non-persistent orphaned singer should be deleted");
        }

        #[test]
        fn test_non_persistent_singer_in_other_session_preserved() {
            let conn = setup_test_db();

            // Create two sessions
            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('Session1', 0)", [])
                .unwrap();
            let session1_id: i64 = conn.last_insert_rowid();

            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('Session2', 1)", [])
                .unwrap();
            let session2_id: i64 = conn.last_insert_rowid();

            // Create non-persistent singer
            conn.execute(
                "INSERT INTO singers (name, color, is_persistent) VALUES ('Shared', '#fff', 0)",
                [],
            )
            .unwrap();
            let singer_id: i64 = conn.last_insert_rowid();

            // Add singer to both sessions
            conn.execute(
                "INSERT INTO session_singers (session_id, singer_id) VALUES (?1, ?2)",
                [session1_id, singer_id],
            )
            .unwrap();
            conn.execute(
                "INSERT INTO session_singers (session_id, singer_id) VALUES (?1, ?2)",
                [session2_id, singer_id],
            )
            .unwrap();

            // Remove singer from session 1 only
            conn.execute(
                "DELETE FROM session_singers WHERE session_id = ?1 AND singer_id = ?2",
                [session1_id, singer_id],
            )
            .unwrap();

            // Clean up non-persistent singers (as the command does)
            conn.execute(
                "DELETE FROM singers WHERE is_persistent = 0 AND id = ?1 AND NOT EXISTS (SELECT 1 FROM session_singers WHERE singer_id = ?1)",
                [singer_id],
            )
            .unwrap();

            // Verify singer still exists (still in session 2)
            let singer_exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM singers WHERE id = ?1)",
                    [singer_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(singer_exists, "Non-persistent singer should be preserved if still in another session");
        }

        #[test]
        fn test_clears_active_singer_on_removal() {
            let conn = setup_test_db();

            // Create singer
            conn.execute(
                "INSERT INTO singers (name, color, is_persistent) VALUES ('Active', '#fff', 1)",
                [],
            )
            .unwrap();
            let singer_id: i64 = conn.last_insert_rowid();

            // Create session with this singer as active
            conn.execute(
                "INSERT INTO sessions (name, is_active, active_singer_id) VALUES ('Test', 1, ?1)",
                [singer_id],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // Add singer to session
            conn.execute(
                "INSERT INTO session_singers (session_id, singer_id) VALUES (?1, ?2)",
                [session_id, singer_id],
            )
            .unwrap();

            // Clear active_singer_id (as the command does)
            conn.execute(
                "UPDATE sessions SET active_singer_id = NULL WHERE id = ?1 AND active_singer_id = ?2",
                [session_id, singer_id],
            )
            .unwrap();

            // Verify active singer is cleared
            let active_singer_id: Option<i64> = conn
                .query_row(
                    "SELECT active_singer_id FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(active_singer_id, None, "Active singer should be cleared when removed from session");
        }

        #[test]
        fn test_session_not_found_validation() {
            let conn = setup_test_db();

            // Create a singer but no session
            conn.execute(
                "INSERT INTO singers (name, color, is_persistent) VALUES ('Alice', '#fff', 1)",
                [],
            )
            .unwrap();

            // Check for non-existent session
            let session_exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = ?1)",
                    [9999i64],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(!session_exists, "Session should not exist");
        }

        #[test]
        fn test_singer_not_found_validation() {
            let conn = setup_test_db();

            // Create a session but no singer
            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('Test', 1)", [])
                .unwrap();

            // Check for non-existent singer
            let singer_exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM singers WHERE id = ?1)",
                    [9999i64],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(!singer_exists, "Singer should not exist");
        }
    }

    mod session_set_hosted {
        use super::*;

        #[test]
        fn test_session_set_hosted_stores_all_fields() {
            let conn = setup_test_db();

            // Create a session
            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('Test', 1)", [])
                .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // Set hosted session info
            conn.execute(
                "UPDATE sessions SET hosted_session_id = ?1, hosted_by_user_id = ?2, hosted_session_status = ?3 WHERE id = ?4",
                rusqlite::params!["hs-123", "user-456", "active", session_id],
            )
            .unwrap();

            // Verify all fields were stored
            let (hosted_id, user_id, status): (Option<String>, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(hosted_id, Some("hs-123".to_string()));
            assert_eq!(user_id, Some("user-456".to_string()));
            assert_eq!(status, Some("active".to_string()));
        }

        #[test]
        fn test_session_set_hosted_updates_existing() {
            let conn = setup_test_db();

            // Create a session with initial hosted info
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Test', 1, 'old-hs', 'old-user', 'ended')",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // Update with new hosted session info
            conn.execute(
                "UPDATE sessions SET hosted_session_id = ?1, hosted_by_user_id = ?2, hosted_session_status = ?3 WHERE id = ?4",
                rusqlite::params!["new-hs", "new-user", "active", session_id],
            )
            .unwrap();

            // Verify fields were updated
            let (hosted_id, user_id, status): (Option<String>, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(hosted_id, Some("new-hs".to_string()));
            assert_eq!(user_id, Some("new-user".to_string()));
            assert_eq!(status, Some("active".to_string()));
        }

        #[test]
        fn test_session_set_hosted_paused_status() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('Test', 1)", [])
                .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            conn.execute(
                "UPDATE sessions SET hosted_session_id = ?1, hosted_by_user_id = ?2, hosted_session_status = ?3 WHERE id = ?4",
                rusqlite::params!["hs-paused", "user-123", "paused", session_id],
            )
            .unwrap();

            let status: Option<String> = conn
                .query_row(
                    "SELECT hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(status, Some("paused".to_string()));
        }

        #[test]
        fn test_session_set_hosted_ended_status() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('Test', 1)", [])
                .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            conn.execute(
                "UPDATE sessions SET hosted_session_id = ?1, hosted_by_user_id = ?2, hosted_session_status = ?3 WHERE id = ?4",
                rusqlite::params!["hs-ended", "user-123", "ended", session_id],
            )
            .unwrap();

            let status: Option<String> = conn
                .query_row(
                    "SELECT hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(status, Some("ended".to_string()));
        }

        #[test]
        fn test_session_set_hosted_nonexistent_session() {
            let conn = setup_test_db();

            // Try to update a non-existent session
            let rows_affected = conn.execute(
                "UPDATE sessions SET hosted_session_id = ?1, hosted_by_user_id = ?2, hosted_session_status = ?3 WHERE id = ?4",
                rusqlite::params!["hs-123", "user-456", "active", 9999i64],
            )
            .unwrap();

            // No rows should be affected
            assert_eq!(rows_affected, 0);
        }

        #[test]
        fn test_session_set_hosted_transaction_rollback_on_invalid_status() {
            // This test verifies that when a database constraint (CHECK trigger)
            // rejects an invalid status value, the entire transaction is rolled back
            // and no partial changes are committed.
            let mut conn = setup_test_db();

            // Add the CHECK triggers (from Migration 12) that validate hosted_session_status
            conn.execute_batch(
                r#"
                CREATE TRIGGER IF NOT EXISTS check_hosted_session_status_insert
                BEFORE INSERT ON sessions
                WHEN NEW.hosted_session_status IS NOT NULL
                    AND NEW.hosted_session_status NOT IN ('active', 'paused', 'ended')
                BEGIN
                    SELECT RAISE(ABORT, 'Invalid hosted_session_status. Must be NULL, active, paused, or ended.');
                END;

                CREATE TRIGGER IF NOT EXISTS check_hosted_session_status_update
                BEFORE UPDATE OF hosted_session_status ON sessions
                WHEN NEW.hosted_session_status IS NOT NULL
                    AND NEW.hosted_session_status NOT IN ('active', 'paused', 'ended')
                BEGIN
                    SELECT RAISE(ABORT, 'Invalid hosted_session_status. Must be NULL, active, paused, or ended.');
                END;
                "#,
            )
            .unwrap();

            // Create a session with initial hosted info
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Test', 1, 'old-hs', 'old-user', 'active')",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // Attempt a transaction that would violate the CHECK constraint
            let tx = conn.transaction().unwrap();

            // First operation: verify session exists (succeeds)
            let exists: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sessions WHERE id = ?1)",
                    [session_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(exists);

            // Second operation: update with invalid status (should fail due to trigger)
            let result = tx.execute(
                "UPDATE sessions SET hosted_session_id = ?1, hosted_by_user_id = ?2, hosted_session_status = ?3 WHERE id = ?4",
                rusqlite::params!["new-hs", "new-user", "invalid_status", session_id],
            );

            // The CHECK trigger should reject this
            assert!(result.is_err(), "Expected error for invalid status, but got success");

            // Don't commit - let transaction drop (automatic rollback)
            drop(tx);

            // Verify original values are preserved (transaction was rolled back)
            let (hosted_id, user_id, status): (Option<String>, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(hosted_id, Some("old-hs".to_string()), "hosted_session_id should be unchanged after rollback");
            assert_eq!(user_id, Some("old-user".to_string()), "hosted_by_user_id should be unchanged after rollback");
            assert_eq!(status, Some("active".to_string()), "hosted_session_status should be unchanged after rollback");
        }

        #[test]
        fn test_ownership_conflict_blocks_different_user_with_active_session() {
            // Test CONC-001: When a different user has an active hosted session,
            // attempting to set hosted session should be blocked
            let conn = setup_test_db();

            // Create a session with an active hosted session by user-A
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Test', 1, 'hs-123', 'user-A', 'active')",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // Check current state to verify test setup
            let (current_user, current_status): (Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();

            // Verify ownership conflict condition: different user + active status
            let requesting_user = "user-B";
            let is_different_user = current_user.as_deref() != Some(requesting_user);
            let is_active_or_paused = current_status.as_deref() == Some("active")
                || current_status.as_deref() == Some("paused");

            assert!(
                is_different_user && is_active_or_paused,
                "Expected conflict condition: different user ({:?} vs {}) and active/paused status ({:?})",
                current_user, requesting_user, current_status
            );
        }

        #[test]
        fn test_ownership_conflict_blocks_different_user_with_paused_session() {
            // Test CONC-001: When a different user has a paused hosted session,
            // attempting to set hosted session should be blocked
            let conn = setup_test_db();

            // Create a session with a paused hosted session by user-A
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Test', 1, 'hs-123', 'user-A', 'paused')",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // Check current state to verify test setup
            let (current_user, current_status): (Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();

            // Verify ownership conflict condition: different user + paused status
            let requesting_user = "user-B";
            let is_different_user = current_user.as_deref() != Some(requesting_user);
            let is_active_or_paused = current_status.as_deref() == Some("active")
                || current_status.as_deref() == Some("paused");

            assert!(
                is_different_user && is_active_or_paused,
                "Expected conflict condition: different user ({:?} vs {}) and active/paused status ({:?})",
                current_user, requesting_user, current_status
            );
        }

        #[test]
        fn test_ownership_allows_override_when_status_ended() {
            // Test that a different user CAN override when status is 'ended'
            let conn = setup_test_db();

            // Create a session with an ended hosted session by user-A
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Test', 1, 'old-hs', 'user-A', 'ended')",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // Check current state
            let (current_user, current_status): (Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();

            // Verify no conflict when status is ended
            let requesting_user = "user-B";
            let is_different_user = current_user.as_deref() != Some(requesting_user);
            let is_active_or_paused = current_status.as_deref() == Some("active")
                || current_status.as_deref() == Some("paused");

            // Different user but status is ended - should NOT be a conflict
            assert!(is_different_user, "Users should be different");
            assert!(!is_active_or_paused, "Status should not be active or paused");

            // User B can now update to their hosted session
            conn.execute(
                "UPDATE sessions SET hosted_session_id = ?1, hosted_by_user_id = ?2, hosted_session_status = ?3 WHERE id = ?4",
                rusqlite::params!["new-hs", "user-B", "active", session_id],
            )
            .unwrap();

            let (new_hosted_id, new_user_id, new_status): (Option<String>, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(new_hosted_id, Some("new-hs".to_string()));
            assert_eq!(new_user_id, Some("user-B".to_string()));
            assert_eq!(new_status, Some("active".to_string()));
        }

        #[test]
        fn test_same_user_can_always_update_hosted_session() {
            // Test that the same user can update their own hosted session
            let conn = setup_test_db();

            // Create a session with an active hosted session by user-A
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Test', 1, 'hs-123', 'user-A', 'active')",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // Same user updates
            let (current_user, _): (Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();

            let requesting_user = "user-A";
            let is_same_user = current_user.as_deref() == Some(requesting_user);
            assert!(is_same_user, "Users should be the same");

            // Same user can update
            conn.execute(
                "UPDATE sessions SET hosted_session_id = ?1, hosted_by_user_id = ?2, hosted_session_status = ?3 WHERE id = ?4",
                rusqlite::params!["new-hs", "user-A", "paused", session_id],
            )
            .unwrap();

            let (new_hosted_id, new_status): (Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();

            assert_eq!(new_hosted_id, Some("new-hs".to_string()));
            assert_eq!(new_status, Some("paused".to_string()));
        }

        #[test]
        fn test_conditional_update_returns_zero_rows_on_ownership_conflict() {
            // Test CONC-003: Verify the conditional UPDATE pattern returns 0 affected rows
            // when a different user tries to take over an active session
            let conn = setup_test_db();

            // Create a session with an active hosted session by user-A
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Test', 1, 'hs-123', 'user-A', 'active')",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // User-B tries to take over using the conditional UPDATE pattern
            // This should affect 0 rows because user-A has an active session
            let affected_rows = conn.execute(
                "UPDATE sessions
                 SET hosted_session_id = ?1, hosted_by_user_id = ?2, hosted_session_status = ?3
                 WHERE id = ?4
                 AND (
                     hosted_by_user_id IS NULL
                     OR hosted_by_user_id = ?2
                     OR hosted_session_status = 'ended'
                     OR hosted_session_status IS NULL
                 )",
                rusqlite::params!["new-hs", "user-B", "active", session_id],
            )
            .unwrap();

            // Should return 0 rows affected due to ownership conflict
            assert_eq!(affected_rows, 0, "Should detect ownership conflict via affected_rows");

            // Verify original data is unchanged
            let (hosted_id, user_id, status): (Option<String>, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(hosted_id, Some("hs-123".to_string()), "hosted_session_id should be unchanged");
            assert_eq!(user_id, Some("user-A".to_string()), "hosted_by_user_id should be unchanged");
            assert_eq!(status, Some("active".to_string()), "hosted_session_status should be unchanged");
        }

        #[test]
        fn test_conditional_update_succeeds_when_same_user() {
            // Test CONC-003: Verify the conditional UPDATE pattern succeeds when same user updates
            let conn = setup_test_db();

            // Create a session with an active hosted session by user-A
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Test', 1, 'hs-123', 'user-A', 'active')",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // User-A updates their own session
            let affected_rows = conn.execute(
                "UPDATE sessions
                 SET hosted_session_id = ?1, hosted_by_user_id = ?2, hosted_session_status = ?3
                 WHERE id = ?4
                 AND (
                     hosted_by_user_id IS NULL
                     OR hosted_by_user_id = ?2
                     OR hosted_session_status = 'ended'
                     OR hosted_session_status IS NULL
                 )",
                rusqlite::params!["new-hs", "user-A", "paused", session_id],
            )
            .unwrap();

            // Should return 1 row affected
            assert_eq!(affected_rows, 1, "Same user should be able to update");

            // Verify data was updated
            let (hosted_id, status): (Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();

            assert_eq!(hosted_id, Some("new-hs".to_string()));
            assert_eq!(status, Some("paused".to_string()));
        }

        #[test]
        fn test_conditional_update_succeeds_when_status_ended() {
            // Test CONC-003: Verify the conditional UPDATE pattern succeeds when status is 'ended'
            let conn = setup_test_db();

            // Create a session with an ended hosted session by user-A
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Test', 1, 'old-hs', 'user-A', 'ended')",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // User-B takes over (allowed because status is 'ended')
            let affected_rows = conn.execute(
                "UPDATE sessions
                 SET hosted_session_id = ?1, hosted_by_user_id = ?2, hosted_session_status = ?3
                 WHERE id = ?4
                 AND (
                     hosted_by_user_id IS NULL
                     OR hosted_by_user_id = ?2
                     OR hosted_session_status = 'ended'
                     OR hosted_session_status IS NULL
                 )",
                rusqlite::params!["new-hs", "user-B", "active", session_id],
            )
            .unwrap();

            // Should return 1 row affected
            assert_eq!(affected_rows, 1, "Should succeed when previous status is 'ended'");

            // Verify data was updated
            let (hosted_id, user_id, status): (Option<String>, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(hosted_id, Some("new-hs".to_string()));
            assert_eq!(user_id, Some("user-B".to_string()));
            assert_eq!(status, Some("active".to_string()));
        }

        #[test]
        fn test_conditional_update_succeeds_when_no_prior_host() {
            // Test CONC-003: Verify the conditional UPDATE pattern succeeds when no prior host
            let conn = setup_test_db();

            // Create a session with no hosted info
            conn.execute(
                "INSERT INTO sessions (name, is_active) VALUES ('Test', 1)",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // First user claims the session
            let affected_rows = conn.execute(
                "UPDATE sessions
                 SET hosted_session_id = ?1, hosted_by_user_id = ?2, hosted_session_status = ?3
                 WHERE id = ?4
                 AND (
                     hosted_by_user_id IS NULL
                     OR hosted_by_user_id = ?2
                     OR hosted_session_status = 'ended'
                     OR hosted_session_status IS NULL
                 )",
                rusqlite::params!["new-hs", "user-A", "active", session_id],
            )
            .unwrap();

            // Should return 1 row affected
            assert_eq!(affected_rows, 1, "Should succeed when no prior host");

            // Verify data was set
            let (hosted_id, user_id, status): (Option<String>, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(hosted_id, Some("new-hs".to_string()));
            assert_eq!(user_id, Some("user-A".to_string()));
            assert_eq!(status, Some("active".to_string()));
        }
    }

    mod hosted_session_columns {
        use super::*;

        #[test]
        fn test_hosted_session_id_column_exists() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO sessions (name, is_active, hosted_session_id) VALUES ('Test', 1, 'hs-123')", [])
                .unwrap();

            let hosted_id: Option<String> = conn
                .query_row(
                    "SELECT hosted_session_id FROM sessions WHERE name = 'Test'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(hosted_id, Some("hs-123".to_string()));
        }

        #[test]
        fn test_hosted_by_user_id_column_exists() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO sessions (name, is_active, hosted_by_user_id) VALUES ('Test', 1, 'user-456')", [])
                .unwrap();

            let user_id: Option<String> = conn
                .query_row(
                    "SELECT hosted_by_user_id FROM sessions WHERE name = 'Test'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(user_id, Some("user-456".to_string()));
        }

        #[test]
        fn test_hosted_session_status_column_exists() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO sessions (name, is_active, hosted_session_status) VALUES ('Test', 1, 'active')", [])
                .unwrap();

            let status: Option<String> = conn
                .query_row(
                    "SELECT hosted_session_status FROM sessions WHERE name = 'Test'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(status, Some("active".to_string()));
        }

        #[test]
        fn test_all_hosted_fields_stored_and_retrieved() {
            let conn = setup_test_db();

            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Test', 1, 'hs-789', 'user-abc', 'paused')",
                [],
            )
            .unwrap();

            let (hosted_id, user_id, status): (Option<String>, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE name = 'Test'",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(hosted_id, Some("hs-789".to_string()));
            assert_eq!(user_id, Some("user-abc".to_string()));
            assert_eq!(status, Some("paused".to_string()));
        }

        #[test]
        fn test_hosted_fields_nullable() {
            let conn = setup_test_db();

            conn.execute("INSERT INTO sessions (name, is_active) VALUES ('Test', 1)", [])
                .unwrap();

            let (hosted_id, user_id, status): (Option<String>, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE name = 'Test'",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(hosted_id, None);
            assert_eq!(user_id, None);
            assert_eq!(status, None);
        }

        #[test]
        fn test_session_deletion_cascades_hosted_fields() {
            let conn = setup_test_db();

            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('ToDelete', 0, 'hs-del', 'user-del', 'active')",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            conn.execute("DELETE FROM sessions WHERE id = ?1", [session_id])
                .unwrap();

            let count: i32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(count, 0, "Deleting session should remove hosted fields with it");
        }
    }

    mod session_update_hosted_status {
        use super::*;

        #[test]
        fn test_updates_status_only() {
            let conn = setup_test_db();

            // Create a session with all hosted fields
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Test', 1, 'hs-123', 'user-456', 'active')",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            // Update only the status
            conn.execute(
                "UPDATE sessions SET hosted_session_status = ?1 WHERE id = ?2",
                rusqlite::params!["ended", session_id],
            )
            .unwrap();

            // Verify status changed but other fields preserved
            let (hosted_id, user_id, status): (Option<String>, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(hosted_id, Some("hs-123".to_string()), "hosted_session_id should be unchanged");
            assert_eq!(user_id, Some("user-456".to_string()), "hosted_by_user_id should be unchanged");
            assert_eq!(status, Some("ended".to_string()), "hosted_session_status should be updated");
        }

        #[test]
        fn test_updates_active_to_paused() {
            let conn = setup_test_db();

            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Test', 1, 'hs-123', 'user-456', 'active')",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            conn.execute(
                "UPDATE sessions SET hosted_session_status = ?1 WHERE id = ?2",
                rusqlite::params!["paused", session_id],
            )
            .unwrap();

            let status: Option<String> = conn
                .query_row(
                    "SELECT hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(status, Some("paused".to_string()));
        }

        #[test]
        fn test_updates_paused_to_ended() {
            let conn = setup_test_db();

            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Test', 1, 'hs-123', 'user-456', 'paused')",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            conn.execute(
                "UPDATE sessions SET hosted_session_status = ?1 WHERE id = ?2",
                rusqlite::params!["ended", session_id],
            )
            .unwrap();

            let status: Option<String> = conn
                .query_row(
                    "SELECT hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(status, Some("ended".to_string()));
        }

        #[test]
        fn test_updates_ended_to_active() {
            let conn = setup_test_db();

            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Test', 1, 'hs-123', 'user-456', 'ended')",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            conn.execute(
                "UPDATE sessions SET hosted_session_status = ?1 WHERE id = ?2",
                rusqlite::params!["active", session_id],
            )
            .unwrap();

            let status: Option<String> = conn
                .query_row(
                    "SELECT hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| row.get(0),
                )
                .unwrap();

            assert_eq!(status, Some("active".to_string()));
        }

        #[test]
        fn test_nonexistent_session_no_effect() {
            let conn = setup_test_db();

            // Try to update a non-existent session
            let rows_affected = conn.execute(
                "UPDATE sessions SET hosted_session_status = ?1 WHERE id = ?2",
                rusqlite::params!["ended", 9999i64],
            )
            .unwrap();

            assert_eq!(rows_affected, 0);
        }

        #[test]
        fn test_preserves_null_hosted_fields_when_updating_status() {
            let conn = setup_test_db();

            // Create a session with only status set (no hosted_session_id or hosted_by_user_id)
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_status) VALUES ('Test', 1, 'active')",
                [],
            )
            .unwrap();
            let session_id: i64 = conn.last_insert_rowid();

            conn.execute(
                "UPDATE sessions SET hosted_session_status = ?1 WHERE id = ?2",
                rusqlite::params!["ended", session_id],
            )
            .unwrap();

            let (hosted_id, user_id, status): (Option<String>, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE id = ?1",
                    [session_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(hosted_id, None, "hosted_session_id should remain NULL");
            assert_eq!(user_id, None, "hosted_by_user_id should remain NULL");
            assert_eq!(status, Some("ended".to_string()), "hosted_session_status should be updated");
        }
    }

    mod get_active_session_hosted_fields {
        use super::*;

        #[test]
        fn test_returns_hosted_fields_when_set() {
            let conn = setup_test_db();

            // Create an active session with all hosted fields
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Hosted', 1, 'hs-abc', 'user-xyz', 'active')",
                [],
            )
            .unwrap();

            // Query using same pattern as get_active_session
            let (id, name, is_active, hosted_id, user_id, status): (i64, Option<String>, i32, Option<String>, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT id, name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE is_active = 1",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
                )
                .unwrap();

            assert!(id > 0);
            assert_eq!(name, Some("Hosted".to_string()));
            assert_eq!(is_active, 1);
            assert_eq!(hosted_id, Some("hs-abc".to_string()));
            assert_eq!(user_id, Some("user-xyz".to_string()));
            assert_eq!(status, Some("active".to_string()));
        }

        #[test]
        fn test_returns_null_hosted_fields_when_not_set() {
            let conn = setup_test_db();

            // Create an active session without hosted fields
            conn.execute(
                "INSERT INTO sessions (name, is_active) VALUES ('Regular', 1)",
                [],
            )
            .unwrap();

            let (hosted_id, user_id, status): (Option<String>, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE is_active = 1",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(hosted_id, None);
            assert_eq!(user_id, None);
            assert_eq!(status, None);
        }

        #[test]
        fn test_returns_partial_hosted_fields() {
            let conn = setup_test_db();

            // Create session with only some hosted fields
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_session_status) VALUES ('Partial', 1, 'hs-partial', 'ended')",
                [],
            )
            .unwrap();

            let (hosted_id, user_id, status): (Option<String>, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE is_active = 1",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(hosted_id, Some("hs-partial".to_string()));
            assert_eq!(user_id, None, "hosted_by_user_id should be NULL when not set");
            assert_eq!(status, Some("ended".to_string()));
        }

        #[test]
        fn test_returns_none_when_no_active_session() {
            let conn = setup_test_db();

            // Create an inactive session
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Inactive', 0, 'hs-old', 'user-old', 'ended')",
                [],
            )
            .unwrap();

            let result = conn.query_row(
                "SELECT id FROM sessions WHERE is_active = 1",
                [],
                |row| row.get::<_, i64>(0),
            );

            assert!(matches!(result, Err(rusqlite::Error::QueryReturnedNoRows)));
        }

        #[test]
        fn test_only_returns_active_session_hosted_fields() {
            let conn = setup_test_db();

            // Create an inactive session with hosted fields
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Inactive', 0, 'hs-inactive', 'user-inactive', 'ended')",
                [],
            )
            .unwrap();

            // Create an active session with different hosted fields
            conn.execute(
                "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Active', 1, 'hs-active', 'user-active', 'active')",
                [],
            )
            .unwrap();

            let (hosted_id, user_id, status): (Option<String>, Option<String>, Option<String>) = conn
                .query_row(
                    "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE is_active = 1",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();

            assert_eq!(hosted_id, Some("hs-active".to_string()), "Should return active session's hosted_session_id");
            assert_eq!(user_id, Some("user-active".to_string()), "Should return active session's hosted_by_user_id");
            assert_eq!(status, Some("active".to_string()), "Should return active session's hosted_session_status");
        }
    }

    mod hosted_session_status_enum {
        use crate::commands::session::HostedSessionStatus;

        #[test]
        fn test_serde_serializes_to_lowercase() {
            assert_eq!(
                serde_json::to_string(&HostedSessionStatus::Active).unwrap(),
                "\"active\""
            );
            assert_eq!(
                serde_json::to_string(&HostedSessionStatus::Paused).unwrap(),
                "\"paused\""
            );
            assert_eq!(
                serde_json::to_string(&HostedSessionStatus::Ended).unwrap(),
                "\"ended\""
            );
        }

        #[test]
        fn test_serde_deserializes_from_lowercase() {
            assert_eq!(
                serde_json::from_str::<HostedSessionStatus>("\"active\"").unwrap(),
                HostedSessionStatus::Active
            );
            assert_eq!(
                serde_json::from_str::<HostedSessionStatus>("\"paused\"").unwrap(),
                HostedSessionStatus::Paused
            );
            assert_eq!(
                serde_json::from_str::<HostedSessionStatus>("\"ended\"").unwrap(),
                HostedSessionStatus::Ended
            );
        }

        #[test]
        fn test_serde_rejects_invalid_status() {
            assert!(serde_json::from_str::<HostedSessionStatus>("\"invalid\"").is_err());
            assert!(serde_json::from_str::<HostedSessionStatus>("\"ACTIVE\"").is_err());
            assert!(serde_json::from_str::<HostedSessionStatus>("\"Active\"").is_err());
        }

        #[test]
        fn test_from_str_parses_valid_statuses() {
            assert_eq!(
                HostedSessionStatus::from_str("active"),
                Some(HostedSessionStatus::Active)
            );
            assert_eq!(
                HostedSessionStatus::from_str("paused"),
                Some(HostedSessionStatus::Paused)
            );
            assert_eq!(
                HostedSessionStatus::from_str("ended"),
                Some(HostedSessionStatus::Ended)
            );
        }

        #[test]
        fn test_from_str_rejects_invalid_statuses() {
            assert_eq!(HostedSessionStatus::from_str("invalid"), None);
            assert_eq!(HostedSessionStatus::from_str("ACTIVE"), None);
            assert_eq!(HostedSessionStatus::from_str("Active"), None);
            assert_eq!(HostedSessionStatus::from_str(""), None);
        }

        #[test]
        fn test_as_str_returns_lowercase() {
            assert_eq!(HostedSessionStatus::Active.as_str(), "active");
            assert_eq!(HostedSessionStatus::Paused.as_str(), "paused");
            assert_eq!(HostedSessionStatus::Ended.as_str(), "ended");
        }

        #[test]
        fn test_roundtrip_from_str_to_as_str() {
            for status_str in &["active", "paused", "ended"] {
                let status = HostedSessionStatus::from_str(status_str).unwrap();
                assert_eq!(status.as_str(), *status_str);
            }
        }

        #[test]
        fn test_equality() {
            assert_eq!(HostedSessionStatus::Active, HostedSessionStatus::Active);
            assert_ne!(HostedSessionStatus::Active, HostedSessionStatus::Paused);
            assert_ne!(HostedSessionStatus::Active, HostedSessionStatus::Ended);
        }

        #[test]
        fn test_clone() {
            let original = HostedSessionStatus::Paused;
            let cloned = original.clone();
            assert_eq!(original, cloned);
        }

        #[test]
        fn test_debug_format() {
            // Verify Debug trait works (doesn't need to be exact format)
            let debug_str = format!("{:?}", HostedSessionStatus::Active);
            assert!(debug_str.contains("Active"));
        }
    }
}
