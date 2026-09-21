#!/usr/bin/env bash
# Compares the three files that carry this app's version, the moment one is edited.
#
# package.json, src-tauri/Cargo.toml and src-tauri/tauri.conf.json each state the
# version and all three must agree. The release workflow's `meta` job fails hard
# on a mismatch, but that runs on a TAG PUSH — the earliest it can speak is after
# the tag exists, and the tag is the irreversible half of a release.
#
# Before that job existed a half-finished bump shipped: a v0.2.0 installer with a
# 0.1.0 binary inside it. The three files are not read by the same tool, so no
# local command compares them either — `yarn build`, `cargo test` and `yarn
# tauri build` each read one and are content.
#
# Fires on the edit, not at Stop, because a version bump is a three-step edit and
# the useful moment to say "one of the three is behind" is while the other two
# are still in hand. Says nothing when all three agree, which is every edit to
# these files that is not a bump.
set -uo pipefail

path=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -n "$path" ] || exit 0

case "$path" in
*package.json | *src-tauri/Cargo.toml | *src-tauri/tauri.conf.json) ;;
*) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$PWD}"
pkg="$root/package.json"
cargo="$root/src-tauri/Cargo.toml"
conf="$root/src-tauri/tauri.conf.json"

# An edit to some other package.json in the workspace is not this repository's
# business.
[ -f "$pkg" ] && [ -f "$cargo" ] && [ -f "$conf" ] || exit 0

pkg_version=$(jq -r '.version // empty' "$pkg" 2>/dev/null)
conf_version=$(jq -r '.version // empty' "$conf" 2>/dev/null)

# The first `version =` inside [package]; a [dependencies] entry must not match.
cargo_version=$(awk '
	/^\[/ { in_package = ($0 == "[package]") }
	in_package && /^version[[:space:]]*=/ {
		gsub(/^version[[:space:]]*=[[:space:]]*"|"[[:space:]]*$/, "")
		print
		exit
	}
' "$cargo" 2>/dev/null)

# A file that could not be read says nothing; a guard that reports a mismatch it
# invented is worse than no guard.
[ -n "$pkg_version" ] && [ -n "$cargo_version" ] && [ -n "$conf_version" ] || exit 0

[ "$pkg_version" = "$cargo_version" ] && [ "$cargo_version" = "$conf_version" ] && exit 0

cat >&2 <<EOF
The three version files disagree:

  package.json                 $pkg_version
  src-tauri/Cargo.toml         $cargo_version
  src-tauri/tauri.conf.json    $conf_version

All three must carry the same version. Nothing local compares them — yarn build,
cargo test and yarn tauri build each read one of the three and are satisfied —
and the release workflow's meta job only speaks after the tag is pushed.

A half-finished bump is not a build failure, it is a shipped one: it packages an
installer named for one version around a binary that reports another.

Finish the bump, or say in one line that this is intentional and mid-edit.
EOF
exit 2
