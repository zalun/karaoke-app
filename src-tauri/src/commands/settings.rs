use crate::AppState;
use log::debug;
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use tauri::State;

/// Get the current debug mode state
#[tauri::command]
pub fn get_debug_mode(state: State<'_, AppState>) -> bool {
    let enabled = state.debug_mode.load(Ordering::SeqCst);
    debug!("get_debug_mode called, returning: {}", enabled);
    enabled
}

/// Set the debug mode state
#[tauri::command]
pub fn set_debug_mode(state: State<'_, AppState>, enabled: bool) {
    debug!("set_debug_mode called with: {}", enabled);
    state.debug_mode.store(enabled, Ordering::SeqCst);

    // Save to database
    match state.db.lock() {
        Ok(db) => {
            if let Err(e) = db.set_setting("debug_mode", if enabled { "true" } else { "false" }) {
                log::error!("Failed to save debug mode preference: {}", e);
            }
        }
        Err(e) => {
            log::error!("Failed to acquire database lock when saving debug mode: {}", e);
        }
    }
}

/// Get the log directory path
#[tauri::command]
pub fn get_log_path(state: State<'_, AppState>) -> String {
    state.log_dir.to_string_lossy().to_string()
}

/// Get a setting value by key
#[tauri::command]
pub fn settings_get(state: State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    debug!("settings_get called for key: {}", key);
    match state.db.lock() {
        Ok(db) => db.get_setting(&key).map_err(|e| e.to_string()),
        Err(e) => Err(format!("Failed to acquire database lock: {}", e)),
    }
}

/// Set a setting value
#[tauri::command]
pub fn settings_set(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    debug!("settings_set called for key: {} = {}", key, value);
    match state.db.lock() {
        Ok(db) => db.set_setting(&key, &value).map_err(|e| e.to_string()),
        Err(e) => Err(format!("Failed to acquire database lock: {}", e)),
    }
}

/// Get all settings as a key-value map
#[tauri::command]
pub fn settings_get_all(state: State<'_, AppState>) -> Result<HashMap<String, String>, String> {
    debug!("settings_get_all called");
    match state.db.lock() {
        Ok(db) => {
            let conn = db.connection();
            let mut stmt = conn
                .prepare("SELECT key, value FROM settings")
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
                .map_err(|e| e.to_string())?;

            let mut settings = HashMap::new();
            for row in rows {
                let (key, value) = row.map_err(|e| e.to_string())?;
                settings.insert(key, value);
            }
            Ok(settings)
        }
        Err(e) => Err(format!("Failed to acquire database lock: {}", e)),
    }
}

/// Open the log folder in the system file manager
#[tauri::command]
pub fn open_log_folder(state: State<'_, AppState>) -> Result<(), String> {
    let log_dir = &state.log_dir;
    log::info!("Opening log directory from command: {:?}", log_dir);

    // Validate the path exists and is a directory
    if !log_dir.exists() {
        return Err(format!("Log directory does not exist: {:?}", log_dir));
    }
    if !log_dir.is_dir() {
        return Err(format!("Log path is not a directory: {:?}", log_dir));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(log_dir)
            .spawn()
            .map_err(|e| format!("Failed to open log folder: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(log_dir)
            .spawn()
            .map_err(|e| format!("Failed to open log folder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(log_dir)
            .spawn()
            .map_err(|e| format!("Failed to open log folder: {}", e))?;
    }

    Ok(())
}

/// Reset all settings to their default values in a single transaction
#[tauri::command]
pub fn settings_reset_all(
    state: State<'_, AppState>,
    defaults: HashMap<String, String>,
) -> Result<(), String> {
    debug!("settings_reset_all called with {} defaults", defaults.len());
    match state.db.lock() {
        Ok(db) => {
            let conn = db.connection();

            // Use a transaction for atomic reset
            conn.execute("BEGIN TRANSACTION", [])
                .map_err(|e| format!("Failed to begin transaction: {}", e))?;

            for (key, value) in defaults.iter() {
                if let Err(e) = conn.execute(
                    "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)
                     ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = CURRENT_TIMESTAMP",
                    rusqlite::params![key, value],
                ) {
                    // Rollback on error
                    let _ = conn.execute("ROLLBACK", []);
                    return Err(format!("Failed to reset setting {}: {}", key, e));
                }
            }

            conn.execute("COMMIT", [])
                .map_err(|e| format!("Failed to commit transaction: {}", e))?;

            log::info!("All settings reset to defaults");
            Ok(())
        }
        Err(e) => Err(format!("Failed to acquire database lock for settings_reset_all: {}", e)),
    }
}
