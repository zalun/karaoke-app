# HomeKaraoke

A home karaoke application for macOS built with Tauri 2.0 and React.

**Official website:** [https://homekaraoke.app](https://homekaraoke.app)

![HomeKaraoke Screenshot](screenshots/app-screenshot.png)

## Features

- **YouTube Integration** - Search and stream karaoke videos directly from YouTube
- **Local Library** - Download and manage your karaoke video collection
- **Queue System** - Build playlists with drag-and-drop reordering
- **USB Drive Import** - Automatically detect and import videos from USB drives
- **Multi-Display Support** - Detach video window to a secondary display/projector
- **Display Memory** - Remembers window layouts for different display configurations

## Installation

Download the latest release from the [Releases page](https://github.com/zalun/karaoke-app/releases/latest):

- **Apple Silicon (M1/M2/M3):** `HomeKaraoke_x.x.x_aarch64.dmg`
- **Intel Macs:** `HomeKaraoke_x.x.x_x64.dmg`

### Steps
1. Download the `.dmg` file for your Mac architecture
2. Open the `.dmg` and drag HomeKaraoke to your Applications folder
3. On first launch, right-click the app and select "Open" (required for unsigned apps)
4. The app will prompt to install `yt-dlp` if not already installed

> **Note:** The app is not code-signed, so macOS will show a warning on first launch. This is expected for open-source apps without an Apple Developer certificate.

## Technology Stack

- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Rust (Tauri 2.0)
- **Database:** SQLite
- **Video:** yt-dlp

## Requirements

- macOS (Apple Silicon or Intel)

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
