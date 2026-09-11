// Typed wrappers over the Tauri commands in src-tauri/src/lib.rs.
//
// The scanned tree never crosses into JavaScript: it can be millions of nodes.
// Everything here works in terms of node ids, and asks for the small pieces the
// UI actually draws.

import { invoke } from "@tauri-apps/api/core";

import { dict, fill } from "./i18n";
import { listen } from "@tauri-apps/api/event";

export type Category =
  | "directory"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "archive"
  | "code"
  | "binary"
  | "cache"
  | "other";

export { CATEGORIES } from "./categories";

export interface EntryView {
  node: number;
  name: string;
  relPath: string;
  isDir: boolean;
  size: number;
  alloc: number;
  files: number;
  dirs: number;
  mtime: number;
  childCount: number;
  category: Category;
  /**
   * What the entry mostly consists of; for a file, its own category.
   *
   * A folder list is almost all folders, and a folder has no file type of its
   * own, so colouring rows by `category` gives every one of them the same
   * colour. This is what the folder is full of.
   */
  dominant: Category;
}

export type Source =
  | { kind: "live"; root: string }
  | {
      kind: "snapshot";
      root: string;
      host: string;
      scanId: number;
      startedAt: number;
      label: string | null;
      remote: string | null;
    };

/**
 * How full the filesystem is, as free out of total.
 *
 * Never shown as "percent full": where space is shared between volumes (APFS,
 * btrfs, thin LVM) `total - available` counts the neighbours' usage too and
 * contradicts `df` for the same mount.
 */
export interface Capacity {
  total: number;
  available: number;
}

export interface Opened {
  /// Which tree the node ids in this response belong to. Every later call that
  /// names a node must pass it back, so an id from a replaced tree is refused
  /// instead of silently addressing a different entry.
  generation: number;
  source: Source;
  root: EntryView;
  totalSize: number;
  totalAlloc: number;
  entries: number;
  canModify: boolean;
  scanErrors: number;
  errorSamples: string[];
  capacity: Capacity | null;
}

/** One report from a scan in flight. */
export interface ScanTick {
  scan: number;
  files: number;
  dirs: number;
  bytes: number;
  errors: number;
  elapsedMs: number;
  /** 0–1, or null when there is no honest denominator to divide by. */
  fraction: number | null;
  basis: "last_scan" | null;
  /**
   * Which stage the scan is in. After the walk the file count stops for good
   * and only `clonesProbed` moves, so a strip that keeps saying "scanning" is
   * saying something untrue.
   */
  phase: "walking" | "finishing";
  clonesProbed: number;
  /**
   * How long every counter has stood still, once that is worth mentioning.
   * `null` while the scan is moving.
   */
  stalledMs: number | null;
  /** Directories being listed. Sent only while stalled. */
  waitingOn: string[];
}

export interface TrashedEntry {
  node: number;
  name: string;
  parent: number;
  size: number;
  /** What actually left the filesystem, which is what a notice may claim. */
  alloc: number;
  files: number;
}

export interface TrashFailure {
  node: number;
  name: string;
  /** Why it stayed, as a coded error. Pass it through `errorMessage`. */
  reason: AppError;
}

/** What changed after a Trash operation. */
export interface TrashOutcome {
  /** Unchanged: the tree was edited in place, so held ids are still valid. */
  generation: number;
  trashed: TrashedEntry[];
  /** Reported rather than rolled back: part of a selection can fail. */
  failed: TrashFailure[];
  /** Selected entries that went with a selected folder above them. */
  redundant: number;
  totalSize: number;
  totalAlloc: number;
  /** Every ancestor whose totals changed, root first, deduplicated. */
  ancestors: EntryView[];
}

/** One report from a Trash operation in flight. */
export interface TrashTick {
  done: number;
  total: number;
  name: string;
}

export interface ScanTarget {
  name: string;
  path: string;
  note: string;
}

export interface StartingPoints {
  homeVolume: Capacity | null;
  home: string | null;
  targets: ScanTarget[];
}

/** What a save produced. */
export interface SavedSnapshot {
  scanId: number;
  db: string;
  label: string | null;
}

