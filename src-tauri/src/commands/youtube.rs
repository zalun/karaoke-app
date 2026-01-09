use crate::services::{
    get_expanded_path,
    ytdlp::{SearchResult, StreamInfo, VideoInfo},
    YouTubeApiService, YtDlpService,
};
use crate::AppState;
use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use tauri::State;
use thiserror::Error;

/// Error type for YouTube-related commands.
#[derive(Error, Debug)]
#[allow(dead_code)] // Installation variant is for future use
pub enum YouTubeError {
    /// yt-dlp service error
    #[error("{0}")]
    YtDlp(#[from] crate::services::ytdlp::YtDlpError),

    /// YouTube Data API error
    #[error("{0}")]
    Api(#[from] crate::services::youtube_api::YouTubeApiError),

    /// Command execution error
    #[error("{0}")]
    Command(String),

    /// Installation error
    #[error("Installation failed: {0}")]
    Installation(String),

    /// Configuration error
    #[error("{0}")]
    Config(String),
}

impl Serialize for YouTubeError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;

        let mut state = serializer.serialize_struct("YouTubeError", 2)?;

        let error_type = match self {
            YouTubeError::YtDlp(_) => "ytdlp",
            YouTubeError::Api(_) => "api",
            YouTubeError::Command(_) => "command",
            YouTubeError::Installation(_) => "installation",
            YouTubeError::Config(_) => "config",
        };

        state.serialize_field("type", error_type)?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

#[tauri::command]
pub async fn youtube_search(
    query: String,
    max_results: Option<u32>,
) -> Result<Vec<SearchResult>, YouTubeError> {
    let max = max_results.unwrap_or(10);
    debug!("youtube_search: query='{}', max_results={}", query, max);

    let service = YtDlpService::new();
    let results = service.search(&query, max).await?;

    info!("youtube_search: found {} results for '{}'", results.len(), query);
    Ok(results)
}

#[tauri::command]
pub async fn youtube_get_stream_url(video_id: String) -> Result<StreamInfo, YouTubeError> {
    debug!("youtube_get_stream_url: video_id='{}'", video_id);

    let service = YtDlpService::new();
    let stream_info = service.get_stream_url(&video_id).await?;

    info!("youtube_get_stream_url: got stream URL for '{}'", video_id);
    Ok(stream_info)
}

#[tauri::command]
pub async fn youtube_get_info(video_id: String) -> Result<VideoInfo, YouTubeError> {
    debug!("youtube_get_info: video_id='{}'", video_id);

    let service = YtDlpService::new();
    let video_info = service.get_video_info(&video_id).await?;

    info!("youtube_get_info: got info for '{}': {}", video_id, video_info.title);
    Ok(video_info)
}

#[tauri::command]
pub async fn youtube_check_available() -> Result<bool, YouTubeError> {
    debug!("youtube_check_available: checking yt-dlp availability");

    let service = YtDlpService::new();
    let available = service.is_available().await;

    info!("youtube_check_available: yt-dlp available={}", available);
    Ok(available)
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstallResult {
    pub success: bool,
    pub message: String,
    pub output: String,
}

#[tauri::command]
pub async fn youtube_install_ytdlp(method: String) -> Result<InstallResult, YouTubeError> {
    use tokio::process::Command;

    info!("youtube_install_ytdlp: attempting install via '{}'", method);

    match method.as_str() {
        "brew" => {
            let expanded_path = get_expanded_path();

            // First check if Homebrew is available
            let brew_available = Command::new("brew")
                .arg("--version")
                .env("PATH", &expanded_path)
                .output()
                .await
                .map(|o| o.status.success())
                .unwrap_or(false);

            if !brew_available {
                return Ok(InstallResult {
                    success: false,
                    message: "Homebrew is not installed".to_string(),
                    output: "Please install Homebrew first from https://brew.sh".to_string(),
                });
            }

            // Run brew install yt-dlp
            let output = Command::new("brew")
                .args(["install", "yt-dlp"])
                .env("PATH", &expanded_path)
                .output()
                .await
                .map_err(|e| YouTubeError::Command(format!("Failed to run brew: {}", e)))?;

            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let combined_output = format!("{}\n{}", stdout, stderr).trim().to_string();

            if output.status.success() {
                Ok(InstallResult {
                    success: true,
                    message: "yt-dlp installed successfully!".to_string(),
                    output: combined_output,
                })
            } else {
                Ok(InstallResult {
                    success: false,
                    message: "Installation failed".to_string(),
                    output: combined_output,
                })
            }
        }
        "pip" => {
            let expanded_path = get_expanded_path();

            // Check if pip3 is available
            let pip_available = Command::new("pip3")
                .arg("--version")
                .env("PATH", &expanded_path)
                .output()
                .await
                .map(|o| o.status.success())
                .unwrap_or(false);

            if !pip_available {
                return Ok(InstallResult {
                    success: false,
                    message: "pip3 is not installed".to_string(),
                    output: "Please install Python 3 and pip first".to_string(),
                });
            }

            // Run pip3 install yt-dlp
            let output = Command::new("pip3")
                .args(["install", "yt-dlp"])
                .env("PATH", &expanded_path)
                .output()
                .await
                .map_err(|e| YouTubeError::Command(format!("Failed to run pip3: {}", e)))?;

            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let combined_output = format!("{}\n{}", stdout, stderr).trim().to_string();

            if output.status.success() {
                Ok(InstallResult {
                    success: true,
                    message: "yt-dlp installed successfully!".to_string(),
                    output: combined_output,
                })
            } else {
                Ok(InstallResult {
                    success: false,
                    message: "Installation failed".to_string(),
                    output: combined_output,
                })
            }
        }
        "curl" => {
            // Detect platform and select appropriate binary
            let binary_name = match std::env::consts::OS {
                "macos" => "yt-dlp_macos",
                "linux" => "yt-dlp_linux",
                "windows" => {
                    return Ok(InstallResult {
                        success: false,
                        message: "Direct download not supported on Windows".to_string(),
                        output: "Please use pip or download manually from https://github.com/yt-dlp/yt-dlp#installation".to_string(),
                    });
                }
                os => {
                    return Ok(InstallResult {
                        success: false,
                        message: format!("Unsupported platform: {}", os),
                        output: "Please install manually from https://github.com/yt-dlp/yt-dlp#installation".to_string(),
                    });
                }
            };

            // Download yt-dlp binary directly
            let home = std::env::var("HOME").unwrap_or_default();
            if home.is_empty() {
                return Ok(InstallResult {
                    success: false,
                    message: "Could not determine home directory".to_string(),
                    output: "HOME environment variable not set".to_string(),
                });
            }

            let local_bin = format!("{}/.local/bin", home);

            // Create directory if it doesn't exist
            if let Err(e) = std::fs::create_dir_all(&local_bin) {
                return Ok(InstallResult {
                    success: false,
                    message: "Failed to create directory".to_string(),
                    output: format!("Could not create {}: {}", local_bin, e),
                });
            }

            let download_url = format!(
                "https://github.com/yt-dlp/yt-dlp/releases/latest/download/{}",
                binary_name
            );

            let output = Command::new("curl")
                .args([
                    "-L",
                    &download_url,
                    "-o",
                    &format!("{}/yt-dlp", local_bin),
                ])
                .output()
                .await
                .map_err(|e| YouTubeError::Command(format!("Failed to run curl: {}", e)))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                return Ok(InstallResult {
                    success: false,
                    message: "Download failed".to_string(),
                    output: stderr,
                });
            }

            // Make it executable
            let chmod_output = Command::new("chmod")
                .args(["+x", &format!("{}/yt-dlp", local_bin)])
                .output()
                .await
                .map_err(|e| YouTubeError::Command(format!("Failed to chmod: {}", e)))?;

            if chmod_output.status.success() {
                Ok(InstallResult {
                    success: true,
                    message: "yt-dlp installed successfully!".to_string(),
                    output: format!("Downloaded {} to {}/yt-dlp", binary_name, local_bin),
                })
            } else {
                Ok(InstallResult {
                    success: false,
                    message: "Failed to make executable".to_string(),
                    output: String::from_utf8_lossy(&chmod_output.stderr).to_string(),
                })
            }
        }
        _ => Ok(InstallResult {
            success: false,
            message: "Unknown installation method".to_string(),
            output: String::new(),
        }),
    }
}

/// Search YouTube using the Data API v3
///
/// Requires a valid API key to be configured in settings.
#[tauri::command]
pub async fn youtube_api_search(
    state: State<'_, AppState>,
    query: String,
    max_results: Option<u32>,
) -> Result<Vec<SearchResult>, YouTubeError> {
    let max = max_results.unwrap_or(10);
    debug!("youtube_api_search: query='{}', max_results={}", query, max);

    // Get API key from settings
    let api_key = {
        let db = state
            .db
            .lock()
            .map_err(|e| YouTubeError::Config(format!("Database lock failed: {}", e)))?;
        db.get_setting("youtube_api_key")
            .map_err(|e| YouTubeError::Config(format!("Failed to get API key: {}", e)))?
    };

    let api_key = api_key.ok_or_else(|| {
        YouTubeError::Config("YouTube API key not configured".to_string())
    })?;

    if api_key.trim().is_empty() {
        return Err(YouTubeError::Config(
            "YouTube API key not configured".to_string(),
        ));
    }

    let service = YouTubeApiService::new(api_key)
        .map_err(|e| YouTubeError::Config(e))?;

    let results = service.search(&query, max).await?;

    info!(
        "youtube_api_search: found {} results for '{}'",
        results.len(),
        query
    );
    Ok(results)
}

/// Validate a YouTube API key
#[tauri::command]
pub async fn youtube_validate_api_key(api_key: String) -> Result<bool, YouTubeError> {
    debug!("youtube_validate_api_key: validating key");

    if api_key.trim().is_empty() {
        return Err(YouTubeError::Config("API key cannot be empty".to_string()));
    }

    let service = YouTubeApiService::new(api_key)
        .map_err(|e| YouTubeError::Config(e))?;

    let valid = service.validate_key().await?;

    info!("youtube_validate_api_key: key valid={}", valid);
    Ok(valid)
}

/// Get the current search method based on configuration
///
/// Returns:
/// - "api" if YouTube API key is configured
/// - "ytdlp" if yt-dlp is available but no API key
/// - "none" if neither is available
#[tauri::command]
pub async fn youtube_get_search_method(
    state: State<'_, AppState>,
) -> Result<String, String> {
    debug!("youtube_get_search_method: checking available methods");

    // Check for configured search method preference
    let search_method = {
        let db = state
            .db
            .lock()
            .map_err(|e| format!("Database lock failed: {}", e))?;
        db.get_setting("youtube_search_method")
            .map_err(|e| format!("Failed to get search method: {}", e))?
    };

    let method = search_method.unwrap_or_else(|| "auto".to_string());

    // If user explicitly chose a method, check if it's available
    match method.as_str() {
        "api" => {
            // Check if API key is configured
            let api_key = {
                let db = state
                    .db
                    .lock()
                    .map_err(|e| format!("Database lock failed: {}", e))?;
                db.get_setting("youtube_api_key")
                    .map_err(|e| format!("Failed to get API key: {}", e))?
            };
            if api_key.map(|k| !k.trim().is_empty()).unwrap_or(false) {
                info!("youtube_get_search_method: using 'api' (user preference)");
                return Ok("api".to_string());
            }
            warn!("youtube_get_search_method: API method requested but no key configured");
            return Ok("none".to_string());
        }
        "ytdlp" => {
            // Check if yt-dlp is available
            let service = YtDlpService::new();
            if service.is_available().await {
                info!("youtube_get_search_method: using 'ytdlp' (user preference)");
                return Ok("ytdlp".to_string());
            }
            warn!("youtube_get_search_method: yt-dlp method requested but not available");
            return Ok("none".to_string());
        }
        "auto" | _ => {
            // Auto mode: prefer API if configured, fall back to yt-dlp
            let api_key = {
                let db = state
                    .db
                    .lock()
                    .map_err(|e| format!("Database lock failed: {}", e))?;
                db.get_setting("youtube_api_key")
                    .map_err(|e| format!("Failed to get API key: {}", e))?
            };

            if api_key.map(|k| !k.trim().is_empty()).unwrap_or(false) {
                info!("youtube_get_search_method: using 'api' (auto, key configured)");
                return Ok("api".to_string());
            }

            // Fall back to yt-dlp
            let service = YtDlpService::new();
            if service.is_available().await {
                info!("youtube_get_search_method: using 'ytdlp' (auto, fallback)");
                return Ok("ytdlp".to_string());
            }

            info!("youtube_get_search_method: no search method available");
            Ok("none".to_string())
        }
    }
}
