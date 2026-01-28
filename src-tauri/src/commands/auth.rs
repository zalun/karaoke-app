//! Auth commands for secure token storage and OAuth flow.

use crate::keychain::{self, AuthTokens};
use crate::AppState;
use log::{debug, error, info};
use std::collections::HashMap;
use tauri::State;
use tauri_plugin_opener::OpenerExt;

const AUTH_LOGIN_URL: &str = "https://homekaraoke.app/auth/app-login";
const AUTH_REDIRECT_URI: &str = "homekaraoke://auth/callback";

/// Build the OAuth login URL with the given state parameter.
fn build_login_url(state: &str) -> String {
    format!(
        "{}?redirect_uri={}&state={}",
        AUTH_LOGIN_URL,
        urlencoding::encode(AUTH_REDIRECT_URI),
        urlencoding::encode(state)
    )
}

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

/// Get the OAuth login URL without opening the browser.
/// Useful for copying the URL to use in a different browser.
#[tauri::command]
pub fn auth_get_login_url(state: String) -> String {
    let url = build_login_url(&state);
    debug!("Generated login URL: {}", url);
    url
}

/// Open the system browser to the website login page for OAuth.
/// The state parameter is used for CSRF protection.
#[tauri::command]
pub fn auth_open_login(app: tauri::AppHandle, state: String) -> Result<(), String> {
    let url = build_login_url(&state);

    info!("Opening browser for OAuth login");
    debug!("Login URL: {}", url);

    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| {
            error!("Failed to open browser: {}", e);
            e.to_string()
        })
}

/// Get and clear any pending auth callback from deep link.
/// This handles the race condition where the deep link arrives before
/// the frontend listener is set up.
#[tauri::command]
pub fn auth_get_pending_callback(
    state: State<'_, AppState>,
) -> Result<Option<HashMap<String, String>>, String> {
    debug!("Checking for pending auth callback");
    let mut pending = state
        .pending_auth_callback
        .lock()
        .map_err(|e| e.to_string())?;

    if let Some(params) = pending.take() {
        info!("Retrieved pending auth callback with {} params", params.len());
        Ok(Some(params))
    } else {
        debug!("No pending auth callback");
        Ok(None)
    }
}
