# ytdlp-playback Specification

## Purpose
How the app plays YouTube videos in yt-dlp mode now that YouTube no longer serves muxed formats: HLS on macOS, synced separate video and audio streams elsewhere.
## Requirements
### Requirement: Play YouTube videos from HLS on macOS
On macOS the app SHALL play yt-dlp videos from YouTube's HLS master manifest, which carries video and audio together.

#### Scenario: HLS manifest available
- **WHEN** yt-dlp returns an HLS manifest URL for a video on macOS
- **THEN** the stream info carries that single URL and no audio URL, and the native player plays it

#### Scenario: No HLS manifest
- **WHEN** yt-dlp returns no HLS manifest on macOS
- **THEN** the app falls back to direct (muxed or split) streams

### Requirement: Play YouTube videos with separate video and audio streams
When yt-dlp returns no muxed format, the app SHALL play the video-only and audio-only streams together, kept in sync.

#### Scenario: Only separate streams are available
- **WHEN** yt-dlp selects a video-only format and an audio-only format for a video
- **THEN** the stream info carries both URLs and the native player plays the video with the audio track in sync

#### Scenario: A muxed format is available
- **WHEN** yt-dlp selects a muxed format
- **THEN** the stream info carries a single URL and no audio URL, and playback works as before

#### Scenario: User controls playback
- **WHEN** the user pauses, resumes, seeks, mutes, or changes volume during split-stream playback
- **THEN** the audio follows the video, and drift beyond a small threshold is corrected

