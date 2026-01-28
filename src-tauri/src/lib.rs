mod commands;
mod db;
mod keychain;
mod services;

use chrono::Datelike;
use db::Database;
use log::{debug, error, info, warn};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

#[cfg(target_os = "macos")]
use services::{DisplayEvent, DisplayWatcherService};
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
use services::MediaControlsService;
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
use souvlaki::MediaControlEvent;
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
use std::sync::mpsc;
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
use std::thread::JoinHandle;
#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
use std::time::Duration;
use tauri::menu::{AboutMetadata, CheckMenuItem, Menu, MenuItemKind, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;

pub struct AppState {
    pub db: Mutex<Database>,
    pub keep_awake: Mutex<Option<keepawake::KeepAwake>>,
    pub debug_mode: AtomicBool,
    pub log_dir: std::path::PathBuf,
    /// Pending auth callback from deep link (stored until frontend is ready)
    pub pending_auth_callback: Mutex<Option<std::collections::HashMap<String, String>>>,
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    pub media_controls: Mutex<Option<MediaControlsService>>,
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    pub media_event_rx: Mutex<Option<mpsc::Receiver<MediaControlEvent>>>,
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    pub media_event_thread: Mutex<Option<JoinHandle<()>>>,
    #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
    pub shutdown_flag: Arc<AtomicBool>,
    #[cfg(target_os = "macos")]
    pub display_watcher: Mutex<Option<DisplayWatcherService>>,
    #[cfg(target_os = "macos")]
    pub display_event_rx: Mutex<Option<mpsc::Receiver<DisplayEvent>>>,
    #[cfg(target_os = "macos")]
    pub display_event_thread: Mutex<Option<JoinHandle<()>>>,
}

const SETTINGS_MENU_ID: &str = "settings";
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

    // Settings menu item
    let settings_item =
        MenuItem::with_id(app, SETTINGS_MENU_ID, "Settings...", true, Some("CmdOrCtrl+,"))?;

    // Standard app menu items
    let app_menu = Submenu::with_items(
        app,
        "HomeKaraoke",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("About HomeKaraoke"), Some(about_metadata))?,
            &PredefinedMenuItem::separator(app)?,
            &settings_item,
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

// Port for localhost server (used on macOS/Linux to fix YouTube embed issues)
// YouTube iframe API requires HTTP protocol with valid Referer header
#[cfg(any(target_os = "macos", target_os = "linux"))]
const LOCALHOST_PORT: u16 = 14200;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Use localhost plugin on macOS/Linux to serve app over HTTP
    // This fixes YouTube iframe error 153 (tauri:// protocol lacks valid HTTP Referer)
    // Windows already uses http://tauri.localhost which works fine
    let mut context = tauri::generate_context!();

    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        use tauri::utils::config::FrontendDist;
        let url_str = format!("http://localhost:{}", LOCALHOST_PORT);
        let url: url::Url = url_str.parse().expect("Invalid localhost URL");
        context.config_mut().build.frontend_dist = Some(FrontendDist::Url(url));
    }

    let mut builder = tauri::Builder::default();

    // Localhost plugin serves app over HTTP on macOS/Linux (fixes YouTube embed)
    #[cfg(any(target_os = "macos", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_localhost::Builder::new(LOCALHOST_PORT).build());
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_http::init())
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
            commands::youtube_api_search,
            commands::youtube_validate_api_key,
            commands::youtube_get_search_method,
            commands::keep_awake_enable,
            commands::keep_awake_disable,
            commands::get_debug_mode,
            commands::set_debug_mode,
            commands::get_log_path,
            // Settings commands
            commands::settings_get,
            commands::settings_set,
            commands::settings_get_all,
            commands::settings_reset_all,
            commands::open_log_folder,
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
            commands::remove_singer_from_session,
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
            commands::queue_fair_shuffle,
            commands::queue_compute_fair_position,
            // Session management commands
            commands::get_recent_sessions,
            commands::rename_session,
            commands::load_session,
            commands::delete_session,
            // Active singer commands
            commands::session_set_active_singer,
            commands::session_get_active_singer,
            // Hosted session commands
            commands::session_set_hosted,
            commands::session_update_hosted_status,
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
            // Library commands
            commands::library_add_folder,
            commands::library_remove_folder,
            commands::library_get_folders,
            commands::library_scan_folder,
            commands::library_scan_all,
            commands::library_search,
            commands::library_browse,
            commands::library_check_file,
            commands::library_get_stats,
            // Search history commands
            commands::search_history_add,
            commands::search_history_get,
            commands::search_history_clear,
            commands::search_history_clear_session,
            // Auth commands
            commands::auth_store_tokens,
            commands::auth_get_tokens,
            commands::auth_clear_tokens,
            commands::auth_get_login_url,
            commands::auth_open_login,
            commands::auth_get_pending_callback,
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

            // Initialize media controls (macOS, Linux, and Windows)
            #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
            let shutdown_flag = Arc::new(AtomicBool::new(false));

            #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
            let (media_controls, media_event_rx) = {
                let (tx, rx) = mpsc::channel();

                // On Windows, we need the HWND from the main window
                #[cfg(target_os = "windows")]
                let hwnd = app
                    .get_webview_window("main")
                    .and_then(|w| w.hwnd().ok())
                    .map(|h| h.0 as *mut std::ffi::c_void);

                #[cfg(not(target_os = "windows"))]
                let hwnd = None;

                let controls = match MediaControlsService::new(tx, hwnd) {
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
                pending_auth_callback: Mutex::new(None),
                #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
                media_controls: Mutex::new(media_controls),
                #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
                media_event_rx: Mutex::new(media_event_rx),
                #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
                media_event_thread: Mutex::new(None),
                #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
                shutdown_flag: shutdown_flag.clone(),
                #[cfg(target_os = "macos")]
                display_watcher: Mutex::new(display_watcher),
                #[cfg(target_os = "macos")]
                display_event_rx: Mutex::new(display_event_rx),
                #[cfg(target_os = "macos")]
                display_event_thread: Mutex::new(None),
            });

            // Add library folders to asset protocol scope for thumbnails
            info!("Setting up asset protocol scope for library folders...");
            if let Some(state) = app.try_state::<AppState>() {
                info!("Got AppState, querying library folders");
                if let Ok(db) = state.db.lock() {
                    let conn = db.connection();
                    let paths: Vec<String> = match conn.prepare("SELECT path FROM library_folders") {
                        Ok(mut stmt) => stmt
                            .query_map([], |row| row.get(0))
                            .ok()
                            .map(|rows| rows.filter_map(|r| r.ok()).collect())
                            .unwrap_or_default(),
                        Err(e) => {
                            warn!("Failed to query library folders for asset scope: {}", e);
                            Vec::new()
                        }
                    };

                    info!("Found {} library folders to add to asset scope", paths.len());
                    let asset_scope = app.asset_protocol_scope();
                    for path in paths {
                        let folder_path = std::path::Path::new(&path);
                        // Allow the library folder
                        if let Err(e) = asset_scope.allow_directory(folder_path, true) {
                            warn!("Failed to add {} to asset scope: {}", path, e);
                        } else {
                            info!("Added {} to asset protocol scope", path);
                        }
                        // Also explicitly allow the .homekaraoke subdirectory
                        // Add regardless of whether it exists - it may be created during scanning
                        let homekaraoke_dir = folder_path.join(".homekaraoke");
                        if let Err(e) = asset_scope.allow_directory(&homekaraoke_dir, true) {
                            warn!("Failed to add {:?} to asset scope: {}", homekaraoke_dir, e);
                        } else {
                            info!("Added {:?} to asset protocol scope", homekaraoke_dir);
                        }
                    }
                } else {
                    warn!("Failed to lock database for asset scope setup");
                }
            } else {
                warn!("AppState not available for asset scope setup");
            }

            // Spawn media event polling thread (macOS and Linux)
            #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
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

            // Register deep link handler for OAuth callback
            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls();
                info!("Deep link handler triggered with {} URL(s)", urls.len());
                for (i, url) in urls.iter().enumerate() {
                    info!("Deep link URL[{}]: scheme={}, host={:?}, path={}, query={:?}, fragment={:?}",
                        i, url.scheme(), url.host_str(), url.path(), url.query(), url.fragment());
                }
                if let Some(url) = urls.first() {
                    debug!("Processing first URL: {}", url);
                    // URL homekaraoke://auth/callback parses as host="auth", path="/callback"
                    let is_auth_callback = url.host_str() == Some("auth") && url.path() == "/callback";
                    info!("Is auth callback? {} (host={:?}, path='{}')", is_auth_callback, url.host_str(), url.path());
                    if is_auth_callback {
                        // Parse parameters from query string OR hash fragment
                        // Supabase uses hash fragments for implicit grant flow
                        let mut params: std::collections::HashMap<String, String> = url
                            .query_pairs()
                            .map(|(k, v)| (k.to_string(), v.to_string()))
                            .collect();

                        // If no query params, check hash fragment
                        if params.is_empty() {
                            if let Some(fragment) = url.fragment() {
                                debug!("Parsing hash fragment for auth params");
                                // Parse fragment as if it were a query string
                                for pair in fragment.split('&') {
                                    if let Some((key, value)) = pair.split_once('=') {
                                        params.insert(
                                            key.to_string(),
                                            urlencoding::decode(value).unwrap_or_else(|_| value.into()).to_string()
                                        );
                                    }
                                }
                            }
                        }

                        info!("Auth callback received with {} params", params.len());
                        for (key, value) in &params {
                            // Mask token values for security
                            let display_value = if key.contains("token") {
                                format!("{}...", &value[..value.len().min(10)])
                            } else {
                                value.clone()
                            };
                            debug!("  param: {} = {}", key, display_value);
                        }

                        // Store in AppState for frontend to retrieve (handles race condition)
                        // Only store if no pending callback exists to prevent overwrites
                        if let Some(state) = app_handle.try_state::<AppState>() {
                            match state.pending_auth_callback.lock() {
                                Ok(mut pending) => {
                                    if pending.is_some() {
                                        warn!("Rejecting auth callback - one already pending");
                                    } else {
                                        *pending = Some(params.clone());
                                        debug!("Stored pending auth callback");
                                    }
                                }
                                Err(e) => {
                                    error!("Failed to lock pending_auth_callback mutex: {}", e);
                                }
                            }
                        }

                        // Also emit event to frontend (in case listener is already set up)
                        if let Err(e) = app_handle.emit("auth:callback", params) {
                            error!("Failed to emit auth:callback event: {}", e);
                        }
                    }
                }
            });
            info!("Deep link handler registered for homekaraoke:// scheme");

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

                    // Use Tauri's opener plugin for cross-platform file manager opening
                    if let Err(e) = app.opener().reveal_item_in_dir(log_dir) {
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
                SETTINGS_MENU_ID => {
                    info!("Settings... menu clicked");
                    let _ = app.emit("show-settings-dialog", ());
                }
                _ => {}
            }
        })
        .build(context)
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                info!("Application exiting, initiating graceful shutdown");

                // Shutdown media controls (macOS and Linux)
                #[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
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
