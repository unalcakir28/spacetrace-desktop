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
//   **That is about a refresh, not about every scan.** Asking for a different
//   folder replaces what is open whichever way this goes, so the window shows
//   that scan filling in — the same folder list, map and inspector a finished
//   scan gets, over a tree that grows every second — rather than holding a map
//   of somewhere else until the end. Only `Rescan`, which asks for the folder
//   already on screen, keeps it. A scan being watched is refused every
//   destructive action, because every figure in it is partial.
//   `SCAN_VIEW_MS` below is how often it is asked.
//
// * Deleting entries does not reload anything. The tree is edited in place in
//   Rust, so the node ids this window is holding stay valid and the folder
//   panel, the map and the zoom level all survive. What comes back is a patch
//   describing what changed, which the panels apply.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
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
  type AgeProfile,
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
import { bandColor, bandLabel, bucketBytes, unknownBytes } from "./age";
import { CATEGORIES, categoryColor, categoryNote } from "./categories";
import { dict, fill, useDict } from "./i18n";
import { About } from "./About";
import { UpdateBar } from "./UpdateBar";
import { ContextMenu, type MenuItem, type MenuRequest } from "./ContextMenu";
import { DiffDialog, RemoteDialog, ScanDialog, SnapshotDialog } from "./Dialogs";
import { HistoryDialog } from "./Timeline";
import { FolderTree } from "./FolderTree";
import { Inspector } from "./Inspector";
import { Progress, saveWorking, scanWorking, trashWorking, type Working } from "./Progress";
import { DEFAULT_WIDTHS, Resizer, usePaneWidths } from "./Resizer";
import { SaveDialog } from "./SaveDialog";
import { Toasts, useToasts } from "./Toasts";
import { TrashDialog } from "./TrashDialog";
import { Sunburst } from "./Sunburst";
import { TabBar } from "./TabBar";
import { HOME_ID, useTabs } from "./tabs";
import { Treemap } from "./Treemap";
import * as fmt from "./format";

type Dialog = "scan" | "snapshots" | "history" | "remote" | "save" | "about" | null;

/** What the map's colours stand for. */
type ColorMode = "category" | "age";

/**
 * Which shape the same tree is drawn in.
 *
 * Not remembered between sessions, like the colour mode and unlike the basis:
 * the treemap answers "what is taking up the space" and the rings answer "how
 * is this nested", and neither is a setting so much as a question asked of the
 * folder in front of you.
 */
type ViewShape = "map" | "rings";

/**
 * How often the view of a running scan is refreshed.
 *
 * Slower than the progress strip's own tick, and for the reason the live
 * preview before it gave: the strip proves something is moving and wants to be
 * immediate, while this is read by comparing rectangles, and a map that relays
 * itself eight times a second is harder to follow than one that settles. It
 * also costs something real at the other end — a copy of the scanner's arena
 * per refresh, measured at 12–26 ms on a 2.3M-entry home directory — so the
 * interval is the price as much as the pace.
 */
const SCAN_VIEW_MS = 700;

