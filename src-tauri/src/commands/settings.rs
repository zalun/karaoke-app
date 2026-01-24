use crate::AppState;
use log::debug;
use std::collections::HashMap;
use std::sync::atomic::Ordering;
use tauri::State;

/// Allowed setting keys - prevents arbitrary key injection
const ALLOWED_SETTING_KEYS: &[&str] = &[
    "video_quality",
    "autoplay_next",
    "default_volume",
    "last_volume",              // remembered volume level for "remember" mode
    "prefetch_seconds",
    "next_song_overlay_seconds",
    "singer_announcement_seconds",
    "remember_player_position",
    "history_limit",
    "clear_queue_on_exit",
    "debug_mode",
    "playback_mode",
    "ytdlp_available",          // cached yt-dlp check result
    "search_include_lyrics",    // include lyrics content in local library search
    "youtube_api_key",          // YouTube Data API key
    "youtube_search_method",    // "auto" | "api" | "ytdlp"
    // Search history settings
    "search_history_global",         // show history from all sessions
    "search_history_session_limit",  // max entries per session
    "search_history_global_limit",   // max entries when showing global
    // Hosted session persistence
    "hosted_session_id",        // persisted session ID for restoration after app restart
];

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

    // Canonicalize the path to resolve symlinks and validate it exists
    let canonical_path = log_dir
        .canonicalize()
        .map_err(|e| format!("Invalid log directory path: {}", e))?;

    // Validate it's a directory
    if !canonical_path.is_dir() {
        return Err(format!("Log path is not a directory: {:?}", canonical_path));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&canonical_path)
            .spawn()
            .map_err(|e| format!("Failed to open log folder: {}", e))?;
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&canonical_path)
            .spawn()
            .map_err(|e| format!("Failed to open log folder: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&canonical_path)
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

    // Validate all keys are in the allowlist
    for key in defaults.keys() {
        if !ALLOWED_SETTING_KEYS.contains(&key.as_str()) {
            return Err(format!("Invalid setting key: {}", key));
        }
    }

    match state.db.lock() {
        Ok(mut db) => {
            // Use rusqlite's Transaction API for proper RAII-based transaction handling
            let tx = db
                .connection_mut()
                .transaction()
                .map_err(|e| format!("Failed to begin transaction: {}", e))?;

            for (key, value) in defaults.iter() {
                tx.execute(
                    "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)
                     ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = CURRENT_TIMESTAMP",
                    rusqlite::params![key, value],
                )
                .map_err(|e| format!("Failed to reset setting {}: {}", key, e))?;
            }

            tx.commit()
                .map_err(|e| format!("Failed to commit transaction: {}", e))?;

            log::info!("All settings reset to defaults");
            Ok(())
        }
        Err(e) => Err(format!(
            "Failed to acquire database lock for settings_reset_all: {}",
            e
        )),
    }
}
