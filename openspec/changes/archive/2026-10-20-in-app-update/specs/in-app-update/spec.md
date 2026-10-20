## ADDED Requirements

### Requirement: Platform-specific update action
The update notification SHALL offer an in-app install on macOS and a link to the release page on other platforms.

#### Scenario: Update available on macOS
- **WHEN** a newer release is found on macOS
- **THEN** the notification shows "Update available: <version>" with an **Install & restart** action

#### Scenario: Update available on Windows or Linux
- **WHEN** a newer release is found on Windows or Linux
- **THEN** the notification shows a **Download** action that opens the GitHub release page

### Requirement: In-app install and restart
On macOS the app SHALL download the update from the updater endpoint, verify its minisign signature against the bundled public key, replace the app bundle and restart.

#### Scenario: Successful install
- **WHEN** the user clicks **Install & restart**
- **THEN** the app shows "Downloading update…", installs the verified bundle and restarts into the new version

#### Scenario: Install fails
- **WHEN** the download, signature check or install fails, or the endpoint has no update for this platform
- **THEN** the app shows an error notification with a **Download** action to the release page and keeps running the current version

#### Scenario: Repeated click while installing
- **WHEN** an install is already in progress
- **THEN** another click does not start a second install

### Requirement: Release publishes a complete updater manifest
The release workflow SHALL publish `latest.json` only together with signed macOS archives for both architectures.

#### Scenario: Both macOS builds succeed
- **WHEN** both macOS jobs uploaded their `.app.tar.gz` and `.sig`
- **THEN** `publish-release` uploads `latest.json` with `darwin-aarch64` and `darwin-x86_64` entries pointing at those archives before publishing the release

#### Scenario: Signing key missing
- **WHEN** `TAURI_SIGNING_PRIVATE_KEY` is not set
- **THEN** the macOS job fails before building, instead of publishing a release without updater artifacts