export interface ScanMeta {
  id: number;
  host: string;
  root: string;
  startedAt: number;
  durationMs: number;
  totalSize: number;
  totalAlloc: number;
  files: number;
  dirs: number;
  errors: number;
  hardlinksDeduped: number;
  scannerVersion: string;
  label: string | null;
}

/** Tiles as parallel arrays, in draw order: a parent always precedes its children. */
export interface TileArrays {
  node: number[];
  x: number[];
  y: number[];
  w: number[];
  h: number[];
  depth: number[];
  isDir: boolean[];
  truncated: boolean[];
  category: number[];
  /**
   * Age band per tile, oldest band highest, or -1 where there is nothing
   * datable to colour. Decided in the core — see `src/age.ts` for why no rule
   * about it lives on this side.
   */
  ageBand: number[];
  parent: number[];
  count: number;
}

/**
 * One age band and the bytes in it.
 *
 * Field names are the core's, in snake_case, because this type is serialised
 * straight out of `scan-core` and `spacetrace age --json` publishes the same
 * shape. Renaming it for the sake of house style here would mean either two
 * spellings of one thing or a breaking change to a released command's output.
 */
export interface AgeBucket {
  /** Upper bound in days, or null for the open-ended oldest band. */
  up_to_days: number | null;
  files: number;
  size: number;
  alloc: number;
}

export interface AgeProfile {
  /** One per edge, plus a final open-ended band. Newest first. */
  buckets: AgeBucket[];
  /** Files whose modification time was never recorded. */
  unknown: AgeBucket;
}

/** One measurement in a target's history. */
export interface HistoryPoint {
  scanId: number;
  /** Unix seconds. */
  at: number;
  size: number;
  alloc: number;
  files: number;
  label: string | null;
  fsTotal: number | null;
  fsAvailable: number | null;
}

/** Every snapshot of one (host, root) pair, oldest first. */
export interface HistoryTarget {
  host: string;
  root: string;
  points: HistoryPoint[];
}

export interface Change {
  path: string;
  kind: "grown" | "shrunk" | "added" | "removed";
  isDir: boolean;
  oldSize: number;
  newSize: number;
  delta: number;
}

export interface DiffView {
  from: ScanMeta;
  to: ScanMeta;
  oldTotal: number;
  newTotal: number;
  delta: number;
  changes: Change[];
}

// Rust serialises struct fields as snake_case; convert on the way in so the
// rest of the app can be idiomatic TypeScript.
type Snake = Record<string, unknown>;

function camelize<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => camelize(v)) as unknown as T;
  if (value === null || typeof value !== "object") return value as T;

  const out: Snake = {};
  for (const [key, val] of Object.entries(value as Snake)) {
    const camel = key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    out[camel] = camelize(val);
  }
  return out as T;
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return camelize<T>(await invoke(command, args));
}

export interface ScanRequest {
  path: string;
  exclude?: string[];
  oneFileSystem?: boolean;
  depth?: number | null;
  noDedupe?: boolean;
}

/**
 * Which of the two recorded measurements a view is built from.
 *
 * `EntryView` always carries both numbers, so figures and labels need no round
 * trip. This is passed to the backend only where the answer is a *conclusion*
 * rather than a number — how big a rectangle is, what order rows come in, what
 * a folder is mostly full of — and it is a required argument on those calls so
 * that a view cannot be assembled half from one measure and half from the other.
 */
export type SizeBasis = "logical" | "on_disk";

