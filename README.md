# spacetrace desktop

The desktop app for [spacetrace](https://github.com/unalcakir28/spacetrace): a
zoomable treemap of what is filling your disks — this machine, a snapshot you
took last week, or a server running the agent.

Tauri v2 + React/TypeScript, with all the real work done by the open-source
Rust core.

## Status

Phase 3 of the roadmap. Working:

- Scan a folder and browse it as a squarified treemap, coloured by file type
- Zoom into any folder (double-click, breadcrumbs, or the folder panel);
  backspace goes back up
- Folder panel with size share bars, lazily expanded
- Inspector with logical vs. on-disk size, share of the scan, and full path
- Show in Finder / Explorer, and move to Trash — only ever on a live scan
- Open stored snapshots from the same database the CLI writes
- Compare two snapshots and see which folder actually grew
- Read snapshots straight off a remote agent over HTTP

Not done yet: the Windows MFT fast path, the macOS Full Disk Access onboarding
screen, and a timeline view of a target's whole history.

## Why the app is a thin shell

Scanning, snapshot storage, diffing and treemap layout all live in the
open-source repo. This repo is the window onto them. Two consequences worth
knowing before changing anything:

**The scanned tree never crosses into JavaScript.** A real disk is millions of
nodes; serialising that to the WebView would cost more than the scan did. The
frontend holds node *ids* and asks for the small pieces it draws.

**Tile payloads carry no strings.** `treemap` returns parallel numeric arrays in
draw order. Names are fetched afterwards, only for the tiles big enough to carry
a label — a few hundred out of tens of thousands.

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

## Layout

```
src/                    React frontend
├── api.ts              typed wrappers over the Tauri commands
├── App.tsx             shell: toolbar, breadcrumbs, three panes
├── Treemap.tsx         canvas renderer, hit-testing, labels
├── FolderTree.tsx      lazily expanded folder panel
├── Inspector.tsx       detail pane and the only destructive action
├── Dialogs.tsx         scan / snapshots / remote / diff
├── format.ts           byte, count and date formatting (matches the CLI)
└── theme.css           the whole visual language

src-tauri/
├── src/lib.rs          commands, view types, file-type categories
└── src/remote.rs       downloading a snapshot from an agent
```

## Safety

The app reads. The single exception is **Move to Trash**, which is gated three
ways: the backend refuses unless the open tree is a live scan of this machine,
it refuses the scan root itself, it re-checks that the path still exists, and the
UI asks for confirmation first. Nothing is ever deleted outright — it goes to the
system trash.

A snapshot is a photograph of the past, or of another machine. Acting on files is
disabled whenever one is open, because the path may no longer mean what it says.

## Licence

Proprietary. The scanning core, snapshot store, CLI and agent are Apache-2.0 in
the [main repo](https://github.com/unalcakir28/spacetrace) — the agent runs on
your servers, so you should be able to read it. The reasoning is in that repo's
`docs/DECISIONS.md` (K2).
