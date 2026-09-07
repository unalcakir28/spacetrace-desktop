// The folder panel: a lazily expanded tree, largest child first.
//
// Children are fetched per directory on expand rather than up front. A scan of
// a real disk has millions of nodes and this panel shows a few dozen at a time,
// so loading it eagerly would be work nobody asked for.

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type EntryView } from "./api";
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
  root: EntryView;
  selected: number | null;
  /** Node the treemap is currently rooted at, highlighted differently. */
  mapRoot: number;
  onSelect(node: number): void;
  onZoom(node: number): void;
  /** Bumped by the caller when the tree has been reloaded underneath us. */
  reloadKey?: number;
}

export function FolderTree({
  root,
  selected,
  mapRoot,
  onSelect,
  onZoom,
  reloadKey,
}: FolderTreeProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set([root.node]));
  const [childrenOf, setChildrenOf] = useState<Map<number, EntryView[]>>(new Map());
  const [loading, setLoading] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // A new tree invalidates everything cached about the old one.
  useEffect(() => {
    setExpanded(new Set([root.node]));
    setChildrenOf(new Map());
    setLoading(new Set());
    setError(null);
  }, [root.node, reloadKey]);

  const load = useCallback(
    (node: number) => {
      setLoading((prev) => new Set(prev).add(node));
      api
        .children(node, CHILD_LIMIT)
        .then((kids) => {
          setChildrenOf((prev) => new Map(prev).set(node, kids));
        })
        .catch((err) => setError(errorMessage(err)))
        .finally(() => {
          setLoading((prev) => {
            const next = new Set(prev);
            next.delete(node);
            return next;
          });
        });
    },
    [],
  );

  useEffect(() => {
    if (!childrenOf.has(root.node) && !loading.has(root.node)) load(root.node);
    // Only on mount and when the tree changes; `loading` deliberately excluded
    // so a request in flight does not retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root.node, reloadKey, childrenOf, load]);

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
