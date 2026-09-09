// The window: what is open, what is selected, what is running, and what just
// happened.
//
// The rule that shapes this file: **work never takes the window away.** A scan
// or a delete leaves everything on screen exactly where it was and reports
// itself in a strip at the top. Two consequences:
//
// * A scan that replaces the open tree only replaces it when it *finishes*. If
//   it is cancelled or fails, the previous scan is still there, still usable.
//
// * Deleting entries does not reload anything. The tree is edited in place in
//   Rust, so the node ids this window is holding stay valid and the folder
//   panel, the map and the zoom level all survive. What comes back is a patch
//   describing what changed, which the panels apply.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  errorMessage,
  isCancelled,
  isStale,
  onScanProgress,
  onTrashProgress,
  type Capacity,
  type DiffView,
  type EntryView,
  type Opened,
  type ScanRequest,
  type ScanTick,
  type StartingPoints,
  type TrashOutcome,
  type TrashTick,
} from "./api";
import {
  basisLabel,
  basisNote,
  totalOf,
  useSizeBasis,
  type SizeBasis,
} from "./basis";
import { CATEGORIES, categoryColor, categoryNote } from "./categories";
import { dict, fill, useDict } from "./i18n";
import { About } from "./About";
import { ContextMenu, type MenuItem, type MenuRequest } from "./ContextMenu";
import { DiffDialog, RemoteDialog, ScanDialog, SnapshotDialog } from "./Dialogs";
import { FolderTree } from "./FolderTree";
import { Inspector } from "./Inspector";
import { Progress, saveWorking, scanWorking, trashWorking, type Working } from "./Progress";
import { DEFAULT_WIDTHS, Resizer, usePaneWidths } from "./Resizer";
import { SaveDialog } from "./SaveDialog";
import { Toasts, useToasts } from "./Toasts";
import { TrashDialog } from "./TrashDialog";
import { Treemap } from "./Treemap";
import * as fmt from "./format";

type Dialog = "scan" | "snapshots" | "remote" | "save" | "about" | null;

