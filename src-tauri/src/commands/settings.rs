use crate::AppState;
use log::debug;
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
