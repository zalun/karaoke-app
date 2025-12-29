use super::errors::{CommandError, LockResultExt};
use crate::AppState;
use log::{debug, info};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Video data for favorites (denormalized for offline support)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FavoriteVideo {
    pub video_id: String,
    pub title: String,
    pub artist: Option<String>,
    pub duration: Option<i64>,
    pub thumbnail_url: Option<String>,
    pub source: String,
    pub youtube_id: Option<String>,
    pub file_path: Option<String>,
}

/// A singer's favorite song
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SingerFavorite {
    pub id: i64,
    pub singer_id: i64,
    pub video: FavoriteVideo,
    pub added_at: String,
}

// ============ Favorites Commands ============

#[tauri::command]
pub fn add_favorite(
    state: State<'_, AppState>,
    singer_id: i64,
    video: FavoriteVideo,
) -> Result<SingerFavorite, CommandError> {
    info!(
        "Adding favorite for singer {}: {}",
        singer_id, video.title
    );
    let db = state.db.lock().map_lock_err()?;

    // Verify singer exists and is persistent
    let is_persistent: bool = db
        .connection()
        .query_row(
            "SELECT is_persistent FROM singers WHERE id = ?1",
            [singer_id],
            |row| row.get::<_, i32>(0).map(|v| v != 0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => CommandError::NotFound {
                resource: "Singer",
                id: singer_id.to_string(),
            },
            _ => CommandError::Database(e),
        })?;

    if !is_persistent {
        return Err(CommandError::Validation(
            "Only persistent singers can have favorites".to_string(),
        ));
    }

    // Insert favorite (UNIQUE constraint will prevent duplicates)
    db.connection().execute(
        "INSERT OR IGNORE INTO singer_favorites
         (singer_id, video_id, title, artist, duration, thumbnail_url, source, youtube_id, file_path)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        rusqlite::params![
            singer_id,
            video.video_id,
            video.title,
            video.artist,
            video.duration,
            video.thumbnail_url,
            video.source,
            video.youtube_id,
            video.file_path,
        ],
    )?;

    // Get the inserted/existing favorite
    let favorite = db.connection().query_row(
        "SELECT id, singer_id, video_id, title, artist, duration, thumbnail_url, source, youtube_id, file_path, added_at
         FROM singer_favorites WHERE singer_id = ?1 AND video_id = ?2",
        rusqlite::params![singer_id, video.video_id],
        |row| {
            Ok(SingerFavorite {
                id: row.get(0)?,
                singer_id: row.get(1)?,
                video: FavoriteVideo {
                    video_id: row.get(2)?,
                    title: row.get(3)?,
                    artist: row.get(4)?,
                    duration: row.get(5)?,
                    thumbnail_url: row.get(6)?,
                    source: row.get(7)?,
                    youtube_id: row.get(8)?,
                    file_path: row.get(9)?,
                },
                added_at: row.get(10)?,
            })
        },
    )?;

    Ok(favorite)
}

#[tauri::command]
pub fn remove_favorite(
    state: State<'_, AppState>,
    singer_id: i64,
    video_id: String,
) -> Result<(), CommandError> {
    info!(
        "Removing favorite for singer {}: {}",
        singer_id, video_id
    );
    let db = state.db.lock().map_lock_err()?;

    let rows_affected = db.connection().execute(
        "DELETE FROM singer_favorites WHERE singer_id = ?1 AND video_id = ?2",
        rusqlite::params![singer_id, video_id],
    )?;

    if rows_affected == 0 {
        return Err(CommandError::NotFound {
            resource: "Favorite",
            id: format!("singer_id={}, video_id={}", singer_id, video_id),
        });
    }

    Ok(())
}

#[tauri::command]
pub fn get_singer_favorites(
    state: State<'_, AppState>,
    singer_id: i64,
) -> Result<Vec<SingerFavorite>, CommandError> {
    debug!("Getting favorites for singer {}", singer_id);
    let db = state.db.lock().map_lock_err()?;

    let mut stmt = db.connection().prepare(
        "SELECT id, singer_id, video_id, title, artist, duration, thumbnail_url, source, youtube_id, file_path, added_at
         FROM singer_favorites WHERE singer_id = ?1 ORDER BY added_at DESC",
    )?;

    let favorites = stmt
        .query_map([singer_id], |row| {
            Ok(SingerFavorite {
                id: row.get(0)?,
                singer_id: row.get(1)?,
                video: FavoriteVideo {
                    video_id: row.get(2)?,
                    title: row.get(3)?,
                    artist: row.get(4)?,
                    duration: row.get(5)?,
                    thumbnail_url: row.get(6)?,
                    source: row.get(7)?,
                    youtube_id: row.get(8)?,
                    file_path: row.get(9)?,
                },
                added_at: row.get(10)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(favorites)
}

/// Check which singers have a video favorited (efficient single query)
#[tauri::command]
pub fn check_video_favorites(
    state: State<'_, AppState>,
    video_id: String,
) -> Result<Vec<i64>, CommandError> {
    debug!("Checking favorites for video {}", video_id);
    let db = state.db.lock().map_lock_err()?;

    let mut stmt = db.connection().prepare(
        "SELECT singer_id FROM singer_favorites WHERE video_id = ?1",
    )?;

    let singer_ids = stmt
        .query_map([&video_id], |row| row.get::<_, i64>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(singer_ids)
}

#[tauri::command]
pub fn bulk_add_favorites(
    state: State<'_, AppState>,
    singer_id: i64,
    videos: Vec<FavoriteVideo>,
) -> Result<Vec<SingerFavorite>, CommandError> {
    info!(
        "Bulk adding {} favorites for singer {}",
        videos.len(),
        singer_id
    );
    let db = state.db.lock().map_lock_err()?;

    // Verify singer exists and is persistent
    let is_persistent: bool = db
        .connection()
        .query_row(
            "SELECT is_persistent FROM singers WHERE id = ?1",
            [singer_id],
            |row| row.get::<_, i32>(0).map(|v| v != 0),
        )
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => CommandError::NotFound {
                resource: "Singer",
                id: singer_id.to_string(),
            },
            _ => CommandError::Database(e),
        })?;

    if !is_persistent {
        return Err(CommandError::Validation(
            "Only persistent singers can have favorites".to_string(),
        ));
    }

    // Insert all favorites (protected by Mutex lock)
    for video in &videos {
        db.connection().execute(
            "INSERT OR IGNORE INTO singer_favorites
             (singer_id, video_id, title, artist, duration, thumbnail_url, source, youtube_id, file_path)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                singer_id,
                video.video_id,
                video.title,
                video.artist,
                video.duration,
                video.thumbnail_url,
                video.source,
                video.youtube_id,
                video.file_path,
            ],
        )?;
    }

    // Return all favorites for this singer
    let mut stmt = db.connection().prepare(
        "SELECT id, singer_id, video_id, title, artist, duration, thumbnail_url, source, youtube_id, file_path, added_at
         FROM singer_favorites WHERE singer_id = ?1 ORDER BY added_at DESC",
    )?;

    let favorites = stmt
        .query_map([singer_id], |row| {
            Ok(SingerFavorite {
                id: row.get(0)?,
                singer_id: row.get(1)?,
                video: FavoriteVideo {
                    video_id: row.get(2)?,
                    title: row.get(3)?,
                    artist: row.get(4)?,
                    duration: row.get(5)?,
                    thumbnail_url: row.get(6)?,
                    source: row.get(7)?,
                    youtube_id: row.get(8)?,
                    file_path: row.get(9)?,
                },
                added_at: row.get(10)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(favorites)
}
