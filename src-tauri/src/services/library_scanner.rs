use crate::services::ffmpeg::FfmpegService;
use crate::services::metadata_fetcher::{LyricsResult, MetadataFetcher, SongInfo};
use log::{debug, info, warn};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::Instant;

/// Valid year range for song release dates
const MIN_VALID_YEAR: u32 = 1900;
const MAX_VALID_YEAR: u32 = 2099;

/// Regex patterns for extracting year from filename (lazily compiled)
/// Priority order: (YYYY), [YYYY], delimited YYYY, trailing YYYY
static YEAR_PATTERN_PARENS: OnceLock<Regex> = OnceLock::new();
static YEAR_PATTERN_BRACKETS: OnceLock<Regex> = OnceLock::new();
static YEAR_PATTERN_DELIMITED: OnceLock<Regex> = OnceLock::new();
static YEAR_PATTERN_TRAILING: OnceLock<Regex> = OnceLock::new();

fn year_pattern_parens() -> &'static Regex {
    YEAR_PATTERN_PARENS.get_or_init(|| Regex::new(r"\((\d{4})\)").expect("Invalid parens year regex"))
}

fn year_pattern_brackets() -> &'static Regex {
    YEAR_PATTERN_BRACKETS.get_or_init(|| Regex::new(r"\[(\d{4})\]").expect("Invalid brackets year regex"))
}

fn year_pattern_delimited() -> &'static Regex {
    YEAR_PATTERN_DELIMITED.get_or_init(|| Regex::new(r"[_\s-](\d{4})[_\s-]").expect("Invalid delimited year regex"))
}

fn year_pattern_trailing() -> &'static Regex {
    YEAR_PATTERN_TRAILING.get_or_init(|| Regex::new(r"[_\s-](\d{4})$").expect("Invalid trailing year regex"))
}

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
    /// Path to the video thumbnail (if generated)
    pub thumbnail_path: Option<String>,
}

/// Scan options
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ScanOptions {
    pub create_hkmeta: bool,
    pub fetch_song_info: bool,
    pub fetch_lyrics: bool,
    /// Regenerate existing .hkmeta.json files (re-fetch from APIs)
    pub regenerate: bool,
    /// Generate thumbnails for videos (requires ffmpeg)
    pub generate_thumbnails: bool,
}

