mod commands;
mod db;
mod services;

use chrono::Datelike;
use db::Database;
use log::{debug, info, warn};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

#[cfg(target_os = "macos")]
use services::{DisplayEvent, DisplayWatcherService};
#[cfg(any(target_os = "macos", target_os = "linux"))]
use services::MediaControlsService;
#[cfg(any(target_os = "macos", target_os = "linux"))]
use souvlaki::MediaControlEvent;
#[cfg(any(target_os = "macos", target_os = "linux"))]
use std::sync::mpsc;
#[cfg(any(target_os = "macos", target_os = "linux"))]
use std::thread::JoinHandle;
#[cfg(any(target_os = "macos", target_os = "linux"))]
use std::time::Duration;
use tauri::menu::{AboutMetadata, CheckMenuItem, Menu, MenuItemKind, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_shell::ShellExt;

pub struct AppState {
    pub db: Mutex<Database>,
    pub keep_awake: Mutex<Option<keepawake::KeepAwake>>,
    pub debug_mode: AtomicBool,
    pub log_dir: std::path::PathBuf,
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    pub media_controls: Mutex<Option<MediaControlsService>>,
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    pub media_event_rx: Mutex<Option<mpsc::Receiver<MediaControlEvent>>>,
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    pub media_event_thread: Mutex<Option<JoinHandle<()>>>,
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    pub shutdown_flag: Arc<AtomicBool>,
    #[cfg(target_os = "macos")]
    pub display_watcher: Mutex<Option<DisplayWatcherService>>,
    #[cfg(target_os = "macos")]
    pub display_event_rx: Mutex<Option<mpsc::Receiver<DisplayEvent>>>,
    #[cfg(target_os = "macos")]
    pub display_event_thread: Mutex<Option<JoinHandle<()>>>,
}

const DEBUG_MODE_MENU_ID: &str = "debug-mode";
const OPEN_LOGS_MENU_ID: &str = "open-logs";
const SAVE_SESSION_AS_MENU_ID: &str = "save-session-as";
const LOAD_SESSION_MENU_ID: &str = "load-session";
const SAVE_DISPLAY_LAYOUT_MENU_ID: &str = "save-display-layout";
const LOAD_FAVORITES_MENU_ID: &str = "load-favorites";
const MANAGE_FAVORITES_MENU_ID: &str = "manage-favorites";

fn create_menu(app: &tauri::App, debug_enabled: bool) -> Result<Menu<tauri::Wry>, tauri::Error> {
    // About metadata with app info
    // Note: On macOS, `authors` and `website` fields are not supported
    // Use `credits` for additional info that appears as scrollable text
    let about_metadata = AboutMetadata {
        name: Some("HomeKaraoke".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        copyright: Some(format!("© {} {}", chrono::Utc::now().year(), env!("CARGO_PKG_AUTHORS")).into()),
        credits: Some(format!(
            "Home karaoke application with YouTube streaming, queue management, and singer tracking.\n\nhttps://homekaraoke.app\n\n{}",
            env!("CARGO_PKG_REPOSITORY")
        ).into()),
        ..Default::default()
    };

    // Standard app menu items
    let app_menu = Submenu::with_items(
        app,
        "HomeKaraoke",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("About HomeKaraoke"), Some(about_metadata))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, None)?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, None)?,
        ],
    )?;

    // Edit menu (for copy/paste support)
    let edit_menu = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;

    // View menu with Debug Mode toggle and Open Logs
    let debug_item =
        CheckMenuItem::with_id(app, DEBUG_MODE_MENU_ID, "Debug Mode", true, debug_enabled, None::<&str>)?;
    let open_logs_item =
        MenuItem::with_id(app, OPEN_LOGS_MENU_ID, "Open Log Folder...", true, None::<&str>)?;

    let view_menu = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &MenuItem::with_id(app, "reload", "Reload", true, Some("CmdOrCtrl+R"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::fullscreen(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &debug_item,
            &open_logs_item,
        ],
    )?;

    // Sessions menu
    let save_session_item =
        MenuItem::with_id(app, SAVE_SESSION_AS_MENU_ID, "Save Session As...", true, None::<&str>)?;
    let load_session_item =
        MenuItem::with_id(app, LOAD_SESSION_MENU_ID, "Stored Sessions...", true, None::<&str>)?;

    let sessions_menu = Submenu::with_items(
        app,
        "Sessions",
        true,
        &[
            &save_session_item,
            &load_session_item,
        ],
    )?;

    // Singers menu
    let load_favorites_item =
        MenuItem::with_id(app, LOAD_FAVORITES_MENU_ID, "Load Favorites to Queue...", true, None::<&str>)?;
    let manage_favorites_item =
        MenuItem::with_id(app, MANAGE_FAVORITES_MENU_ID, "Manage Favorites...", true, None::<&str>)?;

    let singers_menu = Submenu::with_items(
        app,
        "Singers",
        true,
        &[
            &load_favorites_item,
            &manage_favorites_item,
        ],
    )?;

    // Window menu
    let save_display_layout_item =
        MenuItem::with_id(app, SAVE_DISPLAY_LAYOUT_MENU_ID, "Save Display Layout...", true, None::<&str>)?;

    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &save_display_layout_item,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    Menu::with_items(app, &[&app_menu, &edit_menu, &view_menu, &sessions_menu, &singers_menu, &window_menu])
}