export function App() {
  const d = useDict();
  const [opened, setOpened] = useState<Opened | null>(null);
  const [mapRoot, setMapRoot] = useState<number>(0);
  const [crumbs, setCrumbs] = useState<EntryView[]>([]);
  const [selection, setSelection] = useState<number[]>([]);
  const [chosen, setChosen] = useState<EntryView[]>([]);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [diff, setDiff] = useState<DiffView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [working, setWorking] = useState<Working | null>(null);
  const [patch, setPatch] = useState<TrashOutcome | null>(null);
  const [capacity, setCapacity] = useState<Capacity | null>(null);
  const [menu, setMenu] = useState<MenuRequest | null>(null);
  const [confirming, setConfirming] = useState<EntryView[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [database, setDatabase] = useState("");
  const [lastScan, setLastScan] = useState<{ request: ScanRequest; label: string } | null>(
    null,
  );
  const [widths, setWidths] = usePaneWidths();
  const [basis, setBasis] = useSizeBasis();
  const { toasts, show, dismiss } = useToasts();

  useEffect(() => {
    api
      .defaultDatabase()
      .then(setDatabase)
      .catch(() => setDatabase(""));
  }, []);

  const receive = useCallback((result: Opened) => {
    setOpened(result);
    setMapRoot(result.root.node);
    setSelection([]);
    setDialog(null);
    setDiff(null);
    setError(null);
    setPatch(null);
    setCapacity(result.capacity);
  }, []);

  const stopScan = useCallback(() => {
    setWorking((prev) => (prev ? { ...prev, stopping: true } : prev));
    api.cancelScan().catch((err) => setError(errorMessage(err)));
  }, []);

  // Reports from whatever is running. Subscribed once for the lifetime of the
  // window: work can be started from several places and it all reports on the
  // same two channels.
  const [scanLabel, setScanLabel] = useState("");
  useEffect(
    () =>
      onScanProgress((tick: ScanTick) =>
        setWorking((prev) =>
          prev?.kind === "scan"
            ? scanWorking(scanLabel, tick, stopScan, prev.stopping)
            : prev,
        ),
      ),
    [scanLabel, stopScan],
  );

  const [trashTotal, setTrashTotal] = useState(0);
  useEffect(
    () =>
      onTrashProgress((tick: TrashTick) =>
        setWorking((prev) =>
          prev?.kind === "trash" ? trashWorking(trashTotal, tick) : prev,
        ),
      ),
    [trashTotal],
  );

  /** Start a scan without taking the window away while it runs. */
  const runScan = useCallback(
    (request: ScanRequest, label: string) => {
      setDialog(null);
      setError(null);
      // Remembered so Rescan can repeat this scan rather than a default one:
      // dropping the folders the user chose to exclude would silently change
      // what the numbers mean.
      setLastScan({ request, label });
      setScanLabel(label);
      setWorking(scanWorking(label, null, stopScan));

      api
        .scanDirectory(request, basis)
        .then((result) => {
          receive(result);
          if (result.scanErrors > 0) {
            show(
              "info",
              fill(dict().toast.scanned, { folder: label }),
              fill(dict().toast.scannedDetail, {
                count: fmt.count(result.scanErrors),
              }),
            );
          }
        })
        .catch((err) => {
          // Stopping a scan is not a failure; the user just clicked Stop and
          // whatever was open before is still on screen.
          if (isCancelled(err)) {
            show("info", dict().toast.scanStopped, dict().toast.scanStoppedDetail);
            return;
          }
          setError(errorMessage(err));
        })
        .finally(() => setWorking(null));
    },
    [basis, receive, show, stopScan],
  );

  /** Repeat the scan that produced what is open, with the settings it used. */
  const rescan = useCallback(() => {
    if (!opened || opened.source.kind !== "live") return;
    if (lastScan) {
      runScan(lastScan.request, lastScan.label);
      return;
    }
    // Opened before this window remembered anything, e.g. after a reload.
    runScan({ path: opened.source.root }, shortName(opened.source.root));
  }, [opened, lastScan, runScan, basis]);

  // Breadcrumbs follow whatever the map is rooted at.
  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    api
      .ancestors(opened.generation, mapRoot, basis)
      .then((chain) => !cancelled && setCrumbs(chain))
      .catch((err) => {
        if (cancelled || isStale(err)) return;
        setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [opened, mapRoot, patch, basis]);

  // Details for whatever is selected. One request for the whole selection,
  // because it can be hundreds of rows.
  useEffect(() => {
    if (!opened || selection.length === 0) {
      setChosen([]);
      return;
    }
    let cancelled = false;
    api
      .entries(opened.generation, selection, basis)
      .then((views) => !cancelled && setChosen(views))
      .catch((err) => {
        if (cancelled || isStale(err)) return;
        setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [opened, selection, patch, basis]);

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
      if (event.key === "Escape" && selection.length > 0) setSelection([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [crumbs, selection.length]);

  const chain = useMemo(() => crumbs.map((crumb) => crumb.node), [crumbs]);

  // Something was deleted since this scan, so the tree no longer matches the
  // disk and storing it would record a state that never existed. Cleared by
  // `receive`, so a fresh scan can be stored again.
  const edited = !!patch && patch.trashed.length > 0;

  /** Move a selection to the Trash, then patch what is on screen. */
  const trash = useCallback(
    (nodes: number[]) => {
      if (!opened || nodes.length === 0) return;
      setConfirming(null);
      setError(null);
      setTrashTotal(nodes.length);
      setWorking(trashWorking(nodes.length, null));

      api
        .moveToTrash(opened.generation, nodes, basis)
        .then((result) => {
          setPatch(result);
          setOpened((prev) => {
            if (!prev || prev.generation !== result.generation) return prev;
            // The root entry carries the folder list's top row, so it needs
            // the corrected figure too.
            const correctedRoot = result.ancestors.find(
              (entry) => entry.node === prev.root.node,
            );
            return {
              ...prev,
              totalSize: result.totalSize,
              totalAlloc: result.totalAlloc,
              root: correctedRoot ?? prev.root,
            };
          });

          // The map may have been rooted inside something that just went.
          const gone = new Set(result.trashed.map((entry) => entry.node));
          setMapRoot((prev) => {
            if (!gone.has(prev)) return prev;
            return result.trashed.find((entry) => entry.node === prev)?.parent ?? prev;
          });
          setSelection((prev) => prev.filter((node) => !gone.has(node)));
          report(result, show);
        })
        .catch((err) => {
          const message = errorMessage(err);
          setError(message);
          show("failed", dict().toast.couldNotMove, message);
        })
        .finally(() => setWorking(null));
    },
    [opened, show, basis],
  );

  /**
   * Store the open scan.
   *
   * Whether it *may* be stored is the backend's rule, not this button's: a
   * snapshot is already stored, and a tree with deletions applied in place
   * describes no moment that existed on disk. The button is disabled for both,
   * but the refusal is enforced where the data is.
   */
  const saveSnapshot = useCallback(
    (label: string) => {
      if (!opened) return;
      setSaving(true);
      setError(null);
      setWorking(saveWorking(opened.entries));

      api
        .saveSnapshot(database, label)
        .then((saved) => {
          setDialog(null);
          show(
            "done",
            saved.label
              ? fill(dict().toast.storedAsLabel, {
                  label: saved.label,
                  id: saved.scanId,
                })
              : fill(dict().toast.storedAs, { id: saved.scanId }),
            dict().toast.storedDetail,
          );
        })
        .catch((err) => {
          const message = errorMessage(err);
          setError(message);
          show("failed", dict().toast.couldNotStore, message);
        })
        .finally(() => {
          setSaving(false);
          setWorking(null);
        });
    },
    [opened, database, show],
  );

  const refreshCapacity = useCallback(() => {
    if (!opened) return;
    api
      .refreshCapacity(opened.generation)
      .then(setCapacity)
      .catch((err) => {
        if (isStale(err)) return;
        setError(errorMessage(err));
      });
  }, [opened]);

  /** Ask for confirmation before anything is moved. */
  const askToTrash = useCallback(
    (nodes: number[]) => {
      if (!opened || nodes.length === 0) return;
      api
        .entries(opened.generation, nodes, basis)
        .then((views) => {
          if (views.length === 0) {
            show(
              "info",
              dict().toast.nothingLeft,
              dict().toast.nothingLeftDetail,
            );
            return;
          }
          setConfirming(views);
        })
        .catch((err) => setError(errorMessage(err)));
    },
    [opened, show, basis],
  );

  const openMenu = useCallback(
    (entry: EntryView, x: number, y: number) => {
      if (!opened) return;
      const node = entry.node;
      const acting = selection.includes(node) && selection.length > 1 ? selection : [node];
      const items: MenuItem[] = [];

      if (entry.isDir) {
        // No shortcut note: this menu is the only way to re-root the map from
        // the list, on purpose. Double-click here opens the folder instead.
        items.push({
          label: dict().menu.openInMap,
          run: () => setMapRoot(node),
        });
      }
      items.push({
        label: dict().menu.showInFileManager,
        disabled: !opened.canModify,
        run: () =>
          api.reveal(opened.generation, node).catch((err) => {
            const message = errorMessage(err);
            setError(message);
            show("failed", dict().toast.couldNotOpenFileManager, message);
          }),
      });
      items.push({
        label: dict().menu.copyPath,
        run: () =>
          api
            .absolutePath(opened.generation, node)
            .then((path) => copyToClipboard(path))
            .then(() => show("done", dict().toast.pathCopied))
            .catch(() =>
              show(
                "failed",
                dict().toast.couldNotCopy,
                dict().toast.couldNotCopyDetail,
              ),
            ),
      });
      items.push({
        label:
          acting.length > 1
            ? fill(dict().menu.moveManyToTrash, { count: acting.length })
            : dict().menu.moveToTrash,
        danger: true,
        separated: true,
        disabled: !opened.canModify || !!working,
        run: () => askToTrash(acting),
      });

      setMenu({ x, y, items });
    },
    [opened, selection, working, askToTrash, show],
  );

  return (
    <div className="app">
      <div className="toolbar">
        <div className="brand">
          <strong>spacetrace</strong>
          <span>{d.toolbar.tagline}</span>
        </div>
        <button onClick={() => setDialog("scan")}>{d.toolbar.scanFolder}</button>
        <button onClick={() => setDialog("snapshots")}>{d.toolbar.snapshots}</button>
        <button onClick={() => setDialog("remote")}>{d.toolbar.remoteAgent}</button>
        <div className="spacer" />
        {opened?.source.kind === "live" && (
          <button
            className="ghost"
            onClick={rescan}
            disabled={!!working}
            title={d.toolbar.rescanTitle}
          >
            {d.toolbar.rescan}
          </button>
        )}
        {opened?.source.kind === "live" && (
          <button
            className="ghost"
            onClick={() => setDialog("save")}
            disabled={!!working || edited}
            title={
              edited ? d.toolbar.saveBlockedTitle : d.toolbar.saveSnapshotTitle
            }
          >
            {d.toolbar.saveSnapshot}
          </button>
        )}
        {opened && (
          <button
            className="ghost"
            onClick={() => setMapRoot(opened.root.node)}
            disabled={mapRoot === opened.root.node}
            title={d.toolbar.resetZoomTitle}
          >
            {d.toolbar.resetZoom}
          </button>
        )}
        {opened && <BasisSwitch basis={basis} onChange={setBasis} busy={!!working} />}
        <button
          className="ghost"
          onClick={() => setDialog("about")}
          title={d.toolbar.aboutTitle}
        >
          {d.toolbar.about}
        </button>
        {capacity && (
          <CapacityChip
            capacity={capacity}
            live={opened?.source.kind === "live"}
            onRefresh={refreshCapacity}
          />
        )}
      </div>

      {opened ? <div className="source-line">{describe(opened, basis)}</div> : <div />}

      {working ? <Progress {...working} /> : <div />}

      {!opened ? (
        <Welcome
          busy={!!working}
          onScanPath={(path, label) => runScan({ path }, label)}
          onScan={() => setDialog("scan")}
          onSnapshots={() => setDialog("snapshots")}
          onRemote={() => setDialog("remote")}
        />
      ) : (
        <div
          className="workspace"
          style={{
            ["--w-sidebar" as string]: `${widths.sidebar}px`,
            ["--w-inspector" as string]: `${widths.inspector}px`,
          }}
        >
          <div className="sidebar">
            <FolderTree
              generation={opened.generation}
              root={opened.root}
              selection={selection}
              mapRoot={mapRoot}
              chain={chain}
              patch={patch}
              basis={basis}
              onSelectionChange={setSelection}
              onContextMenu={openMenu}
            />
          </div>

          <Resizer
            pane="sidebar"
            width={widths.sidebar}
            direction={1}
            label={d.tree.sidebarWidth}
            onResize={(sidebar) => setWidths({ ...widths, sidebar })}
            onReset={() => setWidths({ ...widths, sidebar: DEFAULT_WIDTHS.sidebar })}
          />

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
                    {crumb.name || shortName(opened.source.root)}
                  </button>
                </span>
              ))}
              <span style={{ flex: 1 }} />
              <span className="hint" style={{ paddingRight: 4, whiteSpace: "nowrap" }}>
                {d.map.crumbHint}
              </span>
            </div>

            {error && (
              <div className="error" style={{ margin: "8px 12px 0" }}>
                {error}
              </div>
            )}

            <Treemap
              generation={opened.generation}
              root={mapRoot}
              selection={selection}
              revision={patch}
              basis={basis}
              onSelect={(node) => setSelection([node])}
              onZoom={setMapRoot}
            />

            <Legend />
          </div>

          <Resizer
            pane="inspector"
            width={widths.inspector}
            direction={-1}
            label={d.tree.inspectorWidth}
            onResize={(inspector) => setWidths({ ...widths, inspector })}
            onReset={() => setWidths({ ...widths, inspector: DEFAULT_WIDTHS.inspector })}
          />

          <div className="inspector">
            <Inspector
              opened={opened}
              entries={chosen}
              basis={basis}
              busy={!!working}
              onReveal={(node) =>
                api.reveal(opened.generation, node).catch((err) => {
                  const message = errorMessage(err);
                  setError(message);
                  show("failed", dict().toast.couldNotOpenFileManager, message);
                })
              }
              onTrash={askToTrash}
            />
          </div>
        </div>
      )}

      {menu && <ContextMenu request={menu} onClose={() => setMenu(null)} />}

      {confirming && (
        <TrashDialog
          entries={confirming}
          busy={!!working}
          onCancel={() => setConfirming(null)}
          onConfirm={() => trash(confirming.map((entry) => entry.node))}
        />
      )}

      {dialog === "scan" && <ScanDialog onClose={() => setDialog(null)} onStart={runScan} />}
      {dialog === "save" && opened && (
        <SaveDialog
          opened={opened}
          db={database}
          busy={saving}
          onConfirm={saveSnapshot}
          onCancel={() => setDialog(null)}
        />
      )}
      {dialog === "snapshots" && (
        <SnapshotDialog
          basis={basis}
          onClose={() => setDialog(null)}
          onOpened={receive}
          onDiff={(view) => {
            setDialog(null);
            setDiff(view);
          }}
        />
      )}
      {dialog === "remote" && (
        <RemoteDialog
          basis={basis}
          onClose={() => setDialog(null)}
          onOpened={receive}
        />
      )}
      {dialog === "about" && <About onClose={() => setDialog(null)} />}
      {diff && <DiffDialog view={diff} onClose={() => setDiff(null)} />}

      <Toasts toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

/**
 * Say what happened, including the parts that did not work.
 *
 * A batch can partly fail, and reporting only the failure would be a lie about
 * the entries that went — while reporting only the success would hide the ones
 * still sitting there.
 */
function report(
  result: TrashOutcome,
  show: (kind: "done" | "failed" | "info", text: string, detail?: string) => void,
) {
  const moved = result.trashed.length;
  // Allocated blocks, not logical bytes, and not the measure the window is
  // reading by: this sentence is about space, and only one of the two figures
  // is about space.
  const freed = result.trashed.reduce((sum, entry) => sum + entry.alloc, 0);

  const d = dict();

  if (moved > 0) {
    const what =
      moved === 1
        ? fill(d.toast.inTrashOne, { name: result.trashed[0]?.name ?? "" })
        : fill(d.toast.inTrashMany, { count: moved });
    const redundant =
      result.redundant > 0
        ? fill(d.toast.redundantDetail, { count: result.redundant })
        : "";
    show(
      "done",
      what,
      // Said explicitly, because it is the thing people get wrong: the folder
      // is smaller, the disk is not. The Trash is on the same filesystem.
      `${fill(d.toast.freedDetail, { size: fmt.bytes(freed) })}${redundant}`,
    );
  }

  if (result.failed.length > 0) {
    const first = result.failed[0];
    show(
      "failed",
      result.failed.length === 1
        ? fill(d.toast.stayedOne, { name: first?.name || d.toast.stayedUnnamed })
        : fill(d.toast.stayedMany, {
            failed: result.failed.length,
            total: moved + result.failed.length,
          }),
      first?.reason,
    );
  }

  if (moved === 0 && result.failed.length === 0 && result.redundant > 0) {
    show("info", d.toast.nothingToMove, d.toast.nothingToMoveDetail);
  }
}

/**
 * Copy text, trying the modern API first.
 *
 * `navigator.clipboard` needs a secure context and a focused document, and the
 * three webviews this ships on do not agree about when that holds — so the old
 * command is kept as a fallback rather than assumed dead.
 */
async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Fall through.
  }
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  try {
    field.select();
    if (!document.execCommand("copy")) throw new Error("the copy command was refused");
  } finally {
    document.body.removeChild(field);
  }
}

/**
 * Free out of total, with a bar for how much is left.
 *
 * Free rather than "percent full" because where space is shared between volumes
 * — APFS, btrfs, thin LVM — `total - free` includes the neighbours and
 * disagrees with `df` for the same mount.
 */
/**
 * The measure everything on screen is drawn from.
 *
 * In the toolbar and always readable, never a setting buried in a menu: every
 * figure in the window depends on it, and a number whose meaning is hidden is
 * the thing this app is supposed not to do. Two named options rather than a
 * checkbox, because "on disk" and "logical" are both real answers and neither
 * is the absence of the other.
 */
function BasisSwitch({
  basis,
  busy,
  onChange,
}: {
  basis: SizeBasis;
  /** Work in flight; the requests it would fire are already queued. */
  busy: boolean;
  onChange(basis: SizeBasis): void;
}) {
  const d = useDict();
  const options: SizeBasis[] = ["on_disk", "logical"];
  return (
    <div className="basis" role="group" aria-label={d.basis.measureBy}>
      {options.map((option) => (
        <button
          key={option}
          className={option === basis ? "on" : undefined}
          aria-pressed={option === basis}
          disabled={busy}
          title={basisNote(option)}
          onClick={() => onChange(option)}
        >
          {basisLabel(option)}
        </button>
      ))}
    </div>
  );
}

function CapacityChip({
  capacity,
  live,
  onRefresh,
}: {
  capacity: Capacity;
  live: boolean;
  onRefresh(): void;
}) {
  const d = useDict();
  const free = capacity.total > 0 ? capacity.available / capacity.total : 0;
  const band = free < 0.05 ? "critical" : free < 0.12 ? "tight" : "";
  return (
    <button
      className={`capacity ${band}`}
      onClick={onRefresh}
      disabled={!live}
      title={
        live ? d.capacity.liveTitle : d.capacity.snapshotTitle
      }
    >
      <span className="meter">
        <i style={{ width: `${Math.max(free * 100, 1.5)}%` }} />
      </span>
      <b>{fmt.bytes(capacity.available)}</b>
      <span>{fill(d.capacity.freeOf, { total: fmt.bytes(capacity.total) })}</span>
    </button>
  );
}

function Legend() {
  const d = useDict();
  return (
    <div className="legend">
      {CATEGORIES.filter((name) => name !== "directory").map((name) => (
        <span className="item" key={name} title={categoryNote(name)}>
          <span className="swatch" style={{ background: categoryColor(name) }} />
          {name}
        </span>
      ))}
      <span style={{ flex: 1 }} />
      <span>{d.map.moreInside}</span>
    </div>
  );
}

function shortName(root: string): string {
  const parts = root.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? root;
}

function describe(opened: Opened, basis: SizeBasis) {
  const d = dict();
  return (
    <>
      {opened.source.kind === "live" ? (
        <span className="badge live">{d.source.liveScan}</span>
      ) : (
        <>
          <span className="badge snapshot">
            {fill(d.source.snapshot, {
              id: opened.source.scanId,
              when: fmt.relativeTime(opened.source.startedAt),
            })}
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
      {/* Both totals, always, with the one being drawn by given the emphasis.
          Showing only the active measure would leave a reader unable to tell a
          sparse disk from a full one; showing them with equal weight leaves
          them unable to tell which the map is built from. */}
      <span style={{ color: "var(--text-faint)" }}>
        <b className="num" style={{ color: "var(--text)" }}>
          {fmt.bytes(totalOf(opened, basis))}
        </b>{" "}
        {basisLabel(basis).toLocaleLowerCase()} ·{" "}
        <span className="num">
          {fmt.bytes(basis === "on_disk" ? opened.totalSize : opened.totalAlloc)}
        </span>{" "}
        {basisLabel(basis === "on_disk" ? "logical" : "on_disk").toLocaleLowerCase()} ·{" "}
        <span className="num">{fmt.count(opened.root.files)}</span> {d.source.files} ·{" "}
        <span className="num">{fmt.count(opened.entries)}</span> {d.source.entries}
      </span>
      {opened.scanErrors > 0 && (
        <span className="badge warn" title={d.source.unreadableTitle}>
          {fill(d.source.unreadable, { count: fmt.count(opened.scanErrors) })}
        </span>
      )}
    </>
  );
}

/**
 * The opening screen.
 *
 * It leads with the disk and with folders that can be scanned in one click,
 * because that is what almost everyone opening a disk analyser came to do.
 * Sending them to a directory chooser to reach `~/Downloads` is a step that
 * buys nothing.
 */
function Welcome({
  busy,
  onScanPath,
  onScan,
  onSnapshots,
  onRemote,
}: {
  busy: boolean;
  onScanPath(path: string, label: string): void;
  onScan(): void;
  onSnapshots(): void;
  onRemote(): void;
}) {
  const d = useDict();
  const [points, setPoints] = useState<StartingPoints | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .startingPoints()
      .then((result) => !cancelled && setPoints(result))
      .catch(() => {
        /* The buttons below still work; only the shortcuts are missing. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const volume = points?.homeVolume ?? null;
  const free = volume && volume.total > 0 ? volume.available / volume.total : 0;
  const band = free < 0.05 ? "critical" : free < 0.12 ? "tight" : "";

  return (
    <div className="welcome">
      <div className="welcome-inner">
        <h1>{d.welcome.headline}</h1>
        <p>{d.welcome.lede}</p>

        {volume && (
          <div className={`volume ${band}`}>
            <div className="head">
              <b>{fill(d.welcome.free, { size: fmt.bytes(volume.available) })}</b>
              <span>
                {fill(d.welcome.ofTotal, { total: fmt.bytes(volume.total) })}
              </span>
            </div>
            <div className="meter">
              <i style={{ width: `${Math.max(free * 100, 1.5)}%` }} />
            </div>
          </div>
        )}

        {points && points.targets.length > 0 && (
          <div className="targets">
            {points.targets.map((target) => (
              <button
                key={target.path}
                className="target"
                disabled={busy}
                onClick={() => onScanPath(target.path, target.name)}
                title={target.path}
              >
                <span className="icon">
                  <span className="folder" />
                </span>
                <span className="label">
                  <b>
                    {target.name}
                    {/* Beside the name rather than across the row: the note
                        qualifies the name, and pushing it to the far edge made
                        it read as an unrelated column. */}
                    {target.note && <em>{target.note}</em>}
                  </b>
                  <span>{target.path}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="primary" onClick={onScan} disabled={busy}>
            {d.welcome.scanAnother}
          </button>
          <button onClick={onSnapshots}>{d.welcome.storedSnapshots}</button>
          <button onClick={onRemote}>{d.welcome.remoteAgent}</button>
        </div>

        <p className="hint" style={{ marginTop: 22, maxWidth: "60ch" }}>
          {d.welcome.promise}
        </p>
      </div>
    </div>
  );
}
