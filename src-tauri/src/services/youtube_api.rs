//! YouTube Data API v3 client for video search.
//!
//! Provides YouTube search functionality using the official API,
//! which requires a user-provided API key but doesn't need yt-dlp.

use crate::services::ytdlp::SearchResult;
use log::{debug, info, warn};
use serde::Deserialize;
use std::time::Duration;
use thiserror::Error;

/// YouTube Data API v3 base URL
const YOUTUBE_API_BASE: &str = "https://www.googleapis.com/youtube/v3";

/// User agent for API requests
const USER_AGENT: &str = concat!(
    "HomeKaraoke/",
    env!("CARGO_PKG_VERSION"),
    " (+https://github.com/zalun/karaoke-app)"
);

/// Errors that can occur when using the YouTube Data API
#[derive(Error, Debug)]
pub enum YouTubeApiError {
    #[error("API key not configured")]
    NoApiKey,

    #[error("Invalid API key or access denied")]
    InvalidApiKey,

    #[error("Daily quota exceeded. Limit resets at midnight Pacific Time. You can switch to yt-dlp mode in Settings > Advanced.")]
    QuotaExceeded,

    #[error("Network error: {0}")]
    Network(String),

    #[error("Failed to parse API response: {0}")]
    Parse(String),

    #[error("No results found")]
    NoResults,
}

/// YouTube Data API v3 search response
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchResponse {
    items: Option<Vec<SearchItem>>,
    #[allow(dead_code)]
    next_page_token: Option<String>,
    error: Option<ApiError>,
}

/// YouTube Data API v3 videos.list response (for fetching duration)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VideosResponse {
    items: Option<Vec<VideoItem>>,
    error: Option<ApiError>,
}

/// Video item from videos.list endpoint
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VideoItem {
    id: String,
    content_details: Option<ContentDetails>,
}

/// Video content details (contains duration)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContentDetails {
    duration: Option<String>, // ISO 8601 duration format, e.g., "PT4M13S"
}

/// API error response
#[derive(Debug, Deserialize)]
struct ApiError {
    code: u16,
    message: String,
    errors: Option<Vec<ApiErrorDetail>>,
}

/// Detailed error information
#[derive(Debug, Deserialize)]
struct ApiErrorDetail {
    reason: String,
    #[allow(dead_code)]
    message: String,
}

/// Individual search result item
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchItem {
    id: VideoId,
    snippet: Snippet,
}

/// Video ID container (API returns nested structure)
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VideoId {
    video_id: Option<String>,
}

/// Video snippet containing metadata
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Snippet {
    title: String,
    channel_title: String,
    thumbnails: Thumbnails,
}

/// Thumbnail URLs at different qualities
#[derive(Debug, Deserialize)]
struct Thumbnails {
    high: Option<ThumbnailInfo>,
    medium: Option<ThumbnailInfo>,
    default: Option<ThumbnailInfo>,
}

/// Single thumbnail info
#[derive(Debug, Deserialize)]
struct ThumbnailInfo {
    url: String,
}

/// YouTube Data API v3 service
pub struct YouTubeApiService {
    client: reqwest::Client,
    api_key: String,
}

impl YouTubeApiService {
    /// Create a new YouTube API service with the given API key
    pub fn new(api_key: String) -> Result<Self, String> {
        if api_key.trim().is_empty() {
            return Err("API key cannot be empty".to_string());
        }

        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        Ok(Self { client, api_key })
    }

