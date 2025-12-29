use super::errors::CommandError;
use crate::AppState;
use tauri::State;

#[tauri::command]
pub fn keep_awake_enable(state: State<AppState>) -> Result<(), CommandError> {
    let mut guard = state
        .keep_awake
        .lock()
        .map_err(|_| CommandError::MutexPoisoned("Keep awake"))?;

    if guard.is_none() {
        let awake = keepawake::Builder::default()
            .display(true)
            .idle(true)
            .reason("HomeKaraoke video playing")
            .app_name("HomeKaraoke")
            .app_reverse_domain("app.homekaraoke")
            .create()
            .map_err(|e| CommandError::External(format!("Failed to enable keep awake: {}", e)))?;

        *guard = Some(awake);
        log::info!("Keep awake enabled");
    }

    Ok(())
}

#[tauri::command]
pub fn keep_awake_disable(state: State<AppState>) -> Result<(), CommandError> {
    let mut guard = state
        .keep_awake
        .lock()
        .map_err(|_| CommandError::MutexPoisoned("Keep awake"))?;

    if guard.is_some() {
        *guard = None;
        log::info!("Keep awake disabled");
    }

    Ok(())
}
