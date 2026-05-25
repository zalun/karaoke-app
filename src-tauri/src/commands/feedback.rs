//! Feedback support commands.
//!
//! Currently exposes [`get_log_tail`], which reads the tail of the active log
//! file for inclusion in a user feedback report. Secrets are redacted at this
//! boundary (see [`crate::commands::redaction`]) before the tail leaves the app,
//! and the result is capped in both line count and bytes.

use crate::commands::redaction::redact_secrets;
use crate::AppState;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use tauri::State;

/// Hard cap on returned lines, regardless of the requested count.
const MAX_LINES: u32 = 100;
/// Rough bytes-per-line estimate used to size the seek-from-end read window.
const BYTES_PER_LINE_ESTIMATE: u64 = 200;
/// Hard cap on the returned (post-redaction) string size.
const MAX_OUTPUT_BYTES: usize = 50_000;

/// Return up to `min(lines, 100)` lines from the tail of the most recently
/// modified `*.log` file in the application log directory, with secrets
/// redacted and the result capped at 50 000 bytes.
///
/// Errors (with a human-readable Polish message) when the log directory is
/// missing or no log file can be read.
#[tauri::command]
pub fn get_log_tail(state: State<'_, AppState>, lines: u32) -> Result<String, String> {
    let n = lines.clamp(1, MAX_LINES);
    let log_dir = &state.log_dir;

    if !log_dir.exists() {
        return Err("Katalog logów nie istnieje.".to_string());
    }

    let path = newest_log_file(log_dir)?;
    let tail = read_tail(&path, n)?;
    Ok(cap_bytes(redact_secrets(&tail), MAX_OUTPUT_BYTES))
}

/// Find the most recently modified `*.log` file in `log_dir`.
fn newest_log_file(log_dir: &std::path::Path) -> Result<PathBuf, String> {
    let entries = std::fs::read_dir(log_dir)
        .map_err(|e| format!("Nie można odczytać katalogu logów: {e}"))?;

    let mut newest: Option<(std::time::SystemTime, PathBuf)> = None;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("log") {
            continue;
        }
        let Ok(modified) = entry.metadata().and_then(|m| m.modified()) else {
            continue;
        };
        if newest.as_ref().map_or(true, |(t, _)| modified > *t) {
            newest = Some((modified, path));
        }
    }

    newest
        .map(|(_, path)| path)
        .ok_or_else(|| "Nie znaleziono pliku logów.".to_string())
}

/// Read the last `n` lines of `path` using a seek-from-end window.
///
/// Reads roughly `n * BYTES_PER_LINE_ESTIMATE` bytes from the end of the file.
/// When the window starts mid-file the first (likely partial) line is dropped.
fn read_tail(path: &std::path::Path, n: u32) -> Result<String, String> {
    let mut file =
        std::fs::File::open(path).map_err(|e| format!("Nie można otworzyć pliku logów: {e}"))?;
    let len = file
        .metadata()
        .map_err(|e| format!("Nie można odczytać pliku logów: {e}"))?
        .len();

    let window = (n as u64 * BYTES_PER_LINE_ESTIMATE).min(len);
    let start = len - window;
    file.seek(SeekFrom::Start(start))
        .map_err(|e| format!("Nie można odczytać pliku logów: {e}"))?;

    let mut bytes = Vec::with_capacity(window as usize);
    file.read_to_end(&mut bytes)
        .map_err(|e| format!("Nie można odczytać pliku logów: {e}"))?;

    // Lossy is fine: the window may begin mid UTF-8 char, and that first
    // partial line is dropped below whenever we didn't start at the file head.
    let text = String::from_utf8_lossy(&bytes);
    let mut all: Vec<&str> = text.lines().collect();
    if start > 0 && !all.is_empty() {
        all.remove(0);
    }

    let tail = if all.len() > n as usize {
        &all[all.len() - n as usize..]
    } else {
        &all[..]
    };
    Ok(tail.join("\n"))
}

/// Truncate `s` to at most `max` bytes, respecting UTF-8 char boundaries.
fn cap_bytes(s: String, max: usize) -> String {
    if s.len() <= max {
        return s;
    }
    let mut end = max;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    s[..end].to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cap_bytes_leaves_short_strings_untouched() {
        assert_eq!(cap_bytes("hello".to_string(), 50_000), "hello");
    }

    #[test]
    fn cap_bytes_truncates_long_strings() {
        let s = "x".repeat(60_000);
        assert_eq!(cap_bytes(s, MAX_OUTPUT_BYTES).len(), MAX_OUTPUT_BYTES);
    }

    #[test]
    fn cap_bytes_respects_char_boundaries() {
        // "é" is two bytes; capping at an odd boundary must not split it.
        let s = "é".repeat(40_000); // 80 000 bytes
        let capped = cap_bytes(s, MAX_OUTPUT_BYTES);
        assert!(capped.len() <= MAX_OUTPUT_BYTES);
        // Valid UTF-8 by construction (String), and no trailing replacement char.
        assert!(capped.chars().all(|c| c == 'é'));
    }

    /// Build a unique temp dir for a test (process id + a unique tag).
    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("hk_logtail_{}_{}", std::process::id(), tag));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn write_lines(path: &std::path::Path, count: usize) {
        use std::io::Write;
        let mut f = std::fs::File::create(path).unwrap();
        for i in 0..count {
            writeln!(f, "line {i}").unwrap();
        }
    }

    #[test]
    fn read_tail_returns_last_n_lines() {
        let dir = temp_dir("last_n");
        let path = dir.join("karaoke.log");
        write_lines(&path, 50);

        let tail = read_tail(&path, 5).unwrap();
        let lines: Vec<&str> = tail.lines().collect();
        assert_eq!(lines.len(), 5);
        assert_eq!(lines.last().unwrap(), &"line 49");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn read_tail_caps_at_requested_line_count() {
        // Spec: "Line cap is enforced". get_log_tail clamps `lines` to MAX_LINES (100)
        // before calling read_tail; here we verify read_tail honors that count against
        // a file with more lines than requested.
        let dir = temp_dir("cap");
        let path = dir.join("karaoke.log");
        write_lines(&path, 150);

        let tail = read_tail(&path, MAX_LINES).unwrap();
        let lines: Vec<&str> = tail.lines().collect();
        assert_eq!(lines.len(), MAX_LINES as usize);
        assert_eq!(lines.last().unwrap(), &"line 149");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn newest_log_file_errors_when_no_log_present() {
        // Spec: a directory with no *.log file yields the "no log file" error.
        let dir = temp_dir("nolog");
        std::fs::write(dir.join("notes.txt"), "not a log").unwrap();

        let result = newest_log_file(&dir);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Nie znaleziono"));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn newest_log_file_picks_most_recent() {
        let dir = temp_dir("newest");
        let older = dir.join("karaoke.1.log");
        let newer = dir.join("karaoke.log");
        write_lines(&older, 1);
        // Ensure a distinct, later mtime on the second file.
        std::thread::sleep(std::time::Duration::from_millis(20));
        write_lines(&newer, 1);

        let picked = newest_log_file(&dir).unwrap();
        assert_eq!(picked, newer);

        std::fs::remove_dir_all(&dir).ok();
    }
}
