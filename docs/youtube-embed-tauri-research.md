# YouTube Iframe Embedding in Tauri Apps: Research & Solutions

## The Problem

Tauri v2 applications on macOS and Linux use the `tauri://localhost` custom protocol to serve app assets. YouTube's IFrame Player API requires a valid HTTP Referer header for embedded videos to work. The `tauri://` protocol doesn't provide this, resulting in **Error 153** ("Video player configuration error" / "Video owner does not allow embedding").

### Platform Differences

| Platform | Protocol | YouTube Works? |
|----------|----------|----------------|
| Development (all) | `http://localhost:1420` | Yes |
| Windows Production | `http://tauri.localhost` | Yes |
| macOS Production | `tauri://localhost` | **No** (Error 153) |
| Linux Production | `tauri://localhost` | **No** (Error 153) |

### Related Issues

- [Tauri Issue #14422](https://github.com/tauri-apps/tauri/issues/14422) - YouTube IFrame Error 153 in Production
- [Tauri Issue #14278](https://github.com/tauri-apps/tauri/issues/14278) - Custom referer request header bug

---

## Solution Options

### Solution 1: Remote Proxy Page

**Concept:** Host an HTML page on your HTTPS domain (e.g., `https://yoursite.com/embed/:videoId`) that embeds the real YouTube iframe. The proxy relays postMessage events between YouTube and your app.

**Implementation:**
```javascript
// In your app
new YT.Player('player', {
  host: 'https://yoursite.com',  // Your domain
  videoId: 'VIDEO_ID',
  // Creates iframe src: https://yoursite.com/embed/VIDEO_ID
});
```

The proxy page loads YouTube's iframe and relays all postMessage events bidirectionally.

**Source:** [Medium - Working around YouTube iframes on WebView based mobile apps](https://medium.com/@kfir.e/working-around-youtube-iframes-on-webview-based-mobile-apps-c8543fb7bd47)

**Pros:**
- No Tauri configuration changes required
- IPC continues to work normally
- Works on all platforms

**Cons:**
- Requires hosting infrastructure
- Dependency on external server availability
- **Potential ToS violation** (see below)

---

### Solution 2: tauri-plugin-localhost

**Concept:** Serve the app over `http://localhost:{port}` instead of the `tauri://` custom protocol.

**Implementation:**
```rust
use tauri::{webview::WebviewWindowBuilder, WebviewUrl};

pub fn run() {
    let port: u16 = 9527;
    let mut context = tauri::generate_context!();
    let url = format!("http://localhost:{}", port).parse().unwrap();

    // Rewrite config so IPC is enabled on this URL
    context.config_mut().build.dist_dir = AppUrl::Url(WindowUrl::External(url.clone()));

    tauri::Builder::default()
        .plugin(tauri_plugin_localhost::Builder::new(port).build())
        .run(context)
        .expect("error while running tauri application");
}
```

**Source:** [Tauri Localhost Plugin Documentation](https://v2.tauri.app/plugin/localhost/)

**Pros:**
- No external server needed
- Standard HTTP protocol (valid Referer)
- **Most ToS-compliant solution**

**Cons:**
- Security risks (exposes app via HTTP)
- Complex Tauri v2 configuration
- [Known IPC issues](https://github.com/tauri-apps/plugins-workspace/issues/1974) reported
- Official warning: "This plugin brings considerable security risks"

---

### Solution 3: Auto-fallback to yt-dlp

**Concept:** When YouTube embed fails with error 101/150/153, automatically fetch the stream URL via yt-dlp and play in a native HTML5 video element.

**Implementation:**
```typescript
// On YouTube error 153
if (isEmbeddingError(errorCode) && ytDlpAvailable) {
  const streamUrl = await youtubeService.getStreamUrl(videoId);
  // Play via native <video> element instead
}
```

**Pros:**
- Works offline
- Higher quality streams possible
- No external server dependency

**Cons:**
- Requires yt-dlp installed
- Slower startup (needs to fetch stream URL)
- **Clear ToS violation** (see below)

---

## YouTube Terms of Service Analysis

### Official Requirements

From [YouTube API Developer Policies](https://developers.google.com/youtube/terms/developer-policies):

1. **HTTP Referer Requirement:**
   > "API Clients that use the YouTube embedded player must provide identification through the HTTP Referer request header."

2. **Nested Iframe Prohibition:**
   > "You must not situate the YouTube player in a nested or hierarchical iframe lineage to circumvent YouTube policies or otherwise obfuscate the source of use."

3. **Player Integrity:**
   > "You must not modify, build upon, or block any portion or functionality of a YouTube player."

4. **No Separation of Audio/Video:**
   > "You must not separate, isolate, or modify the audio or video components of any YouTube audiovisual content."

From [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality):

5. **Attribution Required:**
   > "Any page displaying YouTube content must make clear to the viewer that YouTube is the source."

6. **Failure to Comply:**
   > "Failure to comply with these requirements might result in reduced functionality in the YouTube embedded player."

### ToS Compliance by Solution

| Solution | ToS Compliant? | Issue |
|----------|---------------|-------|
| **Remote Proxy Page** | **Likely No** | Creates nested iframe hierarchy; may be seen as "circumventing YouTube policies" |
| **tauri-plugin-localhost** | **Yes** | Standard HTTP protocol, proper Referer, no modifications |
| **yt-dlp Fallback** | **No** | Separates/isolates video stream from official YouTube player |

### Detailed Analysis

#### Solution 1: Remote Proxy Page - **RISKY**

The nested iframe prohibition states:
> "situate the YouTube player in a nested or hierarchical iframe lineage to circumvent YouTube policies or otherwise obfuscate the source of use"

The proxy solution creates:
```
Tauri WebView → Proxy iframe (yoursite.com/embed) → YouTube iframe
```

This is a "nested iframe lineage." The key question is **intent**:
- If used to "circumvent YouTube policies" → Violation
- If used to "obfuscate the source of use" → Violation

**Counterargument:** The proxy doesn't hide or modify anything; it simply provides a valid HTTP context. The YouTube player remains fully functional with all branding and controls intact. However, YouTube may not see it this way.

**Risk Level:** Medium-High. YouTube could interpret this as circumvention.

#### Solution 2: tauri-plugin-localhost - **COMPLIANT**

This solution:
- Uses standard HTTP protocol
- Provides valid HTTP Referer header
- No nested iframes
- No player modifications
- YouTube branding intact

This is the most ToS-compliant approach, though it has security and technical tradeoffs.

**Risk Level:** Low. This matches how any standard web app embeds YouTube.

#### Solution 3: yt-dlp Fallback - **VIOLATION**

This clearly violates multiple policies:
- Separates video stream from YouTube player
- Bypasses YouTube's playback infrastructure
- No YouTube branding/attribution in native player
- Blocks YouTube's ability to serve ads

**Risk Level:** High. Clear violation of multiple ToS provisions.

---

## Recommendations

### For Production Apps (ToS Compliance Priority)

Use **Solution 2: tauri-plugin-localhost** despite its complexity:
1. Most ToS-compliant
2. Standard HTTP behavior
3. No external dependencies

Accept the security tradeoffs or implement additional security measures.

### For Personal/Non-Commercial Use

**Solution 3: yt-dlp** works reliably but violates ToS. Acceptable risk for personal karaoke apps not distributed commercially.

### Avoid

**Solution 1: Remote Proxy** - The nested iframe could be flagged by YouTube's automated systems, risking app termination or legal issues.

---

## Implemented Solution (HomeKaraoke)

We implemented **Solution 2: tauri-plugin-localhost** for macOS and Linux only (Windows already uses `http://tauri.localhost` which works).

### Changes Made

**1. Cargo.toml** - Added dependencies:
```toml
tauri-plugin-localhost = "2"
url = "2"
```

**2. src-tauri/src/lib.rs** - Platform-specific localhost server:
```rust
// Port for localhost server (used on macOS/Linux to fix YouTube embed issues)
#[cfg(any(target_os = "macos", target_os = "linux"))]
const LOCALHOST_PORT: u16 = 14200;

pub fn run() {
    let mut context = tauri::generate_context!();

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        use tauri::utils::config::FrontendDist;
        let url_str = format!("http://localhost:{}", LOCALHOST_PORT);
        let url: url::Url = url_str.parse().expect("Invalid localhost URL");
        context.config_mut().build.frontend_dist = Some(FrontendDist::Url(url));
    }

    let mut builder = tauri::Builder::default();

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_localhost::Builder::new(LOCALHOST_PORT).build());
    }

    builder
        .plugin(tauri_plugin_shell::init())
        // ... rest of setup
        .build(context)
        // ...
}
```

### Result

- macOS/Linux: App served at `http://localhost:14200` → YouTube embed works ✓
- Windows: App served at `http://tauri.localhost` → Already worked ✓
- yt-dlp option remains available in Settings → Advanced for users who prefer it

---

## Alternative Approaches (Not Fully Explored)

1. **Native YouTube SDKs** - iOS/Android have official SDKs; desktop doesn't
2. **Electron instead of Tauri** - Electron uses standard HTTP protocol by default
3. **WebView2 on macOS** - Not available; macOS uses WKWebView
4. **Request Tauri fix** - The issue is marked "help wanted" but no timeline

---

## References

- [YouTube API Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service)
- [YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies)
- [Required Minimum Functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
- [Tauri Localhost Plugin](https://v2.tauri.app/plugin/localhost/)
- [Tauri Issue #14422](https://github.com/tauri-apps/tauri/issues/14422)
- [Medium: Working around YouTube iframes](https://medium.com/@kfir.e/working-around-youtube-iframes-on-webview-based-mobile-apps-c8543fb7bd47)
- [YouTube Proxy Gist](https://gist.github.com/kfirprods/89e6abe5da79167d369d015985fa5fc9)

---

## Document History

- **2026-01-04** - Initial research compiled
