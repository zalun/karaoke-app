# Implementation Plan: Host Session Feature (#201)

## Summary

Enable users to upgrade a local karaoke session to a "hosted" session with a shareable join code. Guests can use the code at `homekaraoke.app/join` to add songs remotely.

## Architecture

```
Desktop App  →  https://homekaraoke.app/api/*  →  Supabase
```

The desktop app ONLY communicates with `homekaraoke.app`. The website handles all Supabase interactions.

**Existing Backend (already implemented in karaoke-website):**
- `generate-session-code` Edge Function - creates session, returns `HK-XXXX-XXXX` code
- `session-heartbeat` Edge Function - keeps session alive, returns stats
- `host_sessions` table with all required fields

---

## Implementation Steps

### 1. Add Dependencies

```bash
npm install qrcode @types/qrcode
```

### 2. Create Hosted Session Service

**New file: `src/services/hostedSession.ts`**

Calls `https://homekaraoke.app/api/*` endpoints:

```typescript
const API_BASE = "https://homekaraoke.app";

export interface HostedSession {
  id: string;
  sessionCode: string;        // Format: HK-XXXX-XXXX
  joinUrl: string;            // https://homekaraoke.app/join/HK-XXXX-XXXX
  qrCodeUrl: string;          // Pre-generated QR code URL
  expiresAt: string;
  status: "active" | "paused" | "ended";
  stats: {
    pendingRequests: number;
    approvedRequests: number;
    totalGuests: number;
  };
}

export const hostedSessionService = {
  // POST /api/session/create
  async createHostedSession(accessToken: string, sessionName?: string): Promise<HostedSession>;

  // GET /api/session/[id] - poll for stats
  async getSession(accessToken: string, sessionId: string): Promise<HostedSession>;

  // DELETE /api/session/[id] - end session
  async endHostedSession(accessToken: string, sessionId: string): Promise<void>;
};
```

### 3. Extend Session Store

**Modify: `src/stores/sessionStore.ts`**

Add hosted session state and actions:
```typescript
// State
hostedSession: HostedSession | null;
isHosting: boolean;           // Derived: hostedSession !== null
showHostModal: boolean;

// Actions
hostSession: () => Promise<void>;      // Create hosted session, start polling
stopHosting: () => Promise<void>;      // End hosted session, stop polling
refreshHostedSession: () => Promise<void>;  // Poll for stats
openHostModal: () => void;
closeHostModal: () => void;
```

Polling loop runs every 30 seconds while hosting to:
- Refresh session stats (pending requests, guests)
- Update `hostedSession.stats`

### 4. Modify SessionBar

**Modify: `src/components/session/SessionBar.tsx`**

Add after session name (around line 500):
- **"Host" button**: Globe icon, visible when `isAuthenticated && session && !hostedSession`
- **Join code badge**: Shows `HK-XXXX-XXXX`, visible when hosting, click opens modal

### 5. Create Host Session Modal

**New file: `src/components/session/HostSessionModal.tsx`**

Content:
- Large join code `HK-XXXX-XXXX` (monospace, high contrast, readable from distance)
- QR code (use `qrCodeUrl` from API response)
- Join URL text
- "Copy Link" and "Copy Code" buttons
- Stats: "{N} guests connected", "{N} pending requests"
- "Stop Hosting" button
- Auto-refreshes stats via heartbeat

### 6. Create QR Code Component

**New file: `src/components/session/JoinCodeQR.tsx`**

Simple component that displays the QR code image from URL:
```typescript
export function JoinCodeQR({ url, size = 200 }: { url: string; size?: number }) {
  return <img src={url} alt="Scan to join" width={size} height={size} />;
}
```

### 7. Enhance VideoPlayer Idle State

**Modify: `src/components/player/VideoPlayer.tsx`**

When `hostedSession && !currentVideo && !isLoading`, show centered:
- QR code (large, ~300px)
- Join code `HK-XXXX-XXXX` in large text
- "Scan to join or visit homekaraoke.app/join"

### 8. Enhance NextSongOverlay

**Modify: `src/components/player/NextSongOverlay.tsx`**

Add optional `joinCode` prop. When provided, show subtle text in corner:
```
Join: HK-XXXX-XXXX
```

### 9. Sync to DetachedPlayer

**Modify: `src/services/windowManager.ts`**

Include `hostedSession` in `PlayerStateSyncData`.

**Modify: `src/components/player/DetachedPlayer.tsx`**

Display join info overlay when idle and `state.hostedSession` exists.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/services/hostedSession.ts` | API calls to homekaraoke.app |
| `src/components/session/HostSessionModal.tsx` | Modal with join code, QR, stats |
| `src/components/session/JoinCodeQR.tsx` | QR code image component |

## Files to Modify

| File | Changes |
|------|---------|
| `src/stores/sessionStore.ts` | Add hosting state, heartbeat loop |
| `src/components/session/SessionBar.tsx` | Add Host button, join code badge |
| `src/components/session/index.ts` | Export new components |
| `src/components/player/VideoPlayer.tsx` | Add idle state join overlay |
| `src/components/player/NextSongOverlay.tsx` | Add joinCode prop |
| `src/components/player/DetachedPlayer.tsx` | Add idle state join overlay |
| `src/services/windowManager.ts` | Sync hostedSession state |

---

## Join Code Format

`HK-XXXX-XXXX` where X = alphanumeric (excluding 0, O, 1, I)

Example: `HK-AB3D-7KMN`

Readable from across a room in karaoke party setting.

---

## Website API Endpoints (Already Exist)

The website already has these API routes:

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `POST /api/session/create` | POST | Cookie/Bearer | Create hosted session |
| `GET /api/session/[id]` | GET | Cookie/Bearer | Get session + stats |
| `PATCH /api/session/[id]` | PATCH | Cookie/Bearer | Update session |
| `DELETE /api/session/[id]` | DELETE | Cookie/Bearer | End session |

**Response from `POST /api/session/create`:**
```json
{
  "session_id": "uuid",
  "session_code": "HK-ABCD-1234",
  "qr_code_url": "https://api.qrserver.com/...",
  "join_url": "https://homekaraoke.app/join/HK-ABCD-1234",
  "expires_at": "2024-01-24T..."
}
```

**Response from `GET /api/session/[id]`:**
```json
{
  "id": "uuid",
  "session_code": "HK-ABCD-1234",
  "status": "active",
  "stats": {
    "pending_requests": 2,
    "approved_requests": 5,
    "total_guests": 3
  }
}
```

**Auth Note:** Desktop app must pass access token in `Authorization: Bearer <token>` header. Website uses Supabase server client which supports both cookie and Bearer auth.

---

## Testing

### E2E Tests
New file: `tests/e2e/hosted-session.spec.ts`
- Host button visibility (auth + session required)
- Modal displays join code and QR
- Copy buttons work
- Stop hosting ends session
- Join code appears in video idle state

### Manual Testing Checklist
- [ ] Host button hidden when not authenticated
- [ ] Host button hidden when no active session
- [ ] Join code readable from distance
- [ ] QR code scans correctly and opens join page
- [ ] Copy buttons work
- [ ] Stats update on heartbeat
- [ ] Stop hosting clears state
- [ ] Join code shows in idle video player
- [ ] Join code shows in NextSongOverlay

---

## Out of Scope

- Website `/join` pages (separate repo/task)
- Song request approval UI in desktop app (future)
- WebSocket real-time updates (future enhancement)
- Multiple hosts/admin permissions
- Song voting, chat
