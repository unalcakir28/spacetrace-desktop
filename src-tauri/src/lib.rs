//! Tauri commands backing the spacetrace desktop app.
//!
//! The whole app is a shell around the open-source core: scanning, snapshot
//! storage, diffing and treemap layout all happen in those crates, and this
//! file is the boundary where their types become something a WebView can hold.
//!
//! Two decisions shape everything here.
//!
//! **The tree stays in Rust.** A scan of a real disk is millions of nodes; a
//! couple of hundred megabytes of it does not belong in a JavaScript heap, and
//! serialising it across the IPC boundary would cost more than the scan. The
//! frontend holds node *ids* and asks for what it needs to draw.
//!
//! **Tile payloads carry no strings.** Layout returns numbers only, so a map of
//! twenty thousand tiles is a few hundred kilobytes rather than megabytes.
//! Names are fetched separately for the handful of tiles large enough to carry
//! a label, and for whatever the pointer is over.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::{Deserialize, Serialize};
use spacetrace_scan_core::{scan, EntryKind, NodeId, ScanOptions, ScanProgress, Tree};
use spacetrace_store::{ScanMeta, Store};
use spacetrace_treemap::{layout, LayoutOptions, Rect};

mod remote;

/// Where the tree currently on screen came from. Shown in the UI, and it also
/// decides whether destructive actions are allowed: you may not delete a file
/// on another machine, or one that only exists in a snapshot of the past.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Source {
    /// A scan of this machine's filesystem, taken just now.
    Live { root: String },
    /// A stored snapshot, local or downloaded.
    Snapshot {
        root: String,
        host: String,
        scan_id: i64,
        started_at: i64,
        label: Option<String>,
        /// The agent it came from, when it was not taken here.
        remote: Option<String>,
    },
}

impl Source {
    /// Only a live scan of this machine describes files that still exist where
    /// the tree says they do.
    fn is_live(&self) -> bool {
        matches!(self, Source::Live { .. })
    }
}

struct Loaded {
    tree: Tree,
    source: Source,
    generation: u64,
}

#[derive(Default)]
pub struct AppState {
    current: Mutex<Option<Loaded>>,
    /// Incremented every time a different tree is loaded.
    ///
    /// This is what makes a node id meaningful. On its own an id is just an
    /// index, so an id obtained from one scan will happily address a
    /// completely different entry in the next one — and the frontend can hold
    /// stale ids in flight while a new scan replaces the tree underneath it.
    /// Pairing every id with the generation it came from turns that class of
    /// bug into a plain error instead of a wrong answer.
    generation: AtomicU64,
}

/// Returned when a request carries ids from a tree that is no longer open.
/// Callers are expected to recognise it and simply drop the result.
pub const STALE_GENERATION: &str = "stale-generation";

impl AppState {
    /// Read the open tree without caring which one it is. Only for commands
    /// that take no node id.
    fn with_tree<T>(
        &self,
        f: impl FnOnce(&Tree, &Source) -> Result<T, String>,
    ) -> Result<T, String> {
        let guard = self.current.lock().map_err(|_| lock_poisoned())?;
        let loaded = guard.as_ref().ok_or("nothing is open yet")?;
        f(&loaded.tree, &loaded.source)
    }

    /// Read the open tree, but only if it is still the one `generation` names.
    fn with_tree_at<T>(
        &self,
        generation: u64,
        f: impl FnOnce(&Tree, &Source) -> Result<T, String>,
    ) -> Result<T, String> {
        let guard = self.current.lock().map_err(|_| lock_poisoned())?;
        let loaded = guard.as_ref().ok_or("nothing is open yet")?;
        if loaded.generation != generation {
            return Err(STALE_GENERATION.to_string());
        }
        f(&loaded.tree, &loaded.source)
    }

    fn set(&self, tree: Tree, source: Source) -> Result<u64, String> {
        let mut guard = self.current.lock().map_err(|_| lock_poisoned())?;
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        *guard = Some(Loaded {
            tree,
            source,
            generation,
        });
        Ok(generation)
    }
}

