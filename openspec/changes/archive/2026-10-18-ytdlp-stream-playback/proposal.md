## Why

YouTube no longer serves muxed (video+audio) formats to yt-dlp's default clients. The format selector in `YtDlpService::get_stream_url` only accepts a muxed format, so every stream fetch fails with "Requested format is not available" and the app shows "Failed to switch to yt-dlp mode". yt-dlp mode is unusable. The `android_vr` client still lists format 18, but its URLs return 403 without a GVS PO token. Separate video-only and audio-only HTTPS (DASH) URLs work.

## What Changes

- On macOS, `get_stream_url` first asks yt-dlp for YouTube's HLS master manifest (`bv*[protocol=m3u8_native]`, `%(manifest_url)s`). WebKit plays HLS natively; the manifest carries video and audio together and playback starts in ~4 s. Video-only DASH files took AVFoundation ~45 s to open (measured on a 77 MB 1080p file). Falls back to the selector below when no manifest is available.
- Format selector keeps preferring a muxed MP4, then falls back to separate H.264 video + M4A audio (HTTPS only, no HLS).
- `StreamInfo` gains an optional `audio_url`; set when the selection returned two URLs.
- `Video` gains `audioStreamUrl`; it travels with `streamUrl` through the prefetch cache, retries, reloads, and the detached-window state sync.
- On other platforms (WebKitGTK, WebView2: no native HLS), `NativePlayer` takes an optional `audioUrl`. When present it plays the audio in a hidden `<audio>` element slaved to the `<video>`: play, pause, seek, volume/mute, buffering stalls, and drift correction. Split-stream playback starts from `loadedmetadata`, because WebKit does not buffer these files until `play()` is called.

## Impact

- Rust: `src-tauri/src/services/ytdlp.rs`.
- Frontend: `src/types/youtube.ts`, `src/stores/playerStore.ts`, `src/stores/displayStore.ts`, `src/services/windowManager.ts`, `src/App.tsx`, `src/components/player/{NativePlayer,VideoPlayer,PlayerControls,DetachedPlayer}.tsx`.
- Out of scope: PO-token providers, cookies, MSE-based muxing, YouTube embed mode.
