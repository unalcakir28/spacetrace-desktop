// The one place the two measurements are named and compared.
//
// Every entry carries both, and neither is an estimate of the other. Which one
// a view is built from decides the whole picture, so the app never shows a
// figure without the basis being visible somewhere on screen — the same reason
// capacity is reported as free-of-total rather than as a percentage.
//
// Why "on disk" is the default: the question the app exists to answer is what
// is filling a disk, and only allocated blocks add up towards what `df` says is
// gone. A sparse file — a VM image, a database, a core dump — reports a length
// it never allocated, and those are exactly the biggest entries on a real disk,
// so the logical measure is most wrong about the entries that matter most. A
// 1 TiB Docker image holding 19 GiB drawn at its claimed size buries everything
// that is genuinely large.

import { useCallback, useState } from "react";

import type { EntryView, Opened, SizeBasis } from "./api";

export type { SizeBasis };

/** What a fresh window uses until the person says otherwise. */
export const DEFAULT_BASIS: SizeBasis = "on_disk";

export const BASIS_LABEL: Record<SizeBasis, string> = {
  on_disk: "On disk",
  logical: "Logical",
};

/** Said in full where there is room for it, so the switch is not a mystery. */
export const BASIS_NOTE: Record<SizeBasis, string> = {
  on_disk: "Blocks actually allocated, including what folders themselves cost. This is the measure that adds up to the space missing from the disk.",
  logical: "The length each file reports. Sparse files claim more than they hold, so this can overstate a disk by a long way.",
};

/** The short word for the other measure, for a row that names both. */
export const OTHER_BASIS: Record<SizeBasis, SizeBasis> = {
  on_disk: "logical",
  logical: "on_disk",
};

export function measure(entry: EntryView, basis: SizeBasis): number {
  return basis === "on_disk" ? entry.alloc : entry.size;
}

export function totalOf(opened: Opened, basis: SizeBasis): number {
  return basis === "on_disk" ? opened.totalAlloc : opened.totalSize;
}

/**
 * How far apart an entry's two numbers are, when it is far enough to explain.
 *
 * Both directions are ordinary and neither is a fault, so the point of saying
 * anything is to stop the reader distrusting the app when the two figures
 * disagree. That means a threshold: every small file allocates a whole block
 * and mentioning it on each row would be noise, so `rounded` is only ever shown
 * for a single selected entry.
 */
export type Divergence = "sparse" | "rounded" | null;

/** Below this there is no story to tell — a few blocks either way. */
const NOTABLE = 16 * 1024 * 1024;

export function divergence(entry: EntryView): Divergence {
  if (entry.isDir) return null;
  if (entry.size >= NOTABLE && entry.alloc < entry.size / 2) return "sparse";
  if (entry.alloc > entry.size) return "rounded";
  return null;
}

export const DIVERGENCE_NOTE: Record<"sparse" | "rounded", string> = {
  sparse: "A sparse file: it reports a length it has not allocated, so it takes far less room than it claims.",
  rounded: "Files are allocated in whole blocks, so this occupies a little more than its length.",
};

const STORAGE_KEY = "spacetrace.basis";

/** Remembered, because it is a way of reading a disk rather than a one-off. */
export function useSizeBasis(): [SizeBasis, (basis: SizeBasis) => void] {
  const [basis, setBasis] = useState<SizeBasis>(load);

  const choose = useCallback((next: SizeBasis) => {
    setBasis(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A window that cannot persist a preference still works.
    }
  }, []);

  return [basis, choose];
}

function load(): SizeBasis {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    // Checked against the known values rather than cast: a stored string from
    // an older build would otherwise silently become a third, invalid basis.
    if (stored === "logical" || stored === "on_disk") return stored;
  } catch {
    // Storage can throw outright, not just come back empty.
  }
  return DEFAULT_BASIS;
}
