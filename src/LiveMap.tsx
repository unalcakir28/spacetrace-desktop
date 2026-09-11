// What the scan has found, while it is still finding it.
//
// A progress bar says the work is happening. This says what the work is
// turning up, which is the only reason anyone pressed the button — and a
// folder that visibly swells past the others answers the question before the
// scan has finished asking it.
//
// **Only when the window is otherwise empty.** The rule this whole app is
// built around is that work never takes the window away (see the note at the
// top of `App.tsx`): a rescan leaves the previous map exactly where it was,
// still usable. So this appears in place of the welcome screen on a first
// scan, and never on top of a map somebody is reading.
//
// **The layout is not computed here.** Tiles arrive already placed by the same
// squarified routine the finished map uses, which is why the picture does not
// rearrange itself at the moment the scan ends — the handover is a change of
// data, not of algorithm. It is also the reason no rule about arrangement
// lives in this file: there is no JavaScript test runner in this app, so
// anything with a rule in it belongs on the Rust side.
//
// **Every figure here is partial and the view says so in words.** A folder's
// number is what has been found under it so far. A number that has stopped
// climbing looks exactly like a number that is complete, and only one of those
// can be quoted — so the heading says "so far" rather than leaving the reader
// to work it out.

import { useCallback, useEffect, useRef, useState } from "react";

import { api, isStale, type LiveTile } from "./api";
import { colorByIndex } from "./categories";
import * as fmt from "./format";
import { useDict } from "./i18n";

/** A tile narrower or shorter than this cannot hold readable text. */
const LABEL_MIN_WIDTH = 64;
const LABEL_MIN_HEIGHT = 16;

/**
 * How often the map is redrawn.
 *
 * Slower than the progress strip's own tick on purpose. The strip's job is to
 * prove something is moving, so it wants to be immediate; this one is read by
 * looking at proportions, and a map that reshuffles eight times a second is
 * harder to read than one that settles. Four times a second is fast enough to
 * feel live and slow enough to follow.
 */
const REFRESH_MS = 250;

export function LiveMap() {
  const d = useDict();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [tiles, setTiles] = useState<LiveTile[]>([]);

  // The drawing area, watched rather than measured once: the window can be
  // resized while a scan runs, and a map laid out for the old width would be
  // stretched rather than re-placed.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setSize({ width: Math.floor(box.width), height: Math.floor(box.height) });
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return;
    let cancelled = false;

    const pull = () => {
      api
        .liveTiles(size.width, size.height)
        .then((found) => !cancelled && setTiles(found))
        // A preview that cannot be fetched is left as it was rather than
        // replaced by an error: the scan is still running, the strip above is
        // still reporting it, and there is nothing here for a reader to do.
        .catch((err) => {
          if (!cancelled && !isStale(err)) setTiles((previous) => previous);
        });
    };

    pull();
    const timer = window.setInterval(pull, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [size.width, size.height]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(size.width * dpr));
    canvas.height = Math.max(1, Math.floor(size.height * dpr));
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);

    for (const tile of tiles) {
      if (tile.w <= 0 || tile.h <= 0) continue;
      ctx.fillStyle = colorByIndex(tile.category);
      // Held back from the finished map's opacity, because this is not a
      // finished answer. The difference is small enough not to be decorative
      // and large enough that the map plainly firms up when the scan lands.
      ctx.globalAlpha = 0.62;
      ctx.fillRect(tile.x, tile.y, tile.w, tile.h);
      ctx.globalAlpha = 1;
      if (tile.w > 4 && tile.h > 4) {
        ctx.strokeStyle = "rgba(8, 11, 20, 0.6)";
        ctx.lineWidth = 1;
        ctx.strokeRect(tile.x + 0.5, tile.y + 0.5, tile.w - 1, tile.h - 1);
      }
    }

    ctx.font = `11px ${getComputedStyle(document.body).getPropertyValue("--mono") || "monospace"}`;
    ctx.textBaseline = "top";
    for (const tile of tiles) {
      if (tile.w < LABEL_MIN_WIDTH || tile.h < LABEL_MIN_HEIGHT) continue;
      const text = `${tile.name}${tile.isDir ? "/" : ""}`;
      const metrics = ctx.measureText(text);
      if (metrics.width > tile.w - 8) continue;
      ctx.fillStyle = "rgba(8, 11, 20, 0.66)";
      ctx.fillRect(tile.x + 2, tile.y + 2, Math.min(metrics.width + 6, tile.w - 4), 14);
      ctx.fillStyle = "#f4f6ff";
      ctx.fillText(text, tile.x + 5, tile.y + 4);

      // The figure goes under the name when there is room for a second line,
      // because "which is big" is answered by the rectangle and "how big" is
      // the follow-up question.
      if (tile.h > 34) {
        const bytes = fmt.bytes(tile.alloc);
        ctx.fillStyle = "rgba(8, 11, 20, 0.55)";
        ctx.fillRect(tile.x + 2, tile.y + 17, Math.min(ctx.measureText(bytes).width + 6, tile.w - 4), 14);
        ctx.fillStyle = "#c4cdf5";
        ctx.fillText(bytes, tile.x + 5, tile.y + 19);
      }
    }
  }, [tiles, size]);

  useEffect(() => {
    const frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [draw]);

  return (
    <div className="live-map">
      <div className="live-head">
        <span className="live-dot" />
        {tiles.length > 0 ? d.live.found : d.live.starting}
      </div>
      <div className="canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} style={{ pointerEvents: "none" }} />
      </div>
    </div>
  );
}