export const api = {
  /**
   * The basis is a separate argument rather than part of `ScanRequest`, because
   * the request is what the scan dialog collects and the basis is a way of
   * reading the result. Required, so no caller can leave the first view of a
   * scan built from the wrong measure.
   */
  scanDirectory(req: ScanRequest, basis: SizeBasis): Promise<Opened> {
    return call("scan_directory", {
      req: {
        path: req.path,
        exclude: req.exclude ?? [],
        one_file_system: req.oneFileSystem ?? false,
        depth: req.depth ?? null,
        no_dedupe: req.noDedupe ?? false,
        basis,
      },
    });
  },

  /**
   * Store the open scan. Refused for a snapshot, and for a tree that has had
   * entries deleted — the backend holds those rules, because they are about
   * what the data means rather than what the window is showing.
   */
  saveSnapshot(db: string, label: string | null): Promise<SavedSnapshot> {
    return call("save_snapshot", { db, label });
  },

  listSnapshots(db: string): Promise<ScanMeta[]> {
    return call("list_snapshots", { db });
  },

  snapshotHistory(db: string): Promise<HistoryTarget[]> {
    return call("snapshot_history", { db });
  },

  openSnapshot(db: string, scanId: number, basis: SizeBasis): Promise<Opened> {
    return call("open_snapshot", { db, scanId, basis });
  },

  treemap(req: {
    generation: number;
    node: number;
    width: number;
    height: number;
    minArea?: number;
    padding?: number;
    maxDepth?: number | null;
    basis: SizeBasis;
  }): Promise<TileArrays> {
    return call("treemap", {
      req: {
        generation: req.generation,
        node: req.node,
        width: req.width,
        height: req.height,
        min_area: req.minArea ?? 6,
        padding: req.padding ?? 1,
        max_depth: req.maxDepth ?? null,
        basis: req.basis,
      },
    });
  },

  /** The age distribution of one folder, for the heat map's key. */
  ageProfile(generation: number, node: number): Promise<AgeProfile> {
    return call("age_profile", { generation, node });
  },

  labels(generation: number, nodes: number[]): Promise<string[]> {
    return call("labels", { generation, nodes });
  },

  entry(generation: number, node: number, basis: SizeBasis): Promise<EntryView> {
    return call("entry", { generation, node, basis });
  },

  /** One call for a whole selection. Ids that no longer exist are dropped. */
  entries(generation: number, nodes: number[], basis: SizeBasis): Promise<EntryView[]> {
    return call("entries", { generation, nodes, basis });
  },

  children(
    generation: number,
    node: number,
    basis: SizeBasis,
    limit?: number,
  ): Promise<EntryView[]> {
    return call("children", { generation, node, limit: limit ?? null, basis });
  },

  ancestors(generation: number, node: number, basis: SizeBasis): Promise<EntryView[]> {
    return call("ancestors", { generation, node, basis });
  },

  absolutePath(generation: number, node: number): Promise<string> {
    return call("absolute_path", { generation, node });
  },

  reveal(generation: number, node: number): Promise<void> {
    return call("reveal", { generation, node });
  },

  /** Takes a list, so one entry and a multiple selection are the same call. */
  moveToTrash(
    generation: number,
    nodes: number[],
    basis: SizeBasis,
  ): Promise<TrashOutcome> {
    return call("move_to_trash", { generation, nodes, basis });
  },

  cancelScan(): Promise<boolean> {
    return call("cancel_scan");
  },

  refreshCapacity(generation: number): Promise<Capacity | null> {
    return call("refresh_capacity", { generation });
  },

  startingPoints(): Promise<StartingPoints> {
    return call("starting_points");
  },

  /**
   * Whether macOS lets this app read the whole filesystem. `null` on Windows
   * and Linux, where no such permission exists — so a caller checks for
   * `false`, never for falsiness.
   */
  fullDiskAccess(): Promise<boolean | null> {
    return call("full_disk_access");
  },

  openPrivacySettings(): Promise<void> {
    return call("open_privacy_settings");
  },

  diffSnapshots(
    db: string,
    from: number,
    to: number,
    minDelta?: number,
    includeFiles?: boolean,
  ): Promise<DiffView> {
    return call("diff_snapshots", {
      db,
      from,
      to,
      minDelta: minDelta ?? null,
      includeFiles: includeFiles ?? null,
    });
  },

  remoteSnapshots(url: string, token: string): Promise<ScanMeta[]> {
    return call("remote_snapshots", { url, token });
  },

  openRemoteSnapshot(
    url: string,
    token: string,
    scanId: number,
    basis: SizeBasis,
  ): Promise<Opened> {
    return call("open_remote_snapshot", { url, token, scanId, basis });
  },

  defaultDatabase(): Promise<string> {
    return call("default_database");
  },

  /** What this build is: version, commit, build date, channel. */
  buildInfo(): Promise<BuildInfo> {
    return call("build_info");
  },

  /**
   * The app's own changelog, already in `locale`.
   *
   * Resolved in Rust rather than shipped to the window in all five languages:
   * only one of them is ever displayed, and the entries are compiled into the
   * binary either way.
   */
  changelog(locale: string): Promise<ChangelogRelease[]> {
    return call("changelog", { locale });
  },
};

