// The same tree drawn as rings.
//
// A treemap spends its area on the biggest entries, which is what makes it
// good at "what is taking up the space" and poor at the other question: how
// deep this goes, and what is nested inside what. Each ring here is a level
// and each arc an entry, so the shape of the tree is the picture rather than
// something to be inferred from nesting.
//
// **The angles are the sizes; the areas are not.** An arc's area grows with
// its radius, so a small folder far out covers more ink than a big one near
// the middle. That is a limitation of the view itself, not of this drawing of
// it, and it is why the treemap stays the default and this is the second
// opinion. Nothing here tries to compensate — a picture that quietly adjusted
// its angles to even out the ink would be lying about the one thing it claims
// to show.
//
// **No geometry is decided here.** Arcs arrive already placed, and hit-testing
// is the layout's own — one routine with tests behind it rather than a second
// implementation in a file no test runner reaches. What this file does is
// paint, label, and route clicks.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { api, errorMessage, isStale, type ArcArrays } from "./api";
import { bandColor } from "./age";
import type { SizeBasis } from "./basis";
import { colorByIndex } from "./categories";
import * as fmt from "./format";
import { fill, useDict } from "./i18n";

/** An arc narrower than this cannot hold readable text along it. */
const LABEL_MIN_SWEEP = 0.22;
const LABEL_MIN_RING = 15;

/** How long the drawing area has to hold still before it is laid out again. */
const RESIZE_SETTLE = 110;

export interface SunburstProps {
  generation: number;
  root: number;
  selection: number[];
  revision: unknown;
  basis: SizeBasis;
  colorBy: "category" | "age";
  onSelect(node: number): void;
  onZoom(node: number): void;
}

interface Loaded {
  generation: number;
  root: number;
  radius: number;
  arcs: ArcArrays;
  labels: Map<number, string>;
}

