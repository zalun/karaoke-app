use crate::services::metadata_fetcher::{LyricsResult, MetadataFetcher, SongInfo};
use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

/// Supported video file extensions
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "webm", "avi", "mov"];

/// Maximum recursion depth for directory scanning (prevents stack overflow)
const MAX_SCAN_DEPTH: usize = 20;

/// Maximum .hkmeta.json file size in bytes (1MB) to prevent DoS attacks
const MAX_HKMETA_SIZE: u64 = 1024 * 1024;

/// Library folder stored in database
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryFolder {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub last_scan_at: Option<String>,
    pub file_count: u32,
}

/// Video file found in library
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryVideo {
    pub file_path: String,
    pub file_name: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: Option<u32>,
    pub has_lyrics: bool,
    pub has_cdg: bool,
    pub youtube_id: Option<String>,
    pub is_available: bool,
}

/// Scan options
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScanOptions {
    pub create_hkmeta: bool,
    pub fetch_song_info: bool,
    pub fetch_lyrics: bool,
}

/// Result of scanning a folder
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub folder_id: i64,
    pub files_found: u32,
    pub hkmeta_created: u32,
    pub hkmeta_existing: u32,
    pub errors: Vec<String>,
    pub duration_ms: u64,
}

/// Library statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryStats {
    pub total_folders: u32,
    pub total_files: u32,
    pub last_scan_at: Option<String>,
}

