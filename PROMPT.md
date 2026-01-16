# HomeKaraoke Development Instructions

> **For Ralph**: This file provides context for [Ralph](https://github.com/frankbria/ralph-claude-code),
> an autonomous AI development loop tool. Ralph reads this file and `@fix_plan.md` to work through
> tasks iteratively without constant human intervention.

## Project Overview

HomeKaraoke is a macOS karaoke application built with Tauri 2.0 (Rust) + React 18 + TypeScript + Zustand + SQLite.

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
- **Never merge without PR approval** - all changes must go through pull requests
- Create ONE issue and feature branch per phase (e.g., "Phase 5c: Local Library Polish")
- Branch naming: `feature/<issue-number>-<description>` or `fix/<issue-number>-<description>`
- Make focused commits as you complete each task within the phase
- Run `just check` before each commit (typecheck + lint + cargo check)
- Push commits regularly to keep the branch updated
- **Create PR when entire phase is complete** (all tasks in that phase done)
- **STOP after creating PR** - wait for human approval before starting next phase

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

## Current Phase

**See `@fix_plan.md` for the current task list and detailed workflow.**

The `@fix_plan.md` file contains:
- All tasks for the current phase
- Step-by-step workflow instructions
- Completion criteria

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
