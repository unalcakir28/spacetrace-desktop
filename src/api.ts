// Typed wrappers over the Tauri commands in src-tauri/src/lib.rs.
//
// The scanned tree never crosses into JavaScript: it can be millions of nodes.
// Everything here works in terms of node ids, and asks for the small pieces the
// UI actually draws.

import { invoke } from "@tauri-apps/api/core";

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

/** Must match the declaration order of `Category` in lib.rs. */
export const CATEGORIES: readonly Category[] = [
  "directory",
  "image",
  "video",
  "audio",
  "document",
  "archive",
  "code",
  "binary",
  "cache",
  "other",
];

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
  parent: number[];
  count: number;
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

export const api = {
  scanDirectory(req: ScanRequest): Promise<Opened> {
    return call("scan_directory", {
      req: {
        path: req.path,
        exclude: req.exclude ?? [],
        one_file_system: req.oneFileSystem ?? false,
        depth: req.depth ?? null,
        no_dedupe: req.noDedupe ?? false,
      },
    });
  },

  listSnapshots(db: string): Promise<ScanMeta[]> {
    return call("list_snapshots", { db });
  },

  openSnapshot(db: string, scanId: number): Promise<Opened> {
    return call("open_snapshot", { db, scanId });
  },

  treemap(req: {
    generation: number;
    node: number;
    width: number;
    height: number;
    minArea?: number;
    padding?: number;
    maxDepth?: number | null;
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
      },
    });
  },

  labels(generation: number, nodes: number[]): Promise<string[]> {
    return call("labels", { generation, nodes });
  },

  entry(generation: number, node: number): Promise<EntryView> {
    return call("entry", { generation, node });
  },

  children(generation: number, node: number, limit?: number): Promise<EntryView[]> {
    return call("children", { generation, node, limit: limit ?? null });
  },

  ancestors(generation: number, node: number): Promise<EntryView[]> {
    return call("ancestors", { generation, node });
  },

  absolutePath(generation: number, node: number): Promise<string> {
    return call("absolute_path", { generation, node });
  },

  reveal(generation: number, node: number): Promise<void> {
    return call("reveal", { generation, node });
  },

  moveToTrash(generation: number, node: number): Promise<void> {
    return call("move_to_trash", { generation, node });
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

  openRemoteSnapshot(url: string, token: string, scanId: number): Promise<Opened> {
    return call("open_remote_snapshot", { url, token, scanId });
  },

  defaultDatabase(): Promise<string> {
    return call("default_database");
  },
};

/** Must match `STALE_GENERATION` in src-tauri/src/lib.rs. */
const STALE_GENERATION = "stale-generation";

/**
 * True when a request lost a race with a newly loaded tree.
 *
 * Expected during a transition, not a fault: the ids it carried belong to a
 * tree that is no longer open. Callers should drop the result silently rather
 * than showing an error the user cannot act on.
 */
export function isStale(err: unknown): boolean {
  return typeof err === "string" && err === STALE_GENERATION;
}

/** Turn any thrown value into something showable. Tauri rejects with strings. */
export function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}
