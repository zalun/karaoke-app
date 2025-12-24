use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn keep_awake_enable(state: State<AppState>) -> Result<(), String> {
    let mut guard = state.keep_awake.lock().map_err(|e| e.to_string())?;

    if guard.is_none() {
        let awake = keepawake::Builder::default()
            .display(true)
            .idle(true)
            .reason("Karaoke video playing")
            .app_name("Karaoke")
            .app_reverse_domain("com.karaoke.app")
            .create()
            .map_err(|e| format!("Failed to enable keep awake: {}", e))?;

        *guard = Some(awake);
        log::info!("Keep awake enabled");
    }

    Ok(())
}

#[tauri::command]
pub fn keep_awake_disable(state: State<AppState>) -> Result<(), String> {
    let mut guard = state.keep_awake.lock().map_err(|e| e.to_string())?;

    if guard.is_some() {
        *guard = None;
        log::info!("Keep awake disabled");
    }

    Ok(())
}
