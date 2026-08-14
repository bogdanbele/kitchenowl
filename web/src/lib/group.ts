import type { ShoppinglistItem } from "../api/types";

/** Groups items under their category, with uncategorised last rather than first. */
export function byCategory(items: ShoppinglistItem[]): [string, ShoppinglistItem[]][] {
  const groups = new Map<string, ShoppinglistItem[]>();
  for (const item of items) {
    const key = item.category?.name ?? "";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(item);
  }
  return [...groups.entries()].sort(([a], [b]) =>
    a === "" ? 1 : b === "" ? -1 : a.localeCompare(b),
  );
}

