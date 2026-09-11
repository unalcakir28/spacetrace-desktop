/**
 * The source dictionary. Every other language is typed against this shape, so
 * a key added here and forgotten elsewhere is a compile error rather than a
 * blank spot in a shipped window.
 *
 * **Not in here:** paths, command names, flags, category identifiers and
 * anything the scanner prints. The tool is English (decision K1, narrowed by
 * K10) and a translated command is false information. Category *names* stay as
 * they are for the same reason the legend and the tooltip have to agree with
 * the API; only the notes explaining them are translated.
 *
 * `{name}` placeholders are filled by `fill()`. They are named rather than
 * positional because the substitution point moves between languages.
 */
export const en = {
  common: {
    cancel: "Cancel",
    close: "Close",
    reload: "Reload",
    browse: "Browse…",
    dismiss: "Dismiss",
    files: "Files",
    folders: "Folders",
    entries: "Entries",
    unreadable: "Unreadable",
    /** Where there is no number to show. */
    nothing: "—",
  },

  time: {
    justNow: "just now",
  },

  language: {
    label: "Language",
    note: "The command line and the agent stay in English: a translated command would not run.",
  },

  live: {
    starting: "Reading the top level…",
    found: "What the scan has found so far — folders grow as it reads them",
  },
  age: {
    colorBy: "Colour the map by",
    byKind: "Kind",
    byAge: "Age",
    byKindNote: "Colour each file by what it is.",
    byAgeNote:
      "Colour by when it was last changed. A folder takes the age of its middle byte, so half of what is inside it is older than its colour says.",
    week: "Under a week",
    month: "Under a month",
    quarter: "1–3 months",
    year: "3–12 months",
    twoYears: "1–2 years",
    older: "Over 2 years",
    upToDays: "Up to {days} days",
    unknown: "No date",
    unknownNote:
      "Files whose modification time was never recorded. Shown apart from the bands rather than as the oldest one: a snapshot from a format that carries no timestamps would otherwise be announced as half a century old.",
  },
  basis: {
    onDisk: "On disk",
    logical: "Logical",
    onDiskNote:
      "Blocks actually allocated, including what folders themselves cost. This is the measure that adds up to the space missing from the disk.",
    logicalNote:
      "The length each file reports. Sparse files claim more than they hold, so this can overstate a disk by a long way.",
    measureBy: "Measure sizes by",
    sparse: "sparse",
    sparseNote:
      "A sparse file: it reports a length it has not allocated, so it takes far less room than it claims.",
    roundedNote:
      "Files are allocated in whole blocks, so this occupies a little more than its length.",
  },

  /** What each category tends to hold. The identifiers themselves are not
   *  translated — they are the same strings the scanner uses. */
  categories: {
    directory: "folder",
    image: "photos and graphics",
    video: "video files",
    audio: "music and audio",
    document: "documents and text",
    archive: "archives and disk images",
    code: "source and config",
    binary: "executables and libraries",
    cache: "logs, caches and temporary files",
    other: "everything else",
  },

  toolbar: {
    tagline: "disk usage over time",
    scanFolder: "Scan folder…",
    snapshots: "Snapshots…",
    remoteAgent: "Remote agent…",
    rescan: "Rescan",
    rescanTitle: "Scan this folder again",
    saveSnapshot: "Save snapshot…",
    saveSnapshotTitle: "Store this scan so it can be compared against later",
    saveBlockedTitle:
      "Entries were moved to the Trash since this scan, so it no longer matches the disk. Rescan to store the result.",
    resetZoom: "Reset zoom",
    resetZoomTitle: "Back to the top of this scan",
    about: "About",
    aboutTitle: "Version, licences and what changed",
    history: "History",
    historyTitle: "How this folder has grown, across every stored snapshot",
  },

  capacity: {
    liveTitle: "Free space on this filesystem. Click to measure it again.",
    snapshotTitle: "Free space as it was when this snapshot was taken.",
    freeOf: "free of {total}",
  },

  source: {
    liveScan: "live scan",
    snapshot: "snapshot #{id} · {when}",
    files: "files",
    entries: "entries",
    unreadable: "{count} unreadable",
    unreadableTitle: "Paths that could not be read are counted, not skipped",
  },

  map: {
    crumbHint: "double-click to zoom · backspace to go up",
    layingOut: "laying out…",
    moreInside: "⠿ = more inside than shown",
    tooltipFiles: "{count} files",
  },

  tree: {
    sparseTitle: "Sparse: {claimed} claimed, {allocated} allocated",
    sidebarWidth: "Folder list width",
    inspectorWidth: "Details panel width",
    resizeHint: "{label} — drag, or double-click to reset",
  },

  progress: {
    scanning: "Scanning {folder}",
    storing: "Storing this scan",
    movingCount: {
      one: "Moving 1 item to the Trash",
      other: "Moving {count} items to the Trash",
    },
    movingNamed: "Moving {name} to the Trash",
    stopping: "stopping",
    stop: "Stop",
    stopInProgress: "Stopping…",
    entries: "{count} entries",
    unreadable: "{count} unreadable",
    doneOf: "{done} of {total}",
    fromLastScan: "estimated from your last scan of this folder",
    firstScan: "first scan of this folder, so there is nothing to estimate against",
    finishing: "Finishing up",
    finishingNote: "checking for copy-on-write clones, so the size on disk is not counted twice",
    clonesChecked: "{count} clone candidates checked",
    stalled: "No progress for {seconds}s",
    stalledOn: "No progress for {seconds}s — waiting on {path}",
    stalledAndMore: "{path} (+{count} more)",
    oneTransaction: "written in one transaction, so it cannot report progress",
  },

  inspector: {
    nothingSelected: "Nothing selected",
    nothingHint:
      "Click a row or a rectangle to inspect it. Hold ⌘ to add to the selection, or ⇧ to take a run of rows. Right-click for what can be done with it.",
    thisScan: "This scan",
    unreadablePaths: "{count} paths",
    couldNotRead: "Paths that could not be read",
    selectedCount: "{count} selected",
    shareOfScan: "{share} of this scan, {basis}",
    largestOfThem: "Largest of them",
    moveManyToTrash: "Move {count} items to Trash…",
    selection: "Selection",
    scanRoot: "the scan root",
    share: "Share",
    type: "Type",
    mostly: "Mostly",
    modified: "Modified",
    fullPath: "Full path",
    showInFileManager: "Show in file manager",
    moveToTrash: "Move to Trash…",
    snapshotNote:
      "This is a stored snapshot, not the live filesystem, so files cannot be acted on. Scan the folder again to work with it.",
  },

  menu: {
    openInMap: "Open in the map",
    showInFileManager: "Show in file manager",
    copyPath: "Copy path",
    moveToTrash: "Move to Trash…",
    moveManyToTrash: "Move {count} items to the Trash…",
  },

  toast: {
    scanned: "Scanned {folder}",
    scannedDetail:
      "{count} paths could not be read and are counted, not skipped.",
    scanStopped: "Scan stopped",
    scanStoppedDetail: "Nothing was changed.",
    couldNotMove: "Could not move it to the Trash",
    storedAsLabel: "Stored as “{label}” (#{id})",
    storedAs: "Stored as snapshot #{id}",
    storedDetail:
      "Scan this folder again later and compare the two to see what grew.",
    nothingLeft: "Nothing left to move",
    nothingLeftDetail: "Those entries are already gone.",
    nothingToMove: "Nothing to move",
    nothingToMoveDetail: "Everything selected was already gone.",
    pathCopied: "Path copied",
    couldNotCopy: "Could not copy the path",
    couldNotCopyDetail:
      "The full path is in the panel on the right, where it can be selected.",
    couldNotOpenFileManager: "Could not open the file manager",
    couldNotStore: "Could not store this scan",
    inTrashOne: "{name} is in the Trash",
    inTrashMany: "{count} items are in the Trash",
    freedDetail:
      "{size} left this folder. Disk space comes back when you empty the Trash.",
    redundantDetail: " {count} were already inside a folder that went with it.",
    stayedOne: "{name} stayed where it is",
    stayedUnnamed: "One entry",
    stayedMany: "{failed} of {total} could not be moved",
  },

  /**
   * Errors, by the stable code the Rust side sends. The operating system's own
   * words arrive separately as `detail` and are never translated: those are
   * the words that go into a search engine.
   */
  errors: {
    unknown: "Something went wrong.",
    stale_generation: "That entry belongs to a scan that is no longer open.",
    scan_cancelled: "The scan was stopped.",
    nothing_open: "Nothing is open yet.",
    state_unusable:
      "The app's internal state is unusable after an earlier crash. Restart it.",
    not_a_directory: "{path} is not a folder.",
    scan_thread_failed: "The scan did not finish.",
    cannot_scan: "{path} could not be scanned.",
    cannot_open_database: "The snapshot database {db} could not be opened.",
    cannot_read_database: "The snapshot database {db} could not be read.",
    cannot_store_snapshot: "This scan could not be stored.",
    cannot_load_snapshot: "Snapshot #{id} could not be loaded.",
    already_a_snapshot:
      "This is already a stored snapshot. Scan the folder to store a new one.",
    counters_unavailable:
      "This scan's counters are not available, so it cannot be stored.",
    edited_since_scan:
      "Entries were moved to the Trash since this scan, so it no longer matches the disk. Rescan to store the result.",
    operation_did_not_finish: "The operation did not finish.",
    no_entry: "There is no entry {node} in this scan.",
    nothing_to_trash: "Nothing was selected to move to the Trash.",
    no_longer_exists: "{path} no longer exists.",
    cannot_move_to_trash: "{path} could not be moved to the Trash.",
    trash_did_not_finish: "The Trash operation did not finish.",
    refusing_scan_root:
      "The folder the scan started from cannot be moved to the Trash.",
    cannot_open_file_manager: "The file manager could not be opened.",
    cannot_open_settings: "System Settings could not be opened.",
    file_manager_failed: "The file manager exited with {status}.",
    remote_failed: "The agent could not be reached.",
    snapshot_not_live:
      "This is a stored snapshot, not the live filesystem. Open a fresh scan to act on files.",
    gone_but_not_removed:
      "It is gone from the disk but could not be taken out of the tree. Rescan to be sure of the totals.",
    trashed_but_view_moved_on:
      "The entries were moved to the Trash, but a different scan was opened while that happened, so this view could not be updated.",
  },

  welcome: {
    headline: "See what is filling your disks",
    lede: "Scan a folder here, open a snapshot you took earlier, or read one straight off an agent running on a server or NAS.",
    free: "{size} free",
    ofTotal: "of {total} on this filesystem",
    scanAnother: "Scan another folder…",
    storedSnapshots: "Stored snapshots",
    remoteAgent: "Remote agent",
    promise:
      "Scanning only reads. Nothing on the disks you scan is changed unless you explicitly move something to the Trash, and that is only possible on a live scan of this machine. The app keeps one note of its own: how many entries each folder had last time, so the next scan of it can show a real percentage.",
  },

  /* Shown before the first scan when macOS would otherwise interrupt it
     with one permission dialog per protected folder. */
  fda: {
    title: "macOS is hiding some folders from spacetrace",
    body: "Without Full Disk Access, Desktop, Documents, Downloads and others stay invisible — and macOS asks again for each one, in the middle of a scan. Granting it once ends both.",
    open: "Open System Settings",
    relaunch: "Restart the app",
    after: "In the list that opens, add spacetrace with + or tick it, then restart. macOS applies the change only to a fresh launch.",
  },

  scanDialog: {
    title: "Scan a folder",
    folder: "Folder",
    pathPlaceholder: "/Users/you/Projects",
    excludeLabel: "Skip folders with these names (comma separated)",
    oneFileSystem: "Stay on one filesystem (skip mounted volumes)",
    readsOnly:
      "Scanning only reads. Unreadable paths are counted and reported rather than skipped silently.",
    start: "Scan",
  },

  snapshots: {
    title: "Stored snapshots",
    databaseLabel: "Snapshot database",
    databaseHint:
      "The same database the {command} command line writes. Click a row to open it; tick two rows to compare them.",
    emptyTitle: "No snapshots stored here yet.",
    emptyHint:
      "Scan a folder, then use {action} in the toolbar. Two snapshots of the same folder are what a comparison is made from, so the first one is worth storing before a cleanup rather than after.",
    columnId: "ID",
    columnTaken: "Taken",
    columnHost: "Host",
    columnFiles: "Files",
    columnRoot: "Root",
    comparing: "Comparing #{from} → #{to}",
    selectedForComparison: "{count} of 2 selected for comparison",
    compare: "Compare",
  },

  remote: {
    title: "Open a remote snapshot",
    urlLabel: "Agent URL",
    tokenLabel: "Bearer token",
    tokenPlaceholder: "from /etc/spacetrace/token",
    list: "List snapshots",
    note: "The snapshot is downloaded and opened exactly like a local one. The agent only ever reads its machine, so nothing here can change it.",
  },

  history: {
    title: "History of a folder",
    targetLabel: "Folder",
    targetOption: "{host} · {root} · {count} snapshots",
    chartLabel: "Size of {root} across {count} snapshots",
    chartHint:
      "The axis starts at zero, so the height of the line is the size itself. Click a point to pick it; two picked points can be compared.",
    noHistoryHere:
      "Nothing stored for the folder on screen yet. Another folder's history is shown instead.",
    needTwo: "One snapshot so far. A history needs a second one to compare against.",
    columnPeriod: "Between",
    columnElapsed: "Elapsed",
    columnChange: "Change in {measure}",
    columnAfter: "After",
    days: "{days} d",
    unchanged: "no change",
    stepTitle: "Compare these two snapshots and see which folders account for it",
    openPoint: "Open snapshot",
  },

  diff: {
    title: "What changed",
    from: "From",
    to: "To",
    total: "Total",
    change: "Change",
    nothingChanged: "Nothing changed by more than the threshold.",
    columnStatus: "Status",
    columnNow: "Now",
    columnPath: "Path",
    passThroughNote:
      "Folders that only pass a change through are skipped: the row you see is the first level where the change genuinely spreads out.",
  },

  save: {
    title: "Store this scan",
    folder: "Folder",
    label: "Label",
    labelPlaceholder: "optional, e.g. before cleanup",
    labelHint:
      "A name to recognise it by in the snapshot list. Comparisons are made between snapshots of the same folder, so something saying when or why helps more than a date — the date is recorded anyway.",
    storing: "Storing…",
    confirm: "Store snapshot",
  },

  trash: {
    titleOne: "Move {name} to the Trash?",
    titleMany: "Move {count} items to the Trash?",
    andMore: "and {count} more",
    leavesOne: "It leaves this folder now. Disk space comes back when you empty the Trash, because the Trash is on the same filesystem.",
    leavesMany: "They leave this folder now. Disk space comes back when you empty the Trash, because the Trash is on the same filesystem.",
    confirmOne: "Move to Trash",
    confirmMany: "Move {count} items",
  },

  about: {
    title: "About spacetrace",
    version: "Version",
    build: "Build",
    built: "Built",
    channel: "Channel",
    licence: "Licence",
    licenceNote:
      "The scanner, snapshot store and command line are Apache-2.0. This app is proprietary.",
    website: "Website",
    sourceCode: "Source code",
    whatsNew: "What's new",
    noChanges: "Nothing recorded for this version yet.",
    milestone: "development milestone",
    kinds: {
      added: "Added",
      changed: "Changed",
      performance: "Performance",
      fixed: "Fixed",
      removed: "Removed",
      security: "Security",
    },
  },

  update: {
    available: "Version {version} is available",
    availableDetail: "You are on {current}.",
    seeWhatsNew: "See what changed",
    install: "Update and restart",
    installing: "Downloading…",
    later: "Not now",
    failed: "Could not install the update",
    upToDate: "spacetrace is up to date",
    checking: "Checking…",
    check: "Check for updates",
    notOnReleaseChannel:
      "This is a development build, so there is nothing to update to.",
  },
} as const;

/**
 * The same shape as `en`, with literal types widened to `string`. Without it
 * `as const` would force every translation to repeat the English text verbatim
 * to satisfy the type.
 */
type Widen<T> = T extends readonly (infer U)[]
  ? readonly Widen<U>[]
  : T extends string
    ? string
    : T extends object
      ? { [K in keyof T]: Widen<T[K]> }
      : T;

export type Dictionary = Widen<typeof en>;
