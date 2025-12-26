use core_graphics::display::{
    CGDirectDisplayID, CGDisplay, CGGetActiveDisplayList,
};
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::ffi::c_void;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

/// Information about a single display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayInfo {
    pub display_id: u32,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_main: bool,
}

/// A complete display configuration (all connected displays)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DisplayConfiguration {
    pub displays: Vec<DisplayInfo>,
    pub config_hash: String,
}

/// Events emitted by the display watcher
#[derive(Debug, Clone)]
pub enum DisplayEvent {
    ConfigurationChanged(DisplayConfiguration),
}

// FFI declarations for CGDisplayReconfigurationCallback
type CGDisplayReconfigurationCallBack =
    extern "C" fn(display: CGDirectDisplayID, flags: u32, user_info: *mut c_void);

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGDisplayRegisterReconfigurationCallback(
        callback: CGDisplayReconfigurationCallBack,
        user_info: *mut c_void,
    ) -> i32;

    fn CGDisplayRemoveReconfigurationCallback(
        callback: CGDisplayReconfigurationCallBack,
        user_info: *mut c_void,
    ) -> i32;
}

// Display reconfiguration flags
const K_CG_DISPLAY_BEGIN_CONFIGURATION_FLAG: u32 = 1 << 0;
const K_CG_DISPLAY_MOVED_FLAG: u32 = 1 << 1;
const K_CG_DISPLAY_SET_MAIN_FLAG: u32 = 1 << 2;
const K_CG_DISPLAY_SET_MODE_FLAG: u32 = 1 << 3;
const K_CG_DISPLAY_ADD_FLAG: u32 = 1 << 4;
const K_CG_DISPLAY_REMOVE_FLAG: u32 = 1 << 5;
const K_CG_DISPLAY_ENABLED_FLAG: u32 = 1 << 8;
const K_CG_DISPLAY_DISABLED_FLAG: u32 = 1 << 9;

/// Shared state for the callback
struct CallbackState {
    event_tx: Sender<DisplayEvent>,
    last_config_hash: Mutex<String>,
}

/// Global callback state (required for C callback)
///
/// SAFETY: Only one `DisplayWatcherService` instance should exist per process.
/// This is enforced by `AppState` holding a single instance via `Mutex<Option<>>`.
/// If multiple instances are created, the second will overwrite the first's state,
/// causing the first instance's callbacks to route to the second's channel.
///
/// The mutex may become poisoned if a panic occurs while holding the lock.
/// In that case, callbacks will silently skip processing (acceptable for display events).
static CALLBACK_STATE: Mutex<Option<Arc<CallbackState>>> = Mutex::new(None);

/// The callback function called by CoreGraphics when display configuration changes
extern "C" fn display_reconfiguration_callback(
    display: CGDirectDisplayID,
    flags: u32,
    _user_info: *mut c_void,
) {
    // Only process end-of-configuration events
    if flags & K_CG_DISPLAY_BEGIN_CONFIGURATION_FLAG != 0 {
        debug!("Display configuration change starting for display {}", display);
        return;
    }

    let flags_desc = describe_flags(flags);
    debug!(
        "Display configuration change completed for display {}: {}",
        display, flags_desc
    );

    // Only emit events for significant changes (including resolution/mode changes)
    let significant_change = flags
        & (K_CG_DISPLAY_ADD_FLAG
            | K_CG_DISPLAY_REMOVE_FLAG
            | K_CG_DISPLAY_MOVED_FLAG
            | K_CG_DISPLAY_SET_MAIN_FLAG
            | K_CG_DISPLAY_SET_MODE_FLAG
            | K_CG_DISPLAY_ENABLED_FLAG
            | K_CG_DISPLAY_DISABLED_FLAG)
        != 0;

    if !significant_change {
        debug!("Ignoring non-significant display change");
        return;
    }

    // Get the callback state and emit event
    // Use unwrap_or_else to recover from poisoned mutex (panic in another thread)
    let guard = match CALLBACK_STATE.lock() {
        Ok(g) => g,
        Err(poisoned) => {
            warn!("Callback state mutex poisoned, recovering");
            poisoned.into_inner()
        }
    };
    if let Some(ref state) = *guard {
        match get_display_configuration() {
            Ok(config) => {
                // Check if configuration actually changed
                if let Ok(mut last_hash) = state.last_config_hash.lock() {
                    if *last_hash == config.config_hash {
                        debug!("Configuration hash unchanged, skipping event");
                        return;
                    }
                    *last_hash = config.config_hash.clone();
                }

                info!(
                    "Display configuration changed: {} display(s), hash={}",
                    config.displays.len(),
                    &config.config_hash[..8]
                );

                if let Err(e) = state.event_tx.send(DisplayEvent::ConfigurationChanged(config)) {
                    error!("Failed to send display event: {}", e);
                }
            }
            Err(e) => {
                error!("Failed to get display configuration: {}", e);
            }
        }
    }
}