fn lock_poisoned() -> String {
    "internal state is unusable after an earlier panic; restart the app".to_string()
}

// ------------------------------------------------------------------- views

/// What the frontend shows for one entry.
#[derive(Debug, Clone, Serialize)]
pub struct EntryView {
    pub node: NodeId,
    pub name: String,
    /// Path relative to the scan root, `/`-separated. Empty for the root.
    pub rel_path: String,
    pub is_dir: bool,
    pub size: u64,
    pub alloc: u64,
    pub files: u64,
    pub dirs: u64,
    pub mtime: i64,
    /// Number of children, so the tree panel can draw a disclosure arrow
    /// without asking for them.
    pub child_count: u32,
    pub category: Category,
}

/// Coarse file-type bucket, used for colour. Deliberately small: a legend with
/// forty entries is not a legend.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Category {
    Directory,
    Image,
    Video,
    Audio,
    Document,
    Archive,
    Code,
    Binary,
    Cache,
    Other,
}

impl Category {
    fn of(name: &str, kind: EntryKind) -> Category {
        if kind == EntryKind::Dir {
            return Category::Directory;
        }
        let lower = name.to_ascii_lowercase();
        let ext = lower.rsplit_once('.').map(|(_, e)| e).unwrap_or("");
        match ext {
            "jpg" | "jpeg" | "png" | "gif" | "webp" | "heic" | "tiff" | "bmp" | "svg" | "raw"
            | "cr2" | "nef" | "psd" => Category::Image,
            "mp4" | "mov" | "mkv" | "avi" | "webm" | "m4v" | "wmv" | "flv" | "mpg" | "mpeg" => {
                Category::Video
            }
            "mp3" | "flac" | "wav" | "aac" | "ogg" | "m4a" | "opus" | "aiff" => Category::Audio,
            "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "rtf"
            | "odt" | "csv" | "epub" => Category::Document,
            "zip" | "tar" | "gz" | "bz2" | "xz" | "zst" | "7z" | "rar" | "dmg" | "iso" | "pkg" => {
                Category::Archive
            }
            "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "java" | "c" | "h" | "cpp"
            | "hpp" | "cs" | "rb" | "php" | "swift" | "kt" | "sh" | "html" | "css" | "json"
            | "toml" | "yaml" | "yml" | "sql" => Category::Code,
            "so" | "dylib" | "dll" | "a" | "o" | "exe" | "bin" | "wasm" | "class" | "pyc" => {
                Category::Binary
            }
            "log" | "tmp" | "temp" | "cache" | "lock" | "swp" => Category::Cache,
            _ => Category::Other,
        }
    }
}

fn entry_view(tree: &Tree, id: NodeId) -> EntryView {
    let n = tree.node(id);
    EntryView {
        node: id,
        name: n.name.clone(),
        rel_path: tree.rel_path(id),
        is_dir: n.is_dir(),
        size: n.size,
        alloc: n.alloc,
        files: n.files,
        dirs: n.dirs,
        mtime: n.mtime,
        child_count: n.children_len,
        category: Category::of(&n.name, n.kind),
    }
}

/// Summary of whatever is now open.
#[derive(Debug, Clone, Serialize)]
pub struct Opened {
    /// Which tree the ids in this response belong to. Every later request that
    /// names a node must pass it back.
    pub generation: u64,
    pub source: Source,
    pub root: EntryView,
    pub total_size: u64,
    pub total_alloc: u64,
    pub entries: usize,
    /// Only a live scan can be acted on; a snapshot is a photograph.
    pub can_modify: bool,
    pub scan_errors: u64,
    pub error_samples: Vec<String>,
}

