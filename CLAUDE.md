# CLAUDE.md

Project guidance for Claude Code. Keep concise — every line should earn its place.

## Workflow

@WORKFLOW.md

## Commands

```bash
just check    # Quick validation: typecheck + lint + cargo check
just test     # Unit tests
just ci       # Full CI simulation (lint + typecheck + all tests)
just e2e      # E2E tests (ask user before running - can be slow)
just dev      # Start development (Tauri + Vite)
just build    # Production build (.app + .dmg)
just bump X.Y.Z   # Bump version across all 3 files
```

Run `just --list` for the full recipe list.

## Verification

**Before marking work complete:**
1. `just check` — must pass
2. `just test` — must pass
3. UI changes: verify visually in the app
4. API changes: test the actual flow

**Before pushing:** ask the user whether to run `just e2e`. CI runs it too, but catching issues locally saves time.

## Architecture

**Stack:** Tauri 2.0 (Rust) + React 18 + TypeScript + Zustand + SQLite + Tailwind (dark theme)

| Layer | Location | Notes |
|-------|----------|-------|
| Frontend state | `src/stores/` | Zustand stores (player, queue, app, auth, session) |
| Components | `src/components/` | By feature (layout, player, search, library, queue, session) |
| Services | `src/services/` | API calls, utilities, `logger` |
| Tauri commands | `src-tauri/src/commands/` | `youtube_*`, `library_*`, `queue_*`, `auth_*`, `drives_*`, `window_*`, `display_*` |
| Backend entry | `src-tauri/src/lib.rs` | Initializes SQLite + Tauri plugins; `AppState` holds `Mutex<Database>` |
| Database | `src-tauri/src/db/schema.rs` | Versioned migrations; `db/mod.rs` wraps rusqlite |

## Key Patterns

- **Zustand stores:** `export const useXxxStore = create<XxxState>((set, get) => ({...}))`; barrel exports via `index.ts`.
- **Video sources:** `"youtube" | "local" | "external"`
- **Queue status:** `"pending" | "playing" | "completed" | "skipped"`
- **Logging:** frontend `createLogger("Context")` from `src/services/logger`; backend `log::info!()` etc.

## Database Migrations

- Append to `MIGRATIONS` array in `schema.rs` (never modify existing entries).
- Use `IF NOT EXISTS` for tables/indexes; `ALTER TABLE ADD COLUMN` with nullable columns is safe.
- Only pending migrations run on startup (`schema_version` table tracks version).
- Test the upgrade path from the previous released version.

## Auth & Sessions

- Supabase Auth (Google/Apple/Email OAuth). Tokens in macOS Keychain via `keyring` crate (`src-tauri/src/keychain.rs`).
- OAuth callbacks via `homekaraoke://` deep links. Token refresh auto-runs every 4 min when authenticated.
- Auth: `src/services/auth.ts` + `src/stores/authStore.ts`. Commands `auth_*` in `src-tauri/src/commands/auth.rs`.
- Hosted sessions: `src/services/hostedSession.ts` (REST to homekaraoke.app) + `useSessionStore`; `HostSessionModal` shows join code/QR/stats.
- Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## E2E Tests

See [`tests/e2e/GUIDE.md`](./tests/e2e/GUIDE.md) for full patterns. Key rules:
- Mock Tauri IPC (`__TAURI_INTERNALS__`) **before** `page.goto()` — app reads settings on startup.
- Use `toPass()` for timing, never `waitForTimeout()`.
- Keep selectors in `tests/e2e/pages/` (Page Object Model); use `data-testid`.
- Generous CI timeouts (45s test, 10s expect, 15s video loads).

## Releases

See [`plan/deployment.md`](./plan/deployment.md) for the full guide (signing, notarization, troubleshooting). Quick:
1. `just bump X.Y.Z` (updates `package.json`, `Cargo.toml`, `tauri.conf.json`)
2. Update `CHANGELOG.md` ([Keep a Changelog](https://keepachangelog.com/) + [SemVer](https://semver.org/))
3. Commit, push, tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
4. Build + notarize + upload: `source .env && ./scripts/build-and-release.sh vX.Y.Z` (Apple creds in `.env`)

## Learnings

_Patterns discovered through development — update via PRs._

- **Parallel API calls**: local ops (queue, UI) must not block on server responses; fire-and-forget non-critical notifications.
- **Singer online_id**: guests link to singers via `online_id` = `session_guest_id` from API.
- **State sync timing**: DetachedPlayer uses refs for time/play state to avoid closure issues.
- **Test mocks**: include all required fields (`online_id`, `session_guest_id`).
- **Window manager**: cross-window state sync uses Tauri events; song info includes singer data.

See [`plan/`](./plan/) for the implementation roadmap and future feature plans.
