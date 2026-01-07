//! FFmpeg service for thumbnail extraction and video duration detection.
//!
//! This module provides utilities for extracting thumbnails from video files
//! and detecting video duration using ffmpeg and ffprobe.

use log::{debug, info, warn};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::OnceLock;
use tokio::process::Command;

use super::ytdlp::{get_expanded_path, find_executable_in_path};

/// Thumbnail extraction width in pixels (height auto-calculated to maintain aspect ratio)
const THUMBNAIL_WIDTH: u32 = 320;

/// Default timestamp for thumbnail extraction (5 seconds into video)
const DEFAULT_THUMBNAIL_TIMESTAMP_SECS: u32 = 5;

/// Minimum timestamp for smart thumbnail extraction (avoid black intro frames)
const MIN_THUMBNAIL_TIMESTAMP_SECS: u32 = 1;

/// Maximum timestamp for smart thumbnail extraction (avoid spoilers in long videos)
const MAX_THUMBNAIL_TIMESTAMP_SECS: u32 = 30;

/// Valid year range for song release dates
const MIN_VALID_YEAR: u32 = 1900;
const MAX_VALID_YEAR: u32 = 2099;

/// Cached ffmpeg path (looked up once on first use)
static FFMPEG_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();

/// Cached ffprobe path (looked up once on first use)
static FFPROBE_PATH: OnceLock<Option<PathBuf>> = OnceLock::new();

pub struct FfmpegService;

impl FfmpegService {
    /// Find the ffmpeg binary path (cached after first lookup)
    pub fn find_ffmpeg_path() -> Option<PathBuf> {
        FFMPEG_PATH.get_or_init(|| find_executable_in_path("ffmpeg")).clone()
    }

    /// Find the ffprobe binary path (cached after first lookup)
    pub fn find_ffprobe_path() -> Option<PathBuf> {
        FFPROBE_PATH.get_or_init(|| find_executable_in_path("ffprobe")).clone()
    }

    /// Check if ffmpeg is available on the system
    pub fn is_available() -> bool {
        Self::find_ffmpeg_path().is_some()
    }

    /// Check if ffprobe is available on the system
    pub fn is_ffprobe_available() -> bool {
        Self::find_ffprobe_path().is_some()
    }

    /// Get video duration in seconds using ffprobe
    ///
    /// Returns None if ffprobe is not available or the video cannot be probed.
    pub async fn get_duration(video_path: &Path) -> Option<u32> {
        let ffprobe_path = Self::find_ffprobe_path()?;

        debug!("Getting duration for: {:?}", video_path);

        let output = Command::new(&ffprobe_path)
            .arg("-v")
            .arg("error")
            .arg("-show_entries")
            .arg("format=duration")
            .arg("-of")
            .arg("csv=p=0")
            .arg(video_path)
            .env("PATH", get_expanded_path())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .ok()?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            warn!("ffprobe failed for {:?}: {}", video_path, stderr);
            return None;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let duration_str = stdout.trim();

        // Parse duration (format: "123.456" or just "123")
        duration_str
            .parse::<f64>()
            .ok()
            .map(|d| d.round() as u32)
    }

    /// Get year from video metadata using ffprobe
    ///
    /// Extracts year from embedded metadata tags (date, year, creation_time).
    /// Returns None if ffprobe is not available or no year metadata is found.
    pub async fn get_year(video_path: &Path) -> Option<u32> {
        let ffprobe_path = Self::find_ffprobe_path()?;

        debug!("Getting year metadata for: {:?}", video_path);

        // Query for various date/year tags
        let output = Command::new(&ffprobe_path)
            .arg("-v")
            .arg("error")
            .arg("-show_entries")
            .arg("format_tags=date,year,creation_time,DATE,YEAR,TDRC,TYER")
            .arg("-of")
            .arg("csv=p=0:s=,")
            .arg(video_path)
            .env("PATH", get_expanded_path())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await;

        let output = match output {
            Ok(o) => o,
            Err(e) => {
                debug!("Failed to run ffprobe for year extraction: {}", e);
                return None;
            }
        };

        if !output.status.success() {
            debug!("ffprobe returned non-zero status for year extraction: {:?}", video_path);
            return None;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);

        // Parse the output - try to extract a 4-digit year from any tag value
        for value in stdout.split(',') {
            let value = value.trim();
            if value.is_empty() {
                continue;
            }

            // Try direct 4-digit year
            if value.len() == 4 {
                if let Ok(year) = value.parse::<u32>() {
                    if year >= MIN_VALID_YEAR && year <= MAX_VALID_YEAR {
                        debug!("Year {} extracted from ffprobe metadata: {:?}", year, video_path);
                        return Some(year);
                    }
                }
            }

            // Try extracting year from date formats like "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM:SS"
            // Take first 4 characters safely (handles any UTF-8 string)
            let year_part: String = value.chars().take(4).collect();
            if year_part.len() == 4 {
                if let Ok(year) = year_part.parse::<u32>() {
                    if year >= MIN_VALID_YEAR && year <= MAX_VALID_YEAR {
                        debug!("Year {} extracted from date in ffprobe metadata: {:?}", year, video_path);
                        return Some(year);
                    }
                }
            }
        }

        None
    }

