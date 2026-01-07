use crate::services::{LibraryFolder, LibraryScanner, LibraryStats, LibraryVideo, ScanOptions, ScanResult};
use crate::AppState;
use log::{debug, info, warn};
use rusqlite::params;
use tauri::{AppHandle, Manager, State};

/// Maximum number of search results to return (prevents performance issues)
const MAX_SEARCH_LIMIT: u32 = 1000;

/// Forbidden system paths that should not be added to the library
const FORBIDDEN_PATHS: &[&str] = &[
    "/System",
    "/Library",
    "/private",
    "/bin",
    "/sbin",
    "/usr",
    "/var",
    "/etc",
    "/dev",
    "/tmp",
];

/// Add a folder to the library
#[tauri::command]
pub fn library_add_folder(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<LibraryFolder, String> {
    info!("Adding library folder: {}", path);

    // Validate the path exists and is a directory
    let path_obj = std::path::Path::new(&path);
    if !path_obj.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !path_obj.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    // Canonicalize path to resolve symlinks and prevent path traversal
    let canonical_path = path_obj
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    let canonical_str = canonical_path.to_string_lossy();

    // Prevent adding root directory
    if canonical_str == "/" {
        return Err("Cannot add root directory to library".to_string());
    }

    // Validate against forbidden system paths (case-insensitive for macOS)
    let canonical_lower = canonical_str.to_lowercase();
    for forbidden in FORBIDDEN_PATHS {
        if canonical_lower.starts_with(&forbidden.to_lowercase()) {
            return Err("Cannot add system directories to library".to_string());
        }
    }

    // Use canonical path for storage
    let path = canonical_str.to_string();

    // Extract folder name from path
    let name = canonical_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    match state.db.lock() {
        Ok(db) => {
            let conn = db.connection();

            // Insert the folder
            conn.execute(
                "INSERT INTO library_folders (path, name, created_at) VALUES (?1, ?2, CURRENT_TIMESTAMP)",
                params![path, name],
            )
            .map_err(|e| {
                if e.to_string().contains("UNIQUE constraint failed") {
                    "Folder already exists in library".to_string()
                } else {
                    format!("Failed to add folder: {}", e)
                }
            })?;

            // Get the inserted folder
            let folder = conn
                .query_row(
                    "SELECT id, path, name, last_scan_at, file_count FROM library_folders WHERE path = ?1",
                    params![path],
                    |row| {
                        Ok(LibraryFolder {
                            id: row.get(0)?,
                            path: row.get(1)?,
                            name: row.get(2)?,
                            last_scan_at: row.get(3)?,
                            file_count: row.get::<_, i64>(4)? as u32,
                        })
                    },
                )
                .map_err(|e| format!("Failed to retrieve folder: {}", e))?;

            // Add folder to asset protocol scope for thumbnails
            let asset_scope = app.asset_protocol_scope();
            if let Err(e) = asset_scope.allow_directory(&canonical_path, true) {
                warn!("Failed to add {} to asset scope: {}", folder.path, e);
            } else {
                debug!("Added {} to asset protocol scope", folder.path);
            }
            // Also add .homekaraoke subdirectory for thumbnails
            let homekaraoke_dir = canonical_path.join(".homekaraoke");
            if let Err(e) = asset_scope.allow_directory(&homekaraoke_dir, true) {
                warn!("Failed to add {:?} to asset scope: {}", homekaraoke_dir, e);
            } else {
                debug!("Added {:?} to asset protocol scope", homekaraoke_dir);
            }

            info!("Added library folder: {} (id: {})", folder.path, folder.id);
            Ok(folder)
        }
        Err(e) => Err(format!("Failed to acquire database lock: {}", e)),
    }
}

/// Remove a folder from the library
#[tauri::command]
pub fn library_remove_folder(state: State<'_, AppState>, folder_id: i64) -> Result<(), String> {
    info!("Removing library folder: {}", folder_id);

    match state.db.lock() {
        Ok(db) => {
            let conn = db.connection();

            let rows_affected = conn
                .execute(
                    "DELETE FROM library_folders WHERE id = ?1",
                    params![folder_id],
                )
                .map_err(|e| format!("Failed to remove folder: {}", e))?;

            if rows_affected == 0 {
                return Err(format!("Folder not found: {}", folder_id));
            }

            info!("Removed library folder: {}", folder_id);
            Ok(())
        }
        Err(e) => Err(format!("Failed to acquire database lock: {}", e)),
    }
}

/// Get all library folders
#[tauri::command]
pub fn library_get_folders(state: State<'_, AppState>) -> Result<Vec<LibraryFolder>, String> {
    debug!("Getting library folders");

    match state.db.lock() {
        Ok(db) => {
            let conn = db.connection();

            let mut stmt = conn
                .prepare(
                    "SELECT id, path, name, last_scan_at, file_count FROM library_folders ORDER BY name",
                )
                .map_err(|e| format!("Failed to prepare query: {}", e))?;

            let folders = stmt
                .query_map([], |row| {
                    Ok(LibraryFolder {
                        id: row.get(0)?,
                        path: row.get(1)?,
                        name: row.get(2)?,
                        last_scan_at: row.get(3)?,
                        file_count: row.get::<_, i64>(4)? as u32,
                    })
                })
                .map_err(|e| format!("Failed to query folders: {}", e))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|e| format!("Failed to collect folders: {}", e))?;

            debug!("Found {} library folders", folders.len());
            Ok(folders)
        }
        Err(e) => Err(format!("Failed to acquire database lock: {}", e)),
    }
}

