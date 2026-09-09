// The strip that says what is happening while it happens.
//
// It is a strip and not a modal on purpose. Work here takes as long as the disk
// takes, and covering the window for the duration means the one thing the user
// can do while waiting — look at the scan they already have open — is the one
// thing they are prevented from doing. Everything stays on screen and stays
// usable; this appears above it and reports.
//
// It knows nothing about scans or deletes. Whoever starts the work decides what
// the label says, whether there is a fraction to show, and what the counters
// are — which is why a scan can be honest about having no denominator while a
// delete, which knows exactly how many entries it was given, shows a real one.

import * as fmt from "./format";

export interface Working {
  /**
   * Which job this is, for code rather than for the reader.
   *
   * Progress ticks arrive on shared channels and have to be matched against
   * whatever is currently running. That match used to be
   * `doing.startsWith("Scanning")` — a branch on a user-visible sentence, which
   * worked only for as long as the sentence was English. Translating it would
   * have stopped scan progress updating, silently, with no error anywhere.
   */
  kind: "scan" | "save" | "trash";
  /** What is being done, in the user's words: "Scanning Downloads". */
  doing: string;
  /**
   * How far along, 0 to 1 — absent when there is nothing honest to divide by.
   *
   * A scan cannot know how many entries are under a folder until it has walked
   * it. A delete was handed a list and knows exactly.
   */
  fraction?: number | null | undefined;
  /** Where the number comes from, or why there is not one. */
  basis?: string | undefined;
  /** Live figures, already formatted, shown right-aligned. */
  counters?: string[] | undefined;
  /** Set when something has gone wrong but the work continues. */
  warning?: string | undefined;
  /** Present when the work can be stopped. */
  onStop?: (() => void) | undefined;
  stopping?: boolean | undefined;
}

export function Progress({
  doing,
  fraction,
  basis,
  counters,
  warning,
  onStop,
  stopping,
}: Working) {
  const determinate = fraction !== null && fraction !== undefined;
  const percent = determinate ? Math.round(fraction * 100) : 0;

  return (
    <div className="progress" role="status" aria-live="polite">
      <div className="what">
        {determinate && <span className="pct">{percent}%</span>}
        <span className="doing">
          {doing}
          {stopping ? " — stopping" : "…"}
        </span>
        {basis && <span className="basis">{basis}</span>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {(counters?.length || warning) && (
          <div className="counters">
            {counters?.map((counter) => (
              <span key={counter}>{counter}</span>
            ))}
            {warning && <span style={{ color: "var(--hot)" }}>{warning}</span>}
          </div>
        )}
        {onStop && (
          <button className="ghost" onClick={onStop} disabled={stopping}>
            {stopping ? "Stopping…" : "Stop"}
          </button>
        )}
      </div>

      <div
        className={`track${determinate ? "" : " unknown"}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        {...(determinate ? { "aria-valuenow": percent } : {})}
      >
        <i style={determinate ? { width: `${fraction * 100}%` } : undefined} />
      </div>
    </div>
  );
}

/** What the estimate rests on, said plainly. Keys match `EstimateBasis` in lib.rs. */
const SCAN_BASIS: Record<string, string> = {
  last_scan: "estimated from your last scan of this folder",
  none: "first scan of this folder, so there is nothing to estimate against",
};

/** Turn a scan's report into something the strip can show. */
export function scanWorking(
  label: string,
  tick: { files: number; dirs: number; bytes: number; errors: number; elapsedMs: number; fraction: number | null; basis: string | null } | null,
  onStop: () => void,
  stopping?: boolean,
): Working {
  if (!tick) {
    return { kind: "scan", doing: `Scanning ${label}`, onStop, stopping };
  }
  return {
    kind: "scan",
    doing: `Scanning ${label}`,
    fraction: tick.fraction,
    basis: SCAN_BASIS[tick.basis ?? "none"],
    counters: [
      `${fmt.count(tick.files + tick.dirs)} entries`,
      fmt.bytes(tick.bytes),
      fmt.duration(tick.elapsedMs),
    ],
    warning: tick.errors > 0 ? `${fmt.count(tick.errors)} unreadable` : undefined,
    onStop,
    stopping,
  };
}

/**
 * Writing the open scan to the database.
 *
 * No fraction: `Store::save` walks the tree in one transaction and reports
 * nothing on the way, and the number of entries is not the number of rows
 * written in any way this could honestly divide. Counters and motion, then —
 * the same answer the first scan of a folder gets.
 */
export function saveWorking(entries: number): Working {
  return {
    kind: "save",
    doing: "Storing this scan",
    counters: [`${entries.toLocaleString("en-US").replace(/,/g, " ")} entries`],
    basis: "written in one transaction, so it cannot report progress",
  };
}

/** Turn a Trash operation's report into something the strip can show. */
export function trashWorking(
  total: number,
  tick: { done: number; total: number; name: string } | null,
): Working {
  const label = total === 1 ? "1 item" : `${total} items`;
  if (!tick || tick.total === 0) {
    return { kind: "trash", doing: `Moving ${label} to the Trash` };
  }
  return {
    kind: "trash",
    doing: tick.name
      ? `Moving ${tick.name} to the Trash`
      : `Moving ${label} to the Trash`,
    // Unlike a scan, this was handed a list, so the denominator is exact.
    fraction: tick.done / tick.total,
    counters: [`${tick.done} of ${tick.total}`],
  };
}
