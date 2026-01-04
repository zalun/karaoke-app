# Cloud Playlists & Session Linking

## Overview

Enable users to store playlists online and link their accounts to HomeKaraoke instances at venues via QR code scanning. Guests can add songs from their cloud playlists to a host's queue.

---

## Key Actors

| Actor | Description |
|-------|-------------|
| **User** | Has personal playlists stored in the cloud |
| **Host** | Runs HomeKaraoke at a venue or home, manages the session |
| **Guest** | Scans QR code to connect and request songs from their playlists |

---

## Core Features

### 1. Cloud Playlist Storage
- Users can create playlists on homekaraoke.app or in the app
- Playlists sync between devices when logged in
- Clear distinction between local-only and cloud playlists
- User controls what gets synced

### 2. Host Sessions
- Host starts a karaoke session in HomeKaraoke app
- Generates unique session code displayed as QR code
- Session code format: `HK-XXXX-XXXX` (expires after 8 hours)
- Host can regenerate code or end session anytime

### 3. Guest Joining
- Guest scans QR code with phone camera
- Opens `homekaraoke.app/join/{session-code}`
- Guest logs in (or creates account)
- Guest sees their cloud playlists
- Guest selects multiple songs and submits to host

### 4. Song Request Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| **Require Approval** | Songs go to pending queue, host approves/rejects | Venues, large parties |
| **Direct to Queue** | Songs added immediately | Home parties, trusted groups |

Host chooses mode when starting session and can change mid-session.

---

## User Flows

### Flow 1: Cloud Playlist Sync
```
User logs in (app or web)
    ↓
Creates/edits playlists
    ↓
Playlists sync to cloud
    ↓
Available on any device when logged in
```

### Flow 2: Host Starts Session
```
Host logs into HomeKaraoke app
    ↓
Clicks "Start Session"
    ↓
Chooses mode: Approval Required / Direct to Queue
    ↓
QR code displayed (can show on secondary display)
    ↓
Waits for guests to join
```

### Flow 3: Guest Joins & Requests Songs
```
Guest scans QR code
    ↓
Opens homekaraoke.app/join/{code}
    ↓
Logs in (if not already)
    ↓
Sees their cloud playlists
    ↓
Selects multiple songs (max 5 per batch)
    ↓
Clicks "Request Songs" or "Add to Queue"
    ↓
If approval mode: Songs go to pending, guest waits
If direct mode: Songs added to queue, guest sees position
```

### Flow 4: Host Approves Requests (Approval Mode)
```
Host sees notification: "Alice requested 3 songs"
    ↓
Opens Pending Requests panel
    ↓
Reviews songs grouped by guest
    ↓
Can approve/reject individually or in batch
    ↓
Guest notified of outcome
```

---

## Guest Song Selection UI

```
┌─────────────────────────────────────────────────────┐
│  My Playlist: "Favorites"                [Select All] │
├─────────────────────────────────────────────────────┤
│  ☑️  "Bohemian Rhapsody" - Queen                    │
│  ☑️  "Don't Stop Believin'" - Journey              │
│  ☐  "Sweet Caroline" - Neil Diamond                │
│  ☑️  "Livin' on a Prayer" - Bon Jovi               │
│  ☐  "Mr. Brightside" - The Killers                 │
└─────────────────────────────────────────────────────┘
│  3 songs selected                                   │
│                                                     │
│  [Request Songs]                                    │
└─────────────────────────────────────────────────────┘
```

---

## Host Pending Requests UI

```
┌─────────────────────────────────────────────────────┐
│  Pending Requests (4)                               │
├─────────────────────────────────────────────────────┤
│                                                     │
│  📦 Alice requested 3 songs • 2 min ago            │
│  ┌─────────────────────────────────────────────┐   │
│  │ ☑️ "Bohemian Rhapsody" - Queen              │   │
│  │ ☑️ "Don't Stop Believin'" - Journey        │   │
│  │ ☑️ "Livin' on a Prayer" - Bon Jovi         │   │
│  └─────────────────────────────────────────────┘   │
│  [✓ Approve All]  [✗ Reject All]                   │
│  ─────────────────────────────────────────────────  │
│  📦 Bob requested 1 song • 5 min ago               │
│  ┌─────────────────────────────────────────────┐   │
│  │ ☑️ "Wonderwall" - Oasis                     │   │
│  └─────────────────────────────────────────────┘   │
│  [✓ Approve]  [✗ Reject]                           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Host - Connected Guests Panel

```
┌─────────────────────────────────────────────────────┐
│  Connected Guests (3)                               │
├─────────────────────────────────────────────────────┤
│  👤 Alice         12 songs requested    (3 pending) │
│  👤 Bob            4 songs requested    (1 pending) │
│  👤 Charlie        2 songs requested               │
└─────────────────────────────────────────────────────┘
```

---

## Guest - "Your Song is Next" Notification

```
┌─────────────────────────────────────────────────────┐
│  🎤 Get Ready!                                      │
│                                                     │
│  Your song "Bohemian Rhapsody" is up next!         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Data Model (Conceptual)