/// Scan a specific folder
#[tauri::command]
pub fn library_scan_folder(
    state: State<'_, AppState>,
    folder_id: i64,
    options: ScanOptions,
) -> Result<ScanResult, String> {
    info!("Scanning library folder: {}", folder_id);

    // Get the folder from database
    let folder = match state.db.lock() {
        Ok(db) => {
            let conn = db.connection();

            conn.query_row(
                "SELECT id, path, name, last_scan_at, file_count FROM library_folders WHERE id = ?1",
                params![folder_id],
                |row| {
                    Ok(LibraryFolder {
                        id: row.get(0)?,
                        path: row.get(1)?,
                        name: row.get(2)?,
                        last_scan_at: row.get(3)?,
                        file_count: row.get::<_, i64>(4)? as u32,
                    })
                },
            )
            .map_err(|e| format!("Failed to find folder: {}", e))?
        }
        Err(e) => return Err(format!("Failed to acquire database lock: {}", e)),
    };

    // Perform the scan
    let result = LibraryScanner::scan_folder(&folder, &options);

    // Update folder stats in database
    if let Ok(db) = state.db.lock() {
        let conn = db.connection();
        let _ = conn.execute(
            "UPDATE library_folders SET last_scan_at = CURRENT_TIMESTAMP, file_count = ?1 WHERE id = ?2",
            params![result.files_found as i64, folder_id],
        );
    }

    Ok(result)
}

/// Scan all folders
#[tauri::command]
pub fn library_scan_all(
    state: State<'_, AppState>,
    options: ScanOptions,
) -> Result<Vec<ScanResult>, String> {
    info!("Scanning all library folders");

    let folders = library_get_folders(state.clone())?;
    let mut results = Vec::new();

    for folder in folders {
        let result = LibraryScanner::scan_folder(&folder, &options);

        // Update folder stats
        if let Ok(db) = state.db.lock() {
            let conn = db.connection();
            let _ = conn.execute(
                "UPDATE library_folders SET last_scan_at = CURRENT_TIMESTAMP, file_count = ?1 WHERE id = ?2",
                params![result.files_found as i64, folder.id],
            );
        }

        results.push(result);
    }

    Ok(results)
}

/// Search the library
#[tauri::command]
pub fn library_search(
    state: State<'_, AppState>,
    query: String,
    limit: u32,
    include_lyrics: bool,
) -> Result<Vec<LibraryVideo>, String> {
    // Cap limit to prevent performance issues
    let capped_limit = limit.min(MAX_SEARCH_LIMIT);
    debug!("Searching library for: {} (limit: {}, include_lyrics: {})", query, capped_limit, include_lyrics);

    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let folders = library_get_folders(state)?;
    let results = LibraryScanner::search(&folders, &query, capped_limit, include_lyrics);

    debug!("Found {} results", results.len());
    Ok(results)
}

