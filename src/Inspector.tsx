// Detail panel for what is selected.
//
// It shows, it does not decide. The destructive action is asked for here but
// confirmed and carried out by the window, so there is one confirmation and one
// place that states what moving to the Trash does — the panel used to hold its
// own, worded its own way, which is how a destructive action ends up explained
// two different ways.

import { useEffect, useState } from "react";
import { api, errorMessage, isStale, type EntryView, type Opened } from "./api";
import {
  BASIS_LABEL,
  divergence,
  DIVERGENCE_NOTE,
  measure,
  OTHER_BASIS,
  totalOf,
  type SizeBasis,
} from "./basis";
import { categoryColor, CATEGORY_NOTES } from "./categories";
import * as fmt from "./format";

export interface InspectorProps {
  opened: Opened;
  /** What is selected, already resolved by the window. */
  entries: EntryView[];
  /** The measure the window is reading by; the leading figure follows it. */
  basis: SizeBasis;
  /** Something is already running; do not offer to start more. */
  busy: boolean;
  onReveal(node: number): void;
  onTrash(nodes: number[]): void;
}

export function Inspector({
  opened,
  entries,
  basis,
  busy,
  onReveal,
  onTrash,
}: InspectorProps) {
  if (entries.length === 0) return <NothingSelected opened={opened} basis={basis} />;
  if (entries.length > 1) {
    return (
      <ManySelected
        opened={opened}
        entries={entries}
        basis={basis}
        busy={busy}
        onTrash={onTrash}
      />
    );
  }
  return (
    <OneSelected
      opened={opened}
      entry={entries[0]!}
      basis={basis}
      busy={busy}
      onReveal={onReveal}
      onTrash={onTrash}
    />
  );
}

