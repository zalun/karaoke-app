# Phase 7: USB Drive Support

**Status:** Planned

**Result:** Connecting USB drive shows import dialog, can import videos

## Tasks

- [ ] Volume watcher on `/Volumes/`
- [ ] Mount/unmount events
- [ ] Video file scanning
- [ ] Import modal with checkboxes
- [ ] Selective or full import

## Tauri Commands

```rust
drives_get_mounted() -> Vec<MountedDrive>
drives_scan(volume_path) -> ScanResult
drives_import_selected(volume_path, files, copy) -> ImportResult
```

## Database Schema

```sql
CREATE TABLE external_drives (
    id INTEGER PRIMARY KEY,
    volume_name TEXT,
    volume_path TEXT,
    uuid TEXT
);
```

## Key Components

### Backend

**Volume Watcher** (`src-tauri/src/services/volume_watcher.rs`):
- Watches `/Volumes/` via `notify` crate
- Events: `volume:mounted`, `volume:unmounted`, `volume:scan-complete`
- Scans for files: `.mp4`, `.mkv`, `.webm`, `.avi`
- Fallback: poll `/Volumes/` every 5 seconds if notify fails

### Frontend

- Import modal with file list and checkboxes
- Progress indicator during scan/import
- "Import all" vs "Select files" options
- Remember drive by UUID for future connections

## Technical Considerations

- Handle slow USB drives (large file scanning)
- Show scan progress for large drives
- Copy vs reference option (copy files to library vs play from USB)
- Handle drive disconnect during playback
- Video format compatibility check (warn for unsupported formats)
