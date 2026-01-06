# Deployment Guide

This document describes how to build, sign, notarize, and release the HomeKaraoke app.

## Overview

Releases are built via GitHub Actions (`.github/workflows/release.yml`) when a version tag is pushed. The workflow:

1. Builds for Apple Silicon (arm64) and Intel (x64)
2. Signs with Developer ID certificate
3. Uploads signed DMG immediately (users can download right away)
4. Submits for Apple notarization (may take minutes to hours)
5. If notarization succeeds, replaces DMG with notarized version

## Creating a Release

### 1. Update Version

Update version in **all three files**:

- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/tauri.conf.json`

### 2. Update Changelog

Add entry to `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/) format.

### 3. Commit and Push

```bash
git add -A
git commit -m "Bump version to X.Y.Z"
git push origin main
```

### 4. Create and Push Tag

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

### 5. Monitor Release

Watch the workflow: https://github.com/zalun/karaoke-app/actions

The release will appear at: https://github.com/zalun/karaoke-app/releases

## Local Build Script

The GitHub CI/CD workflow produces functional DMGs, but the locally-built DMG has a nicer appearance (custom background, icon arrangement). Use the `scripts/build-and-release.sh` script to build, notarize, and upload a polished DMG.

### Prerequisites

1. Apple Developer credentials configured as environment variables
2. GitHub CLI (`gh`) authenticated
3. Git tag already pushed (the script uploads to an existing release)

### Usage

```bash
# Set required environment variables
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"  # App-specific password
export APPLE_TEAM_ID="DCXDSQYXM7"

# Run the build script
./scripts/build-and-release.sh v0.6.4
```

### What the Script Does

1. Validates version format (vX.Y.Z)
2. Detects architecture (Apple Silicon or Intel)
3. Builds the app with `npm run tauri build`
4. Verifies the DMG was created
5. Submits to Apple for notarization (waits for completion)
6. Staples the notarization ticket to the DMG
7. Creates the GitHub release if it doesn't exist
8. Uploads the notarized DMG to the release

### Workflow: Replacing CI Build with Local Build

After CI creates a release with its DMG:

```bash
# 1. Build and upload the nicer local DMG
./scripts/build-and-release.sh v0.6.4

# The script automatically replaces the existing DMG asset
```

## Apple Notarization

### Quick Reference: Local Notarization Commands

```bash
# 1. Set credentials (get app-specific password from appleid.apple.com)
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="DCXDSQYXM7"

# 2. Build WITHOUT notarization (to get a signed DMG fast)
unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID
npm run tauri build

# 3. Submit DMG for notarization (can take minutes to 8+ hours)
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="DCXDSQYXM7"

xcrun notarytool submit src-tauri/target/release/bundle/dmg/HomeKaraoke_*.dmg \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

# 4. Staple the notarization ticket to the DMG
xcrun stapler staple src-tauri/target/release/bundle/dmg/HomeKaraoke_*.dmg

# 5. Verify notarization
xcrun stapler validate src-tauri/target/release/bundle/dmg/HomeKaraoke_*.dmg

# 6. Upload to GitHub release
gh release upload vX.Y.Z src-tauri/target/release/bundle/dmg/HomeKaraoke_*.dmg --clobber
```

### Understanding Notarization

- **Signed apps**: Work on macOS but show a warning. Users must right-click → Open on first launch.
- **Notarized apps**: No warning, opens normally. Apple has scanned and approved the app.

### Notarization Timing

Apple's notarization service is unpredictable:
- Sometimes completes in 5-15 minutes
- Sometimes takes 1-8+ hours
- No way to predict or speed up

The CI workflow submits for notarization with a 30-minute timeout. If it times out, the signed DMG is still available.

### Manual Notarization (Local)

If CI notarization fails or times out, you can notarize locally:

#### Option A: Notarize DMG Directly (Recommended)

```bash
# Set credentials
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="app-specific-password"  # From appleid.apple.com
export APPLE_TEAM_ID="DCXDSQYXM7"

# Submit for notarization (can take hours)
xcrun notarytool submit path/to/HomeKaraoke_X.Y.Z_aarch64.dmg \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait

# Once complete, staple the ticket
xcrun stapler staple path/to/HomeKaraoke_X.Y.Z_aarch64.dmg

# Upload to release
gh release upload vX.Y.Z path/to/HomeKaraoke_X.Y.Z_aarch64.dmg --clobber
```

#### Option B: Build with Notarization

```bash
# Set credentials before building
export APPLE_ID="your@email.com"
export APPLE_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="DCXDSQYXM7"

# Build (will sign and notarize automatically)
npm run tauri build

# This can take hours waiting for Apple
```

### Checking Notarization Status

```bash
# Check submission history
xcrun notarytool history \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID"

# Check specific submission
xcrun notarytool info <submission-id> \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID"
```

### Verifying Notarization

```bash
# Check if app/DMG is notarized
xcrun stapler validate path/to/HomeKaraoke.app
xcrun stapler validate path/to/HomeKaraoke_X.Y.Z_aarch64.dmg

# Check signature and notarization
spctl --assess --verbose path/to/HomeKaraoke.app
```

## Code Signing

### Required Secrets (GitHub)

Configure these in repository Settings → Secrets:

| Secret | Description |
|--------|-------------|
| `APPLE_CERTIFICATE` | Base64-encoded .p12 certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the .p12 file |
| `APPLE_ID` | Apple Developer email |
| `APPLE_PASSWORD` | App-specific password (not Apple ID password) |
| `APPLE_TEAM_ID` | Team ID (e.g., DCXDSQYXM7) |

### Getting an App-Specific Password

1. Go to https://appleid.apple.com
2. Sign in → Security → App-Specific Passwords
3. Generate a new password for "HomeKaraoke Notarization"

### Local Signing Identity

The app uses: `Developer ID Application: Piotr Zalewa (DCXDSQYXM7)`

This must be installed in your Keychain for local builds.

## Troubleshooting

### "The Internet connection appears to be offline" during notarization

This usually means the notarization request timed out. Apple's servers may be slow. Options:
- Wait and retry later
- Notarize locally where you can wait longer

### Notarization taking too long

Apple's notarization service is unpredictable. If CI times out:
1. Download the signed DMG from the release
2. Notarize it locally (can run overnight)
3. Staple and re-upload

### "Record not found" when stapling

You're trying to staple something that wasn't notarized, or the wrong file. Make sure you notarize the same file you're trying to staple.

### App re-signed, notarization lost

If you rebuild after notarizing, the new signature invalidates the notarization. Always notarize the **final** DMG, not intermediate builds.

## Build Targets

| Target | Architecture | For |
|--------|--------------|-----|
| `aarch64-apple-darwin` | arm64 | Apple Silicon (M1/M2/M3/M4) |
| `x86_64-apple-darwin` | x64 | Intel Macs |

### Building for Specific Target

```bash
# Apple Silicon
npm run tauri build -- --target aarch64-apple-darwin

# Intel
npm run tauri build -- --target x86_64-apple-darwin
```

## Output Locations

After building:

- **App bundle**: `src-tauri/target/release/bundle/macos/HomeKaraoke.app`
- **DMG**: `src-tauri/target/release/bundle/dmg/HomeKaraoke_X.Y.Z_<arch>.dmg`

For cross-compilation:

- `src-tauri/target/aarch64-apple-darwin/release/bundle/...`
- `src-tauri/target/x86_64-apple-darwin/release/bundle/...`
