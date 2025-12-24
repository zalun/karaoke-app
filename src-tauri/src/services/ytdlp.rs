use serde::{Deserialize, Serialize};
use std::process::Command;
use thiserror::Error;

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

    /// Check if yt-dlp is available
    pub fn is_available(&self) -> bool {
        Command::new("yt-dlp")
            .arg("--version")
            .output()
            .map(|output| output.status.success())
            .unwrap_or(false)
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
    pub fn search(&self, query: &str, max_results: u32) -> Result<Vec<SearchResult>, YtDlpError> {
        let sanitized_query = Self::sanitize_query(query);
        if sanitized_query.trim().is_empty() {
            return Err(YtDlpError::ExecutionError("Empty search query".to_string()));
        }

        // Limit max_results to reasonable bounds
        let max_results = max_results.min(50);

        let search_term = format!("ytsearch{}:{}", max_results, sanitized_query);
        let output = Command::new("yt-dlp")
            .arg(&search_term)
            .arg("--dump-json")
            .arg("--flat-playlist")
            .arg("--no-warnings")
            .output()
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
                            duration: v["duration"].as_u64(),
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
    pub fn get_stream_url(&self, video_id: &str) -> Result<StreamInfo, YtDlpError> {
        Self::validate_video_id(video_id)?;

        let url = format!("https://www.youtube.com/watch?v={}", video_id);

        let output = Command::new("yt-dlp")
            .arg(&url)
            .arg("-f")
            .arg("best[ext=mp4]/best")
            .arg("--get-url")
            .arg("--no-warnings")
            .output()
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
    pub fn get_video_info(&self, video_id: &str) -> Result<VideoInfo, YtDlpError> {
        Self::validate_video_id(video_id)?;

        let url = format!("https://www.youtube.com/watch?v={}", video_id);

        let output = Command::new("yt-dlp")
            .arg(&url)
            .arg("--dump-json")
            .arg("--no-warnings")
            .arg("--no-download")
            .output()
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
            duration: v["duration"].as_u64(),
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
