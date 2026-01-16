# Build and Run Instructions

This file provides Claude Code / Ralph with instructions for building, testing, and running the HomeKaraoke application.

## Quick Reference

| Task | Command |
|------|---------|
| Start development | `just dev` |
| Run unit tests | `just test` |
| Run E2E tests | `just e2e` |
| Quick health check | `just check` |
| Full CI simulation | `just ci` |
| Production build | `just build` |

## Prerequisites

Ensure these are installed before development:
- Node.js 18+ and npm
- Rust (via rustup)
- Tauri CLI (`npm install`)
- yt-dlp (optional, for YouTube streaming)

## Development Workflow

### Starting Development

```bash
# Full Tauri + React development environment
just dev

# Frontend only (no Tauri window)
just dev-web

# With verbose Rust logging
just dev-verbose
```

### Code Quality Checks

**Run before committing:**

```bash
# Quick check (typecheck + lint + cargo check)
just check

# Individual checks
just typecheck      # TypeScript type checking
just lint           # ESLint
just cargo-check    # Rust compilation check
just clippy         # Rust linter
```

### Testing

**Unit Tests:**

```bash
just test           # Run all unit tests once
just test-watch     # Watch mode
just test-coverage  # With coverage report
just test-grep "pattern"  # Run matching tests
```

**E2E Tests:**

```bash
just e2e            # Run all E2E tests
just e2e-ui         # With Playwright UI (debugging)
just e2e-headed     # Visible browser
just e2e-grep "pattern"   # Run matching tests
```

**Note:** E2E tests can be slow. Ask user permission before running `just e2e`.

### Full CI Simulation

```bash
# Runs: lint + typecheck + unit tests + e2e tests
just ci
```

## Building

```bash
# Production build (creates .app and .dmg)
just build

# Debug build (faster, no optimization)
just build-debug

# Platform-specific
just build-arm      # Apple Silicon
just build-intel    # Intel Mac
```

## Git Workflow

**Create branches:**

```bash
just feature 123 add-lyrics-display   # Creates feature/123-add-lyrics-display
just fix 124 queue-race-condition     # Creates fix/124-queue-race-condition
```

**Status and logs:**

```bash
just status         # Current branch + git status
just log            # Recent 15 commits
just diff           # Staged changes
just sync           # Rebase on main
```

## Database & Logs

```bash
just db             # Open SQLite database
just db-schema      # Show database schema
just logs           # Tail application logs
just logs-recent    # Last 100 log lines
```

## Cleanup

```bash
just clean          # Clean all build artifacts
just clean-rust     # Rust target only
just clean-web      # Frontend build only
just clean-test     # Test artifacts
```

## Project Structure

```
karaoke-app/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── stores/             # Zustand state stores
│   └── services/           # Frontend services
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── lib.rs          # Entry point, Tauri setup
│   │   ├── commands/       # IPC command handlers
│   │   ├── db/             # SQLite database
│   │   └── services/       # Backend services
│   └── Cargo.toml
├── tests/e2e/              # Playwright E2E tests
├── plan/                   # Feature specifications
├── CLAUDE.md               # Development conventions
├── PROMPT.md               # Ralph main instructions
├── @fix_plan.md            # Prioritized task list
└── justfile                # Development commands
```

## Common Tasks

### Adding a New Feature

1. Check `@fix_plan.md` for priority
2. Create GitHub issue if none exists
3. Create feature branch: `just feature <issue> <desc>`
4. Implement with TDD approach
5. Run `just check` before committing
6. Update `CHANGELOG.md` for user-facing changes
7. Create PR for review

### Fixing a Bug

1. Create GitHub issue if none exists
2. Create fix branch: `just fix <issue> <desc>`
3. Write failing test first (if applicable)
4. Fix the bug
5. Run `just check` and existing tests
6. Update `CHANGELOG.md`
7. Create PR for review

### Database Migration

1. Add migration to `src-tauri/src/db/schema.rs`
2. Use `IF NOT EXISTS` for tables/indexes
3. For `ALTER TABLE`, prefer nullable columns
4. Test upgrade from previous version
5. Never modify existing migrations

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `RUST_LOG` | Rust logging level (trace, debug, info, warn, error) |
| `TAURI_DEBUG` | Enable Tauri debug mode |

## Troubleshooting

### Tests failing with "connection refused"

E2E tests may be flaky locally due to server startup timing. Retry once before investigating.

### yt-dlp not found

Install with: `brew install yt-dlp` (macOS) or `pip install yt-dlp`

### Build fails on code signing

Code signing only works in GitHub Actions CI. For local builds, signing is skipped.

### Database locked errors

Close the app before running database commands. Only one connection allowed at a time.
