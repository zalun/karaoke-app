//! Metadata fetching service for song info and lyrics.
//!
//! Integrates with:
//! - MusicBrainz API for song metadata (duration, album, year)
//! - Lrclib API for lyrics (synced and plain)

use log::{debug, info, warn};
use serde::Deserialize;
use std::time::Duration;
use tokio::time::sleep;

/// User agent for API requests (MusicBrainz requires contact info)
const USER_AGENT: &str = concat!(
    "HomeKaraoke/",
    env!("CARGO_PKG_VERSION"),
    " (+https://github.com/zalun/karaoke-app)"
);

/// MusicBrainz API base URL
const MUSICBRAINZ_API: &str = "https://musicbrainz.org/ws/2";

/// Lrclib API base URL
const LRCLIB_API: &str = "https://lrclib.net/api";

/// Rate limit delay for MusicBrainz (1 request per second)
const MUSICBRAINZ_RATE_LIMIT_MS: u64 = 1100;

/// Song information fetched from external APIs
#[derive(Debug, Clone, Default)]
pub struct SongInfo {
    pub duration_ms: Option<u32>,
    pub album: Option<String>,
    pub year: Option<u32>,
    pub artist_credit: Option<String>,
}

/// Lyrics result from external APIs
#[derive(Debug, Clone, Default)]
pub struct LyricsResult {
    pub synced_lyrics: Option<String>,
    pub plain_lyrics: Option<String>,
    pub duration: Option<u32>,
}

