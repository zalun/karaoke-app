//! Secret redaction for log tails before they leave the app.
//!
//! `get_log_tail` runs the returned log tail through [`redact_secrets`] so tokens
//! accidentally written to the log never reach the feedback backend or a public
//! GitHub issue. The patterns mirror the formats actually emitted by Supabase,
//! Tauri, and our own crates today. Redaction is best-effort: it targets known
//! token shapes and is not a guarantee that every secret is caught.

use regex::Regex;
use std::sync::OnceLock;

/// `Authorization: Bearer <token>` headers.
fn bearer_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)Bearer\s+[A-Za-z0-9\-._~+/]+=*").unwrap())
}

/// JWTs (including Supabase access tokens), which always start `eyJ`.
fn jwt_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"eyJ[A-Za-z0-9_\-.]{20,}").unwrap())
}

/// Supabase key/token prefixes (`sb-…`, `sbp_…`).
fn supabase_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"sb-[A-Za-z0-9_\-]{20,}|sbp_[A-Za-z0-9]{20,}").unwrap())
}

/// OpenAI-style API keys (`sk-...`).
fn api_key_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"sk-[A-Za-z0-9]{20,}").unwrap())
}

/// Catch-all for long opaque tokens not matched above: 40+ base64-ish or 32+ hex chars.
fn opaque_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[A-Za-z0-9+/=]{40,}|[A-Fa-f0-9]{32,}").unwrap())
}

/// Redact common secret formats from `input`, returning a sanitized copy.
///
/// Specific patterns (Bearer, JWT, Supabase, API keys) are masked first; the
/// opaque catch-all then masks any remaining long hex/base64 runs. Because each
/// pass runs over the previous pass's output, already-redacted placeholders
/// (which contain no long token runs) are left untouched.
pub fn redact_secrets(input: &str) -> String {
    let out = bearer_re().replace_all(input, "Bearer [REDACTED]");
    let out = jwt_re().replace_all(&out, "[REDACTED_JWT]");
    let out = supabase_re().replace_all(&out, "[REDACTED_SUPABASE]");
    let out = api_key_re().replace_all(&out, "[REDACTED_KEY]");
    opaque_re().replace_all(&out, "[REDACTED_OPAQUE]").into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Assert `secret` was fully scrubbed from `result`: not only is the whole
    /// token absent, but neither its leading nor trailing fragment survives.
    /// This guards the spec's "original token characters are not present"
    /// guarantee against a regression that leaks a partial token. Tokens here
    /// are ASCII, so fragment slicing stays on char boundaries.
    fn assert_scrubbed(result: &str, secret: &str) {
        assert!(!result.contains(secret), "full secret leaked: {result}");
        let frag = 16.min(secret.len());
        assert!(
            !result.contains(&secret[..frag]),
            "leading fragment leaked: {result}"
        );
        assert!(
            !result.contains(&secret[secret.len() - frag..]),
            "trailing fragment leaked: {result}"
        );
    }

    #[test]
    fn redacts_jwt() {
        // ~200-char token with varied chars so a partial leak is detectable.
        let token = format!("eyJ{}", "aB3xZ9kQ7w".repeat(20));
        let result = redact_secrets(&format!("auth ok token={token} done"));
        assert!(result.contains("[REDACTED_JWT]"), "got: {result}");
        assert_scrubbed(&result, &token);
    }

    #[test]
    fn redacts_supabase_sb_key() {
        let key = format!("sb-{}", "p7Qm2Vt9Lx".repeat(4));
        let result = redact_secrets(&format!("using {key}"));
        assert!(result.contains("[REDACTED_SUPABASE]"), "got: {result}");
        assert_scrubbed(&result, &key);
    }

    #[test]
    fn redacts_supabase_sbp_key() {
        let key = format!("sbp_{}", "a1b2c3D4e5".repeat(4));
        let result = redact_secrets(&format!("service role {key} end"));
        assert!(result.contains("[REDACTED_SUPABASE]"), "got: {result}");
        assert_scrubbed(&result, &key);
    }

    #[test]
    fn redacts_bearer_token() {
        let result = redact_secrets("Authorization: Bearer abc123.def456-ghi_789");
        assert!(result.contains("Bearer [REDACTED]"), "got: {result}");
        assert_scrubbed(&result, "abc123.def456-ghi_789");
    }

    #[test]
    fn redacts_openai_style_key() {
        let key = format!("sk-{}", "Z9aQ7wK2mP".repeat(4));
        let result = redact_secrets(&format!("openai {key}"));
        assert!(result.contains("[REDACTED_KEY]"), "got: {result}");
        assert_scrubbed(&result, &key);
    }

    #[test]
    fn redacts_long_hex_run() {
        let hex = "0123456789abcdef".repeat(3); // 48 hex chars
        let result = redact_secrets(&format!("hash={hex}"));
        assert!(result.contains("[REDACTED_OPAQUE]"), "got: {result}");
        assert_scrubbed(&result, &hex);
    }

    #[test]
    fn redacts_long_base64_run() {
        let b64 = format!("{}+/=", "Ab9".repeat(15)); // > 40 base64-ish chars
        let result = redact_secrets(&format!("blob {b64}"));
        assert!(result.contains("[REDACTED_OPAQUE]"), "got: {result}");
    }

    #[test]
    fn leaves_normal_log_lines_unchanged() {
        let line = "[2026-05-25][INFO][App] Now playing: \"Bohemian Rhapsody\" by Queen (3:42)";
        assert_eq!(redact_secrets(line), line);
    }

    #[test]
    fn leaves_short_hex_unchanged() {
        // A short hex id (e.g. a 8-char config hash prefix) must not be redacted.
        let line = "config_hash=abc12345 displays=2";
        assert_eq!(redact_secrets(line), line);
    }
}
