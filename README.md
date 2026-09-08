# spacetrace desktop

The desktop app for [spacetrace](https://github.com/unalcakir28/spacetrace): a
zoomable treemap of what is filling your disks — this machine, a snapshot you
took last week, or a server running the agent.

Tauri v2 + React/TypeScript, with all the real work done by the open-source
Rust core.

## Download

**[unalcakir28.github.io/spacetrace/download.html](https://unalcakir28.github.io/spacetrace/download.html#desktop)**
— one universal `.dmg` for macOS, an `.exe` installer for Windows, and `.deb`,
`.rpm` and `.AppImage` for Linux.

The bundles are built here and published into the
[public core repository's releases](https://github.com/unalcakir28/spacetrace/releases),
because a private repository's release assets need a credential to download and
a download page cannot supply one. Two channels: `desktop-v*` for a tagged
release and `desktop-continuous` for the newest `main`. See
[RELEASING.md](RELEASING.md).

Nothing is code-signed, so macOS and Windows both warn on first launch; the
download page says exactly what to click and publishes a checksum for every
file.

## Status

Phase 3 of the roadmap. Working:

- Scan a folder and browse it as a squarified treemap, coloured by file type
- Sizes read as **on disk** by default, with a labelled switch to logical, so a
  sparse 1 TiB disk image does not swamp the map with space it never took
- Zoom into any folder — double-click it in the map, pick it from a breadcrumb,
  or use a folder row's right-click menu; backspace goes back up. A click in the
  folder panel never moves the map, so browsing the list cannot lose your place
- Folder panel with indent guides, the branch you are in lit, and a share bar
  per row coloured by what the folder is full of
- The panel is resizable, remembers its width, and scrolls sideways for deep
  names while the size column stays pinned
- Multiple selection (⌘-click to add, ⇧-click for a run) with the combined size,
  and a right-click menu on any row
- Live progress with a real percentage, counters and a Stop button — the window
  stays usable throughout
- Inspector with logical vs. on-disk size, share of the scan, and full path
- Show in Finder / Explorer, and move one entry or a whole selection to the
  Trash — only ever on a live scan, and without losing your place in the tree
- Free space on the scanned filesystem, in the toolbar
- Store the open scan as a snapshot, and open stored ones from the same
  database the CLI writes
- Compare two snapshots and see which folder actually grew
- Read snapshots straight off a remote agent over HTTP

Not done yet: the Windows MFT fast path, the macOS Full Disk Access onboarding
screen, and a timeline view of a target's whole history.

## Why the app is a thin shell

Scanning, snapshot storage, diffing and treemap layout all live in the
open-source repo. This repo is the window onto them. Three consequences worth
knowing before changing anything:

**The scanned tree never crosses into JavaScript.** A real disk is millions of
nodes; serialising that to the WebView would cost more than the scan did. The
frontend holds node *ids* and asks for the small pieces it draws.

**Tile payloads carry no strings.** `treemap` returns parallel numeric arrays in
draw order. Names are fetched afterwards, only for the tiles big enough to carry
a label — a few hundred out of tens of thousands.

**No command may occupy the main thread.** A `#[tauri::command]` without `async`
runs on the UI thread, so a scan declared that way freezes the window for its
whole duration — which for a disk analyser is the entire time it is doing its
job. Every command that touches the filesystem or SQLite is `async` with the slow
part on `spawn_blocking`; the in-memory ones are `#[tauri::command(async)]`,
which keeps the borrowed `State` and still runs off the main thread. The only
synchronous command left is `cancel_scan`, which must answer instantly and locks
one mutex.

## Work never takes the window away

Two rules, both of which used to be broken:

**A scan reports itself in a strip, not behind a curtain.** Whatever was open
stays open and stays usable while the next scan runs, and it is only replaced
when the new scan *finishes*. Stop it, or let it fail, and the previous scan is
still there.

**Deleting entries does not reload anything.** `Tree::remove_subtree` edits the
open tree in place and corrects the totals above it, so every node id the window
is holding stays valid: the folders you had expanded stay expanded, the map stays
where you left it, and the scroll position does not move. What comes back is a
patch — what went, and the ancestors whose figures changed — which the panels
apply. Rescanning to answer a question whose answer is already known was what
threw all of that away.

### Deleting a selection

`move_to_trash` takes a list, so one entry and a hundred are the same call and
there is one code path to get right. Three details that are easy to get wrong:

- **An entry inside a selected folder is dropped from the batch.** Selecting a
  folder and something within it is an ordinary slip, and moving the folder
  takes its contents with it — so trying the inner one afterwards would fail on
  a path that no longer exists and report an error for something that did go.
  Those are counted as `redundant` and mentioned, not treated as failures.
- **Partial failure is reported, not rolled back.** A permission or a file that
  vanished can stop one entry out of five. Claiming the whole thing failed would
  be a lie about the four that went; claiming it all worked would hide the one
  still sitting there. Both halves are shown.
- **The tree is edited only after the filesystem agrees.** Doing it first would
  leave the window claiming files are gone when the delete had in fact failed.

Unlike a scan, a delete was handed a list, so its progress bar has an exact
denominator and shows a real "3 of 11".

### The progress percentage is an estimate, and says so

A filesystem walk has no denominator: nothing knows how many entries are under a
folder until it has looked. The one honest denominator is the last time this app
scanned that same folder with the same options, so that is what it uses, and the
strip prints where the number came from. A first scan of a folder shows counters
and motion but no percentage — a made-up denominator produces a bar that races
to 90% and then sits there, which is worse than admitting there is no estimate.

Those entry counts are the app's only note of its own: `scan-hints.json` next to
the snapshot database, keyed by folder and scan options. It is deliberately not
the snapshot database, because a snapshot is something you chose to keep.

### Moving to Trash frees no space, and the app says that too

On every supported platform the Trash is on the same filesystem, so the folder
gets smaller and the disk does not. The confirmation and the notice both say so,
and the free-space readout in the toolbar can be clicked to re-measure once you
have emptied it. Reporting reclaimed space that has not been reclaimed is the
kind of wrong number that loses a disk tool its credibility.

## Storing a scan

`Save snapshot…` in the toolbar writes the open scan to the snapshot database —
the same file the CLI uses, so a snapshot taken here is visible to
`spacetrace snapshots` and vice versa. Until this existed the desktop could
only *read* snapshots, and the list's empty state said so in a way that gave no
way out; it now names the button.

**A dialog, not a checkbox on the scan form.** Whether a scan is worth keeping
is a question answered after looking at it. Asked up front the box would be
left ticked, and the scan form is the most-used thing in the app — every rescan,
every re-scan after a cleanup. Snapshots earn their value by being compared
across time, so twenty of one afternoon is not twenty times the value; it is a
diff picker nothing can be found in. It also keeps the app's only two writes the
same shape: deliberate, named, never a side effect.

**A scan with deletions applied cannot be stored.** `remove_subtree` zeroes an
entry rather than splicing it out, so the edited tree still lists what went, at
0 bytes, under the original scan's timestamp — a state that existed on no disk
at no time. The button is disabled with the reason, and the backend refuses
independently, because the rule is about what the data means rather than what
the window is showing. Rescan and the result is storable again.

A snapshot is not re-stored either: it is already a row, and saving it again
would duplicate it under a new id and a new time.

**Why `#[tauri::command(async)]` here** when every other heavy command uses
`spawn_blocking`: the write needs `&Tree` throughout, and the tree lives behind
the state lock. A `'static` blocking task would mean cloning it — hundreds of
megabytes — or holding a guard across an await. So this one keeps the borrow and
runs off the main thread, and `AppState::current` is a `RwLock` rather than a
`Mutex` so the reads the window makes during the write proceed beside it.
Loading a different tree or editing this one waits, which is what should happen
anyway while the tree is being serialised.

## Which size, and why on disk

Every entry carries two numbers and neither is an estimate of the other:

| | Means | Matches |
|---|---|---|
| **On disk** | Blocks actually allocated, folders' own blocks included | `du` |
| **Logical** | The length each file reports | `du -sb` |

They diverge in both directions and both are right. A tiny file allocates a
whole block, so it is larger on disk than its length. A **sparse** file reports
a length it never allocated: `Docker.raw` claims 1 TiB and holds about 19 GiB.

Sparse files are the reason the default is on disk. They are not a curiosity —
VM images, database files and core dumps are among the largest entries on any
real disk, so the logical measure is most wrong about exactly the entries that
matter most. Drawn from its claim, a 1 TiB image takes 99% of the treemap and
everything genuinely large becomes a sliver; the map stops working as a map.

Four rules follow, and each is easy to break by accident:

- **The basis is always visible.** It is a labelled control in the toolbar, not
  a buried setting, and the source line prints both totals with the active one
  in bold. A figure whose meaning is hidden is the thing this app must not do.
- **An ordering and the figures beside it share a basis.** `children_by` in the
  core takes the measure, so "biggest first" means the same thing as the number
  printed on the row.
- **A row's colour follows it too.** A folder holding a sparse image and some
  video is mostly video on disk and mostly binary by the claim, so `dominant`
  is computed under the same measure — otherwise a row's colour contradicts its
  own bar.
- **The Trash confirmation and its notice always use on disk**, whatever the
  window is set to. They answer "how much room will this make", and telling
  somebody they are about to recover a terabyte from a 19 GiB image is the
  worst kind of wrong number to print above a destructive button.

Rows whose two figures are far apart carry a `~` mark with both numbers in its
tooltip, and the details panel names the file as sparse. Without that a reader
just sees a figure that looks wrong.

## The visual language

Colour is the data. The treemap is a map, and on a map of land cover the colours
*are* the reading; the same is true of nine file categories, which is why the
palette runs through the whole window rather than being confined to a legend. A
category has one colour in the map, in the folder list and in the inspector.

Two decisions follow from that and are easy to undo by accident:

- **Nine categories means nine hues, spread evenly around the wheel.** The
  earlier palette left `binary` and `other` as two greys, and `other` is the
  commonest bucket there is.
- **Selection and hover spend no hue.** Every hue belongs to data, so an
  indicator with a hue of its own would be invisible against whichever category
  shared it. Selection is a white outline over a dark one, and the interface
  accent never appears inside the map.

A folder has no file type of its own, so the folder list colours each row by
what the folder is *full of* — found by following the largest child down to a
file (`dominant` in `lib.rs`). Colouring those rows by `category` instead paints
every one of them the same, which is no information at all.

## Develop

Needs Rust 1.85+, Node 20+ and [Tauri's system
prerequisites](https://tauri.app/start/prerequisites/).

```bash
yarn install
yarn tauri dev          # app with hot reload
yarn typecheck          # tsc --noEmit
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

Build a bundle:

```bash
yarn tauri build
```

### Looking at the design without launching the app

`design-preview.html` stands the real components up in a browser against a
stubbed Tauri bridge, so the layout, the palette and the progress and delete
flows can be looked at — and screenshotted — in a second rather than a build:

```bash
yarn dev
open http://localhost:5173/design-preview.html          # ?scene=welcome | scan | tree
```

It fakes the Rust side only; the components are the shipping ones. Its treemap
layout is a crude stand-in for the real squarified one, so judge the *colours*
there and the *geometry* in the app. Nothing in the build references it.

## Layout

```
src/                    React frontend
├── api.ts              typed wrappers over the Tauri commands
├── App.tsx             shell: toolbar, progress strip, three panes
├── Treemap.tsx         canvas renderer, hit-testing, labels
├── FolderTree.tsx      folder panel: guides, share bars, selection, in-place edits
├── Inspector.tsx       detail pane for one entry or a whole selection
├── Progress.tsx        the strip that reports work without blocking it
├── ContextMenu.tsx     the right-click menu, placed after measuring
├── Resizer.tsx         pane widths: drag, arrow keys, remembered
├── SaveDialog.tsx      storing the open scan, and what a label is for
├── TrashDialog.tsx     the one confirmation, for one entry or a hundred
├── Toasts.tsx          what just happened, said once
├── Dialogs.tsx         scan / snapshots / remote / diff
├── basis.ts            on disk vs logical: the one place the choice is defined
├── categories.ts       the one place category colours are read from
├── format.ts           byte, count and date formatting (matches the CLI)
└── theme.css           the whole visual language

src-tauri/
├── src/lib.rs          commands, view types, file-type categories
├── src/hints.rs        entry counts from the last scan, for the progress bar
└── src/remote.rs       downloading a snapshot from an agent
```

## Safety

The app reads. The single exception is **Move to Trash**, which is gated four
ways: the backend refuses unless the open tree is a live scan of this machine,
it refuses the scan root itself, it re-checks that every path still exists, and
the UI asks for confirmation first — listing what is about to go when there is
more than one. Nothing is ever deleted outright; it goes to the system Trash.

A snapshot is a photograph of the past, or of another machine. Acting on files is
disabled whenever one is open, because the path may no longer mean what it says.

## Licence

Proprietary. The scanning core, snapshot store, CLI and agent are Apache-2.0 in
the [main repo](https://github.com/unalcakir28/spacetrace) — the agent runs on
your servers, so you should be able to read it. The reasoning is in that repo's
`docs/DECISIONS.md` (K2).
