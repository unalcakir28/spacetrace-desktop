// The one place that asks "are you sure", for one entry or a hundred.
//
// It was previously an inline panel in the inspector, which was fine while
// deleting was a single-row action. With a selection it has to be able to list
// what is about to go, and having two confirmations that word the consequences
// differently is how a destructive action ends up being explained wrongly in
// one of them.

import { useEffect, useRef } from "react";
import type { EntryView } from "./api";
import * as fmt from "./format";
import { fill, useDict } from "./i18n";

/** Beyond this the list is a wall of names; the totals are what matter. */
const LIST_LIMIT = 12;

export function TrashDialog({
  entries,
  busy,
  onConfirm,
  onCancel,
}: {
  entries: EntryView[];
  busy: boolean;
  onConfirm(): void;
  onCancel(): void;
}) {
  const d = useDict();
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus lands on Cancel's neighbour rather than on Cancel itself: Escape
  // already cancels, and the reason for opening this was to delete something.
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  // Always on disk, whichever measure the window is reading by. This dialog
  // answers "how much room will this make", and for a sparse file the logical
  // figure answers a different question by a factor of fifty — telling someone
  // they are about to recover a terabyte from a 19 GiB image is the worst kind
  // of wrong number to put above a destructive button.
  const totalAlloc = entries.reduce((sum, entry) => sum + entry.alloc, 0);
  const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
  const claimsMore = totalSize > totalAlloc * 1.5;
  const totalFiles = entries.reduce((sum, entry) => sum + entry.files, 0);
  const folders = entries.filter((entry) => entry.isDir).length;
  const single = entries.length === 1 ? entries[0] : null;

  return (
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="dialog" style={{ maxWidth: 520 }} role="dialog" aria-modal="true">
        <header>
          <h2>
            {single
              ? fill(d.trash.titleOne, { name: single.name })
              : fill(d.trash.titleMany, { count: entries.length })}
          </h2>
        </header>
        <div className="body">
          <dl className="kv" style={{ marginBottom: 12 }}>
            <dt>{d.basis.onDisk}</dt>
            <dd>
              <b>{fmt.bytes(totalAlloc)}</b>
            </dd>
            {claimsMore && (
              <>
                <dt>{d.basis.logical}</dt>
                <dd>{fmt.bytes(totalSize)}</dd>
              </>
            )}
            <dt>{d.common.files}</dt>
            <dd>{fmt.count(totalFiles)}</dd>
            {folders > 0 && (
              <>
                <dt>{d.common.folders}</dt>
                <dd>{fmt.count(folders)}</dd>
              </>
            )}
          </dl>

          {!single && (
            <div className="trash-list">
              {entries.slice(0, LIST_LIMIT).map((entry) => (
                <div key={entry.node} className="trash-item">
                  <span title={entry.relPath}>
                    {entry.relPath || entry.name}
                    {entry.isDir ? "/" : ""}
                  </span>
                  <b>{fmt.bytes(entry.alloc)}</b>
                </div>
              ))}
              {entries.length > LIST_LIMIT && (
                <div className="hint" style={{ padding: "5px 8px" }}>
                  {fill(d.trash.andMore, { count: entries.length - LIST_LIMIT })}
                </div>
              )}
            </div>
          )}

          {single && <div className="trash-path">{single.relPath || single.name}</div>}

          {/* The thing people get wrong, said before they commit rather than
              after: the folder shrinks, the disk does not. */}
          <p className="hint" style={{ marginTop: 12 }}>
            {entries.length === 1 ? d.trash.leavesOne : d.trash.leavesMany}
          </p>
        </div>
        <footer>
          <button onClick={onCancel} disabled={busy}>
            {d.common.cancel}
          </button>
          <button className="danger" ref={confirmRef} onClick={onConfirm} disabled={busy}>
            {single
              ? d.trash.confirmOne
              : fill(d.trash.confirmMany, { count: entries.length })}
          </button>
        </footer>
      </div>
    </div>
  );
}
