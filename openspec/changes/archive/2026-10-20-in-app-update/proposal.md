## Why

Updating HomeKaraoke means leaving the app, downloading a DMG from GitHub and dragging it over the old copy. Users on an old version keep running it, and the update notification's only action is a link to the release page. On macOS, where releases are already signed and notarized in CI, the app can download, verify and install the new version itself and restart into it.

## What Changes

- Add `tauri-plugin-updater`, configured with a minisign public key and the endpoint `https://github.com/zalun/karaoke-app/releases/latest/download/latest.json`.
- `update_check` reports whether the running platform can install in-app (`can_install`, macOS only).
- New commands `update_install` (download, verify signature, replace the app bundle) and `update_restart` (restart the app).
- The "Update available" notification on macOS offers **Install & restart**; on Windows and Linux it keeps the **Download** link to the release page. If an in-app install fails, the user gets an error with the Download link instead.
- The release workflow, per macOS architecture, staples the notarization ticket to the `.app`, packs it as `HomeKaraoke_<version>_<arch>.app.tar.gz`, signs it with `TAURI_SIGNING_PRIVATE_KEY` and uploads archive and `.sig`. `publish-release` builds `latest.json` (platforms `darwin-aarch64`, `darwin-x86_64`) from the uploaded signatures before publishing, so `releases/latest` only ever points at a complete set.

## Non-goals

- In-app install on Windows and Linux.
- Background or automatic installs without a click.
- Download progress UI beyond a "Downloading update…" notification.

## Capabilities

### New Capabilities
- `in-app-update`: detecting, installing and restarting into a new release from inside the app.

## Impact

- `src-tauri`: new dependency `tauri-plugin-updater`, `plugins.updater` in `tauri.conf.json`, commands in `commands/update.rs`.
- Frontend: `services/update.ts`, `stores/updateStore.ts`, About settings.
- `.github/workflows/release.yml`: updater archive, signature and `latest.json`; new secrets `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- Losing the private key means installed apps can no longer verify updates; the key needs a backup outside GitHub.
- The first in-app update is from the first release that contains this change to the one after it.
