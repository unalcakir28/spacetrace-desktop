//! Tauri commands backing the spacetrace desktop app.
//!
//! The whole app is a shell around the open-source core: scanning, snapshot
//! storage, diffing and treemap layout all happen in those crates, and this
//! file is the boundary where their types become something a WebView can hold.
//!
//! Three decisions shape everything here.
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
//!
//! **Nothing here may run on the main thread for long.** A `#[tauri::command]`
//! without `async` is executed on the UI thread, so a scan declared that way
//! freezes the window until it finishes — which is precisely what a disk
//! analyser must not do, since scanning is the thing it exists to do. Commands
//! below are therefore either `async` (with the slow part handed to
//! `spawn_blocking`) or marked `#[tauri::command(async)]`, which keeps the
//! borrowed `State` but runs the body off the main thread. The only ones left
//! synchronous are the ones that must answer instantly and touch nothing but a
//! mutex, such as cancelling a scan.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, Instant};

use crate::error::AppError;
use serde::{Deserialize, Serialize};
use spacetrace_scan_core::{
    capacity_of, scan, Capacity, EntryKind, NodeId, ScanOptions, ScanProgress, ScanStats,
    SizeBasis, Tree,
};
use spacetrace_store::{ScanMeta, Store};
use spacetrace_treemap::{layout, LayoutOptions, Rect};
use tauri::Emitter;

mod error;
mod hints;
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
    /// Entries moved to the Trash since this tree was opened.
    ///
    /// [`Tree::remove_subtree`] zeroes an entry rather than splicing it out, so
    /// that every other node id keeps meaning what it meant. The entry is
    /// therefore still addressable, and this is the record of which ones should
    /// no longer be listed.
    hidden: HashSet<NodeId>,
    /// Capacity of the filesystem the root sits on, when it could be measured.
    capacity: Option<Capacity>,
    /// What the scan counted, kept so the result can be stored later.
    ///
    /// It used to be dropped once the opening view had been built, which meant
    /// a scan could never be saved after the fact — and whether a scan is worth
    /// keeping is a question you answer *after* looking at it. `None` for a
    /// snapshot, which is already stored.
    stats: Option<ScanStats>,
}

/// A scan in flight, kept so it can be cancelled from another command.
struct Running {
    /// Which scan this is. A tick or a cancellation naming an older one is
    /// ignored, so a scan the user restarted cannot be stopped by a click aimed
    /// at its predecessor.
    id: u64,
    progress: Arc<ScanProgress>,
}

#[derive(Default)]
pub struct AppState {
    /// A read-write lock rather than a mutex because writing a snapshot walks
    /// the whole tree and inserts a row per entry — seconds to tens of seconds
    /// on a real disk. Under a mutex every read would queue behind it and the
    /// window would freeze for the duration, which is the exact failure this
    /// app is built to avoid. Reads run concurrently; only loading a different
    /// tree or editing this one has to wait.
    current: RwLock<Option<Loaded>>,
    /// Incremented every time a different tree is loaded.
    ///
    /// This is what makes a node id meaningful. On its own an id is just an
    /// index, so an id obtained from one scan will happily address a
    /// completely different entry in the next one — and the frontend can hold
    /// stale ids in flight while a new scan replaces the tree underneath it.
    /// Pairing every id with the generation it came from turns that class of
    /// bug into a plain error instead of a wrong answer.
    generation: AtomicU64,
    running: Mutex<Option<Running>>,
    scans_started: AtomicU64,
}

/// Returned when a request carries ids from a tree that is no longer open.
/// Callers are expected to recognise it and simply drop the result.
pub const STALE_GENERATION: &str = "stale_generation";

/// Returned by a scan the user stopped. Not a failure: the UI puts the previous
/// view back rather than showing an error nobody needs to read.
pub const SCAN_CANCELLED: &str = "scan_cancelled";

impl AppState {
    /// Read the open tree without caring which one it is. Only for commands
    /// that take no node id.
    fn with_tree<T>(
        &self,
        f: impl FnOnce(&Tree, &Source) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        let guard = self.current.read().map_err(|_| lock_poisoned())?;
        let loaded = guard
            .as_ref()
            .ok_or_else(|| AppError::new("nothing_open"))?;
        f(&loaded.tree, &loaded.source)
    }

    /// Read the open tree, but only if it is still the one `generation` names.
    fn with_tree_at<T>(
        &self,
        generation: u64,
        f: impl FnOnce(&Tree, &Source) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        let guard = self.current.read().map_err(|_| lock_poisoned())?;
        let loaded = guard
            .as_ref()
            .ok_or_else(|| AppError::new("nothing_open"))?;
        if loaded.generation != generation {
            return Err(AppError::new(STALE_GENERATION));
        }
        f(&loaded.tree, &loaded.source)
    }

    /// Read the open tree along with the entries that should not be listed.
    fn with_visible_at<T>(
        &self,
        generation: u64,
        f: impl FnOnce(&Tree, &Source, &HashSet<NodeId>) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        let guard = self.current.read().map_err(|_| lock_poisoned())?;
        let loaded = guard
            .as_ref()
            .ok_or_else(|| AppError::new("nothing_open"))?;
        if loaded.generation != generation {
            return Err(AppError::new(STALE_GENERATION));
        }
        f(&loaded.tree, &loaded.source, &loaded.hidden)
    }

    /// Edit the open tree in place, keeping its generation.
    ///
    /// Keeping the generation is the whole point: it is what lets the window
    /// carry on showing the same expanded folders, the same selection and the
    /// same zoom after a file is deleted, instead of being rebuilt from nothing.
    fn edit_tree_at<T>(
        &self,
        generation: u64,
        f: impl FnOnce(&mut Loaded) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        let mut guard = self.current.write().map_err(|_| lock_poisoned())?;
        let loaded = guard
            .as_mut()
            .ok_or_else(|| AppError::new("nothing_open"))?;
        if loaded.generation != generation {
            return Err(AppError::new(STALE_GENERATION));
        }
        f(loaded)
    }

    fn set(
        &self,
        tree: Tree,
        source: Source,
        capacity: Option<Capacity>,
        stats: Option<ScanStats>,
    ) -> Result<u64, AppError> {
        let mut guard = self.current.write().map_err(|_| lock_poisoned())?;
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        *guard = Some(Loaded {
            tree,
            source,
            generation,
            hidden: HashSet::new(),
            capacity,
            stats,
        });
        Ok(generation)
    }

    /// Register a starting scan, stopping whatever was already running.
    ///
    /// Two scans at once would both be writing progress to the same window and
    /// only one could win the tree, so the older one is cancelled instead of
    /// being left to finish work nobody will see.
    fn begin_scan(&self, progress: Arc<ScanProgress>) -> Result<u64, AppError> {
        let mut guard = self.running.lock().map_err(|_| lock_poisoned())?;
        if let Some(previous) = guard.take() {
            previous.progress.cancel();
        }
        let id = self.scans_started.fetch_add(1, Ordering::SeqCst) + 1;
        *guard = Some(Running { id, progress });
        Ok(id)
    }

    /// Forget a finished scan, unless a newer one has already replaced it.
    fn end_scan(&self, id: u64) {
        let Ok(mut guard) = self.running.lock() else {
            return;
        };
        if guard.as_ref().is_some_and(|running| running.id == id) {
            *guard = None;
        }
    }

    /// Ask the running scan to stop. Returns the scan that was asked.
    fn cancel_running(&self) -> Result<Option<u64>, AppError> {
        let guard = self.running.lock().map_err(|_| lock_poisoned())?;
        let Some(running) = guard.as_ref() else {
            return Ok(None);
        };
        running.progress.cancel();
        Ok(Some(running.id))
    }
}

