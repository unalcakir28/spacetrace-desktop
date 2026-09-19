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
//
// * **The tiles are painted once, into a bitmap of their own.** A real scan
//   puts about 112,000 rectangles on a map this size at the shipped detail
//   level (measured on a 912,546-entry tree). That pass used to run again on
//   every pointer move, because the hover outline was drawn in the same loop:
//   a move cost 39.4 ms, so twenty of them across the map cost 789 ms to shift
//   a 1.5px rectangle. Now the picture is a cached bitmap, repainted only when
//   the layout, the colouring or the size changes, and a move costs 0.13 ms —
//   one `drawImage` and two strokes.
//
// * **The picture is drawn as a few dozen paths, not a call per tile.** Tiles
//   are bucketed by depth and then by colour, and each bucket goes down as one
//   path: sixty-odd `fill`/`stroke` calls in place of 112,000 `fillRect`s.
//   A full repaint went from 40.6 ms to 21.4 ms on that same tree.
//
//   Reordering is safe because a treemap partitions space: two tiles at the
//   same depth never overlap, and a tile is only ever covered by something
//   deeper, which is drawn in a later bucket. What does change is sub-pixel —
//   where two tiles share an edge, the seam is now rasterised once instead of
//   twice, so 28% of pixels differ by an average of 10/255 and the picture is
//   indistinguishable at 6x magnification. That was checked against a real
//   layout, not a synthetic one: with random overlapping rectangles the
//   reordering *does* change the picture, and a harness built on those would
//   have reported a bug that cannot happen.
//
// * **Drawing fewer tiles was the obvious fix and it is the wrong one.** The
//   detail level is a minimum *area*, and area does not constrain thinness:
//   on that same tree, raising it from the shipped 6 to 192 — thirty-two times
//   coarser — still leaves 33,808 tiles of which 26,769 are thinner than 3px,
//   against 112,375 and 101,918. It buys a third of the count for a third of
//   the map's detail. Folding the small ones into a single "other" rectangle
//   has the same problem from the other side: they are 91% of the tiles but
//   22% of the area, and that speckle is the only thing that says "this folder
//   is thousands of small files" rather than "this folder is empty". The count
//   was never the cost; painting it sixty times a second was.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage, isStale, type TileArrays } from "./api";
import { bandColor, bandColors } from "./age";
import type { SizeBasis } from "./basis";
import { CATEGORIES, colorByIndex } from "./categories";
import * as fmt from "./format";
import { fill, useDict } from "./i18n";

/** A tile narrower or shorter than this cannot hold readable text. */
const LABEL_MIN_WIDTH = 56;
const LABEL_MIN_HEIGHT = 15;

/** How long the drawing area has to hold still before it is laid out again. */
const RESIZE_SETTLE = 110;

/**
 * The buckets a tile can land in, so the picture can be drawn as a few dozen
 * paths instead of a hundred thousand calls.
 *
 * A fill slot is a colour: the folder surface, the undated-file surface, or one
 * of the nine category / six age colours in a folder and a file variant. The
 * variant is the low bit, which is what lets the alpha be read straight off the
 * slot number.
 */
const FILL_DIR = 0;
const FILL_UNDATED = 1;
const FILL_COLOURED = 2;
/**
 * Counted from the palette itself, never by hand.
 *
 * It was written as a literal nine first — the number of chips in the legend —
 * and `CATEGORIES` has ten, because `directory` is one of them. The first file
 * that came back as `other`, which is index nine, indexed past the end of the
 * bucket list and the whole map went black: a throw in here leaves the canvas
 * cleared, so a single bad index costs the entire picture rather than one tile.
 * The age ramp is shorter than the category list and shares these slots.
 */
const FILL_SLOTS = FILL_COLOURED + CATEGORIES.length * 2;

const STROKE_DIR_ROOT = 0;
const STROKE_DIR = 1;
const STROKE_EDGE = 2;
const STROKE_SLOTS = 3;

const STROKE_STYLES = [
  "rgba(58, 68, 104, 0.9)",
  "rgba(139, 155, 255, 0.22)",
  "rgba(8, 11, 20, 0.6)",
];

interface Layers {
  fills: number[][];
  strokes: number[][];
}

function newLayers(): Layers {
  return {
    fills: Array.from({ length: FILL_SLOTS }, () => []),
    strokes: Array.from({ length: STROKE_SLOTS }, () => []),
  };
}

/**
 * Add a tile to a bucket, making the bucket if it is not there.
 *
 * `FILL_SLOTS` is derived and correct, so this should never have to grow the
 * list — it is here because of what happens when it is wrong. Indexing past the
 * end threw, the throw left the canvas cleared, and the map went black with no
 * error anywhere: one bad index cost the whole picture. A colour nobody
 * predicted should cost that tile's colour, nothing more.
 */
