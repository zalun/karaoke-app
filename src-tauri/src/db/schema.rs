use rusqlite::{Connection, Result};

const MIGRATIONS: &[&str] = &[
    // Migration 1: Initial schema
    r#"
    CREATE TABLE IF NOT EXISTS videos (
        id INTEGER PRIMARY KEY,
        youtube_id TEXT UNIQUE,
        title TEXT NOT NULL,
        artist TEXT,
        duration_seconds INTEGER,
        source_type TEXT CHECK(source_type IN ('youtube', 'local', 'external')),
        file_path TEXT,
        thumbnail_url TEXT,
        external_drive_id INTEGER,
        last_played TIMESTAMP,
        play_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS queue (
        id INTEGER PRIMARY KEY,
        video_id INTEGER,
        youtube_id TEXT,
        youtube_title TEXT,
        local_file_path TEXT,
        local_file_title TEXT,
        position INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (video_id) REFERENCES videos(id)
    );

    CREATE TABLE IF NOT EXISTS external_drives (
        id INTEGER PRIMARY KEY,
        volume_name TEXT,
        volume_path TEXT,
        uuid TEXT,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS download_queue (
        id INTEGER PRIMARY KEY,
        youtube_id TEXT UNIQUE,
        youtube_title TEXT,
        status TEXT DEFAULT 'pending',
        progress_percent INTEGER DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS display_configs (
        id INTEGER PRIMARY KEY,
        config_hash TEXT UNIQUE,
        display_names TEXT,
        description TEXT,
        auto_apply INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS window_state (
        id INTEGER PRIMARY KEY,
        display_config_id INTEGER,
        window_type TEXT NOT NULL,
        target_display_id TEXT,
        x INTEGER,
        y INTEGER,
        width INTEGER,
        height INTEGER,
        is_detached INTEGER DEFAULT 0,
        is_fullscreen INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (display_config_id) REFERENCES display_configs(id)
    );

    CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
    );

    INSERT OR IGNORE INTO schema_version (version) VALUES (1);
    "#,
];

pub fn run_migrations(conn: &Connection) -> Result<()> {
    // Get current version
    let current_version: i32 = conn
        .query_row(
            "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    // Run pending migrations
    for (i, migration) in MIGRATIONS.iter().enumerate() {
        let migration_version = (i + 1) as i32;
        if migration_version > current_version {
            conn.execute_batch(migration)?;
        }
    }

    Ok(())
}
