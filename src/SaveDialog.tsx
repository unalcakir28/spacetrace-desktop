// Storing the open scan, so it can be compared against later.
//
// A dialog rather than a checkbox on the scan form, and the reason is worth
// keeping: whether a scan is worth keeping is a question you answer *after*
// looking at it. Asked up front, the box would be left ticked, and the scan
// form is the thing that gets used most — every rescan and every re-scan after
// a cleanup. The value of a snapshot is comparison over time, so twenty scans
// of one afternoon is not twenty times the value, it is a diff picker nobody
// can find anything in.
//
// It also keeps the app's only two writes the same shape: deliberate, named,
// and never a side effect of something else.

import { useEffect, useRef, useState } from "react";
import type { Opened } from "./api";
import * as fmt from "./format";

export function SaveDialog({
  opened,
  db,
  busy,
  onConfirm,
  onCancel,
}: {
  opened: Opened;
  /** Where it will be written; shown because it is not obvious. */
  db: string;
  busy: boolean;
  onConfirm(label: string): void;
  onCancel(): void;
}) {
  const [label, setLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // The label is the only thing to fill in, so focus goes there.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const root = opened.source.root;

  return (
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="dialog" style={{ maxWidth: 520 }} role="dialog" aria-modal="true">
        <header>
          <h2>Store this scan</h2>
        </header>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) onConfirm(label);
          }}
        >
          <div className="body">
            <dl className="kv" style={{ marginBottom: 12 }}>
              <dt>Folder</dt>
              <dd style={{ wordBreak: "break-all" }}>{root}</dd>
              <dt>On disk</dt>
              <dd>{fmt.bytes(opened.totalAlloc)}</dd>
              <dt>Entries</dt>
              <dd>{fmt.count(opened.entries)}</dd>
            </dl>

            <div className="field">
              <label htmlFor="save-label">Label</label>
              <input
                id="save-label"
                ref={inputRef}
                value={label}
                placeholder="optional, e.g. before cleanup"
                onChange={(event) => setLabel(event.target.value)}
                disabled={busy}
              />
            </div>
            <p className="hint" style={{ marginTop: 0 }}>
              A name to recognise it by in the snapshot list. Comparisons are
              made between snapshots of the same folder, so something saying
              when or why helps more than a date — the date is recorded anyway.
            </p>

            <div className="trash-path" style={{ marginTop: 10 }}>
              {db}
            </div>
          </div>
          <footer>
            <button type="button" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" disabled={busy}>
              {busy ? "Storing…" : "Store snapshot"}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