export interface BuildInfo {
  version: string;
  /** Short commit hash, or `unknown` for a build outside CI. */
  commit: string;
  built: string;
  /** `release`, `continuous` or `dev`. */
  channel: string;
  isRelease: boolean;
}

export interface ChangelogEntry {
  /** A stable code the window translates: `added`, `fixed`, and so on. */
  kind: string;
  text: string;
}

export interface ChangelogRelease {
  /** Empty for work that has landed but is not in a release yet. */
  version: string;
  date: string;
  published: boolean;
  entries: ChangelogEntry[];
}

/**
 * Subscribe to reports from whatever scan is running.
 *
 * Returns the unsubscribe function. Ticks arrive roughly eight times a second
 * and carry the id of the scan they belong to, so a report from a scan that has
 * been superseded can be dropped rather than fighting the current one for the
 * progress bar.
 */
export function onScanProgress(handler: (tick: ScanTick) => void): () => void {
  return subscribe("scan://progress", handler);
}

/** Subscribe to reports from a Trash operation. Returns the unsubscribe. */
export function onTrashProgress(handler: (tick: TrashTick) => void): () => void {
  return subscribe("trash://progress", handler);
}

/** Event names must match the `*_PROGRESS_EVENT` constants in lib.rs. */
function subscribe<T>(event: string, handler: (payload: T) => void): () => void {
  let stop: (() => void) | null = null;
  let cancelled = false;

  listen<Record<string, unknown>>(event, (received) => {
    handler(camelize<T>(received.payload));
  }).then((unlisten) => {
    // The caller may have unsubscribed while `listen` was still resolving.
    if (cancelled) {
      unlisten();
      return;
    }
    stop = unlisten;
  });

  return () => {
    cancelled = true;
    stop?.();
  };
}

/** Must match `STALE_GENERATION` in src-tauri/src/lib.rs. */
const STALE_GENERATION = "stale-generation";

/** Must match `SCAN_CANCELLED` in src-tauri/src/lib.rs. */
const SCAN_CANCELLED = "scan-cancelled";

/**
 * True when a scan ended because the user stopped it.
 *
 * Not a failure and not worth an error message: the user knows, having just
 * clicked Stop. The window simply puts back whatever it was showing before.
 */
export function isCancelled(err: unknown): boolean {
  return codeOf(err) === SCAN_CANCELLED;
}

/**
 * True when a request lost a race with a newly loaded tree.
 *
 * Expected during a transition, not a fault: the ids it carried belong to a
 * tree that is no longer open. Callers should drop the result silently rather
 * than showing an error the user cannot act on.
 */
export function isStale(err: unknown): boolean {
  return codeOf(err) === STALE_GENERATION;
}

/**
 * An error as the Rust side sends it: a stable code, values for its sentence,
 * and whatever the operating system said.
 */
export interface AppError {
  code: string;
  args?: Record<string, string>;
  /** The OS's own words. Never translated — those are the searchable ones. */
  detail?: string;
}

function codeOf(err: unknown): string | null {
  if (err && typeof err === "object" && typeof (err as AppError).code === "string") {
    return (err as AppError).code;
  }
  // Tauri's own rejections, and anything from a plugin, are still plain
  // strings. They carry no code and must not be mistaken for one.
  return null;
}

/**
 * Turn any thrown value into a sentence for this window's language.
 *
 * Three shapes arrive here and all three have to read sensibly: a coded error
 * from one of our commands, a plain string from Tauri itself or a plugin, and
 * a JavaScript `Error`. Only the first can be translated, and an unknown code
 * falls back to the detail rather than to the code — a reader helped by
 * `cannot_open_database` is a reader who did not need the message.
 */
export function errorMessage(err: unknown): string {
  const code = codeOf(err);
  if (code) {
    const { args, detail } = err as AppError;
    const d = dict();
    const template = d.errors[code as keyof typeof d.errors];
    const sentence = template ? fill(template, args ?? {}) : detail || code;
    // The OS's words follow ours rather than replacing them: "X could not be
    // scanned. Permission denied" says both what failed and why.
    return template && detail ? `${sentence} ${detail}` : sentence;
  }
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}
