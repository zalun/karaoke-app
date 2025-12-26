use crate::AppState;
use log::{debug, info};
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use tauri::State;

#[cfg(target_os = "macos")]
use crate::services::{get_display_configuration, DisplayConfiguration};

/// Saved display configuration from database
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavedDisplayConfig {
    pub id: i64,
    pub config_hash: String,
    pub display_names: Vec<String>,
    pub description: Option<String>,
    pub auto_apply: bool,
    pub created_at: String,
}

/// Window state from database
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowState {
    pub id: i64,
    pub display_config_id: i64,
    pub window_type: String,
    pub target_display_id: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub is_detached: bool,
    pub is_fullscreen: bool,
}


// ============ Display Configuration Commands ============

/// Get the current display configuration (macOS only)
#[cfg(target_os = "macos")]
#[tauri::command]
pub fn display_get_configuration() -> Result<DisplayConfiguration, String> {
    debug!("Getting current display configuration");
    get_display_configuration()
}

/// Get the current display configuration (non-macOS stub)
#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub fn display_get_configuration() -> Result<(), String> {
    Err("Display configuration is only available on macOS".to_string())
}

/// Save a display configuration to the database
#[tauri::command]
pub fn display_save_config(
    state: State<'_, AppState>,
    config_hash: String,
    display_names: Vec<String>,
    description: Option<String>,
    auto_apply: bool,
) -> Result<i64, String> {
    debug!(
        "Saving display config: hash={}, names={:?}, auto_apply={}",
        &config_hash[..8.min(config_hash.len())],
        display_names,
        auto_apply
    );

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let display_names_json = serde_json::to_string(&display_names).map_err(|e| e.to_string())?;

    // First check if config already exists
    let existing_id: Option<i64> = db
        .connection()
        .query_row(
            "SELECT id FROM display_configs WHERE config_hash = ?1",
            [&config_hash],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let id = if let Some(existing) = existing_id {
        // Update existing config (preserves ID so window_state FK references remain valid)
        db.connection()
            .execute(
                "UPDATE display_configs SET display_names = ?1, description = ?2, auto_apply = ?3
                 WHERE id = ?4",
                rusqlite::params![display_names_json, description, auto_apply as i32, existing],
            )
            .map_err(|e| e.to_string())?;
        info!(
            "Updated existing display config: id={}, hash={}",
            existing,
            &config_hash[..8.min(config_hash.len())]
        );
        existing
    } else {
        // Insert new config
        db.connection()
            .execute(
                "INSERT INTO display_configs (config_hash, display_names, description, auto_apply)
                 VALUES (?1, ?2, ?3, ?4)",
                rusqlite::params![config_hash, display_names_json, description, auto_apply as i32],
            )
            .map_err(|e| e.to_string())?;
        let new_id = db.connection().last_insert_rowid();
        info!(
            "Created new display config: id={}, hash={}",
            new_id,
            &config_hash[..8.min(config_hash.len())]
        );
        new_id
    };

    Ok(id)
}

/// Get a saved display configuration by its hash
#[tauri::command]
pub fn display_get_saved_config(
    state: State<'_, AppState>,
    config_hash: String,
) -> Result<Option<SavedDisplayConfig>, String> {
    debug!("Getting saved config for hash: {}", &config_hash[..8.min(config_hash.len())]);

    let db = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db
        .connection()
        .prepare(
            "SELECT id, config_hash, display_names, description, auto_apply, created_at
             FROM display_configs
             WHERE config_hash = ?1",
        )
        .map_err(|e| e.to_string())?;

    let result = stmt
        .query_row([&config_hash], |row| {
            let display_names_json: String = row.get(2)?;
            let display_names: Vec<String> =
                serde_json::from_str(&display_names_json).unwrap_or_default();

            Ok(SavedDisplayConfig {
                id: row.get(0)?,
                config_hash: row.get(1)?,
                display_names,
                description: row.get(3)?,
                auto_apply: row.get::<_, i32>(4)? != 0,
                created_at: row.get(5)?,
            })
        })
        .optional()
        .map_err(|e| e.to_string())?;

    Ok(result)
}

/// Update the auto_apply setting for a display configuration
#[tauri::command]
pub fn display_update_auto_apply(
    state: State<'_, AppState>,
    config_id: i64,
    auto_apply: bool,
) -> Result<(), String> {
    debug!("Updating auto_apply for config {}: {}", config_id, auto_apply);

    let db = state.db.lock().map_err(|e| e.to_string())?;

    let rows_updated = db
        .connection()
        .execute(
            "UPDATE display_configs SET auto_apply = ?1 WHERE id = ?2",
            rusqlite::params![auto_apply as i32, config_id],
        )
        .map_err(|e| e.to_string())?;

    if rows_updated == 0 {
        return Err(format!("Display config {} not found", config_id));
    }

    info!("Updated auto_apply for config {}: {}", config_id, auto_apply);
    Ok(())
}

/// Delete a display configuration
#[tauri::command]
pub fn display_delete_config(
    state: State<'_, AppState>,
    config_id: i64,
) -> Result<(), String> {
    debug!("Deleting display config: {}", config_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Delete window states first (due to foreign key)
    db.connection()
        .execute(
            "DELETE FROM window_state WHERE display_config_id = ?1",
            [config_id],
        )
        .map_err(|e| e.to_string())?;

    let rows_deleted = db
        .connection()
        .execute("DELETE FROM display_configs WHERE id = ?1", [config_id])
        .map_err(|e| e.to_string())?;

    if rows_deleted == 0 {
        return Err(format!("Display config {} not found", config_id));
    }

    info!("Deleted display config: {}", config_id);
    Ok(())
}

// ============ Window State Commands ============

/// Save window state for a display configuration
#[tauri::command]
pub fn window_save_state(
    state: State<'_, AppState>,
    display_config_id: i64,
    window_type: String,
    target_display_id: Option<String>,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    is_detached: bool,
    is_fullscreen: bool,
) -> Result<i64, String> {
    debug!(
        "Saving window state: config={}, type={}, pos=({},{}), size={}x{}, detached={}, fullscreen={}",
        display_config_id, window_type, x, y, width, height, is_detached, is_fullscreen
    );

    let db = state.db.lock().map_err(|e| e.to_string())?;

    // Use INSERT OR REPLACE with a unique constraint on (display_config_id, window_type)
    // First try to update existing
    let rows_updated = db
        .connection()
        .execute(
            "UPDATE window_state
             SET target_display_id = ?1, x = ?2, y = ?3, width = ?4, height = ?5,
                 is_detached = ?6, is_fullscreen = ?7, updated_at = CURRENT_TIMESTAMP
             WHERE display_config_id = ?8 AND window_type = ?9",
            rusqlite::params![
                target_display_id,
                x,
                y,
                width,
                height,
                is_detached as i32,
                is_fullscreen as i32,
                display_config_id,
                window_type
            ],
        )
        .map_err(|e| e.to_string())?;

    if rows_updated == 0 {
        // Insert new record
        db.connection()
            .execute(
                "INSERT INTO window_state
                 (display_config_id, window_type, target_display_id, x, y, width, height, is_detached, is_fullscreen)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                rusqlite::params![
                    display_config_id,
                    window_type,
                    target_display_id,
                    x,
                    y,
                    width,
                    height,
                    is_detached as i32,
                    is_fullscreen as i32
                ],
            )
            .map_err(|e| e.to_string())?;
    }

    let id = db.connection().last_insert_rowid();
    info!(
        "Saved window state: config={}, type={}, id={}",
        display_config_id, window_type, id
    );

    Ok(id)
}

/// Get all window states for a display configuration
#[tauri::command]
pub fn window_get_states(
    state: State<'_, AppState>,
    display_config_id: i64,
) -> Result<Vec<WindowState>, String> {
    debug!("Getting window states for config: {}", display_config_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;

    let mut stmt = db
        .connection()
        .prepare(
            "SELECT id, display_config_id, window_type, target_display_id, x, y, width, height, is_detached, is_fullscreen
             FROM window_state
             WHERE display_config_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let states = stmt
        .query_map([display_config_id], |row| {
            Ok(WindowState {
                id: row.get(0)?,
                display_config_id: row.get(1)?,
                window_type: row.get(2)?,
                target_display_id: row.get(3)?,
                x: row.get(4)?,
                y: row.get(5)?,
                width: row.get(6)?,
                height: row.get(7)?,
                is_detached: row.get::<_, i32>(8)? != 0,
                is_fullscreen: row.get::<_, i32>(9)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    debug!("Found {} window states for config {}", states.len(), display_config_id);
    Ok(states)
}

/// Delete all window states for a display configuration
#[tauri::command]
pub fn window_clear_states(
    state: State<'_, AppState>,
    display_config_id: i64,
) -> Result<(), String> {
    debug!("Clearing window states for config: {}", display_config_id);

    let db = state.db.lock().map_err(|e| e.to_string())?;

    db.connection()
        .execute(
            "DELETE FROM window_state WHERE display_config_id = ?1",
            [display_config_id],
        )
        .map_err(|e| e.to_string())?;

    info!("Cleared window states for config: {}", display_config_id);
    Ok(())
}
