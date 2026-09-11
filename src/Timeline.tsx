// A target's whole history: every snapshot of one (host, root) pair on one
// line, and the step-by-step account of what happened between them.
//
// The product's claim is that it tells you *what grew*. Until now the window
// could compare two snapshots but never showed the shape of a history, so the
// user had to already know which two to compare. This is the view that makes
// that choice for them: the line shows where the jump is, and the step under
// it opens the diff for exactly that jump.
//
// There is no arithmetic here that could be wrong about anything but drawing.
// Grouping and ordering happen in `src-tauri/src/history.rs`, where there are
// tests; what is left is subtraction between two adjacent points, and a scale.

import { useEffect, useState } from "react";
import {
  api,
  errorMessage,
  type DiffView,
  type HistoryTarget,
  type Opened,
  type SizeBasis,
} from "./api";
import { basisLabel } from "./basis";
import { Scrim } from "./Dialogs";
import * as fmt from "./format";
import { fill, useDict } from "./i18n";

/** The drawing surface, in SVG user units. Scales with the dialog width. */
const W = 720;
const H = 200;
const PAD = { top: 12, right: 14, bottom: 26, left: 68 };

const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

const DAY = 86_400;

/**
 * The folder the window is showing, so this opens on its line rather than on
 * whatever was scanned last. `host` is absent for a live scan: nothing on this
 * machine has been stored under a hostname yet.
 */
export interface Focus {
  root: string;
  host: string | undefined;
}

function valueOf(point: { size: number; alloc: number }, basis: SizeBasis): number {
  return basis === "on_disk" ? point.alloc : point.size;
}

/**
 * The line itself.
 *
 * **The y axis starts at zero, always.** A chart cropped to the range of its
 * own data turns a 2% drift into a cliff, and this one exists to answer "is
 * this growing?" — the question a cropped axis answers wrongly. The cost is
 * that small changes look small, which is the truth.
 */
function Chart({
  target,
  basis,
  picked,
  onToggle,
}: {
  target: HistoryTarget;
  basis: SizeBasis;
  picked: number[];
  onToggle(scanId: number): void;
}) {
  const d = useDict();
  const values = target.points.map((p) => valueOf(p, basis));
  const top = Math.max(...values, 1) * 1.08;
  const first = target.points[0]?.at ?? 0;
  const last = target.points[target.points.length - 1]?.at ?? 0;
  const span = last - first;
  const count = target.points.length;

  const xOf = (at: number, index: number) =>
    // All points at the same instant have no time axis to spread along; fall
    // back to even spacing rather than stacking them all on one pixel.
    span > 0
      ? PAD.left + ((at - first) / span) * PLOT_W
      : PAD.left + (count > 1 ? (index / (count - 1)) * PLOT_W : PLOT_W / 2);
  const yOf = (value: number) => PAD.top + PLOT_H - (value / top) * PLOT_H;

  const plots = target.points.map((point, index) => ({
    point,
    value: valueOf(point, basis),
    cx: xOf(point.at, index),
    cy: yOf(valueOf(point, basis)),
  }));

  const path = plots
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.cx.toFixed(1)},${p.cy.toFixed(1)}`)
    .join(" ");

  // Three gridlines, not a dense grid: the readings that matter are zero, the
  // top of the axis, and the halfway mark that makes a doubling obvious.
  const lines = [0, 0.5, 1];

  return (
    <svg
      className="timeline"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={fill(d.history.chartLabel, { root: target.root, count })}
    >
      {lines.map((f) => (
        <g key={f}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={yOf(top * f)}
            y2={yOf(top * f)}
            className="grid"
          />
          <text x={PAD.left - 8} y={yOf(top * f) + 3.5} className="axis" textAnchor="end">
            {fmt.bytes(top * f)}
          </text>
        </g>
      ))}

      {count > 1 && <path d={path} className="line" />}

      {plots.map((p) => (
        <circle
          key={p.point.scanId}
          cx={p.cx}
          cy={p.cy}
          r={picked.includes(p.point.scanId) ? 6 : 4}
          className={picked.includes(p.point.scanId) ? "point picked" : "point"}
          onClick={() => onToggle(p.point.scanId)}
          // Reachable from the keyboard, unlike the clickable rows elsewhere
          // in this app: there a checkbox offers the same choice, while here
          // picking a point is the *only* way to reach "Open snapshot", so
          // a pointer-only control would close the feature off entirely.
          role="button"
          tabIndex={0}
          aria-pressed={picked.includes(p.point.scanId)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            // Space scrolls the dialog otherwise, moving the chart out from
            // under the point that was just selected.
            event.preventDefault();
            onToggle(p.point.scanId);
          }}
        >
          {/* A native tooltip rather than a floating panel: it costs no state,
              and it is the one piece of this chart a screen reader can read. */}
          <title>
            {`#${p.point.scanId} \u00b7 ${fmt.timestamp(p.point.at)} \u00b7 ${fmt.bytes(p.value)}`}
          </title>
        </circle>
      ))}

      <text x={PAD.left} y={H - 8} className="axis">
        {fmt.timestamp(first)}
      </text>
      {count > 1 && (
        <text x={W - PAD.right} y={H - 8} className="axis" textAnchor="end">
          {fmt.timestamp(last)}
        </text>
      )}
    </svg>
  );
}

