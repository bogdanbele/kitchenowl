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
 * Only the name half filters. What follows the comma is the amount you are
 * about to add, not a search term — requiring it too made typing "flour, 2 bags"
 * report "nothing matching flour" directly under a field saying flour was
 * already on the list, which is the app arguing with itself.
 *
 * The item's own description is still searched, because "semi" is how you find
 * the milk you wrote "2 semi skimmed" against.
 */
export function matchItems(items: ShoppinglistItem[], raw: string): ShoppinglistItem[] {
  const { name } = parseItemInput(raw.toLowerCase());
  if (!name) return items;

  return items.filter((item) =>
    `${item.name} ${item.description}`.toLowerCase().includes(name),
  );
}

/** True when what was typed already exists on the list, so adding would duplicate. */
export function alreadyListed(items: ShoppinglistItem[], raw: string): boolean {
  const { name } = parseItemInput(raw);
  if (!name) return false;
  return items.some((item) => item.name.toLowerCase() === name.toLowerCase());
}
