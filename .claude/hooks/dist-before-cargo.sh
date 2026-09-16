#!/usr/bin/env bash
# Refuses a compiling cargo command while ../dist is missing.
#
# `tauri::generate_context!` reads the bundle config at compile time and will
# not expand without `frontendDist` (../dist), which is gitignored. So in a
# clean clone every compiling cargo command fails — including `cargo test` —
# and the error talks about a macro rather than about the frontend not being
# built. This hook turns that into one sentence.
#
# Only compiling commands are gated. `cargo fmt`, `cargo update`, `cargo tree`
# and friends do not need the context and are none of this hook's business.
set -uo pipefail

command=$(jq -r '.tool_input.command // empty' 2>/dev/null)
[ -n "$command" ] || exit 0

case "$command" in
*cargo\ build* | *cargo\ test* | *cargo\ clippy* | *cargo\ check* | *cargo\ run*) ;;
*) exit 0 ;;
esac

root="${CLAUDE_PROJECT_DIR:-$PWD}"
[ -d "$root/dist" ] && exit 0

cat >&2 <<EOF
dist/ does not exist, so this cargo command will fail inside
tauri::generate_context! with an error that does not mention the frontend.

Build it first:

  yarn build

dist/ is gitignored, so a clean clone always needs this once. yarn tauri dev
and yarn tauri build run it for you; a bare cargo command does not.
EOF
exit 2