    /// Search for videos on YouTube
    ///
    /// Returns up to `max_results` videos matching the query.
    /// Duration is fetched via a separate API call (batched for efficiency).
    pub async fn search(
        &self,
        query: &str,
        max_results: u32,
    ) -> Result<Vec<SearchResult>, YouTubeApiError> {
        if query.trim().is_empty() {
            return Ok(Vec::new());
        }

        let max_results = max_results.min(50); // API limit

        debug!(
            "YouTube API search: query='{}', maxResults={}",
            query, max_results
        );

        // Use query builder to avoid API key appearing in debug logs
        let response = self
            .client
            .get(format!("{}/search", YOUTUBE_API_BASE))
            .query(&[
                ("part", "snippet"),
                ("type", "video"),
                ("q", query),
                ("maxResults", &max_results.to_string()),
                ("key", &self.api_key),
            ])
            .send()
            .await
            .map_err(|e| YouTubeApiError::Network(e.to_string()))?;

        let status = response.status();

        // Handle HTTP errors
        if status == reqwest::StatusCode::FORBIDDEN {
            // Could be quota exceeded or invalid key
            let body: SearchResponse = response
                .json()
                .await
                .map_err(|e| YouTubeApiError::Parse(e.to_string()))?;

            if let Some(error) = body.error {
                return Err(Self::classify_error(&error));
            }

            return Err(YouTubeApiError::InvalidApiKey);
        }

        if status == reqwest::StatusCode::BAD_REQUEST {
            return Err(YouTubeApiError::InvalidApiKey);
        }

        if !status.is_success() {
            return Err(YouTubeApiError::Network(format!(
                "API returned status {}",
                status
            )));
        }

        let body: SearchResponse = response
            .json()
            .await
            .map_err(|e| YouTubeApiError::Parse(e.to_string()))?;

        // Check for API error in response body
        if let Some(error) = body.error {
            return Err(Self::classify_error(&error));
        }

        let items = body.items.unwrap_or_default();

        if items.is_empty() {
            return Ok(Vec::new());
        }

        // Convert to SearchResult format (compatible with yt-dlp results)
        let results: Vec<SearchResult> = items
            .into_iter()
            .filter_map(|item| {
                let video_id = item.id.video_id?;

                // Get best available thumbnail
                let thumbnail = item
                    .snippet
                    .thumbnails
                    .high
                    .or(item.snippet.thumbnails.medium)
                    .or(item.snippet.thumbnails.default)
                    .map(|t| t.url);

                Some(SearchResult {
                    id: video_id,
                    title: item.snippet.title,
                    channel: item.snippet.channel_title,
                    duration: None, // Not available from search endpoint
                    thumbnail,
                    view_count: None, // Not available from search endpoint
                })
            })
            .collect();

        info!(
            "YouTube API search: found {} results for '{}'",
            results.len(),
            query
        );

        // Fetch durations for all results in a single batch request
        if !results.is_empty() {
            let video_ids: Vec<&str> = results.iter().map(|r| r.id.as_str()).collect();
            match self.fetch_video_durations(&video_ids).await {
                Ok(durations) => {
                    // Create a new results vec with durations merged in
                    let results_with_duration: Vec<SearchResult> = results
                        .into_iter()
                        .map(|mut r| {
                            if let Some(&duration) = durations.get(&r.id) {
                                r.duration = Some(duration);
                            }
                            r
                        })
                        .collect();
                    return Ok(results_with_duration);
                }
                Err(e) => {
                    // Log but don't fail - duration is optional
                    warn!("Failed to fetch video durations: {}", e);
                }
            }
        }

        Ok(results)
    }

    /// Fetch durations for multiple videos in a single API call
    ///
    /// Returns a map of video_id -> duration_seconds
    async fn fetch_video_durations(
        &self,
        video_ids: &[&str],
    ) -> Result<std::collections::HashMap<String, u64>, YouTubeApiError> {
        use std::collections::HashMap;

        if video_ids.is_empty() {
            return Ok(HashMap::new());
        }

        // API allows up to 50 IDs per request
        let ids = video_ids.join(",");

        debug!("Fetching durations for {} videos", video_ids.len());

        // Use query builder to avoid API key appearing in debug logs
        let response = self
            .client
            .get(format!("{}/videos", YOUTUBE_API_BASE))
            .query(&[
                ("part", "contentDetails"),
                ("id", &ids),
                ("key", &self.api_key),
            ])
            .send()
            .await
            .map_err(|e| YouTubeApiError::Network(e.to_string()))?;

        if !response.status().is_success() {
            return Err(YouTubeApiError::Network(format!(
                "Videos API returned status {}",
                response.status()
            )));
        }

        let body: VideosResponse = response
            .json()
            .await
            .map_err(|e| YouTubeApiError::Parse(e.to_string()))?;

        if let Some(error) = body.error {
            return Err(Self::classify_error(&error));
        }

        let mut durations = HashMap::new();
        if let Some(items) = body.items {
            for item in items {
                if let Some(content_details) = item.content_details {
                    if let Some(duration_str) = content_details.duration {
                        if let Some(seconds) = Self::parse_iso8601_duration(&duration_str) {
                            durations.insert(item.id, seconds);
                        }
                    }
                }
            }
        }

        debug!("Fetched durations for {} videos", durations.len());
        Ok(durations)
    }

