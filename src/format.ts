// Formatting helpers.
//
// Two rules pull in opposite directions here and both are kept.
//
// Numbers a person *reads as prose* follow their language: a decimal comma in
// German, "vor 3 Stunden" instead of "3 h ago". Numbers that are meant to line
// up with what the command line prints do not — digit grouping stays a plain
// space in every language, which is both locale-neutral and what the CLI emits,
// so a figure seen in a terminal and the same figure seen here still match.

import { dict, locale } from "./i18n";

const BINARY_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"] as const;

/** Binary units, one decimal, because that is what filesystems allocate in. */
export function bytes(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const negative = value < 0;
  let n = Math.abs(value);
  let unit = 0;
  while (n >= 1024 && unit < BINARY_UNITS.length - 1) {
    n /= 1024;
    unit += 1;
  }
  const digits = unit === 0 ? 0 : 1;
  // The unit symbols are international; only the decimal separator moves.
  const number = new Intl.NumberFormat(locale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n);
  return `${negative ? "-" : ""}${number} ${BINARY_UNITS[unit]}`;
}

/** Always signed, so a column of changes scans well. */
export function delta(value: number): string {
  const formatted = bytes(Math.abs(value));
  return `${value < 0 ? "−" : "+"}${formatted}`;
}

/**
 * Grouped with spaces, in every language.
 *
 * Not localised on purpose: a space is unambiguous everywhere, while a comma
 * and a full stop swap meanings between English and German, and this is the
 * number a reader is most likely to compare against `spacetrace ls` output.
 */
export function count(value: number): string {
  return value.toLocaleString("en-US").replace(/,/g, " ");
}

/** Unix seconds as `YYYY-MM-DD HH:MM`, matching the CLI. */
export function timestamp(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * "3 hours ago", in the reader's language.
 *
 * `Intl.RelativeTimeFormat` rather than a table of suffixes: the plural rules
 * and the word order differ across the five languages, and the browser already
 * knows all of them.
 */
export function relativeTime(unixSeconds: number): string {
  const seconds = Math.floor(Date.now() / 1000) - unixSeconds;
  if (seconds < 90) return dict().time.justNow;

  const relative = new Intl.RelativeTimeFormat(locale(), { numeric: "always" });
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return relative.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 36) return relative.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 45) return relative.format(-days, "day");
  return relative.format(-Math.round(days / 30), "month");
}

/**
 * Elapsed time while work is running.
 *
 * Unit letters, not words: this updates several times a second next to a
 * progress bar, and a sentence that changes length on every tick makes the row
 * jump. The letters are the same in all five languages.
 */
export function duration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} m ${Math.floor((ms % 60_000) / 1000)} s`;
}

/** Shorten a path in the middle, keeping both ends legible. */
export function ellipsize(text: string, max: number): string {
  if (text.length <= max || max < 6) return text;
  const keepEnd = Math.floor((max - 1) / 2);
  const keepStart = max - 1 - keepEnd;
  return `${text.slice(0, keepStart)}…${text.slice(text.length - keepEnd)}`;
}

export function percent(part: number, whole: number): string {
  const value = whole <= 0 ? 0 : (part / whole) * 100;
  const digits = value >= 10 || value === 0 ? 0 : 1;
  return new Intl.NumberFormat(locale(), {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value / 100);
}
