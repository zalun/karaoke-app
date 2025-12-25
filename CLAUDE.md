# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow

- Every change requires a GitHub issue first
- Create a feature branch from the issue (never commit directly to main)
- Create a pull request for code review before merging
- Branch naming: `feature/<issue-number>-<description>` or `fix/<issue-number>-<description>`

## Build and Development Commands

```bash
npm run tauri dev          # Start development (Vite + Tauri window)
npm run tauri build        # Production build (creates .app and .dmg)
npm run dev                # Vite dev server only (no Tauri window)
npm run build              # Frontend build only (tsc + vite)
npm run lint               # ESLint
```

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
- Log location: `~/Library/Logs/app.karaoke.home/karaoke.log` (macOS)
- Frontend: Use `createLogger("Context")` from `src/services/logger`
- Backend: Use `log::debug!()`, `log::info!()`, etc.

## Changelog & Versioning

- Follow [Keep a Changelog](https://keepachangelog.com/) format in `CHANGELOG.md`
- Use [Semantic Versioning](https://semver.org/) (MAJOR.MINOR.PATCH)
- Update version in three places: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
- Add changelog entry with each PR that adds features or fixes bugs

## Releases

Releases are automated via GitHub Actions (`.github/workflows/release.yml`):

1. Update version and CHANGELOG.md
2. Merge PR to main
3. Create and push a version tag:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```
4. GitHub Actions builds for Apple Silicon (arm64) and Intel (x86_64)
5. Release appears at https://github.com/zalun/karaoke-app/releases with .dmg files

## Implementation Roadmap

See `PLAN.md` for detailed phases. Currently completed through Phase 2 (YouTube Integration) with yt-dlp service, search, streaming, queue/history, and detachable player.