fn describe_flags(flags: u32) -> String {
    let mut parts = Vec::new();
    if flags & K_CG_DISPLAY_ADD_FLAG != 0 {
        parts.push("add");
    }
    if flags & K_CG_DISPLAY_REMOVE_FLAG != 0 {
        parts.push("remove");
    }
    if flags & K_CG_DISPLAY_MOVED_FLAG != 0 {
        parts.push("moved");
    }
    if flags & K_CG_DISPLAY_SET_MAIN_FLAG != 0 {
        parts.push("set_main");
    }
    if flags & K_CG_DISPLAY_SET_MODE_FLAG != 0 {
        parts.push("set_mode");
    }
    if flags & K_CG_DISPLAY_ENABLED_FLAG != 0 {
        parts.push("enabled");
    }
    if flags & K_CG_DISPLAY_DISABLED_FLAG != 0 {
        parts.push("disabled");
    }
    if parts.is_empty() {
        "none".to_string()
    } else {
        parts.join(", ")
    }
}

/// Service that watches for display configuration changes
pub struct DisplayWatcherService {
    _state: Arc<CallbackState>,
}

impl DisplayWatcherService {
    /// Create a new display watcher and register the callback
    pub fn new(event_tx: Sender<DisplayEvent>) -> Result<Self, String> {
        // Get initial configuration
        let initial_config = get_display_configuration()?;
        info!(
            "Initial display configuration: {} display(s), hash={}",
            initial_config.displays.len(),
            &initial_config.config_hash[..8]
        );

        // Create callback state
        let state = Arc::new(CallbackState {
            event_tx,
            last_config_hash: Mutex::new(initial_config.config_hash),
        });

        // Store in global state
        {
            let mut guard = CALLBACK_STATE
                .lock()
                .map_err(|e| format!("Failed to lock callback state: {}", e))?;
            *guard = Some(Arc::clone(&state));
        }

        // Register the callback
        let result = unsafe {
            CGDisplayRegisterReconfigurationCallback(
                display_reconfiguration_callback,
                std::ptr::null_mut(),
            )
        };

        if result != 0 {
            // Clean up state on failure
            if let Ok(mut guard) = CALLBACK_STATE.lock() {
                *guard = None;
            }
            return Err(format!(
                "Failed to register display reconfiguration callback: error {}",
                result
            ));
        }

        info!("Display watcher initialized successfully");
        Ok(Self { _state: state })
    }
}

impl Drop for DisplayWatcherService {
    fn drop(&mut self) {
        debug!("Dropping DisplayWatcherService, removing callback");

        // Unregister the callback
        let result = unsafe {
            CGDisplayRemoveReconfigurationCallback(
                display_reconfiguration_callback,
                std::ptr::null_mut(),
            )
        };

        if result != 0 {
            warn!(
                "Failed to remove display reconfiguration callback: error {}",
                result
            );
        }

        // Clear global state
        if let Ok(mut guard) = CALLBACK_STATE.lock() {
            *guard = None;
        }

        info!("Display watcher shut down");
    }
}

/// Get the current display configuration
pub fn get_display_configuration() -> Result<DisplayConfiguration, String> {
    let displays = get_active_displays()?;
    let config_hash = compute_config_hash(&displays);

    Ok(DisplayConfiguration {
        displays,
        config_hash,
    })
}

/// Get all active displays
pub fn get_active_displays() -> Result<Vec<DisplayInfo>, String> {
    // First, get the count of displays
    let mut display_count: u32 = 0;
    let result = unsafe { CGGetActiveDisplayList(0, std::ptr::null_mut(), &mut display_count) };

    if result != 0 {
        return Err(format!("Failed to get display count: error {}", result));
    }

    if display_count == 0 {
        return Ok(Vec::new());
    }

    // Allocate buffer and get display IDs
    let mut display_ids: Vec<CGDirectDisplayID> = vec![0; display_count as usize];
    let result = unsafe {
        CGGetActiveDisplayList(display_count, display_ids.as_mut_ptr(), &mut display_count)
    };

    if result != 0 {
        return Err(format!("Failed to get display list: error {}", result));
    }

    // Get main display ID
    let main_display_id = CGDisplay::main().id;

    // Convert to DisplayInfo
    let mut displays: Vec<DisplayInfo> = display_ids
        .iter()
        .filter_map(|&id| {
            let display = CGDisplay::new(id);
            let bounds = display.bounds();

            Some(DisplayInfo {
                display_id: id,
                name: get_display_name(id),
                x: bounds.origin.x as i32,
                y: bounds.origin.y as i32,
                width: bounds.size.width as u32,
                height: bounds.size.height as u32,
                is_main: id == main_display_id,
            })
        })
        .collect();

    // Sort by display ID for consistent hashing
    displays.sort_by_key(|d| d.display_id);

    Ok(displays)
}

