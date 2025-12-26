use rusqlite::{Connection, Result};

const MIGRATIONS: &[&str] = &[
    // Migration 1: Initial schema
    r#"
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

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
    // Migration 2: Sessions and Singers
    r#"
    -- Singers table
    CREATE TABLE IF NOT EXISTS singers (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        is_persistent INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Groups table (optional collections of singers)
    CREATE TABLE IF NOT EXISTS groups (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        is_persistent INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Singer-Group many-to-many relationship
    CREATE TABLE IF NOT EXISTS singer_groups (
        singer_id INTEGER NOT NULL,
        group_id INTEGER NOT NULL,
        PRIMARY KEY (singer_id, group_id),
        FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE CASCADE,
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
    );

    -- Sessions table (karaoke nights)
    CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY,
        name TEXT,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ended_at TIMESTAMP,
        is_active INTEGER DEFAULT 1
    );

    -- Session-Singer relationship (singers participating in a session)
    CREATE TABLE IF NOT EXISTS session_singers (
        session_id INTEGER NOT NULL,
        singer_id INTEGER NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (session_id, singer_id),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE CASCADE
    );

    -- Queue-Singer relationship (singer assignments to queue items)
    CREATE TABLE IF NOT EXISTS queue_singers (
        id INTEGER PRIMARY KEY,
        queue_item_id TEXT NOT NULL,
        singer_id INTEGER NOT NULL,
        position INTEGER DEFAULT 0,
        FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE CASCADE
    );

    -- Index for faster lookups
    CREATE INDEX IF NOT EXISTS idx_queue_singers_queue_item ON queue_singers(queue_item_id);
    CREATE INDEX IF NOT EXISTS idx_session_singers_session ON session_singers(session_id);
    "#,
];

pub fn run_migrations(conn: &Connection) -> Result<()> {
    // Ensure schema_version table exists for fresh databases
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)",
        [],
    )?;

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
            // Update schema version after each successful migration
            conn.execute(
                "INSERT OR REPLACE INTO schema_version (version) VALUES (?1)",
                [migration_version],
            )?;
        }
    }

    Ok(())
}