export function App() {
  const d = useDict();

  /**
   * One scan per tab, and everything that describes a scan lives in its tab.
   *
   * The shims under here keep the rest of this file talking about `opened`,
   * `mapRoot` and `selection` as single values, because from the point of view
   * of the panels that is what they are: whatever the reader is looking at. The
   * tab is where they are *kept*, so switching away and back is not a reload,
   * and a scan landing in a tab nobody is watching does not disturb the one in
   * front.
   */
  const tabs = useTabs(d.tabs.home);
  const { active, activeId } = tabs;
  const opened = active.opened;
  const mapRoot = active.mapRoot;
  const crumbs = active.crumbs;
  const selection = active.selection;
  const chosen = active.chosen;
  const patch = active.patch;
  const capacity = active.capacity;
  const liveRevision = active.liveRevision;
  const lastScan = active.lastScan;

  const { update, open, close, select, adopt } = tabs;
  const patchActive = useCallback(
    (change: Parameters<typeof update>[1]) => update(activeId, change),
    [update, activeId],
  );
  const setMapRoot = useCallback(
    (value: number) => patchActive({ mapRoot: value }),
    [patchActive],
  );
  const setSelection = useCallback(
    (value: number[] | ((prev: number[]) => number[])) =>
      patchActive((tab) => ({
        selection: typeof value === "function" ? value(tab.selection) : value,
      })),
    [patchActive],
  );
  const setChosen = useCallback(
    (value: EntryView[]) => patchActive({ chosen: value }),
    [patchActive],
  );

  const [dialog, setDialog] = useState<Dialog>(null);
  const [diff, setDiff] = useState<DiffView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [working, setWorking] = useState<Working | null>(null);
  // `liveRevision` is bumped every time a running scan's view is taken. The
  // generation cannot do that job: it deliberately stays put across a scan so
  // the window keeps its place, which leaves nothing to tell the panels that
  // the numbers behind their ids have changed. This is that signal, and it is
  // the same one an in-place edit uses.
  /**
   * Whether the scan that is running should be watched as it fills in.
   *
   * False only for a deliberate refresh of what is already open — see
   * `runScan`. It is the reason the scan was started, not a comparison of
   * paths: two spellings of one folder are the same scan to a person and
   * different strings here.
   */
  const [watchLive, setWatchLive] = useState(true);
  const [menu, setMenu] = useState<MenuRequest | null>(null);
  const [confirming, setConfirming] = useState<EntryView[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [database, setDatabase] = useState("");
  const [widths, setWidths] = usePaneWidths();
  const [basis, setBasis] = useSizeBasis();
  // Not remembered between sessions, unlike the basis. The basis changes what
  // every number in the window means and a person picks it once; the colour
  // mode is a question asked of the folder in front of you, and starting a new
  // window in it would present a map whose colours mean something the reader
  // did not ask about.
  const [colorBy, setColorBy] = useState<ColorMode>("category");
  const [shape, setShape] = useState<ViewShape>("map");
  const { toasts, show, dismiss } = useToasts();

  useEffect(() => {
    api
      .defaultDatabase()
      .then(setDatabase)
      .catch(() => setDatabase(""));
  }, []);

  const receive = useCallback(
    (tab: number, result: Opened) => {
      // Before the tab is told anything: this is where the tree the tab was
      // showing stops being shown, and where a result whose tab has already
      // been closed is turned away and freed. Nothing below runs in that case
      // — there is no tab left to put it in.
      if (!adopt(tab, result.generation)) return;

      update(tab, {
        opened: result,
        mapRoot: result.root.node,
        selection: [],
        patch: null,
        capacity: result.capacity,
        // The title is not touched here. It was set when the tab was opened,
        // from the name the reader clicked — "Macintosh HD", not "/" — and a
        // result arriving is no reason to replace a name with a path.
      });
      setDialog(null);
      setDiff(null);
      setError(null);
    },
    [update, adopt],
  );

  /**
   * Take a view of the tree the ids in it already belong to.
   *
   * The difference from `receive` is everything it does *not* do. A refresh of
   * a running scan arrives with the generation the window already has, because
   * the scanner's arena only grows and an id keeps naming the same entry — so
   * the folder somebody opened, the entry they selected and the rectangle they
   * zoomed into all survive, and only the figures move. Calling `receive` here
   * instead would reset the window to the root once a second, which is the same
   * as not being able to use it at all.
   */
  const refresh = useCallback(
    (tab: number, result: Opened) => {
      update(tab, (prev) => ({
        opened: result,
        capacity: result.capacity,
        // What tells the panels to fetch their rows and their layout again:
        // the tree behind these ids is not the one they last read.
        liveRevision: prev.liveRevision + 1,
      }));
    },
    [update],
  );

  /**
   * Which tab the running scan belongs to, and which tree it has produced.
   *
   * Refs rather than state, for two different reasons. The tab is a ref because
   * a scan must keep landing where it was started even after the reader has
   * switched tabs, and re-rendering on that would be pointless. The generation
   * is a ref because it changes on the scan's first answer, and depending on it
   * would tear the poll's interval down and build it again on every tick.
   */
  const scanTab = useRef<number | null>(null);
  const scanGeneration = useRef<number | undefined>(undefined);

  // Watch the scan fill the window in.
  //
  // For every scan except a deliberate refresh of what is already open, which
  // keeps its map: the rule at the top of this file. The first answer is a
  // different tree and goes through `receive`; every one after it carries the
  // generation this window already has and goes through `refresh`, which is
  // what keeps the reader's place.
  //
  // `null` is the ordinary answer before the walk has read its own root, and
  // again in the moment between the scan ending and its result arriving. It is
  // not an error and it does not stop the loop — the scan's own promise is what
  // ends this, by clearing `working`.
  const live = !!working && working.kind === "scan";
  const liveTarget = watchLive || !opened || opened.source.kind === "scanning";
  useEffect(() => {
    if (!live || !liveTarget) return;
    let cancelled = false;

    const pull = () => {
      const tab = scanTab.current;
      if (tab === null) return;
      api
        .scanView(basis)
        .then((view) => {
          if (cancelled || !view) return;
          if (view.generation === scanGeneration.current) {
            refresh(tab, view);
            return;
          }
          scanGeneration.current = view.generation;
          receive(tab, view);
        })
        // A refresh that could not be fetched leaves what is on screen alone.
        // The scan is still running, the strip above is still reporting it, and
        // there is nothing here for a reader to do.
        .catch(() => {});
    };

    pull();
    const timer = window.setInterval(pull, SCAN_VIEW_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [live, liveTarget, basis, receive, refresh]);

  /**
   * Close a tab, and stop the scan that was filling it.
   *
   * `close` gives the tree back; this is the other half — the walk itself. A
   * scan whose tab is gone has nobody left to show it and would carry on
   * reading the disk to the end regardless, which on a full volume is minutes
   * of a busy machine for a window that has moved on.
   *
   * Guarded on the tab rather than on "is anything running": `cancelScan` stops
   * whatever is running and cannot be told which, and `scanTab` is the window's
   * own record of whose that is.
   */
  const closeTab = useCallback(
    (id: number) => {
      // `scanTab` is left alone: the scan's own `finally` is what clears the
      // progress bar, and it checks that ref to know the answer is still its
      // own. Clearing it here would stop the scan and leave the bar running.
      if (scanTab.current === id) api.cancelScan().catch(() => {});
      close(id);
    },
    [close],
  );

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

  /**
   * Start a scan.
   *
   * **A new scan is a new tab; a rescan is the same tab.** That is the whole of
   * `refreshing`, and it decides two things at once. It decides where the
   * result lands, and it decides whether the window shows the scan filling in:
   * asking for a *different* folder means the map in front of you is about to
   * be replaced whatever happens — so it gets a tab of its own and is watched
   * as it builds, rather than leaving stale figures about somewhere else on
   * screen and then jumping. Asking for the *same* folder again is the case the
   * rule at the top of this file is about: that map is still a true answer
   * while the new one is built, so it stays exactly where it is.
   */
  const runScan = useCallback(
    (request: ScanRequest, label: string, refreshing = false) => {
      setDialog(null);
      setError(null);
      setWatchLive(!refreshing);

      const tab = refreshing ? activeId : open(label);
      scanTab.current = tab;
      // Cleared rather than kept: the next answer belongs to a tree this tab
      // has never seen, and comparing it against the last scan's generation
      // would take the first view of a new scan for a refresh of an old one.
      scanGeneration.current = refreshing ? active.opened?.generation : undefined;
      // Remembered so Rescan can repeat this scan rather than a default one:
      // dropping the folders the user chose to exclude would silently change
      // what the numbers mean.
      update(tab, { lastScan: { request, label }, title: label });
      setScanLabel(label);
      setWorking(scanWorking(label, null, stopScan));

      api
        .scanDirectory(request, basis)
        .then((result) => {
          receive(tab, result);
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
        .finally(() => {
          // Only if this is still the scan being tracked. Starting a scan
          // cancels the one before it, and a cancelled scan's promise settles
          // *after* its replacement has already claimed these — without the
          // check, the older scan's teardown clears the progress strip and the
          // polling loop of the scan that is still running.
          if (scanTab.current !== tab) return;
          setWorking(null);
          scanTab.current = null;
        });
    },
    [basis, receive, show, stopScan, open, update, activeId, active.opened?.generation],
  );

  /**
   * Put a tree that arrived from somewhere else — a stored snapshot, an agent —
   * in a tab of its own.
   *
   * The same reasoning as a scan of a different folder: it replaces nothing, so
   * it takes nothing away.
   */
  const openInNewTab = useCallback(
    (result: Opened) => {
      const tab = open(shortName(result.source.root));
      receive(tab, result);
    },
    [open, receive],
  );

  /** Repeat the scan that produced what is open, with the settings it used. */
  const rescan = useCallback(() => {
    if (!opened || opened.source.kind !== "live") return;
    if (lastScan) {
      runScan(lastScan.request, lastScan.label, true);
      return;
    }
    // Opened before this window remembered anything, e.g. after a reload.
    runScan({ path: opened.source.root }, shortName(opened.source.root), true);
  }, [opened, lastScan, runScan, basis]);

  // Breadcrumbs follow whatever the map is rooted at.
  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    api
      .ancestors(opened.generation, mapRoot, basis)
      .then((chain) => !cancelled && patchActive({ crumbs: chain }))
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

  /**
   * What the map compares to decide its layout is stale.
   *
   * Two things change the tree behind ids that did not move: an entry going to
   * the Trash, and a refresh of a running scan. They cannot happen at once — a
   * scan's view refuses every edit — so one value carries both.
   *
   * **`unknown` is the accurate type, not a shrug.** Nothing reads this: it is
   * compared by identity in a dependency array, and that is the whole contract.
   * The obvious tidy-up is to make it one counter bumped by both events — and
   * that is wrong, because the folder panel must not be included. It takes
   * `liveRevision` on its own precisely so a delete does not reload it: a
   * delete is applied in place from `patch`, which is the rule at the top of
   * this file. One counter for both would reload the tree on every deletion.
   */
  const revision: unknown = patch ?? liveRevision;

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
          patchActive({ patch: result });
          // The map may have been rooted inside something that just went.
          const gone = new Set(result.trashed.map((entry) => entry.node));
          patchActive((tab) => {
            const prev = tab.opened;
            if (!prev || prev.generation !== result.generation) return {};
            // The root entry carries the folder list's top row, so it needs
            // the corrected figure too.
            const correctedRoot = result.ancestors.find(
              (entry) => entry.node === prev.root.node,
            );
            return {
              opened: {
                ...prev,
                totalSize: result.totalSize,
                totalAlloc: result.totalAlloc,
                root: correctedRoot ?? prev.root,
              },
              mapRoot: gone.has(tab.mapRoot)
                ? result.trashed.find((entry) => entry.node === tab.mapRoot)?.parent ??
                  tab.mapRoot
                : tab.mapRoot,
              selection: tab.selection.filter((node) => !gone.has(node)),
            };
          });
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
        .saveSnapshot(opened.generation, database, label)
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
      .then((fresh) => patchActive({ capacity: fresh }))
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

  /**
   * Open a menu under the control that asked for it.
   *
   * The same menu the right-click uses, measured and clamped by the same code.
   * A second popover implementation would be a second set of keyboard, focus
   * and off-screen bugs to find.
   */
  const openUnder = useCallback((anchor: HTMLElement, items: MenuItem[]) => {
    const box = anchor.getBoundingClientRect();
    setMenu({ x: box.left, y: box.bottom + 4, items });
  }, []);

  /**
   * What can be done to the tree that is open, as opposed to the app.
   *
   * One list, shown in three places: as buttons on the line that says what is
   * open, at the foot of the right-click menu, and — for History, the only one
   * that does not need a scan — on the opening screen. They were behind a `⋯`
   * in exactly one of those and nowhere else, which is the version of a command
   * you have to already know about in order to find.
   */
  const scanActions: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = [];
    if (opened?.source.kind === "live") {
      items.push({ label: d.toolbar.rescan, disabled: !!working, run: rescan });
      items.push({
        label: d.toolbar.saveSnapshot,
        // A disabled control with no reason beside it is the version of this
        // that gets reported as a bug. As a button the note is its tooltip; in
        // the menu it is the note.
        ...(edited ? { note: d.toolbar.saveBlockedNote } : {}),
        disabled: !!working || edited,
        run: () => setDialog("save"),
      });
    }
    if (opened) {
      items.push({ label: d.toolbar.history, run: () => setDialog("history") });
    }
    return items;
  }, [opened, working, edited, rescan, d]);

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

      // The same commands as the buttons above the map. A right-click is where
      // a lot of people look first, and until now it offered everything that
      // could be done to an *entry* and nothing that could be done to the scan
      // the entry is in.
      scanActions.forEach((action, index) => {
        items.push({ ...action, ...(index === 0 ? { separated: true } : {}) });
      });

      setMenu({ x, y, items });
    },
    [opened, selection, working, askToTrash, show, scanActions],
  );

  return (
    <div className="app">
      {/* Only the app and where a tree comes from. Anything that changes what
          is *on* screen lives beside the thing it changes: which measure the
          figures are in is on the line that prints them, and how the picture
          is drawn is on the picture. A row that held all three was fourteen
          controls wide and wrapped onto three lines at this window's width,
          with "open a different disk" sitting at the same weight as "draw the
          same data as rings". */}
      <div className="toolbar">
        <strong className="brand">spacetrace</strong>

        {/* The other two sources are behind the caret rather than beside it:
            scanning a folder is what nearly every session starts with, and a
            snapshot or an agent is the exception that can afford a click. */}
        <div className="split">
          <button onClick={() => setDialog("scan")}>{d.toolbar.scanFolder}</button>
          <button
            className="caret"
            aria-label={d.toolbar.otherSources}
            title={d.toolbar.otherSources}
            onClick={(event) =>
              openUnder(event.currentTarget, [
                { label: d.toolbar.snapshots, run: () => setDialog("snapshots") },
                { label: d.toolbar.remoteAgent, run: () => setDialog("remote") },
              ])
            }
          >
            <Caret />
          </button>
        </div>

        <div className="spacer" />

        {capacity && (
          <CapacityChip
            capacity={capacity}
            live={opened?.source.kind === "live"}
            onRefresh={refreshCapacity}
          />
        )}
        <button
          className="ghost"
          onClick={() => setDialog("about")}
          title={d.toolbar.aboutTitle}
        >
          {d.toolbar.about}
        </button>
      </div>

      <TabBar
        tabs={tabs.tabs}
        activeId={activeId}
        onSelect={select}
        onClose={closeTab}
        onNew={() => {
          select(HOME_ID);
          setDialog("scan");
        }}
      />

      <UpdateBar />

      {opened ? (
        <SourceBar
          opened={opened}
          basis={basis}
          busy={!!working}
          onBasis={setBasis}
          actions={scanActions}
        />
      ) : (
        <div />
      )}

      {working ? <Progress {...working} /> : <div />}

      {!opened ? (
        active.kind === "home" ? (
          <Welcome
            busy={!!working}
            onScanPath={(path, label) => runScan({ path }, label)}
            onScan={() => setDialog("scan")}
            onSnapshots={() => setDialog("snapshots")}
            onRemote={() => setDialog("remote")}
            onHistory={() => setDialog("history")}
          />
        ) : (
          // A scan tab before its first view has landed. Showing the opening
          // screen here would offer a new scan inside the tab that is already
          // running one.
          <div className="starting">
            <span className="pulse" />
            <p>{fill(d.tabs.startingIn, { folder: active.title })}</p>
          </div>
        )
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
              revision={liveRevision}
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
              {/* The trail scrolls inside the row rather than the row itself:
                  a deep path used to push everything after it off the end, and
                  the first crumb is also what "reset zoom" used to be. */}
              <div className="trail">
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
              </div>
              <span className="hint">{d.map.crumbHint}</span>
              <ShapeSwitch shape={shape} onChange={setShape} />
            </div>

            {error && (
              <div className="error" style={{ margin: "8px 12px 0" }}>
                {error}
              </div>
            )}

            {shape === "rings" ? (
              <Sunburst
                generation={opened.generation}
                root={mapRoot}
                selection={selection}
                revision={revision}
                basis={basis}
                colorBy={colorBy}
                onSelect={(node) => setSelection([node])}
                onZoom={setMapRoot}
              />
            ) : (
              <Treemap
                generation={opened.generation}
                root={mapRoot}
                selection={selection}
                revision={revision}
                basis={basis}
                colorBy={colorBy}
                onSelect={(node) => setSelection([node])}
                onZoom={setMapRoot}
              />
            )}

            {colorBy === "age" ? (
              <AgeLegend generation={opened.generation} node={mapRoot} basis={basis}>
                <ColorSwitch mode={colorBy} onChange={setColorBy} />
              </AgeLegend>
            ) : (
              <Legend>
                <ColorSwitch mode={colorBy} onChange={setColorBy} />
              </Legend>
            )}
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
          onOpened={openInNewTab}
          onHistory={() => setDialog("history")}
          onDiff={(view) => {
            setDialog(null);
            setDiff(view);
          }}
        />
      )}
      {dialog === "history" && (
        <HistoryDialog
          basis={basis}
          focus={
            opened
              ? {
                  root: opened.source.root,
                  host: opened.source.kind === "snapshot" ? opened.source.host : undefined,
                }
              : undefined
          }
          onClose={() => setDialog(null)}
          onOpened={openInNewTab}
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
          onOpened={openInNewTab}
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
      first ? errorMessage(first.reason) : undefined,
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

function Legend({ children }: { children?: React.ReactNode }) {
  const d = useDict();
  return (
    <div className="legend">
      {children}
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


/**
 * The heat map's key: one swatch per band with the bytes in it.
 *
 * Scoped to the folder the map is rooted at, and reloaded when the zoom moves,
 * so the numbers are always about the picture beside them. A key describing
 * the whole scan while the map shows one folder would look like it agreed.
 *
 * Shown with figures rather than as a bare ramp because the ramp alone cannot
 * answer the question the feature exists for. "Red is old" is not actionable;
 * "48 GB is older than two years" is.
 */

/**
 * What the map's colours stand for.
 *
 * Beside the basis switch rather than in a menu, and for the same reason: a
 * map whose colours mean something other than what the reader assumes is the
 * failure this app is built to avoid. The two switches also compose — "on
 * disk" plus "age" is the combination that answers "what is actually costing
 * me space and has nobody touched it", which is the question behind most of
 * the reasons anyone opens a disk tool.
 */

/**
 * Rectangles or rings.
 *
 * Beside the other two switches rather than in a menu, because it changes what
 * the picture is claiming: area in one, angle in the other. A reader who does
 * not know which they are looking at will read one as the other, and the two
 * disagree in exactly the place it matters — a small folder far out on a ring
 * covers more of the screen than a large one near the middle.
 */
function ShapeSwitch({
  shape,
  onChange,
}: {
  shape: ViewShape;
  onChange(shape: ViewShape): void;
}) {
  const d = useDict();
  const options: ViewShape[] = ["map", "rings"];
  return (
    <div className="segmented" role="group" aria-label={d.rings.asMap}>
      {options.map((option) => (
        <button
          key={option}
          className={option === shape ? "on" : undefined}
          aria-pressed={option === shape}
          title={option === "rings" ? d.rings.asRingsNote : d.rings.asMapNote}
          onClick={() => onChange(option)}
        >
          {option === "rings" ? d.rings.asRings : d.rings.asMap}
        </button>
      ))}
    </div>
  );
}

function ColorSwitch({
  mode,
  onChange,
}: {
  mode: ColorMode;
  onChange(mode: ColorMode): void;
}) {
  const d = useDict();
  const options: ColorMode[] = ["category", "age"];
  return (
    <div className="segmented" role="group" aria-label={d.age.colorBy}>
      {options.map((option) => (
        <button
          key={option}
          className={option === mode ? "on" : undefined}
          aria-pressed={option === mode}
          title={option === "age" ? d.age.byAgeNote : d.age.byKindNote}
          onClick={() => onChange(option)}
        >
          {option === "age" ? d.age.byAge : d.age.byKind}
        </button>
      ))}
    </div>
  );
}

function AgeLegend({
  generation,
  node,
  basis,
  children,
}: {
  generation: number;
  node: number;
  basis: SizeBasis;
  children?: React.ReactNode;
}) {
  const d = useDict();
  const [profile, setProfile] = useState<AgeProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .ageProfile(generation, node)
      .then((result) => !cancelled && setProfile(result))
      // A key that failed to load is left out rather than replaced by an error
      // strip: the map is still readable, and the colours still mean what the
      // ramp says they mean.
      .catch(() => !cancelled && setProfile(null));
    return () => {
      cancelled = true;
    };
  }, [generation, node]);

  if (!profile) return <div className="legend age">{children}</div>;

  const unknown = unknownBytes(profile, basis);
  return (
    <div className="legend age">
      {children}
      {profile.buckets.map((bucket, band) => (
        <span className="item" key={bucket.upToDays ?? "older"}>
          <span className="swatch" style={{ background: bandColor(band) ?? undefined }} />
          {bandLabel(bucket.upToDays)}
          <span className="bytes">{fmt.bytes(bucketBytes(bucket, basis))}</span>
        </span>
      ))}
      {unknown > 0 && (
        <span className="item unknown" title={d.age.unknownNote}>
          <span className="swatch" />
          {d.age.unknown}
          <span className="bytes">{fmt.bytes(unknown)}</span>
        </span>
      )}
    </div>
  );
}

/**
 * The two glyphs the new controls need, drawn rather than typed.
 *
 * A "▾" and a "⋯" from the text font land on a different baseline in each of
 * the five languages' fallback faces and cannot be sized against the label
 * beside them. These are 10×10 and inherit `currentColor`, so they follow the
 * button they sit in through hover, focus and disabled without a rule of their
 * own.
 */
function Caret() {
  return (
    <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true">
      <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function shortName(root: string): string {
  const parts = root.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? root;
}

/**
 * What is open, what it comes to, and what can be done to it.
 *
 * The line every figure in the window is read against, so it carries the one
 * control that changes what those figures mean — and carries it *as* the
 * figures. Both totals are printed either way, because a reader who sees only
 * the active measure cannot tell a sparse disk from a full one; making the
 * inactive one clickable turns a label that was already there into the switch,
 * and removes a segmented control that said the same thing twice.
 */
function SourceBar({
  opened,
  basis,
  busy,
  onBasis,
  actions,
}: {
  opened: Opened;
  basis: SizeBasis;
  /** Work in flight; the requests a change of measure fires are already queued. */
  busy: boolean;
  onBasis(basis: SizeBasis): void;
  actions: MenuItem[];
}) {
  const d = useDict();
  const other: SizeBasis = basis === "on_disk" ? "logical" : "on_disk";
  return (
    <div className="source-line">
      {opened.source.kind === "live" ? (
        <span className="badge live">{d.source.liveScan}</span>
      ) : opened.source.kind === "scanning" ? (
        // Said here rather than only in the progress strip above, because this
        // is the line every figure in the window is read against: a total that
        // is still climbing and one that is final look exactly alike.
        <span className="badge scanning" title={d.source.scanningTitle}>
          {d.source.scanning}
        </span>
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

      <span className="root num" title={opened.source.root}>
        {opened.source.root}
      </span>

      {/* On the line that says what is open, because that is what they act on.
          They were behind a `⋯` here and nowhere else, which is a menu the
          reader has to already know about to find: three commands, each one a
          word wide, hidden behind an icon with no name. The same three are in
          the right-click menu, and History — the only one that does not need a
          scan open — is on the opening screen too. */}
      {actions.length > 0 && (
        <span className="scan-actions" role="group" aria-label={d.toolbar.thisScan}>
          {actions.map((action) => (
            <button
              key={action.label}
              disabled={action.disabled}
              // The reason a disabled one is disabled. A menu had nowhere to
              // put this but a note; a button has its tooltip.
              {...(action.note ? { title: action.note } : {})}
              onClick={action.run}
            >
              {action.label}
            </button>
          ))}
        </span>
      )}

      <span className="spacer" />

      <span className="totals" role="group" aria-label={d.basis.measureBy}>
        <button
          className="on"
          aria-pressed={true}
          disabled={busy}
          title={basisNote(basis)}
          onClick={() => onBasis(basis)}
        >
          <b className="num">{fmt.bytes(totalOf(opened, basis))}</b>
          {basisLabel(basis).toLocaleLowerCase()}
        </button>
        <button
          aria-pressed={false}
          disabled={busy}
          title={basisNote(other)}
          onClick={() => onBasis(other)}
        >
          <span className="num">
            {fmt.bytes(basis === "on_disk" ? opened.totalSize : opened.totalAlloc)}
          </span>
          {basisLabel(other).toLocaleLowerCase()}
        </button>
      </span>

      <span className="counts">
        <span className="num">{fmt.count(opened.root.files)}</span> {d.source.files}
        <span className="num">{fmt.count(opened.entries)}</span> {d.source.entries}
      </span>

      {opened.scanErrors > 0 && (
        <span className="badge warn" title={d.source.unreadableTitle}>
          {fill(d.source.unreadable, { count: fmt.count(opened.scanErrors) })}
        </span>
      )}
    </div>
  );
}

/**
 * macOS only: Full Disk Access is missing, so a scan is about to be
 * interrupted.
 *
 * It sits above the folder shortcuts rather than appearing when a scan starts,
 * because by then it is too late to be useful: macOS raises its own dialog per
 * protected folder, from a parallel walk, in an order nobody can predict. One
 * explanation before the first click replaces all of them.
 *
 * Nothing here blocks scanning. Without the permission the scan still runs and
 * still reports what it could not read (invariant 7) — the permission only
 * decides whether the answer is complete.
 */
function FullDiskAccessNotice() {
  const d = useDict();
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .fullDiskAccess()
      // `=== false` and not falsiness: `null` is Windows and Linux, where
      // there is no such permission and this must never appear.
      .then((granted) => !cancelled && setMissing(granted === false))
      .catch(() => {
        /* A probe that cannot run is not evidence of a missing permission. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!missing) return null;

  return (
    <div className="fda">
      <b>{d.fda.title}</b>
      <p>{d.fda.body}</p>
      <div className="fda-row">
        <button
          className="primary"
          onClick={() =>
            api.openPrivacySettings().catch((err) => setFailed(errorMessage(err)))
          }
        >
          {d.fda.open}
        </button>
        {/* Restarting is part of the instruction, not a convenience: macOS
            hands the new permission to a fresh launch only. */}
        <button onClick={() => void relaunch()}>{d.fda.relaunch}</button>
      </div>
      <p className="hint">{failed || d.fda.after}</p>
    </div>
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
  onHistory,
}: {
  busy: boolean;
  onScanPath(path: string, label: string): void;
  onScan(): void;
  onSnapshots(): void;
  onRemote(): void;
  onHistory(): void;
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

        <FullDiskAccessNotice />

        {points && points.volumes.length > 0 && (
          <div className="disks">
            <h2>
              {d.disks.title}
              <em>{d.disks.note}</em>
            </h2>
            <div className="targets">
              {points.volumes.map((volume) => (
                <button
                  key={volume.path}
                  className="target disk"
                  disabled={busy}
                  onClick={() => onScanPath(volume.path, volume.name)}
                  title={fill(d.disks.scan, { name: volume.name })}
                >
                  <span className="icon">
                    <span className="drive" />
                  </span>
                  <span className="label">
                    <b>{volume.name}</b>
                    <span>
                      {volume.path}
                      {volume.capacity && (
                        <>
                          {" · "}
                          {fill(d.disks.free, {
                            size: fmt.bytes(volume.capacity.available),
                          })}
                        </>
                      )}
                    </span>
                  </span>
                </button>
              ))}
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
          {/* The third place this is reachable from, and the one that does not
              need a scan open first. */}
          <button onClick={onHistory}>{d.toolbar.history}</button>
          <button onClick={onRemote}>{d.welcome.remoteAgent}</button>
        </div>

        <p className="hint" style={{ marginTop: 22, maxWidth: "60ch" }}>
          {d.welcome.promise}
        </p>
      </div>
    </div>
  );
}
