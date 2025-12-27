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

#[cfg(test)]
mod tests {
    use super::*;

    /// Test that CommandError serializes to the expected {type, message} format
    /// for Tauri IPC consumption.
    #[test]
    fn test_error_serialization_format() {
        let error = CommandError::Validation("test error".to_string());
        let json = serde_json::to_string(&error).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["type"], "validation");
        assert_eq!(parsed["message"], "Validation error: test error");
    }

    #[test]
    fn test_database_lock_error_serialization() {
        let error = CommandError::DatabaseLock("mutex poisoned".to_string());
        let json = serde_json::to_string(&error).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["type"], "database_lock");
        assert!(parsed["message"]
            .as_str()
            .unwrap()
            .contains("Database lock failed"));
    }

    #[test]
    fn test_not_found_error_serialization() {
        let error = CommandError::NotFound {
            resource: "Session",
            id: "123".to_string(),
        };
        let json = serde_json::to_string(&error).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["type"], "not_found");
        assert_eq!(parsed["message"], "Session 123 not found");
    }

    #[test]
    fn test_no_active_session_error_serialization() {
        let error = CommandError::NoActiveSession;
        let json = serde_json::to_string(&error).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["type"], "no_active_session");
        assert_eq!(parsed["message"], "No active session");
    }

    #[test]
    fn test_all_error_types_serialize() {
        // Ensure all variants serialize without panicking
        let errors: Vec<CommandError> = vec![
            CommandError::DatabaseLock("test".to_string()),
            CommandError::Json(serde_json::from_str::<()>("invalid").unwrap_err()),
            CommandError::NotFound {
                resource: "Item",
                id: "1".to_string(),
            },
            CommandError::Validation("invalid input".to_string()),
            CommandError::NoActiveSession,
            CommandError::PlatformNotSupported("Feature"),
            CommandError::MutexPoisoned("Resource"),
            CommandError::External("external error".to_string()),
        ];

        for error in errors {
            let json = serde_json::to_string(&error).unwrap();
            let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
            assert!(parsed["type"].is_string());
            assert!(parsed["message"].is_string());
        }
    }

    #[test]
    fn test_from_rusqlite_error() {
        // Test that rusqlite errors convert via #[from]
        let rusqlite_err = rusqlite::Error::InvalidQuery;
        let cmd_err: CommandError = rusqlite_err.into();

        match cmd_err {
            CommandError::Database(_) => {} // Expected
            _ => panic!("Expected CommandError::Database variant"),
        }
    }

    #[test]
    fn test_from_serde_json_error() {
        // Test that serde_json errors convert via #[from]
        let json_err = serde_json::from_str::<()>("invalid").unwrap_err();
        let cmd_err: CommandError = json_err.into();

        match cmd_err {
            CommandError::Json(_) => {} // Expected
            _ => panic!("Expected CommandError::Json variant"),
        }
    }
}
