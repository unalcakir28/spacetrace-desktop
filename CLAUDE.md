# spacetrace desktop — project notes for Claude

Tauri v2 + React window: it call scanner, draw tree, save snapshot. **Scanner, tree model, layout NOT here** — they live in [unalcakir28/spacetrace](https://github.com/unalcakir28/spacetrace) core repo, come as git dependency.

Other places cover this, no repeat here. [README.md](README.md): thin-shell why, delete flow, progress estimate, `OnDisk`/`Logical` table, visual language, annotated file tree. [RELEASING.md](RELEASING.md): channel table, five download file names, updater key. Roadmap and cross-phase decisions live in core repo `TODO.md` and `docs/DECISIONS.md`; codes like `C3`, `B5`, `K10` in commit message point there.

This file hold only what neither have, and what break quiet.

## Commands

```bash
yarn install --frozen-lockfile   # this is how CI installs; yarn 1.x
yarn tauri dev                   # full app, hot reload
yarn dev                         # Vite only (port 5173, strictPort)

# Everything CI runs, in CI's own order. One job on ubuntu-24.04: lint and
# tests were merged so the frontend build and the Rust compile happen once.
yarn check:plugins               # plugin version match — see below
yarn typecheck                   # tsc --noEmit
yarn build                       # tsc --noEmit && vite build
cd src-tauri && cargo fmt --all --check
cd src-tauri && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo test

yarn tauri build                 # package
```

Rust 1.85+ (`src-tauri/Cargo.toml`), Node 22 (pin in CI only; **no** `packageManager`, **no** `.nvmrc`, yarn guessed from lockfile). Tauri CLI and API 2.11.0.

**`yarn build` must run before every `cargo` command, `cargo test` too.** `generate_context!` read package config at compile time, refuse to expand when `frontendDist` (`../dist`) missing, and `dist/` gitignored. On clean clone `cargo test` no run — and error say nothing about frontend.

`design-preview.html` show design with no app launch (`?scene=welcome|scan|tree|trash`, default `tree`; `trash` draw same as `tree`, no branch look at it). Vite dev server serve it.

**No ESLint, no Prettier, no JS test runner.** On JS side "lint" mean `tsc`, nothing more. Consequence: IPC naming rule below enforced **from Rust**, by read TypeScript source as text (`src-tauri/tests/wire_names.rs`). New frontend rule go there too.

## Core dependency: the pin lives only in Cargo.lock

`src-tauri/Cargo.toml` pull six core crates from git **with no rev, branch, tag** — not path dependency, per K2, so two repos stay truly independent:

```toml
spacetrace-scan-core = { git = "https://github.com/unalcakir28/spacetrace" }
# and store, diff, treemap, changelog, buildinfo
```

So **only pin is `src-tauri/Cargo.lock`**:

- `cargo update` resolve **remote repo `main`**. `../spacetrace` checkout next door play no part, so risk sit in pushed commits, not local ones. Move pin on purpose, and `pin-bump` skill own the order (`cargo update -p spacetrace-scan-core -p spacetrace-store -p spacetrace-changelog`, but command is easy part). Commit usually `Cargo.lock` + `CHANGELOG.md`; if API changed it touch `lib.rs` too, like two of three pin commits did.
- Release workflow run `cargo fetch --locked` for this reason: without it **two builds of one tag can carry different scanner code** (why is inside `release.yml`). `--locked` cannot pass to `yarn tauri build`, because yarn 1 eat every argument before `--`.
- Move pin without regenerate `CHANGELOG.md` and `src-tauri/tests/changelog.rs` break. **That test is also pin guard** — read failure as "core moved forward", not "changelog stale".
- Change that break core public API invisible to this repo CI; `downstream-api-guard` agent over there exist for that.

## Things that must not break

1. **Wire spelling: responses camelCase, requests snake_case.** Responses pass through `camelize()` in `api.ts`, so TS interfaces must be camelCase. Requests read by serde, so they carry **Rust snake_case names**. Two directions, two separate bugs, one shipped:

   - *Response direction* — snake_case field in TS interface type-check
     flawlessly and reads `undefined` at runtime. 0.6.1 shipped that way: the age
     heatmap legend printed six rows of "undefined güne kadar" next to correct
     byte figures.
   - *Request direction* — `rename_all = "camelCase"` on request struct leave
     every multi-word field **missing**, and a missing `Option` is `None`, not an
     error. The first `SunburstRequest` did this; caught before shipping.

   Guard is `src-tauri/tests/wire_names.rs`. **Only `export interface` blocks checked**, and its accuracy rest on that boundary, because `camelize` write keys of *response*. Object literals passed to `invoke` (Rust argument names) and error code maps in locale files are **correctly** snake_case, must not be flagged; first version flagged all seven — that is how guard become thing people switch off. `checked > 50` catch "I matched nothing" case.
2. **No command block main thread.** `#[tauri::command]` that is not `async` run on UI thread. Rule: `async` + `spawn_blocking` for filesystem and SQLite, and `#[tauri::command(async)]` when borrowed `State` needed (16 of 35 commands). Sync ones do no work: `cancel_scan`, `default_database`, `build_info`, `full_disk_access`, `open_privacy_settings`, `changelog`. New command that touch filesystem, database or network do not join that list.
3. **Node ids are arena indices, so every call carry a `generation`.** Stale id address **different** entry in changed tree. `Tree::remove_subtree` zero rather than cut, so ids survive in-place edit and `Loaded.hidden` hold what went away.

   **Id go stale when its tree close, not when another scan finish.** Before tabs there was one slot, so any new tree destroy previous one and two statements were same. Now generation key `AppState.trees` and stay valid while its tab open. `a_request_carrying_a_closed_generation_is_refused` say so, and asserted opposite until 18 September 2026.
4. **`AppState.trees` is `HashMap<u64, Loaded>` behind `RwLock`** — one tree per tab, keyed by generation. Not `Mutex`, not single slot.

   - **`close_tree` is only thing that free a tree**, and tree is ~98 MB
     for 915,102 entries (72 bytes a node plus its name, measured). A tree the
     window stops showing without that call is memory nothing can reach again.
     Both calls live in `src/tabs.ts`, not at the call sites, because a tree stops
     being shown in two ways: the tab goes (`close`), or the tab is handed a
     different tree (`adopt`). The second has no visible moment and was missed — a
     Rescan is a fresh generation, and the tab's previous ~98 MB stayed in the map
     with nothing pointing at it. `adopt` also frees a tree whose tab has already
     closed, which is what a scan left to land after its tab is gone.
   - `close` also cancel scan filling that tab: `cancel_scan` stop whatever
     is running, and `App`'s `scanTab` ref is the only record of whose that is.
   - `RwLock` stay for its first reason: write snapshot walk whole
     tree (seconds), and under a mutex every read would queue behind it and the
     window would freeze.

   **Nothing on Rust side know what tab is**, by design. It hold trees by name; window decide which sit in front. That is why tabs needed no new argument on any command except `save_snapshot`, which used to mean "the open tree".
5. **Plugin versions must match on major.minor** — Rust crate and npm package. Only **`tauri build`** catch mismatch, so CI went green and release blew up on three platforms. Hence `yarn check:plugins`; fix is `yarn add --exact @tauri-apps/plugin-<name>@<rust major.minor.patch>`.
6. **Updater plugin registered conditionally** (`app.config().plugins.0.contains_key("updater")`). Not tidiness: with no signing key the release workflow **delete** `plugins.updater` from config, and unconditional register then panic before window open (`invalid type: null, expected struct Config`).
7. **Capabilities are one file and there are exactly five** (`src-tauri/capabilities/default.json`): `core:default`, `dialog:allow-open`, `opener:allow-open-url`, `updater:default`, `process:allow-restart`. Anything broader is capability window can use though code never asked. CSP written out explicit too (`tauri.conf.json`).

   **`opener:allow-open-url` carry a scope and is useless without one.** Bare permission turn on command and let no address through, so every link in About panel and update strip failed from day it was written — quiet, because each call site was `void openUrl(…)`, which throw away the rejection. All three now go through `openExternal` in `src/links.ts`, which return answer and show address it could not open, so it can be copied. New link need new URL in that scope. Site is a pattern because changelog page carry a locale; repository spelled out, because org-wide wildcard would grant every other repository for nothing.

## Drawing: canvas, LOD on the server

`Treemap` and `Sunburst` are canvas, not DOM; DPR scaling and `requestAnimationFrame` hand-written. **No web workers.** `Timeline` is exception — SVG, because it is single line and canvas win nothing.

- **Tree never cross into JS.** `treemap` and `rings` return **parallel flat number arrays** in draw order, parent before child, one array per field: about third the JSON of array of objects, no strings in it. No exception left — `live_tiles`, which carried name per tile, went with the preview it fed. Labels requested separate in treemap, and only for tiles **not smaller** than `56×15` pixels (`>=`, so exactly 56×15 get one).
- **LOD is server-side**: `min_area` (default 6.0, at least 0.5), `padding`, optional `max_depth`.
- `age_band` is `i8` with `-1` sentinel, not `Option<u8>`: array of options reach JS as `(number|null)[]` and put branch per tile in canvas loop.
- **Hit-testing stay in JS** — arrays already local and IPC round trip per `mousemove` win nothing. Loaded tiles tagged with `(root, generation)` and validated **at read time** rather than cleared on change, so no window exist where stale tile clickable.
- `basis` (`OnDisk`/`Logical`) is not app state; it travel **inside layout request**, so layout in flight can never pair with other measure figures.
- Resizing set up layout after `RESIZE_SETTLE = 110` ms in both `Treemap` and `Sunburst`. Assigning canvas dimensions only when they changed (assignment clear canvas) guarded only in `Treemap`. **That is gap, not rule** — model new view on `Treemap`.

## Platform

- **macOS Full Disk Access probe**: it try to open `…/com.apple.TCC/TCC.db` and read nothing from it. `PermissionDenied` → false, **any other error → true**, so it no nag on guess. `None` on Windows and Linux. `open_privacy_settings` open settings and stop there on purpose.
- Six `NS*UsageDescription` entries in `Info.plist` are **English on purpose**: localizing them need `InfoPlist.strings` under `.lproj` and bundler no collect those. Translated explanation sit in app own onboarding panel, shown **before** OS ask.
- `reveal_path` have three separate paths. Linux have no portable "select this file", so parent directory opened with `xdg-open`.
- Linux build prerequisites and **ubuntu-24.04 runner are glibc baseline** — deb, rpm and AppImage all come from there.

## i18n

Five languages (`en tr it fr de`). Source is `src/i18n/ui/en.ts`, a 462-line `Dictionary` type other four conform to. Locale resolution: `localStorage` (`spacetrace.locale`) → `navigator.languages` → `en`. Module-level store plus `useSyncExternalStore`; no Redux, zustand or context — real state live in Rust.

**Backend return codes, not sentences** (`src-tauri/src/error.rs`); window own the words. That is why error code maps in locale files are snake_case on purpose.

Style: one hand-written `src/theme.css` (2336 lines of CSS variables). No Tailwind, no CSS-in-JS, no CSS modules. Rule at top of file: color is data, nine categories nine shades, and selection and hover do not spend a shade.

## Release

[RELEASING.md](RELEASING.md) own the procedure: channel table, signing, five download file names, updater key, version bump. What it not say, or what is easiest to break by hand:

- **`v*` tag is only trigger** (19 September 2026). Push to `main` build nothing. It used to build all three platforms into rolling `desktop-continuous` tag — most expensive job in account, since macOS runner minutes bill at 10x on private repo. `paths-ignore` went with it: its only leftover effect would be to skip a *tag* push whose commit touched only docs, publish nothing, quiet. **Do not add either back.**
- **Release not finished until site rebuilt.** Site copy changelog in at build time and no longer poll for it: `gh workflow run pages.yml` in `spacetrace-website`.
- **Version number sit in three files**: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`. `meta` job fail hard on mismatch — half-finished bump once packaged v0.2.0 installer around 0.1.0 binary.
- **macOS `.app` self-signed for TCC, not for Gatekeeper.** macOS bind Full Disk Access to designated requirement, and ad-hoc signature fall back to cdhash, so every release looked like new app and granted permission quietly became invalid (user report, 10 September 2026). Certificate must be **trusted root**, and post-build check verify `certificate root` digest — **`root`**, not `leaf`. That distinction carry load. Keychain setup and `openssl pkcs12 -legacy` requirement sit in RELEASING.md. **What signed and what not be written in seven place, one of them in another repo**: `README.md`, `src-tauri/Cargo.toml`, `RELEASING.md` twice (updater key, and `.dmg`), `release.yml` twice (header, keychain step), and site download page (`download.unsignedTitle` / `unsignedBody` / `installAltBody` / `installAltNote` in `spacetrace-website/src/i18n/ui/*.ts`, five locale). They all said "nothing is signed" for five day after `.app` start be signed; corrected 21 September 2026. Change signing behaviour and move all seven same day.
- **`.dmg` rebuilt unsigned on purpose** with `hdiutil convert`. Dmg signed with untrusted certificate rejected **at mount time** (v0.4.1 regression, measured on macOS 26.5.2), and `codesign --remove-signature` no accept disk image.
- **`--bundles` override `bundle.targets`, it no add to it** — that is why v0.3.0 macOS updater package, and so its manifest, never came out. macOS matrix entry must say `app,dmg`.
- **`--latest=false` on stable releases.** Download repo hold all three components; without it `gh release create` hand "latest" slot to desktop tag and `spacetrace update` stop recognising releases (hub-v0.3.0 took slot on 9 September 2026).
- Artifacts collected under `bundles/`, **not `dist/`** (Vite output), with **`retention-days: 1`** — they reach publish step in same run and release assets are durable copies. Five installer names are contract with download page in another repo; deb and rpm **on purpose** have no updater path.
- Binaries go to core repo with `RELEASE_TOKEN`. Without secret the workflow no fail: it publish here and warn. Tags: `desktop-v*`, and `desktop-latest`, which hold only `latest.json` and is what every installed app read to find update. Delete it and update checking switch off for everyone.

## Habits

- **Code, user-visible strings and comments are English** (core K1), and so is documentation, this file too (16 September 2026). `RELEASING.md` not translated yet. Commit messages English going forward; existing history stay Turkish. GUI strings sit in five languages — desktop exception to K1 (core `docs/DECISIONS.md` K10).
- Comment explain not *what* it do but **why it was done that way**.
- `CHANGELOG.md` is **generated, not hand-edited**. Its source is `crates/changelog/changelog.json` in core repo; from core checkout, `cargo run -p spacetrace-changelog -- markdown --component desktop > CHANGELOG.md`. Release notes sliced out of same file with `awk`.
- Changelog **compiled into binary**, not downloaded: it read right after app updated itself, probably offline. `unreleased` not shown — that would announce code nobody have.
- `tasks/` gitignored; roadmap live in core repo.
- **Core repo `.claude/` tools do not apply here.** Changelog entries still written from core checkout, where `crates/changelog/changelog.json` live.

## Claude tools in this repo

| Tool | When |
| ---- | ---- |
| `preflight` (skill) | Before push; order matters and expensive steps come last |
| `release` (skill) | Cutting release; version in three files, and steps that verify what was published |
| `pin-bump` (skill) | Moving core pin; order, and one test failure that mean something else |
| `dist-before-cargo` (hook) | Stop cargo command that build while `dist/` missing |
| `version-triple-guard` (hook) | Three version file disagree, moment one of them edited — `meta` job only speak after tag push |

From shared `spacetrace-tools` plugin (install it, and full list, sit in workspace notes and plugin README):

| Tool | When |
| ---- | ---- |
| `core-pin-guard` (agent) | Core API diff before moving pin |
| `release-landed` (skill) | After cutting release: installers downloadable, `desktop-latest` moved, site fallbacks bumped, site rebuilt |
| `pin-move-guard` (hook) | Warn before `cargo update` move pin |
| `release-landed-guard` (hook) | At session start: release published that site's fallbacks or last build predate |
| `block-changelog-edit` (hook) | Edit/Write on generated `CHANGELOG.md` |
| `rustfmt-on-edit` (hook) | Format edited `.rs` file |
| `doc-number-guard` (hook) | At Stop: count in this file no match tree — `#[tauri::command]`, async share, `en.ts` and `theme.css` length |

Also `doc-drift-auditor`, `code-reviewer` and `test-writer`.

## Tests

Rust only, `cd src-tauri && cargo test` (after `yarn build`):

| File | What |
| ---- | ---- |
| `tests/wire_names.rs` | IPC field name spelling, both directions; it test itself too |
| `tests/changelog.rs` | `CHANGELOG.md` freshness, and that desktop log not empty |
| `#[cfg(test)]` in `src/*.rs` | `error`, `history`, `hints`, `lib` |

CI run them on `ubuntu-24.04`, in same job as lint. Nothing here exercise macOS-specific behaviour, so macOS-only breakage first show up in release workflow.

## Known documentation gaps

- **How `.p12` produced written down nowhere.** Workflow warning text say "there is a single command in RELEASING.md"; that command not there, and RELEASING.md mark it missing. Whoever renew certificate should write it.
- **Released changelog entry say "the app is still unsigned on macOS"** (desktop 0.4.0, `crates/changelog/changelog.json` in core). It was true when written and released note not rewritten, so it stay. Only place left that claim it.