/// Result of scanning a folder
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub folder_id: i64,
    pub files_found: u32,
    pub hkmeta_created: u32,
    pub hkmeta_existing: u32,
    pub thumbnails_generated: u32,
    pub thumbnails_failed: u32,
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
            thumbnails_generated: 0,
            thumbnails_failed: 0,
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

        // Create tokio runtime for async operations if needed (metadata fetching or thumbnail generation)
        // Note: For large libraries (1000+ files), scanning can take hours due to
        // MusicBrainz rate limiting (1 req/sec). Consider batching or background processing.
        let needs_runtime = fetcher.is_some() || options.generate_thumbnails;
        let runtime = if needs_runtime {
            match tokio::runtime::Runtime::new() {
                Ok(rt) => Some(rt),
                Err(e) => {
                    warn!("Failed to create tokio runtime: {}", e);
                    None
                }
            }
        } else {
            None
        };

        // Check ffmpeg availability once if thumbnail generation is enabled
        let ffmpeg_available = options.generate_thumbnails && FfmpegService::is_available();

        // Process each file
        for file_path in &video_files {
            // Check for existing hkmeta in either new or legacy location
            let existing_hkmeta = Self::find_hkmeta_path(path, file_path);

            // Skip if exists and not regenerating
            if existing_hkmeta.is_some() && !options.regenerate {
                result.hkmeta_existing += 1;
            } else if options.create_hkmeta || options.regenerate {
                // Parse filename first
                let (title, artist) = Self::parse_filename(file_path);

                // Fetch metadata if enabled
                let (song_info, mut lyrics) =
                    if let (Some(ref fetcher), Some(ref rt)) = (&fetcher, &runtime) {
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

                // Detect duration using ffprobe if we don't have it from API
                let api_has_duration = song_info.as_ref().map(|s| s.duration_ms.is_some()).unwrap_or(false)
                    || lyrics.as_ref().map(|l| l.duration.is_some()).unwrap_or(false);

                let detected_duration = if !api_has_duration && ffmpeg_available {
                    if let Some(ref rt) = runtime {
                        let duration = rt.block_on(FfmpegService::get_duration(file_path));
                        if let Some(d) = duration {
                            debug!("Detected duration via ffprobe for {:?}: {}s", file_path, d);
                        }
                        duration
                    } else {
                        None
                    }
                } else {
                    None
                };

                // Detect year using fallback chain: filename → ffprobe → (MusicBrainz handled in create_hkmeta)
                let detected_year = {
                    // 1. Try filename parsing first (instant, no I/O)
                    let year_from_filename = Self::parse_year_from_filename(file_path);
                    if year_from_filename.is_some() {
                        year_from_filename
                    } else if ffmpeg_available {
                        // 2. Try ffprobe metadata tags
                        if let Some(ref rt) = runtime {
                            let year = rt.block_on(FfmpegService::get_year(file_path));
                            if let Some(y) = year {
                                debug!("Detected year via ffprobe for {:?}: {}", file_path, y);
                            }
                            year
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                };

                // Create .hkmeta.json with fetched metadata
                match Self::create_hkmeta_with_metadata(path, file_path, &title, artist, song_info, lyrics, detected_duration, detected_year)
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

            // Generate thumbnail if enabled and ffmpeg is available
            if ffmpeg_available {
                let thumbnail_path = Self::get_thumbnail_path(path, file_path);
                // Only generate if thumbnail doesn't exist (or regenerating)
                if !thumbnail_path.exists() || options.regenerate {
                    if let Some(ref rt) = runtime {
                        let thumbnail_result = rt.block_on(
                            FfmpegService::extract_thumbnail_smart(file_path, &thumbnail_path)
                        );
                        match thumbnail_result {
                            Ok(_) => {
                                result.thumbnails_generated += 1;
                                debug!("Generated thumbnail for {:?}", file_path);
                            }
                            Err(e) => {
                                result.thumbnails_failed += 1;
                                debug!("Failed to generate thumbnail for {:?}: {}", file_path, e);
                            }
                        }
                    }
                }
            }
        }

        result.duration_ms = start.elapsed().as_millis() as u64;
        info!(
            "Scan complete: {} files, {} hkmeta created, {} hkmeta existing, {} thumbnails ({} failed), {} errors in {}ms",
            result.files_found,
            result.hkmeta_created,
            result.hkmeta_existing,
            result.thumbnails_generated,
            result.thumbnails_failed,
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

                // Skip .homekaraoke metadata directories
                if let Some(name) = path.file_name() {
                    if name == ".homekaraoke" {
                        debug!("Skipping metadata directory: {}", path.display());
                        continue;
                    }
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

    /// Get the legacy sidecar path for .hkmeta.json (next to video file)
    fn get_legacy_hkmeta_path(video_path: &Path) -> PathBuf {
        let stem = video_path.file_stem().unwrap_or_default();
        let parent = video_path.parent().unwrap_or(Path::new("."));
        parent.join(format!("{}.hkmeta.json", stem.to_string_lossy()))
    }

    /// Get the .homekaraoke directory for a library folder
    /// Creates a subdirectory structure that mirrors the video's relative path
    fn get_homekaraoke_dir(library_path: &Path, video_path: &Path) -> PathBuf {
        // Calculate relative path from library root to video's parent directory
        let relative = if let Some(parent) = video_path.parent() {
            match parent.strip_prefix(library_path) {
                Ok(rel) => rel.to_path_buf(),
                Err(_) => {
                    warn!(
                        "Video path {:?} is not under library path {:?}, using root .homekaraoke",
                        video_path, library_path
                    );
                    PathBuf::new()
                }
            }
        } else {
            PathBuf::new()
        };
        library_path.join(".homekaraoke").join(relative)
    }

    /// Get path for .hkmeta.json file in .homekaraoke directory
    fn get_hkmeta_path(library_path: &Path, video_path: &Path) -> PathBuf {
        let stem = video_path.file_stem().unwrap_or_default();
        let dir = Self::get_homekaraoke_dir(library_path, video_path);
        dir.join(format!("{}.hkmeta.json", stem.to_string_lossy()))
    }

    /// Get path for thumbnail file in .homekaraoke directory
    fn get_thumbnail_path(library_path: &Path, video_path: &Path) -> PathBuf {
        let stem = video_path.file_stem().unwrap_or_default();
        let dir = Self::get_homekaraoke_dir(library_path, video_path);
        dir.join(format!("{}.thumb.jpg", stem.to_string_lossy()))
    }

    /// Find and load .hkmeta.json from either new or legacy location
    /// Checks .homekaraoke directory first, falls back to legacy sidecar location
    fn find_hkmeta_path(library_path: &Path, video_path: &Path) -> Option<PathBuf> {
        // Try new location first
        let new_path = Self::get_hkmeta_path(library_path, video_path);
        if new_path.exists() {
            return Some(new_path);
        }
        // Fall back to legacy sidecar location
        let legacy_path = Self::get_legacy_hkmeta_path(video_path);
        if legacy_path.exists() {
            return Some(legacy_path);
        }
        None
    }

    /// Search files by query across all folders
    /// If include_lyrics is true, also searches within lyrics content
    /// Note: Results are returned in folder order (first-come). Once limit is reached,
    /// remaining folders are not searched.
    pub fn search(folders: &[LibraryFolder], query: &str, limit: u32, include_lyrics: bool) -> Vec<LibraryVideo> {
        let query_lower = query.to_lowercase();
        let mut results = Vec::new();

        'outer: for folder in folders {
            let path = Path::new(&folder.path);
            if !path.exists() || !path.is_dir() {
                continue;
            }

            let video_files = Self::find_video_files(path);

            for file_path in video_files {
                if results.len() >= limit as usize {
                    break 'outer;
                }

                // Load metadata
                let (title, artist, album, duration, has_lyrics, has_cdg, youtube_id, thumbnail_path) =
                    Self::load_metadata(path, &file_path);

                // Search in title, artist, album, and filename
                let file_name = file_path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();

                // Build searchable string with all metadata fields
                let mut searchable = format!(
                    "{} {} {} {}",
                    title.to_lowercase(),
                    artist.as_deref().unwrap_or("").to_lowercase(),
                    album.as_deref().unwrap_or("").to_lowercase(),
                    file_name.to_lowercase()
                );

                // Check for early match on basic fields (title/artist/filename)
                // before loading full hkmeta which may contain large lyrics content
                let basic_match = searchable.contains(&query_lower);

                // Add additional metadata fields from hkmeta
                if let Some(hkmeta) = Self::load_hkmeta(path, &file_path) {
                    if let Some(year) = hkmeta.year {
                        searchable.push(' ');
                        searchable.push_str(&year.to_string());
                    }
                    if let Some(genre) = &hkmeta.genre {
                        searchable.push(' ');
                        searchable.push_str(&genre.to_lowercase());
                    }
                    if let Some(language) = &hkmeta.language {
                        searchable.push(' ');
                        searchable.push_str(&language.to_lowercase());
                    }
                    if let Some(tags) = &hkmeta.tags {
                        for tag in tags {
                            searchable.push(' ');
                            searchable.push_str(&tag.to_lowercase());
                        }
                    }
                    // Only include lyrics in search if no basic match found
                    // This optimization avoids loading/processing large lyrics content
                    // when the file already matches on title/artist/filename
                    if include_lyrics && !basic_match {
                        if let Some(lyrics) = &hkmeta.lyrics {
                            if let Some(content) = &lyrics.content {
                                searchable.push(' ');
                                searchable.push_str(&content.to_lowercase());
                            }
                        }
                    }
                }

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
                        thumbnail_path,
                    });
                }
            }
        }

        results
    }

    /// Browse all files in folders with optional filters
    pub fn browse(
        folders: &[LibraryFolder],
        has_lyrics_filter: Option<bool>,
        has_cdg_filter: Option<bool>,
    ) -> Vec<LibraryVideo> {
        let mut results = Vec::new();

        for folder in folders {
            let path = Path::new(&folder.path);
            if !path.exists() || !path.is_dir() {
                continue;
            }

            let video_files = Self::find_video_files(path);

            for file_path in video_files {
                // Load metadata
                let (title, artist, album, duration, has_lyrics, has_cdg, youtube_id, thumbnail_path) =
                    Self::load_metadata(path, &file_path);

                // Apply filters
                if let Some(filter_has_lyrics) = has_lyrics_filter {
                    if has_lyrics != filter_has_lyrics {
                        continue;
                    }
                }

                if let Some(filter_has_cdg) = has_cdg_filter {
                    if has_cdg != filter_has_cdg {
                        continue;
                    }
                }

                let file_name = file_path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();

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
                    is_available: true,
                    thumbnail_path,
                });
            }
        }

        results
    }

    /// Load HkMeta from .hkmeta.json file (checks both new and legacy locations)
    fn load_hkmeta(library_path: &Path, video_path: &Path) -> Option<HkMeta> {
        let hkmeta_path = Self::find_hkmeta_path(library_path, video_path)?;

        // Check file size before reading
        let metadata = fs::metadata(&hkmeta_path).ok()?;
        if metadata.len() > MAX_HKMETA_SIZE {
            warn!("Skipping oversized .hkmeta.json ({} bytes): {:?}", metadata.len(), hkmeta_path);
            return None;
        }

        let content = fs::read_to_string(&hkmeta_path).ok()?;
        serde_json::from_str::<HkMeta>(&content).ok()
    }

    /// Load metadata from .hkmeta.json or parse from filename
    /// Returns: (title, artist, album, duration, has_lyrics, has_cdg, youtube_id, thumbnail_path)
    fn load_metadata(library_path: &Path, video_path: &Path) -> (String, Option<String>, Option<String>, Option<u32>, bool, bool, Option<String>, Option<String>) {
        // Check for CDG companion file (MP3+G karaoke format)
        let has_cdg = Self::has_cdg_companion(video_path);

        // Check for thumbnail
        let thumbnail_path = Self::get_thumbnail_path(library_path, video_path);
        let thumbnail = if thumbnail_path.exists() {
            Some(thumbnail_path.to_string_lossy().to_string())
        } else {
            None
        };

        // Try to load from .hkmeta.json (new location first, then legacy)
        if let Some(hkmeta_path) = Self::find_hkmeta_path(library_path, video_path) {
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
                            thumbnail,
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
        (title, artist, None, None, has_lyrics, has_cdg, None, thumbnail)
    }

    /// Parse filename for artist and title
    /// Supports patterns: "Artist - Title.mp4", "Title (Artist).mp4"
    pub fn parse_filename(video_path: &Path) -> (String, Option<String>) {
        let stem = video_path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // Try "Artist - Title" pattern (use find to split on first separator)
        // This handles "Artist - Title - Subtitle" correctly but not "AC-DC - Title"
        // For hyphenated artists, use .hkmeta.json or "Title (Artist).mp4" format
        if let Some(idx) = stem.find(" - ") {
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

    /// Parse year from filename using common patterns
    /// Returns year if found (valid range: 1900-2099)
    /// Patterns checked in priority order:
    /// - (YYYY) - e.g., "Artist - Title (2023).mp4"
    /// - [YYYY] - e.g., "Artist - Title [1985].mp4"
    /// - delimited YYYY - e.g., "Artist - Title - 2020 - Karaoke.mp4"
    /// - trailing YYYY - e.g., "Artist - Title - 2020.mp4"
    pub fn parse_year_from_filename(video_path: &Path) -> Option<u32> {
        let stem = video_path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy();

        // Try patterns in priority order
        let patterns: &[&Regex] = &[
            year_pattern_parens(),
            year_pattern_brackets(),
            year_pattern_delimited(),
            year_pattern_trailing(),
        ];

        for pattern in patterns {
            if let Some(caps) = pattern.captures(&stem) {
                if let Some(year_match) = caps.get(1) {
                    if let Ok(year) = year_match.as_str().parse::<u32>() {
                        // Valid range: 1900-2099
                        if year >= MIN_VALID_YEAR && year <= MAX_VALID_YEAR {
                            debug!("Year {} extracted from filename: {:?}", year, video_path);
                            return Some(year);
                        }
                    }
                }
            }
        }

        None
    }

    /// Read .hkmeta.json sidecar file (checks both new and legacy locations)
    #[allow(dead_code)]
    pub fn read_hkmeta(library_path: &Path, video_path: &Path) -> Option<HkMeta> {
        let hkmeta_path = Self::find_hkmeta_path(library_path, video_path)?;

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
    #[allow(dead_code)]
    fn create_hkmeta_from_filename(library_path: &Path, video_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
        let (title, artist) = Self::parse_filename(video_path);

        let hkmeta = HkMeta {
            version: Some(1),
            title: Some(title),
            artist,
            ..Default::default()
        };

        let hkmeta_path = Self::get_hkmeta_path(library_path, video_path);
        // Ensure the .homekaraoke directory exists
        if let Some(parent) = hkmeta_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(&hkmeta)?;
        fs::write(&hkmeta_path, content)?;

        Ok(())
    }

    /// Create .hkmeta.json with fetched metadata from APIs
    fn create_hkmeta_with_metadata(
        library_path: &Path,
        video_path: &Path,
        title: &str,
        artist: Option<String>,
        song_info: Option<SongInfo>,
        lyrics_result: Option<LyricsResult>,
        detected_duration: Option<u32>,
        detected_year: Option<u32>,
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

            // Year: prefer detected_year (filename/ffprobe), fallback to MusicBrainz
            if detected_year.is_some() {
                hkmeta.year = detected_year;
            } else if info.year.is_some() {
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

        // Use ffprobe-detected duration if we still don't have one
        if hkmeta.duration.is_none() && detected_duration.is_some() {
            hkmeta.duration = detected_duration;
        }

        // Use detected year (filename/ffprobe) if we still don't have one
        if hkmeta.year.is_none() && detected_year.is_some() {
            hkmeta.year = detected_year;
        }

        let hkmeta_path = Self::get_hkmeta_path(library_path, video_path);
        // Ensure the .homekaraoke directory exists
        if let Some(parent) = hkmeta_path.parent() {
            fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(&hkmeta)?;
        fs::write(&hkmeta_path, content)?;

        info!(
            "Created .hkmeta.json for {:?}: title={:?}, artist={:?}, album={:?}, year={:?}, duration={:?}s, has_lyrics={}, has_cdg={}",
            video_path.file_name(),
            hkmeta.title,
            hkmeta.artist,
            hkmeta.album,
            hkmeta.year,
            hkmeta.duration,
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
        let library = Path::new("/music");
        let video = Path::new("/music/Queen - Bohemian Rhapsody.mp4");
        let hkmeta = LibraryScanner::get_hkmeta_path(library, video);
        assert_eq!(
            hkmeta,
            Path::new("/music/.homekaraoke/Queen - Bohemian Rhapsody.hkmeta.json")
        );

        // Test with subdirectory
        let video2 = Path::new("/music/Queen/Bohemian Rhapsody.mp4");
        let hkmeta2 = LibraryScanner::get_hkmeta_path(library, video2);
        assert_eq!(
            hkmeta2,
            Path::new("/music/.homekaraoke/Queen/Bohemian Rhapsody.hkmeta.json")
        );
    }

    #[test]
    fn test_get_thumbnail_path() {
        let library = Path::new("/music");
        let video = Path::new("/music/Queen - Bohemian Rhapsody.mp4");
        let thumb = LibraryScanner::get_thumbnail_path(library, video);
        assert_eq!(
            thumb,
            Path::new("/music/.homekaraoke/Queen - Bohemian Rhapsody.thumb.jpg")
        );
    }

    #[test]
    fn test_get_legacy_hkmeta_path() {
        let video = Path::new("/music/Queen - Bohemian Rhapsody.mp4");
        let hkmeta = LibraryScanner::get_legacy_hkmeta_path(video);
        assert_eq!(
            hkmeta,
            Path::new("/music/Queen - Bohemian Rhapsody.hkmeta.json")
        );
    }

    #[test]
    fn test_parse_filename_artist_with_hyphen() {
        // "AC-DC" has a hyphen but NOT " - " (space-hyphen-space), so it parses correctly
        let path = Path::new("/music/AC-DC - Back In Black.mp4");
        let (title, artist) = LibraryScanner::parse_filename(path);
        assert_eq!(title, "Back In Black");
        assert_eq!(artist, Some("AC-DC".to_string()));
    }

    #[test]
    fn test_parse_filename_multiple_hyphens() {
        // Multiple " - " separators - splits on first one for correct Artist/Title-Subtitle
        let path = Path::new("/music/Twenty One Pilots - Heathens - From Suicide Squad.mp4");
        let (title, artist) = LibraryScanner::parse_filename(path);
        assert_eq!(title, "Heathens - From Suicide Squad");
        assert_eq!(artist, Some("Twenty One Pilots".to_string()));
    }

    #[test]
    fn test_parse_filename_hyphenated_artist_with_subtitle() {
        // Complex case: hyphenated artist AND subtitle
        // "Artist-Name - Title - Subtitle" → splits on first " - "
        let path = Path::new("/music/Twenty-One Pilots - Heathens - Live Version.mp4");
        let (title, artist) = LibraryScanner::parse_filename(path);
        assert_eq!(title, "Heathens - Live Version");
        assert_eq!(artist, Some("Twenty-One Pilots".to_string()));
    }

    #[test]
    fn test_cdg_companion_detection() {
        // CDG detection relies on file system, so we test the path logic
        let video = Path::new("/music/karaoke.mp4");
        let cdg_path = video.with_extension("cdg");
        assert_eq!(cdg_path, Path::new("/music/karaoke.cdg"));
    }

    // Tests for parse_year_from_filename

    #[test]
    fn test_parse_year_parentheses() {
        // Year in parentheses: (YYYY)
        let path = Path::new("/music/Artist - Song Title (1985).mp4");
        assert_eq!(LibraryScanner::parse_year_from_filename(&path), Some(1985));
    }

    #[test]
    fn test_parse_year_brackets() {
        // Year in brackets: [YYYY]
        let path = Path::new("/music/Artist - Song Title [2020].mp4");
        assert_eq!(LibraryScanner::parse_year_from_filename(&path), Some(2020));
    }

    #[test]
    fn test_parse_year_delimited() {
        // Year delimited by spaces/hyphens/underscores
        let path = Path::new("/music/Artist - Song Title - 2015 - Karaoke.mp4");
        assert_eq!(LibraryScanner::parse_year_from_filename(&path), Some(2015));
    }

    #[test]
    fn test_parse_year_trailing() {
        // Year at end of filename
        let path = Path::new("/music/Artist - Song Title - 2018.mp4");
        assert_eq!(LibraryScanner::parse_year_from_filename(&path), Some(2018));
    }

    #[test]
    fn test_parse_year_priority_parens_over_brackets() {
        // Parentheses should take priority over brackets
        let path = Path::new("/music/Song [1985] (2023).mp4");
        assert_eq!(LibraryScanner::parse_year_from_filename(&path), Some(2023));
    }

    #[test]
    fn test_parse_year_invalid_range_too_old() {
        // Year before 1900 should be rejected
        let path = Path::new("/music/Song (1850).mp4");
        assert_eq!(LibraryScanner::parse_year_from_filename(&path), None);
    }

    #[test]
    fn test_parse_year_invalid_range_too_new() {
        // Year after 2099 should be rejected
        let path = Path::new("/music/Song (2150).mp4");
        assert_eq!(LibraryScanner::parse_year_from_filename(&path), None);
    }

    #[test]
    fn test_parse_year_no_year() {
        // Filename without year
        let path = Path::new("/music/Artist - Song Title.mp4");
        assert_eq!(LibraryScanner::parse_year_from_filename(&path), None);
    }

    #[test]
    fn test_parse_year_not_a_year() {
        // 4-digit number that's not a valid year (e.g., track number)
        let path = Path::new("/music/Artist - 0001 Song Title.mp4");
        assert_eq!(LibraryScanner::parse_year_from_filename(&path), None);
    }

    #[test]
    fn test_parse_year_underscore_delimited() {
        // Year with underscores
        let path = Path::new("/music/Artist_Song_2010_Karaoke.mp4");
        assert_eq!(LibraryScanner::parse_year_from_filename(&path), Some(2010));
    }
}
