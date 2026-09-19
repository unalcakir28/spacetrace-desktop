// One scan per tab, and the home tab that is always there.
//
// The window used to hold exactly one tree, so every piece of state about "what
// is open" was a plain `useState` in `App`. Tabs do not change what any of that
// state *is* — they change how many of them exist at once. So this holds the
// whole set and hands `App` the active one, and `App` keeps talking about
// `opened`, `mapRoot` and `selection` exactly as it did.
//
// Three rules shape it:
//
// * **Home cannot be closed and never holds a tree.** It is where a scan is
//   started from, so it has to be reachable without closing the work in front
//   of you — the same reason a browser keeps a new-tab page.
//
// * **A tree is freed the moment no tab is showing it, here, in this file.** A
//   tree is around a hundred megabytes for a million entries (72 bytes a node
//   plus its name, measured), and nothing else in the app will ever release it.
//   There are exactly two ways one stops being shown — the tab goes (`close`)
//   or the tab is handed a different one (`adopt`, which a Rescan does) — and
//   both free it right there. Leaving it to the call sites is how a tab bar
//   that looks right leaks a gigabyte over an afternoon: the second case has no
//   visible moment at all, which is how it was missed the first time.
//
// * **A tab is addressed by id, never by "the active one".** A scan started in
//   one tab keeps landing in that tab after the reader has switched to another,
//   and the id is what makes that true rather than hoped for.

import { useCallback, useRef, useState } from "react";

import { api, type Capacity, type EntryView, type Opened, type ScanRequest, type TrashOutcome } from "./api";

/** The home tab's id, fixed because nothing ever creates or removes it. */
export const HOME_ID = 0;

export interface Tab {
  readonly id: number;
  readonly kind: "home" | "scan";
  /** What the bar shows. A scan's folder name, before there is a tree to ask. */
  title: string;
  opened: Opened | null;
  mapRoot: number;
  selection: number[];
  crumbs: EntryView[];
  chosen: EntryView[];
  patch: TrashOutcome | null;
  /** Bumped when the tree behind these ids has changed — see `App`. */
  liveRevision: number;
  capacity: Capacity | null;
  /** The scan that produced this tab, so Rescan can repeat it exactly. */
  lastScan: { request: ScanRequest; label: string } | null;
}

type Change = Partial<Omit<Tab, "id" | "kind">> | ((tab: Tab) => Partial<Omit<Tab, "id" | "kind">>);

function blank(id: number, kind: Tab["kind"], title: string): Tab {
  return {
    id,
    kind,
    title,
    opened: null,
    mapRoot: 0,
    selection: [],
    crumbs: [],
    chosen: [],
    patch: null,
    liveRevision: 0,
    capacity: null,
    lastScan: null,
  };
}

export interface Tabs {
  tabs: Tab[];
  activeId: number;
  active: Tab;
  /** Open a tab for a scan about to start, and switch to it. Returns its id. */
  open(title: string): number;
  close(id: number): void;
  select(id: number): void;
  /**
   * Hand a tab the tree a scan has just produced, freeing whatever stops being
   * shown, and say whether the tab was still there to take it.
   *
   * Every tree the window learns about goes through here or through `close`,
   * which is the whole of the rule: those two are the only places a generation
   * can become unreachable, so they are the only places that have to free one.
   */
  adopt(id: number, generation: number): boolean;
  /** Change one tab by name, whichever one is in front. */
  update(id: number, change: Change): void;
}

export function useTabs(homeTitle: string): Tabs {
  const [tabs, setTabs] = useState<Tab[]>(() => [blank(HOME_ID, "home", homeTitle)]);
  const [activeId, setActiveId] = useState(HOME_ID);
  // A counter rather than the tree's generation: a tab exists before its scan
  // has produced anything, and two tabs can be waiting on nothing at once.
  const nextId = useRef(HOME_ID + 1);
  /**
   * The current list, readable from a callback without depending on it.
   *
   * Assigned during render rather than in an effect because `close` has to read
   * it in the same commit it was written, and because the alternative — reading
   * the list inside the state updater — is what put an IPC call somewhere React
   * is free to run twice.
   *
   * `open` and `close` write it directly as well, so it is the list *now* and
   * not the list as of the last render. Two of them in one tick is ordinary —
   * open a tab and hand it a tree — and a reader a render behind would be
   * wrong about whether that tab exists, which here decides whether 98 MB is
   * freed.
   */
  const latest = useRef(tabs);
  latest.current = tabs;

  const update = useCallback((id: number, change: Change) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === id ? { ...tab, ...(typeof change === "function" ? change(tab) : change) } : tab,
      ),
    );
  }, []);

  const open = useCallback((title: string) => {
    const id = nextId.current;
    nextId.current += 1;
    const tab = blank(id, "scan", title);
    // Into the ref as well as the state, and this is not belt and braces: a
    // snapshot is already in memory, so `openInNewTab` hands the tab its tree
    // in the same tick it opened it. Left a render behind, `adopt` would find
    // no such tab, conclude the tree was orphaned and free it — every snapshot
    // would close the instant it opened.
    latest.current = [...latest.current, tab];
    setTabs(latest.current);
    setActiveId(id);
    return id;
  }, []);

  const close = useCallback((id: number) => {
    if (id === HOME_ID) return;
    const list = latest.current;
    const index = list.findIndex((tab) => tab.id === id);
    if (index < 0) return;

    const generation = list[index]!.opened?.generation;
    if (generation !== undefined) {
      // Outside the state updater, deliberately. React may call an updater
      // twice — StrictMode does it on purpose to surface exactly this — and a
      // tree was being freed twice per close, which only went unnoticed because
      // the second one is refused. A failure is not worth telling anyone about:
      // the tab is gone either way and there is nothing a reader could do.
      void api.closeTree(generation).catch(() => {});
    }

    const remaining = list.filter((tab) => tab.id !== id);
    latest.current = remaining;
    setTabs(remaining);
    setActiveId((current) => {
      if (current !== id) return current;
      // The one on the right, the way every tabbed thing does it, falling back
      // to the left and finally to home.
      return (remaining[index] ?? remaining[index - 1] ?? remaining[0]!).id;
    });
  }, []);

  const adopt = useCallback((id: number, generation: number): boolean => {
    const tab = latest.current.find((candidate) => candidate.id === id);
    if (!tab) {
      // The tab was closed while its own scan was still running, so `close` had
      // nothing to free: the window did not learn this generation until now.
      // This is the moment it becomes unreachable, so this is where it goes.
      void api.closeTree(generation).catch(() => {});
      return false;
    }

    const previous = tab.opened?.generation;
    if (previous === undefined || previous === generation) return true;

    // A Rescan: a whole new walk, a whole new tree, and nothing is ever going
    // to ask for the old one again. A refresh of a running scan comes back
    // under the generation the tab already has and lands above, untouched.
    void api.closeTree(previous).catch(() => {});
    return true;
  }, []);

  const select = useCallback((id: number) => setActiveId(id), []);

  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0]!;
  return { tabs, activeId: active.id, active, open, close, select, update, adopt };
}
