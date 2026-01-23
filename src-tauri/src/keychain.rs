//! Secure token storage using the operating system's keychain/credential manager.
//!
//! On macOS: Uses Keychain
//! On Windows: Uses Credential Manager
//! On Linux: Uses Secret Service (GNOME Keyring / KDE Wallet)

use keyring::Entry;
use log::{debug, error, info};
use serde::{Deserialize, Serialize};
use thiserror::Error;

const SERVICE_NAME: &str = "app.homekaraoke";
const ACCESS_TOKEN_KEY: &str = "access_token";
const REFRESH_TOKEN_KEY: &str = "refresh_token";
const EXPIRES_AT_KEY: &str = "expires_at";

#[derive(Debug, Error)]
pub enum KeychainError {
    #[error("Keychain access error: {0}")]
    Access(String),
    #[error("Token not found")]
    NotFound,
    #[error("Invalid token format")]
    InvalidFormat,
}

impl From<keyring::Error> for KeychainError {
    fn from(err: keyring::Error) -> Self {
        match err {
            keyring::Error::NoEntry => KeychainError::NotFound,
            _ => KeychainError::Access(err.to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_at: i64,
}

/// Store authentication tokens securely in the OS keychain.
pub fn store_auth_tokens(
    access_token: &str,
    refresh_token: &str,
    expires_at: i64,
) -> Result<(), KeychainError> {
    debug!("Storing auth tokens in keychain");

    let access_entry = Entry::new(SERVICE_NAME, ACCESS_TOKEN_KEY)?;
    access_entry.set_password(access_token)?;

    let refresh_entry = Entry::new(SERVICE_NAME, REFRESH_TOKEN_KEY)?;
    refresh_entry.set_password(refresh_token)?;

    let expires_entry = Entry::new(SERVICE_NAME, EXPIRES_AT_KEY)?;
    expires_entry.set_password(&expires_at.to_string())?;

    info!("Auth tokens stored in keychain");
    Ok(())
}

/// Retrieve authentication tokens from the OS keychain.
/// Returns None if no tokens are stored.
pub fn get_auth_tokens() -> Result<Option<AuthTokens>, KeychainError> {
    debug!("Retrieving auth tokens from keychain");

    let access_entry = Entry::new(SERVICE_NAME, ACCESS_TOKEN_KEY)?;
    let access_token = match access_entry.get_password() {
        Ok(token) => token,
        Err(keyring::Error::NoEntry) => {
            debug!("No access token found in keychain");
            return Ok(None);
        }
        Err(e) => return Err(KeychainError::from(e)),
    };

    let refresh_entry = Entry::new(SERVICE_NAME, REFRESH_TOKEN_KEY)?;
    let refresh_token = match refresh_entry.get_password() {
        Ok(token) => token,
        Err(keyring::Error::NoEntry) => {
            debug!("No refresh token found in keychain");
            return Ok(None);
        }
        Err(e) => return Err(KeychainError::from(e)),
    };

    let expires_entry = Entry::new(SERVICE_NAME, EXPIRES_AT_KEY)?;
    let expires_at = match expires_entry.get_password() {
        Ok(val) => val
            .parse::<i64>()
            .map_err(|_| KeychainError::InvalidFormat)?,
        Err(keyring::Error::NoEntry) => {
            debug!("No expires_at found in keychain");
            return Ok(None);
        }
        Err(e) => return Err(KeychainError::from(e)),
    };

    debug!("Auth tokens retrieved from keychain");
    Ok(Some(AuthTokens {
        access_token,
        refresh_token,
        expires_at,
    }))
}

/// Clear all authentication tokens from the OS keychain.
pub fn clear_auth_tokens() -> Result<(), KeychainError> {
    debug!("Clearing auth tokens from keychain");

    // Try to delete each entry, but don't fail if it doesn't exist
    let access_entry = Entry::new(SERVICE_NAME, ACCESS_TOKEN_KEY)?;
    if let Err(e) = access_entry.delete_credential() {
        if !matches!(e, keyring::Error::NoEntry) {
            error!("Failed to delete access token: {}", e);
        }
    }

    let refresh_entry = Entry::new(SERVICE_NAME, REFRESH_TOKEN_KEY)?;
    if let Err(e) = refresh_entry.delete_credential() {
        if !matches!(e, keyring::Error::NoEntry) {
            error!("Failed to delete refresh token: {}", e);
        }
    }

    let expires_entry = Entry::new(SERVICE_NAME, EXPIRES_AT_KEY)?;
    if let Err(e) = expires_entry.delete_credential() {
        if !matches!(e, keyring::Error::NoEntry) {
            error!("Failed to delete expires_at: {}", e);
        }
    }

    info!("Auth tokens cleared from keychain");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These tests require access to the OS keychain and may prompt for permissions
    // They are marked as ignore by default to avoid CI issues

    #[test]
    #[ignore]
    fn test_store_and_retrieve_tokens() {
        let access = "test_access_token";
        let refresh = "test_refresh_token";
        let expires = 1234567890i64;

        // Store
        store_auth_tokens(access, refresh, expires).unwrap();

        // Retrieve
        let tokens = get_auth_tokens().unwrap().unwrap();
        assert_eq!(tokens.access_token, access);
        assert_eq!(tokens.refresh_token, refresh);
        assert_eq!(tokens.expires_at, expires);

        // Clean up
        clear_auth_tokens().unwrap();

        // Verify cleared
        assert!(get_auth_tokens().unwrap().is_none());
    }
}
