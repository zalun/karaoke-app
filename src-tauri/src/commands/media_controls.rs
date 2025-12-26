use crate::AppState;
use tauri::State;

#[cfg(not(target_os = "macos"))]
use log::debug;

#[tauri::command]
pub fn media_controls_update_metadata(
    state: State<AppState>,
    title: String,
    artist: Option<String>,
    duration_secs: Option<f64>,
    thumbnail_url: Option<String>,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut guard = state
            .media_controls
            .lock()
            .map_err(|_| "Media controls mutex poisoned".to_string())?;
        if let Some(ref mut controls) = *guard {
            controls.set_metadata(
                &title,
                artist.as_deref(),
                duration_secs,
                thumbnail_url.as_deref(),
            )?;
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (state, title, artist, duration_secs, thumbnail_url);
        debug!("Media controls not available on this platform");
    }

    Ok(())
}

#[tauri::command]
pub fn media_controls_update_playback(
    state: State<AppState>,
    is_playing: bool,
    position_secs: f64,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut guard = state
            .media_controls
            .lock()
            .map_err(|_| "Media controls mutex poisoned".to_string())?;
        if let Some(ref mut controls) = *guard {
            controls.set_playback(is_playing, position_secs)?;
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (state, is_playing, position_secs);
    }

    Ok(())
}

#[tauri::command]
pub fn media_controls_stop(state: State<AppState>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let mut guard = state
            .media_controls
            .lock()
            .map_err(|_| "Media controls mutex poisoned".to_string())?;
        if let Some(ref mut controls) = *guard {
            controls.stop()?;
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = state;
        debug!("Media controls not available on this platform");
    }

    Ok(())
}
