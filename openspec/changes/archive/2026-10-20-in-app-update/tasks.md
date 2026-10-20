## 1. Backend
- [x] 1.1 Add `tauri-plugin-updater`, register it, configure `plugins.updater` (pubkey, endpoint)
- [x] 1.2 `update_check` returns `can_install`
- [x] 1.3 `update_install` and `update_restart` commands

## 2. Frontend
- [x] 2.1 `updateService.install()` / `restart()`
- [x] 2.2 Notification action: Install & restart on macOS, Download elsewhere, Download on install failure
- [x] 2.3 Same choice in Settings → About
- [x] 2.4 Tests

## 3. Release
- [x] 3.1 Verify signing secrets early in the macOS job
- [x] 3.2 Staple, pack, sign and upload `.app.tar.gz` + `.sig` per architecture
- [x] 3.3 Build and upload `latest.json` in `publish-release`
- [x] 3.4 Document the signing key in `plan/deployment.md`
