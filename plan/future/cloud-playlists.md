# Cloud Playlists & Session Linking

## Overview

Enable users to store playlists online and link their accounts to HomeKaraoke instances at venues via QR code scanning. Guests can search for songs or pick from their cloud playlists to add to a host's queue.

---

## Key Actors

| Actor | Description |
|-------|-------------|
| **User** | Has personal playlists stored in the cloud |
| **Host** | Runs HomeKaraoke at a venue or home, manages the session |
| **Co-host** | Delegated by host to approve/reject requests |
| **Guest** | Scans QR code to connect and request songs |

---

## Core Features

### 1. Cloud Playlist Storage
- Users can create playlists on homekaraoke.app or in the app
- Playlists sync between devices when logged in
- Clear distinction between local-only and cloud playlists
- User controls what gets synced

### 2. Song Request History (Auto-saved)
- Every song a guest requests is automatically saved to their history
- History stored even for guests who joined without an account (linked if they sign up later)
- Users can later review history and add songs to playlists
- "Add to Favorites" action available from history view
- History helps build playlists over time from actual karaoke sessions

### 3. Host Sessions
- Host starts a karaoke session in HomeKaraoke app
- Generates unique session code displayed as QR code
- Session code format: `HK-XXXX-XXXX` (expires after 8 hours, configurable)
- Host can regenerate code, pause, resume, or end session anytime
- Host can delegate approval to co-hosts

### 4. Guest Joining (Low Friction)
- Guest scans QR code with phone camera
- Opens `homekaraoke.app/join/{session-code}`
- **Quick join option:** Enter display name only (no account required)
- **Full join option:** Log in to access cloud playlists and sync history
- Guest can search for any song OR pick from their playlists
- Guest selects songs and submits to host

### 5. Song Request Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| **Require Approval** | Songs go to pending queue, host/co-host approves/rejects | Venues, large parties |
| **Direct to Queue** | Songs added immediately | Home parties, trusted groups |

Host chooses mode when starting session and can change mid-session.

