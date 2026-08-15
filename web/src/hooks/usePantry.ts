import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Shoppinglist, ShoppinglistItem } from "../api/types";
import { pantryFrom, pantryNames } from "../lib/cookable";
import { spisoApi } from "../api/spiso";

/**
 * A guess at what the kitchen holds.
 *
 * There is no pantry in the data model, so this stands in for one: what is on
 * the list (about to be bought) plus what was bought recently. The query keys
 * match the shopping list's own, so opening this after the list costs nothing.
 */
export function usePantry(householdId: string) {
  const { data: lists } = useQuery({
    queryKey: ["shoppinglists", householdId],
    queryFn: () => api<Shoppinglist[]>(`/household/${householdId}/shoppinglist`),
  });
  const list = lists?.[0];

  const { data: onList } = useQuery({
    queryKey: ["shoppinglist", list?.id],
    queryFn: () => api<ShoppinglistItem[]>(`/shoppinglist/${list!.id}/items`),
    enabled: list != null,
  });

  const { data: recent } = useQuery({
    queryKey: ["recent-items", list?.id],
    queryFn: () => api<ShoppinglistItem[]>(`/shoppinglist/${list!.id}/recent-items`),
    enabled: list != null,
  });

  /**
   * A real inventory beats the guess.
   *
   * When Foodminder is connected this stops being an approximation: those are
   * things someone scanned into the kitchen, with dates. The shopping-list
   * guess is dropped entirely rather than merged — a recipe ranked as cookable
   * because you bought flour three weeks ago is exactly the wrong answer once
   * the app can see there is none.
   */
  const { data: inventory } = useQuery({
    queryKey: ["spiso-inventory"],
    queryFn: spisoApi.inventory,
    staleTime: 60_000,
    // 404 is "not connected", which is the ordinary case, not an error worth
    // retrying or shouting about.
    retry: false,
  });

  const fromInventory = inventory?.items?.length
    ? new Set(inventory.items.flatMap((item) => pantryNames(item.name)))
    : null;

  return {
    pantry: fromInventory ?? pantryFrom(onList, recent),
    source: fromInventory ? ("inventory" as const) : ("history" as const),
    isPending: list != null && (onList == null || recent == null),
    // Things, not names. The pantry set holds a head noun alongside each full
    // name, so its size is close to double and "from 58 things in your kitchen"
    // would be a lie about a fridge holding thirty.
    knownCount: fromInventory
      ? (inventory?.items?.length ?? 0)
      : (onList?.length ?? 0) + (recent?.length ?? 0),
  };
}
