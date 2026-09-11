// The heat map's colours and the words for its bands.
//
// **No rule lives here.** Which band an entry belongs to, and how a folder's
// band is decided from the bytes beneath it, are answered in the core
// (`scan-core/src/age.rs`) and arrive already decided — for the same reason
// treemap layout and history grouping are in Rust: there is no JavaScript test
// runner in this app, and anything with a rule in it has to sit where it can
// be tested. What is left on this side is a palette and a label.
//
// The palette is a single hue ramp rather than a set of distinct colours.
// Category colours name *kinds*, which have no order, so they are told apart
// by hue. Age has an order, and the map is read by asking "which of these is
// colder" — a reader can rank one ramp at a glance and cannot rank six hues at
// all. Cool blue is new and deep red is old, which is the wrong way round for
// temperature and the right way round for attention: red is the thing to look
// at, and old bytes are the ones worth moving.

import type { AgeBucket, AgeProfile } from "./api";
import { dict, fill } from "./i18n";

/**
 * One colour per band, newest first, matching the core's `DEFAULT_EDGES`
 * (7, 30, 90, 365, 730 days, then everything older) plus the open-ended band.
 *
 * Read from `theme.css` the same way category colours are, so the legend, the
 * canvas — which cannot use a custom property — and any future view all get
 * their answer from the stylesheet rather than from three copies of a hex
 * string that drift apart.
 */
const BAND_COUNT = 6;

let resolved: string[] | null = null;

export function bandColors(): string[] {
  if (resolved) return resolved;
  const style = getComputedStyle(document.documentElement);
  const colors: string[] = [];
  for (let band = 0; band < BAND_COUNT; band += 1) {
    const value = style.getPropertyValue(`--age-${band}`).trim();
    // A missing property means the stylesheet has not applied yet or was
    // renamed. A visible fallback beats an invisible tile.
    colors.push(value || "#6f7ba3");
  }
  resolved = colors;
  return colors;
}

/**
 * The colour for a band index, or for an entry that has none.
 *
 * `-1` is what the backend sends for an entry with nothing datable in it: an
 * empty folder, or files whose modification time was never recorded. It gets
 * the neutral surface rather than a band colour, because any band colour would
 * be read as a measurement of something that was never measured.
 */
export function bandColor(band: number): string | null {
  if (band < 0 || band >= BAND_COUNT) return null;
  return bandColors()[band] ?? null;
}

/**
 * The words for a band, from its upper bound in days.
 *
 * Spelled as ranges a person thinks in ("under a week", "1–3 months") rather
 * than as the raw edges: the edges are an implementation of the question, and
 * the question is how stale something is.
 */
export function bandLabel(upToDays: number | null): string {
  const d = dict().age;
  switch (upToDays) {
    case 7:
      return d.week;
    case 30:
      return d.month;
    case 90:
      return d.quarter;
    case 365:
      return d.year;
    case 730:
      return d.twoYears;
    case null:
      return d.older;
    default:
      // Only reachable if the core's edges change without this list. Saying
      // the number is worse than saying nothing useful, but better than
      // showing an empty swatch nobody can name.
      return fill(d.upToDays, { days: upToDays });
  }
}

/** The buckets in the order they are drawn: newest first, oldest last. */
export function bands(profile: AgeProfile): AgeBucket[] {
  return profile.buckets;
}

/**
 * Bytes with no recorded time, when there are any.
 *
 * Shown only when it is non-zero. A permanent "unknown: 0" chip teaches the
 * reader to ignore that corner of the legend, which is exactly where a
 * snapshot imported from a format without timestamps would announce itself.
 */
export function unknownBytes(profile: AgeProfile, basis: "on_disk" | "logical"): number {
  return basis === "on_disk" ? profile.unknown.alloc : profile.unknown.size;
}

export function bucketBytes(bucket: AgeBucket, basis: "on_disk" | "logical"): number {
  return basis === "on_disk" ? bucket.alloc : bucket.size;
}