### 6. Queue Visibility for Guests
- Guests can see their position in queue: "You are #7"
- Estimated wait time shown (based on average song length × position)
- Real-time updates as queue progresses
- Clear status: pending approval → approved (position #X) → up next → playing

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
Optionally adds co-hosts (by email or from connected guests)
    ↓
QR code displayed (can show on secondary display)
    ↓
Waits for guests to join
```

### Flow 3a: Guest Quick Join (No Account)
```
Guest scans QR code
    ↓
Opens homekaraoke.app/join/{code}
    ↓
Enters display name (e.g., "Mike")
    ↓
Searches for songs directly
    ↓
Selects songs and submits request
    ↓
Gets queue position and wait time estimate
    ↓
(History saved locally, can link to account later)
```

### Flow 3b: Guest Full Join (With Account)
```
Guest scans QR code
    ↓
Opens homekaraoke.app/join/{code}
    ↓
Logs in (or already logged in)
    ↓
Can search for songs OR browse cloud playlists
    ↓
Selects songs and submits request
    ↓
Gets queue position and wait time estimate
    ↓
(History synced to account automatically)
```

### Flow 4: Host/Co-host Approves Requests (Approval Mode)
```
Host or co-host sees notification: "Mike requested 3 songs"
    ↓
Opens Pending Requests panel
    ↓
Reviews songs grouped by guest
    ↓
Can approve/reject individually or in batch
    ↓
Guest notified of outcome with queue position
```

### Flow 5: Guest Reviews History & Builds Playlists
```
Guest logs into homekaraoke.app
    ↓
Views "My History" - all songs ever requested
    ↓
Filters by date, venue, or search
    ↓
Selects songs and clicks "Add to Playlist"
    ↓
Creates new playlist or adds to existing
```

---

## Guest Song Selection UI

### Search View (Default for Quick Join)
```
┌─────────────────────────────────────────────────────┐
│  🔍 Search for a song...                            │
├─────────────────────────────────────────────────────┤
│  Recent searches: "queen", "journey", "80s hits"   │
├─────────────────────────────────────────────────────┤
│  Search results for "bohemian":                    │
│                                                     │
│  ☑️  "Bohemian Rhapsody" - Queen           [+ Add] │
│  ☐  "Bohemian Like You" - Dandy Warhols    [+ Add] │
│  ☐  "Bohemian Groove" - Various            [+ Add] │
└─────────────────────────────────────────────────────┘
│  1 song selected                    [Request Song] │
└─────────────────────────────────────────────────────┘
```

### Playlist View (For Logged-in Users)
```
┌─────────────────────────────────────────────────────┐
│  [🔍 Search]  [📋 My Playlists]  [📜 History]      │
├─────────────────────────────────────────────────────┤
│  My Playlist: "Favorites"              [Select All] │
├─────────────────────────────────────────────────────┤
│  ☑️  "Bohemian Rhapsody" - Queen                    │
│  ☑️  "Don't Stop Believin'" - Journey              │
│  ☐  "Sweet Caroline" - Neil Diamond                │
│  ☑️  "Livin' on a Prayer" - Bon Jovi               │
│  ☐  "Mr. Brightside" - The Killers                 │
└─────────────────────────────────────────────────────┘
│  3 songs selected                  [Request Songs] │
└─────────────────────────────────────────────────────┘
```

### History View
```
┌─────────────────────────────────────────────────────┐
│  [🔍 Search]  [📋 My Playlists]  [📜 History]      │
├─────────────────────────────────────────────────────┤
│  Your Song History                                  │
├─────────────────────────────────────────────────────┤
│  Dec 28, 2024 - Mike's Party                       │
│  ├─ "Bohemian Rhapsody" - Queen      [♡] [+ Add]  │
│  └─ "Sweet Caroline" - Neil Diamond  [♡] [+ Add]  │
│                                                     │
│  Dec 15, 2024 - The Blue Note Bar                  │
│  ├─ "Don't Stop Believin'" - Journey [♡] [+ Add]  │
│  └─ "Living on a Prayer" - Bon Jovi  [♡] [+ Add]  │
└─────────────────────────────────────────────────────┘
│  [♡] = Add to Favorites    [+ Add] = Add to Playlist │
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
│  │ ☑️ "Bohemian Rhapsody" - Queen        5:55  │   │
│  │ ☑️ "Don't Stop Believin'" - Journey   4:10  │   │
│  │ ☑️ "Livin' on a Prayer" - Bon Jovi    4:09  │   │
│  └─────────────────────────────────────────────┘   │
│  [✓ Approve All]  [✗ Reject All]                   │
│  ─────────────────────────────────────────────────  │
│  📦 Bob requested 1 song • 5 min ago               │
│  ┌─────────────────────────────────────────────┐   │
│  │ ☑️ "Wonderwall" - Oasis               4:18  │   │
│  └─────────────────────────────────────────────┘   │
│  [✓ Approve]  [✗ Reject]                           │
│  ─────────────────────────────────────────────────  │
│  ⚠️ "November Rain" - Guns N' Roses (8:57)        │
│     Requested by Charlie • Exceeds 6 min limit     │
│  [✓ Approve Anyway]  [✗ Reject]                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Host Session Controls UI

```
┌─────────────────────────────────────────────────────┐
│  Session: HK-7X4M-9K2P          Active • 2h 15m    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Mode: [● Require Approval] [ Direct to Queue]     │
│                                                     │
│  Co-hosts:                                          │
│  ├─ sarah@email.com (connected)                    │
│  └─ [+ Add co-host]                                │
│                                                     │
│  Session Rules:                                     │
│  ├─ Max song length: [6 min ▼] (warn if exceeded)  │
│  └─ Songs per guest: [No limit ▼]                  │
│                                                     │
│  [⏸ Pause Session]  [🔄 New Code]  [⏹ End Session]│
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Host - Connected Guests Panel

```
┌─────────────────────────────────────────────────────┐
│  Connected Guests (3)                    [Manage]   │
├─────────────────────────────────────────────────────┤
│  👤 Alice         12 songs requested    (3 pending) │
│     └─ [Make Co-host]  [Remove]                    │
│  👤 Bob            4 songs requested    (1 pending) │
│     └─ [Make Co-host]  [Remove]                    │
│  👤 Charlie        2 songs requested               │
│     └─ [Make Co-host]  [Remove]                    │
│  👤 Mike (guest)   1 song requested                │
│     └─ No account - cannot be co-host              │
└─────────────────────────────────────────────────────┘
```

---

## Guest - Queue Status View

```
┌─────────────────────────────────────────────────────┐
│  Your Requests                                      │
├─────────────────────────────────────────────────────┤
│  ✓ "Bohemian Rhapsody" - Queen                     │
│    Position: #3 • ~12 min wait                     │
│                                                     │
│  ✓ "Don't Stop Believin'" - Journey               │
│    Position: #7 • ~28 min wait                     │
│                                                     │
│  ⏳ "Livin' on a Prayer" - Bon Jovi                │
│    Waiting for approval...              [Cancel]   │
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
│  Head to the stage!                                │
└─────────────────────────────────────────────────────┘
```

Notification delivery (in priority order):
1. Push notification (if browser permission granted)
2. SMS (if phone number provided, premium feature)
3. In-app alert with sound (if tab is open)
4. Email fallback (for "next 3 songs" reminder)

---

## Data Model (Conceptual)

### User
- id, email, name, avatar
- Authentication via OAuth (Google, Apple) or email

### GuestIdentity
- id, display_name, device_fingerprint
- user_id (nullable - linked if they sign up later)
- created_at

### Playlist
- id, user_id (owner), name, is_public
- Contains playlist items (youtube_id, title, artist, position)

### SongHistory
- id, user_id (or guest_identity_id)
- youtube_id, title, artist, duration_seconds
- session_id (which session it was requested in)
- session_name (e.g., "Mike's Party", "The Blue Note Bar")
- requested_at
- status: approved | rejected | played

### HostSession
- id, host_user_id, session_code, session_name
- requires_approval (boolean)
- max_song_duration_seconds (nullable)
- songs_per_guest_limit (nullable)
- status: active | paused | ended
- expires_at, created_at

### SessionCoHost
- id, session_id, user_id
- added_at, added_by (host_user_id)

### SongRequestBatch
- id, session_id
- requester_user_id OR requester_guest_id
- requested_at

### SongRequest
- id, batch_id, youtube_id, title, artist, duration_seconds
- status: pending | approved | rejected | cancelled
- approved_by (user_id of host/co-host, nullable)
- queue_position (after approval)
- cancelled_at (if guest cancelled)

---

## Limits & Fairness

| Limit | Value | Rationale |
|-------|-------|-----------|
| Songs per batch | Max 5 | Prevent overwhelming host |
| Total in queue per guest | Max 10 | Fair queue distribution |
| Session duration | Configurable (default 8 hours) | Flexibility for different events |
| Max song duration | Configurable by host (default: none) | Venue control |

### Smart Rate Limiting
Instead of fixed cooldowns that frustrate users:
- First request: no cooldown
- 2nd request within 1 minute: 30 second wait
- 3rd+ request within 5 minutes: 2 minute wait
- Resets after 10 minutes of no requests

This prevents spam while allowing legitimate "I forgot one song" additions.

---

## HomeKaraoke App Changes

### New Stores
- `authStore` - user authentication state
- `syncStore` - playlist sync status
- `hostSessionStore` - active session, connected guests, pending requests, co-hosts

### New UI Components
- Login/Register dialog
- Cloud playlist indicator (local vs synced)
- Session start dialog (mode selection, session name)
- Session controls panel (pause/resume, co-hosts, rules)
- QR code display options:
  - In NextSongOverlay (between songs - natural moment to scan)
  - Persistent corner widget (small, unobtrusive)
  - Secondary display (full screen for venues)
- Pending requests panel (with song duration, warnings)
- Connected guests list (with co-host promotion)

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
session_start(config: SessionConfig) -> Result<SessionCode>
session_end() -> Result<()>
session_pause() -> Result<()>
session_resume() -> Result<()>
session_update_config(config: SessionConfig) -> Result<()>
session_regenerate_code() -> Result<SessionCode>
session_add_cohost(user_id: String) -> Result<()>
session_remove_cohost(user_id: String) -> Result<()>
session_approve_requests(request_ids: Vec<String>) -> Result<()>
session_reject_requests(request_ids: Vec<String>) -> Result<()>
session_remove_guest(guest_id: String) -> Result<()>
```

---

## Web App (homekaraoke.app)

### Pages
- `/` - Landing page, feature overview
- `/login` - Authentication
- `/playlists` - Manage cloud playlists
- `/history` - View song request history, add to playlists
- `/join/{code}` - Guest joining flow
- `/host` - Host dashboard (optional web-based management)

### Guest Join Flow
1. Scan QR → opens `/join/{code}`
2. Choose: "Quick Join" (display name only) OR "Log in" (full features)
3. Search for songs OR browse playlists (if logged in)
4. Select songs and submit request
5. See queue position and estimated wait time
6. Real-time updates via WebSocket
7. "Up next" notification when it's their turn

---

## Backend Requirements (High Level)

- User authentication (OAuth + email)
- Guest identity tracking (device fingerprint + display name)
- Database for users, playlists, sessions, requests, history
- Real-time communication (WebSocket) for:
  - Host/co-host receives new requests
  - Guest receives approval/rejection and queue updates
  - Session status updates (pause/resume/end)
  - "Up next" notifications
- REST API for CRUD operations
- YouTube search proxy for guests
- Smart rate limiting (progressive cooldowns)
- Session persistence and crash recovery

*Backend technology and hosting to be specified in separate project.*

---

## Privacy & Security

### Authentication
- OAuth preferred (Google, Apple) for security
- Short-lived session tokens
- Secure token storage in app
- Guest mode: no account required, display name only

### Guest Privacy
- Guests can use nicknames (not required to use real name)
- Host sees display name only (not email unless guest is logged in)
- Guest history stored locally until they create account
- Option to remain anonymous to other guests (default)

### Session Security
- Codes configurable expiry (default 8 hours)
- Rate limiting on join attempts
- Host can regenerate code anytime
- Host can remove guests
- Session state persisted for crash recovery

### Data Privacy
- Only store YouTube metadata (id, title, artist, duration)
- Song history stored for user convenience (can be deleted)
- Users can delete account and all data
- GDPR compliance required for EU users
- Clear privacy policy

---

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| Same song requested by two guests | Allow both - host sees duplicate warning |
| Song already in queue | Show "Already in queue (position #X)" - allow re-request anyway |
| Guest cancels pending request | Remove from pending, notify host |
| Host pauses session | Guests see "Session paused" - can still browse but not submit |
| Host's app crashes | Session persists on server, reconnects on restart |
| Guest loses connection | Reconnects automatically, sees current status |
| Song unavailable/region-blocked | Show error at search time, prevent request |
| Guest requests very long song | Host sees duration warning, can approve/reject |

---

## Phased Implementation

### Phase 1: Auth & Cloud Playlists
- [ ] User authentication (OAuth)
- [ ] Cloud playlist storage
- [ ] Web: playlist management
- [ ] App: login + sync toggle per playlist
- [ ] Song history auto-save (foundation for Phase 2)

### Phase 2: Host Sessions & Guest Join
- [ ] Session creation with mode selection
- [ ] QR code generation and display
- [ ] Web: guest quick join (no account) with search
- [ ] Web: guest full join (with account) with playlists
- [ ] Real-time request/approval flow
- [ ] Queue position and wait time for guests
- [ ] Duplicate detection ("already in queue")

### Phase 3: Co-hosts & Session Management
- [ ] Co-host delegation
- [ ] Session pause/resume
- [ ] Session rules (max song length, songs per guest)
- [ ] Guest removal
- [ ] Session crash recovery

### Phase 4: Polish & Notifications
- [ ] Secondary display QR code
- [ ] "Up next" push notifications
- [ ] History view with "Add to Playlist" action
- [ ] Smart rate limiting
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
| Can guests see the queue? | Yes - their position and estimated wait time. |
| Can guests see other guests? | No. |
| Account required for guests? | No. Quick join with display name only. Account optional for playlists/history sync. |
| Can guests search for any song? | Yes. Search is the primary flow, playlists are optional. |
| Multiple hosts per session? | No. One host, but can delegate to co-hosts. |
| Who can approve requests? | Host and any designated co-hosts. |
| Offline host? | Session pauses. Songs require internet (YouTube). |
| Song limits? | Max 5 per request. Host can set max song duration and songs per guest. |
| Trusted guests / auto-approve? | No. Use "Direct to Queue" mode instead. |
| Can guests cancel requests? | Yes, while pending approval. |
| Pre-made rejection reasons? | Possibly. Consider for Phase 4. |
| Song history? | Auto-saved for all requests. Guests can add to playlists later. |
| Monetization? | TBD. Will consider limits and premium features later. |
