mod commands;
mod db;
mod services;

use db::Database;
use log::{debug, info};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::menu::{CheckMenuItem, Menu, MenuItemKind, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};
use tauri_plugin_log::{Target, TargetKind};
use tauri_plugin_shell::ShellExt;

pub struct AppState {
    pub db: Mutex<Database>,
    pub keep_awake: Mutex<Option<keepawake::KeepAwake>>,
    pub debug_mode: AtomicBool,
    pub log_dir: std::path::PathBuf,
}

const DEBUG_MODE_MENU_ID: &str = "debug-mode";
const OPEN_LOGS_MENU_ID: &str = "open-logs";
const SAVE_SESSION_AS_MENU_ID: &str = "save-session-as";
const LOAD_SESSION_MENU_ID: &str = "load-session";

fn create_menu(app: &tauri::App, debug_enabled: bool) -> Result<Menu<tauri::Wry>, tauri::Error> {
    // Standard app menu items
    let app_menu = Submenu::with_items(
        app,
        "Karaoke",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("About Karaoke"), None)?,
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

    // Window menu
    let window_menu = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;

    Menu::with_items(app, &[&app_menu, &edit_menu, &view_menu, &sessions_menu, &window_menu])
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
            commands::queue_set_history_index,
            commands::queue_get_state,
            // Session management commands
            commands::get_recent_sessions,
            commands::rename_session,
            commands::load_session,
            commands::delete_session,
        ])
        .setup(|app| {
            info!("Starting Karaoke application");

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

            app.manage(AppState {
                db: Mutex::new(db),
                keep_awake: Mutex::new(None),
                debug_mode: AtomicBool::new(debug_enabled),
                log_dir: log_dir.clone(),
            });

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
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
