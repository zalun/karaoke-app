mod commands;
mod db;
mod services;

use db::Database;
use log::{debug, info};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager};

pub struct AppState {
    pub db: Mutex<Database>,
    pub keep_awake: Mutex<Option<keepawake::KeepAwake>>,
    pub debug_mode: AtomicBool,
}

const DEBUG_MODE_MENU_ID: &str = "debug-mode";

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

    // View menu with Debug Mode toggle
    let debug_item =
        CheckMenuItem::with_id(app, DEBUG_MODE_MENU_ID, "Debug Mode", true, debug_enabled, None::<&str>)?;

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

    Menu::with_items(app, &[&app_menu, &edit_menu, &view_menu, &window_menu])
}

fn load_debug_preference(db: &Database) -> bool {
    db.get_setting("debug_mode")
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false)
}

fn save_debug_preference(db: &Database, enabled: bool) {
    let _ = db.set_setting("debug_mode", if enabled { "true" } else { "false" });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logger with env_logger
    // In dev: RUST_LOG=debug cargo tauri dev
    // Default to info level
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .format_timestamp_millis()
        .init();

    info!("Starting Karaoke application");

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
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
        ])
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            std::fs::create_dir_all(&app_data_dir)?;
            debug!("App data directory: {:?}", app_data_dir);

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

                    // Save to database
                    if let Ok(db) = state.db.lock() {
                        save_debug_preference(&db, new_value);
                    }

                    // Emit event to frontend
                    let _ = app.emit("debug-mode-changed", new_value);
                    info!("Debug mode toggled: {}", new_value);
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
