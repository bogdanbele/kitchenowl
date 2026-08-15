import { byUrgency, daysUntil, type SpisoItem } from "../api/spiso";

/**
 * The kitchen arranged the way it is arranged.
 *
 * Two orders answer two questions and both are worth having. Sorted by date it
 * answers "what do I have to cook tonight"; grouped by place it answers "what
 * is in the fridge" — which is the one you want while standing in front of it,
 * or writing a list at the table.
 *
 * Inside a group the date order survives, so the thing about to go off is still
 * at the top of its shelf.
 */

/** Spiso's three fixed locations, in the order a kitchen is usually walked. */
const ORDER = ["fridge", "freezer", "pantry"];

const LABELS: Record<string, string> = {
  fridge: "Fridge",
  freezer: "Freezer",
  pantry: "Pantry",
};

export interface KitchenSpace<T> {
  /** The shelf or cupboard, as the kitchen names it. Null when unfiled. */
  space: string | null;
  items: T[];
}

export interface KitchenPlace<T> {
  location: string | null;
  label: string;
  spaces: KitchenSpace<T>[];
  count: number;
  /** How many in this place go off within two days. */
  soon: number;
}

const label = (location: string | null): string =>
  location ? (LABELS[location] ?? location.charAt(0).toUpperCase() + location.slice(1)) : "Somewhere else";

const rank = (location: string | null): number => {
  const index = location ? ORDER.indexOf(location) : -1;
  // Anything Spiso does not classify sorts last rather than first, where it
  // would push the fridge below a heading nobody was looking for.
  return index === -1 ? ORDER.length : index;
};

function goesOffSoon(item: { expires_on?: string | null }): boolean {
  const days = daysUntil(item.expires_on);
  return days !== null && days <= 2;
}

/**
 * The things that need dealing with, wherever they live.
 *
 * "3 to use in the next two days" is a fact you then have to go and find, which
 * on thirty items across four shelves is a hunt. These are pulled to the top as
 * a strip — deliberately *as well as* leaving them in their place, not instead:
 * the fridge list must stay a true account of the fridge, and a summary that
 * quietly removes rows from below it is a summary that lies twice.
 */
export function useFirst<T extends SpisoItem>(items: T[], limit = 6): T[] {
  return items.filter(goesOffSoon).sort(byUrgency).slice(0, limit);
}

export interface Slice<T> {
  shown: T[];
  hidden: number;
  /** Whether a "show more" control is worth drawing at all. */
  truncated: boolean;
}

/**
 * How much of a shelf to show before asking.
 *
 * Progressive disclosure, with three rules that stop it becoming a nuisance:
 *
 * 1. **Nothing urgent is ever hidden.** The list is in date order, so the cut
 *    is pushed past the last thing going off within two days. A fold that hides
 *    the milk defeats the entire screen.
 * 2. **Never hide one row.** Trading a row for a button costs the reader a
 *    click and saves them nothing; below two hidden it just shows them.
 * 3. **A search shows everything.** Hiding a match behind "show more" is how
 *    someone concludes the thing they searched for is not there.
 */
export function sliceShelf<T extends SpisoItem>(
  items: T[],
  { limit = 5, expanded = false, searching = false }: {
    limit?: number;
    expanded?: boolean;
    searching?: boolean;
  } = {},
): Slice<T> {
  if (expanded || searching) return { shown: items, hidden: 0, truncated: items.length > limit };

  const urgent = items.filter(goesOffSoon).length;
  const cut = Math.max(limit, urgent);
  const hidden = Math.max(0, items.length - cut);

  // One hidden row is not worth a control.
  if (hidden < 2) return { shown: items, hidden: 0, truncated: false };
  return { shown: items.slice(0, cut), hidden, truncated: true };
}

export function groupByPlace<T extends SpisoItem>(items: T[]): KitchenPlace<T>[] {
  const places = new Map<string | null, Map<string | null, T[]>>();

  for (const item of items) {
    const location = item.location?.trim() || null;
    const space = item.space?.trim() || null;
    const spaces = places.get(location) ?? new Map<string | null, T[]>();
    spaces.set(space, [...(spaces.get(space) ?? []), item]);
    places.set(location, spaces);
  }

  return [...places.entries()]
    .map(([location, spaces]) => {
      const grouped = [...spaces.entries()]
        .map(([space, list]) => ({ space, items: [...list].sort(byUrgency) }))
        .sort((a, b) => {
          // Unfiled things last: a named shelf is information, the absence of
          // one is not.
          if (a.space === null) return 1;
          if (b.space === null) return -1;
          return a.space.localeCompare(b.space);
        });

      const all = grouped.flatMap((entry) => entry.items);
      return {
        location,
        label: label(location),
        spaces: grouped,
        count: all.length,
        soon: all.filter(goesOffSoon).length,
      };
    })
    .sort((a, b) => rank(a.location) - rank(b.location) || a.label.localeCompare(b.label));
}
