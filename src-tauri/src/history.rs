//! One target's snapshots, gathered into a line the window can draw.
//!
//! **Why this is Rust and not TypeScript.** The frontend has no test runner —
//! the suite in this crate is the whole safety net — so anything with a rule
//! in it belongs on this side of the IPC boundary. The same reasoning already
//! put treemap layout in a crate rather than in `Treemap.tsx`. What is left
//! for the window is drawing: a polyline and some labels.
//!
//! **What this deliberately does not do is forecast.** The hub fits a line
//! through these same points and refuses to extrapolate when the fit is poor.
//! Repeating that here would mean a second implementation of it, with its own
//! thresholds, drifting from the first. The desktop shows what happened; the
//! difference between two measurements is subtraction, and subtraction cannot
//! be wrong about the future.

use serde::Serialize;
use spacetrace_store::ScanMeta;

/// Every snapshot of one `(host, root)` pair, oldest first.
#[derive(Debug, Clone, Serialize)]
pub struct Target {
    pub host: String,
    /// The normalised root — what the points were grouped by, not whichever
    /// spelling the newest scan happened to use.
    pub root: String,
    pub points: Vec<Point>,
}

/// One measurement of a target.
///
/// Both measures travel: which one is drawn is the window's choice (the basis
/// is a parameter everywhere else in this app, and a history that silently
/// picked one would disagree with the toolbar above it).
#[derive(Debug, Clone, Serialize)]
pub struct Point {
    pub scan_id: i64,
    /// Unix seconds.
    pub at: i64,
    pub size: u64,
    pub alloc: u64,
    pub files: u64,
    pub label: Option<String>,
    pub fs_total: Option<u64>,
    pub fs_available: Option<u64>,
}

/// Trailing separators dropped, so one target does not become two.
///
/// `spacetrace scan /data` and `spacetrace scan /data/` store different
/// strings, and grouping on the raw value would split a year of history down
/// the middle without saying so. Nothing else is normalised: case folding
/// would merge two genuinely different directories on a case-sensitive
/// filesystem, and resolving symlinks would need the disk that took the
/// snapshot, which may be another machine.
fn normalise(root: &str) -> &str {
    let trimmed = root.trim_end_matches(['/', '\\']);
    // A root that *is* the separator has nothing left after trimming; keep it.
    if trimmed.is_empty() {
        return root;
    }
    trimmed
}

/// Group scans into targets: newest activity first, points within a target
/// oldest first.
///
/// The ordering is not cosmetic. Points ascend because a line chart reads left
/// to right in time, and targets descend because the one scanned most recently
/// is the one the user just came from.
pub fn targets(scans: Vec<ScanMeta>) -> Vec<Target> {
    let mut grouped: Vec<Target> = Vec::new();

    for scan in scans {
        let root = normalise(&scan.root);
        let point = Point {
            scan_id: scan.id,
            at: scan.started_at,
            size: scan.total_size,
            alloc: scan.total_alloc,
            files: scan.files,
            label: scan.label.clone(),
            fs_total: scan.fs_total,
            fs_available: scan.fs_available,
        };
        match grouped
            .iter_mut()
            .find(|t| t.host == scan.host && t.root == root)
        {
            Some(target) => target.points.push(point),
            None => grouped.push(Target {
                host: scan.host.clone(),
                root: root.to_string(),
                points: vec![point],
            }),
        }
    }

    for target in &mut grouped {
        // By id after time, so two scans that started in the same second still
        // land in a defined order rather than whichever the database returned.
        target.points.sort_by_key(|p| (p.at, p.scan_id));
    }
    grouped.sort_by(|a, b| {
        let latest = |t: &Target| t.points.last().map_or(i64::MIN, |p| p.at);
        latest(b)
            .cmp(&latest(a))
            .then_with(|| a.host.cmp(&b.host))
            .then_with(|| a.root.cmp(&b.root))
    });
    grouped
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scan(id: i64, host: &str, root: &str, at: i64, size: u64) -> ScanMeta {
        ScanMeta {
            id,
            host: host.to_string(),
            root: root.to_string(),
            started_at: at,
            duration_ms: 0,
            total_size: size,
            total_alloc: size,
            files: 1,
            dirs: 1,
            errors: 0,
            hardlinks_deduped: 0,
            scanner_version: "test".to_string(),
            label: None,
            fs_total: None,
            fs_available: None,
        }
    }

    #[test]
    fn scans_of_one_root_become_one_target() {
        let out = targets(vec![
            scan(1, "mac", "/data", 100, 10),
            scan(2, "mac", "/data", 200, 20),
        ]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].points.len(), 2);
    }

    /// The whole reason `normalise` exists: the same directory typed two ways
    /// is the same history.
    #[test]
    fn a_trailing_separator_does_not_split_a_history() {
        let out = targets(vec![
            scan(1, "mac", "/data", 100, 10),
            scan(2, "mac", "/data/", 200, 20),
            scan(3, "mac", "/data///", 300, 30),
        ]);
        assert_eq!(out.len(), 1, "one directory, one line");
        assert_eq!(out[0].root, "/data");
    }

    /// Trimming must not eat a root that is nothing but a separator, or the
    /// filesystem root would group with every empty string in the table.
    #[test]
    fn the_filesystem_root_survives_normalisation() {
        let out = targets(vec![scan(1, "mac", "/", 100, 10)]);
        assert_eq!(out[0].root, "/");
    }

    #[test]
    fn the_same_path_on_two_hosts_is_two_targets() {
        let out = targets(vec![
            scan(1, "mac", "/data", 100, 10),
            scan(2, "nas", "/data", 200, 20),
        ]);
        assert_eq!(out.len(), 2);
    }

    #[test]
    fn points_ascend_in_time_whatever_order_they_arrive_in() {
        let out = targets(vec![
            scan(3, "mac", "/data", 300, 30),
            scan(1, "mac", "/data", 100, 10),
            scan(2, "mac", "/data", 200, 20),
        ]);
        let ats: Vec<i64> = out[0].points.iter().map(|p| p.at).collect();
        assert_eq!(ats, vec![100, 200, 300]);
    }

    /// Two scans in the same second must not be able to swap places between
    /// two calls; the window shows a delta per step and a flapping order would
    /// flip its sign.
    #[test]
    fn a_tie_in_time_is_broken_by_id() {
        let out = targets(vec![
            scan(9, "mac", "/data", 100, 90),
            scan(4, "mac", "/data", 100, 40),
        ]);
        let ids: Vec<i64> = out[0].points.iter().map(|p| p.scan_id).collect();
        assert_eq!(ids, vec![4, 9]);
    }

    #[test]
    fn the_most_recently_scanned_target_comes_first() {
        let out = targets(vec![
            scan(1, "mac", "/old", 100, 10),
            scan(2, "mac", "/new", 500, 20),
            scan(3, "mac", "/old", 200, 30),
        ]);
        assert_eq!(out[0].root, "/new");
        assert_eq!(out[1].root, "/old");
    }

    /// A target seen once is still a target. It has no line to draw, but
    /// dropping it would hide a folder the user did store a snapshot of.
    #[test]
    fn a_target_with_one_point_is_kept() {
        let out = targets(vec![scan(1, "mac", "/data", 100, 10)]);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].points.len(), 1);
    }

    #[test]
    fn no_scans_is_no_targets() {
        assert!(targets(Vec::new()).is_empty());
    }

    /// Both measures reach the window. Drawing logical bytes under an on-disk
    /// heading is the mistake invariant 6 exists to prevent, and the window
    /// cannot avoid it if only one number arrives.
    #[test]
    fn a_point_carries_both_measures() {
        let mut meta = scan(1, "mac", "/data", 100, 10);
        meta.total_alloc = 99;
        let out = targets(vec![meta]);
        assert_eq!(out[0].points[0].size, 10);
        assert_eq!(out[0].points[0].alloc, 99);
    }
}