function bucket(lists: number[][], slot: number, index: number): void {
  const list = lists[slot] ?? (lists[slot] = []);
  list.push(index);
}

/** The colour a fill slot paints with, at the depth it was collected at. */
function fillStyle(slot: number, depth: number, bands: string[] | null): string {
  if (slot === FILL_DIR) {
    return depth === 0 ? VOID : `rgba(70, 82, 125, ${Math.min(0.14 + depth * 0.05, 0.4)})`;
  }
  if (slot === FILL_UNDATED) return "rgba(70, 82, 125, 0.22)";
  const hue = (slot - FILL_COLOURED) >> 1;
  return bands ? bands[hue] ?? VOID : colorByIndex(hue);
}

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
  /**
   * What the colours mean. Only the paint changes — the same layout, the same
   * rectangles, the same sizes. Recolouring rather than opening a second view
   * is the point: "the big folder" and "the cold folder" are the same picture
   * asked two questions, and switching between them in place is what lets a
   * reader see that the 400 GB is also the untouched 400 GB.
   */
  colorBy: "category" | "age";
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
  colorBy,
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

  /**
   * The painted tiles, kept between frames.
   *
   * Keyed by everything the picture depends on — and by nothing else, which is
   * the point: the selection and the pointer are deliberately absent, so moving
   * the mouse reuses this instead of rebuilding it.
   */
  const layer = useRef<{
    key: string;
    tiles: TileArrays | undefined;
    canvas: HTMLCanvasElement;
  } | null>(null);

  // The arrays themselves, not a description of them. A running scan hands the
  // window a whole new layout every second, and the count it comes back with is
  // the same number more often than not — a folder that grew, or one file
  // replaced by another. Keyed by count, those repaints were skipped and the
  // map sat on figures minutes old while the bar underneath it kept moving.
  // `tiles` is a fresh object per fetch, so identity is the exact question.
  const layerKey = `${generation}:${root}:${size.width}x${size.height}:${colorBy}:${labels.size}`;

  /** Paint every tile into the cached bitmap. The expensive pass, run rarely. */
  const paintLayer = useCallback(() => {
    if (!tiles) return null;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = size;
    const canvas = layer.current?.canvas ?? document.createElement("canvas");
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = VOID;
    ctx.fillRect(0, 0, width, height);

    const labelled: number[] = [];
    const dotted: number[] = [];
    const bands = colorBy === "age" ? bandColors() : null;

    // One pass to sort every tile into a bucket, then one path per bucket.
    // `byDepth[depth]` is allocated on demand because most maps are shallow.
    const byDepth: Layers[] = [];
    let deepest = 0;

    for (let i = 0; i < tiles.count; i += 1) {
      const w = tiles.w[i]!;
      const h = tiles.h[i]!;
      if (w <= 0 || h <= 0) continue;

      const isDir = tiles.isDir[i]!;
      const depth = tiles.depth[i]!;
      if (depth > deepest) deepest = depth;
      let layers = byDepth[depth];
      if (!layers) {
        layers = newLayers();
        byDepth[depth] = layers;
      }

      // In age mode a directory is coloured too, and that is the whole
      // difference between a heat map and a recoloured category map. At any
      // depth worth looking at, most of the area is folders; leaving them grey
      // would answer "which *file* is cold", which nobody asks — the actionable
      // unit is a folder. The band it gets is its subtree's median byte, worked
      // out in the core, so the colour is a claim about what is inside it and
      // not about when the folder itself was last written.
      const band = tiles.ageBand[i]!;
      const heated = bands !== null && band >= 0 && band < bands.length;

      if (isDir && !heated) {
        // Directories are containers, not a category: they get a surface that
        // lifts slightly with depth, so nesting is visible, while the colour in
        // the map stays reserved for what the files actually are.
        bucket(layers.fills, FILL_DIR, i);
        if (w > 3 && h > 3) {
          bucket(layers.strokes, depth === 0 ? STROKE_DIR_ROOT : STROKE_DIR, i);
        }
      } else if (!heated && colorBy === "age") {
        // A file with no recorded time. Left as bare surface rather than given
        // the newest band: a colour here would be read as a measurement, and
        // there was nothing to measure.
        bucket(layers.fills, FILL_UNDATED, i);
        if (w > 4 && h > 4) bucket(layers.strokes, STROKE_EDGE, i);
      } else {
        const hue = heated ? band : tiles.category[i]!;
        bucket(layers.fills, FILL_COLOURED + hue * 2 + (isDir ? 1 : 0), i);
        if (w > 4 && h > 4) bucket(layers.strokes, STROKE_EDGE, i);
      }

      // A directory that was not subdivided has more inside it than is shown.
      if (tiles.truncated[i] && w > 14 && h > 14) dotted.push(i);

      if (w >= LABEL_MIN_WIDTH && h >= LABEL_MIN_HEIGHT) labelled.push(i);
    }

    for (let depth = 0; depth <= deepest; depth += 1) {
      const layers = byDepth[depth];
      if (!layers) continue;

      for (let slot = 0; slot < layers.fills.length; slot += 1) {
        const list = layers.fills[slot];
        if (!list || list.length === 0) continue;
        ctx.fillStyle = fillStyle(slot, depth, bands);
        // Folders sit under their own children in age mode, so they are held
        // back a little: without it a parent and its contents are one flat
        // slab and the nesting disappears.
        ctx.globalAlpha = slot >= FILL_COLOURED ? (slot % 2 === 1 ? 0.55 : 0.88) : 1;
        ctx.beginPath();
        for (const i of list) ctx.rect(tiles.x[i]!, tiles.y[i]!, tiles.w[i]!, tiles.h[i]!);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.lineWidth = 1;
      for (let slot = 0; slot < layers.strokes.length; slot += 1) {
        const list = layers.strokes[slot];
        if (!list || list.length === 0) continue;
        ctx.strokeStyle = STROKE_STYLES[slot] ?? STROKE_STYLES[STROKE_EDGE]!;
        ctx.beginPath();
        for (const i of list) {
          ctx.rect(tiles.x[i]! + 0.5, tiles.y[i]! + 0.5, tiles.w[i]! - 1, tiles.h[i]! - 1);
        }
        ctx.stroke();
      }
    }

    // Last, and safely so: a tile is only marked truncated when its contents
    // were *not* drawn, so nothing of the map is painted on top of these.
    if (dotted.length > 0) {
      ctx.fillStyle = "rgba(234, 238, 251, 0.45)";
      ctx.beginPath();
      for (const i of dotted) {
        const x = tiles.x[i]!;
        const y = tiles.y[i]!;
        const w = tiles.w[i]!;
        const h = tiles.h[i]!;
        for (let d = 0; d < 3; d += 1) ctx.rect(x + w - 6 - d * 4, y + h - 6, 2, 2);
      }
      ctx.fill();
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

    layer.current = { key: layerKey, tiles, canvas };
    return canvas;
  }, [tiles, labels, size, colorBy, layerKey]);

  /**
   * What reaches the screen: the cached picture, then what is selected and what
   * the pointer is on.
   *
   * Achromatic on purpose. Every hue in this map is a file category, so an
   * indicator with a hue of its own would be indistinguishable from a tile
   * wherever the two met. White works over all nine, and the dark inner line
   * keeps it visible over the pale ones too.
   */
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

    const cached = layer.current;
    const picture =
      cached && cached.key === layerKey && cached.tiles === tiles ? cached.canvas : paintLayer();
    if (picture) ctx.drawImage(picture, 0, 0, width, height);

    // Finding the selected tiles means a pass over all of them, which is the
    // one remaining per-frame cost proportional to the map. Nothing selected is
    // the common case and skips it outright.
    const chosen = new Set(selection);
    if (chosen.size > 0) {
      for (let i = 0; i < tiles.count; i += 1) {
        if (!chosen.has(tiles.node[i]!)) continue;
        outline(ctx, tiles, i, "rgba(8, 11, 20, 0.85)", 4);
        outline(ctx, tiles, i, "#ffffff", 2);
      }
    }
    if (hover && hover.index < tiles.count && !chosen.has(tiles.node[hover.index]!)) {
      outline(ctx, tiles, hover.index, "rgba(255, 255, 255, 0.8)", 1.5);
    }
  }, [tiles, size, selection, hover, layerKey, paintLayer]);

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
    const ageBand = hover.index < tiles.count ? tiles.ageBand[hover.index]! : -1;
    return { left, top, detail, category, ageBand };
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
            {/* The swatch says what the tile's own colour means, so it has to
                follow the mode. In category mode it names the kind; in age
                mode it names the band, and for a folder that band is a real
                claim about its contents rather than a container tone. A
                tooltip showing a colour the tile is not painted in would make
                the reader distrust both. */}
            {colorBy === "age"
              ? tooltip.ageBand >= 0 && (
                  <span
                    className="swatch"
                    style={{
                      background: bandColor(tooltip.ageBand) ?? undefined,
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      flex: "none",
                    }}
                  />
                )
              : !tooltip.detail.isDir && (
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
