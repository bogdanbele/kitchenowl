import type { ShoppinglistItem } from "../api/types";

/**
 * One field does both jobs on this screen: it filters the list while you type,
 * and it adds what you typed when you press enter.
 *
 * The comma splits the name from the amount — "milk, 2 semi skimmed" is the item
 * "milk" with the description "2 semi skimmed". This is the Flutter app's
 * convention and worth keeping: people who know it type an amount without ever
 * opening a second field, and people who don't get an item named "milk" either
 * way, because only the first comma counts.
 */
export interface ItemInput {
  name: string;
  description: string;
}

export function parseItemInput(raw: string): ItemInput {
  const at = raw.indexOf(",");
  if (at === -1) return { name: raw.trim(), description: "" };
  return {
    name: raw.slice(0, at).trim(),
    description: raw.slice(at + 1).trim(),
  };
}

/**
 * Filter the list by what has been typed.
 *
 * Matching is on the name *and* the description, because "semi" is how you find
 * the milk you wrote "2 semi skimmed" against. The typed description is matched
 * too, so "milk, semi" narrows rather than finding nothing.
 */
export function matchItems(items: ShoppinglistItem[], raw: string): ShoppinglistItem[] {
  const { name, description } = parseItemInput(raw.toLowerCase());
  if (!name && !description) return items;

  return items.filter((item) => {
    const haystack = `${item.name} ${item.description}`.toLowerCase();
    return (
      haystack.includes(name) && (!description || haystack.includes(description))
    );
  });
}

/** True when what was typed already exists on the list, so adding would duplicate. */
export function alreadyListed(items: ShoppinglistItem[], raw: string): boolean {
  const { name } = parseItemInput(raw);
  if (!name) return false;
  return items.some((item) => item.name.toLowerCase() === name.toLowerCase());
}
