/**
 * Which languages the app speaks, and how it picks one.
 *
 * The same five as the website, deliberately: someone who reads the product
 * page in Italian and then opens the app should not be dropped into English.
 * That mismatch is the whole reason decision K1 was narrowed — see K10 in the
 * core repo's docs/DECISIONS.md. The command line, the agent and the hub stay
 * English: a translated command is false information.
 */
export const LOCALES = ["en", "tr", "it", "fr", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Endonyms. A language picker that names languages in a language you do not
 *  read is a picker you cannot use. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  tr: "Türkçe",
  it: "Italiano",
  fr: "Français",
  de: "Deutsch",
};

/** Where an explicit choice is remembered. Same shape as `spacetrace.basis`. */
const STORAGE_KEY = "spacetrace.locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The locale to start in: an explicit choice if there is one, otherwise the
 * closest match to the operating system's languages, otherwise English.
 *
 * Region subtags are dropped — `de-AT` is served by `de`. Serving English to
 * an Austrian because the exact tag is missing would be a worse answer than
 * German.
 */
export function initialLocale(languages: readonly string[] = navigator.languages ?? []): Locale {
  const chosen = remembered();
  if (chosen) return chosen;

  for (const tag of languages) {
    const base = tag.toLowerCase().split("-")[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

/**
 * Reads through a try/catch because storage throws outright in some contexts,
 * rather than returning null. A language preference is not worth a blank
 * window.
 */
export function remembered(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function remember(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // A choice that does not survive a restart is still better than a crash.
  }
}
