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
    // Migration 3: Queue/History Persistence (Issue #31)
    r#"
    -- Drop unused legacy queue table
    DROP TABLE IF EXISTS queue;

    -- New session-scoped queue_items table
    CREATE TABLE IF NOT EXISTS queue_items (
        id TEXT PRIMARY KEY,                    -- UUID from frontend (preserves queue_singers FK)
        session_id INTEGER NOT NULL,
        item_type TEXT NOT NULL CHECK(item_type IN ('queue', 'history')),

        -- Video data (denormalized)
        video_id TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT,
        duration INTEGER,
        thumbnail_url TEXT,
        source TEXT NOT NULL CHECK(source IN ('youtube', 'local', 'external')),
        youtube_id TEXT,
        file_path TEXT,

        -- Ordering & timestamps
        position INTEGER NOT NULL,
        added_at TEXT NOT NULL,
        played_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,

        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    -- Indexes for efficient queries
    CREATE INDEX IF NOT EXISTS idx_queue_items_session_type ON queue_items(session_id, item_type);
    CREATE INDEX IF NOT EXISTS idx_queue_items_position ON queue_items(session_id, item_type, position);

    -- Add history_index to sessions for state restoration
    ALTER TABLE sessions ADD COLUMN history_index INTEGER DEFAULT -1;
    "#,
    // Migration 4: Display config improvements (Issue #48)
    r#"
    -- Recreate window_state with UNIQUE constraint and ON DELETE CASCADE
    -- SQLite doesn't support ALTER TABLE ADD CONSTRAINT, so we need to recreate
    CREATE TABLE IF NOT EXISTS window_state_new (
        id INTEGER PRIMARY KEY,
        display_config_id INTEGER NOT NULL,
        window_type TEXT NOT NULL,
        target_display_id TEXT,
        x INTEGER,
        y INTEGER,
        width INTEGER,
        height INTEGER,
        is_detached INTEGER DEFAULT 0,
        is_fullscreen INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (display_config_id) REFERENCES display_configs(id) ON DELETE CASCADE,
        UNIQUE(display_config_id, window_type)
    );

    -- Copy existing data
    INSERT OR IGNORE INTO window_state_new
        (id, display_config_id, window_type, target_display_id, x, y, width, height, is_detached, is_fullscreen, updated_at)
    SELECT id, display_config_id, window_type, target_display_id, x, y, width, height, is_detached, is_fullscreen, updated_at
    FROM window_state;

    -- Drop old table and rename new one
    DROP TABLE IF EXISTS window_state;
    ALTER TABLE window_state_new RENAME TO window_state;

    -- Add index on display_configs for faster hash lookups
    CREATE INDEX IF NOT EXISTS idx_display_configs_hash ON display_configs(config_hash);

    -- Add index on window_state for faster lookups
    CREATE INDEX IF NOT EXISTS idx_window_state_config ON window_state(display_config_id);
    "#,
    // Migration 5: Singer Favorites (Issue #88)
    r#"
    -- Add unique_name column to singers for disambiguation
    ALTER TABLE singers ADD COLUMN unique_name TEXT;

    -- Singer favorites table with denormalized video data
    CREATE TABLE IF NOT EXISTS singer_favorites (
        id INTEGER PRIMARY KEY,
        singer_id INTEGER NOT NULL,
        video_id TEXT NOT NULL,
        title TEXT NOT NULL,
        artist TEXT,
        duration INTEGER,
        thumbnail_url TEXT,
        source TEXT NOT NULL CHECK(source IN ('youtube', 'local', 'external')),
        youtube_id TEXT,
        file_path TEXT,
        added_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE CASCADE,
        UNIQUE(singer_id, video_id)
    );

    -- Index for efficient singer favorites lookup
    CREATE INDEX IF NOT EXISTS idx_singer_favorites_singer ON singer_favorites(singer_id);
    "#,
    // Migration 6: Add index on video_id for efficient reverse lookups
    r#"
    CREATE INDEX IF NOT EXISTS idx_singer_favorites_video ON singer_favorites(video_id);
    "#,
    // Migration 7: Active singer for sessions (Issue #109)
    // Note: SQLite doesn't enforce FK constraints on ALTER TABLE, but we handle
    // cleanup in delete_singer command. ON DELETE SET NULL is for documentation.
    r#"
    ALTER TABLE sessions ADD COLUMN active_singer_id INTEGER REFERENCES singers(id) ON DELETE SET NULL;
    "#,
    // Migration 8: Library folders for local file support (Issue #131)
    r#"
    CREATE TABLE IF NOT EXISTS library_folders (
        id INTEGER PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        name TEXT,
        last_scan_at TEXT,
        file_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    "#,
    // Migration 9: Add index on library_folders.last_scan_at for efficient stale folder queries
    r#"
    CREATE INDEX IF NOT EXISTS idx_library_folders_last_scan ON library_folders(last_scan_at);
    "#,
    // Migration 10: Search history for type-ahead completion (Issue #181)
    r#"
    CREATE TABLE IF NOT EXISTS search_history (
        id INTEGER PRIMARY KEY,
        session_id INTEGER NOT NULL,
        search_type TEXT NOT NULL CHECK(search_type IN ('youtube', 'local')),
        query TEXT NOT NULL,
        searched_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        UNIQUE(session_id, search_type, query)
    );

    -- Index for efficient querying by session and type
    CREATE INDEX IF NOT EXISTS idx_search_history_session_type ON search_history(session_id, search_type);

    -- Index for timestamp-based ordering
    CREATE INDEX IF NOT EXISTS idx_search_history_searched_at ON search_history(searched_at DESC);
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
