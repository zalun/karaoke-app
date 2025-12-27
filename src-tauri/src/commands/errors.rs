use serde::Serialize;
use thiserror::Error;

/// Common error type for Tauri commands.
///
/// This error type provides structured error handling across all command modules,
/// with clear error categories and informative messages.
#[derive(Error, Debug)]
#[allow(dead_code)] // Some variants are only used on specific platforms
pub enum CommandError {
    /// Database mutex lock failed - may indicate a deadlock or panic
    #[error("Database lock failed (may need restart): {0}")]
    DatabaseLock(String),

    /// Database query or operation failed
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    /// JSON serialization/deserialization failed
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// Requested resource was not found
    #[error("{resource} {id} not found")]
    NotFound { resource: &'static str, id: String },

    /// Input validation failed
    #[error("Validation error: {0}")]
    Validation(String),

    /// No active session exists
    #[error("No active session")]
    NoActiveSession,

    /// Operation not supported on this platform
    #[error("{0} is only available on macOS")]
    PlatformNotSupported(&'static str),

    /// Mutex lock failed for non-database resources
    #[error("{0} mutex poisoned")]
    MutexPoisoned(&'static str),

    /// External service error
    #[error("{0}")]
    External(String),
}

/// Serialize CommandError for Tauri's IPC.
///
/// Tauri requires errors to be serializable. We convert our structured
/// error into a simple object with error type and message fields.
impl Serialize for CommandError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;

        let mut state = serializer.serialize_struct("CommandError", 2)?;

        let error_type = match self {
            CommandError::DatabaseLock(_) => "database_lock",
            CommandError::Database(_) => "database",
            CommandError::Json(_) => "json",
            CommandError::NotFound { .. } => "not_found",
            CommandError::Validation(_) => "validation",
            CommandError::NoActiveSession => "no_active_session",
            CommandError::PlatformNotSupported(_) => "platform_not_supported",
            CommandError::MutexPoisoned(_) => "mutex_poisoned",
            CommandError::External(_) => "external",
        };

        state.serialize_field("type", error_type)?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

/// Helper trait to convert PoisonError to CommandError
pub trait LockResultExt<T> {
    fn map_lock_err(self) -> Result<T, CommandError>;
}

impl<T> LockResultExt<T> for Result<T, std::sync::PoisonError<T>> {
    fn map_lock_err(self) -> Result<T, CommandError> {
        self.map_err(|e| CommandError::DatabaseLock(e.to_string()))
    }
}
