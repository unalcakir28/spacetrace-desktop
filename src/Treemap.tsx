// Canvas renderer for the treemap.
//
// Layout comes from Rust as flat arrays in draw order, so drawing is one pass
// over them with no tree walking here. Two things are deliberate:
//
// * Hit-testing runs in JavaScript rather than over the IPC bridge. The arrays
//   are already local and a pointer move only has to scan the visible tiles, so
//   a round trip per mousemove would buy nothing and cost latency.
//
// * Labels are fetched for the handful of tiles large enough to carry one.
//   Sending every name with the layout would multiply the payload for text
//   nobody can read.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, CATEGORIES, errorMessage, type TileArrays } from "./api";
import * as fmt from "./format";

/** Must match the CSS custom properties; index matches `CATEGORIES`. */
const CATEGORY_COLORS: Record<string, string> = {
  directory: "#2b3947",
  image: "#a78bfa",
  video: "#f472b6",
  audio: "#fbbf24",
  document: "#60a5fa",
  archive: "#2dd4bf",
  code: "#a3e635",
  binary: "#94a3b8",
  cache: "#fb923c",
  other: "#64748b",
};

/** A tile narrower or shorter than this cannot hold readable text. */
const LABEL_MIN_WIDTH = 56;
const LABEL_MIN_HEIGHT = 15;

export interface TreemapProps {
  /** Node the map is rooted at. */
  root: number;
  /** Bumped by the caller to force a fresh layout of the same root. */
  reloadKey?: number;
  selected: number | null;
  onSelect(node: number): void;
  /** Called when a directory tile is activated, to zoom into it. */
  onZoom(node: number): void;
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

export function Treemap({ root, reloadKey, selected, onSelect, onZoom }: TreemapProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [tiles, setTiles] = useState<TileArrays | null>(null);
  const [labels, setLabels] = useState<Map<number, string>>(new Map());
  const [hover, setHover] = useState<Hover | null>(null);
  const [detail, setDetail] = useState<HoverDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the drawing area. ResizeObserver rather than window resize: the
  // panels around the map can change width without the window moving.
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      setSize({ width: Math.floor(box.width), height: Math.floor(box.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Re-layout whenever the root or the available space changes.
  useEffect(() => {
    if (size.width < 40 || size.height < 40) return;
    let cancelled = false;
    setBusy(true);
    setError(null);

    api
      .treemap({ node: root, width: size.width, height: size.height })
      .then(async (result) => {
        if (cancelled) return;
        setTiles(result);
        setLabels(await fetchLabels(result));
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });

    return () => {
      cancelled = true;
    };
  }, [root, reloadKey, size.width, size.height]);

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
    ctx.fillStyle = "#070a0e";
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
      const category = CATEGORIES[tiles.category[i]!] ?? "other";

      if (isDir) {
        // Directories are containers: a faint wash plus an outline, so their
        // children stay the thing you actually read.
        ctx.fillStyle = depth === 0 ? "#0a0f14" : `rgba(43, 57, 71, ${0.20 + depth * 0.05})`;
        ctx.fillRect(x, y, w, h);
        if (w > 3 && h > 3) {
          ctx.strokeStyle = depth === 0 ? "#26333f" : "rgba(120, 145, 165, 0.22)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        }
      } else {
        ctx.fillStyle = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.other!;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
        if (w > 4 && h > 4) {
          ctx.strokeStyle = "rgba(7, 10, 14, 0.55)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        }
      }

      // A directory that was not subdivided has more inside it than is shown.
      if (tiles.truncated[i] && w > 14 && h > 14) {
        ctx.fillStyle = "rgba(219, 228, 236, 0.42)";
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
      ctx.fillStyle = "rgba(7, 10, 14, 0.62)";
      ctx.fillRect(x + 2, y + 2, Math.min(metrics.width + 6, w - 4), 14);
      ctx.fillStyle = isDir ? "#cfe0ea" : "#0b0f14";
      if (!isDir) {
        ctx.fillStyle = "#f2f7fa";
      }
      ctx.fillText(text, x + 5, y + 4);
    }

    // Selection and hover, drawn over everything.
    if (selected !== null) {
      const index = tiles.node.indexOf(selected);
      if (index >= 0) {
        outline(ctx, tiles, index, "#38bdaf", 2);
      }
    }
    if (hover && hover.index >= 0 && tiles.node[hover.index] !== selected) {
      outline(ctx, tiles, hover.index, "rgba(219, 228, 236, 0.85)", 1.5);
    }
  }, [tiles, labels, size, selected, hover]);

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
    const timer = window.setTimeout(() => {
      api
        .entry(hover.node)
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
  }, [hover]);

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
    if (!hover || !detail) return null;
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
    return { left, top, detail };
  }, [hover, detail]);

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
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
          <div className="meta num">
            {fmt.bytes(tooltip.detail.size)}
            {tooltip.detail.isDir && ` · ${fmt.count(tooltip.detail.files)} files`}
          </div>
        </div>
      )}
      {error && <div className="map-overlay">{error}</div>}
      {!error && busy && !tiles && (
        <div className="map-overlay">
          <span className="spinner" /> laying out…
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
async function fetchLabels(tiles: TileArrays): Promise<Map<number, string>> {
  const wanted: number[] = [];
  for (let i = 0; i < tiles.count; i += 1) {
    if (tiles.w[i]! >= LABEL_MIN_WIDTH && tiles.h[i]! >= LABEL_MIN_HEIGHT) {
      wanted.push(tiles.node[i]!);
    }
  }
  if (wanted.length === 0) return new Map();
  const names = await api.labels(wanted);
  const map = new Map<number, string>();
  wanted.forEach((node, index) => map.set(node, names[index] ?? ""));
  return map;
}