fn lock_poisoned() -> AppError {
    AppError::new("state_unusable")
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
    /// What this entry mostly consists of; for a file, its own category.
    ///
    /// A folder list is almost entirely folders, and a folder has no file type
    /// of its own — so colouring those rows by `category` paints every one of
    /// them the same, which is no information at all. This says what the folder
    /// is *full of*, which is what somebody scanning the list wants to know.
    pub dominant: Category,
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

/// Both measurements always travel together, so the window can label a figure
/// and show the other one beside it without another round trip. Only `dominant`
/// depends on which measure is in force, because it is the one field that is a
/// conclusion rather than a number.
fn entry_view(tree: &Tree, id: NodeId, basis: SizeBasis) -> EntryView {
    let n = tree.node(id);
    EntryView {
        node: id,
        name: tree.name(id).to_string(),
        rel_path: tree.rel_path(id),
        is_dir: n.is_dir(),
        size: n.size,
        alloc: n.alloc,
        // Cast rather than narrowing the DTO: these fields are serialised to
        // the window, and changing their width would change the TS contract
        // for no gain — the arena's u32 is already wider than any real disk.
        files: n.files as u64,
        dirs: n.dirs as u64,
        mtime: n.mtime,
        child_count: n.children_len,
        category: Category::of(tree.name(id), n.kind),
        dominant: dominant(tree, id, basis),
    }
}

/// What an entry mostly consists of.
///
/// Found by following the largest child down until it reaches a file, rather
/// than by weighing up every category in the subtree. The biggest leaf under
/// the biggest branch is what the total is made of, and this costs one step per
/// level instead of a walk — which matters, because it is computed for every
/// row the folder panel lists.
///
/// It terminates because the arena puts every child at a higher index than its
/// parent, so the descent strictly increases and cannot revisit an entry.
///
/// The descent follows whichever measure the window is drawing by, so the
/// colour of a row and the length of its bar are answers about the same thing.
/// A folder holding a 1 TiB sparse image and 40 GiB of video is mostly video on
/// disk and mostly binary by the claim; picking one measure for the bar and the
/// other for the colour would state both at once.
fn dominant(tree: &Tree, id: NodeId, basis: SizeBasis) -> Category {
    let mut current = id;
    loop {
        let node = tree.node(current);
        if !node.is_dir() {
            return Category::of(tree.name(current), node.kind);
        }
        let biggest = tree
            .children(current)
            .max_by_key(|&c| tree.node(c).measure(basis));
        // An empty folder, or one holding nothing that registers under this
        // measure, is not "full of" anything.
        match biggest {
            Some(child) if tree.node(child).measure(basis) > 0 => current = child,
            _ => return Category::Directory,
        }
    }
}

/// How full the filesystem the scanned folder sits on is.
///
/// Reported as free out of total rather than as a percentage used, because on
/// APFS, btrfs and thin LVM space is shared between volumes, so `total - free`
/// includes what the siblings are using and disagrees with `df` for the same
/// mount (see `docs/DECISIONS.md` K6 in the core repo).
#[derive(Debug, Clone, Copy, Serialize)]
pub struct CapacityView {
    pub total: u64,
    pub available: u64,
}

impl From<Capacity> for CapacityView {
    fn from(value: Capacity) -> Self {
        CapacityView {
            total: value.total,
            available: value.available,
        }
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
    pub capacity: Option<CapacityView>,
}

fn opened(
    tree: &Tree,
    source: &Source,
    errors: u64,
    samples: Vec<String>,
    generation: u64,
    capacity: Option<Capacity>,
    basis: SizeBasis,
) -> Opened {
    Opened {
        generation,
        source: source.clone(),
        root: entry_view(tree, tree.root(), basis),
        total_size: tree.total_size(),
        total_alloc: tree.total_alloc(),
        entries: tree.len(),
        can_modify: source.is_live(),
        scan_errors: errors,
        error_samples: samples,
        capacity: capacity.map(CapacityView::from),
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
    /// Which measure the first view of the result should be built from, so the
    /// window does not have to correct itself the moment the scan lands.
    #[serde(default)]
    pub basis: SizeBasis,
}

/// The event a running scan reports itself on.
pub const SCAN_PROGRESS_EVENT: &str = "scan://progress";

/// How often the window is told how the scan is going. Fast enough that the
/// numbers look live, slow enough that the UI is not re-rendering constantly
/// while the machine is busy doing the actual work.
const TICK: Duration = Duration::from_millis(120);

/// What the completion estimate is based on, so the UI can say so rather than
/// presenting a guess as a measurement.
#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EstimateBasis {
    /// The last time this app scanned this same folder with these same options.
    LastScan,
}

/// One report from a scan in flight.
#[derive(Debug, Clone, Serialize)]
pub struct ScanTick {
    /// Which scan this belongs to; a tick from an abandoned scan is ignored.
    pub scan: u64,
    pub files: u64,
    pub dirs: u64,
    pub bytes: u64,
    pub errors: u64,
    pub elapsed_ms: u64,
    /// How far along, 0.0 to 1.0 — absent when there is nothing honest to
    /// divide by. A first scan of a folder genuinely does not know how much is
    /// in it, and a made-up denominator produces a bar that races to 90% and
    /// then sits there, which is worse than no bar at all.
    pub fraction: Option<f64>,
    pub basis: Option<EstimateBasis>,
}

/// Scan a directory on this machine and make it the open tree.
///
/// `async` on purpose: a plain `#[tauri::command]` runs on the main thread and
/// would freeze the window for the whole scan. The walk itself goes to
/// `spawn_blocking` — it is CPU- and syscall-bound, not async work — and a
/// small thread alongside it reports progress so the window has something true
/// to show while it waits.
#[tauri::command]
async fn scan_directory(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    req: ScanRequest,
) -> Result<Opened, AppError> {
    let basis = req.basis;
    let path = PathBuf::from(&req.path);
    if !path.is_dir() {
        return Err(AppError::new("not_a_directory").with("path", path.display()));
    }
    let options = ScanOptions {
        exclude_names: req.exclude.clone(),
        one_filesystem: req.one_file_system,
        max_depth: req.depth,
        dedupe_hardlinks: !req.no_dedupe,
        // On by default, like the CLI. An APFS clone has its own inode and
        // nlink 1, but its blocks are on the disk once — counting it twice
        // would answer "how much room does this take" wrongly, which is the
        // one question the app exists to answer.
        dedupe_clones: true,
        // The scanner's own default, which is measured rather than one per
        // core. Not exposed in the UI: someone who wants to tune this is
        // already at a terminal, and a slider here would be a knob nobody
        // could evaluate without a stopwatch.
        threads: None,
    };

    let progress = Arc::new(ScanProgress::default());
    let scan_id = state.begin_scan(Arc::clone(&progress))?;
    let expected = hints::expected_entries(&path, &options);
    let ticker = Ticker::start(app.clone(), scan_id, Arc::clone(&progress), expected);

    let walk_path = path.clone();
    let walk_options = options.clone();
    let walk_progress = Arc::clone(&progress);
    let result =
        tauri::async_runtime::spawn_blocking(move || scan(&walk_path, walk_options, walk_progress))
            .await;

    // Stops the progress thread and waits for its last tick, so nothing arrives
    // after the window has been told the scan is over.
    drop(ticker);
    state.end_scan(scan_id);

    let (tree, stats) = match result {
        Err(joined) => return Err(AppError::new("scan_thread_failed").detail(joined)),
        Ok(Err(err)) if err.kind() == std::io::ErrorKind::Interrupted => {
            return Err(AppError::new(SCAN_CANCELLED))
        }
        Ok(Err(err)) => {
            return Err(AppError::new("cannot_scan")
                .with("path", path.display())
                .detail(format!("{err:#}")))
        }
        Ok(Ok(pair)) => pair,
    };

    // Remembered for next time, so the second scan of a folder can show a real
    // percentage instead of a spinner.
    hints::remember(&path, &options, stats.files + stats.dirs);

    let samples: Vec<String> = stats
        .error_samples
        .iter()
        .take(20)
        .map(|(p, e)| format!("{} — {e}", p.display()))
        .collect();
    let source = Source::Live {
        root: tree.root_path().to_string_lossy().into_owned(),
    };
    let capacity = stats.capacity;
    let generation = state.set(tree, source, capacity, Some(stats.clone()))?;
    state.with_tree(|tree, source| {
        Ok(opened(
            tree,
            source,
            stats.errors,
            samples.clone(),
            generation,
            capacity,
            basis,
        ))
    })
}

/// Measure the filesystem again, for after something changed outside the app.
///
/// Moving an entry to the Trash frees nothing on its own — on most systems the
/// Trash is on the same filesystem — so the free-space figure only moves once
/// the user empties it. This is how the window finds that out without
/// rescanning the folder.
///
/// A snapshot cannot be re-measured: it records what its machine's filesystem
/// looked like when it was taken, possibly on another machine entirely, so the
/// stored figure is returned unchanged.
#[tauri::command(async)]
fn refresh_capacity(
    state: tauri::State<'_, AppState>,
    generation: u64,
) -> Result<Option<CapacityView>, AppError> {
    state.edit_tree_at(generation, |loaded| {
        if !loaded.source.is_live() {
            return Ok(loaded.capacity.map(CapacityView::from));
        }
        if let Some(fresh) = capacity_of(loaded.tree.root_path()) {
            loaded.capacity = Some(fresh);
        }
        Ok(loaded.capacity.map(CapacityView::from))
    })
}

/// Stop the scan that is running, if there is one.
///
/// Returns whether anything was actually asked to stop, so the button can say
/// "stopping…" only when it means it.
#[tauri::command]
fn cancel_scan(state: tauri::State<'_, AppState>) -> Result<bool, AppError> {
    Ok(state.cancel_running()?.is_some())
}

/// Emits progress on its own thread until the scan it watches is done.
///
/// A thread rather than an async task because there is nothing to await: it
/// reads a few atomics and sleeps. It also emits one final tick on the way out,
/// so the bar lands on the number the scan finished with instead of wherever it
/// happened to be a tenth of a second earlier.
///
/// Stopping is `Drop` rather than a method, so a scan that returns early — an
/// error, a cancellation, or whatever gets added to this function later —
/// cannot leave a thread behind emitting progress for work that is over.
struct Ticker {
    stop: Arc<AtomicBool>,
    handle: Option<std::thread::JoinHandle<()>>,
}

impl Ticker {
    fn start(
        app: tauri::AppHandle,
        scan_id: u64,
        progress: Arc<ScanProgress>,
        expected: Option<u64>,
    ) -> Ticker {
        let stop = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&stop);
        let handle = std::thread::spawn(move || {
            let started = Instant::now();
            loop {
                // Read before emitting, so the tick sent after the flag is set
                // is the last one and reflects the finished counts.
                let finished = flag.load(Ordering::Relaxed);
                let _ = app.emit(
                    SCAN_PROGRESS_EVENT,
                    tick(scan_id, &progress, expected, started.elapsed()),
                );
                if finished {
                    return;
                }
                std::thread::sleep(TICK);
            }
        });
        Ticker {
            stop,
            handle: Some(handle),
        }
    }
}

impl Drop for Ticker {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            // Waits up to one tick. This runs on the blocking pool, never on
            // the thread painting the window.
            let _ = handle.join();
        }
    }
}