### User
- id, email, name, avatar
- Authentication via OAuth (Google, Apple) or email

### Playlist
- id, user_id (owner), name, is_public
- Contains playlist items (youtube_id, title, artist, position)

### HostSession
- id, host_user_id, session_code
- requires_approval (boolean)
- expires_at, is_active

### SongRequestBatch
- id, session_id, guest_user_id, requested_at

### SongRequest
- id, batch_id, youtube_id, title, artist
- status: pending | approved | rejected

---

## Limits & Fairness

| Limit | Value | Rationale |
|-------|-------|-----------|
| Songs per batch | Max 5 | Prevent overwhelming host |
| Pending per guest | Max 10 total | Fair queue distribution |
| Cooldown between batches | 2 minutes | Prevent spam |
| Session duration | 8 hours max | Security |

---

## HomeKaraoke App Changes

### New Stores
- `authStore` - user authentication state
- `syncStore` - playlist sync status
- `hostSessionStore` - active session, connected guests, pending requests

### New UI Components
- Login/Register dialog
- Cloud playlist indicator (local vs synced)
- Session start dialog (mode selection)
- QR code display options:
  - In NextSongOverlay (between songs - natural moment to scan)
  - Persistent corner widget (small, unobtrusive)
  - Secondary display (full screen for venues)
- Pending requests panel
- Connected guests list

### New Tauri Commands
```rust
// Authentication
auth_login(provider: String) -> Result<User>
auth_logout() -> Result<()>
auth_get_current_user() -> Result<Option<User>>

// Playlist sync
sync_playlists() -> Result<SyncResult>
sync_upload_playlist(playlist_id: String) -> Result<()>
sync_download_playlist(cloud_id: String) -> Result<()>

// Host session
session_start(requires_approval: bool) -> Result<SessionCode>
session_end() -> Result<()>
session_regenerate_code() -> Result<SessionCode>
session_approve_requests(request_ids: Vec<String>) -> Result<()>
session_reject_requests(request_ids: Vec<String>) -> Result<()>
```

---

## Web App (homekaraoke.app)

### Pages
- `/` - Landing page, feature overview
- `/login` - Authentication
- `/playlists` - Manage cloud playlists
- `/join/{code}` - Guest joining flow
- `/host` - Host dashboard (optional web-based management)

### Guest Join Flow
1. Scan QR → opens `/join/{code}`
2. If not logged in → redirect to login, then back
3. Show guest's playlists
4. Multi-select songs
5. Submit request
6. Show request status (pending/approved/rejected)
7. Real-time updates via WebSocket

---

## Backend Requirements (High Level)

- User authentication (OAuth + email)
- Database for users, playlists, sessions, requests
- Real-time communication (WebSocket) for:
  - Host receives new requests
  - Guest receives approval/rejection
  - Session status updates
- REST API for CRUD operations
- Rate limiting and abuse prevention

*Backend technology and hosting to be specified in separate project.*

---

## Privacy & Security

### Authentication
- OAuth preferred (Google, Apple) for security
- Short-lived session tokens
- Secure token storage in app

### Session Security
- Codes expire after 8 hours
- Rate limiting on join attempts
- Host can regenerate code anytime
- Host can kick guests

### Data Privacy
- Only store YouTube metadata (id, title, artist)
- Users can delete account and all data
- GDPR compliance required for EU users
- Clear privacy policy

---

## Phased Implementation

### Phase 1: Auth & Cloud Playlists
- [ ] User authentication
- [ ] Cloud playlist storage
- [ ] Web: playlist management
- [ ] App: login + sync toggle per playlist

### Phase 2: Host Sessions
- [ ] Session creation with mode selection
- [ ] QR code generation and display
- [ ] Web: guest join flow
- [ ] Real-time request/approval flow

### Phase 3: Polish
- [ ] Secondary display QR code
- [ ] Guest request history
- [ ] Duplicate detection ("already in queue")
- [ ] Request timeout handling

### Future Considerations
- Playlist sharing between users
- Public playlist discovery
- Import from YouTube playlists
- Analytics for hosts
- Venue subscriptions / monetization

---

## Design Decisions

| Question | Decision |
|----------|----------|
| Can guests see the queue? | No. Guest gets notified when their song is next. |
| Can guests see other guests? | No. |
| Multiple hosts per session? | No. One host per session. |
| Offline host? | Session pauses. Songs require internet (YouTube). |
| Song limits? | Max per request (e.g., 5). Host sees total requested per guest in session. |
| Trusted guests / auto-approve? | No. Keep it simple. |
| Pre-made rejection reasons? | Possibly. Consider for Phase 3. |
| Monetization? | TBD. Will consider limits and premium features later. |
