//! Every IPC reply is run through `camelize` in `src/api.ts`, so a field
//! declared in snake_case on the TypeScript side is `undefined` at runtime.
//!
//! This is a bug the compiler cannot see. A TypeScript interface is a claim
//! about a shape, not a check of one, so declaring `up_to_days` type-checks
//! perfectly and then reads `undefined` from every object — which is exactly
//! what shipped in 0.6.1, where the age heat map's key rendered six rows of
//! "undefined güne kadar" next to six correct byte figures.
//!
//! It lives here, in Rust, for the reason everything with a rule in it lives
//! here: there is no JavaScript test runner in this app. The test reads the
//! frontend source as text, which is crude, and is worth it because the class
//! of bug is invisible to every other check in the build.
//!
//! **Only `export interface` blocks are checked**, and that boundary is the
//! whole accuracy of the test. `camelize` rewrites the keys of a *reply*, and
//! replies are what those interfaces describe. Two other kinds of snake_case
//! key are correct and must not be flagged: the object literals passed *to*
//! `invoke`, whose keys are the Rust argument names, and the error-code maps
//! in the locale files, whose keys are the strings the backend returns as
//! values. A first version of this test flagged all seven of them, which is
//! how a guard becomes something people switch off.

use std::path::{Path, PathBuf};

/// A line that declares a field on an interface or a type literal:
/// leading whitespace, an identifier, then `:` or `?:`.
///
/// Deliberately narrow. It matches declarations and not string values, so
/// `SizeBasis = "logical" | "on_disk"` is untouched — that is a value crossing
/// the wire, not a key, and `camelize` does not rewrite values.
fn declared_field(line: &str) -> Option<&str> {
    let trimmed = line.trim_start();
    let name: &str = trimmed.split([':', '?']).next()?.trim_end();
    if name.is_empty() || !trimmed[name.len()..].trim_start().starts_with(['?', ':']) {
        return None;
    }
    let mut chars = name.chars();
    let first = chars.next()?;
    if !first.is_ascii_lowercase() {
        return None;
    }
    chars
        .all(|c| c.is_ascii_alphanumeric() || c == '_')
        .then_some(name)
}

fn frontend_files(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            frontend_files(&path, out);
        } else if matches!(
            path.extension().and_then(|e| e.to_str()),
            Some("ts") | Some("tsx")
        ) {
            out.push(path);
        }
    }
}

/// Field names declared inside `export interface` blocks, with line numbers.
///
/// Brace counting rather than a parser: the blocks are flat enough that this
/// is honest, and a nested object type inside one is still part of the same
/// reply shape, so counting into it is the behaviour wanted anyway.
fn interface_fields(text: &str) -> Vec<(usize, String)> {
    let mut out = Vec::new();
    let mut depth = 0usize;
    for (number, line) in text.lines().enumerate() {
        if depth == 0 {
            if line.starts_with("export interface ") && line.trim_end().ends_with('{') {
                depth = 1;
            }
            continue;
        }
        if let Some(name) = declared_field(line) {
            out.push((number + 1, name.to_string()));
        }
        depth += line.matches('{').count();
        depth = depth.saturating_sub(line.matches('}').count());
    }
    out
}

#[test]
fn no_frontend_type_declares_a_snake_case_field() {
    let root = PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../src"));
    let mut files = Vec::new();
    frontend_files(&root, &mut files);
    assert!(
        !files.is_empty(),
        "no frontend sources found under {root:?}"
    );

    let mut offenders = Vec::new();
    let mut checked = 0;
    for file in &files {
        let text = std::fs::read_to_string(file).unwrap();
        for (number, name) in interface_fields(&text) {
            checked += 1;
            if name.contains('_') {
                offenders.push(format!(
                    "{}:{number}  {name}",
                    file.file_name().unwrap().to_string_lossy(),
                ));
            }
        }
    }
    // A test that found no interfaces would pass forever after a rename of the
    // source directory, which is the way this kind of check dies quietly.
    assert!(
        checked > 50,
        "only {checked} interface fields found; the scan is not reaching the types"
    );

    assert!(
        offenders.is_empty(),
        "these fields are snake_case, and `camelize` in api.ts means they will \
         be `undefined` at runtime — rename them to camelCase:\n  {}",
        offenders.join("\n  ")
    );
}

/// The check above is only worth having if it would actually fire. Asserting
/// on the matcher rather than on the codebase, because a codebase that happens
/// to be clean proves nothing about a test that matches nothing.
#[test]
fn the_matcher_finds_a_snake_case_field_and_leaves_the_rest_alone() {
    assert_eq!(
        declared_field("  up_to_days: number | null;"),
        Some("up_to_days")
    );
    assert_eq!(declared_field("  ageBand: number[];"), Some("ageBand"));
    assert_eq!(declared_field("  depth?: number | null;"), Some("depth"));

    // Not declarations: a union of string values, an object being built, and
    // prose. None of these are keys the wire has to agree about.
    assert_eq!(declared_field("export type SizeBasis = \"on_disk\";"), None);
    assert_eq!(declared_field("// up_to_days is the core's spelling"), None);
    assert_eq!(
        declared_field("  return call(\"age_profile\", args);"),
        None
    );
}

/// The narrowing is the test's accuracy, so it gets its own assertion: a key
/// inside an interface counts, and the same key in a call's argument object
/// does not.
#[test]
fn only_interface_blocks_are_examined() {
    let source = r#"export interface Reply {
  up_to_days: number | null;
}

export const api = {
  treemap(req: Thing) {
    return call("treemap", { min_area: req.minArea, max_depth: null });
  },
};
"#;
    let found: Vec<String> = interface_fields(source)
        .into_iter()
        .map(|(_, name)| name)
        .collect();
    assert_eq!(
        found,
        vec!["up_to_days"],
        "the argument keys belong to Rust and must not be flagged"
    );
}
