use crate::services::{get_expanded_path, ytdlp::{SearchResult, StreamInfo, VideoInfo}, YtDlpService};
use log::{debug, info};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct YouTubeError {
    pub message: String,
}

impl From<crate::services::ytdlp::YtDlpError> for YouTubeError {
    fn from(err: crate::services::ytdlp::YtDlpError) -> Self {
        YouTubeError {
            message: err.to_string(),
        }
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
                .map_err(|e| YouTubeError {
                    message: format!("Failed to run brew: {}", e),
                })?;

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
                .map_err(|e| YouTubeError {
                    message: format!("Failed to run pip3: {}", e),
                })?;

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
                .map_err(|e| YouTubeError {
                    message: format!("Failed to run curl: {}", e),
                })?;

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
                .map_err(|e| YouTubeError {
                    message: format!("Failed to chmod: {}", e),
                })?;

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