/// HomeKaraoke metadata file schema (.hkmeta.json)
/// All fields are optional
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HkMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub artist: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub album: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub year: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub genre: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lyrics: Option<HkMetaLyrics>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<HkMetaSource>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HkMetaLyrics {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HkMetaSource {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub youtube_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_url: Option<String>,
}

pub struct LibraryScanner;

impl LibraryScanner {
    /// Scan a folder for video files
    pub fn scan_folder(folder: &LibraryFolder, options: &ScanOptions) -> ScanResult {
        let start = Instant::now();
        let mut result = ScanResult {
            folder_id: folder.id,
            files_found: 0,
            hkmeta_created: 0,
            hkmeta_existing: 0,
            errors: Vec::new(),
            duration_ms: 0,
        };

        let path = Path::new(&folder.path);
        if !path.exists() {
            result.errors.push(format!("Folder does not exist: {}", folder.path));
            result.duration_ms = start.elapsed().as_millis() as u64;
            return result;
        }

        if !path.is_dir() {
            result.errors.push(format!("Path is not a directory: {}", folder.path));
            result.duration_ms = start.elapsed().as_millis() as u64;
            return result;
        }

        // Recursively find all video files
        let video_files = Self::find_video_files(path);
        result.files_found = video_files.len() as u32;

        info!(
            "Found {} video files in {}",
            result.files_found, folder.path
        );

        // Create metadata fetcher if needed
        let needs_fetching = options.fetch_song_info || options.fetch_lyrics;
        let fetcher = if needs_fetching {
            match MetadataFetcher::new() {
                Ok(f) => Some(f),
                Err(e) => {
                    warn!("Failed to create metadata fetcher: {}", e);
                    None
                }
            }
        } else {
            None
        };

        // Create tokio runtime for async operations if needed
        let runtime = if fetcher.is_some() {
            Some(tokio::runtime::Runtime::new().ok())
        } else {
            None
        };

        // Process each file
        for file_path in &video_files {
            let hkmeta_path = Self::get_hkmeta_path(file_path);

            if hkmeta_path.exists() {
                result.hkmeta_existing += 1;
            } else if options.create_hkmeta {
                // Parse filename first
                let (title, artist) = Self::parse_filename(file_path);

                // Fetch metadata if enabled
                let (song_info, mut lyrics) = if let (Some(ref fetcher), Some(Some(ref rt))) =
                    (&fetcher, &runtime)
                {
                    rt.block_on(async {
                        fetcher
                            .fetch_all(
                                &title,
                                artist.as_deref(),
                                options.fetch_song_info,
                                options.fetch_lyrics,
                            )
                            .await
                    })
                } else {
                    (None, None)
                };

                // Check for companion .lrc file as fallback if no lyrics from API
                if lyrics.is_none() {
                    if let Some(lrc_content) = Self::read_lrc_file(file_path) {
                        debug!("Found companion .lrc file for {:?}", file_path);
                        lyrics = Some(LyricsResult {
                            synced_lyrics: Some(lrc_content),
                            plain_lyrics: None,
                            duration: None,
                        });
                    }
                }

                // Create .hkmeta.json with fetched metadata
                match Self::create_hkmeta_with_metadata(file_path, &title, artist, song_info, lyrics)
                {
                    Ok(_) => {
                        result.hkmeta_created += 1;
                        debug!("Created .hkmeta.json for {:?}", file_path);
                    }
                    Err(e) => {
                        result.errors.push(format!(
                            "Failed to create .hkmeta.json for {:?}: {}",
                            file_path, e
                        ));
                    }
                }
            }
        }

        result.duration_ms = start.elapsed().as_millis() as u64;
        info!(
            "Scan complete: {} files, {} hkmeta created, {} hkmeta existing, {} errors in {}ms",
            result.files_found,
            result.hkmeta_created,
            result.hkmeta_existing,
            result.errors.len(),
            result.duration_ms
        );

        result
    }

    /// Find all video files recursively with depth limiting
    fn find_video_files(dir: &Path) -> Vec<PathBuf> {
        Self::find_video_files_with_depth(dir, 0)
    }

    /// Internal helper for recursive file finding with depth tracking
    fn find_video_files_with_depth(dir: &Path, depth: usize) -> Vec<PathBuf> {
        let mut files = Vec::new();

        // Prevent excessive recursion
        if depth > MAX_SCAN_DEPTH {
            warn!(
                "Max scan depth ({}) exceeded at: {}",
                MAX_SCAN_DEPTH,
                dir.display()
            );
            return files;
        }

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();

                // Skip symlinks to prevent infinite loops
                if path.is_symlink() {
                    debug!("Skipping symlink: {}", path.display());
                    continue;
                }

                if path.is_dir() {
                    // Recurse into subdirectories with incremented depth
                    files.extend(Self::find_video_files_with_depth(&path, depth + 1));
                } else if Self::is_video_file(&path) {
                    files.push(path);
                }
            }
        }

        files
    }

    /// Check if a path is a video file
    fn is_video_file(path: &Path) -> bool {
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| VIDEO_EXTENSIONS.contains(&ext.to_lowercase().as_str()))
            .unwrap_or(false)
    }

    /// Get the .hkmeta.json path for a video file
    fn get_hkmeta_path(video_path: &Path) -> PathBuf {
        let stem = video_path.file_stem().unwrap_or_default();
        let parent = video_path.parent().unwrap_or(Path::new("."));
        parent.join(format!("{}.hkmeta.json", stem.to_string_lossy()))
    }

    /// Search files by query across all folders
    pub fn search(folders: &[LibraryFolder], query: &str, limit: u32) -> Vec<LibraryVideo> {
        let query_lower = query.to_lowercase();
        let mut results = Vec::new();

        for folder in folders {
            let path = Path::new(&folder.path);
            if !path.exists() || !path.is_dir() {
                continue;
            }

            let video_files = Self::find_video_files(path);

            for file_path in video_files {
                if results.len() >= limit as usize {
                    break;
                }

                // Load metadata
                let (title, artist, album, duration, has_lyrics, has_cdg, youtube_id) =
                    Self::load_metadata(&file_path);

                // Search in title, artist, album, and filename
                let file_name = file_path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();

                let searchable = format!(
                    "{} {} {} {}",
                    title.to_lowercase(),
                    artist.as_deref().unwrap_or("").to_lowercase(),
                    album.as_deref().unwrap_or("").to_lowercase(),
                    file_name.to_lowercase()
                );

                if searchable.contains(&query_lower) {
                    results.push(LibraryVideo {
                        file_path: file_path.to_string_lossy().to_string(),
                        file_name,
                        title,
                        artist,
                        album,
                        duration,
                        has_lyrics,
                        has_cdg,
                        youtube_id,
                        is_available: true, // We just found it, so it's available
                    });
                }
            }
        }

        results
    }

    /// Load metadata from .hkmeta.json or parse from filename
    /// Returns: (title, artist, album, duration, has_lyrics, has_cdg, youtube_id)
    fn load_metadata(video_path: &Path) -> (String, Option<String>, Option<String>, Option<u32>, bool, bool, Option<String>) {
        let hkmeta_path = Self::get_hkmeta_path(video_path);

        // Check for CDG companion file (MP3+G karaoke format)
        let has_cdg = Self::has_cdg_companion(video_path);

        if hkmeta_path.exists() {
            // Check file size before reading to prevent DoS
            if let Ok(metadata) = fs::metadata(&hkmeta_path) {
                if metadata.len() > MAX_HKMETA_SIZE {
                    warn!("Skipping oversized .hkmeta.json ({} bytes): {:?}", metadata.len(), hkmeta_path);
                } else if let Ok(content) = fs::read_to_string(&hkmeta_path) {
                    if let Ok(hkmeta) = serde_json::from_str::<HkMeta>(&content) {
                        let (parsed_title, parsed_artist) = Self::parse_filename(video_path);
                        // Check for CDG tag in metadata or companion file
                        let has_cdg_from_meta = hkmeta
                            .tags
                            .as_ref()
                            .map(|tags| tags.iter().any(|t| t.to_lowercase() == "cdg"))
                            .unwrap_or(false);
                        return (
                            hkmeta.title.unwrap_or(parsed_title),
                            hkmeta.artist.or(parsed_artist),
                            hkmeta.album,
                            hkmeta.duration,
                            hkmeta.lyrics.is_some(),
                            has_cdg || has_cdg_from_meta,
                            hkmeta.source.and_then(|s| s.youtube_id),
                        );
                    }
                }
            }
        }

        // Check for LRC companion file
        let lrc_path = video_path.with_extension("lrc");
        let has_lyrics = lrc_path.exists();

        // Fall back to filename parsing
        let (title, artist) = Self::parse_filename(video_path);
        (title, artist, None, None, has_lyrics, has_cdg, None)
    }

    /// Parse filename for artist and title
    /// Supports patterns: "Artist - Title.mp4", "Title (Artist).mp4"
    pub fn parse_filename(video_path: &Path) -> (String, Option<String>) {
        let stem = video_path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // Try "Artist - Title" pattern (use rfind to handle artists with hyphens like "AC-DC")
        if let Some(idx) = stem.rfind(" - ") {
            let artist = stem[..idx].trim().to_string();
            let title = stem[idx + 3..].trim().to_string();
            if !artist.is_empty() && !title.is_empty() {
                return (title, Some(artist));
            }
        }

        // Try "Title (Artist)" pattern
        if let Some(start) = stem.rfind('(') {
            if let Some(end) = stem.rfind(')') {
                if start < end {
                    let title = stem[..start].trim().to_string();
                    let artist = stem[start + 1..end].trim().to_string();
                    if !title.is_empty() && !artist.is_empty() {
                        return (title, Some(artist));
                    }
                }
            }
        }

        // Fall back to full filename as title
        (stem, None)
    }

    /// Read .hkmeta.json sidecar file
    pub fn read_hkmeta(video_path: &Path) -> Option<HkMeta> {
        let hkmeta_path = Self::get_hkmeta_path(video_path);

        if !hkmeta_path.exists() {
            return None;
        }

        // Check file size before reading to prevent DoS
        match fs::metadata(&hkmeta_path) {
            Ok(metadata) if metadata.len() > MAX_HKMETA_SIZE => {
                warn!("Skipping oversized .hkmeta.json ({} bytes): {:?}", metadata.len(), hkmeta_path);
                return None;
            }
            Err(_) => return None,
            _ => {}
        }

        match fs::read_to_string(&hkmeta_path) {
            Ok(content) => match serde_json::from_str::<HkMeta>(&content) {
                Ok(hkmeta) => Some(hkmeta),
                Err(e) => {
                    warn!("Failed to parse .hkmeta.json at {:?}: {}", hkmeta_path, e);
                    None
                }
            },
            Err(e) => {
                warn!("Failed to read .hkmeta.json at {:?}: {}", hkmeta_path, e);
                None
            }
        }
    }

    /// Create .hkmeta.json from parsed filename
    fn create_hkmeta_from_filename(video_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
        let (title, artist) = Self::parse_filename(video_path);

        let hkmeta = HkMeta {
            version: Some(1),
            title: Some(title),
            artist,
            ..Default::default()
        };

        let hkmeta_path = Self::get_hkmeta_path(video_path);
        let content = serde_json::to_string_pretty(&hkmeta)?;
        fs::write(&hkmeta_path, content)?;

        Ok(())
    }

    /// Create .hkmeta.json with fetched metadata from APIs
    fn create_hkmeta_with_metadata(
        video_path: &Path,
        title: &str,
        artist: Option<String>,
        song_info: Option<SongInfo>,
        lyrics_result: Option<LyricsResult>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Start with parsed filename data
        let mut hkmeta = HkMeta {
            version: Some(1),
            title: Some(title.to_string()),
            artist: artist.clone(),
            ..Default::default()
        };

        // Check for CDG companion file and add tag if found
        if Self::has_cdg_companion(video_path) {
            hkmeta.tags = Some(vec!["cdg".to_string()]);
        }

        // Merge in MusicBrainz song info if available
        if let Some(info) = song_info {
            // Duration from API (in milliseconds, convert to seconds)
            if let Some(duration_ms) = info.duration_ms {
                hkmeta.duration = Some(duration_ms / 1000);
            }

            // Album from first release
            if info.album.is_some() {
                hkmeta.album = info.album;
            }

            // Year from release date
            if info.year.is_some() {
                hkmeta.year = info.year;
            }

            // Use artist credit from API if we didn't have one from filename
            if hkmeta.artist.is_none() && info.artist_credit.is_some() {
                hkmeta.artist = info.artist_credit;
            }
        }

        // Add lyrics if available
        if let Some(lyrics) = lyrics_result {
            // Prefer synced lyrics over plain
            if let Some(synced) = lyrics.synced_lyrics {
                hkmeta.lyrics = Some(HkMetaLyrics {
                    format: Some("lrc".to_string()),
                    content: Some(synced),
                });
            } else if let Some(plain) = lyrics.plain_lyrics {
                hkmeta.lyrics = Some(HkMetaLyrics {
                    format: Some("plain".to_string()),
                    content: Some(plain),
                });
            }

            // Use duration from lyrics API if we don't have one yet
            if hkmeta.duration.is_none() {
                if let Some(duration) = lyrics.duration {
                    hkmeta.duration = Some(duration);
                }
            }
        }

        let hkmeta_path = Self::get_hkmeta_path(video_path);
        let content = serde_json::to_string_pretty(&hkmeta)?;
        fs::write(&hkmeta_path, content)?;

        info!(
            "Created .hkmeta.json for {:?}: title={:?}, artist={:?}, album={:?}, year={:?}, has_lyrics={}, has_cdg={}",
            video_path.file_name(),
            hkmeta.title,
            hkmeta.artist,
            hkmeta.album,
            hkmeta.year,
            hkmeta.lyrics.is_some(),
            hkmeta.tags.is_some()
        );

        Ok(())
    }

    /// Check if a file exists
    pub fn check_file_exists(file_path: &str) -> bool {
        Path::new(file_path).exists()
    }

    /// Check for companion .cdg file (MP3+G karaoke format)
    fn has_cdg_companion(video_path: &Path) -> bool {
        let cdg_path = video_path.with_extension("cdg");
        if cdg_path.exists() {
            debug!("Found CDG companion file: {:?}", cdg_path);
            return true;
        }

        // Also check for uppercase .CDG
        let stem = video_path.file_stem().unwrap_or_default();
        let parent = video_path.parent().unwrap_or(Path::new("."));
        let cdg_upper = parent.join(format!("{}.CDG", stem.to_string_lossy()));
        if cdg_upper.exists() {
            debug!("Found CDG companion file (uppercase): {:?}", cdg_upper);
            return true;
        }

        false
    }

    /// Read companion .lrc file for a video
    /// Returns the content of the LRC file if it exists and is readable
    fn read_lrc_file(video_path: &Path) -> Option<String> {
        let lrc_path = video_path.with_extension("lrc");

        if !lrc_path.exists() {
            return None;
        }

        // Check file size (LRC files should be small, limit to 1MB)
        match fs::metadata(&lrc_path) {
            Ok(metadata) if metadata.len() > MAX_HKMETA_SIZE => {
                warn!(
                    "Skipping oversized .lrc file ({} bytes): {:?}",
                    metadata.len(),
                    lrc_path
                );
                return None;
            }
            Err(e) => {
                warn!("Failed to read .lrc metadata: {}", e);
                return None;
            }
            _ => {}
        }

        match fs::read_to_string(&lrc_path) {
            Ok(content) => {
                info!("Read companion .lrc file: {:?}", lrc_path);
                Some(content)
            }
            Err(e) => {
                warn!("Failed to read .lrc file {:?}: {}", lrc_path, e);
                None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_filename_artist_title() {
        let path = Path::new("/music/Queen - Bohemian Rhapsody.mp4");
        let (title, artist) = LibraryScanner::parse_filename(path);
        assert_eq!(title, "Bohemian Rhapsody");
        assert_eq!(artist, Some("Queen".to_string()));
    }

    #[test]
    fn test_parse_filename_title_artist_parens() {
        let path = Path::new("/music/Bohemian Rhapsody (Queen).mp4");
        let (title, artist) = LibraryScanner::parse_filename(path);
        assert_eq!(title, "Bohemian Rhapsody");
        assert_eq!(artist, Some("Queen".to_string()));
    }

    #[test]
    fn test_parse_filename_title_only() {
        let path = Path::new("/music/Bohemian Rhapsody.mp4");
        let (title, artist) = LibraryScanner::parse_filename(path);
        assert_eq!(title, "Bohemian Rhapsody");
        assert_eq!(artist, None);
    }

    #[test]
    fn test_is_video_file() {
        assert!(LibraryScanner::is_video_file(Path::new("video.mp4")));
        assert!(LibraryScanner::is_video_file(Path::new("video.MKV")));
        assert!(LibraryScanner::is_video_file(Path::new("video.webm")));
        assert!(!LibraryScanner::is_video_file(Path::new("audio.mp3")));
        assert!(!LibraryScanner::is_video_file(Path::new("image.jpg")));
    }

    #[test]
    fn test_get_hkmeta_path() {
        let video = Path::new("/music/Queen - Bohemian Rhapsody.mp4");
        let hkmeta = LibraryScanner::get_hkmeta_path(video);
        assert_eq!(
            hkmeta,
            Path::new("/music/Queen - Bohemian Rhapsody.hkmeta.json")
        );
    }
}
