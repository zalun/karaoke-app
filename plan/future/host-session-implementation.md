# Host Session Feature - Implementation Plan

## Overview

Implement the "Host Session" feature that allows hosts to create cloud-hosted karaoke sessions via the `homekaraoke.app` API. Guests can join by scanning a QR code or entering a session code to request songs.

This is part of the larger [Cloud Playlists & Session Linking](./cloud-playlists.md) feature set (Phase 2: Host Sessions & Guest Join).

## API Endpoint

```
POST /api/session/create
Authorization: Bearer <token>

Request:
{
  "session_name"?: string,           // max 100 chars
  "requires_approval"?: boolean,     // default: true
  "max_song_duration_seconds"?: number,  // 60-1800
  "songs_per_guest_limit"?: number,  // 1-50
  "expires_in_hours"?: number        // 1-24, default: 8
}

Response:
{
  "session_id": string,      // UUID
  "session_code": string,    // "HK-XXXX-XXXX"
  "qr_code_url": string,
  "join_url": string,        // "https://homekaraoke.app/join/HK-XXXX-XXXX"
  "expires_at": string       // ISO timestamp
}
```

The API route (`app/api/session/create/route.ts`) calls the Supabase Edge Function `generate-session-code` which:
1. Generates a unique session code (format HK-XXXX-XXXX)
2. Creates a record in the `host_sessions` table
3. Returns the join URL and QR code

---

## New Files to Create

### Backend (Rust)

| File | Purpose |
|------|---------|
| `src-tauri/src/commands/host_session.rs` | Tauri commands: `host_session_create`, `host_session_get_active`, `host_session_end` |

### Frontend (TypeScript)

| File | Purpose |
|------|---------|
| `src/types/hostSession.ts` | Type definitions |
| `src/services/hostSession.ts` | Service layer wrapping Tauri commands |
| `src/stores/hostSessionStore.ts` | Zustand store for state management |
| `src/components/hostSession/CreateHostSessionDialog.tsx` | Config dialog with session options |
| `src/components/hostSession/QRCodeDialog.tsx` | QR code display with session info |
| `src/components/hostSession/HostSessionIndicator.tsx` | Status indicator for active session |
| `src/components/hostSession/index.ts` | Barrel exports |

---

## Files to Modify

| File | Changes |
|------|---------|
| `src-tauri/src/db/schema.rs` | Add Migration 11: `host_sessions` table |
| `src-tauri/src/commands/mod.rs` | Export `host_session` module |
| `src-tauri/src/lib.rs` | Register commands in `invoke_handler` |
| `src/services/index.ts` | Export `hostSessionService` |
| `src/stores/index.ts` | Export `useHostSessionStore` |
| `src/components/session/SessionBar.tsx` | Add "Host Session" button + indicator |

---

## Database Schema (Migration 11)

```sql
CREATE TABLE IF NOT EXISTS host_sessions (
    id INTEGER PRIMARY KEY,
    session_id TEXT UNIQUE NOT NULL,      -- UUID from API
    session_code TEXT NOT NULL,           -- "HK-XXXX-XXXX"
    session_name TEXT,
    qr_code_url TEXT NOT NULL,
    join_url TEXT NOT NULL,
    requires_approval INTEGER DEFAULT 1,
    max_song_duration_seconds INTEGER,
    songs_per_guest_limit INTEGER,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    is_active INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_host_sessions_active ON host_sessions(is_active);
```

---

## Implementation Steps

### Step 1: Types and Database
1. Create `src/types/hostSession.ts` with interfaces
2. Add Migration 11 to `schema.rs`

### Step 2: Backend Commands
1. Create `src-tauri/src/commands/host_session.rs`:
   - `host_session_create` - Call API, persist to SQLite
   - `host_session_get_active` - Load active session from DB
   - `host_session_end` - Mark session inactive
2. Register commands in `mod.rs` and `lib.rs`

### Step 3: Frontend Service & Store
1. Create `src/services/hostSession.ts`
2. Create `src/stores/hostSessionStore.ts`
3. Export from index files

### Step 4: UI Components
1. `CreateHostSessionDialog.tsx` - Config form with:
   - Session name (optional text)
   - Require approval (toggle, default: true)
   - Max song duration (select: None/3min/5min/10min/15min/30min)
   - Songs per guest (select: Unlimited/1/2/3/5/10)
   - Session duration (select: 1h/2h/4h/8h/12h/24h)
2. `QRCodeDialog.tsx` - Display QR code, session code, copy URL button
3. `HostSessionIndicator.tsx` - Green dot + code when active

### Step 5: Integration
1. Add "Host Session" button to `SessionBar.tsx`
2. Show `HostSessionIndicator` when session is active
3. Load active session on app startup

---

## Authentication (MVP)

Store API token in settings table (key: `host_api_token`).

Add token input field to Settings dialog under new "Cloud" tab or YouTube section.

---

## Key Technical Patterns

### Tauri Command (follow youtube.rs pattern)
```rust
#[tauri::command]
pub async fn host_session_create(
    state: State<'_, AppState>,
    config: HostSessionConfig,
) -> Result<HostSession, HostSessionError> {
    let token = get_api_token(&state)?;
    let client = reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(15))
        .build()?;
    // POST to API, persist to DB, return response
}
```

### Zustand Store (follow sessionStore pattern)
```typescript
export const useHostSessionStore = create<HostSessionState>((set, get) => ({
  activeSession: null,
  isLoading: false,
  showCreateDialog: false,
  showQRDialog: false,

  createSession: async (config) => {
    set({ isLoading: true });
    const session = await hostSessionService.create(config);
    set({ activeSession: session, showQRDialog: true, isLoading: false });
  },
}));
```

### Dialog (follow SettingsDialog pattern)
- Fixed overlay: `bg-black/50`
- Container: `bg-gray-800 rounded-lg w-96`
- Use SettingRow pattern for config options

---

## Verification

1. **Unit test**: Config validation in Rust
2. **Manual test flow**:
   - Open app with active local session
   - Click "Host Session" button
   - Configure options and click "Start"
   - Verify QR code displays with valid URL
   - Copy URL and verify format
   - End session and verify cleanup
3. **Error handling**: Test with invalid/missing token
4. **Crash recovery**: Restart app, verify active session persists

---

## Out of Scope (Future Phases)

- Real-time WebSocket for guest requests
- QR code overlay on video player
- Secondary display QR code
- Full OAuth authentication flow
- Guest request approval UI

---

## Prerequisites

- Authentication system (Phase 1 of cloud-playlists.md)
- Backend API deployed at homekaraoke.app
- Supabase Edge Function `generate-session-code`
