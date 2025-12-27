# Phase 5: Local File Queue Support

**Status:** Planned

**Result:** Can add local files to queue without importing to library

## Tasks

- [ ] "Play Now" vs "Add to Queue" actions
- [ ] Add file from disk to queue:
  - "Add file..." button (file picker dialog)
  - Drag & drop file directly to queue
  - Handle files outside library (temporary, without import)

## Tauri Commands

```rust
queue_add_file(file_path) -> QueueItem   // Add file from disk without import
```

## UI Changes

### Queue Panel

- Add "Add file..." button
- Enable drag & drop zone for files
- Show local file indicator on queue items

### File Picker

- Filter for video files: `.mp4`, `.mkv`, `.webm`, `.avi`
- Remember last used directory

## Database Schema

Queue table already supports `local_file_path` and `local_file_title` columns:

```sql
CREATE TABLE queue (
    -- ...
    local_file_path TEXT,         -- file from disk without import (optional)
    local_file_title TEXT,        -- display name for file
    -- ...
);
```

## Technical Considerations

- Local files don't require streaming URL extraction
- File path validation (ensure file exists and is readable)
- Handle file deletion while in queue (show error state)
- Extract video metadata (duration, title) from file
