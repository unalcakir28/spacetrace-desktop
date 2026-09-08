// The right-click menu.
//
// Kept deliberately small: the actions a person wants on a row they have just
// pointed at, in the order they want them, with the destructive one last and
// separated. A menu that lists everything the app can do is a menu nobody
// reads.
//
// Two things it has to get right to feel native:
//
// * It never opens off-screen. The position is clamped after measuring, not
//   guessed, because the menu near the bottom of a tall folder list is exactly
//   where the pointer usually is.
//
// * The keyboard works. Arrow keys move, Enter runs, Escape closes, and focus
//   returns to where it was — otherwise the menu is a trap for anyone not
//   using a mouse.

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  /** Shown right-aligned: a shortcut, or a count for a bulk action. */
  note?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Draws a divider above this item. */
  separated?: boolean;
  run(): void;
}

export interface MenuRequest {
  x: number;
  y: number;
  items: MenuItem[];
}

const MARGIN = 6;

export function ContextMenu({
  request,
  onClose,
}: {
  request: MenuRequest;
  onClose(): void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(() => firstEnabled(request.items));

  // Measured, then clamped. Guessing the height gets it wrong for a menu whose
  // length depends on what was clicked.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    const left = Math.max(
      MARGIN,
      Math.min(request.x, window.innerWidth - width - MARGIN),
    );
    const top = Math.max(
      MARGIN,
      Math.min(request.y, window.innerHeight - height - MARGIN),
    );
    setPlaced({ left, top });
  }, [request]);

  useEffect(() => {
    ref.current?.focus();
  }, [placed]);

  const items = request.items;

  const step = (delta: number) => {
    setActive((current) => {
      for (let i = 1; i <= items.length; i += 1) {
        const next = (current + delta * i + items.length * i) % items.length;
        if (!items[next]?.disabled) return next;
      }
      return current;
    });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      step(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      step(-1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const item = items[active];
      if (item && !item.disabled) {
        onClose();
        item.run();
      }
    }
  };

  return (
    <>
      {/* Catches the click that dismisses the menu, including a right-click
          somewhere else, which should move the menu rather than open two. */}
      <div
        className="menu-catcher"
        onMouseDown={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        className="menu"
        ref={ref}
        role="menu"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{
          left: placed?.left ?? request.x,
          top: placed?.top ?? request.y,
          // Hidden until measured, so it is never seen in the wrong place.
          visibility: placed ? "visible" : "hidden",
        }}
      >
        {items.map((item, index) => (
          <button
            key={item.label}
            role="menuitem"
            className={`menu-item${item.danger ? " danger" : ""}${
              item.separated ? " separated" : ""
            }${index === active ? " active" : ""}`}
            disabled={item.disabled}
            onMouseEnter={() => !item.disabled && setActive(index)}
            onClick={() => {
              onClose();
              item.run();
            }}
          >
            <span>{item.label}</span>
            {item.note && <em>{item.note}</em>}
          </button>
        ))}
      </div>
    </>
  );
}

function firstEnabled(items: MenuItem[]): number {
  const index = items.findIndex((item) => !item.disabled);
  return index === -1 ? 0 : index;
}
