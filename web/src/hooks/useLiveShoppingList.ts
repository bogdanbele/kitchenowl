import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectLive, type ShoppinglistEvent } from "../api/live";
import type { ShoppinglistItem } from "../api/types";

/**
 * Keeps one shopping list in step with everyone else's copy of it.
 *
 * Events are applied to the cache directly rather than triggering a refetch:
 * the payload already carries the whole item, and refetching on every event
 * would turn one person filling a list into a request per keystroke for
 * everybody else.
 */
export function useLiveShoppingList(listId: number | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (listId === undefined) return;
    const socket = connectLive();
    if (!socket) return;

    const key = ["shoppinglist", listId];

    const onAdd = (event: ShoppinglistEvent) => {
      if (event.shoppinglist?.id !== listId) return;
      queryClient.setQueryData<ShoppinglistItem[]>(key, (current) => {
        const items = current ?? [];
        // The server echoes our own writes back to us. Without this check an
        // item we just added optimistically appears twice until the next
        // refetch — and briefly with two different ids.
        if (items.some((item) => item.id === event.item.id)) return items;
        return [...items, event.item];
      });
    };

    const onRemove = (event: ShoppinglistEvent) => {
      if (event.shoppinglist?.id !== listId) return;
      queryClient.setQueryData<ShoppinglistItem[]>(key, (current) =>
        (current ?? []).filter((item) => item.id !== event.item.id),
      );
    };

    socket.on("shoppinglist_item:add", onAdd);
    socket.on("shoppinglist_item:remove", onRemove);

    // A socket that dropped may have missed events entirely, so the list is
    // refetched on reconnect. Replaying is not possible: the server emits, it
    // does not queue.
    const onReconnect = () => queryClient.invalidateQueries({ queryKey: key });
    socket.io.on("reconnect", onReconnect);

    return () => {
      socket.off("shoppinglist_item:add", onAdd);
      socket.off("shoppinglist_item:remove", onRemove);
      socket.io.off("reconnect", onReconnect);
    };
  }, [listId, queryClient]);
}
