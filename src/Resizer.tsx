// The drag handles between the three panes.
//
// A folder list is the pane people actually work in, and how wide it needs to
// be depends entirely on how deep the folders they are looking at go — which
// is not something the app can know. So it is theirs to set, and the setting
// is remembered.
//
// `role="separator"` with arrow keys is not decoration: dragging is the only
// way to do this with a mouse, and without the keyboard path there would be no
// way to do it at all without one.

import { useCallback, useEffect, useRef, useState } from "react";

import { fill, useDict } from "./i18n";

export interface PaneWidths {
  sidebar: number;
  inspector: number;
}

export const DEFAULT_WIDTHS: PaneWidths = { sidebar: 320, inspector: 276 };

/** Enough for the numbers column plus a name; enough that the map survives. */
const LIMITS = {
  sidebar: { min: 200, max: 900 },
  inspector: { min: 210, max: 560 },
};

/** How much an arrow key moves it. Shift multiplies by ten, as elsewhere. */
const STEP = 16;

const STORAGE_KEY = "spacetrace.panes";

export function usePaneWidths(): [PaneWidths, (next: PaneWidths) => void] {
  const [widths, setWidths] = useState<PaneWidths>(() => load());

  const update = useCallback((next: PaneWidths) => {
    const clamped: PaneWidths = {
      sidebar: clamp(next.sidebar, LIMITS.sidebar),
      inspector: clamp(next.inspector, LIMITS.inspector),
    };
    setWidths(clamped);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clamped));
    } catch {
      // A window that cannot persist its layout still works; losing the width
      // on restart is not worth telling anyone about.
    }
  }, []);

  return [widths, update];
}

function load(): PaneWidths {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_WIDTHS;
    const parsed = JSON.parse(stored) as Partial<PaneWidths>;
    return {
      sidebar: clamp(parsed.sidebar ?? DEFAULT_WIDTHS.sidebar, LIMITS.sidebar),
      inspector: clamp(parsed.inspector ?? DEFAULT_WIDTHS.inspector, LIMITS.inspector),
    };
  } catch {
    return DEFAULT_WIDTHS;
  }
}

function clamp(value: number, limits: { min: number; max: number }): number {
  if (!Number.isFinite(value)) return limits.min;
  return Math.min(limits.max, Math.max(limits.min, Math.round(value)));
}

export interface ResizerProps {
  /** Which pane this handle belongs to. */
  pane: keyof PaneWidths;
  /** Its current width, so a drag starts from where it is. */
  width: number;
  /**
   * Which way widening goes. The sidebar's handle is on its right edge, so
   * dragging right widens it; the inspector's is on its left, so dragging right
   * narrows it.
   */
  direction: 1 | -1;
  label: string;
  onResize(width: number): void;
  onReset(): void;
}

export function Resizer({
  pane,
  width,
  direction,
  label,
  onResize,
  onReset,
}: ResizerProps) {
  const d = useDict();
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, width: 0 });

  // Bound to the window, not the handle: the pointer routinely leaves a 6px
  // strip mid-drag, and a mouseup out there still has to end the drag.
  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: MouseEvent) => {
      const moved = (event.clientX - start.current.x) * direction;
      onResize(start.current.width + moved);
    };
    const onUp = () => setDragging(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    // While dragging, the cursor should not flicker into a text caret over the
    // panes it passes across.
    const previous = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = previous;
    };
  }, [dragging, direction, onResize]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? STEP * 10 : STEP;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onResize(width - step * direction);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onResize(width + step * direction);
      return;
    }
    if (event.key === "Home" || event.key === "Enter") {
      event.preventDefault();
      onReset();
    }
  };

  return (
    <div
      className={`resizer${dragging ? " dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={LIMITS[pane].min}
      aria-valuemax={LIMITS[pane].max}
      tabIndex={0}
      title={fill(d.tree.resizeHint, { label })}
      onKeyDown={onKeyDown}
      onMouseDown={(event) => {
        // Only the primary button, and never a text selection alongside it.
        if (event.button !== 0) return;
        event.preventDefault();
        start.current = { x: event.clientX, width };
        setDragging(true);
      }}
      onDoubleClick={onReset}
    />
  );
}