fn opened(
    tree: &Tree,
    source: &Source,
    errors: u64,
    samples: Vec<String>,
    generation: u64,
) -> Opened {
    Opened {
        generation,
        source: source.clone(),
        root: entry_view(tree, tree.root()),
        total_size: tree.total_size(),
        total_alloc: tree.total_alloc(),
        entries: tree.len(),
        can_modify: source.is_live(),
        scan_errors: errors,
        error_samples: samples,
    }
}

// ---------------------------------------------------------------- commands

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ScanRequest {
    pub path: String,
    #[serde(default)]
    pub exclude: Vec<String>,
    #[serde(default)]
    pub one_file_system: bool,
    #[serde(default)]
    pub depth: Option<usize>,
    #[serde(default)]
    pub no_dedupe: bool,
}

/// Scan a directory on this machine and make it the open tree.
///
/// Blocking and potentially slow, so the frontend runs it off the UI thread by
/// awaiting the invoke; Tauri already dispatches commands on a worker.
#[tauri::command]
fn scan_directory(state: tauri::State<'_, AppState>, req: ScanRequest) -> Result<Opened, String> {
    let path = PathBuf::from(&req.path);
    if !path.is_dir() {
        return Err(format!("not a directory: {}", path.display()));
    }
    let options = ScanOptions {
        exclude_names: req.exclude.clone(),
        one_filesystem: req.one_file_system,
        max_depth: req.depth,
        dedupe_hardlinks: !req.no_dedupe,
    };

    let (tree, stats) = scan(&path, options, Arc::new(ScanProgress::default()))
        .map_err(|e| format!("cannot scan {}: {e:#}", path.display()))?;

    let samples: Vec<String> = stats
        .error_samples
        .iter()
        .take(20)
        .map(|(p, e)| format!("{} — {e}", p.display()))
        .collect();
    let source = Source::Live {
        root: tree.root_path().to_string_lossy().into_owned(),
    };
    let generation = state.set(tree, source)?;
    state.with_tree(|tree, source| Ok(opened(tree, source, stats.errors, samples.clone(), generation)))
}

/// Snapshots stored in a database file.
#[tauri::command]
fn list_snapshots(db: String) -> Result<Vec<ScanMeta>, String> {
    Store::open(&db)
        .and_then(|s| s.list())
        .map_err(|e| format!("cannot read {db}: {e:#}"))
}

/// Open one stored snapshot.
#[tauri::command]
fn open_snapshot(
    state: tauri::State<'_, AppState>,
    db: String,
    scan_id: i64,
) -> Result<Opened, String> {
    let store = Store::open(&db).map_err(|e| format!("cannot open {db}: {e:#}"))?;
    let (tree, meta) = store
        .load(scan_id)
        .map_err(|e| format!("cannot load snapshot #{scan_id}: {e:#}"))?;

    let source = snapshot_source(&meta, None);
    let generation = state.set(tree, source)?;
    state.with_tree(|tree, source| Ok(opened(tree, source, meta.errors, Vec::new(), generation)))
}

