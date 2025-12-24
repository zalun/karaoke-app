# Karaoke App

A home karaoke application for macOS built with Tauri 2.0 and React.

## Features

- **YouTube Integration** - Search and stream karaoke videos directly from YouTube
- **Local Library** - Download and manage your karaoke video collection
- **Queue System** - Build playlists with drag-and-drop reordering
- **USB Drive Import** - Automatically detect and import videos from USB drives
- **Multi-Display Support** - Detach video window to a secondary display/projector
- **Display Memory** - Remembers window layouts for different display configurations

## Technology Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Rust (Tauri 2.0)
- **Database:** SQLite
- **Video:** yt-dlp

## Status

This project is currently in development. See [PLAN.md](PLAN.md) for the implementation roadmap.

## Requirements

- macOS (primary target platform)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed and available in PATH

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

## Disclaimer

This software is provided for **personal, non-commercial use only**.

Users are solely responsible for:
- Complying with applicable copyright laws in their jurisdiction
- Respecting platform terms of service (including YouTube's Terms of Service)
- Ensuring they have the right to download or stream any content

The developers of this application do not condone or encourage copyright infringement. This tool is intended for use with:
- Content you own or have created
- Public domain content
- Content licensed under Creative Commons or similar licenses
- Content where you have explicit permission from the copyright holder

**By using this software, you agree to take full responsibility for how you use it.**

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

Contributions are welcome! Please read the contribution guidelines before submitting a pull request.