/// The command's own path, against a database on disk.
///
/// The unit tests above prove the grouping; this proves the wiring — that the
/// rows `Store::list` hands back are the ones `targets` groups, with the
/// column meanings intact. It is a separate test because a `SELECT` that
/// returned `total_alloc` where `total_size` belongs would pass every test in
/// this file.
#[cfg(test)]
mod end_to_end {
    use spacetrace_scan_core::{scan, ScanOptions, ScanProgress};
    use spacetrace_store::Store;
    use std::sync::Arc;

    #[test]
    fn the_command_groups_what_the_store_holds() {
        let dir = tempfile::tempdir().unwrap();
        // Deliberately not a whole number of blocks, so the logical and
        // on-disk totals differ and the assertions below can tell them apart.
        std::fs::write(dir.path().join("a.bin"), vec![7u8; 100]).unwrap();
        let (tree, stats) = scan(
            dir.path(),
            ScanOptions::default(),
            Arc::new(ScanProgress::default()),
        )
        .unwrap();

        let db = dir.path().join("snapshots.sqlite");
        let mut store = Store::open(&db).unwrap();
        store.save(&tree, &stats, "hostA", None).unwrap();
        store.save(&tree, &stats, "hostA", Some("again")).unwrap();
        store.save(&tree, &stats, "hostB", None).unwrap();
        drop(store);

        let found = tauri::async_runtime::block_on(super::super::snapshot_history(
            db.to_string_lossy().into_owned(),
        ))
        .unwrap();

        // Two hosts, one root: the same directory on two machines is two
        // histories, and the one with two scans has two points.
        assert_eq!(found.len(), 2);
        let a = found.iter().find(|t| t.host == "hostA").unwrap();
        assert_eq!(a.points.len(), 2);
        assert_eq!(
            found
                .iter()
                .find(|t| t.host == "hostB")
                .unwrap()
                .points
                .len(),
            1
        );

        // The sizes are the scan's, not some neighbouring column's — and the
        // two measures must actually differ here, or asserting both of them
        // proves only that one column was read twice.
        assert_ne!(
            tree.total_size(),
            tree.total_alloc(),
            "directory blocks should make on-disk larger than logical"
        );
        assert_eq!(a.points[0].size, tree.total_size());
        assert_eq!(a.points[0].alloc, tree.total_alloc());
        assert_eq!(a.points[1].label.as_deref(), Some("again"));
    }
}
