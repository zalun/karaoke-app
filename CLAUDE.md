# CLAUDE.md

Project guidance for Claude Code. Keep concise - every line should earn its place.

## Workflow

- **Plan mode first**: Use Plan mode (Shift+Tab twice) for complex tasks. Iterate until plan is solid, then auto-accept.
- **Git discipline**: Issue first → feature branch → PR. Never commit to main directly.
- **Branch naming**: `feature/<issue>-<desc>` or `fix/<issue>-<desc>`
- **No amending**: Prefer separate commits over `git commit --amend`

## Commands

```bash
just check    # Quick validation: typecheck + lint + cargo check
just test     # Unit tests
just e2e      # E2E tests (ask user before running - can be slow)
just dev      # Start development
just build    # Production build
```

## Verification

**Before marking work complete:**
1. Run `just check` - must pass
2. Run `just test` - must pass
3. For UI changes, verify visually in the app
4. For API changes, test the actual flow

**Before pushing:**
- Ask user if E2E tests should run (`just e2e`)
- CI runs E2E too, but catching issues locally saves time

## Architecture

**Stack:** Tauri 2.0 (Rust) + React 18 + TypeScript + Zustand + SQLite

| Layer | Location | Notes |
|-------|----------|-------|
| Frontend state | `src/stores/` | Zustand stores |
| Components | `src/components/` | By feature |
| Tauri commands | `src-tauri/src/commands/` | `youtube_*`, `library_*`, `queue_*`, etc. |
| Database | `src-tauri/src/db/schema.rs` | Versioned migrations |
| Services | `src/services/` | API calls, utilities |

## Key Patterns

**Zustand stores:** `export const useXxxStore = create<XxxState>((set, get) => ({...}))`

**Video sources:** `"youtube" | "local" | "external"`

**Queue status:** `"pending" | "playing" | "completed" | "skipped"`

**Logging:** Frontend uses `createLogger("Context")`, backend uses `log::info!()` etc.

## Database Migrations

- Append to `MIGRATIONS` array in `schema.rs` (never modify existing)
- Use `IF NOT EXISTS` for tables/indexes
- `ALTER TABLE ADD COLUMN` with nullable columns is safe
- Test upgrade from previous released version

## Auth & Sessions

- Tokens in macOS Keychain via `keyring` crate
- OAuth via `homekaraoke://` deep links
- Hosted sessions: `src/services/hostedSession.ts` for API, `useSessionStore` for state
- See `src/stores/authStore.ts` for token refresh logic

## E2E Tests

See `tests/e2e/GUIDE.md` for full patterns. Key rules:
- Mock Tauri IPC before `page.goto()`
- Use `toPass()` for timing, never `waitForTimeout()`
- Use `data-testid` for selectors
- Generous timeouts for CI (45s test, 10s expect)

## Releases

See `plan/deployment.md` for full guide. Quick:
1. Update version in `package.json`, `Cargo.toml`, `tauri.conf.json`
2. Update `CHANGELOG.md`
3. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`
4. Build: `source .env && ./scripts/build-and-release.sh vX.Y.Z`

## Learnings

_Patterns discovered through development - update via PRs._

- **Parallel API calls**: Local operations (queue, UI) should not block on server responses. Fire-and-forget for non-critical notifications.
- **Singer online_id**: Guests are linked to singers via `online_id` = `session_guest_id` from API.
- **State sync timing**: DetachedPlayer uses refs for time/play state to avoid closure issues.
- **Test mocks**: Mock objects must include all required fields including `online_id`, `session_guest_id`.
- **Window manager**: Cross-window state sync uses Tauri events; song info includes singer data.