/// Get a human-readable name for a display
fn get_display_name(display_id: CGDirectDisplayID) -> String {
    // CGDisplay doesn't provide a direct way to get display names in the core-graphics crate
    // We'll use a combination of display properties to create a meaningful name
    let display = CGDisplay::new(display_id);

    if display.is_builtin() {
        return "Built-in Display".to_string();
    }

    // For external displays, we'll include the resolution in the name
    let bounds = display.bounds();
    let width = bounds.size.width as u32;
    let height = bounds.size.height as u32;

    format!("Display {} ({}x{})", display_id, width, height)
}

/// Compute a hash of the display configuration for identification
///
/// Includes display IDs, positions, sizes, and is_main flag to ensure
/// different arrangements of the same displays produce different hashes.
pub fn compute_config_hash(displays: &[DisplayInfo]) -> String {
    let mut hasher = Sha256::new();

    // Clone and sort by display ID for consistent hashing
    let mut sorted_displays = displays.to_vec();
    sorted_displays.sort_by_key(|d| d.display_id);

    for display in sorted_displays {
        // Include all properties that define a unique configuration
        hasher.update(display.display_id.to_le_bytes());
        hasher.update(display.x.to_le_bytes());
        hasher.update(display.y.to_le_bytes());
        hasher.update(display.width.to_le_bytes());
        hasher.update(display.height.to_le_bytes());
        hasher.update(&[display.is_main as u8]);
    }

    let result = hasher.finalize();
    hex::encode(result)
}

// Simple hex encoding without additional dependency
mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        bytes
            .as_ref()
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_config_hash() {
        let displays = vec![
            DisplayInfo {
                display_id: 1,
                name: "Display 1".to_string(),
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                is_main: true,
            },
            DisplayInfo {
                display_id: 2,
                name: "Display 2".to_string(),
                x: 1920,
                y: 0,
                width: 1920,
                height: 1080,
                is_main: false,
            },
        ];

        let hash1 = compute_config_hash(&displays);
        let hash2 = compute_config_hash(&displays);
        assert_eq!(hash1, hash2);

        // Hash should be different with different displays
        let displays2 = vec![DisplayInfo {
            display_id: 3,
            name: "Display 3".to_string(),
            x: 0,
            y: 0,
            width: 2560,
            height: 1440,
            is_main: true,
        }];
        let hash3 = compute_config_hash(&displays2);
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_hash_is_order_independent() {
        let displays1 = vec![
            DisplayInfo {
                display_id: 1,
                name: "Display 1".to_string(),
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                is_main: true,
            },
            DisplayInfo {
                display_id: 2,
                name: "Display 2".to_string(),
                x: 1920,
                y: 0,
                width: 1920,
                height: 1080,
                is_main: false,
            },
        ];

        let displays2 = vec![
            DisplayInfo {
                display_id: 2,
                name: "Display 2".to_string(),
                x: 1920,
                y: 0,
                width: 1920,
                height: 1080,
                is_main: false,
            },
            DisplayInfo {
                display_id: 1,
                name: "Display 1".to_string(),
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                is_main: true,
            },
        ];

        assert_eq!(compute_config_hash(&displays1), compute_config_hash(&displays2));
    }

    #[test]
    fn test_hash_changes_with_position() {
        // Same displays but in different positions should produce different hashes
        let displays1 = vec![
            DisplayInfo {
                display_id: 1,
                name: "Display 1".to_string(),
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
                is_main: true,
            },
            DisplayInfo {
                display_id: 2,
                name: "Display 2".to_string(),
                x: 1920, // Display 2 on the right
                y: 0,
                width: 1920,
                height: 1080,
                is_main: false,
            },
        ];

        let displays2 = vec![
            DisplayInfo {
                display_id: 1,
                name: "Display 1".to_string(),
                x: 1920, // Display 1 on the right (swapped positions)
                y: 0,
                width: 1920,
                height: 1080,
                is_main: true,
            },
            DisplayInfo {
                display_id: 2,
                name: "Display 2".to_string(),
                x: 0, // Display 2 on the left
                y: 0,
                width: 1920,
                height: 1080,
                is_main: false,
            },
        ];

        // Hashes should be different because positions changed
        assert_ne!(compute_config_hash(&displays1), compute_config_hash(&displays2));
    }

    #[test]
    fn test_hash_changes_with_resolution() {
        let displays1 = vec![DisplayInfo {
            display_id: 1,
            name: "Display 1".to_string(),
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
            is_main: true,
        }];

        let displays2 = vec![DisplayInfo {
            display_id: 1,
            name: "Display 1".to_string(),
            x: 0,
            y: 0,
            width: 2560, // Different resolution
            height: 1440,
            is_main: true,
        }];

        // Hashes should be different because resolution changed
        assert_ne!(compute_config_hash(&displays1), compute_config_hash(&displays2));
    }
}
