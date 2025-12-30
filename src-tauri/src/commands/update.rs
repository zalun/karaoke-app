use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Error type for update-related commands.
#[derive(Error, Debug)]
pub enum UpdateError {
    #[error("Network error: {0}")]
    Network(String),

    #[error("Failed to parse response: {0}")]
    Parse(String),

    #[error("No releases found")]
    NoReleases,
}

impl Serialize for UpdateError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        use serde::ser::SerializeStruct;

        let mut state = serializer.serialize_struct("UpdateError", 2)?;

        let error_type = match self {
            UpdateError::Network(_) => "network",
            UpdateError::Parse(_) => "parse",
            UpdateError::NoReleases => "no_releases",
        };

        state.serialize_field("type", error_type)?;
        state.serialize_field("message", &self.to_string())?;
        state.end()
    }
}

/// Information about an available update
#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateInfo {
    /// Latest version tag (e.g., "v0.6.0")
    pub latest_version: String,
    /// Current app version
    pub current_version: String,
    /// Whether an update is available
    pub update_available: bool,
    /// URL to the release page
    pub release_url: String,
    /// URL to download the release (or homekaraoke.app)
    pub download_url: String,
    /// Release name/title (optional)
    pub release_name: Option<String>,
}

/// GitHub release response (simplified)
#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    html_url: String,
}

/// Parsed version with optional pre-release suffix
#[derive(Debug, PartialEq, Eq)]
struct ParsedVersion {
    major: u32,
    minor: u32,
    patch: u32,
    /// None = stable release, Some(suffix) = pre-release (beta, alpha, rc1, etc.)
    prerelease: Option<String>,
}

/// Split a pre-release string into alphabetic prefix and numeric suffix
/// e.g., "rc10" -> ("rc", Some(10)), "beta" -> ("beta", None)
fn split_prerelease(s: &str) -> (&str, Option<u32>) {
    let num_start = s.find(|c: char| c.is_ascii_digit());
    match num_start {
        Some(idx) => {
            let (prefix, num_str) = s.split_at(idx);
            let num = num_str.parse::<u32>().ok();
            (prefix, num)
        }
        None => (s, None),
    }
}

/// Compare pre-release strings with numeric suffix awareness
/// e.g., "rc2" < "rc10", "beta" < "rc", "alpha1" < "alpha2"
fn compare_prerelease(a: &str, b: &str) -> std::cmp::Ordering {
    let (prefix_a, num_a) = split_prerelease(a);
    let (prefix_b, num_b) = split_prerelease(b);

    // Compare prefixes first (alphabetically)
    match prefix_a.cmp(prefix_b) {
        std::cmp::Ordering::Equal => {
            // Same prefix, compare numeric suffixes
            // None < Some (e.g., "beta" < "beta1")
            match (num_a, num_b) {
                (None, None) => std::cmp::Ordering::Equal,
                (None, Some(_)) => std::cmp::Ordering::Less,
                (Some(_), None) => std::cmp::Ordering::Greater,
                (Some(a), Some(b)) => a.cmp(&b),
            }
        }
        other => other,
    }
}

impl PartialOrd for ParsedVersion {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for ParsedVersion {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // Compare major.minor.patch first
        match (self.major, self.minor, self.patch).cmp(&(other.major, other.minor, other.patch)) {
            std::cmp::Ordering::Equal => {
                // Same version numbers - compare pre-release
                // Stable (None) > pre-release (Some)
                // e.g., 0.5.1 > 0.5.1-beta
                match (&self.prerelease, &other.prerelease) {
                    (None, None) => std::cmp::Ordering::Equal,
                    (None, Some(_)) => std::cmp::Ordering::Greater, // stable > prerelease
                    (Some(_), None) => std::cmp::Ordering::Less,    // prerelease < stable
                    (Some(a), Some(b)) => compare_prerelease(a, b),
                }
            }
            other => other,
        }
    }
}

/// Parse a version string (e.g., "v0.5.1-beta" -> ParsedVersion)
/// Returns None if parsing fails
fn parse_version(version: &str) -> Option<ParsedVersion> {
    let v = version.trim_start_matches('v');
    // Split on first '-' to separate version from pre-release suffix
    let (version_part, prerelease) = match v.split_once('-') {
        Some((ver, pre)) => (ver, Some(pre.to_string())),
        None => (v, None),
    };

    let parts: Vec<&str> = version_part.split('.').collect();

    let (major, minor, patch) = if parts.len() >= 3 {
        (
            parts[0].parse().ok()?,
            parts[1].parse().ok()?,
            parts[2].parse().ok()?,
        )
    } else if parts.len() == 2 {
        (parts[0].parse().ok()?, parts[1].parse().ok()?, 0)
    } else {
        return None;
    };

    Some(ParsedVersion {
        major,
        minor,
        patch,
        prerelease,
    })
}

