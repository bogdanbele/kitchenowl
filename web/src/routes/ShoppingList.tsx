import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import type { Shoppinglist, ShoppinglistItem } from "../api/types";
import { useLiveShoppingList } from "../hooks/useLiveShoppingList";
import { byCategory } from "../lib/group";

export default function ShoppingList() {
  const { householdId = "1" } = useParams();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");

  const { data: lists } = useQuery({
    queryKey: ["shoppinglists", householdId],
    queryFn: () => api<Shoppinglist[]>(`/household/${householdId}/shoppinglist`),
  });
  const list = lists?.[0];

  const itemsKey = ["shoppinglist", list?.id];
  const { data: items, isPending } = useQuery({
    queryKey: itemsKey,
    queryFn: () => api<ShoppinglistItem[]>(`/shoppinglist/${list!.id}/items`),
    enabled: list != null,
  });

  useLiveShoppingList(list?.id);

  const { data: suggestions } = useQuery({
    queryKey: ["recent-items", list?.id],
    queryFn: () => api<ShoppinglistItem[]>(`/shoppinglist/${list!.id}/recent-items`),
    enabled: list != null,
  });

  /**
   * Both mutations update the cache immediately and reconcile afterwards.
   *
   * This screen is used standing in a shop on a phone with one bar of signal.
   * Waiting for a round trip before an item visibly ticks off makes people tap
   * twice, and the second tap is what adds a duplicate.
   */
  const add = useMutation({
    mutationFn: (name: string) =>
      api(`/shoppinglist/${list!.id}/add-item-by-name`, { method: "POST", body: { name } }),
    onMutate: async (name) => {
      await queryClient.cancelQueries({ queryKey: itemsKey });
      const previous = queryClient.getQueryData<ShoppinglistItem[]>(itemsKey) ?? [];
      // A negative id cannot collide with a real one, so the placeholder is
      // recognisable if it ever survives longer than it should.
      const optimistic: ShoppinglistItem = { id: -Date.now(), name, description: "" };
      queryClient.setQueryData<ShoppinglistItem[]>(itemsKey, [...previous, optimistic]);
      return { previous };
    },
    onError: (_error, _name, context) => queryClient.setQueryData(itemsKey, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: itemsKey }),
  });

  const remove = useMutation({
    mutationFn: (itemId: number) =>
      api(`/shoppinglist/${list!.id}/item`, { method: "DELETE", body: { item_id: itemId } }),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: itemsKey });
      const previous = queryClient.getQueryData<ShoppinglistItem[]>(itemsKey) ?? [];
      queryClient.setQueryData<ShoppinglistItem[]>(
        itemsKey,
        previous.filter((item) => item.id !== itemId),
      );
      return { previous };
    },
    onError: (_error, _id, context) => queryClient.setQueryData(itemsKey, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: itemsKey }),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const name = draft.trim();
    if (!name) return;
    add.mutate(name);
    setDraft("");
  }

  if (!list) return <div className="h-64 animate-pulse rounded-card bg-paper-deep" />;

  const groups = byCategory(items ?? []);
  const alreadyOnList = new Set((items ?? []).map((item) => item.name.toLowerCase()));
  const quickAdd = (suggestions ?? [])
    .filter((item) => !alreadyOnList.has(item.name.toLowerCase()))
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="label">Shopping · {list.name}</p>
      <h1 className="mt-1 mb-8 text-4xl font-semibold tracking-tight">
        {items?.length ? `${items.length} to buy` : "Nothing to buy"}
      </h1>

      <form onSubmit={onSubmit} className="mb-8 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add an item…"
          aria-label="Add an item"
          className="flex-1 rounded-card border border-hairline bg-paper-deep px-4 py-3 outline-none
                     placeholder:text-faint focus:border-accent"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="btn-gradient rounded-card px-5 py-3 font-medium"
        >
          Add
        </button>
      </form>

      {isPending ? (
        <div className="h-40 animate-pulse rounded-card bg-paper-deep" />
      ) : (
        groups.map(([category, groupItems]) => (
          <section key={category} className="mb-8">
            <p className="label mb-2">{category || "Everything else"}</p>
            <ul className="rule">
              {groupItems.map((item) => (
                <li key={item.id} className="border-b border-hairline">
                  {/* The whole row is the target. Ticking something off in a
                      shop happens one-handed, often without looking properly. */}
                  <button
                    onClick={() => remove.mutate(item.id)}
                    className="group flex w-full items-baseline gap-3 py-3 text-left"
                  >
                    <span
                      className="mt-0.5 size-4 shrink-0 self-center rounded-sm border border-line
                                 transition group-hover:border-done group-hover:bg-done/20"
                    />
                    <span className="flex-1">{item.name}</span>
                    {item.description && (
                      <span className="font-mono text-xs text-muted">{item.description}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {quickAdd.length > 0 && (
        <section className="mt-10">
          <p className="label mb-3">Bought recently</p>
          <div className="flex flex-wrap gap-2">
            {quickAdd.map((item) => (
              <button
                key={item.id}
                onClick={() => add.mutate(item.name)}
                className="rounded-full border border-hairline px-3 py-1.5 text-sm text-muted
                           transition hover:border-accent hover:text-accent"
              >
                {item.name}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
