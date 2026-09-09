// The folder panel: a lazily expanded tree, largest child first.
//
// Children are fetched per directory on expand rather than up front. A scan of
// a real disk has millions of nodes and this panel shows a few dozen at a time,
// so loading it eagerly would be work nobody asked for.
//
// Four things this panel has to get right, because a list of indented names
// does not on its own answer any of them:
//
// * **Where am I.** The branch leading to whatever the map is rooted at is
//   drawn: its guide rails are lit, its row is marked, and it is expanded and
//   scrolled to when the map moves. Depth as bare left-padding stops being
//   readable at about the third level.
//
// * **What is big.** Every row carries its share of its parent as a small bar
//   in a column of its own, in the colour of what is inside it. A column, not
//   an underline, so the bars share a baseline and can be compared down the
//   list — and so they survive the panel being scrolled sideways.
//
// * **Deep names stay readable.** The panel is resizable, and past that the
//   rows scroll sideways while the figures on the right stay put. Squeezing the
//   name column to an ellipsis is what makes a deep tree useless.
//
// * **What I was doing.** The expanded folders and the scroll position survive
//   an entry being deleted. That works because the tree is edited in place
//   rather than rescanned, so the node ids in this component's cache stay
//   valid; all that is needed here is to drop the rows that went.
//
// No click in here moves the map. Double-click used to re-root it, which put a
// whole-view navigation on the same gesture people use to open a folder, so the
// map jumped constantly by accident; here a double-click just opens the folder.
// Re-rooting is a deliberate act now: the row's context menu, a breadcrumb, or
// a double-click in the map itself, where zooming is the only thing a
// double-click could mean.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  errorMessage,
  isStale,
  type EntryView,
  type TrashOutcome,
} from "./api";
import { divergence, measure, type SizeBasis } from "./basis";
import { categoryColor } from "./categories";
import * as fmt from "./format";
import { fill, useDict } from "./i18n";

/** How many children to list per directory; deeper ones are rarely useful. */
const CHILD_LIMIT = 200;

/** How the click that arrived should change the selection. */
export type SelectMode = "replace" | "toggle" | "range";

export interface FolderTreeProps {
  /** Which tree these ids belong to. A change invalidates every cached child. */
  generation: number;
  root: EntryView;
  selection: number[];
  /** Node the treemap is currently rooted at. */
  mapRoot: number;
  /** Ancestors of `mapRoot`, root first and including it. */
  chain: number[];
  /**
   * The most recent in-place edit, or null. Applied to the cache rather than
   * causing a reload, so nothing the user had open closes.
   */
  patch: TrashOutcome | null;
  /**
   * Which measure the figures and the ordering come from.
   *
   * A change invalidates the cached children, because the backend returns them
   * biggest-first under this measure — keeping rows sorted by the old one while
   * showing the new figures would put the row somebody is hunting for in the
   * wrong place.
   */
  basis: SizeBasis;
  onSelectionChange(nodes: number[]): void;
  /**
   * Right-click, with the row it landed on and where to put the menu.
   *
   * The whole entry, not just its id: the menu differs for a folder and a
   * file, and the window's copy of the selection is fetched asynchronously —
   * so on a right-click that also changes the selection it would still be one
   * step behind and offer the wrong items.
   */
  onContextMenu(entry: EntryView, x: number, y: number): void;
}

