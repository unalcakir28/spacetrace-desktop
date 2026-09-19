<!-- Generated from crates/changelog/changelog.json in unalcakir28/spacetrace.
     Do not edit by hand. From a checkout of that repo:
       cargo run -p spacetrace-changelog -- markdown --component desktop > CHANGELOG.md -->

# Changelog

What changed in spacetrace desktop, newest first.

Versions marked *development milestone* were never tagged and have no
downloadable files. They are recorded because the work happened, not
because anyone can install them.

## 0.8.0 — 2026-09-19

### Added

- A running scan is now shown as it fills in: the same folder list, map and inspector a finished scan gets, over a tree that grows every second. Until now the screen held nothing but a percentage until the scan ended. Every figure in it is what has been read so far, so the view is marked partial and neither deleting nor saving is allowed while it runs; what you have opened, selected or zoomed into survives the refreshes and the moment the scan lands.
- Scans now open in tabs. Home stays on the left and is never closed, so starting another scan no longer means losing the one you are reading; each scan gets a tab of its own and they can be switched between freely. Closing a tab gives its memory back — a scan of a million entries is about a hundred megabytes for as long as it is open.
- The opening screen lists the disks. Scanning a whole filesystem was always possible and had no button anywhere: you had to know that the folder chooser accepts the root of a drive. Each disk is shown with its free space, external drives included.

### Changed

- The top bar carried fourteen buttons and wrapped onto three lines at the width the window actually opens at, pushing the map down. Every control now sits beside the thing it changes: the bar holds the app and where a tree comes from, the actions for the open scan are behind the ⋯ next to its path, and the map's shape and colouring are on the map. Which measure the figures are in is chosen by clicking the total you want — both are printed either way, the chosen one bright and underlined. "Reset zoom" is gone; the first step of the path above the map already did it.
- The folder list starts narrower. More than half its width went to the figures column; that column was tightened by 16px — gaps and the length of the bar, no figure says less than it did — and the starting width came down with it. A width you set yourself is still remembered, and double-clicking the divider resets it.
- The window can no longer be made too small to work in. The smallest size is now 1080 by 700 rather than 900 by 600: at the old one the map ended up smaller than the folder list beside it.
- Rescan, Save snapshot and History are no longer hidden behind a single unlabelled button. They are named buttons on the line that says what is open, they are at the foot of the right-click menu, and History — the only one that does not need a scan open first — is on the opening screen too.

### Fixed

- The preview a first scan drew stayed blank for the whole scan: its drawing area could not take a height, so it never asked for anything and nothing but the heading "Reading the top level" was left on screen.
- The map painted over the details column on the right as soon as the folder list was dragged wide enough — or the window made narrow enough — that the map was left with less room than its own key is wide. The two side panes now give way, the map keeps a minimum width, and none of the three overlaps another.
- The map collapsed as soon as an error was reported above it: the error strip took the space that belonged to the map. It disappeared at exactly the moment the window was trying to explain what had gone wrong.
- The map got substantially faster without losing any detail. Moving the pointer across it made the whole window stutter: every move repainted all ~112,000 rectangles in order to shift one thin outline — 39.4 ms per move, now 0.13 ms. The picture itself is drawn as a few dozen paths rather than one call per tile (40.6 ms down to 21.4 ms), and the coordinates cross the boundary in shorter form, taking a map's response from 10.4 MB to 5.2 MB.
- The Website and Source code links in the About panel, and the changelog link in the update notice, did nothing. The permission that lets this app hand an address to the browser allows no address unless it is given a list, and it had none; the failure was then discarded at every call site, so a button that was never going to work looked exactly like one that was.
- Right-clicking anywhere the app had no menu of its own brought up the web view's, offering Reload — which threw away every open scan and looked like a crash rather than something anyone asked for. That menu is now suppressed everywhere except in text fields, where it is the only route to copy and paste.
- A directory tree nested past about 210 levels no longer closes the app. The walk recurses once per level and its threads had the ordinary default stack, so a deep enough tree overflowed it — and because a scan runs inside the app itself, the whole window went with it, leaving no message behind. The walk threads now get a 16 MiB stack and stop at 1024 levels: the directory is listed among the items that could not be read, and the scan carries on.

## 0.7.0 — 2026-09-14

### Added

- A first scan now shows what it is finding while it runs, instead of a blank panel and a counter. The top-level folders appear as a map and grow as their contents are read, so the big one usually announces itself long before the scan ends. The figures are what has been found so far and the view says so — a folder that has stopped growing looks exactly like one that is finished. The same layout routine draws this and the finished map, so nothing rearranges when the scan lands. A rescan leaves the map you are already reading alone, as before.
- The same folder can now be drawn as rings instead of rectangles. One ring per level, and an entry's angle is its share of the folder it sits in — so how deep something goes, and what is nested inside what, is the picture rather than something to work out from nesting. The treemap stays the default and this is a second opinion, for a reason worth knowing: an arc further from the middle covers more of the screen for the same size, so compare angles and not areas. Clicking selects, double-clicking a folder goes into it, and the colour switch works here too.

## 0.6.2 — 2026-09-11

### Fixed

- The age heat map's key named every band "undefined" instead of "Under a week", "1–3 months" and so on. The colours and the byte figures beside them were right; only the words were missing, which made the one part of the view that explains the colours unreadable.

## 0.6.1 — 2026-09-11

### Added

- The map can be coloured by age instead of by kind. Blue is this week, red is over two years, and a folder takes the age of its middle byte — so half of what is inside it is older than its colour says. The key beside it gives the bytes in each band for the folder on screen, which turns "red is old" into "48 GB here has not been touched in two years". A folder's own date is deliberately ignored: it moves when anything is added beside it and says nothing about what is inside.

### Fixed

- Snapshots brought in with `spacetrace import` open in the app. They were stored with a malformed root, so the app refused them as an unusable tree.

## 0.6.0 — 2026-09-11

### Added

- When a scan stops making progress, the progress strip now says so and names the folder it is waiting on, instead of animating a bar over a scan that is going nowhere. A network share that has stopped answering blocks in the kernel and no app can lift that — but knowing what it is waiting on is what lets you decide whether to wait or stop.
- A folder's whole history on one line. History shows every stored snapshot of a folder as a chart, with what changed between each pair beside it; clicking a step opens the comparison for exactly that jump. The axis starts at zero, so the height of the line is the size itself.

### Performance

- Scans use at most eight threads instead of one per core, which made them faster on every directory tree measured — 39% on a small one, 11% on a large one. A walk is syscall-bound: past a point the threads queue in the kernel rather than work.
- Scans on macOS are about 2.3 times faster, following the same change in the scanning core: the system can report a folder's names and its files' sizes in one request instead of one request per file.

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
