import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Shoppinglist, ShoppinglistItem } from "../api/types";
import { pantryFrom } from "../lib/cookable";

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

  return {
    pantry: pantryFrom(onList, recent),
    isPending: list != null && (onList == null || recent == null),
    knownCount: (onList?.length ?? 0) + (recent?.length ?? 0),
  };
}
