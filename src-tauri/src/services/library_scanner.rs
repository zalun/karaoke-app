use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

/// Supported video file extensions
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "webm", "avi", "mov"];

/// Maximum recursion depth for directory scanning (prevents stack overflow)
const MAX_SCAN_DEPTH: usize = 20;

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

        // Process each file
        for file_path in &video_files {
            let hkmeta_path = Self::get_hkmeta_path(file_path);

            if hkmeta_path.exists() {
                result.hkmeta_existing += 1;
            } else if options.create_hkmeta {
                // Create .hkmeta.json with parsed filename
                match Self::create_hkmeta_from_filename(file_path) {
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
                let (title, artist, album, duration, has_lyrics, youtube_id) =
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
                        youtube_id,
                        is_available: true, // We just found it, so it's available
                    });
                }
            }
        }

        results
    }

    /// Load metadata from .hkmeta.json or parse from filename
    fn load_metadata(video_path: &Path) -> (String, Option<String>, Option<String>, Option<u32>, bool, Option<String>) {
        let hkmeta_path = Self::get_hkmeta_path(video_path);

        if hkmeta_path.exists() {
            if let Ok(content) = fs::read_to_string(&hkmeta_path) {
                if let Ok(hkmeta) = serde_json::from_str::<HkMeta>(&content) {
                    let (parsed_title, parsed_artist) = Self::parse_filename(video_path);
                    return (
                        hkmeta.title.unwrap_or(parsed_title),
                        hkmeta.artist.or(parsed_artist),
                        hkmeta.album,
                        hkmeta.duration,
                        hkmeta.lyrics.is_some(),
                        hkmeta.source.and_then(|s| s.youtube_id),
                    );
                }
            }
        }

        // Check for LRC companion file
        let lrc_path = video_path.with_extension("lrc");
        let has_lyrics = lrc_path.exists();

        // Fall back to filename parsing
        let (title, artist) = Self::parse_filename(video_path);
        (title, artist, None, None, has_lyrics, None)
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

    /// Check if a file exists
    pub fn check_file_exists(file_path: &str) -> bool {
        Path::new(file_path).exists()
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
