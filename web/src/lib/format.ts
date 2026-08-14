/**
 * Formatting helpers, kept in one tested place.
 *
 * The API speaks **epoch milliseconds** everywhere — `date`, `cooking_date`,
 * `created_at`, `last_seen` — never ISO strings. Scattering `new Date(x)` and
 * `x.getTime()` through components is how a factor of 1000 gets lost in one
 * screen and not another.
 */

/** Milliseconds in a day. Plans are stored at midnight UTC, so arithmetic is exact. */
export const DAY_MS = 86_400_000;

export function fromEpochMs(ms: number): Date {
  return new Date(ms);
}

export function toEpochMs(date: Date): number {
  return date.getTime();
}

/**
 * Midnight UTC for the day a timestamp falls on.
 *
 * Deliberately UTC: the planner stores a plan at midnight UTC, so reading it in
 * local time puts dinner on the wrong day for anyone east or west of Greenwich.
 */
export function utcMidnight(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/** An unscheduled plan is stored as date.min — year 1, so far negative. */
export function isUnscheduled(cookingDate: number): boolean {
  return cookingDate < 0;
}

export function formatDate(ms: number, options?: Intl.DateTimeFormatOptions): string {
  return new Date(ms).toLocaleDateString(undefined, options ?? { day: "numeric", month: "short" });
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMonth(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/** "Today", "Tomorrow", or a short date — for a planner column heading. */
export function relativeDay(timestamp: number, today: number): string {
  if (timestamp === today) return "Today";
  if (timestamp === today + DAY_MS) return "Tomorrow";
  if (timestamp === today - DAY_MS) return "Yesterday";
  return new Date(timestamp).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Money, with two decimals and no currency symbol.
 *
 * The API stores a bare float and a household has no currency setting, so any
 * symbol here would be this client inventing one — and a wrong symbol on a
 * number people settle up with is worse than no symbol at all.
 */
export function money(amount: number): string {
  return amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** A colour stored as a signed ARGB integer (how Flutter wrote it) to CSS. */
export function argbToCss(color: number | null | undefined): string | null {
  if (color === null || color === undefined) return null;
  // Flutter stores 0xAARRGGBB, which exceeds a signed 32-bit int and can arrive
  // negative through JSON. >>> 0 puts it back in unsigned range.
  const value = color >>> 0;
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgb(${r} ${g} ${b})`;
}
