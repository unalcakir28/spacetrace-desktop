<!-- Generated from crates/changelog/changelog.json in unalcakir28/spacetrace.
     Do not edit by hand. From a checkout of that repo:
       cargo run -p spacetrace-changelog -- markdown --component desktop > CHANGELOG.md -->

# Changelog

What changed in spacetrace desktop, newest first.

Versions marked *development milestone* were never tagged and have no
downloadable files. They are recorded because the work happened, not
because anyone can install them.

## 0.3.0 — 2026-09-09

### Added

- Error messages are in your language too. What the operating system says — Permission denied and the like — stays in its own words, because those are the words that help when you search for them.
- The app checks for a newer release when it starts and offers to install it. Nothing is downloaded until you ask for it. On macOS the app is still unsigned, so the system may ask you to confirm it again after an update.
- The app speaks five languages: English, Turkish, Italian, French and German. It follows your system's language on first launch, and the choice can be changed at any time.
- A panel showing which version and which build you are running, plus what changed in recent releases. It works offline: the changelog is compiled into the app itself.

### Performance

- Opening a large scan uses less memory, following the smaller tree representation in the scanning core.

## 0.2.0 — 2026-09-08 · *development milestone*

### Added

- Installable packages for macOS, Windows and Linux, built on every push.
- A switch for which measure the map and the lists follow: what files claim, or what the disk holds.

### Changed

- The window never blocks. Long work runs off the main thread and reports progress, and a scan can be cancelled while it runs.

## 0.1.0 — 2026-09-07 · *development milestone*

### Added

- The first desktop app: a treemap of a folder, a tree beside it, and the details of whatever is selected on the right.
- Open a fresh scan, a stored snapshot, or a snapshot read straight off an agent running on a server or NAS.
- Move entries to the Trash from inside the app, behind a confirmation that names exactly what leaves.
