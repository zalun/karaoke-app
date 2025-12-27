# Overview: Karaoke Application for macOS

## Summary

Home karaoke application built with Tauri 2.0 + React. Features YouTube search and streaming, local library management, song queue system, session/singer tracking, and automatic USB drive import.

### Key Features

- **YouTube Integration** - Search and stream karaoke videos directly
- **Queue Management** - Drag-and-drop queue with auto-advance
- **Sessions & Singers** - Track karaoke sessions with singer assignments
- **Multi-window Mode** - Detachable video window for secondary displays
- **Display Memory** - Remember window layouts per display configuration
- **macOS Integration** - Now Playing, media keys, keep-awake

### Multi-window Mode

- Video window can be detached and moved to a secondary display (karaoke mode)
- Application remembers display configurations (e.g., "laptop only" vs "laptop + projector A")
- **Hotplug detection:** listens for display connect/disconnect events at runtime
- When a known configuration is detected:
  - If `auto_apply=true` -> automatically restore saved window layout
  - If `auto_apply=false` -> show dialog "Detected [Projector A]. Restore karaoke mode?"
    - [ ] Remember my choice (sets `auto_apply=true`)
- Menu: "Manage display configurations..." (edit/delete, toggle auto_apply)
- Menu: "Reset to single window"

## Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS (dark theme) |
| State | Zustand |
| Backend | Rust (Tauri 2.0) |
| Database | SQLite (rusqlite) |
| Video | yt-dlp (subprocess) |
| Media Controls | souvlaki |
| Display Detection | core-graphics (macOS) |

## Current Version

**v0.3.5** - See [CHANGELOG.md](../CHANGELOG.md) for release history.
