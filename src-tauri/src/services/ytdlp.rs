use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;
use thiserror::Error;
use tokio::process::Command;

/// Common installation paths for yt-dlp and other CLI tools.
/// macOS .app bundles don't inherit the user's shell PATH, so we need to
/// check these locations directly.
const COMMON_BIN_PATHS: &[&str] = &[
    "/opt/homebrew/bin",      // Apple Silicon Homebrew
    "/usr/local/bin",         // Intel Homebrew / system installs
    "/usr/bin",               // System binaries
    "/bin",                   // Core binaries
];

/// Path separator for the current platform
#[cfg(windows)]
const PATH_SEPARATOR: &str = ";";
#[cfg(not(windows))]
const PATH_SEPARATOR: &str = ":";

/// Get the user's ~/.local/bin path
fn get_local_bin_path() -> Option<String> {
    std::env::var("HOME")
        .ok()
        .map(|home| format!("{}/.local/bin", home))
}

/// Build an expanded PATH that includes common installation directories.
/// This is necessary because macOS .app bundles run with a minimal PATH
/// that doesn't include Homebrew, pip, or user bin directories.
pub fn get_expanded_path() -> String {
    let mut paths: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    // Add user's local bin first (pip --user, direct downloads)
    if let Some(local_bin) = get_local_bin_path() {
        seen.insert(local_bin.clone());
        paths.push(local_bin);
    }

    // Add common paths
    for path in COMMON_BIN_PATHS {
        let path_str = path.to_string();
        if seen.insert(path_str.clone()) {
            paths.push(path_str);
        }
    }

    // Add existing PATH entries (may be minimal in .app context)
    if let Ok(existing_path) = std::env::var("PATH") {
        for p in existing_path.split(PATH_SEPARATOR) {
            let p_str = p.to_string();
            if seen.insert(p_str.clone()) {
                paths.push(p_str);
            }
        }
    }

    paths.join(PATH_SEPARATOR)
}

/// Find the full path to yt-dlp binary by checking common locations.
/// Returns the path if found, None otherwise.
pub fn find_ytdlp_path() -> Option<PathBuf> {
    // Check ~/.local/bin first (most likely for direct downloads)
    if let Some(local_bin) = get_local_bin_path() {
        let path = PathBuf::from(&local_bin).join("yt-dlp");
        if path.exists() {
            return Some(path);
        }
    }

    // Check common paths
    for bin_path in COMMON_BIN_PATHS {
        let path = PathBuf::from(bin_path).join("yt-dlp");
        if path.exists() {
            return Some(path);
        }
    }

    None
}

/// Get the yt-dlp command name or path to use.
/// Returns the full path if found, otherwise just "yt-dlp" to rely on PATH.
fn get_ytdlp_command() -> String {
    find_ytdlp_path()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "yt-dlp".to_string())
}

