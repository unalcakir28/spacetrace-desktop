//! Reading snapshots from a spacetrace agent.
//!
//! A downloaded snapshot is the standalone SQLite file the agent already
//! stores, so once it is on disk the app opens it with exactly the same code as
//! a local one. There is no separate remote model to keep in step.

use std::io::Read;

use anyhow::{bail, Context, Result};
use spacetrace_scan_core::Tree;
use spacetrace_store::{ScanMeta, Store};

/// Refuse to buffer an unbounded body from a machine we do not control, and
/// refuse to let a small compressed body expand into a large one. A snapshot
/// costs roughly 50 bytes per entry, so this still allows tens of millions.
const MAX_SNAPSHOT_BYTES: u64 = 1024 * 1024 * 1024;

fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .build()
        .context("building the HTTP client")
}

pub async fn list(base: &str, token: &str) -> Result<Vec<ScanMeta>> {
    let url = format!("{}/scans", base.trim_end_matches('/'));
    let response = client()?
        .get(&url)
        .bearer_auth(token)
        .send()
        .await
        .with_context(|| format!("requesting {url}"))?;

    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    if !status.is_success() {
        // The agent explains itself in the body; a bare status would send the
        // user to the server logs.
        bail!("{url} returned {status}: {}", text.trim());
    }
    serde_json::from_str(&text).with_context(|| format!("unexpected response from {url}"))
}

/// Download one snapshot and load it.
pub async fn fetch(base: &str, token: &str, scan_id: i64) -> Result<(Tree, ScanMeta)> {
    let url = format!("{}/scans/{scan_id}/download", base.trim_end_matches('/'));
    let response = client()?
        .get(&url)
        .bearer_auth(token)
        .header(reqwest::header::ACCEPT_ENCODING, "zstd")
        .send()
        .await
        .with_context(|| format!("requesting {url}"))?;

    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        bail!("{url} returned {status}: {}", body.trim());
    }
    let compressed = response
        .headers()
        .get(reqwest::header::CONTENT_ENCODING)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v.trim().eq_ignore_ascii_case("zstd"));

    let body = response
        .bytes()
        .await
        .with_context(|| format!("reading the snapshot body from {url}"))?;
    anyhow::ensure!(
        body.len() as u64 <= MAX_SNAPSHOT_BYTES,
        "{url} sent more than {MAX_SNAPSHOT_BYTES} bytes; refusing to buffer it"
    );

    let raw = if compressed {
        decode_zstd_bounded(&body, MAX_SNAPSHOT_BYTES)
            .with_context(|| format!("{url} sent a body that is not valid zstd"))?
    } else {
        body.to_vec()
    };

    // Keep the file: opening a snapshot means opening a SQLite database, and
    // the store reads it lazily rather than holding it all in memory.
    let dir = tempfile::tempdir().context("creating a staging directory")?;
    let path = dir.path().join("snapshot.sqlite");
    std::fs::write(&path, &raw).context("writing the downloaded snapshot")?;

    let store = Store::open(&path).with_context(|| format!("{url} did not send a snapshot"))?;
    let loaded = store
        .list()?
        .first()
        .map(|m| m.id)
        .context("the downloaded snapshot is empty")?;
    let result = store.load(loaded)?;
    // The tree is fully in memory now, so the temporary file can go.
    drop(store);
    drop(dir);
    Ok(result)
}

fn decode_zstd_bounded(data: &[u8], limit: u64) -> std::io::Result<Vec<u8>> {
    let decoder = zstd::stream::Decoder::new(data)?;
    let mut out = Vec::new();
    decoder.take(limit + 1).read_to_end(&mut out)?;
    if out.len() as u64 > limit {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("decompressed snapshot exceeds the {limit} byte limit"),
        ));
    }
    Ok(out)
}