fn load_debug_preference(db: &Database) -> bool {
    db.get_setting("debug_mode")
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false)
}

fn save_debug_preference(db: &Database, enabled: bool) {
    if let Err(e) = db.set_setting("debug_mode", if enabled { "true" } else { "false" }) {
        log::error!("Failed to save debug mode preference: {}", e);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // Configure logging with file + stdout + webview targets
        // File logs capture everything (debug level) for issue reporting
        // Stdout uses info level by default
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    // Log to file - captures all levels including debug for issue reporting
                    Target::new(TargetKind::LogDir { file_name: Some("karaoke".into()) }),
                    // Log to stdout - info level for cleaner terminal output
                    Target::new(TargetKind::Stdout)
                        .filter(|metadata| metadata.level() <= log::Level::Info),
                    // Log to webview console - info level (debug controlled by frontend)
                    Target::new(TargetKind::Webview)
                        .filter(|metadata| metadata.level() <= log::Level::Info),
                ])
                // Allow debug level globally (file will capture it, others filter it out)
                .level(log::LevelFilter::Debug)
                // Reduce noise from some verbose crates
                .level_for("tao", log::LevelFilter::Warn)
                .level_for("wry", log::LevelFilter::Warn)
                .level_for("hyper", log::LevelFilter::Warn)
                .level_for("reqwest", log::LevelFilter::Warn)
                // Max 5MB per log file, keep 3 rotated + 1 active = 4 files (~20MB total)
                .max_file_size(5_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(3))
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::youtube_search,
            commands::youtube_get_stream_url,
            commands::youtube_get_info,
            commands::youtube_check_available,
            commands::youtube_install_ytdlp,
            commands::keep_awake_enable,
            commands::keep_awake_disable,
            commands::get_debug_mode,
            commands::set_debug_mode,
            commands::get_log_path,
            // Session & Singer commands
            commands::create_singer,
            commands::get_singers,
            commands::delete_singer,
            commands::update_singer,
            commands::get_persistent_singers,
            // Favorites commands
            commands::add_favorite,
            commands::remove_favorite,
            commands::get_singer_favorites,
            commands::bulk_add_favorites,
            commands::check_video_favorites,
            commands::start_session,
            commands::end_session,
            commands::get_active_session,
            commands::add_singer_to_session,
            commands::get_session_singers,
            commands::assign_singer_to_queue_item,
            commands::remove_singer_from_queue_item,
            commands::get_queue_item_singers,
            commands::clear_queue_item_singers,
            // Queue persistence commands
            commands::queue_add_item,
            commands::queue_remove_item,
            commands::queue_reorder,
            commands::queue_clear,
            commands::queue_move_to_history,
            commands::queue_add_to_history,
            commands::queue_clear_history,
            commands::queue_move_all_history_to_queue,
            commands::queue_set_history_index,
            commands::queue_get_state,
            // Session management commands
            commands::get_recent_sessions,
            commands::rename_session,
            commands::load_session,
            commands::delete_session,
            // Media controls commands
            commands::media_controls_update_metadata,
            commands::media_controls_update_playback,
            commands::media_controls_stop,
            // Display commands
            commands::display_get_configuration,
            commands::display_save_config,
            commands::display_get_saved_config,
            commands::display_update_auto_apply,
            commands::display_delete_config,
            commands::window_save_state,
            commands::window_get_states,
            commands::window_clear_states,
            // Update check command
            commands::update_check,
        ])
        .setup(|app| {
            info!("Starting HomeKaraoke application");

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            let log_dir = app
                .path()
                .app_log_dir()
                .expect("Failed to get log directory");

            std::fs::create_dir_all(&app_data_dir)?;
            debug!("App data directory: {:?}", app_data_dir);
            info!("Log directory: {:?}", log_dir);

            let db_path = app_data_dir.join("karaoke.db");
            let db = Database::new(&db_path)?;
            info!("Database initialized at {:?}", db_path);

            // Load debug mode preference
            let debug_enabled = load_debug_preference(&db);
            debug!("Debug mode loaded from preferences: {}", debug_enabled);

            // Initialize media controls (macOS and Linux)
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            let shutdown_flag = Arc::new(AtomicBool::new(false));

            #[cfg(any(target_os = "macos", target_os = "linux"))]
            let (media_controls, media_event_rx) = {
                let (tx, rx) = mpsc::channel();
                let controls = match MediaControlsService::new(tx) {
                    Ok(c) => {
                        info!("Media controls initialized");
                        Some(c)
                    }
                    Err(e) => {
                        warn!("Failed to initialize media controls: {}", e);
                        None
                    }
                };
                (controls, Some(rx))
            };

            // Initialize display watcher (macOS only)
            #[cfg(target_os = "macos")]
            let (display_watcher, display_event_rx) = {
                let (tx, rx) = mpsc::channel();
                let watcher = match DisplayWatcherService::new(tx) {
                    Ok(w) => {
                        info!("Display watcher initialized");
                        Some(w)
                    }
                    Err(e) => {
                        warn!("Failed to initialize display watcher: {}", e);
                        None
                    }
                };
                (watcher, Some(rx))
            };

            app.manage(AppState {
                db: Mutex::new(db),
                keep_awake: Mutex::new(None),
                debug_mode: AtomicBool::new(debug_enabled),
                log_dir: log_dir.clone(),
                #[cfg(any(target_os = "macos", target_os = "linux"))]
                media_controls: Mutex::new(media_controls),
                #[cfg(any(target_os = "macos", target_os = "linux"))]
                media_event_rx: Mutex::new(media_event_rx),
                #[cfg(any(target_os = "macos", target_os = "linux"))]
                media_event_thread: Mutex::new(None),
                #[cfg(any(target_os = "macos", target_os = "linux"))]
                shutdown_flag: shutdown_flag.clone(),
                #[cfg(target_os = "macos")]
                display_watcher: Mutex::new(display_watcher),
                #[cfg(target_os = "macos")]
                display_event_rx: Mutex::new(display_event_rx),
                #[cfg(target_os = "macos")]
                display_event_thread: Mutex::new(None),
            });

            // Spawn media event polling thread (macOS and Linux)
            #[cfg(any(target_os = "macos", target_os = "linux"))]
            {
                let app_handle = app.handle().clone();
                let shutdown_flag_clone = shutdown_flag.clone();
                let thread_handle = std::thread::spawn(move || {
                    let state = app_handle.state::<AppState>();
                    let rx = state.media_event_rx.lock().ok().and_then(|mut guard| guard.take());

                    if let Some(receiver) = rx {
                        loop {
                            // Use recv_timeout to periodically check shutdown flag
                            match receiver.recv_timeout(Duration::from_millis(100)) {
                                Ok(event) => {
                                    let event_name = match event {
                                        MediaControlEvent::Play => "media-control:play",
                                        MediaControlEvent::Pause => "media-control:pause",
                                        MediaControlEvent::Toggle => "media-control:toggle",
                                        MediaControlEvent::Next => "media-control:next",
                                        MediaControlEvent::Previous => "media-control:previous",
                                        MediaControlEvent::Stop => "media-control:stop",
                                        MediaControlEvent::Seek(direction) => {
                                            use souvlaki::SeekDirection;
                                            let delta = match direction {
                                                SeekDirection::Forward => 10.0,
                                                SeekDirection::Backward => -10.0,
                                            };
                                            let _ = app_handle.emit("media-control:seek", delta);
                                            continue;
                                        }
                                        MediaControlEvent::SetPosition(pos) => {
                                            let _ = app_handle.emit(
                                                "media-control:set-position",
                                                pos.0.as_secs_f64(),
                                            );
                                            continue;
                                        }
                                        _ => continue, // Ignore other events
                                    };
                                    let _ = app_handle.emit(event_name, ());
                                }
                                Err(mpsc::RecvTimeoutError::Timeout) => {
                                    // Check shutdown flag on timeout
                                    if shutdown_flag_clone.load(Ordering::SeqCst) {
                                        debug!("Media event polling thread received shutdown signal");
                                        break;
                                    }
                                }
                                Err(mpsc::RecvTimeoutError::Disconnected) => break, // Channel closed
                            }
                        }
                    }
                    debug!("Media event polling thread exiting");
                });

                // Store the thread handle for graceful shutdown
                let state = app.state::<AppState>();
                if let Ok(mut guard) = state.media_event_thread.lock() {
                    *guard = Some(thread_handle);
                };
            }

            // Spawn display event polling thread (macOS only)
            #[cfg(target_os = "macos")]
            {
                let app_handle = app.handle().clone();
                let shutdown_flag_clone = shutdown_flag.clone();
                let thread_handle = std::thread::spawn(move || {
                    let state = app_handle.state::<AppState>();
                    let rx = state.display_event_rx.lock().ok().and_then(|mut guard| guard.take());

                    if let Some(receiver) = rx {
                        loop {
                            match receiver.recv_timeout(Duration::from_millis(100)) {
                                Ok(DisplayEvent::ConfigurationChanged(config)) => {
                                    info!(
                                        "Display configuration changed: {} displays, hash={}",
                                        config.displays.len(),
                                        &config.config_hash[..8.min(config.config_hash.len())]
                                    );
                                    let _ = app_handle.emit("display:configuration-changed", &config);
                                }
                                Err(mpsc::RecvTimeoutError::Timeout) => {
                                    if shutdown_flag_clone.load(Ordering::SeqCst) {
                                        debug!("Display event polling thread received shutdown signal");
                                        break;
                                    }
                                }
                                Err(mpsc::RecvTimeoutError::Disconnected) => break,
                            }
                        }
                    }
                    debug!("Display event polling thread exiting");
                });

                // Store the thread handle for graceful shutdown
                let state = app.state::<AppState>();
                if let Ok(mut guard) = state.display_event_thread.lock() {
                    *guard = Some(thread_handle);
                };
            }

            // Create the application menu
            let menu = create_menu(app, debug_enabled)?;
            app.set_menu(menu)?;
            debug!("Application menu created");

            Ok(())
        })
        .on_menu_event(|app, event| {
            let menu_id = event.id().as_ref();
            debug!("Menu event: {}", menu_id);

            match menu_id {
                "reload" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.eval("window.location.reload()");
                    }
                }
                DEBUG_MODE_MENU_ID => {
                    let state = app.state::<AppState>();
                    let current = state.debug_mode.load(Ordering::SeqCst);
                    let new_value = !current;
                    state.debug_mode.store(new_value, Ordering::SeqCst);

                    // Update the menu checkbox state
                    if let Some(menu) = app.menu() {
                        if let Some(MenuItemKind::Check(item)) = menu.get(DEBUG_MODE_MENU_ID) {
                            if let Err(e) = item.set_checked(new_value) {
                                log::error!("Failed to update menu checkbox state: {}", e);
                            }
                        }
                    }

                    // Save to database
                    match state.db.lock() {
                        Ok(db) => save_debug_preference(&db, new_value),
                        Err(e) => log::error!("Failed to acquire database lock: {}", e),
                    }

                    // Emit event to frontend
                    let _ = app.emit("debug-mode-changed", new_value);
                    info!("Debug mode toggled: {}", new_value);
                }
                OPEN_LOGS_MENU_ID => {
                    let state = app.state::<AppState>();
                    let log_dir = &state.log_dir;
                    info!("Opening log directory: {:?}", log_dir);

                    // Use Tauri's shell plugin for cross-platform file manager opening
                    if let Err(e) = app.shell().open(log_dir.to_string_lossy(), None) {
                        log::error!("Failed to open log directory: {}", e);
                    }
                }
                SAVE_SESSION_AS_MENU_ID => {
                    info!("Save Session As... menu clicked");
                    // Emit event to frontend to show rename dialog
                    let _ = app.emit("show-rename-session-dialog", ());
                }
                LOAD_SESSION_MENU_ID => {
                    info!("Load Session... menu clicked");
                    // Emit event to frontend to show load session dialog
                    let _ = app.emit("show-load-session-dialog", ());
                }
                SAVE_DISPLAY_LAYOUT_MENU_ID => {
                    info!("Save Display Layout... menu clicked");
                    // Emit event to frontend to save current display layout
                    let _ = app.emit("save-display-layout", ());
                }
                LOAD_FAVORITES_MENU_ID => {
                    info!("Load Favorites to Queue... menu clicked");
                    let _ = app.emit("show-load-favorites-dialog", ());
                }
                MANAGE_FAVORITES_MENU_ID => {
                    info!("Manage Favorites... menu clicked");
                    let _ = app.emit("show-manage-favorites-dialog", ());
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                info!("Application exiting, initiating graceful shutdown");

                // Shutdown media controls (macOS and Linux)
                #[cfg(any(target_os = "macos", target_os = "linux"))]
                {
                    let state = app_handle.state::<AppState>();

                    // Signal the media event thread to stop
                    state.shutdown_flag.store(true, Ordering::SeqCst);
                    debug!("Shutdown flag set");

                    // Wait for media event thread to finish
                    if let Ok(mut guard) = state.media_event_thread.lock() {
                        if let Some(handle) = guard.take() {
                            debug!("Waiting for media event thread to finish...");
                            match handle.join() {
                                Ok(()) => info!("Media event thread shut down gracefully"),
                                Err(_) => warn!("Media event thread panicked during shutdown"),
                            }
                        }
                    };
                }

                // Shutdown display watcher (macOS only)
                #[cfg(target_os = "macos")]
                {
                    let state = app_handle.state::<AppState>();

                    // Wait for display event thread to finish
                    if let Ok(mut guard) = state.display_event_thread.lock() {
                        if let Some(handle) = guard.take() {
                            debug!("Waiting for display event thread to finish...");
                            match handle.join() {
                                Ok(()) => info!("Display event thread shut down gracefully"),
                                Err(_) => warn!("Display event thread panicked during shutdown"),
                            }
                        }
                    };
                }
            }
        });
}