#[derive(Error, Debug)]
pub enum YtDlpError {
    #[error("yt-dlp not found. Please install yt-dlp and ensure it's in your PATH.")]
    NotFound,
    #[error("Failed to execute yt-dlp: {0}")]
    ExecutionError(String),
    #[error("Failed to parse yt-dlp output: {0}")]
    ParseError(String),
    #[error("No results found")]
    NoResults,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub title: String,
    pub channel: String,
    pub duration: Option<u64>,
    pub thumbnail: Option<String>,
    pub view_count: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoInfo {
    pub id: String,
    pub title: String,
    pub channel: String,
    pub duration: Option<u64>,
    pub thumbnail: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamInfo {
    pub url: String,
    pub format: String,
    pub quality: String,
}

pub struct YtDlpService;

impl YtDlpService {
    pub fn new() -> Self {
        Self
    }

    /// Check if yt-dlp is available by checking known installation locations
    pub async fn is_available(&self) -> bool {
        find_ytdlp_path().is_some()
    }

    /// Validate YouTube video ID format (alphanumeric, dash, underscore, 11 chars)
    fn validate_video_id(video_id: &str) -> Result<(), YtDlpError> {
        if video_id.is_empty() || video_id.len() > 20 {
            return Err(YtDlpError::ExecutionError("Invalid video ID length".to_string()));
        }
        if !video_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
            return Err(YtDlpError::ExecutionError("Invalid characters in video ID".to_string()));
        }
        Ok(())
    }

    /// Sanitize search query (remove potentially dangerous characters)
    fn sanitize_query(query: &str) -> String {
        // Remove shell metacharacters and limit length
        query
            .chars()
            .filter(|c| !matches!(c, ';' | '&' | '|' | '$' | '`' | '\\' | '\n' | '\r'))
            .take(200)
            .collect()
    }

    /// Search YouTube for videos
    pub async fn search(&self, query: &str, max_results: u32) -> Result<Vec<SearchResult>, YtDlpError> {
        let sanitized_query = Self::sanitize_query(query);
        if sanitized_query.trim().is_empty() {
            return Err(YtDlpError::ExecutionError("Empty search query".to_string()));
        }

        // Limit max_results to reasonable bounds
        let max_results = max_results.min(50);

        let search_term = format!("ytsearch{}:{}", max_results, sanitized_query);
        let output = Command::new(get_ytdlp_command())
            .arg(&search_term)
            .arg("--dump-json")
            .arg("--flat-playlist")
            .arg("--no-warnings")
            .env("PATH", get_expanded_path())
            .output()
            .await
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    YtDlpError::NotFound
                } else {
                    YtDlpError::ExecutionError(e.to_string())
                }
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(YtDlpError::ExecutionError(stderr.to_string()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let results: Vec<SearchResult> = stdout
            .lines()
            .filter_map(|line| {
                match serde_json::from_str::<serde_json::Value>(line) {
                    Ok(v) => {
                        // Require id to be present
                        let id = v["id"].as_str()?;
                        if id.is_empty() {
                            return None;
                        }
                        Some(SearchResult {
                            id: id.to_string(),
                            title: v["title"].as_str().unwrap_or("Unknown").to_string(),
                            channel: v["channel"].as_str()
                                .or_else(|| v["uploader"].as_str())
                                .unwrap_or("Unknown")
                                .to_string(),
                            duration: v["duration"].as_f64().map(|d| d as u64),
                            thumbnail: v["thumbnail"].as_str().map(|s| s.to_string())
                                .or_else(|| v["thumbnails"].as_array()
                                    .and_then(|arr| arr.first())
                                    .and_then(|t| t["url"].as_str())
                                    .map(|s| s.to_string())),
                            view_count: v["view_count"].as_u64(),
                        })
                    },
                    Err(e) => {
                        eprintln!("Failed to parse search result: {}", e);
                        None
                    }
                }
            })
            .collect();

        if results.is_empty() {
            return Err(YtDlpError::NoResults);
        }

        Ok(results)
    }

    /// Get streaming URL for a video
    pub async fn get_stream_url(&self, video_id: &str) -> Result<StreamInfo, YtDlpError> {
        Self::validate_video_id(video_id)?;

        let url = format!("https://www.youtube.com/watch?v={}", video_id);

        let output = Command::new(get_ytdlp_command())
            .arg(&url)
            .arg("-f")
            .arg("best[ext=mp4]/best")
            .arg("--get-url")
            .arg("--no-warnings")
            .env("PATH", get_expanded_path())
            .output()
            .await
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    YtDlpError::NotFound
                } else {
                    YtDlpError::ExecutionError(e.to_string())
                }
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(YtDlpError::ExecutionError(stderr.to_string()));
        }

        let stream_url = String::from_utf8_lossy(&output.stdout)
            .trim()
            .to_string();

        if stream_url.is_empty() {
            return Err(YtDlpError::NoResults);
        }

        Ok(StreamInfo {
            url: stream_url,
            format: "mp4".to_string(),
            quality: "best".to_string(),
        })
    }

    /// Get video info without downloading
    pub async fn get_video_info(&self, video_id: &str) -> Result<VideoInfo, YtDlpError> {
        Self::validate_video_id(video_id)?;

        let url = format!("https://www.youtube.com/watch?v={}", video_id);

        let output = Command::new(get_ytdlp_command())
            .arg(&url)
            .arg("--dump-json")
            .arg("--no-warnings")
            .arg("--no-download")
            .env("PATH", get_expanded_path())
            .output()
            .await
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    YtDlpError::NotFound
                } else {
                    YtDlpError::ExecutionError(e.to_string())
                }
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(YtDlpError::ExecutionError(stderr.to_string()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let v: serde_json::Value = serde_json::from_str(&stdout)
            .map_err(|e| YtDlpError::ParseError(e.to_string()))?;

        Ok(VideoInfo {
            id: v["id"].as_str().unwrap_or_default().to_string(),
            title: v["title"].as_str().unwrap_or("Unknown").to_string(),
            channel: v["channel"].as_str()
                .or_else(|| v["uploader"].as_str())
                .unwrap_or("Unknown")
                .to_string(),
            duration: v["duration"].as_f64().map(|d| d as u64),
            thumbnail: v["thumbnail"].as_str().map(|s| s.to_string()),
            description: v["description"].as_str().map(|s| s.to_string()),
        })
    }
}

impl Default for YtDlpService {
    fn default() -> Self {
        Self::new()
    }
}
