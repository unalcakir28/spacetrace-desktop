//! How big a folder was the last time this app scanned it.
//!
//! A progress bar needs a denominator, and a filesystem walk has none: nothing
//! knows how many entries are under a folder until it has looked. The one
//! honest denominator available is the previous scan of that same folder, so
//! that is what is kept here — an entry count, and nothing else.
//!
//! This is deliberately **not** the snapshot database. A snapshot is something
//! the user chose to keep and can compare against later; writing one every time
//! somebody glances at a folder would fill their history with entries they
//! never asked for. This is the app's own scratch note, and losing it costs a
//! progress bar and nothing more.
//!
//! The count is filed under the scan options as well as the path, because they
//! change the answer: scanning a project with `node_modules` excluded and then
//! without it are two different amounts of work, and using one to predict the
//! other would be worse than admitting there is no estimate.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use spacetrace_scan_core::ScanOptions;

const FILE: &str = "scan-hints.json";

/// Plenty for the folders anyone actually revisits, and small enough that the
/// file stays a few kilobytes. The oldest are dropped first.
const MAX_ENTRIES: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Hint {
    entries: u64,
    /// Unix seconds, used only to decide what to drop when the file is full.
    at: i64,
}

/// A `BTreeMap` so the file is stable on disk: rewriting it with the keys in a
/// different order every time makes it noise in any backup that watches it.
type Hints = BTreeMap<String, Hint>;

/// How many entries to expect under `path`, if this app has scanned it before
/// with these same options.
pub fn expected_entries(path: &Path, options: &ScanOptions) -> Option<u64> {
    let key = key(path, options);
    let hints = read(&hints_path()?)?;
    hints.get(&key).map(|hint| hint.entries).filter(|n| *n > 0)
}

/// Record what a finished scan found. Best effort throughout: a folder the user
/// can scan is not necessarily one this app can write next to, and failing to
/// save a progress hint is not a reason to fail a scan that already worked.
pub fn remember(path: &Path, options: &ScanOptions, entries: u64) {
    if entries == 0 {
        return;
    }
    let Some(file) = hints_path() else {
        return;
    };
    let mut hints = read(&file).unwrap_or_default();
    hints.insert(
        key(path, options),
        Hint {
            entries,
            at: now_seconds(),
        },
    );
    prune(&mut hints);
    write(&file, &hints);
}