/// MusicBrainz recording search response
#[derive(Debug, Deserialize)]
struct MusicBrainzResponse {
    recordings: Option<Vec<MusicBrainzRecording>>,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzRecording {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    title: String,
    length: Option<u32>,
    #[serde(rename = "artist-credit")]
    artist_credit: Option<Vec<MusicBrainzArtistCredit>>,
    releases: Option<Vec<MusicBrainzRelease>>,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzArtistCredit {
    name: String,
}

#[derive(Debug, Deserialize)]
struct MusicBrainzRelease {
    title: String,
    date: Option<String>,
}

/// Lrclib search response item
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrclibResult {
    #[allow(dead_code)]
    id: u64,
    #[allow(dead_code)]
    track_name: String,
    #[allow(dead_code)]
    artist_name: String,
    duration: Option<f64>,
    synced_lyrics: Option<String>,
    plain_lyrics: Option<String>,
}

/// Metadata fetcher service
pub struct MetadataFetcher {
    client: reqwest::Client,
}

impl MetadataFetcher {
    /// Create a new metadata fetcher
    pub fn new() -> Result<Self, String> {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        Ok(Self { client })
    }

    /// Fetch song info from MusicBrainz
    ///
    /// Searches for recordings by title and optional artist.
    /// Returns duration, album, year, and artist credit.
    pub async fn fetch_song_info(
        &self,
        title: &str,
        artist: Option<&str>,
    ) -> Option<SongInfo> {
        // Build search query
        let query = if let Some(artist) = artist {
            format!(
                "recording:\"{}\" AND artist:\"{}\"",
                Self::escape_lucene(title),
                Self::escape_lucene(artist)
            )
        } else {
            format!("recording:\"{}\"", Self::escape_lucene(title))
        };

        let url = format!(
            "{}/recording?query={}&fmt=json&limit=1",
            MUSICBRAINZ_API,
            urlencoding::encode(&query)
        );

        debug!("MusicBrainz search: {}", url);

        let response = match self.client.get(&url).send().await {
            Ok(r) => r,
            Err(e) => {
                warn!("MusicBrainz request failed: {}", e);
                return None;
            }
        };

        if !response.status().is_success() {
            warn!("MusicBrainz returned status: {}", response.status());
            return None;
        }

        let data: MusicBrainzResponse = match response.json().await {
            Ok(d) => d,
            Err(e) => {
                warn!("Failed to parse MusicBrainz response: {}", e);
                return None;
            }
        };

        // Get first recording result
        let recording = data.recordings?.into_iter().next()?;

        // Extract year from first release date
        let year = recording
            .releases
            .as_ref()
            .and_then(|releases| releases.first())
            .and_then(|release| release.date.as_ref())
            .and_then(|date| date.split('-').next())
            .and_then(|year_str| year_str.parse::<u32>().ok());

        // Extract album from first release
        let album = recording
            .releases
            .as_ref()
            .and_then(|releases| releases.first())
            .map(|release| release.title.clone());

        // Extract artist credit
        let artist_credit = recording
            .artist_credit
            .as_ref()
            .and_then(|credits| credits.first())
            .map(|credit| credit.name.clone());

        let info = SongInfo {
            duration_ms: recording.length,
            album,
            year,
            artist_credit,
        };

        info!(
            "MusicBrainz found: duration={:?}ms, album={:?}, year={:?}",
            info.duration_ms, info.album, info.year
        );

        Some(info)
    }

    /// Fetch lyrics from Lrclib
    ///
    /// Searches for lyrics by title and artist.
    /// Prefers synced lyrics (LRC format) over plain lyrics.
    pub async fn fetch_lyrics(
        &self,
        title: &str,
        artist: Option<&str>,
    ) -> Option<LyricsResult> {
        // Build search URL
        let url = if let Some(artist) = artist {
            format!(
                "{}/search?track_name={}&artist_name={}",
                LRCLIB_API,
                urlencoding::encode(title),
                urlencoding::encode(artist)
            )
        } else {
            format!(
                "{}/search?track_name={}",
                LRCLIB_API,
                urlencoding::encode(title)
            )
        };

        debug!("Lrclib search: {}", url);

        let response = match self.client.get(&url).send().await {
            Ok(r) => r,
            Err(e) => {
                warn!("Lrclib request failed: {}", e);
                return None;
            }
        };

        if !response.status().is_success() {
            warn!("Lrclib returned status: {}", response.status());
            return None;
        }

        let results: Vec<LrclibResult> = match response.json().await {
            Ok(r) => r,
            Err(e) => {
                warn!("Failed to parse Lrclib response: {}", e);
                return None;
            }
        };

        // Get first result with lyrics
        let result = results.into_iter().find(|r| {
            r.synced_lyrics.is_some() || r.plain_lyrics.is_some()
        })?;

        let lyrics = LyricsResult {
            synced_lyrics: result.synced_lyrics,
            plain_lyrics: result.plain_lyrics,
            duration: result.duration.map(|d| d.round() as u32),
        };

        info!(
            "Lrclib found: synced={}, plain={}, duration={:?}s",
            lyrics.synced_lyrics.is_some(),
            lyrics.plain_lyrics.is_some(),
            lyrics.duration
        );

        Some(lyrics)
    }

    /// Fetch both song info and lyrics with rate limiting
    ///
    /// Adds a delay between MusicBrainz requests to respect rate limits.
    pub async fn fetch_all(
        &self,
        title: &str,
        artist: Option<&str>,
        fetch_song_info: bool,
        fetch_lyrics: bool,
    ) -> (Option<SongInfo>, Option<LyricsResult>) {
        let mut song_info = None;
        let mut lyrics = None;

        if fetch_song_info {
            song_info = self.fetch_song_info(title, artist).await;
            // Rate limit for MusicBrainz - delay after every request (API counts all requests)
            sleep(Duration::from_millis(MUSICBRAINZ_RATE_LIMIT_MS)).await;
        }

        if fetch_lyrics {
            lyrics = self.fetch_lyrics(title, artist).await;
        }

        (song_info, lyrics)
    }

    /// Escape special Lucene query characters for MusicBrainz search
    fn escape_lucene(s: &str) -> String {
        let special_chars = [
            '+', '-', '&', '|', '!', '(', ')', '{', '}', '[', ']', '^', '"', '~', '*', '?', ':',
            '\\', '/',
        ];
        let mut result = String::with_capacity(s.len() * 2);
        for c in s.chars() {
            if special_chars.contains(&c) {
                result.push('\\');
            }
            result.push(c);
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_escape_lucene_plain_text() {
        assert_eq!(MetadataFetcher::escape_lucene("Queen"), "Queen");
        assert_eq!(
            MetadataFetcher::escape_lucene("Bohemian Rhapsody"),
            "Bohemian Rhapsody"
        );
    }

    #[test]
    fn test_escape_lucene_special_chars() {
        assert_eq!(MetadataFetcher::escape_lucene("AC/DC"), "AC\\/DC");
        assert_eq!(MetadataFetcher::escape_lucene("What's Up?"), "What's Up\\?");
        assert_eq!(MetadataFetcher::escape_lucene("Rock & Roll"), "Rock \\& Roll");
        assert_eq!(MetadataFetcher::escape_lucene("(I Can't Get No) Satisfaction"), "\\(I Can't Get No\\) Satisfaction");
    }

    #[test]
    fn test_escape_lucene_all_special_chars() {
        // Test all Lucene special characters: + - & | ! ( ) { } [ ] ^ " ~ * ? : \ /
        let input = "+-&|!(){}[]^\"~*?:\\/";
        let expected = "\\+\\-\\&\\|\\!\\(\\)\\{\\}\\[\\]\\^\\\"\\~\\*\\?\\:\\\\\\/";
        assert_eq!(MetadataFetcher::escape_lucene(input), expected);
    }

    #[test]
    fn test_escape_lucene_malicious_input() {
        // Potential injection attempts should be escaped
        assert_eq!(
            MetadataFetcher::escape_lucene("title:\"exploit\" OR artist:*"),
            "title\\:\\\"exploit\\\" OR artist\\:\\*"
        );
    }

    #[test]
    fn test_escape_lucene_unicode() {
        // Unicode characters should pass through unchanged
        assert_eq!(MetadataFetcher::escape_lucene("日本語"), "日本語");
        assert_eq!(MetadataFetcher::escape_lucene("Müller"), "Müller");
        assert_eq!(MetadataFetcher::escape_lucene("Beyoncé"), "Beyoncé");
    }
}