fn snapshot_source(meta: &ScanMeta, remote: Option<String>) -> Source {
    Source::Snapshot {
        root: meta.root.clone(),
        host: meta.host.clone(),
        scan_id: meta.id,
        started_at: meta.started_at,
        label: meta.label.clone(),
        remote,
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct LayoutRequest {
    /// Which tree `node` belongs to; see [`AppState::generation`].
    pub generation: u64,
    /// Subtree to lay out; the frontend passes the zoom target.
    pub node: NodeId,
    pub width: f64,
    pub height: f64,
    #[serde(default = "default_min_area")]
    pub min_area: f64,
    #[serde(default = "default_padding")]
    pub padding: f64,
    #[serde(default)]
    pub max_depth: Option<u16>,
}

fn default_min_area() -> f64 {
    6.0
}

fn default_padding() -> f64 {
    1.0
}

/// Tiles as parallel flat arrays.
///
/// One array per field rather than an array of objects: the same data costs
/// roughly a third of the JSON, and the frontend feeds it straight into typed
/// arrays for drawing without reshaping it first.
#[derive(Debug, Clone, Default, Serialize)]
pub struct TileArrays {
    pub node: Vec<NodeId>,
    pub x: Vec<f64>,
    pub y: Vec<f64>,
    pub w: Vec<f64>,
    pub h: Vec<f64>,
    pub depth: Vec<u16>,
    pub is_dir: Vec<bool>,
    pub truncated: Vec<bool>,
    pub category: Vec<u8>,
    /// Parent index *within these arrays*, or -1 for the root tile. Lets the
    /// frontend walk the map without asking anything else.
    pub parent: Vec<i32>,
    pub count: usize,
}

/// Lay out a subtree. Returns tiles in draw order: a parent always precedes its
/// own children, so painting the array in order puts children on top.
#[tauri::command]
fn treemap(state: tauri::State<'_, AppState>, req: LayoutRequest) -> Result<TileArrays, String> {
    state.with_tree_at(req.generation, |tree, _| {
        if req.node as usize >= tree.len() {
            return Err(format!("no entry {}", req.node));
        }
        let options = LayoutOptions {
            min_area: req.min_area.max(0.5),
            padding: req.padding.max(0.0),
            max_depth: req.max_depth,
        };
        let map = layout(
            tree,
            req.node,
            Rect::new(0.0, 0.0, req.width, req.height),
            &options,
        );

        // Index tiles by their position so parents can be referenced by index.
        let mut arrays = TileArrays::default();
        let mut position = std::collections::HashMap::with_capacity(map.len());
        for (index, tile) in map.tiles().iter().enumerate() {
            position.insert(tile.node, index as i32);
        }

        for tile in map.tiles() {
            let n = tree.node(tile.node);
            arrays.node.push(tile.node);
            arrays.x.push(tile.rect.x);
            arrays.y.push(tile.rect.y);
            arrays.w.push(tile.rect.w);
            arrays.h.push(tile.rect.h);
            arrays.depth.push(tile.depth);
            arrays.is_dir.push(n.is_dir());
            arrays.truncated.push(tile.truncated);
            arrays.category.push(Category::of(&n.name, n.kind) as u8);
            arrays.parent.push(if tile.node == req.node {
                -1
            } else {
                // The layout root's own parent is outside this map.
                position.get(&n.parent).copied().unwrap_or(-1)
            });
        }
        arrays.count = arrays.node.len();
        Ok(arrays)
    })
}

/// Names for specific entries, for the tiles big enough to be labelled.
#[tauri::command]
fn labels(
    state: tauri::State<'_, AppState>,
    generation: u64,
    nodes: Vec<NodeId>,
) -> Result<Vec<String>, String> {
    state.with_tree_at(generation, |tree, _| {
        Ok(nodes
            .into_iter()
            .map(|id| {
                if (id as usize) < tree.len() {
                    tree.node(id).name.clone()
                } else {
                    String::new()
                }
            })
            .collect())
    })
}

/// Full detail for one entry, for the hover panel and the inspector.
#[tauri::command]
fn entry(
    state: tauri::State<'_, AppState>,
    generation: u64,
    node: NodeId,
) -> Result<EntryView, String> {
    state.with_tree_at(generation, |tree, _| {
        if node as usize >= tree.len() {
            return Err(format!("no entry {node}"));
        }
        Ok(entry_view(tree, node))
    })
}

/// Children of a directory, largest first — what the tree panel lists.
#[tauri::command]
fn children(
    state: tauri::State<'_, AppState>,
    generation: u64,
    node: NodeId,
    limit: Option<usize>,
) -> Result<Vec<EntryView>, String> {
    state.with_tree_at(generation, |tree, _| {
        if node as usize >= tree.len() {
            return Err(format!("no entry {node}"));
        }
        let mut kids: Vec<EntryView> = tree
            .children_by_size(node)
            .into_iter()
            .map(|c| entry_view(tree, c))
            .collect();
        if let Some(limit) = limit {
            kids.truncate(limit);
        }
        Ok(kids)
    })
}

/// Ancestors of an entry, root first, for breadcrumbs.
#[tauri::command]
fn ancestors(
    state: tauri::State<'_, AppState>,
    generation: u64,
    node: NodeId,
) -> Result<Vec<EntryView>, String> {
    state.with_tree_at(generation, |tree, _| {
        if node as usize >= tree.len() {
            return Err(format!("no entry {node}"));
        }
        let mut chain = Vec::new();
        let mut current = node;
        loop {
            chain.push(entry_view(tree, current));
            let n = tree.node(current);
            if !n.has_parent() {
                break;
            }
            current = n.parent;
        }
        chain.reverse();
        Ok(chain)
    })
}

/// The absolute path of an entry on the machine that was scanned.
#[tauri::command]
fn absolute_path(
    state: tauri::State<'_, AppState>,
    generation: u64,
    node: NodeId,
) -> Result<String, String> {
    state.with_tree_at(generation, |tree, _| {
        if node as usize >= tree.len() {
            return Err(format!("no entry {node}"));
        }
        Ok(tree.path(node).to_string_lossy().into_owned())
    })
}

// ------------------------------------------------------- acting on files

/// Show an entry in Finder / Explorer / the desktop file manager.
#[tauri::command]
fn reveal(
    state: tauri::State<'_, AppState>,
    generation: u64,
    node: NodeId,
) -> Result<(), String> {
    let path = live_path(&state, generation, node)?;
    reveal_path(&path)
}

/// Move an entry to the system trash.
///
/// Trash rather than delete, and only for a live scan: the tree may be a
/// snapshot of the past or of another machine, where the path either no longer
/// means what it says or is not ours to touch.
#[tauri::command]
fn move_to_trash(
    state: tauri::State<'_, AppState>,
    generation: u64,
    node: NodeId,
) -> Result<(), String> {
    let path = live_path(&state, generation, node)?;
    // Re-check on the real filesystem: the tree is a snapshot in time even when
    // it was taken seconds ago, and the user may be looking at something that
    // has since been replaced.
    if !path.exists() {
        return Err(format!("{} no longer exists", path.display()));
    }
    trash::delete(&path).map_err(|e| format!("cannot move {} to the trash: {e}", path.display()))
}

/// Resolve a node to a path, refusing when the open tree is not a live scan of
/// this machine.
fn live_path(
    state: &tauri::State<'_, AppState>,
    generation: u64,
    node: NodeId,
) -> Result<PathBuf, String> {
    state.with_tree_at(generation, |tree, source| {
        if !source.is_live() {
            return Err(
                "this is a stored snapshot, not the live filesystem; open a fresh scan to act on files"
                    .to_string(),
            );
        }
        if node as usize >= tree.len() {
            return Err(format!("no entry {node}"));
        }
        if node == tree.root() {
            return Err("refusing to act on the scan root itself".to_string());
        }
        Ok(tree.path(node))
    })
}

#[cfg(target_os = "macos")]
fn reveal_path(path: &Path) -> Result<(), String> {
    std::process::Command::new("open")
        .arg("-R")
        .arg(path)
        .status()
        .map_err(|e| format!("cannot open Finder: {e}"))
        .and_then(status_ok)
}

#[cfg(target_os = "windows")]
fn reveal_path(path: &Path) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(format!("/select,{}", path.display()))
        .status()
        .map_err(|e| format!("cannot open Explorer: {e}"))
        .and_then(status_ok)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn reveal_path(path: &Path) -> Result<(), String> {
    // No portable "select this file" on Linux, so open the containing folder.
    let target = path.parent().unwrap_or(path);
    std::process::Command::new("xdg-open")
        .arg(target)
        .status()
        .map_err(|e| format!("cannot open the file manager: {e}"))
        .and_then(status_ok)
}

fn status_ok(status: std::process::ExitStatus) -> Result<(), String> {
    if status.success() {
        Ok(())
    } else {
        Err(format!("the file manager exited with {status}"))
    }
}

// ------------------------------------------------------------------- diff

#[derive(Debug, Clone, Serialize)]
pub struct ChangeView {
    pub path: String,
    pub kind: String,
    pub is_dir: bool,
    pub old_size: u64,
    pub new_size: u64,
    pub delta: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiffView {
    pub from: ScanMeta,
    pub to: ScanMeta,
    pub old_total: u64,
    pub new_total: u64,
    pub delta: i64,
    pub changes: Vec<ChangeView>,
}

/// Compare two stored snapshots.
#[tauri::command]
fn diff_snapshots(
    db: String,
    from: i64,
    to: i64,
    min_delta: Option<u64>,
    include_files: Option<bool>,
) -> Result<DiffView, String> {
    let store = Store::open(&db).map_err(|e| format!("cannot open {db}: {e:#}"))?;
    let (old_tree, old_meta) = store
        .load(from)
        .map_err(|e| format!("cannot load snapshot #{from}: {e:#}"))?;
    let (new_tree, new_meta) = store
        .load(to)
        .map_err(|e| format!("cannot load snapshot #{to}: {e:#}"))?;

    let options = spacetrace_diff::DiffOptions {
        min_delta: min_delta.unwrap_or(1024 * 1024),
        include_files: include_files.unwrap_or(false),
        ..Default::default()
    };
    let report = spacetrace_diff::diff(&old_tree, &new_tree, &options);

    Ok(DiffView {
        old_total: report.old_total,
        new_total: report.new_total,
        delta: report.delta(),
        changes: report
            .changes
            .iter()
            .map(|c| ChangeView {
                path: c.path.clone(),
                kind: format!("{:?}", c.kind).to_lowercase(),
                is_dir: c.entry == EntryKind::Dir,
                old_size: c.old_size,
                new_size: c.new_size,
                delta: c.delta(),
            })
            .collect(),
        from: old_meta,
        to: new_meta,
    })
}

// ------------------------------------------------------------------ remote

/// Snapshots held by an agent.
#[tauri::command]
async fn remote_snapshots(url: String, token: String) -> Result<Vec<ScanMeta>, String> {
    remote::list(&url, &token)
        .await
        .map_err(|e| format!("{e:#}"))
}

/// Download a remote snapshot and open it, exactly as a local one would be.
#[tauri::command]
async fn open_remote_snapshot(
    state: tauri::State<'_, AppState>,
    url: String,
    token: String,
    scan_id: i64,
) -> Result<Opened, String> {
    let (tree, meta) = remote::fetch(&url, &token, scan_id)
        .await
        .map_err(|e| format!("{e:#}"))?;
    let source = snapshot_source(&meta, Some(url));
    let generation = state.set(tree, source)?;
    state.with_tree(|tree, source| Ok(opened(tree, source, meta.errors, Vec::new(), generation)))
}

/// Where the CLI keeps its snapshot database, so the app opens the same history.
#[tauri::command]
fn default_database() -> String {
    default_db_path().to_string_lossy().into_owned()
}

fn default_db_path() -> PathBuf {
    if let Ok(explicit) = std::env::var("SPACETRACE_HOME") {
        return PathBuf::from(explicit).join("snapshots.sqlite");
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_default();

    let dir = if cfg!(target_os = "macos") {
        home.join("Library/Application Support/spacetrace")
    } else if cfg!(target_os = "windows") {
        std::env::var("APPDATA")
            .map(PathBuf::from)
            .unwrap_or(home)
            .join("spacetrace")
    } else {
        std::env::var("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| home.join(".local/share"))
            .join("spacetrace")
    };
    dir.join("snapshots.sqlite")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            list_snapshots,
            open_snapshot,
            treemap,
            labels,
            entry,
            children,
            ancestors,
            absolute_path,
            reveal,
            move_to_trash,
            diff_snapshots,
            remote_snapshots,
            open_remote_snapshot,
            default_database,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the spacetrace desktop app");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn categories_follow_the_extension() {
        assert_eq!(Category::of("a.JPG", EntryKind::File), Category::Image);
        assert_eq!(Category::of("clip.mkv", EntryKind::File), Category::Video);
        assert_eq!(Category::of("main.rs", EntryKind::File), Category::Code);
        assert_eq!(Category::of("x.tar.gz", EntryKind::File), Category::Archive);
        assert_eq!(Category::of("debug.log", EntryKind::File), Category::Cache);
        assert_eq!(Category::of("noext", EntryKind::File), Category::Other);
        assert_eq!(Category::of("weird.", EntryKind::File), Category::Other);
    }

    #[test]
    fn a_directory_is_a_directory_whatever_it_is_called() {
        // A folder called "photos.jpg" is still a folder.
        assert_eq!(Category::of("photos.jpg", EntryKind::Dir), Category::Directory);
    }

    #[test]
    fn a_snapshot_source_is_never_live() {
        let snap = Source::Snapshot {
            root: "/var".into(),
            host: "nas".into(),
            scan_id: 3,
            started_at: 0,
            label: None,
            remote: None,
        };
        assert!(!snap.is_live());
        assert!(Source::Live { root: "/var".into() }.is_live());
    }

    #[test]
    fn nothing_is_open_at_startup() {
        let state = AppState::default();
        let err = state.with_tree(|_, _| Ok(())).unwrap_err();
        assert!(err.contains("nothing is open"), "{err}");
    }

    fn one_node_tree(name: &str) -> Tree {
        use spacetrace_scan_core::Node;
        Tree::from_parts(
            vec![Node {
                parent: Tree::NO_PARENT,
                name: name.to_string(),
                kind: EntryKind::Dir,
                size: 0,
                alloc: 0,
                own_size: 0,
                own_alloc: 0,
                mtime: 0,
                nlink: 1,
                files: 0,
                dirs: 0,
                children_start: 0,
                children_len: 0,
            }],
            PathBuf::from("/x"),
        )
    }

    fn live(root: &str) -> Source {
        Source::Live { root: root.into() }
    }

    #[test]
    fn each_loaded_tree_gets_a_new_generation() {
        let state = AppState::default();
        let first = state.set(one_node_tree("a"), live("/a")).unwrap();
        let second = state.set(one_node_tree("b"), live("/b")).unwrap();
        assert!(second > first, "{second} should follow {first}");
    }

    /// The whole point: an id obtained from an earlier tree must be refused
    /// rather than silently addressing a different entry.
    #[test]
    fn a_request_carrying_an_old_generation_is_refused() {
        let state = AppState::default();
        let old = state.set(one_node_tree("a"), live("/a")).unwrap();

        // Still current: it works.
        assert_eq!(
            state.with_tree_at(old, |tree, _| Ok(tree.node(0).name.clone())).unwrap(),
            "a"
        );

        // A new scan replaces the tree.
        let new = state.set(one_node_tree("b"), live("/b")).unwrap();

        let err = state.with_tree_at(old, |_, _| Ok(())).unwrap_err();
        assert_eq!(err, STALE_GENERATION);

        // And the current one still works, so the guard is not just refusing
        // everything.
        assert_eq!(
            state.with_tree_at(new, |tree, _| Ok(tree.node(0).name.clone())).unwrap(),
            "b"
        );
    }

    #[test]
    fn a_generation_from_the_future_is_also_refused() {
        let state = AppState::default();
        let current = state.set(one_node_tree("a"), live("/a")).unwrap();
        assert_eq!(
            state.with_tree_at(current + 1, |_, _| Ok(())).unwrap_err(),
            STALE_GENERATION
        );
    }

    #[test]
    fn the_generation_guard_still_reports_nothing_open_first() {
        // A stale-generation error would be misleading before anything is open.
        let state = AppState::default();
        let err = state.with_tree_at(1, |_, _| Ok(())).unwrap_err();
        assert!(err.contains("nothing is open"), "{err}");
    }
}
