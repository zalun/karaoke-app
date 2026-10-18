## 1. Backend
- [x] 1.1 Selector with muxed → split H.264+M4A fallback; parse one or two URLs into `StreamInfo { url, audio_url }`
- [x] 1.2 Unit test for URL parsing
- [x] 1.3 macOS: HLS master manifest first, direct streams as fallback

## 2. Frontend
- [x] 2.1 `StreamInfo.audio_url`, `Video.audioStreamUrl`, prefetch cache carries both URLs
- [x] 2.2 Every stream fetch site sets both URLs; detached-window state includes `audioStreamUrl`
- [x] 2.3 `NativePlayer` slaved `<audio>` with sync (play/pause/seek/volume/stall/drift)
- [x] 2.4 Start split streams on loadedmetadata (WebKit does not buffer them before play())
- [x] 2.5 Unit tests

## 3. Verify
- [x] 3.1 `just check`, `just test`, live playback in the app (main and detached window)
