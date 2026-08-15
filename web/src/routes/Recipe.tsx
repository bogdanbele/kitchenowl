import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRef, useState } from "react";
import { api } from "../api/client";
import type { Recipe as RecipeModel, RecipeItem, Shoppinglist } from "../api/types";
import { Photo } from "../components/Photo";
import { ConfirmDialog } from "../components/Modal";
import { formatTime, scaleAmount } from "../lib/amount";
import { stripMentions } from "../lib/mentions";
import { Check, ChefHat, Clock, HelpCircle, Link as LinkIcon, Minus, Sparkles, Users } from "lucide-react";
import { countMatched, matchIngredient, type IngredientMatch } from "../lib/pantryMatch";
import { normaliseName } from "../lib/cookable";
import { useInventory } from "../hooks/useInventory";
import { openRouter, suggestSubstitutions } from "../api/openrouter";
import type { Substitution } from "../lib/substitutions";

/** "panlasangpinoy.com" from a URL, or the raw string if it is not one. */
function sourceLabel(source: string): string {
  try {
    return new URL(source).hostname.replace(/^www\./, "");
  } catch {
    return source;
  }
}

/**
 * One ingredient, and what is in the kitchen that could be it.
 *
 * The match is always named rather than reduced to a tick. "You have this" is
 * only checkable if it says *what* it matched, and it does need checking —
 * "Spring onions" answering for "Onion" is wrong in a way only a cook notices.
 */
function Ingredient({
  item,
  factor,
  match,
  swap,
}: {
  item: RecipeItem;
  factor: number;
  match?: IngredientMatch;
  swap?: Substitution;
}) {
  const amount = scaleAmount(item.description, factor);
  const have = match?.kind === "exact" || match?.kind === "likely";
  const maybe = match?.kind === "possible";

  return (
    <li className="border-b border-hairline py-2.5 last:border-0">
      <div className="flex items-baseline justify-between gap-4">
        <span className="flex items-baseline gap-2">
          {match && (
            <span aria-hidden className={`shrink-0 ${have ? "text-done" : "text-faint"}`}>
              {have ? <Check size={14} /> : maybe ? <HelpCircle size={14} /> : <Minus size={14} />}
            </span>
          )}
          <span>
            {item.name}
            {item.optional && <span className="label ml-2">optional</span>}
          </span>
        </span>
        {amount && <span className="shrink-0 font-mono text-xs text-muted">{amount}</span>}
      </div>

      {match && match.kind !== "none" && (
        <p className="mt-1 pl-6 text-xs text-muted">
          {/* The thing is named unless it is spelled the same as the
              ingredient. An exact match can still be a surprise: "Eggs" matches
              "Æg" exactly once the alias is read, and "In the kitchen" alone
              would hide the one thing worth seeing. */}
          {match.kind === "possible" ? (
            <>Maybe {match.match?.name}</>
          ) : normaliseName(match.match?.name ?? "") === normaliseName(item.name) ? (
            <span className="text-done">In the kitchen</span>
          ) : (
            <>
              <span className="text-done">In the kitchen</span> as {match.match?.name}
            </>
          )}
          {match.alternatives.length > 0 && (
            <span className="text-faint">
              {" "}
              · or {match.alternatives.map((thing) => thing.name).join(", ")}
            </span>
          )}
        </p>
      )}

      {swap && (
        // Under the ingredient it replaces, because that is where the question
        // gets asked. Marked as a suggestion: it changes the dish, and the note
        // says how.
        <p className="mt-1 pl-6 text-xs">
          <span className="text-accent">Use {swap.use} instead</span>
          {swap.note && <span className="text-muted"> — {swap.note}</span>}
        </p>
      )}
    </li>
  );
}

