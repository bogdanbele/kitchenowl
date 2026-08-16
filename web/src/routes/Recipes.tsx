import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { api } from "../api/client";
import type { Recipe } from "../api/types";
import { Photo } from "../components/Photo";
import { formatTime } from "../lib/amount";
import { rankCookable } from "../lib/cookable";
import { usePantry } from "../hooks/usePantry";
import { openRouter, suggestTags } from "../api/openrouter";
import { derivedTags, mergeTags } from "../lib/recipeTags";
import { Modal } from "../components/Modal";
import { Sparkles } from "lucide-react";

function RecipeCard({
  recipe,
  householdId,
  footer,
}: {
  recipe: Recipe;
  householdId: string;
  footer?: React.ReactNode;
}) {
  const time = formatTime(recipe.time);

  // A tinted initial rather than a broken-image icon: a hand-typed recipe with
  // no picture still has to hold the card's shape.
  const placeholder = (
    <div className="gradient-surface grid h-full w-full place-items-center">
      <span className="font-display text-4xl text-white/90">{recipe.name.charAt(0)}</span>
    </div>
  );

  return (
    <Link
      to={`/household/${householdId}/recipes/${recipe.id}`}
      className="group block overflow-hidden rounded-2xl border border-hairline bg-paper-deep
                 transition hover:border-accent"
    >
      {/* The picture leads. A recipe is chosen by looking, and a list of names
          with 80px thumbnails asks you to read where you would rather look —
          which is the whole point of finding a photo for every one of them. */}
      <div className="aspect-[16/10] w-full overflow-hidden">
        <Photo
          photo={recipe.photo}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
          fallback={placeholder}
        />
      </div>

      <div className="p-4">
        <h2 className="font-display text-lg leading-tight font-semibold transition group-hover:text-accent">
          {recipe.name}
        </h2>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {time && (
            <span className="rounded-full bg-paper px-2 py-0.5 font-mono text-[11px] text-muted">
              {time}
            </span>
          )}
          {recipe.yields > 0 && (
            <span className="rounded-full bg-paper px-2 py-0.5 font-mono text-[11px] text-muted">
              serves {recipe.yields}
            </span>
          )}
          {/* Two tags, not five: the rest are for the filter above, and a card
              wearing every label it owns stops being scannable. */}
          {recipe.tags?.slice(0, 2).map((tag) => (
            <span
              key={tag.id}
              className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent"
            >
              {tag.name}
            </span>
          ))}
        </div>
        {footer}
      </div>
    </Link>
  );
}

