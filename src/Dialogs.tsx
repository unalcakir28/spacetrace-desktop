// The three ways of getting data in: scan a folder, open a stored snapshot,
// or read one off an agent. Plus the diff view over two snapshots.

import { useEffect, useState } from "react";
import { open as openFolder } from "@tauri-apps/plugin-dialog";
import { api, errorMessage, type DiffView, type Opened, type ScanMeta } from "./api";
import * as fmt from "./format";

function Scrim({ children, onClose }: { children: React.ReactNode; onClose(): void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}

// ------------------------------------------------------------- scan folder

export function ScanDialog({
  onClose,
  onOpened,
}: {
  onClose(): void;
  onOpened(result: Opened): void;
}) {
  const [path, setPath] = useState("");
  const [exclude, setExclude] = useState("node_modules, .git");
  const [oneFileSystem, setOneFileSystem] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async () => {
    const chosen = await openFolder({ directory: true, multiple: false });
    if (typeof chosen === "string") setPath(chosen);
  };

  const start = () => {
    if (!path) return;
    setBusy(true);
    setError(null);
    api
      .scanDirectory({
        path,
        exclude: exclude
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        oneFileSystem,
      })
      .then(onOpened)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  return (
    <Scrim onClose={onClose}>
      <div className="dialog" style={{ maxWidth: 560 }}>
        <header>
          <h2>Scan a folder</h2>
        </header>
        <div className="body">
          {error && <div className="error">{error}</div>}
          <div className="field">
            <label htmlFor="scan-path">Folder</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                id="scan-path"
                value={path}
                placeholder="/Users/you/Projects"
                onChange={(e) => setPath(e.target.value)}
                style={{ flex: 1 }}
              />
              <button onClick={pick}>Browse…</button>
            </div>
          </div>
          <div className="field">
            <label htmlFor="scan-exclude">
              Skip folders with these names (comma separated)
            </label>
            <input
              id="scan-exclude"
              value={exclude}
              onChange={(e) => setExclude(e.target.value)}
            />
          </div>
          <label style={{ display: "flex", gap: 7, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={oneFileSystem}
              onChange={(e) => setOneFileSystem(e.target.checked)}
              style={{ width: "auto" }}
            />
            Stay on one filesystem (skip mounted volumes)
          </label>
          <p className="hint" style={{ marginTop: 12 }}>
            Scanning only reads. Unreadable paths are counted and reported rather
            than skipped silently.
          </p>
        </div>
        <footer>
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" onClick={start} disabled={busy || !path}>
            {busy ? (
              <>
                <span className="spinner" /> Scanning…
              </>
            ) : (
              "Scan"
            )}
          </button>
        </footer>
      </div>
    </Scrim>
  );
}

// ---------------------------------------------------------- snapshot list

function SnapshotTable({
  scans,
  onPick,
  selectedIds,
  onToggle,
}: {
  scans: ScanMeta[];
  onPick?(scan: ScanMeta): void;
  selectedIds?: number[];
  onToggle?(id: number): void;
}) {
  if (scans.length === 0) {
    return <div className="empty">No snapshots here yet.</div>;
  }
  return (
    <table>
      <thead>
        <tr>
          {onToggle && <th style={{ width: 28 }} />}
          <th className="right">ID</th>
          <th>Taken</th>
          <th>Host</th>
          <th className="right">Size</th>
          <th className="right">Files</th>
          <th>Root</th>
        </tr>
      </thead>
      <tbody>
        {scans.map((scan) => (
          <tr
            key={scan.id}
            className={onPick ? "clickable" : undefined}
            onClick={() => onPick?.(scan)}
          >
            {onToggle && (
              <td>
                <input
                  type="checkbox"
                  checked={selectedIds?.includes(scan.id) ?? false}
                  onChange={() => onToggle(scan.id)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: "auto" }}
                />
              </td>
            )}
            <td className="right">{scan.id}</td>
            <td title={fmt.timestamp(scan.startedAt)}>{fmt.relativeTime(scan.startedAt)}</td>
            <td>{fmt.ellipsize(scan.host, 16)}</td>
            <td className="right">{fmt.bytes(scan.totalSize)}</td>
            <td className="right">{fmt.count(scan.files)}</td>
            <td title={scan.root}>
              {fmt.ellipsize(scan.root, 34)}
              {scan.label && (
                <span style={{ color: "var(--text-faint)" }}> [{scan.label}]</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SnapshotDialog({
  onClose,
  onOpened,
  onDiff,
}: {
  onClose(): void;
  onOpened(result: Opened): void;
  onDiff(view: DiffView): void;
}) {
  const [db, setDb] = useState("");
  const [scans, setScans] = useState<ScanMeta[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = (path: string) => {
    setBusy(true);
    setError(null);
    api
      .listSnapshots(path)
      .then(setScans)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    api
      .defaultDatabase()
      .then((path) => {
        setDb(path);
        reload(path);
      })
      .catch((err) => {
        setError(errorMessage(err));
        setBusy(false);
      });
  }, []);

  const toggle = (id: number) => {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Keep at most two: a diff compares exactly two snapshots.
      return [...prev, id].slice(-2);
    });
  };

  const compare = () => {
    const [a, b] = [...picked].sort((x, y) => x - y);
    if (a === undefined || b === undefined) return;
    setBusy(true);
    setError(null);
    api
      .diffSnapshots(db, a, b)
      .then(onDiff)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  return (
    <Scrim onClose={onClose}>
      <div className="dialog">
        <header>
          <h2>Stored snapshots</h2>
          {busy && <span className="spinner" />}
        </header>
        <div className="body">
          {error && <div className="error">{error}</div>}
          <div className="field">
            <label htmlFor="db-path">Snapshot database</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                id="db-path"
                value={db}
                onChange={(e) => setDb(e.target.value)}
                style={{ flex: 1 }}
              />
              <button onClick={() => reload(db)}>Reload</button>
            </div>
          </div>
          <p className="hint" style={{ marginBottom: 10 }}>
            The same database the <code>spacetrace</code> command line writes.
            Click a row to open it; tick two rows to compare them.
          </p>
          <SnapshotTable
            scans={scans}
            selectedIds={picked}
            onToggle={toggle}
            onPick={(scan) => {
              setBusy(true);
              api
                .openSnapshot(db, scan.id)
                .then(onOpened)
                .catch((err) => setError(errorMessage(err)))
                .finally(() => setBusy(false));
            }}
          />
        </div>
        <footer>
          <span className="hint" style={{ flex: 1 }}>
            {picked.length === 2
              ? `Comparing #${Math.min(...picked)} → #${Math.max(...picked)}`
              : `${picked.length} of 2 selected for comparison`}
          </span>
          <button onClick={onClose}>Close</button>
          <button className="primary" onClick={compare} disabled={picked.length !== 2 || busy}>
            Compare
          </button>
        </footer>
      </div>
    </Scrim>
  );
}

// ---------------------------------------------------------------- remote

export function RemoteDialog({
  onClose,
  onOpened,
}: {
  onClose(): void;
  onOpened(result: Opened): void;
}) {
  const [url, setUrl] = useState("http://127.0.0.1:7878");
  const [token, setToken] = useState("");
  const [scans, setScans] = useState<ScanMeta[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connect = () => {
    setBusy(true);
    setError(null);
    api
      .remoteSnapshots(url, token)
      .then(setScans)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  return (
    <Scrim onClose={onClose}>
      <div className="dialog">
        <header>
          <h2>Open a remote snapshot</h2>
          {busy && <span className="spinner" />}
        </header>
        <div className="body">
          {error && <div className="error">{error}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="field">
              <label htmlFor="remote-url">Agent URL</label>
              <input id="remote-url" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="remote-token">Bearer token</label>
              <input
                id="remote-token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="from /etc/spacetrace/token"
              />
            </div>
          </div>
          <button onClick={connect} disabled={busy || !url || !token}>
            List snapshots
          </button>
          <p className="hint" style={{ margin: "10px 0" }}>
            The snapshot is downloaded and opened exactly like a local one. The
            agent only ever reads its machine, so nothing here can change it.
          </p>
          {scans && (
            <SnapshotTable
              scans={scans}
              onPick={(scan) => {
                setBusy(true);
                api
                  .openRemoteSnapshot(url, token, scan.id)
                  .then(onOpened)
                  .catch((err) => setError(errorMessage(err)))
                  .finally(() => setBusy(false));
              }}
            />
          )}
        </div>
        <footer>
          <button onClick={onClose}>Close</button>
        </footer>
      </div>
    </Scrim>
  );
}

// ------------------------------------------------------------------ diff

export function DiffDialog({ view, onClose }: { view: DiffView; onClose(): void }) {
  const growing = view.delta >= 0;
  return (
    <Scrim onClose={onClose}>
      <div className="dialog">
        <header>
          <h2>What changed</h2>
        </header>
        <div className="body">
          <dl className="kv" style={{ gridTemplateColumns: "auto 1fr auto 1fr" }}>
            <dt>From</dt>
            <dd>
              #{view.from.id} {fmt.timestamp(view.from.startedAt)}
            </dd>
            <dt>To</dt>
            <dd>
              #{view.to.id} {fmt.timestamp(view.to.startedAt)}
            </dd>
            <dt>Total</dt>
            <dd>
              {fmt.bytes(view.oldTotal)} → {fmt.bytes(view.newTotal)}
            </dd>
            <dt>Change</dt>
            <dd style={{ color: growing ? "var(--grow)" : "var(--shrink)" }}>
              {fmt.delta(view.delta)}
            </dd>
          </dl>

          {view.changes.length === 0 ? (
            <div className="empty">Nothing changed by more than the threshold.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th className="right">Change</th>
                  <th>Status</th>
                  <th className="right">Now</th>
                  <th>Path</th>
                </tr>
              </thead>
              <tbody>
                {view.changes.map((change) => (
                  <tr key={`${change.kind}-${change.path}`}>
                    <td
                      className="right"
                      style={{ color: change.delta >= 0 ? "var(--grow)" : "var(--shrink)" }}
                    >
                      {fmt.delta(change.delta)}
                    </td>
                    <td style={{ color: "var(--text-dim)" }}>{change.kind}</td>
                    <td className="right">{fmt.bytes(change.newSize)}</td>
                    <td title={change.path}>
                      {fmt.ellipsize(change.path, 52)}
                      {change.isDir ? "/" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="hint" style={{ marginTop: 10 }}>
            Folders that only pass a change through are skipped: the row you see is
            the first level where the change genuinely spreads out.
          </p>
        </div>
        <footer>
          <button onClick={onClose}>Close</button>
        </footer>
      </div>
    </Scrim>
  );
}