export default function Recipe() {
  const { householdId = "1", recipeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const factorRef = useRef(1);
  const {
    data: recipe,
    isPending,
    error,
  } = useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: () => api<RecipeModel>(`/recipe/${recipeId}`),
  });

  const [servings, setServings] = useState<number | null>(null);
  const [added, setAdded] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [swaps, setSwaps] = useState<Substitution[] | null>(null);

  /**
   * Nothing is saved. A substitution is advice at the moment of cooking, and
   * editing the recipe to say bacon would be a lie about what the recipe is.
   */
  const findSwaps = useMutation({
    mutationFn: ({ dish, gaps, kitchen }: { dish: string; gaps: string[]; kitchen: string[] }) =>
      suggestSubstitutions(dish, gaps, kitchen),
    onSuccess: setSwaps,
  });

  // Shared with the inventory screen and Cook now, so opening a recipe after
  // either of those costs no request. Carries English aliases for anything the
  // kitchen calls something else.
  const { items: things } = useInventory();

  const remove = useMutation({
    mutationFn: () => api(`/recipe/${recipeId}`, { method: "DELETE" }),
    onSuccess: () => {
      // Drop the cached recipe as well as the list: navigating back to a
      // deleted recipe from history would otherwise render it from cache.
      queryClient.removeQueries({ queryKey: ["recipe", recipeId] });
      void queryClient.invalidateQueries({ queryKey: ["recipes", householdId] });
      navigate(`/household/${householdId}/recipes`, { replace: true });
    },
  });

  const { data: lists } = useQuery({
    queryKey: ["shoppinglists", householdId],
    queryFn: () => api<Shoppinglist[]>(`/household/${householdId}/shoppinglist`),
  });
  const list = lists?.[0];

  /**
   * The reason this app exists: a recipe becomes things to buy.
   *
   * Optional ingredients are left out — they are the ones you decide about at
   * the shelf, and a list padded with maybes is a list people stop trusting.
   * Amounts go over scaled, so planning for eight buys for eight. The server
   * merges an amount into whatever is already on the list rather than
   * duplicating the row.
   */
  const addToList = useMutation({
    mutationFn: (items: RecipeItem[]) =>
      api(`/shoppinglist/${list!.id}/recipeitems`, {
        method: "POST",
        body: {
          items: items.map((item) => ({
            id: item.id,
            name: item.name,
            description: scaleAmount(item.description ?? "", factorRef.current),
            optional: false,
          })),
        },
      }),
    onSuccess: (_result, items) => setAdded(items.length),
  });

  if (isPending) return <div className="h-96 animate-pulse rounded-card bg-paper-deep" />;
  if (error) return <p className="text-accent">{(error as Error).message}</p>;

  const base = recipe.yields || 1;
  const current = servings ?? base;
  const factor = current / base;
  factorRef.current = factor;

  // Recipes this app wrote carry a marker in `source`, because KitchenOwl has
  // no field for provenance and quietly passing off generated text as tested
  // cooking is the wrong default.
  const aiGenerated = !!recipe.source?.startsWith("ai://");

  // Optional ingredients are the ones you decide about at the shelf, so they
  // are left out of both the count and what gets sent.
  const required = recipe.items.filter((item) => !item.optional);

  const matches = things.length
    ? new Map(recipe.items.map((item) => [item.id, matchIngredient(item.name, things)]))
    : null;
  const haveCount = matches
    ? countMatched(required.map((item) => matches.get(item.id)!).filter(Boolean))
    : 0;

  // What the kitchen cannot answer for. A "possible" match counts as missing
  // here: if the app is only guessing, a swap is still worth offering.
  const gaps = matches
    ? required
        .filter((item) => {
          const kind = matches.get(item.id)?.kind;
          return kind !== "exact" && kind !== "likely";
        })
        .map((item) => item.name)
    : [];
  const swapFor = new Map((swaps ?? []).map((swap) => [swap.missing, swap]));

  return (
    <article className="mx-auto max-w-6xl">
      <div className="flex items-center justify-between">
        <Link
          to={`/household/${householdId}/recipes`}
          className="label transition hover:text-accent"
        >
          ← The collection
        </Link>
        <div className="flex items-center gap-5">
          {recipe.description?.trim() && (
            <Link
              to={`/household/${householdId}/recipes/${recipe.id}/cook?servings=${current}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition hover:brightness-95"
            >
              <ChefHat size={14} /> Cook this
            </Link>
          )}
          <Link
            to={`/household/${householdId}/recipes/${recipe.id}/edit`}
            className="label transition hover:text-accent"
          >
            Edit
          </Link>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="label transition hover:text-accent"
          >
            Delete
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this recipe"
        message={`Delete “${recipe.name}”? Any planner entries for it go too, and there is no undo.`}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />

      <header className="mt-6 mb-10">
        {/* A recipe title is the one thing on this page you read from two metres
            away while deciding what to cook. text-balance keeps a long Romanian
            name from breaking into a one-word orphan line. */}
        <h1 className="text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl lg:text-7xl">
          {recipe.name}
        </h1>

        <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
          {recipe.time > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Clock size={15} />
              <span className="font-medium text-ink">{formatTime(recipe.time)}</span> total
            </span>
          )}
          {recipe.prep_time > 0 && <span>{formatTime(recipe.prep_time)} prep</span>}
          {recipe.cook_time > 0 && <span>{formatTime(recipe.cook_time)} cooking</span>}
          {recipe.yields > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Users size={15} />
              serves <span className="font-medium text-ink">{recipe.yields}</span>
            </span>
          )}
          {recipe.source && !recipe.source.startsWith("ai://") && (
            <a
              href={recipe.source}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 underline underline-offset-2 transition hover:text-accent"
            >
              <LinkIcon size={14} />
              {sourceLabel(recipe.source)}
            </a>
          )}
          {aiGenerated && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-2.5 py-1 text-xs"
              title="Written by an AI model, not tested by a person"
            >
              <Sparkles size={13} className="text-accent" />
              AI-written
            </span>
          )}
        </div>
      </header>

      <Photo
        photo={recipe.photo}
        className="mb-10 aspect-[21/9] w-full rounded-card object-cover"
      />

      <div className="grid gap-10 lg:grid-cols-[21rem_1fr] lg:gap-20">
        <aside className="lg:sticky lg:top-10 lg:self-start">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-semibold tracking-tight">Ingredients</h2>
            {recipe.yields > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setServings(Math.max(1, current - 1))}
                  aria-label="Fewer servings"
                  className="size-7 rounded-card text-muted transition hover:bg-paper-deep hover:text-ink"
                >
                  −
                </button>
                <span className="min-w-8 text-center font-mono text-xs tabular-nums">
                  {current}
                </span>
                <button
                  onClick={() => setServings(current + 1)}
                  aria-label="More servings"
                  className="size-7 rounded-card text-muted transition hover:bg-paper-deep hover:text-ink"
                >
                  +
                </button>
              </div>
            )}
          </div>
          {matches && (
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs text-muted">
                {haveCount === required.length ? (
                  <span className="text-done">Everything for this is in the kitchen.</span>
                ) : (
                  <>
                    {haveCount} of {required.length} in the kitchen — matched against Foodminder.
                  </>
                )}
              </p>
              {gaps.length > 0 && openRouter.configured && swaps === null && (
                <button
                  type="button"
                  onClick={() =>
                    findSwaps.mutate({
                      dish: recipe.name,
                      gaps,
                      kitchen: things.map((thing) => thing.name),
                    })
                  }
                  disabled={findSwaps.isPending}
                  className="label inline-flex items-center gap-1.5 transition hover:text-accent disabled:opacity-50"
                >
                  <Sparkles size={12} />
                  {findSwaps.isPending ? "Thinking…" : "What could I use instead?"}
                </button>
              )}
            </div>
          )}

          {swaps !== null && swaps.length === 0 && (
            // Saying so plainly beats leaving the button looking broken. Most
            // missing ingredients have no stand-in in a given kitchen.
            <p className="mb-2 text-xs text-faint">
              Nothing in the kitchen stands in for what is missing here.
            </p>
          )}

          <ul className="rule pt-1">
            {recipe.items.map((item) => (
              <Ingredient
                key={item.id}
                item={item}
                factor={factor}
                match={matches?.get(item.id)}
                swap={swapFor.get(item.name)}
              />
            ))}
          </ul>

          {list && required.length > 0 && (
            <button
              onClick={() => addToList.mutate(required)}
              disabled={addToList.isPending || added > 0}
              className="btn-gradient mt-4 w-full rounded-card px-4 py-2.5 text-sm font-medium"
            >
              {added > 0
                ? `${added} added to the list`
                : addToList.isPending
                  ? "Adding…"
                  : `Add ${required.length} ${required.length === 1 ? "ingredient" : "ingredients"} to the list`}
            </button>
          )}
          {addToList.isError && (
            <p role="alert" className="mt-2 text-sm text-accent">
              Could not add these to the list.
            </p>
          )}
        </aside>

        {/* The description is markdown, and imported recipes now arrive as a
            real numbered list rather than one paragraph. Nothing here is
            dangerouslySetInnerHTML: react-markdown renders to elements, so a
            recipe scraped off a stranger's blog cannot inject script. */}
        <div className="prose-recipe min-w-0">
          {/* stripMentions: @onion is editor syntax, not something to read
              while cooking. */}
          <Markdown remarkPlugins={[remarkGfm]}>{stripMentions(recipe.description)}</Markdown>
        </div>
      </div>
    </article>
  );
}