    /// Parse ISO 8601 duration format (e.g., "PT4M13S") to seconds
    fn parse_iso8601_duration(duration: &str) -> Option<u64> {
        // Format: PT#H#M#S (hours, minutes, seconds are optional)
        if !duration.starts_with("PT") {
            return None;
        }

        let duration = &duration[2..]; // Remove "PT" prefix
        let mut seconds: u64 = 0;
        let mut current_num = String::new();

        for c in duration.chars() {
            match c {
                '0'..='9' => current_num.push(c),
                'H' => {
                    if let Ok(h) = current_num.parse::<u64>() {
                        seconds += h * 3600;
                    }
                    current_num.clear();
                }
                'M' => {
                    if let Ok(m) = current_num.parse::<u64>() {
                        seconds += m * 60;
                    }
                    current_num.clear();
                }
                'S' => {
                    if let Ok(s) = current_num.parse::<u64>() {
                        seconds += s;
                    }
                    current_num.clear();
                }
                _ => {}
            }
        }

        Some(seconds)
    }

    /// Validate the API key by making a minimal search request
    pub async fn validate_key(&self) -> Result<bool, YouTubeApiError> {
        debug!("Validating YouTube API key...");

        // Use query builder to avoid API key appearing in debug logs
        let response = self
            .client
            .get(format!("{}/search", YOUTUBE_API_BASE))
            .query(&[
                ("part", "id"),
                ("type", "video"),
                ("q", "test"),
                ("maxResults", "1"),
                ("key", &self.api_key),
            ])
            .send()
            .await
            .map_err(|e| YouTubeApiError::Network(e.to_string()))?;

        let status = response.status();

        if status.is_success() {
            info!("YouTube API key is valid");
            return Ok(true);
        }

        if status == reqwest::StatusCode::FORBIDDEN || status == reqwest::StatusCode::BAD_REQUEST {
            // Try to get more specific error
            if let Ok(body) = response.json::<SearchResponse>().await {
                if let Some(error) = body.error {
                    let classified = Self::classify_error(&error);
                    warn!("YouTube API key validation failed: {}", classified);
                    return Err(classified);
                }
            }
            warn!("YouTube API key is invalid");
            return Err(YouTubeApiError::InvalidApiKey);
        }

        Err(YouTubeApiError::Network(format!(
            "Validation request failed with status {}",
            status
        )))
    }

    /// Classify an API error based on error details
    fn classify_error(error: &ApiError) -> YouTubeApiError {
        // Check for specific error reasons
        if let Some(details) = &error.errors {
            for detail in details {
                match detail.reason.as_str() {
                    "quotaExceeded" | "dailyLimitExceeded" => {
                        return YouTubeApiError::QuotaExceeded;
                    }
                    "keyInvalid" | "accessNotConfigured" | "ipRefererBlocked" => {
                        return YouTubeApiError::InvalidApiKey;
                    }
                    _ => {}
                }
            }
        }

        // Fall back to HTTP status code
        match error.code {
            403 => YouTubeApiError::QuotaExceeded,
            400 | 401 => YouTubeApiError::InvalidApiKey,
            _ => YouTubeApiError::Network(error.message.clone()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_rejects_empty_key() {
        assert!(YouTubeApiService::new("".to_string()).is_err());
        assert!(YouTubeApiService::new("   ".to_string()).is_err());
    }

    #[test]
    fn test_new_accepts_valid_key() {
        assert!(YouTubeApiService::new("AIzaSyTest123".to_string()).is_ok());
    }

    #[test]
    fn test_parse_iso8601_duration() {
        // Minutes and seconds
        assert_eq!(
            YouTubeApiService::parse_iso8601_duration("PT4M13S"),
            Some(253)
        );
        // Hours, minutes, seconds
        assert_eq!(
            YouTubeApiService::parse_iso8601_duration("PT1H30M45S"),
            Some(5445)
        );
        // Only minutes
        assert_eq!(
            YouTubeApiService::parse_iso8601_duration("PT5M"),
            Some(300)
        );
        // Only seconds
        assert_eq!(
            YouTubeApiService::parse_iso8601_duration("PT30S"),
            Some(30)
        );
        // Invalid format
        assert_eq!(YouTubeApiService::parse_iso8601_duration("invalid"), None);
        assert_eq!(YouTubeApiService::parse_iso8601_duration("P1D"), None);
    }
}
