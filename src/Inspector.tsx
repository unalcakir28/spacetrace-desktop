// Detail panel for the selected entry, and the only place that offers to
// change anything on disk.
//
// The destructive action is gated twice: the backend refuses unless the open
// tree is a live scan of this machine, and the UI asks for confirmation. A disk
// tool that deletes the wrong thing is worse than no disk tool.

import { useEffect, useState } from "react";
import { api, errorMessage, type EntryView, type Opened } from "./api";
import * as fmt from "./format";

export interface InspectorProps {
  opened: Opened;
  selected: number | null;
  /** Called after a successful trash, so the caller can rescan. */
  onTrashed(entry: EntryView): void;
}

export function Inspector({ opened, selected, onTrashed }: InspectorProps) {
  const [entry, setEntry] = useState<EntryView | null>(null);
  const [absolute, setAbsolute] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setError(null);
    setConfirming(false);
    if (selected === null) {
      setEntry(null);
      setAbsolute("");
      return;
    }
    let cancelled = false;
    Promise.all([api.entry(selected), api.absolutePath(selected)])
      .then(([view, path]) => {
        if (cancelled) return;
        setEntry(view);
        setAbsolute(path);
      })
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (!entry) {
    return (
      <>
        <div className="panel-title">Selection</div>
        <p className="hint">
          Click a rectangle to inspect it. Double-click a folder to zoom in.
        </p>
        <div className="panel-title" style={{ paddingLeft: 0 }}>
          This scan
        </div>
        <dl className="kv">
          <dt>Entries</dt>
          <dd>{fmt.count(opened.entries)}</dd>
          <dt>Logical</dt>
          <dd>{fmt.bytes(opened.totalSize)}</dd>
          <dt>On disk</dt>
          <dd>{fmt.bytes(opened.totalAlloc)}</dd>
          {opened.scanErrors > 0 && (
            <>
              <dt>Unreadable</dt>
              <dd>{fmt.count(opened.scanErrors)} paths</dd>
            </>
          )}
        </dl>
        {opened.errorSamples.length > 0 && (
          <details>
            <summary className="hint" style={{ cursor: "pointer" }}>
              Paths that could not be read
            </summary>
            <div className="hint" style={{ marginTop: 6 }}>
              {opened.errorSamples.map((sample) => (
                <div key={sample} style={{ wordBreak: "break-all", marginBottom: 3 }}>
                  {sample}
                </div>
              ))}
            </div>
          </details>
        )}
      </>
    );
  }

  const share = opened.totalSize > 0 ? fmt.percent(entry.size, opened.totalSize) : "—";

  return (
    <>
      <div className="panel-title" style={{ paddingLeft: 0 }}>
        Selection
      </div>
      <h3>
        {entry.name || "/"}
        {entry.isDir ? "/" : ""}
      </h3>
      <div className="path">{entry.relPath || "the scan root"}</div>

      {error && <div className="error">{error}</div>}

      <dl className="kv">
        <dt>Logical</dt>
        <dd>{fmt.bytes(entry.size)}</dd>
        <dt>On disk</dt>
        <dd>{fmt.bytes(entry.alloc)}</dd>
        <dt>Share</dt>
        <dd>{share}</dd>
        {entry.isDir && (
          <>
            <dt>Files</dt>
            <dd>{fmt.count(entry.files)}</dd>
            <dt>Folders</dt>
            <dd>{fmt.count(entry.dirs)}</dd>
          </>
        )}
        <dt>Type</dt>
        <dd>{entry.category}</dd>
        <dt>Modified</dt>
        <dd>{entry.mtime > 0 ? fmt.timestamp(entry.mtime) : "—"}</dd>
        <dt>Full path</dt>
        <dd>{absolute}</dd>
      </dl>

      <div className="actions">
        <button
          onClick={() => {
            setError(null);
            api.reveal(entry.node).catch((err) => setError(errorMessage(err)));
          }}
          disabled={!opened.canModify}
        >
          Show in file manager
        </button>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={!opened.canModify || entry.relPath === ""}
            style={opened.canModify ? { borderColor: "#7f2d2d", color: "#fca5a5" } : undefined}
          >
            Move to Trash…
          </button>
        ) : (
          <div
            style={{
              border: "1px solid #7f2d2d",
              borderRadius: 6,
              padding: 9,
              background: "rgba(248,113,113,0.07)",
            }}
          >
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              Move <strong>{entry.name}</strong> ({fmt.bytes(entry.size)}
              {entry.isDir && `, ${fmt.count(entry.files)} files`}) to the Trash?
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                style={{ borderColor: "#7f2d2d", color: "#fca5a5" }}
                disabled={working}
                onClick={() => {
                  setWorking(true);
                  setError(null);
                  api
                    .moveToTrash(entry.node)
                    .then(() => {
                      setConfirming(false);
                      onTrashed(entry);
                    })
                    .catch((err) => setError(errorMessage(err)))
                    .finally(() => setWorking(false));
                }}
              >
                {working ? <span className="spinner" /> : "Move to Trash"}
              </button>
              <button onClick={() => setConfirming(false)} disabled={working}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {!opened.canModify && (
          <p className="hint">
            This is a stored snapshot, not the live filesystem, so files cannot be
            acted on. Scan the folder again to work with it.
          </p>
        )}
      </div>
    </>
  );
}
