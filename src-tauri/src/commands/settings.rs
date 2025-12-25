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
    if let Ok(db) = state.db.lock() {
        let _ = db.set_setting("debug_mode", if enabled { "true" } else { "false" });
    }
}
