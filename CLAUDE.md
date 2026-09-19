# spacetrace desktop — project notes for Claude

Tauri v2 + React window: it invokes the scanner, draws the tree, saves
snapshots. **The scanner, the tree model and the layout are not here** — they
live in the [unalcakir28/spacetrace](https://github.com/unalcakir28/spacetrace)
core repo, pulled in as a git dependency.

I do not repeat what is already well covered: [README.md](README.md) holds the
thin-shell rationale, the three subtleties of the delete flow, the honesty of
the progress estimate, the `OnDisk`/`Logical` table, the visual language and
the annotated file tree; [RELEASING.md](RELEASING.md) holds the channel table,
the five fixed download file names and the updater key story. The roadmap and
the cross-phase decisions are in the core repo's `TODO.md` and
`docs/DECISIONS.md` — codes like `C3`, `B5`, `K10` in commit messages point
there.

This file covers only the things that are **written in neither of them and can
break silently**.

## Commands

```bash
yarn install --frozen-lockfile   # this is how CI installs; yarn 1.x
yarn tauri dev                   # full app, hot reload
yarn dev                         # Vite only (port 5173, strictPort)

# Everything CI runs, in CI's own order. It is one job on ubuntu-24.04:
# lint and tests were merged so the frontend build and the Rust compile
# happen once instead of twice.
yarn check:plugins               # plugin version match — see below
yarn typecheck                   # tsc --noEmit
yarn build                       # tsc --noEmit && vite build
cd src-tauri && cargo fmt --all --check
cd src-tauri && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo test

yarn tauri build                 # package
```

Rust 1.85+ (`src-tauri/Cargo.toml`), Node 22 (pinned in CI; there is **no**
`packageManager` and **no** `.nvmrc`, yarn is only inferred from the lockfile).
Tauri CLI and API 2.11.0.

**`yarn build` is mandatory before every `cargo` command, `cargo test`
included.** `generate_context!` reads the package configuration at compile time
and refuses to expand when `frontendDist` (`../dist`) is missing; `dist/` is in
gitignore. On a clean clone `cargo test` does not run directly — and the error
does not say "the frontend was not built" either.

To see the design without launching the app there is `design-preview.html`
(`?scene=welcome|scan|tree|trash`, default `tree`; `trash` currently draws the
same as `tree`, no branch looks at it); it is served from the Vite dev server.

**There is no ESLint, no Prettier, no JS test runner.** On the JS side "lint"
is nothing but `tsc`. This is not a gap; it has a consequence: the IPC naming
rule below is enforced **from Rust**, by reading the TypeScript source as text
(`src-tauri/tests/wire_names.rs`). If you are going to add a rule about the
frontend, put that there too.

## Core dependency: the pin lives only in Cargo.lock

`src-tauri/Cargo.toml` pulls six core crates from git **with no rev, branch or
tag** (not path — per K2, so that the two repos genuinely stay independent):

```toml
spacetrace-scan-core = { git = "https://github.com/unalcakir28/spacetrace" }
# and store, diff, treemap, changelog, buildinfo
```

So **the only pin is `src-tauri/Cargo.lock`**. The consequences:

- `cargo update` resolves **the remote repo's `main`** — the `../spacetrace`
  checkout next to it plays no part at all, so the risk comes not from local
  commits but from pushed ones. Moving the pin is a deliberate act, and the
  order it has to happen in is the `pin-bump` skill in this repo
  (`cargo update -p spacetrace-scan-core -p spacetrace-store -p spacetrace-changelog`,
  but the command is the easy part).
  The commit is usually `Cargo.lock` + `CHANGELOG.md`, but if the API changed
  it touches `lib.rs` too — two of the three pin commits are like that.
- The release workflow runs `cargo fetch --locked` for this reason: without it
  **two builds of a single tag can carry different scanner code** (the
  rationale is written inside `release.yml`). `--locked` cannot be passed to
  `yarn tauri build`, because yarn 1 swallows every argument before `--`.
- If you move the pin and do not regenerate `CHANGELOG.md`,
  `src-tauri/tests/changelog.rs` breaks. **That test is also the pin guard** —
  when it breaks, read it as "core moved forward", not "the changelog is
  stale".
- A change that breaks core's public API is invisible to this repo's CI; the
  `downstream-api-guard` agent over there exists for exactly that.

## Things that must not break

1. **Wire spelling: responses camelCase, requests snake_case.** Responses pass
   through `camelize()` in `api.ts`, so TS interfaces have to be camelCase;
   requests are read by serde, so they carry **Rust's snake_case names**. **Two
   directions, two separate bugs, and one of them shipped:**

   - *Response direction* — declaring a snake_case field in a TS interface
     passes type checking flawlessly and reads `undefined` off every object at
     runtime. This is how 0.6.1 shipped: the age heatmap's legend printed six
     rows of "undefined güne kadar" ("until undefined days") next to correct
     byte figures.
   - *Request direction* — putting `rename_all = "camelCase"` on a request
     struct silently leaves every multi-word field **missing**, and a missing
     `Option` is not an error but `None`. The first version of
     `SunburstRequest` did exactly this; this direction was caught and never
     shipped.

   The guard is `src-tauri/tests/wire_names.rs`; **only `export interface`
   blocks** are checked and the test's entire accuracy rests on that boundary:
   `camelize` writes the keys of the *response*. The object literals passed to
   `invoke` (whose keys are Rust argument names) and the error code maps in the
   locale files are **correctly** snake_case and must not be flagged — the
   first version of the test flagged all seven of them, and that is how a guard
   turns into something that gets switched off. The "I matched nothing" case is
   caught by `checked > 50`.
2. **No command blocks the main thread.** A `#[tauri::command]` that is not
   `async` runs on the UI thread. The rule: `async` + `spawn_blocking` for the
   filesystem and SQLite; `#[tauri::command(async)]` when a borrowed `State` is
   needed (15 of 30 commands). The ones that stay synchronous are the ones that
   do no work: `cancel_scan`, `default_database`, `build_info`,
   `full_disk_access`, `open_privacy_settings`, `changelog`. A new command that
   touches the filesystem, the database or the network does not join that list.
3. **Node ids are arena indices, every call has to carry a `generation`.** A
   stale id addresses a **different** entry in a changed tree.
   `Tree::remove_subtree` does not cut, it zeroes — ids survive an in-place
   edit, and `Loaded.hidden` holds what went away.

   **What makes an id stale is its tree being closed, not another scan
   finishing.** Until tabs existed there was one slot, so any new tree
   destroyed the previous one and the two were the same statement. Now a
   generation is a key into `AppState.trees` and stays valid for as long as its
   tab is open. `a_request_carrying_a_closed_generation_is_refused` is the test
   that says so, and it asserted the opposite until 18 September 2026.
4. **`AppState.trees` is a `HashMap<u64, Loaded>` behind an `RwLock`, not a
   `Mutex`, and not a single slot.** One tree per tab, keyed by generation.
   Two consequences worth knowing before touching it:

   - **`close_tree` is the only thing that frees a tree**, and a tree is about
     98 MB for 915,102 entries (72 bytes a node plus its name, measured). A
     tree the window stops showing without that call is memory it can no longer
     reach and will never release, which is why both calls live in
     `src/tabs.ts` and not at the call sites. There are two, because a tree
     stops being shown in two ways: the tab goes (`close`) or the tab is handed
     a different tree (`adopt`). The second has no visible moment and was
     missed — a Rescan is a fresh walk and so a fresh generation, and the tab's
     previous ~98 MB stayed in the map with nothing left pointing at it.
     `adopt` also frees a tree whose tab has already been closed, which is what
     happens when a scan is left to land after its tab is gone.

     The Rust side cannot help here: it has no concept of a tab, by design.
     `close` additionally cancels the scan that was filling the tab, since
     `cancel_scan` stops whatever is running and `App`'s `scanTab` ref is the
     only record of whose that is.
   - The `RwLock` is unchanged and for the same reason: writing a snapshot
     walks the whole tree (seconds), and under a mutex every read would queue
     behind it and the window would freeze.

   **Nothing on the Rust side knows what a tab is.** It holds trees by name;
   the window decides which one is in front. That is why tabs needed no new
   argument on any command except `save_snapshot`, which had been saying "the
   open tree" and now has to say which.
5. **Plugin versions have to match on major.minor** — the Rust crate and the
   npm package. Only **`tauri build`** catches a mismatch, so CI went green and
   the release blew up on three platforms. That is why `yarn check:plugins`
   exists; the fix is
   `yarn add --exact @tauri-apps/plugin-<name>@<rust major.minor.patch>`.
6. **The updater plugin is registered conditionally**
   (`app.config().plugins.0.contains_key("updater")`). Not tidiness: when there
   is no signing key the release workflow **deletes** `plugins.updater` from
   the configuration, and in that case an unconditional register panics before
   the window opens (`invalid type: null, expected struct Config`).
7. **The capabilities are in a single file and there are exactly five**
   (`src-tauri/capabilities/default.json`): `core:default`,
   `dialog:allow-open`, `opener:allow-open-url`, `updater:default`,
   `process:allow-restart`. Anything broader means a capability the window can
   use although the code never asked for it. The CSP is written out explicitly
   too (`tauri.conf.json`).

   **`opener:allow-open-url` carries a scope and is useless without one.** The
   bare permission enables the command and allows no address through, so every
   link in the About panel and the update strip failed silently from the day
   they were written — silently because each call site was `void openUrl(…)`,
   which discards the rejection. All three now go through `openExternal` in
   `src/links.ts`, which returns the answer, and all three show the address they
   could not open so it can be copied. Adding a link means adding its URL to
   that scope — the site is a pattern because the changelog page carries a
   locale, the repository is spelled out, because an org-wide wildcard grants
   every other repository for nothing.

## Drawing: canvas, LOD on the server

`Treemap` and `Sunburst` are canvas, not DOM; DPR scaling and
`requestAnimationFrame` are done by hand. **No web workers.** The third view,
`Timeline`, is an exception — SVG, because it is a single line and canvas would
win nothing.

- **The tree never crosses into JS.** `treemap` (and `rings`) return
  **parallel flat number arrays** in draw order (parent before child), one
  array per field — about a third as much JSON as an array of objects, and with
  no strings in it. There is no exception to this any more: `live_tiles`, which
  carried a name per tile, is gone along with the rest of the preview it fed.
  Labels are requested separately in the treemap, and only for tiles that are
  **not smaller** than `56×15` pixels (`>=`, so exactly 56×15 does get a
  label).
- **LOD is on the server side**: `min_area` (default 6.0, at least 0.5),
  `padding`, optional `max_depth`.
- `age_band` is not an `Option<u8>` but an `i8` with a `-1` sentinel — an array
  of options came down to JS as `(number|null)[]` and put a branch per tile in
  the canvas loop.
- **Hit-testing stays in JS** (the arrays are already local; an IPC round trip
  per `mousemove` wins nothing). Loaded tiles are tagged with
  `(root, generation)` and validated **at read time**, not cleared on change —
  so there is no window in which a stale tile is clickable.
- `basis` (`OnDisk`/`Logical`) is not app state, it travels **inside the layout
  request**: a layout in flight can never be paired with the other measure's
  figures.
- Resizing sets up the layout after `RESIZE_SETTLE = 110` ms, in `Treemap` and
  `Sunburst`. Assigning the canvas dimensions only when they actually changed
  (the assignment clears the canvas) is guarded only in `Treemap`. **That is a
  gap, not a rule** — when you write a new view, take `Treemap` as the model.

## Platform

- **macOS Full Disk Access probe**: it tries to open `…/com.apple.TCC/TCC.db`
  and reads nothing out of it. `PermissionDenied` → false, **any other error →
  true** (so as not to nag on a guess). `None` on Windows/Linux.
  `open_privacy_settings` opens the settings and deliberately stops there.
- The six `NS*UsageDescription` entries in `Info.plist` are **deliberately in
  English**: localizing them requires `InfoPlist.strings` under `.lproj`, and
  the bundler does not collect those. The translated explanation is in the
  app's own onboarding panel, and it is shown **before** the OS asks.
- `reveal_path` has three separate paths; on Linux there is no portable "select
  this file", so the parent directory is opened with `xdg-open`.
- The Linux build prerequisites and the **ubuntu-24.04 runner were chosen for
  the glibc baseline** — deb, rpm and AppImage all come out of there.

## i18n

Five languages (`en tr it fr de`), the source is `src/i18n/ui/en.ts` — a
449-line `Dictionary` type that the other four conform to. Locale resolution:
`localStorage` (`spacetrace.locale`) → `navigator.languages` → `en`. A
module-level store plus `useSyncExternalStore`; no Redux/zustand/context, the
real state is in Rust.

**The backend does not return sentences, it returns codes**
(`src-tauri/src/error.rs`) — the window owns the words. That is why the error
code maps in the locale files are deliberately snake_case.

Style: a single hand-written `src/theme.css` (1863 lines of CSS variables). No
Tailwind, no CSS-in-JS, no CSS modules. The rule at the top of the file: color
is data, nine categories nine shades, selection and hover do not spend a shade.

## Release

The full sequence is in [RELEASING.md](RELEASING.md); the parts that are easy
to break by hand:

- **The version number is in three files**: `package.json`,
  `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`. The `meta` job fails
  hard on a mismatch — a half-finished bump once packaged a v0.2.0 installer
  around a 0.1.0 binary.
- **The macOS `.app` is self-signed, and not for Gatekeeper — for TCC.** macOS
  binds Full Disk Access to the designated requirement; an ad-hoc signature
  falls back to the cdhash, so every release looked like a new app and the
  permission that had been granted silently became invalid (user report,
  10 September 2026). The keychain is set up explicitly, not through Tauri's
  `APPLE_CERTIFICATE` path; `openssl pkcs12 -legacy` is mandatory (`security
  import` cannot read OpenSSL 3's SHA-256 MAC); the certificate has to be a
  **trusted root**, otherwise `find-identity -v` does not list it. A post-build
  step verifies the `certificate root` digest and fails on a mismatch —
  **`root`**, not `leaf`, and that distinction is load-bearing.
- **The `.dmg` is deliberately rebuilt unsigned.** A dmg signed with an
  untrusted certificate is rejected **at mount time** (the v0.4.1 regression,
  measured on macOS 26.5.2); `codesign --remove-signature` does not accept a
  disk image, so it is built from scratch with `hdiutil convert`.
- **`--bundles` overrides `bundle.targets`, it does not add to it** — that is
  why v0.3.0's macOS updater package, and therefore its manifest, never came
  out. The macOS matrix entry has to say `app,dmg`.
- **`--latest=false` on stable releases.** The download repo holds all three
  components at once; without it `gh release create` hands GitHub's "latest"
  slot to a desktop tag and `spacetrace update` parses it as if it were not a
  release at all (hub-v0.3.0 took the slot on 9 September 2026).
- The artifacts are collected under `bundles/`, **not `dist/`** (that is Vite's
  output). The five installer file names are a contract with the download page
  in another repo; deb and rpm **deliberately** have no updater path.
- `paths-ignore` excludes README/RELEASING/tasks/design-preview but
  **deliberately does not exclude `CHANGELOG.md`** — the changelog is compiled
  into the binary.
- The binaries are published to the core repo (`RELEASE_TOKEN`); if the secret
  is missing the workflow does not fail, it publishes to this private repo and
  prints a warning. The tags: `desktop-continuous`, `desktop-v*`, and
  `desktop-latest`, which holds only `latest.json`.

## Habits

- **Code, user-visible strings and comments are in English** (core K1). Documentation is
  English too, this file included (16 September 2026); `RELEASING.md` has not
  been translated yet, and commit messages are English going forward while the
  existing history stays Turkish. The GUI
  strings are in five languages — the desktop exception to K1 (core
  `docs/DECISIONS.md` K10).
- A comment explains not *what* it does but **why it was done that way**.
- `CHANGELOG.md` is **generated, not hand-edited**. Its source is
  `crates/changelog/changelog.json` in the core repo; from a core checkout,
  `cargo run -p spacetrace-changelog -- markdown --component desktop > CHANGELOG.md`.
  The release notes are sliced out of the same file with `awk`.
- The changelog is **compiled into the binary**, not downloaded: at the moment
  it is read, right after the app has updated itself, probably offline.
  `unreleased` is not shown — that would announce code nobody has.
- `tasks/` is in gitignore; the roadmap is in the core repo.
- **The core repo's `.claude/` tools do not apply here.** Writing a changelog
  entry is still driven from the core checkout: the source
  `crates/changelog/changelog.json` is over there.

## Claude tools that live in the repo

| Tool | When |
|------|------|
| `preflight` (skill) | Before pushing; the order matters and the expensive steps come last, so running them by hand is easy to get wrong |
| `release` (skill) | Cutting a release; the version in three files, and the steps that verify what was published |
| `pin-bump` (skill) | Moving the core pin; the order, and the one test failure that means something other than what it says |
| `dist-before-cargo` (hook) | Stops a cargo command that builds while `dist/` is missing |

All three skills **trigger on their own** — they are not waiting for you to type
`/preflight`. The commit/tag/push steps of `release` are gated on approval in
the body of the skill.

The shared tools come from the `spacetrace-tools` plugin, with the
`spacetrace-tools:` prefix. The ones that concern this repo:

| Tool | When |
|------|------|
| `core-pin-guard` (agent) | Core API diff before moving the pin |
| `pin-move-guard` (hook) | Warns before `cargo update` moves the pin |
| `block-changelog-edit` (hook) | Edit/Write on the generated `CHANGELOG.md` |
| `rustfmt-on-edit` (hook) | Formats the edited `.rs` file |

There are also the `doc-drift-auditor`, `code-reviewer` and `test-writer`
agents. **I do not keep the full list here**, it is in the plugin's README —
keeping the inventory in five places is the only reason it goes stale.

The plugin is **not in this repo**, it is in the
`spacetrace-tooling/` private repo next to it — cloning this repo does not
bring it: `claude plugin marketplace add unalcakir28/spacetrace-tooling` and
then `claude plugin install spacetrace-tools@spacetrace-tooling`. The details
are in that repo's README.

## Tests

Rust only, `cd src-tauri && cargo test` (`yarn build` first):

| File | What |
|-------|-----|
| `tests/wire_names.rs` | IPC field name spelling, both directions; it also tests itself |
| `tests/changelog.rs` | `CHANGELOG.md` freshness + the desktop log is not empty |
| `#[cfg(test)]` inside `src/*.rs` | `error`, `history`, `hints`, `lib` |

In CI the tests run on `ubuntu-24.04`, in the same job as lint. Nothing here
exercises macOS-specific behaviour any more, so a macOS-only breakage first
shows up in the release workflow.

## Known documentation gaps

- **How the `.p12` is produced is written down nowhere.** The warning text in
  the workflow says "there is a single command in RELEASING.md"; that command
  is not there and RELEASING.md explicitly marks this as missing. Whoever
  renews the certificate should write it there.
- **The claim "nothing is signed" is written in four places and two of them
  still say it.** `README.md` and `RELEASING.md` were corrected; the
  `.github/workflows/release.yml` header and the `src-tauri/Cargo.toml` comment
  were not. When you change the signing behavior, update all four together.
- `RELEASING.md` says "`*.md` changes do not trigger the workflow";
  `release.yml`'s `paths-ignore` lists only `README.md` and `RELEASING.md` —
  `CHANGELOG.md` **deliberately** does trigger it.