export default function Recipes() {
  const { householdId = "1" } = useParams();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "cookable">("all");
  const [chosenTags, setChosenTags] = useState<string[]>([]);
  const [proposals, setProposals] = useState<{ recipe: Recipe; tags: string[] }[] | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const queryClient = useQueryClient();

  /**
   * Read the collection and propose tags, without writing anything.
   *
   * Nothing is saved until the proposals have been looked at. A pass that
   * silently relabels forty recipes is one you cannot check and cannot undo,
   * and a wrong cuisine is quieter than a wrong ingredient — nobody notices
   * until a filter comes back empty.
   *
   * Recipes are done one at a time on purpose: a single request holding forty
   * answers in order goes wrong all at once, and one slip shifts every label
   * onto the wrong dish.
   */
  const readAll = useMutation({
    mutationFn: async (recipes: Recipe[]) => {
      const found: { recipe: Recipe; tags: string[] }[] = [];
      setProgress({ done: 0, total: recipes.length });
      for (const [index, recipe] of recipes.entries()) {
        const suggested = await suggestTags(recipe).catch(() => []);
        const merged = mergeTags(
          (recipe.tags ?? []).map((tag) => tag.name),
          [...suggested, ...derivedTags(recipe)],
        );
        // Only recipes that would actually change are worth showing.
        if (merged.length > (recipe.tags ?? []).length) found.push({ recipe, tags: merged });
        setProgress({ done: index + 1, total: recipes.length });
      }
      return found;
    },
    onSuccess: (found) => {
      setProgress(null);
      setProposals(found);
    },
    onError: () => setProgress(null),
  });

  const applyAll = useMutation({
    mutationFn: async (found: { recipe: Recipe; tags: string[] }[]) => {
      for (const entry of found) {
        // Tags only. Sending the whole recipe back would put every other field
        // through a round trip it did not need.
        await api(`/recipe/${entry.recipe.id}`, { method: "POST", body: { tags: entry.tags } });
      }
    },
    onSuccess: () => {
      setProposals(null);
      void queryClient.invalidateQueries({ queryKey: ["recipes", householdId] });
    },
  });
  const { data, isPending, error } = useQuery({
    queryKey: ["recipes", householdId],
    queryFn: () => api<Recipe[]>(`/household/${householdId}/recipe`),
  });
  const { pantry, knownCount, source } = usePantry(householdId);

  // Filtering happens here rather than through /recipe/search: the list is a
  // household's own recipes, which is tens of items, and a local filter answers
  // on every keystroke without a request per letter.
  const visible = (data ?? [])
    .filter((recipe) => recipe.name.toLowerCase().includes(query.trim().toLowerCase()))
    // Every chosen tag must be present, not any: picking Vegan and Soup means
    // a vegan soup. "Any" would widen the list with each click, which is the
    // opposite of what pressing a filter feels like it should do.
    .filter((recipe) =>
      chosenTags.every((chosen) =>
        (recipe.tags ?? []).some((tag) => tag.name.toLowerCase() === chosen.toLowerCase()),
      ),
    );

  // Only tags actually in use, ordered by how much of the collection they
  // cover: a filter nobody can press is furniture.
  const tagCounts = new Map<string, number>();
  for (const recipe of data ?? []) {
    for (const tag of recipe.tags ?? []) {
      tagCounts.set(tag.name, (tagCounts.get(tag.name) ?? 0) + 1);
    }
  }
  const tags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 14);
  const ranked = mode === "cookable" ? rankCookable(visible, pantry) : [];

  const review = (
    <Modal
      open={proposals !== null}
      onClose={() => setProposals(null)}
      title={
        proposals?.length
          ? `Tags for ${proposals.length} ${proposals.length === 1 ? "recipe" : "recipes"}`
          : "Nothing to change"
      }
      wide
    >
      {proposals?.length ? (
        <>
          <p className="mb-4 text-sm text-muted">
            Nothing has been saved yet. Existing tags are kept — these are the additions.
          </p>
          <ul className="rule mb-6 max-h-80 overflow-auto">
            {proposals.map(({ recipe, tags }) => {
              const had = new Set((recipe.tags ?? []).map((tag) => tag.name));
              return (
                <li key={recipe.id} className="border-b border-hairline py-2.5">
                  <p className="text-sm">{recipe.name}</p>
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          had.has(tag) ? "text-faint" : "bg-accent-soft text-accent"
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="flex gap-3">
            <button
              onClick={() => applyAll.mutate(proposals)}
              disabled={applyAll.isPending}
              className="btn-gradient rounded-card px-5 py-2.5 font-medium disabled:opacity-60"
            >
              {applyAll.isPending ? "Saving…" : "Apply"}
            </button>
            <button
              onClick={() => setProposals(null)}
              className="rounded-card border border-hairline px-5 py-2.5 text-muted transition hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">
          Every recipe already carries the tags this would add.
        </p>
      )}
    </Modal>
  );

  return (
    <div className="mx-auto max-w-5xl">
      {review}
      <div className="flex items-end justify-between">
        <div>
          <p className="label">The collection</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">Recipes</h1>
        </div>
        <div className="mb-1 flex items-center gap-3">
          {openRouter.configured && (data?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => readAll.mutate(data ?? [])}
              disabled={readAll.isPending}
              className="label inline-flex items-center gap-1.5 transition hover:text-accent disabled:opacity-50"
            >
              <Sparkles size={12} />
              {progress ? `Reading ${progress.done}/${progress.total}` : "Tag with AI"}
            </button>
          )}
          <Link
            to={`/household/${householdId}/recipes/new`}
            className="btn-gradient rounded-card px-4 py-2 text-sm font-medium"
          >
            New recipe
          </Link>
        </div>
      </div>
      <div className="mb-8" />

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
        aria-label="Search recipes"
        className="mb-2 w-full border-b border-hairline bg-transparent py-2 outline-none
                   placeholder:text-faint focus:border-accent"
      />

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-3">
          {tags.map(([tag, count]) => {
            const on = chosenTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() =>
                  setChosenTags((current) =>
                    on ? current.filter((entry) => entry !== tag) : [...current, tag],
                  )
                }
                aria-pressed={on}
                className={`rounded-full px-2.5 py-1 text-xs transition ${
                  on
                    ? "bg-accent-soft text-accent"
                    : "border border-hairline text-muted hover:border-accent hover:text-ink"
                }`}
              >
                {tag} <span className="font-mono text-[10px] text-faint">{count}</span>
              </button>
            );
          })}
          {chosenTags.length > 0 && (
            <button
              type="button"
              onClick={() => setChosenTags([])}
              className="px-2 py-1 text-xs text-muted transition hover:text-accent"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 py-3">
        {(["all", "cookable"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            aria-pressed={mode === option}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              mode === option
                ? "btn-gradient"
                : "border border-hairline text-muted hover:border-accent hover:text-ink"
            }`}
          >
            {option === "all" ? "All recipes" : "Cook now"}
          </button>
        ))}
        {mode === "cookable" && (
          <span className="ml-1 font-mono text-[11px] text-faint">
            {source === "inventory"
              ? `from ${knownCount} things in your kitchen`
              : `from ${knownCount} items on the list and recently bought`}
          </span>
        )}
      </div>

      {isPending ? (
        <div className="space-y-4 pt-6">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-card bg-paper-deep" />
          ))}
        </div>
      ) : error ? (
        <p className="pt-6 text-accent">{(error as Error).message}</p>
      ) : mode === "cookable" ? (
        ranked.length === 0 ? (
          <p className="pt-6 text-muted">
            Nothing matches what you have yet. Add a few things to the shopping list — this looks at
            what is on it and what you bought recently.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {ranked.map(({ recipe, missing, readiness }) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                householdId={householdId}
                footer={
                  <div className="mt-3">
                    <div className="h-1 w-full overflow-hidden rounded-full bg-paper-deep">
                      <div
                        className="h-full rounded-full bg-accent transition-[width]"
                        style={{ width: `${Math.round(readiness * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-muted">
                      {missing.length === 0 ? (
                        <span className="text-accent">You have everything.</span>
                      ) : (
                        <>
                          Missing {missing.length}:{" "}
                          {missing
                            .slice(0, 4)
                            .map((item) => item.name)
                            .join(", ")}
                          {missing.length > 4 && ` and ${missing.length - 4} more`}
                        </>
                      )}
                    </p>
                  </div>
                }
              />
            ))}
          </div>
        )
      ) : visible.length === 0 ? (
        <p className="pt-6 text-muted">
          {query ? `Nothing matching “${query}”.` : "No recipes yet."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} householdId={householdId} />
          ))}
        </div>
      )}
    </div>
  );
}