function NothingSelected({ opened, basis }: { opened: Opened; basis: SizeBasis }) {
  return (
    <>
      <div className="panel-title" style={{ paddingLeft: 0 }}>
        Nothing selected
      </div>
      <p className="hint" style={{ marginTop: 0 }}>
        Click a row or a rectangle to inspect it. Hold ⌘ to add to the selection,
        or ⇧ to take a run of rows. Right-click for what can be done with it.
      </p>
      <div className="panel-title" style={{ paddingLeft: 0 }}>
        This scan
      </div>
      <dl className="kv">
        <dt>Entries</dt>
        <dd>{fmt.count(opened.entries)}</dd>
        {/* The measure in force is listed first and named, so a reader who
            wonders why two figures differ finds the answer in the same place. */}
        <dt>{BASIS_LABEL[basis]}</dt>
        <dd>
          <b>{fmt.bytes(totalOf(opened, basis))}</b>
        </dd>
        <dt>{BASIS_LABEL[OTHER_BASIS[basis]]}</dt>
        <dd>
          {fmt.bytes(basis === "on_disk" ? opened.totalSize : opened.totalAlloc)}
        </dd>
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

/**
 * A selection of several entries.
 *
 * Their combined size is the number worth having: the reason for selecting
 * eleven cache folders is to find out whether clearing them is worth doing.
 */
function ManySelected({
  opened,
  entries,
  basis,
  busy,
  onTrash,
}: {
  opened: Opened;
  entries: EntryView[];
  basis: SizeBasis;
  busy: boolean;
  onTrash(nodes: number[]): void;
}) {
  const total = entries.reduce((sum, entry) => sum + measure(entry, basis), 0);
  const files = entries.reduce((sum, entry) => sum + entry.files, 0);
  const folders = entries.filter((entry) => entry.isDir).length;
  const biggest = [...entries]
    .sort((a, b) => measure(b, basis) - measure(a, basis))
    .slice(0, 6);

  return (
    <>
      <div className="panel-title" style={{ paddingLeft: 0 }}>
        {entries.length} selected
      </div>
      <h3 style={{ fontFamily: "var(--sans)", fontSize: 17 }}>
        <span className="num">{fmt.bytes(total)}</span>
      </h3>
      <div className="path" style={{ marginBottom: 14 }}>
        {totalOf(opened, basis) > 0
          ? fmt.percent(total, totalOf(opened, basis))
          : "—"}{" "}
        of this scan, {BASIS_LABEL[basis].toLowerCase()}
      </div>

      <dl className="kv">
        <dt>Files</dt>
        <dd>{fmt.count(files)}</dd>
        <dt>Folders</dt>
        <dd>{fmt.count(folders)}</dd>
        <dt>Entries</dt>
        <dd>{fmt.count(entries.length)}</dd>
      </dl>

      <div className="panel-title" style={{ paddingLeft: 0 }}>
        Largest of them
      </div>
      <div className="trash-list" style={{ marginBottom: 14 }}>
        {biggest.map((entry) => (
          <div key={entry.node} className="trash-item">
            <span title={entry.relPath}>
              {entry.name}
              {entry.isDir ? "/" : ""}
            </span>
            <b>{fmt.bytes(measure(entry, basis))}</b>
          </div>
        ))}
      </div>

      <div className="actions">
        <button
          className={opened.canModify ? "danger" : undefined}
          disabled={!opened.canModify || busy}
          onClick={() => onTrash(entries.map((entry) => entry.node))}
        >
          Move {entries.length} items to Trash…
        </button>
        {!opened.canModify && <SnapshotNote />}
      </div>
    </>
  );
}

function OneSelected({
  opened,
  entry,
  basis,
  busy,
  onReveal,
  onTrash,
}: {
  opened: Opened;
  entry: EntryView;
  basis: SizeBasis;
  busy: boolean;
  onReveal(node: number): void;
  onTrash(nodes: number[]): void;
}) {
  const [absolute, setAbsolute] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    let cancelled = false;
    api
      .absolutePath(opened.generation, entry.node)
      .then((path) => !cancelled && setAbsolute(path))
      .catch((err) => {
        if (cancelled || isStale(err)) return;
        setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [opened.generation, entry.node]);

  const scanTotal = totalOf(opened, basis);
  const own = measure(entry, basis);
  const shareOfScan = scanTotal > 0 ? own / scanTotal : 0;
  // Only said when the two figures are far enough apart to look like a fault.
  const gap = divergence(entry);
  // What it is full of, so this panel and the folder list agree on the colour
  // for the same entry. A folder's own "type" is just "folder".
  const tint = categoryColor(entry.dominant);

  return (
    <>
      <div className="panel-title" style={{ paddingLeft: 0 }}>
        Selection
      </div>
      <h3>
        <span
          className="swatch"
          style={{ background: tint, width: 9, height: 9, borderRadius: 2, flex: "none" }}
        />
        {entry.name || "/"}
        {entry.isDir ? "/" : ""}
      </h3>
      <div className="path">{entry.relPath || "the scan root"}</div>

      {error && <div className="error">{error}</div>}

      {/* Its share of the whole scan, in the colour of what it is — the same
          encoding the folder list uses, so the two panels read as one thing. */}
      <div className="share-bar" style={{ ["--tint" as string]: tint }}>
        <i style={{ width: `${Math.max(shareOfScan * 100, 0.8)}%` }} />
      </div>

      <dl className="kv">
        <dt>{BASIS_LABEL[basis]}</dt>
        <dd>
          <b>{fmt.bytes(own)}</b>
        </dd>
        <dt>{BASIS_LABEL[OTHER_BASIS[basis]]}</dt>
        <dd>{fmt.bytes(basis === "on_disk" ? entry.size : entry.alloc)}</dd>
        <dt>Share</dt>
        <dd>{scanTotal > 0 ? fmt.percent(own, scanTotal) : "—"}</dd>
        {entry.isDir && (
          <>
            <dt>Files</dt>
            <dd>{fmt.count(entry.files)}</dd>
            <dt>Folders</dt>
            <dd>{fmt.count(entry.dirs)}</dd>
          </>
        )}
        <dt>Type</dt>
        <dd title={CATEGORY_NOTES[entry.category]}>{entry.category}</dd>
        {entry.isDir && entry.dominant !== "directory" && (
          <>
            <dt>Mostly</dt>
            <dd title={CATEGORY_NOTES[entry.dominant]}>{entry.dominant}</dd>
          </>
        )}
        <dt>Modified</dt>
        <dd>{entry.mtime > 0 ? fmt.timestamp(entry.mtime) : "—"}</dd>
        <dt>Full path</dt>
        <dd>{absolute}</dd>
      </dl>

      {gap && (
        <p className="hint" style={{ marginTop: -4 }}>
          {gap === "sparse" && <span className="badge warn">sparse</span>}{" "}
          {DIVERGENCE_NOTE[gap]}
        </p>
      )}

      <div className="actions">
        <button onClick={() => onReveal(entry.node)} disabled={!opened.canModify}>
          Show in file manager
        </button>
        <button
          className={opened.canModify ? "danger" : undefined}
          onClick={() => onTrash([entry.node])}
          disabled={!opened.canModify || entry.relPath === "" || busy}
        >
          Move to Trash…
        </button>
        {!opened.canModify && <SnapshotNote />}
      </div>
    </>
  );
}

function SnapshotNote() {
  return (
    <p className="hint">
      This is a stored snapshot, not the live filesystem, so files cannot be
      acted on. Scan the folder again to work with it.
    </p>
  );
}
