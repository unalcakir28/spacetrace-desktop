// Canvas renderer for the treemap.
//
// Layout comes from Rust as flat arrays in draw order, so drawing is one pass
// over them with no tree walking here. Three things are deliberate:
//
// * Hit-testing runs in JavaScript rather than over the IPC bridge. The arrays
//   are already local and a pointer move only has to scan the visible tiles, so
//   a round trip per mousemove would buy nothing and cost latency.
//
// * Labels are fetched for the handful of tiles large enough to carry one.
//   Sending every name with the layout would multiply the payload for text
//   nobody can read.
//
// * Loaded tiles are stored together with the (root, generation) they were laid
//   out for, and are only used when that still matches the current props. A node
//   id is only an index, so tiles from a replaced tree would address entirely
//   different entries — checking at read time rather than clearing on change
//   means there is no window in which stale tiles can be clicked.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage, isStale, type TileArrays } from "./api";
import type { SizeBasis } from "./basis";
import { colorByIndex } from "./categories";
import * as fmt from "./format";
import { fill, useDict } from "./i18n";

/** A tile narrower or shorter than this cannot hold readable text. */
const LABEL_MIN_WIDTH = 56;
const LABEL_MIN_HEIGHT = 15;

/** How long the drawing area has to hold still before it is laid out again. */
const RESIZE_SETTLE = 110;

export interface TreemapProps {
  /** Which tree `root` belongs to. Changing it invalidates every node id. */
  generation: number;
  /** Node the map is rooted at. */
  root: number;
  /** Every selected node; all of them are outlined. */
  selection: number[];
  /**
   * Changes when the open tree was edited in place. The generation stays the
   * same — that is the point of editing in place — so this is what tells the
   * map that the sizes behind it moved and it needs laying out again.
   */
  revision: unknown;
  /** Which measure the rectangles are proportional to. */
  basis: SizeBasis;
  onSelect(node: number): void;
  /** Called when a directory tile is activated, to zoom into it. */
  onZoom(node: number): void;
}

/** A layout, tagged with what it was laid out for. */
interface Loaded {
  generation: number;
  root: number;
  width: number;
  height: number;
  tiles: TileArrays;
  labels: Map<number, string>;
}

interface Hover {
  node: number;
  index: number;
  clientX: number;
  clientY: number;
}

interface HoverDetail {
  name: string;
  relPath: string;
  size: number;
  files: number;
  isDir: boolean;
}

