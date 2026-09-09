/**
 * The active language, as a store rather than as React context.
 *
 * Context would only reach components. Half the user-visible text in this app
 * is produced by plain functions — `scanWorking`, the basis labels, the
 * relative-time formatter — which cannot call hooks and would have had to take
 * a dictionary parameter threaded down from whoever happened to be rendering.
 *
 * A module-level store with `useSyncExternalStore` gives both: components
 * subscribe and re-render, plain functions call `dict()` and get the same
 * object. `useSyncExternalStore` is built into React, so this costs no
 * dependency.
 */
import { useSyncExternalStore } from "react";

import { de } from "./ui/de";
import { en } from "./ui/en";
import { fr } from "./ui/fr";
import { it } from "./ui/it";
import { tr } from "./ui/tr";
import {
  DEFAULT_LOCALE,
  initialLocale,
  isLocale,
  remember,
  type Locale,
} from "./config";
import type { Dictionary } from "./ui/en";

export type { Dictionary } from "./ui/en";
export { LOCALES, LOCALE_NAMES, DEFAULT_LOCALE, type Locale } from "./config";

const DICTIONARIES: Record<Locale, Dictionary> = { en, tr, it, fr, de };

let current: Locale = initialLocale();
const listeners = new Set<() => void>();

/** The active locale. Stable between changes, so it is a valid snapshot. */
export function locale(): Locale {
  return current;
}

/**
 * The active dictionary.
 *
 * Returns the same object for the same locale, which is what
 * `useSyncExternalStore` requires of a snapshot — a fresh object every call
 * would re-render forever.
 */
export function dict(): Dictionary {
  return DICTIONARIES[current] ?? DICTIONARIES[DEFAULT_LOCALE];
}

export function setLocale(next: Locale): void {
  if (!isLocale(next) || next === current) return;
  current = next;
  remember(next);
  // The document language follows, so the webview hyphenates and reads out the
  // right one.
  document.documentElement.lang = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The dictionary, re-rendering the caller when the language changes. */
export function useDict(): Dictionary {
  return useSyncExternalStore(subscribe, dict, dict);
}

/** The active locale, re-rendering the caller when it changes. */
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, locale, locale);
}

/**
 * Fill `{name}` placeholders.
 *
 * Deliberately not a template engine. Translations need the substitution point
 * to move — German puts the count where English puts the noun — and a
 * positional `%s` cannot express that, which is the whole reason the entries
 * are named.
 */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}

/**
 * Pick the plural form for `count` in the active language.
 *
 * `Intl.PluralRules` rather than `count === 1`: Turkish has one form where
 * English has two, French treats zero as singular, and hard-coding English's
 * rule into four other languages produces text that reads as machine output.
 * Falls back to `other`, which every language defines.
 */
export function plural(
  count: number,
  forms: Partial<Record<Intl.LDMLPluralRule, string>>,
): string {
  const rule = new Intl.PluralRules(locale()).select(count);
  return fill(forms[rule] ?? forms.other ?? "", { count });
}
