import { api } from "./client";

/**
 * The bridge to a Spiso (Foodminder) inventory.
 *
 * Everything goes through KitchenOwl's own backend, which holds the Spiso
 * session and does the talking. That was a deliberate choice over calling Spiso
 * from the browser: Spiso's CORS list would have needed this origin added and
 * its API redeployed. The cost is that a second server holds a credential for
 * the first, which is why the connect screen says so in as many words.
 */

export interface SpisoStatus {
  connected: boolean;
  base_url?: string;
  home_id?: string | null;
  home_name?: string | null;
  needs_sign_in?: boolean;
}

export interface SpisoHome {
  id: string;
  name: string;
  role?: string;
}

export interface SpisoItem {
  id: string;
  name: string;
  quantity: number;
  category?: string | null;
  emoji?: string | null;
  /** fridge, freezer or pantry. */
  location?: string | null;
  /** The shelf or cupboard within that, as the kitchen names it. */
  space?: string | null;
  /** ISO date — a day, not an instant. */
  expires_on?: string | null;
  opened_on?: string | null;
  status?: string | null;
}

export const spisoApi = {
  status: () => api<SpisoStatus>("/spiso"),
  connect: (body: { base_url: string; email: string; password: string }) =>
    api<SpisoStatus & { homes: SpisoHome[] }>("/spiso/connect", { method: "POST", body }),
  homes: () => api<{ homes: SpisoHome[] }>("/spiso/homes"),
  chooseHome: (home_id: string) =>
    api<SpisoStatus>("/spiso/home", { method: "POST", body: { home_id } }),
  inventory: () =>
    api<{ items: SpisoItem[]; home_name: string | null; needs_home: boolean }>("/spiso/inventory"),
  disconnect: () => api<SpisoStatus>("/spiso", { method: "DELETE" }),
};

/** Days until something goes off; negative when it already has. */
export function daysUntil(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const dayStart = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((dayStart(then) - dayStart(now)) / 86_400_000);
}

/**
 * How an expiry reads to someone standing in the kitchen.
 *
 * "in 9 days" is a number to do arithmetic on; "Tuesday" is not. Anything
 * further out than a week is not a prompt to cook tonight, so it says the date
 * and stops shouting.
 */
export function expiryLabel(iso: string | null | undefined, now = new Date()): string | null {
  const days = daysUntil(iso, now);
  if (days === null) return null;
  if (days < -1) return `${Math.abs(days)} days past`;
  if (days === -1) return "Yesterday";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 6) return new Date(iso!).toLocaleDateString(undefined, { weekday: "long" });
  return new Date(iso!).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/**
 * How long is left, said the way a person would.
 *
 * "17 Mar" is a date you then have to subtract today from. "3 months, 12 days"
 * is the answer — and the difference matters most exactly where a date is least
 * readable: a tin at the back of the pantry, where the question is not *when*
 * it goes off but whether that is soon.
 *
 * Nearby days keep their words, because "tomorrow" beats "1 day" and nobody
 * counts a month in days once it is one. Coarse at the far end on purpose: two
 * units is a duration, three is a stopwatch reading.
 */
export function timeLeft(iso: string | null | undefined, now = new Date()): string | null {
  const days = daysUntil(iso, now);
  if (days === null) return null;

  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";

  const magnitude = Math.abs(days);
  const past = days < 0;
  const say = (value: string) => (past ? `${value} ago` : `in ${value}`);

  if (magnitude < 14) return say(`${magnitude} days`);

  if (magnitude < 60) {
    const weeks = Math.floor(magnitude / 7);
    const spare = magnitude % 7;
    return say(spare ? `${weeks} weeks, ${spare} ${plural(spare, "day")}` : `${weeks} weeks`);
  }

  // Rough months of 30 days: this is a shelf life, not an appointment, and
  // "3 months" is the useful answer whether or not February is involved.
  const months = Math.floor(magnitude / 30);
  const spare = magnitude % 30;

  if (months < 12) {
    return say(spare ? `${months} months, ${spare} ${plural(spare, "day")}` : `${months} months`);
  }

  const years = Math.floor(months / 12);
  const spareMonths = months % 12;
  return say(
    spareMonths
      ? `${years} ${plural(years, "year")}, ${spareMonths} ${plural(spareMonths, "month")}`
      : `${years} ${plural(years, "year")}`,
  );
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

/** Sooner first, undated last — an item with no date cannot be urgent. */
export function byUrgency(a: SpisoItem, b: SpisoItem): number {
  const left = daysUntil(a.expires_on);
  const right = daysUntil(b.expires_on);
  if (left === null && right === null) return a.name.localeCompare(b.name);
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right || a.name.localeCompare(b.name);
}