/// Check if a file exists
#[tauri::command]
pub fn library_check_file(file_path: String) -> bool {
    LibraryScanner::check_file_exists(&file_path)
}

/// Get library statistics
#[tauri::command]
pub fn library_get_stats(state: State<'_, AppState>) -> Result<LibraryStats, String> {
    debug!("Getting library stats");

    match state.db.lock() {
        Ok(db) => {
            let conn = db.connection();

            // Get total folders
            let total_folders: i64 = conn
                .query_row("SELECT COUNT(*) FROM library_folders", [], |row| row.get(0))
                .map_err(|e| format!("Failed to count folders: {}", e))?;

            // Get total files
            let total_files: i64 = conn
                .query_row(
                    "SELECT COALESCE(SUM(file_count), 0) FROM library_folders",
                    [],
                    |row| row.get(0),
                )
                .map_err(|e| format!("Failed to sum files: {}", e))?;

            // Get last scan time
            let last_scan_at: Option<String> = conn
                .query_row(
                    "SELECT MAX(last_scan_at) FROM library_folders",
                    [],
                    |row| row.get(0),
                )
                .map_err(|e| format!("Failed to get last scan: {}", e))?;

            Ok(LibraryStats {
                total_folders: total_folders as u32,
                total_files: total_files as u32,
                last_scan_at,
            })
        }
        Err(e) => Err(format!("Failed to acquire database lock: {}", e)),
    }
}

/// Filters for browsing library
#[derive(Debug, serde::Deserialize)]
pub struct LibraryFilters {
    pub folder_id: Option<i64>,
    pub has_lyrics: Option<bool>,
    pub has_cdg: Option<bool>,
}

/// Sort options for browsing library
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LibrarySort {
    TitleAsc,
    TitleDesc,
    ArtistAsc,
    ArtistDesc,
}

impl Default for LibrarySort {
    fn default() -> Self {
        LibrarySort::TitleAsc
    }
}

/// Result of browsing library
#[derive(Debug, serde::Serialize)]
pub struct LibraryBrowseResult {
    pub videos: Vec<LibraryVideo>,
    pub total: u32,
}

/// Browse all library files with filtering and sorting
#[tauri::command]
pub fn library_browse(
    state: State<'_, AppState>,
    filters: LibraryFilters,
    sort: LibrarySort,
    limit: u32,
    offset: u32,
) -> Result<LibraryBrowseResult, String> {
    debug!("Browsing library with filters: {:?}, sort: {:?}, limit: {}, offset: {}", filters, sort, limit, offset);

    // Get folders (optionally filtered)
    let all_folders = library_get_folders(state)?;
    let folders: Vec<LibraryFolder> = if let Some(folder_id) = filters.folder_id {
        all_folders.into_iter().filter(|f| f.id == folder_id).collect()
    } else {
        all_folders
    };

    // Get all videos from the scanner
    let all_videos = LibraryScanner::browse(&folders, filters.has_lyrics, filters.has_cdg);

    // Sort videos
    let mut sorted_videos = all_videos;
    match sort {
        LibrarySort::TitleAsc => sorted_videos.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase())),
        LibrarySort::TitleDesc => sorted_videos.sort_by(|a, b| b.title.to_lowercase().cmp(&a.title.to_lowercase())),
        LibrarySort::ArtistAsc => sorted_videos.sort_by(|a, b| {
            a.artist.as_deref().unwrap_or("").to_lowercase().cmp(&b.artist.as_deref().unwrap_or("").to_lowercase())
        }),
        LibrarySort::ArtistDesc => sorted_videos.sort_by(|a, b| {
            b.artist.as_deref().unwrap_or("").to_lowercase().cmp(&a.artist.as_deref().unwrap_or("").to_lowercase())
        }),
    }

    let total = sorted_videos.len() as u32;

    // Apply pagination
    let videos: Vec<LibraryVideo> = sorted_videos
        .into_iter()
        .skip(offset as usize)
        .take(limit as usize)
        .collect();

    debug!("Browse result: {} videos (total: {})", videos.len(), total);
    Ok(LibraryBrowseResult { videos, total })
}
