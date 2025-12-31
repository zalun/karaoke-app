# HomeKaraoke Planning Documents

This directory contains detailed planning documents for the HomeKaraoke application.

## Current Implementation

| Phase | Document | Status |
|-------|----------|--------|
| Overview | [00-overview.md](./00-overview.md) | Reference |
| Phase 1 | [01-foundation.md](./01-foundation.md) | Complete |
| Phase 2 | [02-youtube.md](./02-youtube.md) | Complete |
| Phase 3 | [03-sessions.md](./03-sessions.md) | Complete |
| Phase 4 | [04-display.md](./04-display.md) | Complete |
| Phase 5 | [05-local-files.md](./05-local-files.md) | Planned |
| Phase 6 | [06-downloads.md](./06-downloads.md) | Planned |
| Phase 7 | [07-usb-drives.md](./07-usb-drives.md) | Planned |
| Phase 8 | [08-polish.md](./08-polish.md) | Planned |

## Reference Documents

- [schema.md](./schema.md) - Database schema (SQLite)
- [architecture.md](./architecture.md) - Project structure, components, dependencies
- [ui-reference.md](./ui-reference.md) - UI layouts and component reference

## Implemented Features

| Feature | Document | Version |
|---------|----------|---------|
| Singer Favorites | [future/favorites.md](./future/favorites.md) | v0.5.1-beta |

## Future Features

Planned features for future development:

| Feature | Document | Priority |
|---------|----------|----------|
| Singer Rotation | [future/singer-rotation.md](./future/singer-rotation.md) | High |
| QR Code Requests | [future/qr-requests.md](./future/qr-requests.md) | High |
| Voting System | [future/voting.md](./future/voting.md) | Medium |
| Popular Songs | [future/popular-songs.md](./future/popular-songs.md) | Medium |
| Smart Playlists | [future/smart-playlists.md](./future/smart-playlists.md) | Low |
| Lyrics Display | [future/lyrics.md](./future/lyrics.md) | High |
| Singer Stats | [future/singer-stats.md](./future/singer-stats.md) | Medium |
| Offline Mode | [future/offline-mode.md](./future/offline-mode.md) | Medium |
| AirPlay Integration | [future/airplay.md](./future/airplay.md) | Low |

## Development Principles

1. **Each phase ends with working functionality** - After completing a phase, the application is testable
2. **Git workflow** - Every change requires a GitHub issue, feature branch, and pull request
3. **Keep it simple** - Only implement what's needed for the current phase
