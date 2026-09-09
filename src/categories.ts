// The one place category colours are read from.
//
// They were previously written out three times — legend, folder list, canvas —
// which is three chances for the map and its own key to disagree about what a
// colour means. The values live in `theme.css` as custom properties and are
// read back from there, so the stylesheet is the single source and the canvas,
// which cannot use a CSS variable, still gets the same answer.

import type { Category } from "./api";
import { dict } from "./i18n";

/** Declaration order must match `Category` in src-tauri/src/lib.rs. */
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

/**
 * What each category tends to hold, for the legend and the inspector.
 *
 * The category *names* are not translated: they are the identifiers the
 * scanner uses, and the legend, the tooltip and the API have to agree about
 * them. Only the explanation moves.
 */
export function categoryNote(name: Category): string {
  return dict().categories[name];
}

/**
 * Resolved once, on first use. Custom properties are only readable after the
 * stylesheet has applied, and re-reading them per tile while painting twenty
 * thousand rectangles would mean twenty thousand style recalculations.
 */
let resolved: Record<Category, string> | null = null;

export function categoryColors(): Record<Category, string> {
  if (resolved) return resolved;

  const style = getComputedStyle(document.documentElement);
  const read = (name: Category): string => {
    const value = style.getPropertyValue(`--cat-${name}`).trim();
    // A missing property means the stylesheet has not loaded yet or was
    // renamed; a visible fallback beats a transparent tile.
    return value || "#6f7ba3";
  };

  const colors = {} as Record<Category, string>;
  for (const name of CATEGORIES) colors[name] = read(name);
  resolved = colors;
  return colors;
}

export function categoryColor(name: Category | undefined): string {
  const colors = categoryColors();
  return colors[name ?? "other"] ?? colors.other;
}

/** The colour for a tile, by its numeric category index. */
export function colorByIndex(index: number): string {
  return categoryColor(CATEGORIES[index]);
}