/**
 * The account of what happened, one row per gap between two snapshots.
 *
 * Newest first: the question is almost always "what happened lately", and the
 * answer to it should not sit at the bottom of a long list.
 */
function Steps({
  target,
  basis,
  onCompare,
}: {
  target: HistoryTarget;
  basis: SizeBasis;
  onCompare(from: number, to: number): void;
}) {
  const d = useDict();
  if (target.points.length < 2) {
    return (
      <p className="hint" style={{ marginBottom: 0 }}>
        {d.history.needTwo}
      </p>
    );
  }

  // `flatMap` rather than `slice(1)` with an index lookup: the first point has
  // no predecessor, and saying so by returning nothing is what keeps `from`
  // from being an optional the rest of this has to re-check.
  const steps = target.points.flatMap((to, i) => {
    const from = target.points[i - 1];
    if (!from) return [];
    return [{ from, to, delta: valueOf(to, basis) - valueOf(from, basis) }];
  });

  return (
    <table>
      <thead>
        <tr>
          <th>{d.history.columnPeriod}</th>
          <th className="right">{d.history.columnElapsed}</th>
          <th className="right">{fill(d.history.columnChange, { measure: basisLabel(basis) })}</th>
          <th className="right">{d.history.columnAfter}</th>
        </tr>
      </thead>
      <tbody>
        {[...steps].reverse().map((step) => (
          <tr
            key={step.to.scanId}
            className="clickable"
            title={d.history.stepTitle}
            onClick={() => onCompare(step.from.scanId, step.to.scanId)}
          >
            <td>{`#${step.from.scanId} → #${step.to.scanId}`}</td>
            <td className="right">
              {fill(d.history.days, {
                days: ((step.to.at - step.from.at) / DAY).toFixed(1),
              })}
            </td>
            <td
              className="right"
              style={{
                color:
                  step.delta === 0
                    ? "var(--text-faint)"
                    : step.delta > 0
                      ? "var(--grow)"
                      : "var(--shrink)",
              }}
            >
              {step.delta === 0 ? d.history.unchanged : fmt.delta(step.delta)}
            </td>
            <td className="right">{fmt.bytes(valueOf(step.to, basis))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * `focus` preselects a target — the toolbar opens this for the folder already
 * on screen. Matching is by root, and by host as well when the source names
 * one; a live scan has no stored host to match against, so root alone decides.
 */
function pick(targets: HistoryTarget[], focus?: Focus): number {
  if (!focus) return 0;
  const root = focus.root.replace(/[/\\]+$/, "") || focus.root;
  const byBoth = targets.findIndex((t) => t.root === root && t.host === focus.host);
  if (byBoth >= 0) return byBoth;
  const byRoot = targets.findIndex((t) => t.root === root);
  // Falling back to the first target rather than to nothing: an empty panel
  // would read as "no history", when what happened is "none for this folder".
  return byRoot >= 0 ? byRoot : 0;
}

export function HistoryDialog({
  basis,
  focus,
  onClose,
  onOpened,
  onDiff,
}: {
  /** The measure the window is reading by, so the line agrees with the toolbar. */
  basis: SizeBasis;
  focus?: Focus | undefined;
  onClose(): void;
  onOpened(result: Opened): void;
  onDiff(view: DiffView): void;
}) {
  const d = useDict();
  const [db, setDb] = useState("");
  const [targets, setTargets] = useState<HistoryTarget[]>([]);
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [chosen, setChosen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * `keepFocus` is false for a reload the user asked for: they have typed a
   * different database, so landing on the folder that happens to be on screen
   * behind the dialog would be the wrong answer to a question they just asked.
   */
  const load = (path: string, keepFocus: boolean) => {
    setBusy(true);
    setError(null);
    api
      .snapshotHistory(path)
      .then((found) => {
        setTargets(found);
        setAt(keepFocus ? pick(found, focus) : 0);
        setChosen(!keepFocus);
        setPicked([]);
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    api
      .defaultDatabase()
      .then((path) => {
        setDb(path);
        load(path, true);
      })
      .catch((err) => {
        setError(errorMessage(err));
        setBusy(false);
      });
    // Deliberately once: `focus` is what the window showed when this opened,
    // and reloading under the user because the tree changed behind a dialog
    // would move the selection out from under their pointer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const target = targets[at];
  // Only meaningful until the user picks a target themselves: after that,
  // "nothing stored for the folder on screen" would be telling them off for
  // doing what the control is for.
  const missingForFocus =
    !chosen &&
    !!focus &&
    !!target &&
    target.root !== (focus.root.replace(/[/\\]+$/, "") || focus.root);

  const compare = (from: number, to: number) => {
    setBusy(true);
    setError(null);
    api
      .diffSnapshots(db, from, to)
      .then(onDiff)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  const toggle = (scanId: number) => {
    setPicked((prev) => {
      if (prev.includes(scanId)) return prev.filter((x) => x !== scanId);
      // At most two: a comparison is made from exactly two snapshots.
      return [...prev, scanId].slice(-2);
    });
  };

  const openPicked = () => {
    const only = picked[0];
    if (only === undefined) return;
    setBusy(true);
    api
      .openSnapshot(db, only, basis)
      .then(onOpened)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  return (
    <Scrim onClose={onClose}>
      <div className="dialog">
        <header>
          <h2>{d.history.title}</h2>
          {busy && <span className="spinner" />}
        </header>
        <div className="body">
          {error && <div className="error">{error}</div>}

          {/* The same field the snapshot list has. Without it this view could
              only ever read the default database, while the CLI's `--db` puts
              snapshots wherever the user says. */}
          <div className="field">
            <label htmlFor="history-db">{d.snapshots.databaseLabel}</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                id="history-db"
                value={db}
                onChange={(e) => setDb(e.target.value)}
                style={{ flex: 1 }}
              />
              <button onClick={() => load(db, false)}>{d.common.reload}</button>
            </div>
          </div>

          {!busy && targets.length === 0 && (
            <div className="empty">
              <p style={{ margin: 0 }}>{d.snapshots.emptyTitle}</p>
              <p className="hint" style={{ marginBottom: 0 }}>
                {fill(d.snapshots.emptyHint, { action: d.toolbar.saveSnapshot })}
              </p>
            </div>
          )}

          {target && (
            <>
              <div className="field">
                <label htmlFor="history-target">{d.history.targetLabel}</label>
                <select
                  id="history-target"
                  value={at}
                  onChange={(e) => {
                    setAt(Number(e.target.value));
                    setChosen(true);
                    setPicked([]);
                  }}
                >
                  {targets.map((t, i) => (
                    <option key={`${t.host} ${t.root}`} value={i}>
                      {fill(d.history.targetOption, {
                        host: t.host,
                        root: t.root,
                        count: t.points.length,
                      })}
                    </option>
                  ))}
                </select>
              </div>

              {missingForFocus && <p className="hint">{d.history.noHistoryHere}</p>}

              <Chart target={target} basis={basis} picked={picked} onToggle={toggle} />
              <p className="hint">{d.history.chartHint}</p>
              <Steps target={target} basis={basis} onCompare={compare} />
            </>
          )}
        </div>
        <footer>
          <span className="hint" style={{ flex: 1 }}>
            {picked.length === 2
              ? fill(d.snapshots.comparing, {
                  from: Math.min(...picked),
                  to: Math.max(...picked),
                })
              : fill(d.snapshots.selectedForComparison, { count: picked.length })}
          </span>
          <button onClick={onClose}>{d.common.close}</button>
          <button onClick={openPicked} disabled={picked.length !== 1 || busy}>
            {d.history.openPoint}
          </button>
          <button
            className="primary"
            onClick={() => {
              const [a, b] = [...picked].sort((x, y) => x - y);
              if (a !== undefined && b !== undefined) compare(a, b);
            }}
            disabled={picked.length !== 2 || busy}
          >
            {d.snapshots.compare}
          </button>
        </footer>
      </div>
    </Scrim>
  );
}
