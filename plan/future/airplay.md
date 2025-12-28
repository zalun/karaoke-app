# Feature: AirPlay Integration

## Summary

Add an AirPlay button to the player controls, allowing users to easily stream the video to Apple TV without manually navigating macOS settings.

## User Stories

1. As a host, I want to quickly stream karaoke videos to my TV via Apple TV
2. As a host, I want a dedicated button instead of hunting through system menus
3. As a user, I want visual feedback showing when AirPlay is active

## Current Workaround

Users can already use AirPlay via:
1. Click **Detach** to pop out the video window
2. Use macOS **Screen Mirroring** (menu bar) to send to Apple TV

## Architecture Options

### Option A: Open System Preferences (Simple)

Add a button that opens macOS Display/AirPlay settings.

**Pros:** Simple to implement, no native code
**Cons:** Extra steps for user, leaves the app

### Option B: Native AirPlay Picker (Recommended)

Invoke macOS native `AVRoutePickerView` to show AirPlay device picker inline.

**Pros:** Native experience, stays in app, shows available devices
**Cons:** Requires Rust/Swift bridging, more complex

### Option C: Detect & Display Status Only

Don't control AirPlay, but detect when it's active and show indicator.

**Pros:** Simpler than Option B
**Cons:** Doesn't help user initiate AirPlay

## Recommended: Option B (Native AirPlay Picker)

Best user experience, consistent with how other media apps work.

## Implementation

### Backend (Rust + Swift Bridge)

**New Swift file** (`src-tauri/src/swift/airplay.swift`):
```swift
import AVKit
import AppKit

@_cdecl("show_airplay_picker")
func showAirPlayPicker(windowPtr: UnsafeMutableRawPointer) {
    // Create AVRoutePickerView and display as popover
    let routePicker = AVRoutePickerView()
    routePicker.isRoutePickerButtonBordered = false
    // Position near the button that triggered it
    // ...
}

@_cdecl("is_airplay_active")
func isAirPlayActive() -> Bool {
    // Check if external display is AirPlay
    // ...
}
```

**Tauri Commands:**
```rust
#[tauri::command]
fn show_airplay_picker(window: Window) -> Result<(), String>

#[tauri::command]
fn is_airplay_active() -> bool
```

### Frontend

**Button placement:** Next to the Detach button in PlayerControls

```tsx
<Button
  onClick={handleAirPlay}
  title="AirPlay to Apple TV"
>
  <AirPlayIcon />
</Button>
```

**Visual states:**
- Default: AirPlay icon (outline)
- Active: AirPlay icon (filled/blue) when streaming
- Hover: Tooltip "Stream to Apple TV"

### Dependencies

```toml
# Cargo.toml - may need swift-rs or similar for bridging
swift-rs = "1.0"
```

Build configuration may need Xcode/Swift toolchain integration.

## UI Mockup

```
PlayerControls with AirPlay button:
┌─────────────────────────────────────────────────────────────┐
│  [⏮] [⏯] [⏭]  ────●──────────  3:42 / 5:15  [📺] [⇱] [🔊] │
└─────────────────────────────────────────────────────────────┘
                                                    ↑
                                              AirPlay button

When clicked, native macOS AirPlay picker appears:
┌─────────────────────┐
│ AirPlay To:         │
│ ○ Living Room TV    │
│ ○ Bedroom Apple TV  │
│ ○ Mirror Display    │
└─────────────────────┘
```

## Complexity Assessment

- **Difficulty:** Medium-High
- **Main challenge:** Swift/Rust bridging for native macOS APIs
- **Alternative:** Start with Option A (open System Preferences), upgrade to Option B later

## Edge Cases

1. **No AirPlay devices available** - Show disabled button or message
2. **AirPlay disconnects mid-song** - Detect and notify user
3. **Multiple displays** - User may want to extend vs mirror

## Future Enhancements

- Remember last used AirPlay device
- Auto-connect option at session start
- Audio-only AirPlay option
- AirPlay 2 multi-room audio support
