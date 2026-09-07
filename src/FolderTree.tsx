// The folder panel: a lazily expanded tree, largest child first.
//
// Children are fetched per directory on expand rather than up front. A scan of
// a real disk has millions of nodes and this panel shows a few dozen at a time,
// so loading it eagerly would be work nobody asked for.

import { useCallback, useEffect, useRef, useState } from "react";
import { api, errorMessage, isStale, type EntryView } from "./api";
import * as fmt from "./format";

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

/** How many children to list per directory; deeper ones are rarely useful. */
const CHILD_LIMIT = 200;

export interface FolderTreeProps {
  /** Which tree these ids belong to. A change invalidates every cached child. */
  generation: number;
  root: EntryView;
  selected: number | null;
  /** Node the treemap is currently rooted at, highlighted differently. */
  mapRoot: number;
  onSelect(node: number): void;
  onZoom(node: number): void;
}

export function FolderTree({
  generation,
  root,
  selected,
  mapRoot,
  onSelect,
  onZoom,
}: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([root.node]));
  const [childrenOf, setChildrenOf] = useState<Map<number, EntryView[]>>(new Map());
  const [loading, setLoading] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // The generation a request was issued for. A response that does not match
  // the current one is dropped: node ids are indices, so children fetched for
  // an old tree would be filed under an unrelated entry in the new one — and
  // because the cache is keyed by id, that wrong answer would then stick.
  const activeGeneration = useRef(generation);

  // A new tree invalidates everything cached about the old one.
  useEffect(() => {
    activeGeneration.current = generation;
    setExpanded(new Set([root.node]));
    setChildrenOf(new Map());
    setLoading(new Set());
    setError(null);
  }, [generation, root.node]);

  const load = useCallback(
    (node: number) => {
      const issuedFor = generation;
      setLoading((prev) => new Set(prev).add(node));
      api
        .children(generation, node, CHILD_LIMIT)
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
    [generation],
  );

  useEffect(() => {
    if (!childrenOf.has(root.node) && !loading.has(root.node)) load(root.node);
    // `loading` is deliberately excluded: including it would retrigger this
    // while a request is in flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generation, root.node, childrenOf, load]);

  const toggle = (node: EntryView) => {
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
  };

  const rows: React.ReactNode[] = [];

  const emit = (entry: EntryView, depth: number, parentSize: number) => {
    const isOpen = expanded.has(entry.node);
    const canExpand = entry.isDir && entry.childCount > 0;
    const share = parentSize > 0 ? (entry.size / parentSize) * 100 : 0;

    rows.push(
      <button
        key={entry.node}
        className={`tree-row share${selected === entry.node ? " selected" : ""}`}
        style={{
          paddingLeft: 6 + depth * 12,
          ["--share" as string]: `${share.toFixed(1)}%`,
        }}
        title={entry.relPath || entry.name}
        onClick={() => {
          onSelect(entry.node);
          if (canExpand) toggle(entry);
        }}
        onDoubleClick={() => entry.isDir && onZoom(entry.node)}
      >
        <span className="label">
          <span className="twist">
            {canExpand ? (loading.has(entry.node) ? "·" : isOpen ? "▾" : "▸") : ""}
          </span>
          <span
            className="dot"
            style={{ background: CATEGORY_COLORS[entry.category] ?? CATEGORY_COLORS.other }}
          />
          <span
            className="name"
            style={entry.node === mapRoot ? { color: "var(--accent)" } : undefined}
          >
            {entry.name || "/"}
            {entry.isDir ? "/" : ""}
          </span>
        </span>
        <span className="size">{fmt.bytes(entry.size)}</span>
      </button>,
    );

    if (isOpen) {
      const kids = childrenOf.get(entry.node);
      if (kids && kids.length > 0) {
        for (const kid of kids) emit(kid, depth + 1, entry.size);
        if (kids.length === CHILD_LIMIT) {
          rows.push(
            <div
              key={`${entry.node}-more`}
              className="hint"
              style={{ paddingLeft: 24 + depth * 12, paddingBottom: 4 }}
            >
              showing the {CHILD_LIMIT} largest
            </div>,
          );
        }
      } else if (kids && kids.length === 0) {
        rows.push(
          <div
            key={`${entry.node}-empty`}
            className="hint"
            style={{ paddingLeft: 24 + depth * 12, paddingBottom: 4 }}
          >
            empty
          </div>,
        );
      }
    }
  };

  emit(root, 0, root.size);

  return (
    <>
      <div className="panel-title">Folders</div>
      {error && <div className="error" style={{ margin: "0 10px 8px" }}>{error}</div>}
      <div style={{ paddingBottom: 10 }}>{rows}</div>
    </>
  );
}
