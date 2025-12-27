# Database Schema (SQLite)

## Core Tables

### Table `settings`

Application settings stored as key-value pairs.

```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Table `videos`

Library of downloaded/imported videos.

```sql
CREATE TABLE videos (
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
    play_count INTEGER DEFAULT 0
);
```

### Table `queue`

Current session queue items.

```sql
CREATE TABLE queue (
    id INTEGER PRIMARY KEY,
    video_id INTEGER,             -- from library (optional)
    youtube_id TEXT,              -- YT streaming (optional)
    youtube_title TEXT,
    local_file_path TEXT,         -- file from disk without import (optional)
    local_file_title TEXT,        -- display name for file
    position INTEGER NOT NULL,
    status TEXT DEFAULT 'pending'
);
-- One of: video_id, youtube_id, or local_file_path must be set
```

### Table `external_drives`

Connected USB drives for import.

```sql
CREATE TABLE external_drives (
    id INTEGER PRIMARY KEY,
    volume_name TEXT,
    volume_path TEXT,
    uuid TEXT
);
```

### Table `download_queue`

Video download queue with progress tracking.

```sql
CREATE TABLE download_queue (
    id INTEGER PRIMARY KEY,
    youtube_id TEXT UNIQUE,
    status TEXT DEFAULT 'pending',
    progress_percent INTEGER DEFAULT 0
);
```

## Display Configuration Tables

### Table `display_configs`

Saved display configurations for window layout restoration.

```sql
CREATE TABLE display_configs (
    id INTEGER PRIMARY KEY,
    config_hash TEXT UNIQUE,      -- hash from sorted list of display IDs
    display_names TEXT,           -- JSON: ["Built-in Retina", "EPSON EB-X51"]
    description TEXT,             -- optional user description
    auto_apply BOOLEAN DEFAULT 0, -- automatically restore layout
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Table `window_state`

Window positions per display configuration.

```sql
CREATE TABLE window_state (
    id INTEGER PRIMARY KEY,
    display_config_id INTEGER,    -- link to display configuration
    window_type TEXT NOT NULL,    -- 'main', 'video'
    target_display_id TEXT,       -- which display the window should be on
    x INTEGER,
    y INTEGER,
    width INTEGER,
    height INTEGER,
    is_detached BOOLEAN DEFAULT 0,
    is_fullscreen BOOLEAN DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (display_config_id) REFERENCES display_configs(id)
);
```

## Session & Singer Tables

### Table `sessions`

Karaoke sessions with timestamps.

```sql
CREATE TABLE sessions (
    id INTEGER PRIMARY KEY,
    name TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    is_active INTEGER DEFAULT 1
);
```

### Table `singers`

Participants with auto-assigned colors.

```sql
CREATE TABLE singers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT NOT NULL,          -- Hex color e.g., '#FF5733'
    is_persistent INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Table `groups`

Optional singer collections.

```sql
CREATE TABLE groups (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    is_persistent INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Table `singer_groups`

Many-to-many: singers to groups.

```sql
CREATE TABLE singer_groups (
    singer_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    PRIMARY KEY (singer_id, group_id),
    FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);
```

### Table `session_singers`

Many-to-many: sessions to singers.

```sql
CREATE TABLE session_singers (
    session_id INTEGER NOT NULL,
    singer_id INTEGER NOT NULL,
    PRIMARY KEY (session_id, singer_id),
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE CASCADE
);
```

### Table `queue_singers`

Queue item to singer assignments (supports duets).

```sql
CREATE TABLE queue_singers (
    queue_item_id TEXT NOT NULL,  -- Frontend UUID from queueStore
    singer_id INTEGER NOT NULL,
    position INTEGER DEFAULT 0,   -- For ordering multiple singers
    PRIMARY KEY (queue_item_id, singer_id),
    FOREIGN KEY (singer_id) REFERENCES singers(id) ON DELETE CASCADE
);
```

## Schema Versioning

```sql
CREATE TABLE schema_version (
    version INTEGER PRIMARY KEY
);
```

## Migration History

| Version | Description | Related Issue |
|---------|-------------|---------------|
| 1 | Initial schema: settings, videos, queue, external_drives, download_queue, display_configs, window_state | - |
| 2 | Sessions and Singers: singers, groups, singer_groups, sessions, session_singers, queue_singers | - |
| 3 | Queue/History Persistence: queue_items table, session history_index | [#31](https://github.com/zalun/karaoke-app/issues/31) |
| 4 | Display config improvements: window_state constraints, indexes | [#48](https://github.com/zalun/karaoke-app/issues/48) |

Current version: **4**
