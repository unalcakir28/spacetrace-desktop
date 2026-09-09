//! Errors the window can translate.
//!
//! Every command used to return `Result<_, String>` and the window showed the
//! string. That was fine while the app was English. It is not fine now: the
//! moment a person most needs to understand what happened is the moment the
//! text stops being in their language.
//!
//! So an error carries a **stable code** plus the values its sentence needs,
//! and the window owns the wording. The pattern is not new here — `isStale`
//! and `isCancelled` already matched on sentinel strings; this makes that the
//! rule instead of the exception.
//!
//! **`detail` is deliberately not translated.** It holds what the operating
//! system said: `Permission denied`, `No such file or directory`, an NTFS
//! error number. Those are the words that go into a search engine and the
//! words the OS itself would use; inventing a translation for them would make
//! them harder to act on, not easier.
//!
//! `From<String>` exists so that any error site not yet converted still
//! compiles and still reaches the user, as an untranslated detail. A missed
//! site degrades to what the app did yesterday rather than breaking.

use std::collections::BTreeMap;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    /// What went wrong, as a code the window looks up. Snake case, stable:
    /// renaming one is a user-visible change, because the fallback is the code
    /// itself.
    pub code: String,
    /// Values for the placeholders in the code's sentence.
    #[serde(skip_serializing_if = "BTreeMap::is_empty")]
    pub args: BTreeMap<String, String>,
    /// The operating system's own words, when there are any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl AppError {
    pub fn new(code: &str) -> Self {
        Self {
            code: code.to_string(),
            args: BTreeMap::new(),
            detail: None,
        }
    }

    /// A value for one of the sentence's placeholders.
    pub fn with(mut self, key: &str, value: impl std::fmt::Display) -> Self {
        self.args.insert(key.to_string(), value.to_string());
        self
    }

    /// What the operating system, SQLite or the scanner said.
    pub fn detail(mut self, detail: impl std::fmt::Display) -> Self {
        self.detail = Some(detail.to_string());
        self
    }
}

impl std::fmt::Display for AppError {
    /// For logs and tests. The window never sees this — it gets the fields.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.code)?;
        for (key, value) in &self.args {
            write!(f, " {key}={value}")?;
        }
        if let Some(detail) = &self.detail {
            write!(f, ": {detail}")?;
        }
        Ok(())
    }
}

impl std::error::Error for AppError {}

/// The escape hatch: an unconverted `String` still reaches the user.
impl From<String> for AppError {
    fn from(message: String) -> Self {
        AppError {
            code: "unknown".to_string(),
            args: BTreeMap::new(),
            detail: Some(message),
        }
    }
}

impl From<&str> for AppError {
    fn from(message: &str) -> Self {
        AppError::from(message.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_code_survives_serialisation_with_its_arguments() {
        let error = AppError::new("cannot_scan")
            .with("path", "/tmp/x")
            .detail("Permission denied");
        let json = serde_json::to_value(&error).expect("serialisable");
        assert_eq!(json["code"], "cannot_scan");
        assert_eq!(json["args"]["path"], "/tmp/x");
        assert_eq!(json["detail"], "Permission denied");
    }

    /// Empty fields are left out entirely, so the window can test for their
    /// presence rather than for emptiness.
    #[test]
    fn nothing_empty_is_sent() {
        let json = serde_json::to_value(AppError::new("no_entry")).expect("serialisable");
        assert_eq!(json["code"], "no_entry");
        assert!(json.get("args").is_none());
        assert!(json.get("detail").is_none());
    }

    /// The safety net: a site that still returns a String must reach the user
    /// rather than disappear.
    #[test]
    fn an_unconverted_string_becomes_an_untranslated_detail() {
        let error: AppError = "something specific went wrong".to_string().into();
        assert_eq!(error.code, "unknown");
        assert_eq!(
            error.detail.as_deref(),
            Some("something specific went wrong")
        );
    }

    #[test]
    fn display_is_for_logs_and_keeps_everything() {
        let error = AppError::new("cannot_open")
            .with("db", "/x.sqlite")
            .detail("locked");
        assert_eq!(error.to_string(), "cannot_open db=/x.sqlite: locked");
    }
}