/// Compare two versions, returns true if `latest` is newer than `current`
fn is_newer_version(current: &str, latest: &str) -> bool {
    match (parse_version(current), parse_version(latest)) {
        (Some(curr), Some(lat)) => lat > curr,
        _ => false, // If parsing fails, assume no update
    }
}

#[tauri::command]
pub async fn update_check() -> Result<UpdateInfo, UpdateError> {
    let current_version = env!("CARGO_PKG_VERSION");
    debug!("update_check: current version = {}", current_version);

    // Fetch latest release from GitHub API
    let client = reqwest::Client::builder()
        .user_agent(format!(
            "HomeKaraoke-App/{} (+https://github.com/zalun/karaoke-app)",
            env!("CARGO_PKG_VERSION")
        ))
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| UpdateError::Network(e.to_string()))?;

    let response = client
        .get("https://api.github.com/repos/zalun/karaoke-app/releases/latest")
        .send()
        .await
        .map_err(|e| {
            warn!("update_check: network error: {}", e);
            UpdateError::Network(e.to_string())
        })?;

    if !response.status().is_success() {
        // Handle 404 (no releases) vs other errors
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(UpdateError::NoReleases);
        }
        return Err(UpdateError::Network(format!(
            "GitHub API returned status {}",
            response.status()
        )));
    }

    let release: GitHubRelease = response.json().await.map_err(|e| {
        warn!("update_check: failed to parse response: {}", e);
        UpdateError::Parse(e.to_string())
    })?;

    debug!(
        "update_check: latest release = {} ({})",
        release.tag_name,
        release.name.as_deref().unwrap_or("")
    );

    let latest_version = release.tag_name.clone();
    let update_available = is_newer_version(current_version, &latest_version);

    if update_available {
        info!(
            "update_check: update available! {} -> {}",
            current_version, latest_version
        );
    } else {
        debug!("update_check: already on latest version");
    }

    Ok(UpdateInfo {
        latest_version,
        current_version: current_version.to_string(),
        update_available,
        release_url: release.html_url.clone(),
        download_url: release.html_url, // Use GitHub release page for downloads
        release_name: release.name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_version() {
        // Basic versions
        let v = parse_version("v0.5.1").unwrap();
        assert_eq!((v.major, v.minor, v.patch), (0, 5, 1));
        assert_eq!(v.prerelease, None);

        let v = parse_version("0.5.1").unwrap();
        assert_eq!((v.major, v.minor, v.patch), (0, 5, 1));
        assert_eq!(v.prerelease, None);

        // Pre-release versions
        let v = parse_version("v0.5.1-beta").unwrap();
        assert_eq!((v.major, v.minor, v.patch), (0, 5, 1));
        assert_eq!(v.prerelease, Some("beta".to_string()));

        let v = parse_version("v1.0.0-rc1").unwrap();
        assert_eq!((v.major, v.minor, v.patch), (1, 0, 0));
        assert_eq!(v.prerelease, Some("rc1".to_string()));

        // Two-part version
        let v = parse_version("v0.6").unwrap();
        assert_eq!((v.major, v.minor, v.patch), (0, 6, 0));

        // Invalid
        assert!(parse_version("invalid").is_none());
    }

    #[test]
    fn test_is_newer_version() {
        // Basic version comparisons
        assert!(is_newer_version("v0.5.1", "v0.5.2"));
        assert!(is_newer_version("v0.5.1", "v0.6.0"));
        assert!(is_newer_version("v0.5.1", "v1.0.0"));
        assert!(!is_newer_version("v0.5.2", "v0.5.1"));
        assert!(!is_newer_version("v0.5.1", "v0.5.1"));

        // Pre-release comparisons: stable > pre-release for same version
        assert!(is_newer_version("v0.5.1-beta", "v0.5.1")); // stable is newer than beta
        assert!(!is_newer_version("v0.5.1", "v0.5.1-beta")); // beta is not newer than stable
        assert!(is_newer_version("v0.5.1-alpha", "v0.5.1-beta")); // beta > alpha (alphabetical)

        // Pre-release of newer version is still newer
        assert!(is_newer_version("v0.5.0", "v0.5.1-beta")); // 0.5.1-beta > 0.5.0

        // Numeric suffix comparisons (rc2 < rc10, not alphabetical)
        assert!(is_newer_version("v1.0.0-rc2", "v1.0.0-rc10")); // rc10 > rc2
        assert!(is_newer_version("v1.0.0-rc1", "v1.0.0-rc2")); // rc2 > rc1
        assert!(is_newer_version("v1.0.0-beta1", "v1.0.0-beta2")); // beta2 > beta1
        assert!(!is_newer_version("v1.0.0-rc10", "v1.0.0-rc2")); // rc2 is not newer than rc10
    }
}
