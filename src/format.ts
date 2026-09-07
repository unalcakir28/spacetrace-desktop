// Formatting helpers. Deliberately matching the CLI's output so a number seen
// in the terminal and the same number seen here read identically.

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
  return `${negative ? "-" : ""}${n.toFixed(digits)} ${BINARY_UNITS[unit]}`;
}

/** Always signed, so a column of changes scans well. */
export function delta(value: number): string {
  const formatted = bytes(Math.abs(value));
  return `${value < 0 ? "−" : "+"}${formatted}`;
}

export function count(value: number): string {
  return value.toLocaleString("en-US").replace(/,/g, " ");
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

export function relativeTime(unixSeconds: number): string {
  const seconds = Math.floor(Date.now() / 1000) - unixSeconds;
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 45) return `${days} d ago`;
  return `${Math.round(days / 30)} mo ago`;
}

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
  if (whole <= 0) return "0%";
  const value = (part / whole) * 100;
  return value >= 10 ? `${value.toFixed(0)}%` : `${value.toFixed(1)}%`;
}