export function Treemap({
  generation,
  root,
  selection,
  revision,
  basis,
  onSelect,
  onZoom,
}: TreemapProps) {
  const d = useDict();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [detail, setDetail] = useState<HoverDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only a layout matching the current props may be used for anything: drawing,
  // hit-testing, labels. Anything else is from a tree that is no longer open.
  const current =
    loaded && loaded.generation === generation && loaded.root === root ? loaded : null;
  const tiles = current?.tiles ?? null;
  const labels = current?.labels ?? EMPTY_LABELS;

  // Track the drawing area. ResizeObserver rather than window resize: the
  // panels around the map can change width without the window moving.
  //
  // Settled rather than live, because a layout is not free: dragging the folder
  // panel wider fires this on every pointer move, and each one would order a
  // fresh squarified layout of the whole subtree — millions of nodes, over the
  // IPC bridge, for a width that is about to change again. The map redraws when
  // the drag stops.
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    let timer = 0;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      const next = { width: Math.floor(box.width), height: Math.floor(box.height) };
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () =>
          setSize((prev) =>
            prev.width === next.width && prev.height === next.height ? prev : next,
          ),
        RESIZE_SETTLE,
      );
    });
    observer.observe(element);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  // Re-layout whenever the tree, the root or the available space changes.
  useEffect(() => {
    if (size.width < 40 || size.height < 40) return;
    let cancelled = false;
    setBusy(true);
    setError(null);
    setHover(null);

    const { width, height } = size;
    api
      .treemap({ generation, node: root, width, height, basis })
      .then(async (result) => {
        if (cancelled) return;
        const names = await fetchLabels(generation, result);
        // Checked again: fetchLabels awaits, and a newer layout may have
        // finished in the meantime. Without this the older response would
        // overwrite the newer one's labels.
        if (cancelled) return;
        setLoaded({ generation, root, width, height, tiles: result, labels: names });
      })
      .catch((err) => {
        if (cancelled || isStale(err)) return;
        setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [generation, root, size.width, size.height, revision]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tiles) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = size;
    // Only touch the backing store when it actually changed; assigning width
    // clears the canvas and is not free.
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, width, height);

    const labelled: number[] = [];

    for (let i = 0; i < tiles.count; i += 1) {
      const x = tiles.x[i]!;
      const y = tiles.y[i]!;
      const w = tiles.w[i]!;
      const h = tiles.h[i]!;
      if (w <= 0 || h <= 0) continue;

      const isDir = tiles.isDir[i]!;
      const depth = tiles.depth[i]!;

      if (isDir) {
        // Directories are containers, not a category: they get a surface that
        // lifts slightly with depth, so nesting is visible, while the colour in
        // the map stays reserved for what the files actually are.
        ctx.fillStyle =
          depth === 0 ? VOID : `rgba(70, 82, 125, ${Math.min(0.14 + depth * 0.05, 0.4)})`;
        ctx.fillRect(x, y, w, h);
        if (w > 3 && h > 3) {
          ctx.strokeStyle =
            depth === 0 ? "rgba(58, 68, 104, 0.9)" : "rgba(139, 155, 255, 0.22)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        }
      } else {
        ctx.fillStyle = colorByIndex(tiles.category[i]!);
        ctx.globalAlpha = 0.88;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
        if (w > 4 && h > 4) {
          ctx.strokeStyle = "rgba(8, 11, 20, 0.6)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        }
      }

      // A directory that was not subdivided has more inside it than is shown.
      if (tiles.truncated[i] && w > 14 && h > 14) {
        ctx.fillStyle = "rgba(234, 238, 251, 0.45)";
        for (let d = 0; d < 3; d += 1) {
          ctx.fillRect(x + w - 6 - d * 4, y + h - 6, 2, 2);
        }
      }

      if (w >= LABEL_MIN_WIDTH && h >= LABEL_MIN_HEIGHT) labelled.push(i);
    }

    // Labels last so nothing paints over them.
    ctx.font = `11px ${getComputedStyle(document.body).getPropertyValue("--mono") || "monospace"}`;
    ctx.textBaseline = "top";
    for (const i of labelled) {
      const name = labels.get(tiles.node[i]!);
      if (!name) continue;
      const x = tiles.x[i]!;
      const y = tiles.y[i]!;
      const w = tiles.w[i]!;
      const isDir = tiles.isDir[i]!;

      const text = clip(ctx, isDir ? `${name}/` : name, w - 8);
      if (!text) continue;
      // A dark plate keeps text legible on top of any category colour.
      const metrics = ctx.measureText(text);
      ctx.fillStyle = "rgba(8, 11, 20, 0.66)";
      ctx.fillRect(x + 2, y + 2, Math.min(metrics.width + 6, w - 4), 14);
      ctx.fillStyle = isDir ? "#c4cdf5" : "#f4f6ff";
      ctx.fillText(text, x + 5, y + 4);
    }

    // Selection and hover, drawn over everything.
    //
    // Achromatic on purpose. Every hue in this map is a file category, so an
    // indicator with a hue of its own would be indistinguishable from a tile
    // wherever the two met. White works over all nine, and the dark inner line
    // keeps it visible over the pale ones too.
    const chosen = new Set(selection);
    for (let i = 0; i < tiles.count; i += 1) {
      if (!chosen.has(tiles.node[i]!)) continue;
      outline(ctx, tiles, i, "rgba(8, 11, 20, 0.85)", 4);
      outline(ctx, tiles, i, "#ffffff", 2);
    }
    if (hover && hover.index < tiles.count && !chosen.has(tiles.node[hover.index]!)) {
      outline(ctx, tiles, hover.index, "rgba(255, 255, 255, 0.8)", 1.5);
    }
  }, [tiles, labels, size, selection, hover]);

  useEffect(() => {
    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  // Fetch detail for whatever is under the pointer, without a request per pixel.
  useEffect(() => {
    if (!hover) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    const node = hover.node;
    const timer = window.setTimeout(() => {
      api
        .entry(generation, node, basis)
        .then((view) => {
          if (cancelled) return;
          setDetail({
            name: view.name,
            relPath: view.relPath,
            size: view.size,
            files: view.files,
            isDir: view.isDir,
          });
        })
        .catch(() => {
          /* the tooltip is optional; a failure here is not worth reporting */
        });
    }, 30);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [generation, hover]);

  const locate = useCallback(
    (event: React.MouseEvent<HTMLCanvasElement>) => {
      if (!tiles) return null;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const index = hitTest(tiles, x, y);
      return index === null ? null : { index, node: tiles.node[index]! };
    },
    [tiles],
  );

  const handleMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const found = locate(event);
    if (!found) {
      setHover(null);
      return;
    }
    setHover({
      node: found.node,
      index: found.index,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  };

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const found = locate(event);
    if (found) onSelect(found.node);
  };

  const handleDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const found = locate(event);
    if (!found || !tiles) return;
    // Only a directory can be zoomed into; double-clicking a file selects it.
    if (tiles.isDir[found.index]) onZoom(found.node);
    else onSelect(found.node);
  };

  const tooltip = useMemo(() => {
    if (!hover || !detail || !tiles) return null;
    const wrap = wrapRef.current?.getBoundingClientRect();
    if (!wrap) return null;
    // Flip the tooltip near the edges so it never leaves the map.
    const offset = 13;
    const estimatedWidth = 300;
    const estimatedHeight = 62;
    let left = hover.clientX - wrap.left + offset;
    let top = hover.clientY - wrap.top + offset;
    if (left + estimatedWidth > wrap.width) left = Math.max(4, left - estimatedWidth - offset * 2);
    if (top + estimatedHeight > wrap.height) top = Math.max(4, top - estimatedHeight - offset * 2);
    // Read from the layout rather than the fetched detail: it is already here,
    // and it cannot disagree with the tile being pointed at.
    const category = hover.index < tiles.count ? tiles.category[hover.index]! : 0;
    return { left, top, detail, category };
  }, [hover, detail, tiles]);

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        // While no matching layout is available there is nothing to click, and
        // ignoring pointer events is what stops a stale map being interacted
        // with during a transition.
        style={tiles ? undefined : { pointerEvents: "none" }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      />
      {tooltip && (
        <div className="tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
          <div className="name">
            {tooltip.detail.relPath || tooltip.detail.name}
            {tooltip.detail.isDir ? "/" : ""}
          </div>
          <div className="meta">
            {/* The category, in its own colour, so the tooltip and the tile
                under the pointer plainly refer to the same thing. */}
            {!tooltip.detail.isDir && (
              <span
                className="swatch"
                style={{
                  background: colorByIndex(tooltip.category),
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  flex: "none",
                }}
              />
            )}
            <span className="num">
              {fmt.bytes(tooltip.detail.size)}
              {tooltip.detail.isDir &&
                ` · ${fill(d.map.tooltipFiles, { count: fmt.count(tooltip.detail.files) })}`}
            </span>
          </div>
        </div>
      )}
      {error && <div className="map-overlay">{error}</div>}
      {!error && busy && !tiles && (
        <div className="map-overlay">
          <span className="spinner" /> {d.map.layingOut}
        </div>
      )}
      {!error && !busy && tiles?.count === 1 && (
        <div className="map-overlay">
          Nothing to show inside this folder.
          <br />
          It is empty, or everything in it is zero bytes.
        </div>
      )}
    </div>
  );
}

/** Shared so an empty render does not allocate a Map every time. */
const EMPTY_LABELS: Map<number, string> = new Map();

/** The ground the map is painted on; matches `--void` in theme.css. */
const VOID = "#080b14";

/**
 * The deepest tile containing the point.
 *
 * Tiles arrive parents-first, so scanning backwards and taking the first hit
 * gives the deepest one without any tree walking.
 */
function hitTest(tiles: TileArrays, x: number, y: number): number | null {
  for (let i = tiles.count - 1; i >= 0; i -= 1) {
    const tx = tiles.x[i]!;
    const ty = tiles.y[i]!;
    if (x >= tx && x < tx + tiles.w[i]! && y >= ty && y < ty + tiles.h[i]!) {
      return i;
    }
  }
  return null;
}

function outline(
  ctx: CanvasRenderingContext2D,
  tiles: TileArrays,
  index: number,
  color: string,
  lineWidth: number,
) {
  const inset = lineWidth / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(
    tiles.x[index]! + inset,
    tiles.y[index]! + inset,
    Math.max(0, tiles.w[index]! - lineWidth),
    Math.max(0, tiles.h[index]! - lineWidth),
  );
}

/** Trim text to fit, from the left so the distinctive tail survives. */
function clip(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 8) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (ctx.measureText(`…${text.slice(text.length - mid)}`).width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low > 1 ? `…${text.slice(text.length - low)}` : "";
}

/** Names for the tiles big enough to be labelled, and only those. */
async function fetchLabels(
  generation: number,
  tiles: TileArrays,
): Promise<Map<number, string>> {
  const wanted: number[] = [];
  for (let i = 0; i < tiles.count; i += 1) {
    if (tiles.w[i]! >= LABEL_MIN_WIDTH && tiles.h[i]! >= LABEL_MIN_HEIGHT) {
      wanted.push(tiles.node[i]!);
    }
  }
  if (wanted.length === 0) return new Map();
  try {
    const names = await api.labels(generation, wanted);
    const map = new Map<number, string>();
    wanted.forEach((node, index) => map.set(node, names[index] ?? ""));
    return map;
  } catch (err) {
    // Labels are decoration; a map without them is still usable, and a stale
    // generation here just means a newer layout is already on its way.
    if (!isStale(err)) console.warn("could not fetch tile labels", err);
    return new Map();
  }
}
