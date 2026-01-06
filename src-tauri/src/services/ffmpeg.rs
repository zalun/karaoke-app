//! FFmpeg service for thumbnail extraction and video duration detection.
//!
//! This module provides utilities for extracting thumbnails from video files
//! and detecting video duration using ffmpeg and ffprobe.

use log::{debug, info, warn};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tokio::process::Command;

use super::ytdlp::{get_expanded_path, find_executable_in_path};

/// Thumbnail extraction width in pixels (height auto-calculated to maintain aspect ratio)
const THUMBNAIL_WIDTH: u32 = 320;

/// Default timestamp for thumbnail extraction (5 seconds into video)
const DEFAULT_THUMBNAIL_TIMESTAMP_SECS: u32 = 5;

pub struct FfmpegService;

impl FfmpegService {
    /// Find the ffmpeg binary path
    pub fn find_ffmpeg_path() -> Option<PathBuf> {
        find_executable_in_path("ffmpeg")
    }

    /// Find the ffprobe binary path
    pub fn find_ffprobe_path() -> Option<PathBuf> {
        find_executable_in_path("ffprobe")
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
                .map_err(|e| format!("Failed to create thumbnail directory: {}", e))?;
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
            // Use 10% of duration, but at least 1 second and at most 30 seconds
            let ten_percent = duration / 10;
            ten_percent.max(1).min(30)
        } else {
            DEFAULT_THUMBNAIL_TIMESTAMP_SECS
        };

        Self::extract_thumbnail(video_path, output_path, Some(timestamp)).await
    }
}
