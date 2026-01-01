use log::{debug, error, info};
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
};
use std::ffi::c_void;
use std::sync::mpsc::Sender;
use std::time::Duration;

pub struct MediaControlsService {
    controls: MediaControls,
}

impl MediaControlsService {
    /// Create new media controls service
    /// On Windows, hwnd must be provided for media controls to work
    pub fn new(event_tx: Sender<MediaControlEvent>, hwnd: Option<*mut c_void>) -> Result<Self, String> {
        #[cfg(target_os = "windows")]
        if hwnd.is_none() {
            return Err("HWND is required for Windows media controls".to_string());
        }

        let config = PlatformConfig {
            dbus_name: "homekaraoke",
            display_name: "HomeKaraoke",
            hwnd,
        };

        let mut controls =
            MediaControls::new(config).map_err(|e| format!("Failed to create media controls: {}", e))?;

        controls
            .attach(move |event: MediaControlEvent| {
                debug!("Media control event received: {:?}", event);
                if let Err(e) = event_tx.send(event) {
                    error!("Failed to send media control event: {}", e);
                }
            })
            .map_err(|e| format!("Failed to attach media controls handler: {}", e))?;

        info!("Media controls initialized successfully");
        Ok(Self { controls })
    }

    pub fn set_metadata(
        &mut self,
        title: &str,
        artist: Option<&str>,
        duration_secs: Option<f64>,
        cover_url: Option<&str>,
    ) -> Result<(), String> {
        info!(
            "Setting media metadata: title={}, artist={:?}, duration={:?}, cover_url={:?}",
            title, artist, duration_secs, cover_url
        );

        let metadata = MediaMetadata {
            title: Some(title),
            artist,
            album: None,
            duration: duration_secs.map(|s| Duration::from_secs_f64(s)),
            cover_url,
        };

        self.controls
            .set_metadata(metadata)
            .map_err(|e| format!("Failed to set media metadata: {}", e))?;

        info!("Media metadata set successfully");
        Ok(())
    }

    pub fn set_playback(&mut self, is_playing: bool, position_secs: f64) -> Result<(), String> {
        let progress = Some(MediaPosition(Duration::from_secs_f64(position_secs)));

        let playback = if is_playing {
            MediaPlayback::Playing { progress }
        } else {
            MediaPlayback::Paused { progress }
        };

        self.controls
            .set_playback(playback)
            .map_err(|e| format!("Failed to set playback state: {}", e))?;

        Ok(())
    }

    pub fn stop(&mut self) -> Result<(), String> {
        debug!("Stopping media controls");
        self.controls
            .set_playback(MediaPlayback::Stopped)
            .map_err(|e| format!("Failed to stop media controls: {}", e))?;
        Ok(())
    }
}
