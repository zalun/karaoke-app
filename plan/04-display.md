# Phase 4: Multi-window and Display Detection

**Status:** Complete

**Result:** Can detach video to projector, application remembers display configurations

## Completed Tasks

- [x] Detachable video window (Tauri WebviewWindow)
- [x] Display Watcher - listen for display hotplug (CGDisplayRegisterReconfigurationCallback)
- [x] `display_configs` table - save display configurations
- [x] Logic for recognizing known configuration (config_hash)
- [x] Dialog "Detected [display]. Restore layout?" with "Remember" checkbox
- [x] Automatic layout restoration when `auto_apply=true`
- [x] Window bounds validation (prevent off-screen positioning)
- [x] Retina display support (physical pixels)

## Remaining Tasks

- [ ] Menu: "Manage display configurations..." (list, edit description, toggle auto_apply, delete)
- [ ] Menu: "Detach video to display...", "Reset to single window"

## Tauri Commands

```rust
// Display Configuration
display_get_current_config() -> DisplayConfig
display_get_saved_configs() -> Vec<DisplayConfig>
display_set_auto_apply(config_id, bool) -> ()
display_update_description(config_id, desc) -> ()
display_delete_config(config_id) -> ()

// Window Management
window_save_state() -> ()
window_restore_state() -> ()
window_reset_to_single() -> ()
```

## Key Components

### Backend

**Display Watcher Service** (`src-tauri/src/services/display_watcher.rs`):
- Uses `CGDisplayRegisterReconfigurationCallback` for real-time detection
- Computes `config_hash` from sorted display ID list
- Emits `display:config-changed` events

### Frontend

- `DisplayRestoreDialog` - Prompts user when known configuration detected
- `displayStore.ts` - Display configuration state
- `displayManager.ts` - Display configuration service wrapper
- `windowManager.ts` - Window positioning/sizing utilities

## Technical Details

### Config Hash

Display configurations are identified by a hash of the sorted display ID list. This allows the app to recognize when the same set of displays is connected, even if they were connected in a different order.

### Window State Persistence

Window positions are stored per display configuration in the `window_state` table, linked by `display_config_id`. When a known configuration is detected, the app can restore the exact window layout.

### Retina Support

Window coordinates use physical pixels on Retina displays. The app accounts for the scale factor when saving and restoring window positions.
