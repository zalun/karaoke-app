use super::errors::{CommandError, LockResultExt};
use crate::AppState;
use log::{debug, info};
use tauri::State;

/// Add a search query to history (upserts - updates timestamp if exists)
#[tauri::command]
pub fn search_history_add(
    state: State<'_, AppState>,
    session_id: i64,
    search_type: String,
    query: String,
) -> Result<(), CommandError> {
    // Validate search_type
    if search_type != "youtube" && search_type != "local" {
        return Err(CommandError::Validation(
            "search_type must be 'youtube' or 'local'".to_string(),
        ));
    }

    // Validate and normalize query
    let query = query.trim().to_string();
    if query.is_empty() {
        return Err(CommandError::Validation(
            "Query cannot be empty".to_string(),
        ));
    }

    debug!(
        "Adding search history: session={}, type={}, query={}",
        session_id, search_type, query
    );
    let db = state.db.lock().map_lock_err()?;

    // Upsert: insert or update timestamp if exists
    db.connection().execute(
        "INSERT INTO search_history (session_id, search_type, query, searched_at)
         VALUES (?1, ?2, ?3, datetime('now'))
         ON CONFLICT(session_id, search_type, query)
         DO UPDATE SET searched_at = datetime('now')",
        rusqlite::params![session_id, search_type, query],
    )?;

    Ok(())
}

/// Get search history suggestions
/// If global=false, returns only current session's history
/// If global=true, returns combined history across all sessions (deduplicated)
#[tauri::command]
pub fn search_history_get(
    state: State<'_, AppState>,
    search_type: String,
    session_id: Option<i64>,
    limit: i32,
    global: bool,
) -> Result<Vec<String>, CommandError> {
    debug!(
        "Getting search history: type={}, session={:?}, limit={}, global={}",
        search_type, session_id, limit, global
    );

    let db = state.db.lock().map_lock_err()?;

    let queries: Vec<String> = if global {
        // Global: get unique queries across all sessions, ordered by most recent
        let mut stmt = db.connection().prepare(
            "SELECT query FROM search_history
             WHERE search_type = ?1
             GROUP BY query
             ORDER BY MAX(searched_at) DESC
             LIMIT ?2",
        )?;

        let result: Vec<String> = stmt
            .query_map(rusqlite::params![search_type, limit], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        result
    } else if let Some(sid) = session_id {
        // Per-session only
        let mut stmt = db.connection().prepare(
            "SELECT query FROM search_history
             WHERE session_id = ?1 AND search_type = ?2
             ORDER BY searched_at DESC
             LIMIT ?3",
        )?;

        let result: Vec<String> = stmt
            .query_map(rusqlite::params![sid, search_type, limit], |row| row.get(0))?
            .collect::<Result<Vec<_>, _>>()?;
        result
    } else {
        Vec::new()
    };

    debug!("Returning {} search history entries", queries.len());
    Ok(queries)
}

/// Clear all search history
#[tauri::command]
pub fn search_history_clear(state: State<'_, AppState>) -> Result<(), CommandError> {
    info!("Clearing all search history");
    let db = state.db.lock().map_lock_err()?;

    db.connection().execute("DELETE FROM search_history", [])?;

    Ok(())
}

/// Clear search history for a specific session only
#[tauri::command]
pub fn search_history_clear_session(
    state: State<'_, AppState>,
    session_id: i64,
) -> Result<(), CommandError> {
    info!("Clearing search history for session: {}", session_id);
    let db = state.db.lock().map_lock_err()?;

    db.connection().execute(
        "DELETE FROM search_history WHERE session_id = ?1",
        [session_id],
    )?;

    Ok(())
}
