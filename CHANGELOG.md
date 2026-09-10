<!-- Generated from crates/changelog/changelog.json in unalcakir28/spacetrace.
     Do not edit by hand. From a checkout of that repo:
       cargo run -p spacetrace-changelog -- markdown --component desktop > CHANGELOG.md -->

# Changelog

What changed in spacetrace desktop, newest first.

Versions marked *development milestone* were never tagged and have no
downloadable files. They are recorded because the work happened, not
because anyone can install them.

## Unreleased

### Added

- When a scan stops making progress, the progress strip now says so and names the folder it is waiting on, instead of animating a bar over a scan that is going nowhere. A network share that has stopped answering blocks in the kernel and no app can lift that — but knowing what it is waiting on is what lets you decide whether to wait or stop.

### Performance

- Scans use at most eight threads instead of one per core, which made them faster on every directory tree measured — 39% on a small one, 11% on a large one. A walk is syscall-bound: past a point the threads queue in the kernel rather than work.

### Fixed

- The progress strip appeared to freeze at the end of every scan: after the walk there is a second pass looking for copy-on-write clones, and no counter moved during it. That phase now says “Finishing up” and counts what it checks, instead of showing a file count that has stopped.

## 0.5.0 — 2026-09-10

### Added

- Snapshots now carry a checksum of their content. One pulled from an agent that changed on the way is refused rather than drawn: a flipped bit leaves a perfectly valid tree, and a treemap renders a wrong number every bit as convincingly as a right one.

### Changed

- The snapshot database this app shares with the command-line tool moves to a new schema. This version reads the old one without ceremony; the reverse does not hold, so update both together if you use both.

## 0.4.2 — 2026-09-10

### Fixed

- The .dmg would no longer open on macOS. The signing identity added in 0.4.1 was applied to the disk image as well, and an image signed by a certificate macOS does not trust is refused at mount time — so the warning arrived when you opened the download, before the app ever ran. The image is unsigned again; the app inside keeps its identity.

## 0.4.1 — 2026-09-10

### Fixed

- macOS forgot every permission you had granted whenever the app updated: without a stable signing identity the system treats each release as a different app, so Full Disk Access read as on while being ignored, and every scan asked again folder by folder. The app now carries one identity across releases, so a permission granted once stays granted.

## 0.4.0 — 2026-09-10

### Added

- Temporary install scripts for macOS and Windows that fetch the bundle with curl or Invoke-WebRequest, verify it against SHA256SUMS and install it. A download made that way carries none of the marks a browser writes, so Gatekeeper and SmartScreen never fire. They go away once the app is signed.
- Without Full Disk Access, macOS asks about each protected folder separately — mid-scan, in an order nobody can predict. The welcome screen now says so before the first scan and has a button straight to the right settings pane. The system's own dialog finally explains why a disk analyser wants to read your files, too.

### Changed

- The What's new panel now lists released versions only. Entries that had landed but were in no release described work your copy does not contain.

### Fixed

- The macOS install instructions described the right-click Open trick, which Apple removed in macOS 15. They now give the System Settings → Privacy & Security → Open Anyway route instead.

## 0.3.1 — 2026-09-09

### Fixed

- The update check works. 0.3.0 announced it, but no update manifest was published alongside it, so the app had nothing to check against.

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
