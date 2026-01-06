pub mod ffmpeg;
pub mod library_scanner;
pub mod metadata_fetcher;
pub mod ytdlp;

#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub mod media_controls;

#[cfg(target_os = "macos")]
pub mod display_watcher;

pub use ffmpeg::FfmpegService;
pub use library_scanner::{
    LibraryFolder, LibraryScanner, LibraryStats, LibraryVideo, ScanOptions, ScanResult,
};
pub use metadata_fetcher::{LyricsResult, MetadataFetcher, SongInfo};
pub use ytdlp::{find_executable_in_path, get_expanded_path, YtDlpService};

#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
pub use media_controls::MediaControlsService;

#[cfg(target_os = "macos")]
pub use display_watcher::{
    get_display_configuration, DisplayConfiguration, DisplayEvent, DisplayWatcherService,
};
