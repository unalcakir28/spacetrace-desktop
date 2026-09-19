---
name: preflight
description: Runs everything CI runs for the desktop app, cheapest first, in CI's own order. Use before any push to main, after finishing a change and before committing it, after a core pin bump, and whenever someone asks whether CI will pass — including Turkish phrasings like "push etmeden önce kontrol et", "her şey yeşil mi", "CI geçer mi".
---

# Preflight — spacetrace-desktop

CI is **one job on `ubuntu-24.04`** — lint and tests were merged so the frontend
build and the Rust compile happen once rather than twice. The sequence below is
that job's sequence.

Run the steps **in order** and stop at the first failure — each is slower than
the one before it.

## 0. Build the frontend first

```bash
yarn build
```

**Not optional, and not only for the bundle.** `tauri::generate_context!` reads
the bundle config at compile time and refuses to expand without `../dist`, which
is gitignored — so every step below that runs `cargo` depends on this one. A
`.claude` hook blocks compiling cargo commands when `dist/` is missing; this is
the step that satisfies it.

`yarn build` is `tsc --noEmit && vite build`, so it also covers the typecheck.

## 1. Plugin versions

```bash
yarn check:plugins
```

Seconds. Every Tauri plugin's Rust crate and npm package must agree on
major.minor, and **`tauri build` is the only other thing that checks** — a
mismatch used to pass CI in full and then fail the release on three platforms at
once. If it fails:

```bash
yarn add --exact @tauri-apps/plugin-<name>@<rust major.minor.patch>
```

## 2. Formatting

```bash
cd src-tauri && cargo fmt --all --check
```

If it fails, run `cargo fmt --all` and continue.

## 3. Clippy

```bash
cd src-tauri && cargo clippy --all-targets -- -D warnings
```

CI uses `-D warnings`, so a warning here is a failure there.

## 4. Tests

```bash
cd src-tauri && cargo test
```

Rust only — there is no JavaScript test runner in this app. Two of these matter
more than their size suggests:

- `wire_names.rs` — IPC field-name spelling in both directions. A failure here is
  a bug the compiler cannot see and that ships silently as `undefined`.
- `changelog.rs` — `CHANGELOG.md` freshness. **A failure usually means the core
  pin moved**, not that the changelog is wrong. Regenerate from a core checkout:
  ```bash
  cargo run -p spacetrace-changelog -- markdown --component desktop > CHANGELOG.md
  ```

CI runs these on Linux. Nothing in CI exercises macOS or Windows behaviour any
more, so if the change touches either, say it needs the release workflow rather
than reporting it green.

## 5. Version agreement, if a release is near

```bash
grep '"version"' package.json
grep '^version' src-tauri/Cargo.toml
grep '"version"' src-tauri/tauri.conf.json
```

The three must match or the release workflow's `meta` job hard-fails. A half-done
bump once shipped a v0.2.0 installer around a 0.1.0 binary.

## 6. Core pin

Not a command. If `src-tauri/Cargo.lock` changed in this diff, the core moved
underneath the app and this repo's CI does not compile the core. Run the
`core-pin-guard` agent before pushing.

## 7. Changelog

Not a command either. If a user of the desktop app can observe this change,
it needs an entry in the **core** repository's `crates/changelog/changelog.json`,
five locales, then a regenerated `CHANGELOG.md` here. `CHANGELOG.md` is
generated — editing it directly is blocked.

## Report

State each step's result plainly, with the failing output when something is red.
A step that was skipped is reported as skipped, not as passed. Finish with a
one-line verdict: safe to push, or what is blocking.
