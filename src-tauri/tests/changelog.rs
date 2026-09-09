//! CHANGELOG.md is generated, so it can silently fall behind its source.
//!
//! The source is `crates/changelog/changelog.json` in the core repo, which
//! arrives here as a git dependency. That makes this test do double duty: it
//! also fails when the core pin is advanced and CHANGELOG.md is not
//! regenerated, which is the step docs/RELEASING.md warns about — a release
//! whose binary embeds an older changelog than its own release notes.

use spacetrace_changelog::{changelog, render, Component};

#[test]
fn changelog_md_matches_its_source() {
    let expected = render::markdown(changelog(), Component::Desktop);
    // The manifest sits in src-tauri/, the file at the repo root above it.
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../CHANGELOG.md");
    let actual = std::fs::read_to_string(path).expect("CHANGELOG.md at the repo root");

    assert_eq!(
        actual, expected,
        "CHANGELOG.md is stale. From a checkout of the core repo:\n  \
         cargo run -p spacetrace-changelog -- markdown --component desktop > CHANGELOG.md"
    );
}

/// The About panel renders whatever this returns. An empty list would show a
/// heading with nothing under it, which reads as a bug rather than as
/// "nothing shipped yet".
#[test]
fn the_desktop_has_something_to_say_for_itself() {
    let log = changelog().component(Component::Desktop);
    assert!(!log.releases.is_empty() || !log.unreleased.is_empty());
}
