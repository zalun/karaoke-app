# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow

- Every change requires a GitHub issue first
- Create a feature branch from the issue (never commit directly to main)
- Create a pull request for code review before merging
- Branch naming: `feature/<issue-number>-<description>` or `fix/<issue-number>-<description>`
- **Avoid `git commit --amend`** - prefer separate commits for fixes/updates (easier to review)

## Build and Development Commands

This project uses a `justfile` for common tasks. Run `just` or `just --list` to see all available commands.

```bash
# Preferred (using just)
just dev                   # Start development (Vite + Tauri window)
just build                 # Production build (creates .app and .dmg)
just test                  # Run unit tests
just e2e                   # Run E2E tests
just lint                  # ESLint
just check                 # Quick health check (typecheck + lint + cargo check)
just ci                    # Full CI simulation (lint + typecheck + all tests)

# Direct npm/cargo commands also work
npm run tauri dev          # Start development (Vite + Tauri window)
npm run tauri build        # Production build (creates .app and .dmg)
npm run dev                # Vite dev server only (no Tauri window)
npm run build              # Frontend build only (tsc + vite)
npm run lint               # ESLint
```

## E2E Testing

**See [`tests/e2e/GUIDE.md`](./tests/e2e/GUIDE.md) for comprehensive E2E testing patterns and lessons learned.**

Key principles:
- **Mock Tauri IPC**: Tests run in browser with mocked `__TAURI_INTERNALS__`
- **Use `toPass()` for timing**: Never use fixed `waitForTimeout()` - always retry-based assertions
- **Page Object Model**: Keep selectors in `tests/e2e/pages/`, not in test files
- **CI is slower**: Use generous timeouts (45s test, 10s expect, 15s for video loads)

Quick reference:
```bash
just e2e              # Run all E2E tests
just e2e-ui           # Run with Playwright UI (debugging)
just e2e-grep "name"  # Run tests matching pattern
```

When writing E2E tests:
1. Inject mocks BEFORE `page.goto()` - app reads settings on startup
2. Use `data-testid` attributes for stable selectors
3. Wait for specific state changes, not arbitrary timeouts
4. Document skipped tests with clear reasoning

## Architecture

**Stack:** Tauri 2.0 (Rust) + React 18 + TypeScript + Zustand + SQLite

### Frontend (`src/`)
- **State:** Zustand stores in `src/stores/` (playerStore, queueStore, appStore)
- **Components:** `src/components/` organized by feature (layout, player, search, library, queue)
- **Styling:** Tailwind CSS with dark theme (gray-900 background)

### Backend (`src-tauri/`)
- **Entry:** `src/lib.rs` initializes SQLite database and Tauri plugins
- **Database:** `src/db/schema.rs` contains migrations, `src/db/mod.rs` wraps rusqlite
- **State:** `AppState` with `Mutex<Database>` managed by Tauri

### IPC Pattern
Tauri commands (to be implemented) follow naming: `youtube_*`, `library_*`, `queue_*`, `drives_*`, `window_*`, `display_*`

## Database Migrations

The app uses a versioned migration system in `src-tauri/src/db/schema.rs`:

- Migrations are stored in `MIGRATIONS` array, indexed by version (1-based)
- Schema version tracked in `schema_version` table
- On startup, only pending migrations run (current_version < migration_version)
- Each migration runs in sequence and updates the version number

**Safe upgrade path from v0.5.0 onwards:**
- `ALTER TABLE ADD COLUMN` is safe - existing rows get NULL
- `CREATE TABLE IF NOT EXISTS` doesn't affect existing data
- `CREATE INDEX IF NOT EXISTS` is idempotent

When adding new migrations:
1. Append to `MIGRATIONS` array (never modify existing migrations)
2. Use `IF NOT EXISTS` for tables/indexes
3. For `ALTER TABLE ADD COLUMN`, nullable columns are safest
4. Test upgrade path from previous released version

## Key Conventions

**Zustand stores:**
```typescript
export const useXxxStore = create<XxxState>((set, get) => ({
  // state fields
  items: [],
  // actions
  doSomething: () => set((state) => ({ ... })),
}));
```

**Component exports:** Use barrel exports via `index.ts` files

**Video sources:** `"youtube" | "local" | "external"`

**Queue item status:** `"pending" | "playing" | "completed" | "skipped"`

## Logging

- Uses `tauri-plugin-log` with file + stdout + webview targets
- Debug mode toggle in View menu (persisted to SQLite)
- Log location: `~/Library/Logs/app.homekaraoke/homekaraoke.log` (macOS)
- Frontend: Use `createLogger("Context")` from `src/services/logger`
- Backend: Use `log::debug!()`, `log::info!()`, etc.

## Changelog & Versioning

- Follow [Keep a Changelog](https://keepachangelog.com/) format in `CHANGELOG.md`
- Use [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH)
- Update version in three places: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- Add changelog entry with each PR that adds features or fixes bugs

## Releases

**See [`plan/deployment.md`](./plan/deployment.md) for complete deployment guide** including code signing, notarization commands, and troubleshooting.

Quick overview:
1. Update version in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
2. Update `CHANGELOG.md`
3. Commit, push, then tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
4. GitHub Actions builds and signs DMGs for Apple Silicon and Intel
5. Notarization may require manual follow-up (see deployment guide)

## Implementation Roadmap

See [`plan/`](./plan/) for detailed documentation:
- **Phases 1-4** (Complete): Foundation, YouTube, Sessions/Singers, Multi-display
- **Phases 5-8** (Planned): Local files, Downloads, USB drives, Polish
- **Future features**: See [`plan/future/`](./plan/future/) for detailed plans
