pub mod ytdlp;

#[cfg(target_os = "macos")]
pub mod media_controls;

pub use ytdlp::{get_expanded_path, YtDlpService};

#[cfg(target_os = "macos")]
pub use media_controls::MediaControlsService;
