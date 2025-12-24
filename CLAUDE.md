# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Git Workflow

- Always create a feature branch for changes (never commit directly to main)
- Create a pull request for code review before merging
- Branch naming: `feature/<description>` or `fix/<description>`

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

## Implementation Roadmap

See `PLAN.md` for detailed phases. Currently at Phase 1 (Foundation). Next: Phase 2 (YouTube Integration) requires implementing yt-dlp service in Rust.