export function FolderTree({
  generation,
  root,
  selection,
  mapRoot,
  chain,
  patch,
  basis,
  onSelectionChange,
  onContextMenu,
}: FolderTreeProps) {
  const d = useDict();
  const [expanded, setExpanded] = useState<Set<number>>(new Set([root.node]));
  const [childrenOf, setChildrenOf] = useState<Map<number, EntryView[]>>(new Map());
  const [loading, setLoading] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const rowsRef = useRef<HTMLDivElement>(null);

  /** The row a shift-click measures its range from. */
  const anchor = useRef<number | null>(null);
  /** Visible rows in the order they are drawn, for range selection. */
  const order = useRef<number[]>([]);

  // The generation a request was issued for. A response that does not match
  // the current one is dropped: node ids are indices, so children fetched for
  // an old tree would be filed under an unrelated entry in the new one — and
  // because the cache is keyed by id, that wrong answer would then stick.
  const activeGeneration = useRef(generation);

  // A new tree invalidates everything cached about the old one. An in-place
  // edit deliberately does not come through here.
  useEffect(() => {
    activeGeneration.current = generation;
    setExpanded(new Set([root.node]));
    setChildrenOf(new Map());
    setLoading(new Set());
    setError(null);
    anchor.current = null;
  }, [generation, root.node]);

  // Switching the measure re-orders every list, so the cached children are
  // stale — but which folders are open is not, and that is the whole point of
  // clearing one and not the other.
  useEffect(() => {
    setChildrenOf(new Map());
  }, [basis]);

  const load = useCallback(
    (node: number) => {
      const issuedFor = generation;
      setLoading((prev) => new Set(prev).add(node));
      api
        .children(generation, node, basis, CHILD_LIMIT)
        .then((kids) => {
          if (activeGeneration.current !== issuedFor) return;
          setChildrenOf((prev) => new Map(prev).set(node, kids));
        })
        .catch((err) => {
          if (activeGeneration.current !== issuedFor || isStale(err)) return;
          setError(errorMessage(err));
        })
        .finally(() => {
          if (activeGeneration.current !== issuedFor) return;
          setLoading((prev) => {
            const next = new Set(prev);
            next.delete(node);
            return next;
          });
        });
    },
    [generation, basis],
  );

  useEffect(() => {
    if (!childrenOf.has(root.node) && !loading.has(root.node)) load(root.node);
    // `loading` is deliberately excluded: including it would retrigger this
    // while a request is in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation, root.node, childrenOf, load]);

  // Follow the map. Zooming into a folder over there should not leave this
  // panel showing a collapsed branch that gives no clue where you now are.
  useEffect(() => {
    if (chain.length === 0) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const node of chain) {
        if (!next.has(node)) {
          next.add(node);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [chain]);

  // Fetch the children of anything on the chain that was just opened.
  useEffect(() => {
    for (const node of chain) {
      if (expanded.has(node) && !childrenOf.has(node) && !loading.has(node)) load(node);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, expanded, childrenOf, load]);

  // Apply an in-place edit to the cache. The alternative — reloading — is what
  // used to throw away the user's place in the tree after every delete.
  const appliedPatch = useRef<TrashOutcome | null>(null);
  useEffect(() => {
    if (!patch || appliedPatch.current === patch) return;
    if (patch.generation !== generation) return;
    appliedPatch.current = patch;

    const gone = new Set(patch.trashed.map((entry) => entry.node));
    if (gone.size === 0) return;
    const corrected = new Map(patch.ancestors.map((entry) => [entry.node, entry]));

    setChildrenOf((prev) => {
      const next = new Map<number, EntryView[]>();
      for (const [parent, kids] of prev) {
        // Nothing below a deleted folder can be listed any more.
        if (gone.has(parent)) continue;
        next.set(
          parent,
          kids
            .filter((kid) => !gone.has(kid.node))
            // An ancestor of a deleted entry is now smaller, and its row still
            // shows the old figure until it is replaced.
            .map((kid) => corrected.get(kid.node) ?? kid),
        );
      }
      return next;
    });
  }, [patch, generation]);

  const toggle = useCallback(
    (node: EntryView) => {
      if (!node.isDir || node.childCount === 0) return;
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(node.node)) {
          next.delete(node.node);
        } else {
          next.add(node.node);
          if (!childrenOf.has(node.node)) load(node.node);
        }
        return next;
      });
    },
    [childrenOf, load],
  );

  // Open, never close. A double-click is two clicks, and each of those already
  // toggled — so a folder double-clicked would end up shut again, making the
  // gesture look broken. Double-clicking a folder means "show me what is in
  // here", so it settles on open whichever state it started in.
  const expand = useCallback(
    (node: EntryView) => {
      if (!node.isDir || node.childCount === 0) return;
      setExpanded((prev) => {
        if (prev.has(node.node)) return prev;
        if (!childrenOf.has(node.node)) load(node.node);
        return new Set(prev).add(node.node);
      });
    },
    [childrenOf, load],
  );

  const chosen = useMemo(() => new Set(selection), [selection]);
  const onChain = useMemo(() => new Set(chain), [chain]);

  /** Work out the new selection from a click and the keys held with it. */
  const select = useCallback(
    (node: number, mode: SelectMode) => {
      if (mode === "toggle") {
        anchor.current = node;
        onSelectionChange(
          chosen.has(node)
            ? selection.filter((id) => id !== node)
            : [...selection, node],
        );
        return;
      }
      if (mode === "range" && anchor.current !== null) {
        const rows = order.current;
        const from = rows.indexOf(anchor.current);
        const to = rows.indexOf(node);
        if (from !== -1 && to !== -1) {
          const [start, end] = from <= to ? [from, to] : [to, from];
          // The range replaces the selection rather than adding to it, which is
          // what shift-click does everywhere else.
          onSelectionChange(rows.slice(start, end + 1));
          return;
        }
      }
      anchor.current = node;
      onSelectionChange([node]);
    },
    [chosen, selection, onSelectionChange],
  );

  // Bring the current folder into view when the map moves there, but never
  // fight the user for the scrollbar while they are reading elsewhere.
  useEffect(() => {
    const row = rowsRef.current?.querySelector<HTMLElement>('[data-at="1"]');
    row?.scrollIntoView({ block: "nearest" });
  }, [mapRoot, childrenOf]);

  const rows: React.ReactNode[] = [];
  const drawn: number[] = [];

  const emit = (entry: EntryView, path: number[], parentSize: number) => {
    const isOpen = expanded.has(entry.node);
    const canExpand = entry.isDir && entry.childCount > 0;
    const own = measure(entry, basis);
    const share = parentSize > 0 ? (own / parentSize) * 100 : 0;
    // A file whose two figures are wildly apart gets a mark, in either measure:
    // in one it explains why a huge file reads small, in the other why a small
    // file reads huge. Without it the row just looks wrong.
    const sparse = divergence(entry) === "sparse";
    const at = entry.node === mapRoot;
    const isRoot = entry.node === root.node;
    // What it is full of, not what it is: a folder has no type of its own, and
    // a list of identically coloured folders carries no information.
    const tint = categoryColor(entry.dominant);

    drawn.push(entry.node);

    rows.push(
      <button
        key={entry.node}
        className={`tree-row${chosen.has(entry.node) ? " selected" : ""}${
          at ? " at" : ""
        }${isRoot ? " total" : ""}`}
        data-at={at ? "1" : undefined}
        title={entry.relPath || entry.name}
        onClick={(event) => {
          const mode: SelectMode = event.shiftKey
            ? "range"
            : event.metaKey || event.ctrlKey
              ? "toggle"
              : "replace";
          select(entry.node, mode);
          // Only a plain click doubles as expand: while building a selection
          // the folders opening and closing underneath is just in the way.
          if (mode === "replace" && canExpand) toggle(entry);
        }}
        onDoubleClick={() => expand(entry)}
        onContextMenu={(event) => {
          event.preventDefault();
          // Right-clicking outside the selection acts on the row under the
          // pointer, which is what every file manager does; right-clicking
          // inside it keeps the selection so a bulk action stays available.
          if (!chosen.has(entry.node)) select(entry.node, "replace");
          onContextMenu(entry, event.clientX, event.clientY);
        }}
      >
        <Rails path={path} onChain={onChain} />
        <span className="twist">
          {canExpand ? (loading.has(entry.node) ? "·" : isOpen ? "▾" : "▸") : ""}
        </span>
        <span className="glyph">
          {entry.isDir ? (
            <span className={`folder${isOpen ? " open" : ""}`} style={{ background: tint }} />
          ) : (
            <span className="dot" style={{ background: tint }} />
          )}
        </span>
        <span className="name">
          {entry.name || "/"}
          {entry.isDir ? "/" : ""}
        </span>
        {/* Pinned to the right edge, so scrolling sideways to read a deep name
            never takes the numbers with it. */}
        <span className="figures">
          <span className="size">
            {fmt.bytes(own)}
            {sparse && (
              <i
                className="sparse-mark"
                title={fill(d.tree.sparseTitle, {
                  claimed: fmt.bytes(entry.size),
                  allocated: fmt.bytes(entry.alloc),
                })}
              >
                ~
              </i>
            )}
          </span>
          <span className="share-num">
            {isRoot ? "" : share >= 0.1 ? `${share.toFixed(0)}%` : "·"}
          </span>
          <span className="minibar">
            {/* The root is the whole of itself, so a full bar says nothing. */}
            {!isRoot && (
              <i style={{ width: `${Math.min(share, 100)}%`, background: tint }} />
            )}
          </span>
        </span>
      </button>,
    );

    if (!isOpen) return;

    const kids = childrenOf.get(entry.node);
    if (!kids) return;

    const childPath = [...path, entry.node];
    if (kids.length === 0) {
      rows.push(
        <div key={`${entry.node}-empty`} className="tree-note">
          <Rails path={childPath} onChain={onChain} />
          <span>empty</span>
        </div>,
      );
      return;
    }

    for (const kid of kids) emit(kid, childPath, own);
    if (kids.length === CHILD_LIMIT) {
      rows.push(
        <div key={`${entry.node}-more`} className="tree-note">
          <Rails path={childPath} onChain={onChain} />
          <span>the {CHILD_LIMIT} largest are listed</span>
        </div>,
      );
    }
  };

  emit(root, [], measure(root, basis));
  order.current = drawn;

  const here = hereLabel(chain, childrenOf, root);

  return (
    <>
      <div className="tree-here">
        <span>in</span>
        <span className="path" title={here}>
          {fmt.ellipsize(here, 40)}
        </span>
      </div>
      <div className="rows" ref={rowsRef}>
        {error && (
          <div className="error" style={{ margin: "8px 10px" }}>
            {error}
          </div>
        )}
        {rows}
      </div>
      {selection.length > 1 && (
        <div className="tree-footer">
          <span>{selection.length} selected</span>
          <button className="ghost" onClick={() => onSelectionChange([])}>
            Clear
          </button>
        </div>
      )}
    </>
  );
}

/**
 * One vertical guide per level of nesting, lit where it belongs to the branch
 * leading to the current folder.
 */
function Rails({ path, onChain }: { path: number[]; onChain: Set<number> }) {
  if (path.length === 0) return <span className="rails" />;
  return (
    <span className="rails">
      {path.map((ancestor, depth) => (
        <span key={depth} className={`rail${onChain.has(ancestor) ? " on" : ""}`} />
      ))}
    </span>
  );
}

/**
 * The path to the current folder, for the header that stays put while the list
 * scrolls. Built from what is already cached rather than asked for again: the
 * caller has the chain, and the names are in the children already loaded.
 */
function hereLabel(
  chain: number[],
  childrenOf: Map<number, EntryView[]>,
  root: EntryView,
): string {
  const rootName = root.name || "/";
  if (chain.length === 0) return `${rootName}/`;

  const names = chain.map((node) => {
    if (node === root.node) return rootName;
    for (const kids of childrenOf.values()) {
      const hit = kids.find((kid) => kid.node === node);
      if (hit) return hit.name;
    }
    // The name lives in a folder that has not been listed yet, which happens
    // for a moment after zooming straight into the map.
    return "…";
  });

  return `${names.join("/")}/`;
}
