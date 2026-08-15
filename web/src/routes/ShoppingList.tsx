import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useMemo, useState, type FormEvent } from "react";
import { ArrowDownAZ, LayoutGrid, Pencil } from "lucide-react";
import { api } from "../api/client";
import type { Shoppinglist, ShoppinglistItem } from "../api/types";
import { useLiveShoppingList } from "../hooks/useLiveShoppingList";
import { byCategory } from "../lib/group";
import { alreadyListed, matchItems, parseItemInput } from "../lib/itemInput";
import { ItemDetail } from "../components/ItemDetail";
import { ConfirmDialog } from "../components/Modal";

type SortMode = "category" | "name";

export default function ShoppingList() {
  const { householdId = "1" } = useParams();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [listId, setListId] = useState<number | null>(null);
  const [sort, setSort] = useState<SortMode>("category");
  const [editing, setEditing] = useState<ShoppinglistItem | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const { data: lists } = useQuery({
    queryKey: ["shoppinglists", householdId],
    queryFn: () => api<Shoppinglist[]>(`/household/${householdId}/shoppinglist`),
  });
  // Households usually have one list; the selector only earns its space when
  // there is a second one, but the state has to exist either way.
  const list = lists?.find((candidate) => candidate.id === listId) ?? lists?.[0];

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
    mutationFn: (raw: string) => {
      const { name, description } = parseItemInput(raw);
      return api(`/shoppinglist/${list!.id}/add-item-by-name`, {
        method: "POST",
        body: description ? { name, description } : { name },
      });
    },
    onMutate: async (raw) => {
      await queryClient.cancelQueries({ queryKey: itemsKey });
      const previous = queryClient.getQueryData<ShoppinglistItem[]>(itemsKey) ?? [];
      const { name, description } = parseItemInput(raw);
      // A negative id cannot collide with a real one, so the placeholder is
      // recognisable if it ever survives longer than it should.
      const optimistic: ShoppinglistItem = { id: -Date.now(), name, description };
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

  /**
   * Clearing the list is one request, not one per item.
   *
   * Each removal is also a history entry, and the backend stamps `removed_at`
   * from the request, so sending them individually over a slow connection
   * scatters a single "unpacked the shopping" across several minutes and
   * corrupts the recent-items order.
   */
  const clearAll = useMutation({
    mutationFn: (toRemove: ShoppinglistItem[]) =>
      api(`/shoppinglist/${list!.id}/items`, {
        method: "DELETE",
        body: {
          items: toRemove.map((item) => ({ item_id: item.id, removed_at: Date.now() })),
        },
      }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: itemsKey });
      const previous = queryClient.getQueryData<ShoppinglistItem[]>(itemsKey) ?? [];
      queryClient.setQueryData<ShoppinglistItem[]>(itemsKey, []);
      return { previous };
    },
    onError: (_error, _items, context) => queryClient.setQueryData(itemsKey, context?.previous),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: itemsKey });
      void queryClient.invalidateQueries({ queryKey: ["recent-items", list?.id] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const { name } = parseItemInput(draft);
    if (!name) return;
    add.mutate(draft);
    setDraft("");
  }

  const visible = useMemo(() => matchItems(items ?? [], draft), [items, draft]);
  const groups = useMemo(
    () =>
      sort === "category"
        ? byCategory(visible)
        : ([["", [...visible].sort((a, b) => a.name.localeCompare(b.name))]] as [
            string,
            ShoppinglistItem[],
          ][]),
    [visible, sort],
  );

  if (!list) return <div className="h-64 animate-pulse rounded-card bg-paper-deep" />;

  const alreadyOnList = new Set((items ?? []).map((item) => item.name.toLowerCase()));
  const quickAdd = (suggestions ?? [])
    .filter((item) => !alreadyOnList.has(item.name.toLowerCase()))
    .slice(0, 8);
  const typed = parseItemInput(draft);
  const canAddTyped = typed.name.length > 0 && !alreadyListed(items ?? [], draft);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="label">Shopping · {list.name}</p>
      <h1 className="mt-1 mb-6 text-4xl font-semibold tracking-tight">
        {items?.length ? `${items.length} to buy` : "Nothing to buy"}
      </h1>

      {(lists?.length ?? 0) > 1 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {lists!.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setListId(candidate.id)}
              aria-pressed={candidate.id === list.id}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                candidate.id === list.id
                  ? "btn-gradient"
                  : "border border-hairline text-muted hover:border-accent hover:text-ink"
              }`}
            >
              {candidate.name}
            </button>
          ))}
        </div>
      )}

      {/* One field: it filters while you type and adds what you typed on enter.
          Two fields would mean deciding which one to use before knowing whether
          the thing is already on the list. */}
      <form onSubmit={onSubmit} className="mb-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add or find an item…"
          aria-label="Add or find an item"
          className="flex-1 rounded-card border border-hairline bg-paper-deep px-4 py-3 outline-none
                     placeholder:text-faint focus:border-accent"
        />
        <button
          type="submit"
          disabled={!canAddTyped}
          className="btn-gradient rounded-card px-5 py-3 font-medium disabled:opacity-50"
        >
          Add
        </button>
      </form>
      <p className="mb-6 h-4 text-xs text-faint">
        {draft.trim() && !canAddTyped
          ? `“${typed.name}” is already on the list.`
          : typed.description
            ? `Adds ${typed.name} — ${typed.description}`
            : "Tip: a comma adds the amount — milk, 2 semi skimmed"}
      </p>

      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSort(sort === "category" ? "name" : "category")}
          className="flex items-center gap-1.5 text-xs text-muted transition hover:text-accent"
        >
          {sort === "category" ? <LayoutGrid size={13} /> : <ArrowDownAZ size={13} />}
          {sort === "category" ? "By category" : "A–Z"}
        </button>
        {(items?.length ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="ml-auto text-xs text-muted transition hover:text-accent"
          >
            Clear the list
          </button>
        )}
      </div>

      {isPending ? (
        <div className="h-40 animate-pulse rounded-card bg-paper-deep" />
      ) : visible.length === 0 ? (
        <p className="py-6 text-muted">
          {draft.trim() ? `Nothing on the list matching “${typed.name}”.` : "Nothing to buy."}
        </p>
      ) : (
        groups.map(([category, groupItems]) => (
          <section key={category} className="mb-8">
            {sort === "category" && <p className="label mb-2">{category || "Everything else"}</p>}
            <ul className="rule">
              {groupItems.map((item) => (
                <li key={item.id} className="flex items-center border-b border-hairline">
                  {/* The row is the target. Ticking something off in a shop
                      happens one-handed, often without looking properly — so
                      editing lives behind its own small button rather than
                      sharing the tap. */}
                  <button
                    onClick={() => remove.mutate(item.id)}
                    className="group flex flex-1 items-baseline gap-3 py-3 text-left"
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
                  <button
                    type="button"
                    onClick={() => setEditing(item)}
                    aria-label={`Edit ${item.name}`}
                    className="p-2 text-faint transition hover:text-accent"
                  >
                    <Pencil size={14} />
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

      <ItemDetail
        item={editing}
        listId={list.id}
        householdId={householdId}
        onClose={() => setEditing(null)}
        onRemove={(itemId) => remove.mutate(itemId)}
      />

      <ConfirmDialog
        open={confirmClear}
        title="Clear the list"
        message={`Tick off all ${items?.length ?? 0} items? They stay in "bought recently", so putting one back is one tap.`}
        confirmLabel="Clear"
        onConfirm={() => {
          clearAll.mutate(items ?? []);
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
