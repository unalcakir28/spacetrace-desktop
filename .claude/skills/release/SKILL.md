---
name: release
description: Cut a stable spacetrace-desktop release end to end — version in three files, tag, then verify the published installers rather than trusting CI. Use when the user asks to publish, cut, ship or tag a desktop version, including Turkish phrasings like "masaüstü sürümü yayınla", "desktop sürüm kes", "0.8.0 yayınla", or asks whether a desktop version has been released yet.
disable-model-invocation: true
---

# Release — spacetrace-desktop

Full prose in [RELEASING.md](../../../RELEASING.md). This is the order of
operations plus the things that have actually gone wrong.

**Installers are published into the public core repository**, not this one
(`unalcakir28/spacetrace`), because a private repo's release assets need a
credential to download and the download page cannot supply one.

## 1. Decide what is being released

```bash
git log --oneline $(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null)..HEAD
```

Then read the unreleased desktop entries in the **core** repository's
`crates/changelog/changelog.json`. Those are what the release announces. If a
user-visible change in this range has no entry, stop and write it first — in
five locales, in the core repo, with the `changelog-entry` skill there.

## 2. Close the changelog and regenerate

From a core checkout, move the desktop `unreleased` entries into the new version
and regenerate here:

```bash
cargo run -p spacetrace-changelog -- markdown --component desktop > CHANGELOG.md
```

`tests/changelog.rs` asserts this file is current. The release notes are sliced
out of it with `awk`, so what is in this file *is* what the release says.

## 3. Bump the version in three files

```
package.json                 "version"
src-tauri/Cargo.toml         version
src-tauri/tauri.conf.json    version
```

**The `meta` job hard-fails if they disagree**, and asserts `tag == v$version`
on a real tag push. A half-done bump once shipped a v0.2.0 installer wrapped
around a 0.1.0 binary.

Then refresh the lockfile so `Cargo.lock` carries the new version:

```bash
cd src-tauri && cargo check
```

## 4. Preflight

Run the `preflight` skill. Do not skip it because the diff looks like a version
bump — step 0 (`yarn build`) is what makes every cargo step possible, and the
changelog test is what catches a pin that moved.

## 5. Commit, tag, push

```bash
git add -A && git commit   # subject: "0.8.0: <one line about what it is>"
git tag v0.8.0
git push origin main
git push origin v0.8.0
```

Ask before pushing. The tag push is what publishes.

## 6. Verify the published artefacts — do not trust green CI

Green CI has published a broken release here more than once. Check, in the core
repository's releases:

- **Five installer filenames present**, unchanged. They are a contract with the
  download page in `spacetrace-website`; a rename breaks every link silently and
  no single CI step sees both sides.
- **The macOS `.dmg` mounts.** It is deliberately rebuilt *unsigned*: a dmg
  signed with an untrusted certificate is rejected at mount time, which is how
  v0.4.1 shipped. Download it and open it.
- **The macOS `.app` is signed**, and with the trusted root — not ad hoc. The
  workflow asserts this and fails if not, because an ad-hoc signature silently
  makes macOS forget Full Disk Access on every update.
- **The updater manifest exists** under `desktop-latest`. `--bundles` on the CLI
  *overrides* `bundle.targets` rather than adding to it, which is why v0.3.0
  shipped no macOS updater package at all; the macOS matrix entry must list
  `app,dmg`.
- **GitHub's "latest" did not move.** Stable releases pass `--latest=false`: the
  core repo's release list holds all three components, and that endpoint belongs
  to the CLI. A desktop tag in the slot parses as no version at all and
  `spacetrace update` goes quiet permanently — measured on 9 September 2026,
  when hub-v0.3.0 took it.

## 7. Tell the download page

The site reads tag and asset names from `src/data/releases.ts` in
`spacetrace-website`. If anything about the names changed, that is a second
commit in a second repository on the same day.

## Report

What was released, the five asset names as published, and the result of each
verification in step 6 — each one checked, not assumed. If something is wrong,
say so plainly; a bad release is cheaper to retract in the first hour.