    /// Extract a thumbnail from a video file
    ///
    /// Extracts a single frame at the specified timestamp (or 5 seconds by default).
    /// The thumbnail is saved as a JPEG with the specified width, maintaining aspect ratio.
    ///
    /// # Arguments
    /// * `video_path` - Path to the video file
    /// * `output_path` - Path where the thumbnail should be saved
    /// * `timestamp_secs` - Optional timestamp in seconds (defaults to 5 seconds)
    ///
    /// # Returns
    /// * `Ok(())` if thumbnail was successfully extracted
    /// * `Err(String)` if extraction failed
    pub async fn extract_thumbnail(
        video_path: &Path,
        output_path: &Path,
        timestamp_secs: Option<u32>,
    ) -> Result<(), String> {
        let ffmpeg_path = Self::find_ffmpeg_path()
            .ok_or_else(|| "ffmpeg not found".to_string())?;

        let timestamp = timestamp_secs.unwrap_or(DEFAULT_THUMBNAIL_TIMESTAMP_SECS);
        let hours = timestamp / 3600;
        let mins = (timestamp % 3600) / 60;
        let secs = timestamp % 60;
        let timestamp_str = format!("{:02}:{:02}:{:02}", hours, mins, secs);

        debug!(
            "Extracting thumbnail from {:?} at {} to {:?}",
            video_path, timestamp_str, output_path
        );

        // Ensure parent directory exists
        if let Some(parent) = output_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create thumbnail directory {:?}: {}", parent, e))?;
        }

        let output = Command::new(&ffmpeg_path)
            .arg("-ss")
            .arg(&timestamp_str)
            .arg("-i")
            .arg(video_path)
            .arg("-frames:v")
            .arg("1")
            .arg("-vf")
            .arg(format!("scale={}:-1", THUMBNAIL_WIDTH))
            .arg("-q:v")
            .arg("2") // High quality JPEG
            .arg("-y") // Overwrite output file
            .arg(output_path)
            .env("PATH", get_expanded_path())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .output()
            .await
            .map_err(|e| format!("Failed to execute ffmpeg: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            warn!("ffmpeg thumbnail extraction failed: {}", stderr);
            return Err(format!("Thumbnail extraction failed: {}", stderr));
        }

        // Verify the output file was created
        if !output_path.exists() {
            return Err("Thumbnail file was not created".to_string());
        }

        info!("Thumbnail extracted: {:?}", output_path);
        Ok(())
    }

    /// Extract a thumbnail at 10% of the video duration
    ///
    /// First gets the video duration, then extracts a frame at 10% of the total length.
    /// Falls back to 5 seconds if duration cannot be determined.
    pub async fn extract_thumbnail_smart(
        video_path: &Path,
        output_path: &Path,
    ) -> Result<(), String> {
        // Try to get duration first
        let timestamp = if let Some(duration) = Self::get_duration(video_path).await {
            // Use 10% of duration, clamped to reasonable bounds
            let ten_percent = duration / 10;
            ten_percent.max(MIN_THUMBNAIL_TIMESTAMP_SECS).min(MAX_THUMBNAIL_TIMESTAMP_SECS)
        } else {
            DEFAULT_THUMBNAIL_TIMESTAMP_SECS
        };

        Self::extract_thumbnail(video_path, output_path, Some(timestamp)).await
    }
}
