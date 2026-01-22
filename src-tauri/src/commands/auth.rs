//! Auth commands for secure token storage and OAuth flow.

use crate::keychain::{self, AuthTokens};
use log::{debug, error, info};
use tauri_plugin_opener::OpenerExt;

const AUTH_LOGIN_URL: &str = "https://homekaraoke.app/auth/app-login";

/// Store authentication tokens in the OS keychain.
#[tauri::command]
pub fn auth_store_tokens(
    access_token: String,
    refresh_token: String,
    expires_at: i64,
) -> Result<(), String> {
    debug!("Storing auth tokens");
    keychain::store_auth_tokens(&access_token, &refresh_token, expires_at)
        .map_err(|e| {
            error!("Failed to store auth tokens: {}", e);
            e.to_string()
        })
}

/// Retrieve authentication tokens from the OS keychain.
#[tauri::command]
pub fn auth_get_tokens() -> Result<Option<AuthTokens>, String> {
    debug!("Getting auth tokens");
    keychain::get_auth_tokens().map_err(|e| {
        error!("Failed to get auth tokens: {}", e);
        e.to_string()
    })
}

/// Clear authentication tokens from the OS keychain.
#[tauri::command]
pub fn auth_clear_tokens() -> Result<(), String> {
    info!("Clearing auth tokens");
    keychain::clear_auth_tokens().map_err(|e| {
        error!("Failed to clear auth tokens: {}", e);
        e.to_string()
    })
}

/// Open the system browser to the website login page for OAuth.
/// The state parameter is used for CSRF protection.
#[tauri::command]
pub fn auth_open_login(app: tauri::AppHandle, state: String) -> Result<(), String> {
    let redirect_uri = "homekaraoke://auth/callback";
    let url = format!(
        "{}?redirect_uri={}&state={}",
        AUTH_LOGIN_URL,
        urlencoding::encode(redirect_uri),
        urlencoding::encode(&state)
    );

    info!("Opening browser for OAuth login");
    debug!("Login URL: {}", url);

    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| {
            error!("Failed to open browser: {}", e);
            e.to_string()
        })
}
