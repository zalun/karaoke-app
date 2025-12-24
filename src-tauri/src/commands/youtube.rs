use crate::services::{ytdlp::{SearchResult, StreamInfo, VideoInfo}, YtDlpService};
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
    let service = YtDlpService::new();
    let results = service.search(&query, max_results.unwrap_or(10))?;
    Ok(results)
}

#[tauri::command]
pub async fn youtube_get_stream_url(video_id: String) -> Result<StreamInfo, YouTubeError> {
    let service = YtDlpService::new();
    let stream_info = service.get_stream_url(&video_id)?;
    Ok(stream_info)
}

#[tauri::command]
pub async fn youtube_get_info(video_id: String) -> Result<VideoInfo, YouTubeError> {
    let service = YtDlpService::new();
    let video_info = service.get_video_info(&video_id)?;
    Ok(video_info)
}

#[tauri::command]
pub async fn youtube_check_available() -> Result<bool, YouTubeError> {
    let service = YtDlpService::new();
    Ok(service.is_available())
}
