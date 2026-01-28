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

    -- Index for global queries (filter by search_type only)
    CREATE INDEX IF NOT EXISTS idx_search_history_search_type ON search_history(search_type);
    "#,
    // Migration 11: Hosted session ownership tracking (Issue #207)
    r#"
    ALTER TABLE sessions ADD COLUMN hosted_session_id TEXT;
    ALTER TABLE sessions ADD COLUMN hosted_by_user_id TEXT;
    ALTER TABLE sessions ADD COLUMN hosted_session_status TEXT;
    "#,
    // Migration 12: Add CHECK constraint for hosted_session_status (Issue #207 follow-up)
    // SQLite doesn't support ALTER TABLE ADD CONSTRAINT, so we use triggers for validation.
    //
    // Why validation matters:
    // 1. Catch typos/bugs early: Invalid status values fail at INSERT/UPDATE rather than
    //    causing subtle bugs when the app later checks status === 'active'.
    // 2. Data integrity: Prevents corrupted state from API changes, manual DB edits, or
    //    future code paths that might not use the Rust HostedSessionStatus enum.
    // 3. Defense in depth: Complements Rust enum validation - DB is last line of defense.
    r#"
    -- Trigger to validate hosted_session_status on INSERT
    CREATE TRIGGER IF NOT EXISTS check_hosted_session_status_insert
    BEFORE INSERT ON sessions
    WHEN NEW.hosted_session_status IS NOT NULL
        AND NEW.hosted_session_status NOT IN ('active', 'paused', 'ended')
    BEGIN
        SELECT RAISE(ABORT, 'Invalid hosted_session_status. Must be NULL, active, paused, or ended.');
    END;

    -- Trigger to validate hosted_session_status on UPDATE
    CREATE TRIGGER IF NOT EXISTS check_hosted_session_status_update
    BEFORE UPDATE OF hosted_session_status ON sessions
    WHEN NEW.hosted_session_status IS NOT NULL
        AND NEW.hosted_session_status NOT IN ('active', 'paused', 'ended')
    BEGIN
        SELECT RAISE(ABORT, 'Invalid hosted_session_status. Must be NULL, active, paused, or ended.');
    END;
    "#,
    // Migration 13: Add online_id to singers for linking to session guests (Issue #XXX)
    r#"
    ALTER TABLE singers ADD COLUMN online_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_singers_online_id ON singers(online_id);
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_migration_11_adds_hosted_session_columns() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Verify we can query the new columns
        conn.execute(
            "INSERT INTO sessions (name, is_active, hosted_session_id, hosted_by_user_id, hosted_session_status) VALUES ('Test', 1, 'hs-test', 'user-test', 'active')",
            [],
        )
        .unwrap();

        let (hosted_id, user_id, status): (Option<String>, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE name = 'Test'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();

        assert_eq!(hosted_id, Some("hs-test".to_string()));
        assert_eq!(user_id, Some("user-test".to_string()));
        assert_eq!(status, Some("active".to_string()));
    }

    #[test]
    fn test_migration_11_columns_nullable() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Insert session without hosted fields
        conn.execute("INSERT INTO sessions (name, is_active) VALUES ('NoHost', 1)", [])
            .unwrap();

        let (hosted_id, user_id, status): (Option<String>, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT hosted_session_id, hosted_by_user_id, hosted_session_status FROM sessions WHERE name = 'NoHost'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();

        assert_eq!(hosted_id, None);
        assert_eq!(user_id, None);
        assert_eq!(status, None);
    }

    #[test]
    fn test_schema_version_is_13_after_all_migrations() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let version: i32 = conn
            .query_row(
                "SELECT version FROM schema_version ORDER BY version DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(version, 13);
    }

    #[test]
    fn test_migration_12_rejects_invalid_hosted_session_status() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Attempt to insert with invalid status should fail
        let result = conn.execute(
            "INSERT INTO sessions (name, is_active, hosted_session_status) VALUES ('Test', 1, 'invalid')",
            [],
        );

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("Invalid hosted_session_status"));
    }

    #[test]
    fn test_migration_12_accepts_valid_hosted_session_status_active() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let result = conn.execute(
            "INSERT INTO sessions (name, is_active, hosted_session_status) VALUES ('Test', 1, 'active')",
            [],
        );

        assert!(result.is_ok());
    }

    #[test]
    fn test_migration_12_accepts_valid_hosted_session_status_paused() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let result = conn.execute(
            "INSERT INTO sessions (name, is_active, hosted_session_status) VALUES ('Test', 1, 'paused')",
            [],
        );

        assert!(result.is_ok());
    }

    #[test]
    fn test_migration_12_accepts_valid_hosted_session_status_ended() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let result = conn.execute(
            "INSERT INTO sessions (name, is_active, hosted_session_status) VALUES ('Test', 1, 'ended')",
            [],
        );

        assert!(result.is_ok());
    }

    #[test]
    fn test_migration_12_accepts_null_hosted_session_status() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        let result = conn.execute(
            "INSERT INTO sessions (name, is_active, hosted_session_status) VALUES ('Test', 1, NULL)",
            [],
        );

        assert!(result.is_ok());
    }

    #[test]
    fn test_migration_12_rejects_invalid_status_on_update() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // First insert a valid session
        conn.execute(
            "INSERT INTO sessions (name, is_active, hosted_session_status) VALUES ('Test', 1, 'active')",
            [],
        )
        .unwrap();

        // Attempt to update with invalid status should fail
        let result = conn.execute(
            "UPDATE sessions SET hosted_session_status = 'invalid_status' WHERE name = 'Test'",
            [],
        );

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(err_msg.contains("Invalid hosted_session_status"));
    }

    #[test]
    fn test_migration_12_allows_valid_status_update() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // First insert a valid session
        conn.execute(
            "INSERT INTO sessions (name, is_active, hosted_session_status) VALUES ('Test', 1, 'active')",
            [],
        )
        .unwrap();

        // Update to valid statuses should succeed
        conn.execute(
            "UPDATE sessions SET hosted_session_status = 'paused' WHERE name = 'Test'",
            [],
        )
        .unwrap();

        conn.execute(
            "UPDATE sessions SET hosted_session_status = 'ended' WHERE name = 'Test'",
            [],
        )
        .unwrap();

        conn.execute(
            "UPDATE sessions SET hosted_session_status = NULL WHERE name = 'Test'",
            [],
        )
        .unwrap();

        // Verify final value
        let status: Option<String> = conn
            .query_row(
                "SELECT hosted_session_status FROM sessions WHERE name = 'Test'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(status, None);
    }

    #[test]
    fn test_migration_13_adds_online_id_to_singers() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Insert a singer with online_id
        conn.execute(
            "INSERT INTO singers (name, color, is_persistent, online_id) VALUES ('Guest Singer', '#FF0000', 0, 'guest-123')",
            [],
        )
        .unwrap();

        // Verify we can query the online_id column
        let online_id: Option<String> = conn
            .query_row(
                "SELECT online_id FROM singers WHERE name = 'Guest Singer'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(online_id, Some("guest-123".to_string()));
    }

    #[test]
    fn test_migration_13_online_id_is_nullable() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Insert a singer without online_id
        conn.execute(
            "INSERT INTO singers (name, color, is_persistent) VALUES ('Local Singer', '#00FF00', 1)",
            [],
        )
        .unwrap();

        // Verify online_id is NULL
        let online_id: Option<String> = conn
            .query_row(
                "SELECT online_id FROM singers WHERE name = 'Local Singer'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(online_id, None);
    }

    #[test]
    fn test_migration_13_online_id_index_exists() {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();

        // Verify index exists by querying sqlite_master
        let index_exists: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='index' AND name='idx_singers_online_id')",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert!(index_exists);
    }
}