/// Where the app keeps its own state, matching the CLI's data directory so both
/// look at the same snapshot database.
pub fn data_dir() -> Option<PathBuf> {
    if let Ok(explicit) = std::env::var("SPACETRACE_HOME") {
        if !explicit.is_empty() {
            return Some(PathBuf::from(explicit));
        }
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .map(PathBuf::from);

    if cfg!(target_os = "macos") {
        return Some(home?.join("Library/Application Support/spacetrace"));
    }
    if cfg!(target_os = "windows") {
        let base = std::env::var("APPDATA").ok().map(PathBuf::from).or(home)?;
        return Some(base.join("spacetrace"));
    }
    let base = std::env::var("XDG_DATA_HOME")
        .ok()
        .map(PathBuf::from)
        .or_else(|| home.as_ref().map(|h| h.join(".local/share")))?;
    Some(base.join("spacetrace"))
}

fn hints_path() -> Option<PathBuf> {
    Some(data_dir()?.join(FILE))
}

/// The path plus everything about the options that changes how much work a scan
/// is. Canonicalised where possible so `~/x` and `~/x/` are one folder, falling
/// back to the path as given rather than losing the hint entirely.
fn key(path: &Path, options: &ScanOptions) -> String {
    let resolved = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let mut excludes = options.exclude_names.clone();
    excludes.sort();
    format!(
        "{}\u{1f}{}\u{1f}{}\u{1f}{}\u{1f}{}",
        resolved.to_string_lossy(),
        excludes.join(","),
        options.one_filesystem,
        options.max_depth.map_or(String::new(), |d| d.to_string()),
        options.dedupe_hardlinks,
    )
}

fn read(file: &Path) -> Option<Hints> {
    let text = std::fs::read_to_string(file).ok()?;
    // A hint file written by a newer build, or half-written by a crash, is not
    // worth a word to the user: the cost is one scan without a percentage.
    serde_json::from_str(&text).ok()
}

fn write(file: &Path, hints: &Hints) {
    let Some(parent) = file.parent() else {
        return;
    };
    if std::fs::create_dir_all(parent).is_err() {
        return;
    }
    let Ok(text) = serde_json::to_string_pretty(hints) else {
        return;
    };
    // Written aside and renamed, so an interrupted write leaves the previous
    // file intact instead of a truncated one that then has to be discarded.
    let temp = file.with_extension("json.tmp");
    if std::fs::write(&temp, text).is_err() {
        return;
    }
    if std::fs::rename(&temp, file).is_err() {
        let _ = std::fs::remove_file(&temp);
    }
}

fn prune(hints: &mut Hints) {
    if hints.len() <= MAX_ENTRIES {
        return;
    }
    let mut by_age: Vec<(String, i64)> = hints
        .iter()
        .map(|(key, hint)| (key.clone(), hint.at))
        .collect();
    by_age.sort_by_key(|(_, at)| *at);
    let excess = hints.len() - MAX_ENTRIES;
    for (key, _) in by_age.into_iter().take(excess) {
        hints.remove(&key);
    }
}

fn now_seconds() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options(exclude: &[&str]) -> ScanOptions {
        ScanOptions {
            exclude_names: exclude.iter().map(|s| s.to_string()).collect(),
            ..Default::default()
        }
    }

    #[test]
    fn the_key_ignores_the_order_excludes_were_typed_in() {
        let a = key(Path::new("/tmp"), &options(&["node_modules", ".git"]));
        let b = key(Path::new("/tmp"), &options(&[".git", "node_modules"]));
        assert_eq!(a, b);
    }

    #[test]
    fn options_that_change_the_work_change_the_key() {
        let plain = key(Path::new("/tmp"), &options(&[]));
        let excluding = key(Path::new("/tmp"), &options(&["node_modules"]));
        assert_ne!(
            plain, excluding,
            "a scan skipping node_modules is not the same amount of work"
        );

        let deep = ScanOptions {
            max_depth: Some(2),
            ..Default::default()
        };
        assert_ne!(plain, key(Path::new("/tmp"), &deep));
    }

    #[test]
    fn a_separator_cannot_be_typed_into_a_folder_name() {
        // The key is joined with a unit separator precisely because a path or an
        // exclude pattern could otherwise be crafted to collide with another.
        let key = key(Path::new("/tmp"), &options(&["a"]));
        assert_eq!(key.matches('\u{1f}').count(), 4, "{key}");
    }

    #[test]
    fn a_hint_survives_a_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("nested").join(FILE);
        let mut hints = Hints::new();
        hints.insert("k".into(), Hint { entries: 42, at: 7 });

        write(&file, &hints);
        let back = read(&file).expect("what was written can be read");

        assert_eq!(back.get("k").unwrap().entries, 42);
    }

    #[test]
    fn a_corrupt_file_reads_as_no_hint_rather_than_an_error() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join(FILE);
        std::fs::write(&file, "{ this is not json").unwrap();
        assert!(read(&file).is_none());
    }

    #[test]
    fn a_missing_file_reads_as_no_hint() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read(&dir.path().join("absent.json")).is_none());
    }

    #[test]
    fn pruning_drops_the_oldest_first() {
        let mut hints = Hints::new();
        for i in 0..(MAX_ENTRIES as i64 + 10) {
            hints.insert(
                format!("key{i:04}"),
                Hint {
                    entries: 1,
                    at: i, // older keys have smaller timestamps
                },
            );
        }
        prune(&mut hints);

        assert_eq!(hints.len(), MAX_ENTRIES);
        assert!(!hints.contains_key("key0000"), "the oldest went first");
        assert!(hints.contains_key(&format!("key{:04}", MAX_ENTRIES + 9)));
    }

    #[test]
    fn pruning_leaves_a_file_that_is_not_full_alone() {
        let mut hints = Hints::new();
        hints.insert("only".into(), Hint { entries: 1, at: 0 });
        prune(&mut hints);
        assert_eq!(hints.len(), 1);
    }

    #[test]
    fn writing_atomically_leaves_no_temporary_file_behind() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join(FILE);
        write(&file, &Hints::new());

        let leftovers: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.file_name().to_string_lossy().into_owned())
            .filter(|name| name.ends_with(".tmp"))
            .collect();
        assert!(leftovers.is_empty(), "{leftovers:?}");
    }
}
