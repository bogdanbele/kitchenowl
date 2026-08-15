import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../api/client";
import type { Category, ShoppinglistItem } from "../api/types";
import { Field, Select } from "./Field";
import { Modal } from "./Modal";
import { notify } from "./Toast";

/**
 * Everything about one item, in one sheet.
 *
 * The list row itself is a single big "got it" target — that is what the screen
 * is for while standing in a shop — so all the editing lives here, behind the
 * row's own button. Two things are being edited at once and they are stored in
 * different places: the amount belongs to this item *on this list*, while the
 * name and category belong to the household's catalogue and change everywhere
 * the item appears. The dialog says so, because renaming "Milk" from a shopping
 * list and finding it renamed in four recipes is a nasty surprise.
 */
export function ItemDetail({
  item,
  listId,
  householdId,
  onClose,
  onRemove,
}: {
  item: ShoppinglistItem | null;
  listId: number;
  householdId: string;
  onClose: () => void;
  onRemove: (itemId: number) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");

  // Reset when a different item opens the same dialog.
  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setDescription(item.description ?? "");
    setCategoryId(item.category ? String(item.category.id) : "");
  }, [item]);

  const { data: categories } = useQuery({
    queryKey: ["categories", householdId],
    queryFn: () => api<Category[]>(`/household/${householdId}/category`),
    enabled: item != null,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!item) return;
      const trimmed = name.trim();

      // The catalogue and the list entry are two requests because they are two
      // different resources; only send each one if it actually changed.
      if (trimmed && trimmed !== item.name) {
        await api(`/item/${item.id}`, { method: "POST", body: { name: trimmed } });
      }
      const nextCategory = categoryId ? Number(categoryId) : null;
      if (nextCategory !== (item.category?.id ?? null)) {
        await api(`/item/${item.id}`, {
          method: "POST",
          body: { category: nextCategory ? { id: nextCategory } : null },
        });
      }
      if (description !== (item.description ?? "")) {
        await api(`/shoppinglist/${listId}/item/${item.id}`, {
          method: "POST",
          body: { description },
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shoppinglist", listId] });
      void queryClient.invalidateQueries({ queryKey: ["items", householdId] });
      onClose();
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      notify("An item needs a name.");
      return;
    }
    save.mutate();
  }

  return (
    <Modal open={item != null} onClose={onClose} title={item?.name ?? "Item"}>
      <form onSubmit={onSubmit}>
        <Field
          label="Amount"
          hint="Only on this list."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="2 bottles, ripe, the big bag…"
        />

        <Field label="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <Select
          label="Category"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
        >
          <option value="">No category</option>
          {(categories ?? []).map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
        <p className="-mt-3 mb-5 text-xs text-faint">
          The name and category belong to the whole household, so they change everywhere this item
          is used.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={save.isPending}
            className="btn-gradient rounded-card px-5 py-2.5 font-medium disabled:opacity-60"
          >
            {save.isPending ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => {
              if (item) onRemove(item.id);
              onClose();
            }}
            className="ml-auto flex items-center gap-1.5 text-sm text-muted transition hover:text-accent"
          >
            <Trash2 size={14} /> Remove from list
          </button>
        </div>
      </form>
    </Modal>
  );
}