fn tick(
    scan_id: u64,
    progress: &ScanProgress,
    expected: Option<u64>,
    elapsed: Duration,
) -> ScanTick {
    let files = progress.files.load(Ordering::Relaxed);
    let dirs = progress.dirs.load(Ordering::Relaxed);
    let seen = files + dirs;

    // Entries, not bytes. The work in a scan is one stat call per entry, while
    // bytes arrive in lumps: a single 40 GB file is one stat and would shove a
    // byte-based bar most of the way across in an instant, then stall.
    //
    // Capped just short of the end, because the estimate comes from a different
    // scan of a folder that has since changed — arriving at 100% and staying
    // there would look stuck, and overshooting past it would look broken.
    let fraction = expected
        .filter(|total| *total > 0)
        .map(|total| (seen as f64 / total as f64).clamp(0.0, 0.99));

    ScanTick {
        scan: scan_id,
        files,
        dirs,
        bytes: progress.bytes.load(Ordering::Relaxed),
        errors: progress.errors.load(Ordering::Relaxed),
        elapsed_ms: elapsed.as_millis() as u64,
        fraction,
        basis: fraction.map(|_| EstimateBasis::LastScan),
    }
}

/// What a save produced, so the window can say which row it just created.
#[derive(Debug, Clone, Serialize)]
pub struct SavedSnapshot {
    pub scan_id: i64,
    pub db: String,
    pub label: Option<String>,
}

/// Store the open scan, so it can be compared against later.
///
/// `#[tauri::command(async)]` rather than `async fn` with `spawn_blocking`,
/// which is the pattern everywhere else here: the write needs `&Tree` for its
/// whole duration, and the tree lives behind the state's lock. Handing it to a
/// `'static` blocking task would mean either cloning it — hundreds of megabytes
/// on a real disk — or holding a guard across an await. `(async)` keeps the
/// borrow, runs off the main thread, and the lock is a `RwLock`, so every read
/// the window makes while this runs proceeds beside it.
#[tauri::command(async)]
fn save_snapshot(
    state: tauri::State<'_, AppState>,
    db: String,
    label: Option<String>,
) -> Result<SavedSnapshot, AppError> {
    let trimmed = label
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty());

    let guard = state.current.read().map_err(|_| lock_poisoned())?;
    let loaded = guard
        .as_ref()
        .ok_or_else(|| AppError::new("nothing_open"))?;
    let stats = savable(loaded)?;

    let mut store = Store::open(&db).map_err(|e| {
        AppError::new("cannot_open_database")
            .with("db", &db)
            .detail(format!("{e:#}"))
    })?;
    let host = Store::local_host();
    let scan_id = store
        .save(&loaded.tree, stats, &host, trimmed.as_deref())
        .map_err(|e| AppError::new("cannot_store_snapshot").detail(format!("{e:#}")))?;

    Ok(SavedSnapshot {
        scan_id,
        db,
        label: trimmed,
    })
}

/// Whether the open tree may be stored, and its counters if so.
///
/// Separated from the command so the three refusals can be tested without a
/// Tauri runtime; each of them is a wrong snapshot rather than an inconvenience.
fn savable(loaded: &Loaded) -> Result<&ScanStats, AppError> {
    if !loaded.source.is_live() {
        return Err(AppError::new("already_a_snapshot"));
    }
    // A tree that has been edited matches no moment on disk. `remove_subtree`
    // zeroes an entry rather than splicing it out, so saving now would store
    // phantom 0-byte entries that are not there, stamped with the scan's start
    // time. A fresh scan is the honest record of what is left after a cleanup.
    if !loaded.hidden.is_empty() {
        return Err(AppError::new("edited_since_scan"));
    }
    loaded
        .stats
        .as_ref()
        .ok_or_else(|| AppError::new("counters_unavailable"))
}

/// Snapshots stored in a database file.
#[tauri::command]
async fn list_snapshots(db: String) -> Result<Vec<ScanMeta>, AppError> {
    blocking(move || {
        Store::open(&db).and_then(|s| s.list()).map_err(|e| {
            AppError::new("cannot_read_database")
                .with("db", &db)
                .detail(format!("{e:#}"))
        })
    })
    .await
}

/// Open one stored snapshot.
#[tauri::command]
async fn open_snapshot(
    state: tauri::State<'_, AppState>,
    db: String,
    scan_id: i64,
    basis: Option<SizeBasis>,
) -> Result<Opened, AppError> {
    let basis = basis.unwrap_or_default();
    let loaded = blocking(move || {
        let store = Store::open(&db).map_err(|e| {
            AppError::new("cannot_open_database")
                .with("db", &db)
                .detail(format!("{e:#}"))
        })?;
        store.load(scan_id).map_err(|e| {
            AppError::new("cannot_load_snapshot")
                .with("id", scan_id)
                .detail(format!("{e:#}"))
        })
    })
    .await?;
    let (tree, meta) = loaded;

    let capacity = snapshot_capacity(&meta);
    let source = snapshot_source(&meta, None);
    let generation = state.set(tree, source, capacity, None)?;
    state.with_tree(|tree, source| {
        Ok(opened(
            tree,
            source,
            meta.errors,
            Vec::new(),
            generation,
            capacity,
            basis,
        ))
    })
}

/// Run something slow off the main thread and off the async worker pool.
///
/// SQLite work and filesystem walks are blocking by nature, so they belong on
/// the blocking pool rather than occupying an async worker that other commands
/// are waiting on.
async fn blocking<T, F>(work: F) -> Result<T, AppError>
where
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
    T: Send + 'static,
{
    match tauri::async_runtime::spawn_blocking(work).await {
        Ok(result) => result,
        Err(joined) => Err(AppError::new("operation_did_not_finish").detail(joined)),
    }
}

