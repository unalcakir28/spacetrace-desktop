import { useCallback, useEffect, useState } from "react";
import { api, errorMessage, type DiffView, type EntryView, type Opened } from "./api";
import { DiffDialog, RemoteDialog, ScanDialog, SnapshotDialog } from "./Dialogs";
import { FolderTree } from "./FolderTree";
import { Inspector } from "./Inspector";
import { Treemap } from "./Treemap";
import * as fmt from "./format";

const LEGEND: [string, string][] = [
  ["image", "#a78bfa"],
  ["video", "#f472b6"],
  ["audio", "#fbbf24"],
  ["document", "#60a5fa"],
  ["archive", "#2dd4bf"],
  ["code", "#a3e635"],
  ["binary", "#94a3b8"],
  ["cache", "#fb923c"],
  ["other", "#64748b"],
];

type Dialog = "scan" | "snapshots" | "remote" | null;

export function App() {
  const [opened, setOpened] = useState<Opened | null>(null);
  const [mapRoot, setMapRoot] = useState<number>(0);
  const [crumbs, setCrumbs] = useState<EntryView[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [diff, setDiff] = useState<DiffView | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const receive = useCallback((result: Opened) => {
    setOpened(result);
    setMapRoot(result.root.node);
    setSelected(null);
    setDialog(null);
    setDiff(null);
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  // Breadcrumbs follow whatever the map is rooted at.
  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    api
      .ancestors(mapRoot)
      .then((chain) => !cancelled && setCrumbs(chain))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [opened, mapRoot, reloadKey]);

  // Backspace goes up a level, the way a file manager does.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "Backspace" && crumbs.length > 1) {
        event.preventDefault();
        const parent = crumbs[crumbs.length - 2];
        if (parent) setMapRoot(parent.node);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [crumbs]);

  /** After trashing something the tree is stale; rescan the same root. */
  const rescan = useCallback(() => {
    if (!opened || opened.source.kind !== "live") return;
    const path = opened.source.root;
    api
      .scanDirectory({ path })
      .then(receive)
      .catch((err) => setError(errorMessage(err)));
  }, [opened, receive]);

  return (
    <div className="app">
      <div className="toolbar">
        <div className="brand">
          <strong>spacetrace</strong>
          <span>disk usage over time</span>
        </div>
        <button onClick={() => setDialog("scan")}>Scan folder…</button>
        <button onClick={() => setDialog("snapshots")}>Snapshots…</button>
        <button onClick={() => setDialog("remote")}>Remote agent…</button>
        <div className="spacer" />
        {opened && (
          <button
            className="ghost"
            onClick={() => setMapRoot(opened.root.node)}
            disabled={mapRoot === opened.root.node}
            title="Back to the top of this scan"
          >
            Reset zoom
          </button>
        )}
      </div>

      <div className="source-line">{describe(opened)}</div>

      {!opened ? (
        <Welcome onScan={() => setDialog("scan")} onSnapshots={() => setDialog("snapshots")} onRemote={() => setDialog("remote")} />
      ) : (
        <div className="workspace">
          <div className="sidebar">
            <FolderTree
              root={opened.root}
              selected={selected}
              mapRoot={mapRoot}
              reloadKey={reloadKey}
              onSelect={setSelected}
              onZoom={setMapRoot}
            />
          </div>

          <div className="map-area">
            <div className="crumbs">
              {crumbs.map((crumb, index) => (
                <span key={crumb.node} style={{ display: "flex", alignItems: "center" }}>
                  {index > 0 && <span className="crumb-sep">/</span>}
                  <button
                    className={`crumb${index === crumbs.length - 1 ? " current" : ""}`}
                    onClick={() => setMapRoot(crumb.node)}
                    title={crumb.relPath || opened.root.name}
                  >
                    {crumb.name || rootLabel(opened)}
                  </button>
                </span>
              ))}
              <span style={{ flex: 1 }} />
              <span className="hint" style={{ paddingRight: 4, whiteSpace: "nowrap" }}>
                double-click to zoom · backspace to go up
              </span>
            </div>

            {error && (
              <div className="error" style={{ margin: "8px 12px 0" }}>
                {error}
              </div>
            )}

            <Treemap
              root={mapRoot}
              reloadKey={reloadKey}
              selected={selected}
              onSelect={setSelected}
              onZoom={setMapRoot}
            />

            <div className="legend">
              {LEGEND.map(([name, color]) => (
                <span className="item" key={name}>
                  <span className="swatch" style={{ background: color }} />
                  {name}
                </span>
              ))}
              <span style={{ flex: 1 }} />
              <span>
                ⠿ = more inside than shown
              </span>
            </div>
          </div>

          <div className="inspector">
            <Inspector
              opened={opened}
              selected={selected}
              onTrashed={() => {
                setSelected(null);
                rescan();
              }}
            />
          </div>
        </div>
      )}

      {dialog === "scan" && (
        <ScanDialog onClose={() => setDialog(null)} onOpened={receive} />
      )}
      {dialog === "snapshots" && (
        <SnapshotDialog
          onClose={() => setDialog(null)}
          onOpened={receive}
          onDiff={(view) => {
            setDialog(null);
            setDiff(view);
          }}
        />
      )}
      {dialog === "remote" && (
        <RemoteDialog onClose={() => setDialog(null)} onOpened={receive} />
      )}
      {diff && <DiffDialog view={diff} onClose={() => setDiff(null)} />}
    </div>
  );
}

function rootLabel(opened: Opened): string {
  const root = opened.source.kind === "live" ? opened.source.root : opened.source.root;
  const parts = root.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? root;
}

function describe(opened: Opened | null) {
  if (!opened) return <span>Nothing open yet.</span>;

  const totals = (
    <>
      <span className="num">{fmt.bytes(opened.totalSize)}</span> logical ·{" "}
      <span className="num">{fmt.bytes(opened.totalAlloc)}</span> on disk ·{" "}
      <span className="num">{fmt.count(opened.root.files)}</span> files ·{" "}
      <span className="num">{fmt.count(opened.entries)}</span> entries
    </>
  );

  return (
    <>
      {opened.source.kind === "live" ? (
        <span className="badge live">live scan</span>
      ) : (
        <>
          <span className="badge snapshot">
            snapshot #{opened.source.scanId} · {fmt.relativeTime(opened.source.startedAt)}
          </span>
          {opened.source.remote && (
            <span className="badge remote" title={opened.source.remote}>
              {opened.source.host}
            </span>
          )}
        </>
      )}
      <span className="num" style={{ color: "var(--text)" }}>
        {opened.source.root}
      </span>
      <span style={{ color: "var(--text-faint)" }}>{totals}</span>
      {opened.scanErrors > 0 && (
        <span className="badge warn" title="Paths that could not be read are counted, not skipped">
          {fmt.count(opened.scanErrors)} unreadable
        </span>
      )}
    </>
  );
}

function Welcome({
  onScan,
  onSnapshots,
  onRemote,
}: {
  onScan(): void;
  onSnapshots(): void;
  onRemote(): void;
}) {
  return (
    <div style={{ display: "grid", placeItems: "center", padding: 32 }}>
      <div style={{ maxWidth: 460, textAlign: "center" }}>
        <h1 style={{ fontSize: 21, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
          See what is filling your disks
        </h1>
        <p style={{ color: "var(--text-dim)", margin: "0 0 22px", lineHeight: 1.6 }}>
          Scan a folder here, open a snapshot you took earlier, or read one
          straight off an agent running on a server or NAS.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button className="primary" onClick={onScan}>
            Scan a folder
          </button>
          <button onClick={onSnapshots}>Stored snapshots</button>
          <button onClick={onRemote}>Remote agent</button>
        </div>
        <p className="hint" style={{ marginTop: 24 }}>
          Nothing is written to your disk unless you explicitly move something to
          the Trash, and that is only possible on a live scan of this machine.
        </p>
      </div>
    </div>
  );
}
