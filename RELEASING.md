# Release

This repository is private (K2), but the download link for the installer
files has to be public — a private repository's release assets cannot be
downloaded without authentication. That's why `.github/workflows/release.yml`
builds here, and **publishes to the public `unalcakir28/spacetrace`
repository**.

Full rationale and the shared scheme across the three components: the core
repository's
[docs/RELEASING.md](https://github.com/unalcakir28/spacetrace/blob/main/docs/RELEASING.md).

## What happens when

| Event | Result |
|------|-------|
| Push to `main` | nothing |
| Push of a `v*` tag | permanent release under the `desktop-v*` tag in the public repo |
| `workflow_dispatch` | builds, does not publish — unless `publish: true` is given (dry run) |

**A `v*` tag is the only trigger**, since 19 September 2026. A push to `main`
used to build all three platforms into a rolling `desktop-continuous`
pre-release. That was the most expensive job in the account — macOS runner
minutes bill at 10x on a private repository — for a channel the download page
only ever fell back to, and its artifacts filled the account's 0.5 GB of
Actions storage and then failed a real release: all three platforms built,
nothing uploaded, `publish` skipped. Hence also `retention-days: 1` on every
`upload-artifact` below.

There is **no `paths-ignore`**, deliberately. It only ever applied to pushes,
so with `main` gone its one remaining effect would be to skip a *tag* push
whose commit happened to touch only documentation — publishing nothing and
saying nothing. Do not put one back.

Generated files — their names are fixed, the download page links to them
directly:

```
spacetrace-desktop-<version>-macos-universal.dmg
spacetrace-desktop-<version>-windows-x86_64-setup.exe
spacetrace-desktop-<version>-linux-x86_64.deb
spacetrace-desktop-<version>-linux-x86_64.rpm
spacetrace-desktop-<version>-linux-x86_64.AppImage
SHA256SUMS
```

macOS ships as a single **universal** dmg: so the download page has just one
macOS button, and "which Mac do I have" stops being the user's problem.

## The one manual step required

```bash
gh secret set RELEASE_TOKEN --repo unalcakir28/spacetrace-desktop
```

Token: fine-grained PAT, **Contents: Read and write** on the
`unalcakir28/spacetrace` repository only. The steps to create it are in the
core repository's RELEASING.md.

If the secret is missing, the workflow does not fail — it publishes the
assets to this private repo and prints a warning. Meaning the links don't
become public, nothing else breaks.

## Signing

**There is no trusted developer certificate.** macOS and Windows warn on
first launch; the download page explains what to do, and there's a
`SHA256SUMS` next to every file. A paid certificate is annual and can't live
in a repository — a deliberate gap, not something being hidden.

**But the macOS package is signed with a self-signed certificate, and not
for Gatekeeper — for TCC.** macOS binds Full Disk Access to the designated
requirement; an ad-hoc signature has no such thing, so it falls back to the
cdhash, and the cdhash changes on every build. Result: the user grants
permission, and on the next update macOS doesn't recognize the app and asks
again from scratch (reported by a user on 10 September 2026).

Two secrets are required:

```
APPLE_CERTIFICATE            # the .p12, base64-encoded
APPLE_CERTIFICATE_PASSWORD   # the .p12 password
```

**If the secrets are missing the workflow doesn't fail** — it signs ad-hoc as
before and prints a warning saying the permission prompts will come back.

What you need to know, all of it learned the hard way:

- **The certificate has to be a trusted root.** Tauri resolves the identity
  with `security find-identity -v`, and that only lists *valid* identities; a
  self-signed certificate isn't considered valid until it's made `trustRoot`.
  Runners are single-use, so this is redone on every build.
- **The keychain is set up explicitly**, not left to Tauri's own
  `APPLE_CERTIFICATE` path: Tauri puts the certificate into a temporary
  keychain you never see, and when it says "failed to resolve signing
  identity" there, you have no diagnostics at all. `APPLE_CERTIFICATE` is
  **not passed** to the build step, otherwise Tauri sets up a second keychain
  on top. The `find-identity -v` output is deliberately printed to the log.
- `openssl pkcs12 -legacy` is required — `security import` can't read
  OpenSSL 3's SHA-256 MAC.
- The keychain idle lock is set to 21600 seconds; the default is five
  minutes and the build takes longer than that.
- **A post-build step verifies the package's requirement** and fails on a
  mismatch. It's the **`root`** digest that's checked, not `leaf`. A build
  that silently falls back to ad-hoc installs flawlessly, runs, and brings
  back the permission prompts — because that's the kind of breakage that
  goes unnoticed, it isn't assumed, it's measured.
- **The `.dmg` is deliberately rebuilt unsigned.** A dmg signed with an
  untrusted certificate is rejected at mount time (v0.4.1, measured on macOS
  26.5.2); since `codesign --remove-signature` doesn't accept a disk image,
  it's rebuilt from scratch with `hdiutil convert`.

> **Missing:** how the `.p12` is produced (common name `spacetrace`,
> self-signed, code signing usage) isn't written down here. Whoever renews
> the certificate should write those steps here — the warning text in the
> workflow says "there's a single command in RELEASING.md", and right now
> that command isn't here.

## Cutting a stable release

The version number is in three places:

```
package.json                 "version"
src-tauri/Cargo.toml         version
src-tauri/tauri.conf.json    version
```

Update all three, then:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

## Icons

`src-tauri/icons/icon.svg` is the source. The derived files (`icon.icns`,
`icon.ico`, PNGs, Windows Store logos) live in the repo because the packager
can't generate them at build time. If the branding changes:

```bash
# convert the SVG to a 1024×1024 PNG, then:
yarn tauri icon /tmp/icon-1024.png
rm -rf src-tauri/icons/android src-tauri/icons/ios   # no mobile targets
```

Without `icon.icns` and `icon.ico`, the dmg and NSIS packages come out
without an icon.

## Self-updating

On launch, the app checks `latest.json` under the `desktop-latest` tag and
asks the user if there's a new stable version. The manifest is deleted and
recreated on every release, and a `v*` tag is the only thing that makes one.
It used to have to ignore the rolling `desktop-continuous` builds as well, or
everyone who had installed a version would have been prompted on every push;
that channel went on 19 September 2026, so there is nothing left for it to
point at by accident.

**One-time setup.** The signing key was generated and lives in
`~/.spacetrace/updater.key` (600, outside every repo). Its public key is in
`tauri.conf.json`. The private key needs to be added as a secret:

```bash
gh secret set TAURI_SIGNING_PRIVATE_KEY \
  --repo unalcakir28/spacetrace-desktop \
  < ~/.spacetrace/updater.key
```

**If the secret is missing, the workflow turns the updater off entirely for
the build** — it doesn't settle for leaving it unsigned. Both of the
following were learned by measuring:

- An undefined secret expands to an empty string, and Tauri tries to sign
  with that empty key and fails with `Missing comment in secret key`.
- Even with no private key at all, as long as `pubkey` remains in the
  configuration it still fails: `A public key has been found, but no private
  key`.

That's why the configuration is trimmed with `jq`. The installer packages
build and publish normally; only self-updating is missing — which is the
honest state for a pipeline that can't sign. It comes back on its own the
moment the secret is added.

**This key is not code signing.** Tauri's minisign signature proves the
package came from this pipeline; it doesn't say the operating system trusts
the app. The macOS `.app` does carry a signature, but from our own
self-signed certificate: a stable identity for TCC and nothing at all to
Gatekeeper. So an updated package can get caught by Gatekeeper again — the
changelog entry tells the user this.

Losing the key means installed apps can no longer update: a manifest signed
with a new key is rejected by the old `pubkey`. The recovery path is having
people download the new version by hand.

**The updater assets don't touch the five download names** — `.app.tar.gz`,
`.sig` files and `latest.json` are added files. The download page is tied to
the old five names, and that page is in a different repository.
