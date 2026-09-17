---
name: pin-bump
description: Advances the core spacetrace pin in this repository, in the order that keeps the three things that break silently from breaking. Use when the core dependency is being moved forward, before tagging a desktop release, when `cargo update` is about to run, and when a build or a test breaks right after a pin move — including Turkish phrasings like "core pin'ini ilerlet", "pin'i güncelle", "core'u son hâline çek".
---

# Pin bump — spacetrace-desktop

`src-tauri/Cargo.toml` takes six core crates from git with **no rev, branch or
tag**, so the only pin is `src-tauri/Cargo.lock`. Moving it is a deliberate act
with a fixed order; the pieces that guard it exist but live in three different
places (an agent, a hook, and a test that fails under a misleading name). This
skill is the order.

`cargo update` resolves the **remote** `main`. The `../spacetrace` checkout next
to this one plays no part — local commits are invisible, and the risk comes from
what has been pushed.

## 1. Find out what is coming, before moving anything

```bash
cd ../spacetrace && git fetch && git log --oneline -20
```

Then run the **`spacetrace-tools:core-pin-guard`** agent. It reports what changed
in the core's public API between the pinned rev and the target, and separates
"breaks the build" from **"compiles and changes behaviour"** — which is the
dangerous class, because no CI in this repository builds the core.

Do not skip this because the build is green afterwards. A green build is exactly
what the dangerous class looks like.

## 2. Move the pin

```bash
cd src-tauri
cargo update -p spacetrace-scan-core -p spacetrace-store -p spacetrace-changelog
```

Three crates are named, not six: they all resolve from the same git source, so
updating these moves the whole source to the same rev. The `pin-move-guard` hook
will warn here — that is expected, it is this step.

## 3. Regenerate the changelog, from a core checkout

```bash
cd ../../spacetrace
cargo run -p spacetrace-changelog -- markdown --component desktop \
  > ../spacetrace-desktop/CHANGELOG.md
```

`CHANGELOG.md` is generated and the `block-changelog-edit` hook refuses to let
it be edited by hand; redirection is the sanctioned path.

**Do this even if you think the changelog did not move.** The changelog crate is
one of the six that just moved, and the file is compiled into the binary.

## 4. Build the frontend before any cargo command

```bash
cd ../spacetrace-desktop
yarn build
```

`generate_context!` reads the bundle config at compile time and refuses to expand
without `dist/`, which is gitignored. `cargo test` fails with a macro error that
never mentions the frontend. The `dist-before-cargo` hook catches this, but
running it here keeps the next step honest.

## 5. Test — and read one failure correctly

```bash
cd src-tauri && cargo test
```

**If `tests/changelog.rs` fails, it means the core moved and step 3 was skipped
or stale.** It does not mean the changelog is wrong. That test doubles as the pin
guard and its failure message is about the changelog, which is misleading at
exactly this moment.

Then run **`preflight`** for the rest of what CI runs.

## 6. Commit the pin as its own commit

The commit is usually `Cargo.lock` + `CHANGELOG.md`. **If the core's API changed
it touches `lib.rs` too** — two of the three pin commits in this repository's
history are like that, and a pin commit that also carries a code change should
say so in its body.

Say in the message which core commits came in, not just that the pin moved: the
lock file records the rev, but nobody reads a rev.
