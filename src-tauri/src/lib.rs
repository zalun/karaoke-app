mod db;

use db::Database;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Database>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            std::fs::create_dir_all(&app_data_dir)?;

            let db_path = app_data_dir.join("karaoke.db");
            let db = Database::new(&db_path)?;

            app.manage(AppState { db: Mutex::new(db) });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
