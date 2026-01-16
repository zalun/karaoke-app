# HomeKaraoke Development Instructions

## Project Overview

HomeKaraoke is a macOS karaoke application built with Tauri 2.0 (Rust) + React 18 + TypeScript + Zustand + SQLite.

**Current Version:** v0.7.5

### Core Features (Implemented)
- YouTube search and streaming (via yt-dlp or YouTube iframe)
- YouTube Data API v3 integration for search
- Local video library with folder scanning
- Song queue with drag-and-drop reordering
- Session and singer management with favorites
- Multi-window mode with detachable video player
- Display configuration memory and auto-restore
- macOS Now Playing integration

## Development Guidelines

### Before Starting Any Task
1. Read `CLAUDE.md` for project conventions and coding standards
2. Check `@fix_plan.md` for current priorities
3. Review relevant specs in `plan/` directory
4. Create a GitHub issue for the task if one doesn't exist

### Git Workflow (REQUIRED)
- **Never commit directly to main**
- Create feature branch: `feature/<issue-number>-<description>` or `fix/<issue-number>-<description>`
- Make focused commits with descriptive messages
- Run `just check` before committing (typecheck + lint + cargo check)

### Code Quality Checks
```bash
just check              # Quick health check
just test               # Run unit tests
just e2e                # Run E2E tests (ask before running)
just ci                 # Full CI simulation
```

### Key Directories
- `src/` - React frontend (components, stores, services)
- `src-tauri/` - Rust backend (Tauri commands, database)
- `plan/` - Feature specifications and roadmap
- `tests/e2e/` - Playwright E2E tests

## Current Development Focus

### Active Phase: Local Library Enhancement (Phase 5)
See `plan/05-local-library.md` for details.

### Upcoming: Downloads (Phase 6)
See `plan/06-downloads.md` for video download functionality.

### Future: Polish (Phase 7)
See `plan/07-polish.md` for fullscreen, keyboard shortcuts, UX polish.

## Task Completion Signals

When all tasks in `@fix_plan.md` are marked complete:
1. Run `just check` to verify no regressions
2. Update `CHANGELOG.md` if features were added/fixed
3. Mark phase as complete in this file

## Out of Scope for Autonomous Development

- Database migrations (require careful review)
- Version bumps (manual process in 3 files)
- GitHub releases (requires human approval)
- E2E tests without user consent (can be slow)
- Changes to security-sensitive code paths

## Reference Documentation

- `CLAUDE.md` - Claude Code instructions and conventions
- `plan/README.md` - Planning document index
- `plan/architecture.md` - Project structure overview
- `tests/e2e/GUIDE.md` - E2E testing patterns
