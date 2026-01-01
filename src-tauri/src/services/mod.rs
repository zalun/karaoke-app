pub mod ytdlp;

#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub mod media_controls;

#[cfg(target_os = "macos")]
pub mod display_watcher;

pub use ytdlp::{get_expanded_path, YtDlpService};

#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub use media_controls::MediaControlsService;

#[cfg(target_os = "macos")]
pub use display_watcher::{
    get_display_configuration, DisplayConfiguration, DisplayEvent, DisplayWatcherService,
};
