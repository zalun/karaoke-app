#!/bin/bash
set -e
trap 'echo "Error at line $LINENO"' ERR

# Build, sign, notarize, and upload to GitHub release
#
# Required environment variables:
#   APPLE_ID        - Apple Developer email
#   APPLE_PASSWORD  - App-specific password from appleid.apple.com
#   APPLE_TEAM_ID   - Team ID (e.g., DCXDSQYXM7)
#
# Usage:
#   ./scripts/build-and-release.sh v0.6.3

VERSION="$1"

if [ -z "$VERSION" ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 v0.6.3"
    exit 1
fi

# Validate version format
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Invalid version format. Expected vX.Y.Z (e.g., v0.6.3)"
    exit 1
fi

# Strip 'v' prefix for filename matching
VERSION_NUM="${VERSION#v}"

# Detect architecture (default to Apple Silicon)
ARCH=$(uname -m)
if [ "$ARCH" = "arm64" ] || [ "$ARCH" = "aarch64" ]; then
    ARCH="aarch64"
elif [ "$ARCH" = "x86_64" ]; then
    ARCH="x86_64"
else
    # Default to Apple Silicon for unknown architectures
    ARCH="aarch64"
fi

# Check required environment variables
if [ -z "$APPLE_ID" ]; then
    echo "Error: APPLE_ID environment variable not set"
    exit 1
fi

if [ -z "$APPLE_PASSWORD" ]; then
    echo "Error: APPLE_PASSWORD environment variable not set"
    exit 1
fi

if [ -z "$APPLE_TEAM_ID" ]; then
    echo "Error: APPLE_TEAM_ID environment variable not set"
    exit 1
fi

DMG_NAME="HomeKaraoke_${VERSION_NUM}_${ARCH}.dmg"
DMG_PATH="src-tauri/target/release/bundle/dmg/${DMG_NAME}"

echo "==> Building HomeKaraoke ${VERSION}..."
npm run tauri build

echo "==> Notarizing DMG..."
xcrun notarytool submit "$DMG_PATH" \
    --apple-id "$APPLE_ID" \
    --password "$APPLE_PASSWORD" \
    --team-id "$APPLE_TEAM_ID" \
    --wait

echo "==> Stapling notarization ticket..."
xcrun stapler staple "$DMG_PATH"

echo "==> Validating notarization..."
xcrun stapler validate "$DMG_PATH"

echo "==> Deleting existing ${DMG_NAME} from release ${VERSION}..."
gh release delete-asset "$VERSION" "$DMG_NAME" --yes 2>/dev/null || echo "No existing asset to delete"

echo "==> Uploading ${DMG_NAME} to release ${VERSION}..."
gh release upload "$VERSION" "$DMG_PATH"

echo "==> Done! Release ${VERSION} updated with notarized DMG"
echo "    https://github.com/zalun/karaoke-app/releases/tag/${VERSION}"
