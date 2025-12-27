# Feature: Song Requests via QR Code

## Summary

Allow party guests to scan a QR code and add songs to the queue from their phones, without needing access to the host's computer.

## User Stories

1. As a host, I want guests to add songs without crowding around my computer
2. As a guest, I want to browse and add songs from my phone
3. As a host, I want to moderate requests before they're added to the queue

## Architecture Options

### Option A: Local Web Server (Recommended)

Run a simple HTTP server on the host machine. Guests connect via local network.

**Pros:** No internet required, low latency, privacy
**Cons:** Requires same WiFi network, firewall configuration

### Option B: Cloud Relay

Use a cloud service to relay requests between guests and host.

**Pros:** Works across networks, no firewall issues
**Cons:** Requires internet, privacy concerns, service costs

### Option C: Bluetooth/AirDrop

Direct device-to-device communication.

**Pros:** No network required
**Cons:** Limited range, platform-specific, complex pairing

## Recommended: Option A (Local Web Server)

Best balance of simplicity, privacy, and reliability for home use.

## Implementation

### Backend

**New Rust Dependencies:**
```toml
axum = "0.7"           # Web framework
tower-http = "0.5"     # CORS, static files
qrcode = "0.14"        # QR code generation
local-ip-address = "0.6"
```

**Web Server Module** (`src-tauri/src/services/web_server.rs`):
```rust
// Endpoints:
GET  /                    # Guest web app (static HTML/JS)
GET  /api/search?q=...    # Search YouTube
GET  /api/queue           # Get current queue
POST /api/queue           # Add song request
GET  /api/singers         # List singers
POST /api/singers         # Create singer (for guest)
GET  /api/session         # Session info
WS   /api/events          # Real-time queue updates
```

**Tauri Commands:**
```rust
webserver_start(port: u16) -> String     // Returns URL
webserver_stop() -> ()
webserver_get_qr_code() -> String        // Base64 PNG
webserver_get_url() -> Option<String>
webserver_set_moderation(enabled: bool) -> ()
```

### Frontend (Host App)

**QR Code Display:**
- Button in SessionBar: "Get QR Code"
- Modal showing QR code + URL
- Option to show QR as overlay on video (for projector)

**Request Moderation:**
- Incoming requests panel (when moderation enabled)
- Approve/reject buttons
- Auto-approve option

### Guest Web App

Simple responsive web page served by the local server:

```
┌─────────────────────────────────┐
│     🎤 Karaoke Night           │
│     Add your song!              │
├─────────────────────────────────┤
│ Your name: [_______________]    │
│                                 │
│ Search: [_______________] [🔍]  │
│                                 │
│ ┌─────────────────────────────┐ │
│ │ Search Results              │ │
│ │ • Song Title - Artist  [+] │ │
│ │ • Song Title - Artist  [+] │ │
│ └─────────────────────────────┘ │
│                                 │
│ Your requests:                  │
│ • Song A (position 5)          │
│ • Song B (pending approval)    │
└─────────────────────────────────┘
```

### Database Changes

```sql
-- Track request source
ALTER TABLE queue ADD COLUMN source TEXT DEFAULT 'host';
-- Values: 'host', 'guest'

-- Optional: Guest sessions for tracking
CREATE TABLE guests (
    id INTEGER PRIMARY KEY,
    session_id INTEGER,
    name TEXT,
    device_id TEXT,  -- Browser fingerprint or generated ID
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Security Considerations

1. **Rate limiting** - Prevent spam (max 3 requests per minute per device)
2. **Input validation** - Sanitize all guest input
3. **Network isolation** - Only respond to local network requests
4. **Session tokens** - Optional PIN to join session
5. **Moderation** - Host can require approval for all requests

## UI Mockup (Host)

```
SessionBar with QR button:
┌─────────────────────────────────────────────────┐
│ ● Karaoke Night  [📱 QR Code]  [🔄]  [End]     │
└─────────────────────────────────────────────────┘

QR Code Modal:
┌─────────────────────────────────────────────────┐
│           Scan to Add Songs                     │
│                                                 │
│          ┌───────────────┐                     │
│          │   QR CODE     │                     │
│          │   [IMAGE]     │                     │
│          └───────────────┘                     │
│                                                 │
│     http://192.168.1.42:3000                   │
│                                                 │
│     [Copy Link]  [Show on Video]              │
│                                                 │
│     ☐ Require approval for requests           │
└─────────────────────────────────────────────────┘
```

## Edge Cases

1. **Network changes** - Regenerate QR if IP changes
2. **Multiple devices same guest** - Link by name or device ID
3. **Server port conflict** - Try alternative ports
4. **Guest adds song without name** - Prompt to enter name first
5. **Session ends** - Gracefully close guest connections

## Future Enhancements

- Guest voting on queue order
- Chat/reactions
- Song dedication messages
- Guest statistics (songs added, played)
