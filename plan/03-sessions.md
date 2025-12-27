# Phase 3: Sessions and Singers

**Status:** Complete

**Result:** Can start karaoke sessions, add singers, assign singers to queue items

## Queue & History Persistence ([#31](https://github.com/zalun/karaoke-app/issues/31))

- [x] Link queue items to active session
- [x] Queue database operations (persist to SQLite on every change)
- [x] Tauri commands for queue persistence (load/save)
- [x] History entries stored with session association
- [x] Session resume: restore queue and history state on app reopen
- [x] Sync queueStore with backend persistence
- [x] Sessions menu in macOS menu bar for managing stored sessions
- [x] Load, rename, and delete stored sessions from dialog
- [x] Empty sessions automatically cleaned up on end

## Singers and Groups

### Completed

- [x] Database migration 2: singers, groups, sessions, queue_singers tables
- [x] Rust commands: session_*, singer_*, group_*, queue_assign_singers
- [x] Frontend sessionStore.ts with singer/group/assignment state
- [x] SingerAvatar component (circle with first letter + auto-assigned color)
- [x] SingerChip component (avatar + name in pill)
- [x] SessionStartPanel ("Start Karaoke Night" button)
- [x] SessionBar (shows active session + singer avatars)
- [x] SingerPicker dropdown (select/create singers for queue item)
- [x] DraggableQueueItem enhancement (show singer chips, click-to-assign)
- [x] NextSongOverlay enhancement (show singer avatars with colors)
- [x] Sync singer data to detached player via PlayerState.nextSong
- [x] Singer avatars displayed in stored sessions list

### Remaining

- [ ] Drag-drop singer assignment (drag avatar onto queue item)
- [ ] Group management UI (optional singer collections)
- [ ] Persistent vs temporary toggle for singers/groups
- [ ] Session end with cleanup prompt

## macOS Media Controls ([#38](https://github.com/zalun/karaoke-app/issues/38))

- [x] Now Playing widget integration (Control Center, Touch Bar, AirPods)
- [x] Display song title and artist
- [x] Media key controls (play/pause, next, previous)
- [x] Album artwork from YouTube thumbnails
- [x] Playback position and progress tracking
- [x] Graceful shutdown of media controls thread ([#40](https://github.com/zalun/karaoke-app/issues/40))

## Tauri Commands

```rust
// Sessions
session_start(name?) -> Session
session_end(session_id) -> ()
session_get_active() -> Option<Session>
session_get_recent() -> Vec<Session>
session_rename(id, name) -> ()
session_load(id) -> Session

// Singers
singer_create(name, color, is_persistent) -> Singer
singer_update(id, name, color, is_persistent) -> Singer
singer_delete(id) -> ()
singer_list(include_temporary) -> Vec<Singer>
singer_add_to_session(singer_id, session_id) -> ()

// Queue Assignment
queue_assign_singers(queue_item_id, singer_ids) -> ()
queue_get_singers(queue_item_id) -> Vec<Singer>
queue_get_all_assignments() -> Vec<QueueSingerAssignment>
cleanup_temporary() -> ()
```

## Singer Colors

16-color palette for auto-assignment (see `src/constants/singerColors.ts`):
- Colors are assigned sequentially to ensure visual distinction
- When all 16 are used, colors are recycled