export function Sunburst({
  generation,
  root,
  selection,
  revision,
  basis,
  colorBy,
  onSelect,
  onZoom,
}: SunburstProps) {
  const d = useDict();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only a layout matching the current props may be used for anything. A node
  // id is an index, so arcs from a replaced tree would address entirely
  // different entries — checking at read time rather than clearing on change
  // means there is no window in which stale arcs can be clicked.
  const arcs = useMemo(
    () =>
      loaded && loaded.generation === generation && loaded.root === root
        ? loaded.arcs
        : null,
    [loaded, generation, root],
  );
  const labels = useMemo(() => loaded?.labels ?? new Map<number, string>(), [loaded]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let timer = 0;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => setSize({ width: Math.floor(box.width), height: Math.floor(box.height) }),
        RESIZE_SETTLE,
      );
    });
    observer.observe(wrap);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  // Half the smaller side, less a margin so the outermost ring is not flush
  // against the panel edge.
  const radius = Math.max(0, Math.min(size.width, size.height) / 2 - 10);

  useEffect(() => {
    if (radius <= 0) return;
    let cancelled = false;
    setError(null);

    api
      .rings({ generation, node: root, radius, basis })
      .then(async (result) => {
        if (cancelled) return;
        const wide: number[] = [];
        for (let i = 0; i < result.count; i += 1) {
          if (
            result.sweep[i]! >= LABEL_MIN_SWEEP &&
            result.outer[i]! - result.inner[i]! >= LABEL_MIN_RING
          ) {
            wide.push(result.node[i]!);
          }
        }
        const names = await api.labels(generation, wide);
        if (cancelled) return;
        setLoaded({
          generation,
          root,
          radius,
          arcs: result,
          labels: new Map(wide.map((node, i) => [node, names[i] ?? ""])),
        });
      })
      .catch((err) => {
        if (cancelled || isStale(err)) return;
        setError(errorMessage(err));
      });

    return () => {
      cancelled = true;
    };
  }, [generation, root, radius, basis, revision]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !arcs) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(size.width * dpr));
    canvas.height = Math.max(1, Math.floor(size.height * dpr));
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    const cx = size.width / 2;
    const cy = size.height / 2;
    const chosen = new Set(selection);

    // Canvas measures angles anticlockwise from three o'clock; the layout
    // measures them clockwise from twelve. One subtraction of a quarter turn
    // converts, and doing it here rather than in the layout keeps the layout's
    // convention the one its tests describe.
    const toCanvas = (angle: number) => angle - Math.PI / 2;

    for (let i = 0; i < arcs.count; i += 1) {
      const sweep = arcs.sweep[i]!;
      const inner = arcs.inner[i]!;
      const outer = arcs.outer[i]!;
      if (sweep <= 0 || outer <= inner) continue;

      const from = toCanvas(arcs.start[i]!);
      const to = from + sweep;

      ctx.beginPath();
      ctx.arc(cx, cy, outer, from, to);
      ctx.arc(cx, cy, inner, to, from, true);
      ctx.closePath();

      if (arcs.depth[i] === 0) {
        // The middle disc is the folder being looked at, not an entry beside
        // the others: a surface, not a hue.
        ctx.fillStyle = "rgba(70, 82, 125, 0.35)";
      } else {
        const heat = colorBy === "age" ? bandColor(arcs.ageBand[i]!) : null;
        ctx.fillStyle = heat ?? colorByIndex(arcs.category[i]!);
      }
      // Held back a little with depth, so the rings read as layers rather than
      // as one flat wheel of colour.
      ctx.globalAlpha = Math.max(0.45, 0.92 - arcs.depth[i]! * 0.06);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (sweep > 0.01 && outer - inner > 3) {
        ctx.strokeStyle = "rgba(8, 11, 20, 0.55)";
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // A ring that was cut short has more inside it. Marked on the outer edge
      // with a heavier stroke, which is the only place there is room.
      if (arcs.truncated[i] && sweep > 0.05) {
        ctx.beginPath();
        ctx.arc(cx, cy, outer - 1, from, to);
        ctx.strokeStyle = "rgba(234, 238, 251, 0.5)";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Selection and hover over everything, achromatic for the same reason the
    // treemap's are: every hue in this picture already means something.
    for (let i = 0; i < arcs.count; i += 1) {
      const node = arcs.node[i]!;
      if (!chosen.has(node) && hover !== i) continue;
      const from = toCanvas(arcs.start[i]!);
      ctx.beginPath();
      ctx.arc(cx, cy, arcs.outer[i]!, from, from + arcs.sweep[i]!);
      ctx.arc(cx, cy, arcs.inner[i]!, from + arcs.sweep[i]!, from, true);
      ctx.closePath();
      ctx.strokeStyle = chosen.has(node) ? "#ffffff" : "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = chosen.has(node) ? 2 : 1.5;
      ctx.stroke();
    }

    // Labels last, laid along the middle of each arc it fits in.
    ctx.font = `11px ${getComputedStyle(document.body).getPropertyValue("--mono") || "monospace"}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < arcs.count; i += 1) {
      const name = labels.get(arcs.node[i]!);
      if (!name) continue;
      const mid = toCanvas(arcs.start[i]! + arcs.sweep[i]! / 2);
      const r = (arcs.inner[i]! + arcs.outer[i]!) / 2;
      const x = cx + r * Math.cos(mid);
      const y = cy + r * Math.sin(mid);

      const text = name.length > 18 ? `${name.slice(0, 17)}…` : name;
      const width = ctx.measureText(text).width;
      ctx.fillStyle = "rgba(8, 11, 20, 0.62)";
      ctx.fillRect(x - width / 2 - 3, y - 7, width + 6, 14);
      ctx.fillStyle = "#f4f6ff";
      ctx.fillText(text, x, y);
    }
  }, [arcs, labels, size, selection, hover, colorBy]);

  useEffect(() => {
    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  /** Which arc a pointer event is over, using the layout's own convention. */
  const arcAt = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>): number | null => {
      if (!arcs) return null;
      const box = event.currentTarget.getBoundingClientRect();
      const dx = event.clientX - box.left - size.width / 2;
      const dy = event.clientY - box.top - size.height / 2;
      const r = Math.hypot(dx, dy);
      // Clockwise from twelve o'clock, matching the layout and its tests.
      const angle = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);

      let found: number | null = null;
      for (let i = 0; i < arcs.count; i += 1) {
        if (r < arcs.inner[i]! || r >= arcs.outer[i]!) continue;
        const start = arcs.start[i]!;
        if (angle < start || angle >= start + arcs.sweep[i]!) continue;
        // The outermost match is the most specific: rings do not overlap, so
        // at most one arc per ring can contain a point.
        if (found === null || arcs.depth[i]! > arcs.depth[found]!) found = i;
      }
      return found;
    },
    [arcs, size],
  );

  const tooltip = useMemo(() => {
    if (!arcs || hover === null || hover >= arcs.count) return null;
    const name = labels.get(arcs.node[hover]!);
    // Share of the view, not of the disk: the middle disc is whatever folder
    // is being looked at, so a full turn is that folder and not the root.
    return {
      name,
      share: fmt.percent(arcs.sweep[hover]!, Math.PI * 2),
      depth: arcs.depth[hover]!,
    };
  }, [arcs, hover, labels]);

  return (
    <div className="canvas-wrap sunburst" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={arcs ? undefined : { pointerEvents: "none" }}
        onMouseMove={(event) => setHover(arcAt(event))}
        onMouseLeave={() => setHover(null)}
        onClick={(event) => {
          const index = arcAt(event);
          if (index !== null && arcs) onSelect(arcs.node[index]!);
        }}
        onDoubleClick={(event) => {
          const index = arcAt(event);
          if (index !== null && arcs && arcs.isDir[index]) onZoom(arcs.node[index]!);
        }}
      />
      {error && <div className="error sunburst-error">{error}</div>}
      {tooltip && (
        <div className="sunburst-caption">
          {tooltip.name ?? d.rings.unnamed} ·{" "}
          {fill(d.rings.shareOfView, { percent: tooltip.share })}
        </div>
      )}
    </div>
  );
}