/// A snapshot records the capacity of the filesystem it was taken on. Both
/// halves have to be present to mean anything — a v1 snapshot knows neither.
fn snapshot_capacity(meta: &ScanMeta) -> Option<Capacity> {
    match (meta.fs_total, meta.fs_available) {
        (Some(total), Some(available)) => Some(Capacity { total, available }),
        _ => None,
    }
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
    /// Which measurement the areas are proportional to.
    ///
    /// Carried by the request rather than held as app state so that a layout
    /// and the figures shown beside it can never come from different measures:
    /// flipping the switch while a layout is in flight would otherwise pair one
    /// set of rectangles with the other set of numbers.
    #[serde(default)]
    pub basis: SizeBasis,
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
#[tauri::command(async)]
fn treemap(state: tauri::State<'_, AppState>, req: LayoutRequest) -> Result<TileArrays, AppError> {
    state.with_tree_at(req.generation, |tree, _| {
        if req.node as usize >= tree.len() {
            return Err(AppError::new("no_entry").with("node", req.node));
        }
        let options = LayoutOptions {
            min_area: req.min_area.max(0.5),
            padding: req.padding.max(0.0),
            max_depth: req.max_depth,
            basis: req.basis,
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
            arrays
                .category
                .push(Category::of(tree.name(tile.node), n.kind) as u8);
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
#[tauri::command(async)]
fn labels(
    state: tauri::State<'_, AppState>,
    generation: u64,
    nodes: Vec<NodeId>,
) -> Result<Vec<String>, AppError> {
    state.with_tree_at(generation, |tree, _| {
        Ok(nodes
            .into_iter()
            .map(|id| {
                if (id as usize) < tree.len() {
                    tree.name(id).to_string()
                } else {
                    String::new()
                }
            })
            .collect())
    })
}

/// Full detail for one entry, for the hover panel and the inspector.
#[tauri::command(async)]
fn entry(
    state: tauri::State<'_, AppState>,
    generation: u64,
    node: NodeId,
    basis: Option<SizeBasis>,
) -> Result<EntryView, AppError> {
    let basis = basis.unwrap_or_default();
    state.with_tree_at(generation, |tree, _| {
        if node as usize >= tree.len() {
            return Err(AppError::new("no_entry").with("node", node));
        }
        Ok(entry_view(tree, node, basis))
    })
}

/// Full detail for several entries at once.
///
/// One call rather than one per entry: a selection can be hundreds of rows, and
/// the window needs their names and sizes together to say what it is about to
/// move to the Trash. Ids that no longer exist are skipped rather than failing
/// the request, because a selection can outlive an entry.
#[tauri::command(async)]
fn entries(
    state: tauri::State<'_, AppState>,
    generation: u64,
    nodes: Vec<NodeId>,
    basis: Option<SizeBasis>,
) -> Result<Vec<EntryView>, AppError> {
    let basis = basis.unwrap_or_default();
    state.with_visible_at(generation, |tree, _, hidden| {
        Ok(nodes
            .into_iter()
            .filter(|id| (*id as usize) < tree.len() && !hidden.contains(id))
            .map(|id| entry_view(tree, id, basis))
            .collect())
    })
}

/// Children of a directory, largest first — what the tree panel lists.
#[tauri::command(async)]
fn children(
    state: tauri::State<'_, AppState>,
    generation: u64,
    node: NodeId,
    limit: Option<usize>,
    basis: Option<SizeBasis>,
) -> Result<Vec<EntryView>, AppError> {
    let basis = basis.unwrap_or_default();
    state.with_visible_at(generation, |tree, _, hidden| {
        if node as usize >= tree.len() {
            return Err(AppError::new("no_entry").with("node", node));
        }
        let mut kids: Vec<EntryView> = tree
            .children_by(node, basis)
            .into_iter()
            // An entry that went to the Trash is zeroed rather than removed, so
            // that surrounding ids stay stable; it must not be listed as an
            // empty folder that is still there.
            .filter(|c| !hidden.contains(c))
            .map(|c| entry_view(tree, c, basis))
            .collect();
        if let Some(limit) = limit {
            kids.truncate(limit);
        }
        Ok(kids)
    })
}

/// Ancestors of an entry, root first, for breadcrumbs.
#[tauri::command(async)]
fn ancestors(
    state: tauri::State<'_, AppState>,
    generation: u64,
    node: NodeId,
    basis: Option<SizeBasis>,
) -> Result<Vec<EntryView>, AppError> {
    let basis = basis.unwrap_or_default();
    state.with_tree_at(generation, |tree, _| {
        if node as usize >= tree.len() {
            return Err(AppError::new("no_entry").with("node", node));
        }
        Ok(ancestor_chain(tree, node, basis))
    })
}

/// The absolute path of an entry on the machine that was scanned.
#[tauri::command(async)]
fn absolute_path(
    state: tauri::State<'_, AppState>,
    generation: u64,
    node: NodeId,
) -> Result<String, AppError> {
    state.with_tree_at(generation, |tree, _| {
        if node as usize >= tree.len() {
            return Err(AppError::new("no_entry").with("node", node));
        }
        Ok(tree.path(node).to_string_lossy().into_owned())
    })
}

// ------------------------------------------------------- acting on files

/// Show an entry in Finder / Explorer / the desktop file manager.
///
/// `async` because it waits on another program: `xdg-open` in particular can
/// stay alive for as long as the file manager it launched.
#[tauri::command]
async fn reveal(
    state: tauri::State<'_, AppState>,
    generation: u64,
    node: NodeId,
) -> Result<(), AppError> {
    let path = live_path(&state, generation, node)?;
    blocking(move || reveal_path(&path)).await
}

/// One entry that went to the Trash.
#[derive(Debug, Clone, Serialize)]
pub struct TrashedEntry {
    pub node: NodeId,
    pub name: String,
    /// The entry it was listed under, so one row can be dropped.
    pub parent: NodeId,
    /// What it accounted for inside the scanned folder, both ways. `alloc` is
    /// the one a notice can honestly call recovered space.
    pub size: u64,
    pub alloc: u64,
    pub files: u64,
}

/// One entry that did not go, and why.
#[derive(Debug, Clone, Serialize)]
pub struct TrashFailure {
    pub node: NodeId,
    pub name: String,
    /// Why this one stayed, as a code the window translates.
    pub reason: AppError,
}

/// What the window needs to know after a Trash operation.
#[derive(Debug, Clone, Serialize)]
pub struct TrashOutcome {
    /// Unchanged, and that is the point. The tree was edited in place, so every
    /// id the window is holding still means what it meant: the folders it had
    /// expanded stay expanded and the map stays where the user left it.
    pub generation: u64,
    pub trashed: Vec<TrashedEntry>,
    /// Reported rather than rolled back. Some of a selection can fail — a
    /// permission, a file that vanished — and pretending the whole thing failed
    /// would be a lie about the ones that went.
    pub failed: Vec<TrashFailure>,
    /// Selected entries that were inside another selected folder, and so went
    /// with it rather than separately.
    pub redundant: usize,
    pub total_size: u64,
    pub total_alloc: u64,
    /// Every ancestor whose totals changed, root first, deduplicated.
    pub ancestors: Vec<EntryView>,
}

/// The event a multi-entry Trash operation reports itself on.
pub const TRASH_PROGRESS_EVENT: &str = "trash://progress";

#[derive(Debug, Clone, Serialize)]
pub struct TrashTick {
    pub done: usize,
    pub total: usize,
    /// What is being moved right now.
    pub name: String,
}

/// Move entries to the system Trash and take them out of the open tree.
///
/// Trash rather than delete, and only for a live scan: the tree may be a
/// snapshot of the past or of another machine, where the path either no longer
/// means what it says or is not ours to touch.
///
/// Note for anything reporting this to a person: on most systems the Trash is
/// on the same filesystem, so this frees no disk space until the Trash is
/// emptied. The folder's totals drop because the entries are no longer in them,
/// which is a different claim.
///
/// `async` because `trash::delete` is a filesystem operation of unbounded
/// duration — a large folder, or one on a network volume, takes as long as it
/// takes, and the window must stay usable while it does.
#[tauri::command]
async fn move_to_trash(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    generation: u64,
    nodes: Vec<NodeId>,
    basis: Option<SizeBasis>,
) -> Result<TrashOutcome, AppError> {
    let basis = basis.unwrap_or_default();
    let plan = plan_trash(&state, generation, &nodes)?;
    if plan.targets.is_empty() && plan.failed.is_empty() {
        return Err(AppError::new("nothing_to_trash"));
    }

    let total = plan.targets.len();
    let targets = plan.targets;
    // One blocking task for the whole batch rather than one each: `trash` is
    // sequential anyway, and this way there is a single place reporting how far
    // through it is.
    let results = tauri::async_runtime::spawn_blocking(move || {
        let mut results = Vec::with_capacity(targets.len());
        for (index, target) in targets.into_iter().enumerate() {
            let _ = app.emit(
                TRASH_PROGRESS_EVENT,
                TrashTick {
                    done: index,
                    total,
                    name: target.name.clone(),
                },
            );
            // Re-checked here rather than during planning: the tree is a
            // snapshot in time even when it was taken seconds ago.
            let outcome = if !target.path.exists() {
                Err(AppError::new("no_longer_exists").with("path", target.path.display()))
            } else {
                trash::delete(&target.path).map_err(|err| {
                    AppError::new("cannot_move_to_trash")
                        .with("path", target.path.display())
                        .detail(err)
                })
            };
            results.push((target, outcome));
        }
        let _ = app.emit(
            TRASH_PROGRESS_EVENT,
            TrashTick {
                done: total,
                total,
                name: String::new(),
            },
        );
        results
    })
    .await
    .map_err(|joined| AppError::new("trash_did_not_finish").detail(joined))?;

    // Only now is the tree edited. Doing it first would leave the window
    // claiming files are gone when the delete had in fact failed.
    state
        .edit_tree_at(generation, |loaded| {
            let mut outcome = TrashOutcome {
                generation,
                trashed: Vec::new(),
                failed: plan.failed,
                redundant: plan.redundant,
                total_size: 0,
                total_alloc: 0,
                ancestors: Vec::new(),
            };

            let mut touched: Vec<NodeId> = Vec::new();
            for (target, result) in results {
                match result {
                    Err(reason) => outcome.failed.push(TrashFailure {
                        node: target.node,
                        name: target.name,
                        reason,
                    }),
                    Ok(()) => {
                        let parent = loaded.tree.node(target.node).parent;
                        let Some(removed) = loaded.tree.remove_subtree(target.node) else {
                            outcome.failed.push(TrashFailure {
                                node: target.node,
                                name: target.name,
                                reason: AppError::new("gone_but_not_removed"),
                            });
                            continue;
                        };
                        loaded.hidden.extend(removed.nodes.iter().copied());
                        touched.push(parent);
                        outcome.trashed.push(TrashedEntry {
                            node: target.node,
                            name: target.name,
                            parent,
                            size: removed.size,
                            alloc: removed.alloc,
                            files: removed.files as u64,
                        });
                    }
                }
            }

            outcome.total_size = loaded.tree.total_size();
            outcome.total_alloc = loaded.tree.total_alloc();
            outcome.ancestors = corrected_ancestors(&loaded.tree, &touched, basis);
            Ok(outcome)
        })
        .map_err(|err| {
            if err.code == STALE_GENERATION {
                // The files are gone but the view moved on, so there is nothing
                // left to patch. Say so rather than reporting a plain failure.
                return AppError::new("trashed_but_view_moved_on");
            }
            err
        })
}

/// One entry the batch is going to try to move.
struct TrashTarget {
    node: NodeId,
    name: String,
    path: PathBuf,
}

/// Everything decided before a single file is touched.
struct TrashPlan {
    targets: Vec<TrashTarget>,
    failed: Vec<TrashFailure>,
    redundant: usize,
}

/// Work out what a selection actually means, under one lock.
///
/// The interesting part is dropping entries that sit inside another selected
/// folder. Selecting a folder and something within it is an ordinary thing to
/// do by accident, and moving the folder takes the contents with it — so trying
/// the inner one afterwards would fail on a path that no longer exists and
/// report an error for something that did in fact go.
fn plan_trash(
    state: &tauri::State<'_, AppState>,
    generation: u64,
    nodes: &[NodeId],
) -> Result<TrashPlan, AppError> {
    state.with_visible_at(generation, |tree, source, hidden| {
        if !source.is_live() {
            return Err(AppError::new("snapshot_not_live"));
        }

        let selected: HashSet<NodeId> = nodes.iter().copied().collect();
        let mut plan = TrashPlan {
            targets: Vec::new(),
            failed: Vec::new(),
            redundant: 0,
        };

        for &node in &selected {
            if node as usize >= tree.len() {
                plan.failed.push(TrashFailure {
                    node,
                    name: String::new(),
                    reason: AppError::new("no_entry").with("node", node),
                });
                continue;
            }
            let name = tree.name(node).to_string();
            if node == tree.root() {
                plan.failed.push(TrashFailure {
                    node,
                    name,
                    reason: AppError::new("refusing_scan_root"),
                });
                continue;
            }
            if hidden.contains(&node) {
                // Already moved earlier in this session; not a failure.
                plan.redundant += 1;
                continue;
            }
            if has_selected_ancestor(tree, node, &selected) {
                plan.redundant += 1;
                continue;
            }
            plan.targets.push(TrashTarget {
                node,
                name,
                path: tree.path(node),
            });
        }

        // Largest first, so the report reads in the order that matters and the
        // progress strip names the long ones while there is time to read them.
        plan.targets
            .sort_by_key(|target| std::cmp::Reverse(tree.node(target.node).size));
        Ok(plan)
    })
}

/// Whether any strict ancestor of `node` is in `selected`.
fn has_selected_ancestor(tree: &Tree, node: NodeId, selected: &HashSet<NodeId>) -> bool {
    let mut current = tree.node(node);
    while current.has_parent() {
        if selected.contains(&current.parent) {
            return true;
        }
        current = tree.node(current.parent);
    }
    false
}

/// Every ancestor of every touched entry, root first, without repeats.
///
/// The folder panel patches rows by id, so one entry appearing twice with the
/// same figures is harmless but pointless; more to the point, two selections
/// under one parent must not send that parent's row twice.
fn corrected_ancestors(tree: &Tree, touched: &[NodeId], basis: SizeBasis) -> Vec<EntryView> {
    let mut seen = HashSet::new();
    let mut chains: Vec<EntryView> = Vec::new();
    for &node in touched {
        for view in ancestor_chain(tree, node, basis) {
            if seen.insert(view.node) {
                chains.push(view);
            }
        }
    }
    // Root first: an id is always greater than its parent's, so sorting by id
    // puts every ancestor before its descendants.
    chains.sort_by_key(|view| view.node);
    chains
}

/// Ancestors of an entry including itself, root first.
fn ancestor_chain(tree: &Tree, node: NodeId, basis: SizeBasis) -> Vec<EntryView> {
    let mut chain = Vec::new();
    if node as usize >= tree.len() {
        return chain;
    }
    let mut current = node;
    loop {
        chain.push(entry_view(tree, current, basis));
        let entry = tree.node(current);
        if !entry.has_parent() {
            break;
        }
        current = entry.parent;
    }
    chain.reverse();
    chain
}

/// Resolve a node to a path, refusing when the open tree is not a live scan of
/// this machine.
fn live_path(
    state: &tauri::State<'_, AppState>,
    generation: u64,
    node: NodeId,
) -> Result<PathBuf, AppError> {
    state.with_tree_at(generation, |tree, source| {
        if !source.is_live() {
            return Err(AppError::new("snapshot_not_live"));
        }
        if node as usize >= tree.len() {
            return Err(AppError::new("no_entry").with("node", node));
        }
        if node == tree.root() {
            return Err(AppError::new("refusing_scan_root"));
        }
        Ok(tree.path(node))
    })
}

#[cfg(target_os = "macos")]
fn reveal_path(path: &Path) -> Result<(), AppError> {
    std::process::Command::new("open")
        .arg("-R")
        .arg(path)
        .status()
        .map_err(|e| AppError::new("cannot_open_file_manager").detail(e))
        .and_then(status_ok)
}

#[cfg(target_os = "windows")]
fn reveal_path(path: &Path) -> Result<(), AppError> {
    std::process::Command::new("explorer")
        .arg(format!("/select,{}", path.display()))
        .status()
        .map_err(|e| AppError::new("cannot_open_file_manager").detail(e))
        .and_then(status_ok)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn reveal_path(path: &Path) -> Result<(), AppError> {
    // No portable "select this file" on Linux, so open the containing folder.
    let target = path.parent().unwrap_or(path);
    std::process::Command::new("xdg-open")
        .arg(target)
        .status()
        .map_err(|e| AppError::new("cannot_open_file_manager").detail(e))
        .and_then(status_ok)
}

fn status_ok(status: std::process::ExitStatus) -> Result<(), AppError> {
    if status.success() {
        Ok(())
    } else {
        Err(AppError::new("file_manager_failed").with("status", status))
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
///
/// Two whole trees are loaded from SQLite and walked, which for a real disk is
/// seconds of work, so it goes to the blocking pool.
#[tauri::command]
async fn diff_snapshots(
    db: String,
    from: i64,
    to: i64,
    min_delta: Option<u64>,
    include_files: Option<bool>,
) -> Result<DiffView, AppError> {
    blocking(move || {
        let store = Store::open(&db).map_err(|e| {
            AppError::new("cannot_open_database")
                .with("db", &db)
                .detail(format!("{e:#}"))
        })?;
        let (old_tree, old_meta) = store.load(from).map_err(|e| {
            AppError::new("cannot_load_snapshot")
                .with("id", from)
                .detail(format!("{e:#}"))
        })?;
        let (new_tree, new_meta) = store.load(to).map_err(|e| {
            AppError::new("cannot_load_snapshot")
                .with("id", to)
                .detail(format!("{e:#}"))
        })?;

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
    })
    .await
}

// ------------------------------------------------------------------ remote

/// Snapshots held by an agent.
#[tauri::command]
async fn remote_snapshots(url: String, token: String) -> Result<Vec<ScanMeta>, AppError> {
    remote::list(&url, &token)
        .await
        .map_err(|e| AppError::new("remote_failed").detail(format!("{e:#}")))
}

/// Download a remote snapshot and open it, exactly as a local one would be.
#[tauri::command]
async fn open_remote_snapshot(
    state: tauri::State<'_, AppState>,
    url: String,
    token: String,
    scan_id: i64,
    basis: Option<SizeBasis>,
) -> Result<Opened, AppError> {
    let basis = basis.unwrap_or_default();
    let (tree, meta) = remote::fetch(&url, &token, scan_id)
        .await
        .map_err(|e| AppError::new("remote_failed").detail(format!("{e:#}")))?;
    let capacity = snapshot_capacity(&meta);
    let source = snapshot_source(&meta, Some(url));
    let generation = state.set(tree, source, capacity, None)?;
    state.with_tree(|tree, source| {
        Ok(opened(
            tree,
            source,
            meta.errors,
            Vec::new(),
            generation,
            capacity,
            basis,
        ))
    })
}

/// A folder worth offering as a starting point, with its path already checked.
#[derive(Debug, Clone, Serialize)]
pub struct ScanTarget {
    pub name: String,
    pub path: String,
    /// Why it is worth a look, in the user's terms rather than the system's.
    pub note: String,
}

/// What the window offers before anything is open.
#[derive(Debug, Clone, Serialize)]
pub struct StartingPoints {
    /// Capacity of the filesystem the home folder is on.
    pub home_volume: Option<CapacityView>,
    pub home: Option<String>,
    pub targets: Vec<ScanTarget>,
}

/// Folders to offer on the opening screen.
///
/// The front door of a disk analyser should be the disk, not a file picker:
/// almost everybody who opens this wants one of a handful of folders, and
/// making them walk a directory chooser to reach `~/Downloads` is a step that
/// buys nothing. Only paths that actually exist are returned, so nothing on
/// screen can fail when it is clicked.
#[tauri::command(async)]
fn starting_points() -> StartingPoints {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()
        .map(PathBuf::from)
        .filter(|home| home.is_dir());

    let Some(home) = home else {
        return StartingPoints {
            home_volume: None,
            home: None,
            targets: Vec::new(),
        };
    };

    // Notes describe what tends to be found there, because "Caches" alone does
    // not tell anyone whether it is safe to look at.
    let candidates: &[(&str, &str, &str)] = &[
        ("Home", "", "everything belonging to you"),
        ("Downloads", "Downloads", "usually the quickest win"),
        ("Desktop", "Desktop", ""),
        ("Documents", "Documents", ""),
        #[cfg(target_os = "macos")]
        (
            "Caches",
            "Library/Caches",
            "rebuilt by apps as they need it",
        ),
        #[cfg(target_os = "macos")]
        (
            "Application Support",
            "Library/Application Support",
            "app data, not caches — read before deleting",
        ),
        #[cfg(target_os = "macos")]
        (
            "iOS backups",
            "Library/Application Support/MobileSync/Backup",
            "often tens of gigabytes",
        ),
    ];

    let targets = candidates
        .iter()
        .filter_map(|(name, relative, note)| {
            let path = if relative.is_empty() {
                home.clone()
            } else {
                home.join(relative)
            };
            if !path.is_dir() {
                return None;
            }
            Some(ScanTarget {
                name: (*name).to_string(),
                path: path.to_string_lossy().into_owned(),
                note: (*note).to_string(),
            })
        })
        .collect();

    StartingPoints {
        home_volume: capacity_of(&home).map(CapacityView::from),
        home: Some(home.to_string_lossy().into_owned()),
        targets,
    }
}

/// Where the CLI keeps its snapshot database, so the app opens the same history.
#[tauri::command]
fn default_database() -> String {
    hints::data_dir()
        .unwrap_or_default()
        .join("snapshots.sqlite")
        .to_string_lossy()
        .into_owned()
}

// ------------------------------------------------------------ about the app

/// What this build is, for the About panel and for an update check.
///
/// The version alone cannot answer "which build am I running": every
/// continuous build reports the same number. The commit and the channel come
/// from `spacetrace-buildinfo`, which the release workflow stamps in.
#[derive(Serialize)]
pub struct BuildInfo {
    version: &'static str,
    commit: &'static str,
    built: &'static str,
    channel: &'static str,
    /// False for a development or continuous build. An update check has
    /// nothing to compare against on those, and telling their user to upgrade
    /// would be wrong.
    is_release: bool,
}

#[tauri::command]
fn build_info() -> BuildInfo {
    BuildInfo {
        version: env!("CARGO_PKG_VERSION"),
        commit: spacetrace_buildinfo::GIT_SHA,
        built: spacetrace_buildinfo::BUILD_DATE,
        channel: spacetrace_buildinfo::CHANNEL,
        is_release: spacetrace_buildinfo::is_release(),
    }
}

// ------------------------------------------------- macOS Full Disk Access

/// Whether this app may read the whole filesystem, or `None` where the
/// question does not arise.
///
/// macOS keeps Desktop, Documents, Downloads and a dozen other places behind
/// TCC. A scanner that walks a home folder without Full Disk Access therefore
/// gets **one modal per protected folder**, mid-scan, in whatever order a
/// parallel walk happens to reach them — which is what a user sees as an
/// endless stream of permission dialogs over the progress bar. Asking once,
/// before the first scan, is the only version of this that is not hostile.
///
/// `None` on Windows and Linux: no such permission exists there, and a banner
/// about one would be noise.
#[cfg(target_os = "macos")]
#[tauri::command]
fn full_disk_access() -> Option<bool> {
    // TCC's own database is readable only *with* Full Disk Access, which is
    // what makes opening it the usual probe. Nothing is read out of it: the
    // open either succeeds or is refused, and that is the entire answer.
    const PROBE: &str = "/Library/Application Support/com.apple.TCC/TCC.db";

    Some(match std::fs::File::open(PROBE) {
        Ok(_) => true,
        // A TCC refusal arrives as EPERM, which maps to this kind.
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => false,
        // Anything else — the file moved, a future macOS renamed it — is not
        // evidence of a missing permission. Nagging on a guess is worse than
        // staying quiet, so an unreadable probe reads as "no problem".
        Err(_) => true,
    })
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn full_disk_access() -> Option<bool> {
    None
}

/// Open the Full Disk Access list in System Settings.
///
/// It stops at opening the pane. The app cannot scroll the list to itself or
/// tick its own checkbox, and should not want to: granting this is deliberately
/// a human action taken in Apple's own UI, not something an app can talk its
/// way into. All this saves is the finding.
#[cfg(target_os = "macos")]
#[tauri::command]
fn open_privacy_settings() -> Result<(), AppError> {
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
        .status()
        .map_err(|e| AppError::new("cannot_open_settings").detail(e))
        .and_then(status_ok)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
fn open_privacy_settings() -> Result<(), AppError> {
    Err(AppError::new("cannot_open_settings").detail("not a macOS build"))
}

#[derive(Serialize)]
pub struct ChangelogEntry {
    /// A stable code, not a label: the window translates it. Adding a seventh
    /// kind must not leave an entry rendered under no heading.
    kind: &'static str,
    text: String,
}

#[derive(Serialize)]
pub struct ChangelogRelease {
    /// Always a real version. Nothing unreleased reaches this type.
    version: String,
    date: String,
    /// False for a development milestone that was never tagged and has no
    /// downloadable files. It still happened and is still worth reading.
    published: bool,
    entries: Vec<ChangelogEntry>,
}

/// The desktop app's own changelog, in the window's language.
///
/// Compiled in rather than fetched. The moment this is most likely to be read
/// is right after the app has updated itself, which is also a moment it may
/// have no network — and a blank "what's new" is worse than none.
///
/// **Releases only.** `log.unreleased` is skipped: those entries describe code
/// that is on `main` and in nobody's copy of the app, so listing them under
/// "what's new" would announce work the reader cannot have. They arrive here
/// the moment the release that contains them is cut.
#[tauri::command]
fn changelog(locale: String) -> Vec<ChangelogRelease> {
    use spacetrace_changelog::{changelog, Component};

    let log = changelog().component(Component::Desktop);
    let view = |entries: &[spacetrace_changelog::Entry]| -> Vec<ChangelogEntry> {
        entries
            .iter()
            .map(|entry| ChangelogEntry {
                kind: entry.kind.slug(),
                text: entry.localized(&locale).to_string(),
            })
            .collect()
    };

    log.releases
        .iter()
        .map(|release| ChangelogRelease {
            version: release.version.clone(),
            date: release.date.clone(),
            published: release.published,
            entries: view(&release.entries),
        })
        .collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        // Self-update, registered only when the build actually carries an
        // updater configuration.
        //
        // Tauri's own minisign signature proves the package came from us; it
        // is not code signing and does not stop Gatekeeper asking again on
        // macOS, which the update prompt says out loud.
        //
        // The condition is not tidiness. Without a signing key the release
        // workflow deletes `plugins.updater` from the config — the only way it
        // can build at all — and this plugin then refuses to initialise:
        // `invalid type: null, expected struct Config`. Registered
        // unconditionally, that turned a build which merely *cannot* update
        // into one that panics before its window ever opens, while the
        // workflow's own comment promised the opposite. Measured by building
        // that configuration and running it.
        .setup(|app| {
            if app.config().plugins.0.contains_key("updater") {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            Ok(())
        })
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            scan_directory,
            cancel_scan,
            refresh_capacity,
            starting_points,
            save_snapshot,
            list_snapshots,
            open_snapshot,
            treemap,
            labels,
            entry,
            entries,
            children,
            ancestors,
            absolute_path,
            reveal,
            move_to_trash,
            diff_snapshots,
            remote_snapshots,
            open_remote_snapshot,
            default_database,
            build_info,
            changelog,
            full_disk_access,
            open_privacy_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running the spacetrace desktop app");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The "What's new" panel must never announce work that is not in this
    /// binary. Counting against `releases` rather than looking for an empty
    /// version keeps the test honest when `unreleased` happens to be empty —
    /// which it is right after every release, exactly when a regression would
    /// slip through unnoticed.
    #[test]
    fn the_changelog_panel_shows_releases_only() {
        use spacetrace_changelog::{changelog as source, Component};

        let log = source().component(Component::Desktop);
        let shown = changelog("en".to_string());

        assert_eq!(shown.len(), log.releases.len());
        assert!(
            shown.iter().all(|release| !release.version.is_empty()),
            "an entry with no version reached the panel, which is how \
             unreleased work used to be rendered"
        );
    }

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
        assert_eq!(
            Category::of("photos.jpg", EntryKind::Dir),
            Category::Directory
        );
    }

    /// `dominant` is what makes the folder list readable, so it is worth being
    /// sure it reaches the right leaf.
    mod dominance {
        use super::*;
        use spacetrace_scan_core::{ScanOptions, ScanProgress};

        fn scanned(build: impl FnOnce(&std::path::Path)) -> (tempfile::TempDir, Tree) {
            let dir = tempfile::tempdir().unwrap();
            build(dir.path());
            let (tree, _) = spacetrace_scan_core::scan(
                dir.path(),
                ScanOptions::default(),
                Arc::new(ScanProgress::default()),
            )
            .unwrap();
            (dir, tree)
        }

        #[test]
        fn a_file_is_its_own_category() {
            let (_dir, tree) = scanned(|root| {
                std::fs::write(root.join("clip.mkv"), vec![0u8; 5000]).unwrap();
            });
            let file = tree.find("clip.mkv").unwrap();
            assert_eq!(dominant(&tree, file, SizeBasis::Logical), Category::Video);
        }

        #[test]
        fn a_folder_takes_the_category_of_its_biggest_content() {
            let (_dir, tree) = scanned(|root| {
                std::fs::write(root.join("notes.md"), vec![b'x'; 100]).unwrap();
                std::fs::write(root.join("movie.mp4"), vec![0u8; 90_000]).unwrap();
            });
            assert_eq!(
                dominant(&tree, tree.root(), SizeBasis::Logical),
                Category::Video
            );
        }

        #[test]
        fn it_follows_the_biggest_branch_all_the_way_down() {
            // The answer for `target/` should be what is at the bottom of it,
            // not "directory" because its largest child is another directory.
            let (_dir, tree) = scanned(|root| {
                std::fs::create_dir_all(root.join("target/debug/deps")).unwrap();
                std::fs::write(root.join("target/debug/deps/lib.dylib"), vec![0u8; 80_000])
                    .unwrap();
                std::fs::write(root.join("small.txt"), vec![b'x'; 10]).unwrap();
            });
            let target = tree.find("target").unwrap();
            assert_eq!(
                dominant(&tree, target, SizeBasis::Logical),
                Category::Binary
            );
        }

        #[test]
        fn an_empty_folder_is_full_of_nothing() {
            let (_dir, tree) = scanned(|root| {
                std::fs::create_dir(root.join("empty")).unwrap();
            });
            let empty = tree.find("empty").unwrap();
            assert_eq!(
                dominant(&tree, empty, SizeBasis::Logical),
                Category::Directory
            );
        }

        /// The case the basis parameter exists for.
        ///
        /// A folder holding a sparse disk image and some video is "mostly
        /// binary" by what the image claims and "mostly video" by what is
        /// actually on the disk. Whichever measure the window is drawing by has
        /// to be the one that answers, or a row's colour contradicts its bar.
        #[test]
        fn what_a_folder_is_full_of_depends_on_the_measure() {
            let (_dir, tree) = scanned(|root| {
                use std::io::Write;
                std::fs::create_dir(root.join("vm")).unwrap();
                let mut img = std::fs::File::create(root.join("vm/disk.bin")).unwrap();
                img.set_len(1 << 30).unwrap();
                img.write_all(&[0xAB; 4096]).unwrap();
                img.sync_all().unwrap();
                drop(img);
                std::fs::write(root.join("vm/clip.mp4"), vec![0u8; 8 * 1024 * 1024]).unwrap();
            });

            let vm = tree.find("vm").unwrap();
            let image = tree.find("vm/disk.bin").unwrap();
            if tree.node(image).alloc > (1 << 30) / 2 {
                eprintln!("skipping: this filesystem does not do sparse files");
                return;
            }

            assert_eq!(
                dominant(&tree, vm, SizeBasis::Logical),
                Category::Binary,
                "by the claim, 1 GiB of image beats 8 MiB of video"
            );
            assert_eq!(
                dominant(&tree, vm, SizeBasis::OnDisk),
                Category::Video,
                "on disk, 8 MiB of video beats 4 KiB of image"
            );
        }

        #[test]
        fn a_folder_of_zero_byte_files_is_full_of_nothing() {
            let (_dir, tree) = scanned(|root| {
                std::fs::create_dir(root.join("stubs")).unwrap();
                std::fs::write(root.join("stubs/a.mp4"), b"").unwrap();
            });
            let stubs = tree.find("stubs").unwrap();
            assert_eq!(
                dominant(&tree, stubs, SizeBasis::Logical),
                Category::Directory
            );
        }
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
        assert!(Source::Live {
            root: "/var".into()
        }
        .is_live());
    }

    #[test]
    fn nothing_is_open_at_startup() {
        let state = AppState::default();
        let err = state.with_tree(|_, _| Ok(())).unwrap_err();
        assert_eq!(err.code, "nothing_open");
    }

    fn one_node_tree(name: &str) -> Tree {
        use spacetrace_scan_core::{StoredNode, TreeAssembler};
        let mut asm = TreeAssembler::with_capacity(1);
        asm.push(StoredNode {
            parent: Tree::NO_PARENT,
            name,
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
        });
        asm.finish(PathBuf::from("/x"))
            .expect("one node is a valid tree")
    }

    fn live(root: &str) -> Source {
        Source::Live { root: root.into() }
    }

    /// Storing the open scan. Each refusal here is a snapshot that would have
    /// been wrong, not a convenience check.
    mod saving {
        use super::*;

        fn loaded(source: Source, hidden: &[NodeId], stats: Option<ScanStats>) -> Loaded {
            Loaded {
                tree: one_node_tree("root"),
                source,
                generation: 1,
                hidden: hidden.iter().copied().collect(),
                capacity: None,
                stats,
            }
        }

        fn snapshot_source() -> Source {
            Source::Snapshot {
                root: "/x".into(),
                host: "somewhere".into(),
                scan_id: 7,
                started_at: 0,
                label: None,
                remote: None,
            }
        }

        #[test]
        fn a_live_untouched_scan_can_be_stored() {
            let state = loaded(live("/x"), &[], Some(ScanStats::default()));
            assert!(savable(&state).is_ok());
        }

        #[test]
        fn a_snapshot_is_not_stored_again() {
            // It is already a row in a database; saving it would duplicate it
            // under a new id and a new timestamp.
            let state = loaded(snapshot_source(), &[], Some(ScanStats::default()));
            let err = savable(&state).unwrap_err();
            assert_eq!(err.code, "already_a_snapshot");
        }

        #[test]
        fn a_scan_with_deletions_is_refused_and_says_to_rescan() {
            // The tree has been edited in place, so it describes no moment that
            // ever existed on disk.
            let state = loaded(live("/x"), &[3], Some(ScanStats::default()));
            let err = savable(&state).unwrap_err();
            assert_eq!(err.code, "edited_since_scan");
        }

        #[test]
        fn a_scan_without_counters_is_refused() {
            let state = loaded(live("/x"), &[], None);
            assert!(savable(&state).is_err());
        }

        /// The whole path, against a real scan and a real database: what goes in
        /// has to come back out, because a snapshot nobody can reopen is worse
        /// than no snapshot.
        #[test]
        fn a_stored_scan_reopens_with_the_same_totals() {
            use spacetrace_scan_core::{ScanOptions, ScanProgress};

            let dir = tempfile::tempdir().unwrap();
            std::fs::create_dir(dir.path().join("inner")).unwrap();
            std::fs::write(dir.path().join("inner/a.bin"), vec![0u8; 4096]).unwrap();
            std::fs::write(dir.path().join("b.txt"), b"hello").unwrap();

            let (tree, stats) = spacetrace_scan_core::scan(
                dir.path(),
                ScanOptions::default(),
                Arc::new(ScanProgress::default()),
            )
            .unwrap();

            let db = dir.path().join("snapshots.sqlite");
            let mut store = Store::open(&db).unwrap();
            let scan_id = store
                .save(&tree, &stats, "test-host", Some("first"))
                .unwrap();

            let (reopened, meta) = Store::open(&db).unwrap().load(scan_id).unwrap();
            assert_eq!(reopened.total_size(), tree.total_size());
            assert_eq!(reopened.total_alloc(), tree.total_alloc());
            assert_eq!(reopened.len(), tree.len());
            assert_eq!(meta.label.as_deref(), Some("first"));
            assert_eq!(meta.host, "test-host");
        }

        /// An empty label is not a label. Without the trim, clicking Save with
        /// an untouched field would store `Some("")`, which lists as a snapshot
        /// with a blank name rather than an unnamed one.
        #[test]
        fn a_blank_label_is_stored_as_no_label() {
            let cleaned =
                |l: Option<&str>| l.map(|l| l.trim().to_string()).filter(|l| !l.is_empty());
            assert_eq!(cleaned(Some("   ")), None);
            assert_eq!(cleaned(Some("")), None);
            assert_eq!(cleaned(Some("  weekly ")), Some("weekly".to_string()));
            assert_eq!(cleaned(None), None);
        }
    }

    #[test]
    fn each_loaded_tree_gets_a_new_generation() {
        let state = AppState::default();
        let first = state
            .set(one_node_tree("a"), live("/a"), None, None)
            .unwrap();
        let second = state
            .set(one_node_tree("b"), live("/b"), None, None)
            .unwrap();
        assert!(second > first, "{second} should follow {first}");
    }

    /// The whole point: an id obtained from an earlier tree must be refused
    /// rather than silently addressing a different entry.
    #[test]
    fn a_request_carrying_an_old_generation_is_refused() {
        let state = AppState::default();
        let old = state
            .set(one_node_tree("a"), live("/a"), None, None)
            .unwrap();

        // Still current: it works.
        assert_eq!(
            state
                .with_tree_at(old, |tree, _| Ok(tree.name(0).to_string()))
                .unwrap(),
            "a"
        );

        // A new scan replaces the tree.
        let new = state
            .set(one_node_tree("b"), live("/b"), None, None)
            .unwrap();

        let err = state.with_tree_at(old, |_, _| Ok(())).unwrap_err();
        assert_eq!(err.code, STALE_GENERATION);

        // And the current one still works, so the guard is not just refusing
        // everything.
        assert_eq!(
            state
                .with_tree_at(new, |tree, _| Ok(tree.name(0).to_string()))
                .unwrap(),
            "b"
        );
    }

    #[test]
    fn a_generation_from_the_future_is_also_refused() {
        let state = AppState::default();
        let current = state
            .set(one_node_tree("a"), live("/a"), None, None)
            .unwrap();
        assert_eq!(
            state
                .with_tree_at(current + 1, |_, _| Ok(()))
                .unwrap_err()
                .code,
            STALE_GENERATION
        );
    }

    #[test]
    fn the_generation_guard_still_reports_nothing_open_first() {
        // A stale-generation error would be misleading before anything is open.
        let state = AppState::default();
        let err = state.with_tree_at(1, |_, _| Ok(())).unwrap_err();
        assert_eq!(err.code, "nothing_open");
    }

    // ------------------------------------------------ editing without reloading

    /// The reason `edit_tree_at` exists: a delete must not cost the window
    /// everything it knows about where the user is.
    #[test]
    fn editing_the_tree_keeps_its_generation() {
        let state = AppState::default();
        let generation = state
            .set(one_node_tree("a"), live("/a"), None, None)
            .unwrap();

        state
            .edit_tree_at(generation, |loaded| {
                loaded.hidden.insert(7);
                Ok(())
            })
            .unwrap();

        // Still the same tree as far as every id in flight is concerned.
        assert!(state.with_tree_at(generation, |_, _| Ok(())).is_ok());
    }

    #[test]
    fn editing_a_tree_that_is_no_longer_open_is_refused() {
        let state = AppState::default();
        let old = state
            .set(one_node_tree("a"), live("/a"), None, None)
            .unwrap();
        state
            .set(one_node_tree("b"), live("/b"), None, None)
            .unwrap();

        assert_eq!(
            state.edit_tree_at(old, |_| Ok(())).unwrap_err().code,
            STALE_GENERATION
        );
    }

    #[test]
    fn hidden_entries_are_visible_to_the_listing_code() {
        let state = AppState::default();
        let generation = state
            .set(one_node_tree("a"), live("/a"), None, None)
            .unwrap();
        state
            .edit_tree_at(generation, |loaded| {
                loaded.hidden.insert(3);
                Ok(())
            })
            .unwrap();

        let hidden_count = state
            .with_visible_at(generation, |_, _, hidden| Ok(hidden.len()))
            .unwrap();
        assert_eq!(hidden_count, 1);
    }

    #[test]
    fn a_new_tree_starts_with_nothing_hidden() {
        // Otherwise a trashed id would go on hiding an unrelated entry in the
        // next scan, where the same number means something else entirely.
        let state = AppState::default();
        let first = state
            .set(one_node_tree("a"), live("/a"), None, None)
            .unwrap();
        state
            .edit_tree_at(first, |loaded| {
                loaded.hidden.insert(1);
                Ok(())
            })
            .unwrap();

        let second = state
            .set(one_node_tree("b"), live("/b"), None, None)
            .unwrap();
        let hidden_count = state
            .with_visible_at(second, |_, _, hidden| Ok(hidden.len()))
            .unwrap();
        assert_eq!(hidden_count, 0);
    }

    // ------------------------------------------------------- scan bookkeeping

    #[test]
    fn starting_a_scan_cancels_the_one_already_running() {
        let state = AppState::default();
        let first = Arc::new(ScanProgress::default());
        let second = Arc::new(ScanProgress::default());

        state.begin_scan(Arc::clone(&first)).unwrap();
        state.begin_scan(Arc::clone(&second)).unwrap();

        assert!(
            first.is_cancelled(),
            "the scan nobody will see the result of should stop"
        );
        assert!(!second.is_cancelled());
    }

    #[test]
    fn cancelling_reaches_the_running_scan() {
        let state = AppState::default();
        let progress = Arc::new(ScanProgress::default());
        let id = state.begin_scan(Arc::clone(&progress)).unwrap();

        assert_eq!(state.cancel_running().unwrap(), Some(id));
        assert!(progress.is_cancelled());
    }

    #[test]
    fn cancelling_when_nothing_is_running_says_so() {
        let state = AppState::default();
        assert_eq!(state.cancel_running().unwrap(), None);
    }

    #[test]
    fn a_finished_scan_can_no_longer_be_cancelled() {
        let state = AppState::default();
        let progress = Arc::new(ScanProgress::default());
        let id = state.begin_scan(Arc::clone(&progress)).unwrap();
        state.end_scan(id);

        assert_eq!(state.cancel_running().unwrap(), None);
        assert!(!progress.is_cancelled());
    }

    #[test]
    fn a_finishing_scan_does_not_deregister_the_one_that_replaced_it() {
        // The old scan finishes late, after the user started a new one. If it
        // cleared the slot, the new scan could no longer be cancelled.
        let state = AppState::default();
        let old_id = state.begin_scan(Arc::new(ScanProgress::default())).unwrap();
        let fresh = Arc::new(ScanProgress::default());
        let new_id = state.begin_scan(Arc::clone(&fresh)).unwrap();

        state.end_scan(old_id);

        assert_eq!(state.cancel_running().unwrap(), Some(new_id));
        assert!(fresh.is_cancelled());
    }

    // ------------------------------------------------ planning a multi-delete

    /// Selecting a folder and something inside it is an ordinary slip, and
    /// getting it wrong means reporting a failure for an entry that did go.
    mod selection {
        use super::*;
        use spacetrace_scan_core::{ScanOptions, ScanProgress};

        fn fixture() -> (tempfile::TempDir, Tree) {
            let dir = tempfile::tempdir().unwrap();
            let root = dir.path();
            std::fs::create_dir_all(root.join("a/b/c")).unwrap();
            std::fs::write(root.join("a/b/c/deep.bin"), vec![0u8; 3000]).unwrap();
            std::fs::write(root.join("a/b/mid.bin"), vec![0u8; 2000]).unwrap();
            std::fs::write(root.join("a/top.bin"), vec![0u8; 1000]).unwrap();
            std::fs::write(root.join("loose.txt"), vec![b'x'; 500]).unwrap();
            let (tree, _) = spacetrace_scan_core::scan(
                root,
                ScanOptions::default(),
                Arc::new(ScanProgress::default()),
            )
            .unwrap();
            (dir, tree)
        }

        fn ids(tree: &Tree, paths: &[&str]) -> HashSet<NodeId> {
            paths
                .iter()
                .map(|p| {
                    tree.find(p)
                        .unwrap_or_else(|| panic!("{p} is in the fixture"))
                })
                .collect()
        }

        #[test]
        fn an_entry_inside_a_selected_folder_is_redundant() {
            let (_dir, tree) = fixture();
            let selected = ids(&tree, &["a", "a/b/c/deep.bin"]);
            let deep = tree.find("a/b/c/deep.bin").unwrap();
            assert!(has_selected_ancestor(&tree, deep, &selected));
        }

        #[test]
        fn a_sibling_of_a_selected_folder_is_not_redundant() {
            let (_dir, tree) = fixture();
            let selected = ids(&tree, &["a", "loose.txt"]);
            let loose = tree.find("loose.txt").unwrap();
            assert!(!has_selected_ancestor(&tree, loose, &selected));
        }

        #[test]
        fn only_a_strict_ancestor_counts() {
            // A folder does not make itself redundant, or selecting one thing
            // would delete nothing at all.
            let (_dir, tree) = fixture();
            let a = tree.find("a").unwrap();
            let selected: HashSet<NodeId> = [a].into_iter().collect();
            assert!(!has_selected_ancestor(&tree, a, &selected));
        }

        #[test]
        fn redundancy_is_found_through_several_levels() {
            let (_dir, tree) = fixture();
            let selected = ids(&tree, &["a"]);
            for path in ["a/b", "a/b/c", "a/b/c/deep.bin", "a/top.bin"] {
                let node = tree.find(path).unwrap();
                assert!(
                    has_selected_ancestor(&tree, node, &selected),
                    "{path} sits under the selected folder"
                );
            }
        }

        #[test]
        fn the_root_is_never_an_ancestor_of_itself() {
            let (_dir, tree) = fixture();
            let selected: HashSet<NodeId> = [tree.root()].into_iter().collect();
            assert!(!has_selected_ancestor(&tree, tree.root(), &selected));
        }

        #[test]
        fn corrected_ancestors_lists_each_entry_once_root_first() {
            // Two deletions under one parent must not send that parent twice.
            let (_dir, tree) = fixture();
            let b = tree.find("a/b").unwrap();
            let chains = corrected_ancestors(&tree, &[b, b], SizeBasis::Logical);

            let nodes: Vec<NodeId> = chains.iter().map(|view| view.node).collect();
            let unique: HashSet<NodeId> = nodes.iter().copied().collect();
            assert_eq!(nodes.len(), unique.len(), "{nodes:?}");
            assert_eq!(nodes.first(), Some(&tree.root()), "root comes first");
            assert!(nodes.windows(2).all(|w| w[0] < w[1]), "{nodes:?}");
        }

        #[test]
        fn corrected_ancestors_merges_two_separate_branches() {
            let (_dir, tree) = fixture();
            let c = tree.find("a/b/c").unwrap();
            let root = tree.root();
            let chains = corrected_ancestors(&tree, &[c, root], SizeBasis::Logical);
            let nodes: Vec<NodeId> = chains.iter().map(|view| view.node).collect();

            assert!(nodes.contains(&root));
            assert!(nodes.contains(&c));
            assert!(nodes.contains(&tree.find("a").unwrap()));
            assert!(nodes.contains(&tree.find("a/b").unwrap()));
            assert_eq!(nodes.len(), 4, "{nodes:?}");
        }

        #[test]
        fn nothing_touched_means_nothing_to_redraw() {
            let (_dir, tree) = fixture();
            assert!(corrected_ancestors(&tree, &[], SizeBasis::Logical).is_empty());
        }

        /// Removing a parent and then its child must not double-count: the
        /// child is already zeroed, so it takes nothing further away.
        #[test]
        fn removing_a_parent_leaves_its_children_accounting_for_nothing() {
            let (_dir, mut tree) = fixture();
            let before = tree.total_size();
            let a = tree.find("a").unwrap();
            let deep = tree.find("a/b/c/deep.bin").unwrap();

            let outer = tree.remove_subtree(a).unwrap();
            let inner = tree.remove_subtree(deep).unwrap();

            assert_eq!(outer.size, 6000, "1000 + 2000 + 3000");
            assert_eq!(inner.size, 0, "it went with its parent");
            assert_eq!(tree.total_size(), before - 6000);
        }
    }

    // --------------------------------------------------------------- progress

    fn progress_at(files: u64, dirs: u64) -> Arc<ScanProgress> {
        let progress = Arc::new(ScanProgress::default());
        progress.files.store(files, Ordering::Relaxed);
        progress.dirs.store(dirs, Ordering::Relaxed);
        progress
    }

    #[test]
    fn without_a_previous_scan_there_is_no_percentage() {
        // A denominator nobody measured produces a bar that races to 90% and
        // stops, which is worse than admitting there is no estimate.
        let tick = tick(1, &progress_at(10, 2), None, Duration::from_secs(1));
        assert!(tick.fraction.is_none());
        assert!(tick.basis.is_none());
        assert_eq!(tick.files, 10);
        assert_eq!(tick.dirs, 2);
    }

    #[test]
    fn the_percentage_counts_entries_against_the_last_scan() {
        let tick = tick(1, &progress_at(40, 10), Some(100), Duration::from_secs(1));
        assert_eq!(tick.fraction, Some(0.5), "50 of an expected 100 entries");
    }

    #[test]
    fn the_bar_stops_just_short_rather_than_sitting_at_full() {
        // The estimate is from a different scan of a folder that has since
        // changed, so it can be overshot. Arriving early and waiting looks
        // stuck; going past 100% looks broken.
        let tick = tick(1, &progress_at(400, 0), Some(100), Duration::from_secs(1));
        assert_eq!(tick.fraction, Some(0.99));
    }

    #[test]
    fn an_empty_expectation_is_not_divided_by() {
        let tick = tick(1, &progress_at(5, 1), Some(0), Duration::from_secs(1));
        assert!(tick.fraction.is_none());
    }
}
