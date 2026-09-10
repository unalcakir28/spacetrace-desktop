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
import { dict, fill, plural, useDict } from "./i18n";

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
  const d = useDict();
  const determinate = fraction !== null && fraction !== undefined;
  const percent = determinate ? Math.round(fraction * 100) : 0;

  return (
    <div className="progress" role="status" aria-live="polite">
      <div className="what">
        {determinate && <span className="pct">{percent}%</span>}
        <span className="doing">
          {doing}
          {stopping ? ` — ${d.progress.stopping}` : "…"}
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
            {stopping ? d.progress.stopInProgress : d.progress.stop}
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
function scanBasis(key: string | null): string {
  return key === "last_scan" ? dict().progress.fromLastScan : dict().progress.firstScan;
}

/** Turn a scan's report into something the strip can show. */
/**
 * The line shown when nothing has moved for a while.
 *
 * A mount that has stopped answering blocks a thread inside the kernel, and
 * nothing this app can do will lift that — so the honest thing is to name the
 * folder and let the reader decide whether to wait or to stop. A bar that
 * keeps animating over a scan that is going nowhere is the version of this
 * that wastes someone's afternoon.
 */
function stallWarning(tick: {
  stalledMs: number | null;
  waitingOn: string[];
}): string | undefined {
  if (tick.stalledMs === null) return undefined;
  const d = dict();
  const seconds = Math.round(tick.stalledMs / 1000);
  const [first, ...rest] = tick.waitingOn;
  // No path at all when the walk is blocked before any listing starts — on the
  // scanned folder itself, for instance. Saying so beats an empty sentence.
  if (first === undefined) {
    return fill(d.progress.stalled, { seconds: fmt.count(seconds) });
  }
  const where =
    rest.length > 0
      ? fill(d.progress.stalledAndMore, { path: first, count: fmt.count(rest.length) })
      : first;
  return fill(d.progress.stalledOn, { seconds: fmt.count(seconds), path: where });
}

/** Turn a scan's report into something the strip can show. */
export function scanWorking(
  label: string,
  tick:
    | {
        files: number;
        dirs: number;
        bytes: number;
        errors: number;
        elapsedMs: number;
        fraction: number | null;
        basis: string | null;
        phase: string;
        clonesProbed: number;
        stalledMs: number | null;
        waitingOn: string[];
      }
    | null,
  onStop: () => void,
  stopping?: boolean,
): Working {
  const d = dict();
  const doing = fill(d.progress.scanning, { folder: label });
  if (!tick) {
    return { kind: "scan", doing, onStop, stopping };
  }
  // After the walk the file count has stopped for good and only the clone
  // probe moves, so both the label and the counters change with the phase —
  // otherwise the strip reads as frozen for the rest of the scan.
  const finishing = tick.phase === "finishing";
  return {
    kind: "scan",
    doing: finishing ? d.progress.finishing : doing,
    fraction: finishing ? null : tick.fraction,
    basis: finishing ? d.progress.finishingNote : scanBasis(tick.basis),
    counters: finishing
      ? [
          fill(d.progress.clonesChecked, { count: fmt.count(tick.clonesProbed) }),
          fmt.duration(tick.elapsedMs),
        ]
      : [
          fill(d.progress.entries, { count: fmt.count(tick.files + tick.dirs) }),
          fmt.bytes(tick.bytes),
          fmt.duration(tick.elapsedMs),
        ],
    // A stall outranks the unreadable-count note: one is the scan telling you
    // it is stuck, the other is a tally it will still report at the end.
    warning:
      stallWarning(tick) ??
      (tick.errors > 0
        ? fill(d.progress.unreadable, { count: fmt.count(tick.errors) })
        : undefined),
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
  const d = dict();
  return {
    kind: "save",
    doing: d.progress.storing,
    counters: [fill(d.progress.entries, { count: fmt.count(entries) })],
    basis: d.progress.oneTransaction,
  };
}

/** Turn a Trash operation's report into something the strip can show. */
export function trashWorking(
  total: number,
  tick: { done: number; total: number; name: string } | null,
): Working {
  const d = dict();
  // Pluralised by the language's own rules rather than by `total === 1`:
  // Turkish has one form where English has two, and French counts zero as
  // singular.
  const many = plural(total, d.progress.movingCount);
  if (!tick || tick.total === 0) {
    return { kind: "trash", doing: many };
  }
  return {
    kind: "trash",
    doing: tick.name ? fill(d.progress.movingNamed, { name: tick.name }) : many,
    // Unlike a scan, this was handed a list, so the denominator is exact.
    fraction: tick.done / tick.total,
    counters: [fill(d.progress.doneOf, { done: tick.done, total: tick.total })],
  };
}
