import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useRef, useState } from "react";
import { api } from "../api/client";
import type { Recipe as RecipeModel, RecipeItem, Shoppinglist } from "../api/types";
import { Photo } from "../components/Photo";
import { RecipeMarkdown } from "../components/RecipeMarkdown";
import { ConfirmDialog } from "../components/Modal";
import { formatTime, scaleAmount } from "../lib/amount";
import { stripMentions } from "../lib/mentions";
import { ChefHat, Clock, Link as LinkIcon, Sparkles, Users, Video } from "lucide-react";
import {
  countMatched,
  matchIngredient,
  matchSubstitute,
  type IngredientMatch,
  type PantryThing,
} from "../lib/pantryMatch";
import { normaliseName } from "../lib/cookable";
import { useInventory } from "../hooks/useInventory";
import { isHave, overridesFor, setOverride } from "../lib/haveList";

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
  have,
  onHave,
}: {
  item: RecipeItem;
  factor: number;
  match?: IngredientMatch;
  swap?: { thing: PantryThing; substitute: string } | null;
  have: boolean;
  onHave: (have: boolean) => void;
}) {
  const amount = scaleAmount(item.description, factor);

  return (
    <li className="border-b border-hairline py-2.5 last:border-0">
      <div className="flex items-baseline justify-between gap-4">
        {/* A real checkbox, because this is a decision rather than a report. It
            starts where the matcher put it and the cook moves it: ticking the
            sinigang mix the app only guessed at, or ticking water, which no
            inventory will ever list. */}
        {/* The whole row is the target and it clears 44px. This gets tapped
            one-handed in a kitchen, where a 14px checkbox is something you miss
            twice before hitting it. The negative margin keeps the taller hit
            area from loosening the list's rhythm. */}
        <label className="-my-1.5 flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5">
          <input
            type="checkbox"
            checked={have}
            onChange={(event) => onHave(event.target.checked)}
            aria-label={`I have ${item.name}`}
            className="size-5 shrink-0 accent-done"
          />
          <span className={have ? "text-muted line-through decoration-hairline" : ""}>
            {item.name}
            {item.optional && <span className="label ml-2">optional</span>}
          </span>
        </label>
        {/* An amount is free text and some of it is a sentence — "for filling,
            or 100 g prunes puréed with a lemon". Marked shrink-0 it could not
            wrap and ran off the side of the column, taking the reader's trust
            in the layout with it. It may now shrink and wrap, but never past
            half the row, so a long amount cannot squeeze the name into a
            single letter per line. */}
        {amount && (
          <span className="max-w-[55%] text-right font-mono text-xs break-words text-muted">
            {amount}
          </span>
        )}
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

      {/* The cook's own substitutes, always listed — they are part of the
          recipe, not advice about it. When one is in the kitchen it says so,
          which is the whole reason for writing them down. */}
      {item.substitutes && item.substitutes.length > 0 && (
        <p className="mt-1 pl-6 text-xs text-muted">
          or {item.substitutes.join(", ")}
          {swap && (
            <span className="text-done"> — {swap.thing.name} is in the kitchen</span>
          )}
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
  // Only the disagreements with the matcher, kept in this browser. Whether
  // there is water at your tap is not a fact about the recipe.
  const [ticks, setTicks] = useState<Record<string, boolean>>(() => overridesFor(recipeId ?? ""));

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

  // A substitute the cook wrote down, that the kitchen actually has. Checked
  // for every ingredient, not only the missing ones, because knowing you could
  // use the bacon is worth having even when the pork belly is in the freezer.
  const swapFor = new Map(
    recipe.items.map((item) => [item.id, matchSubstitute(item.substitutes, things)]),
  );

  /**
   * What the app found, before the cook has a say: a match in the kitchen, or a
   * substitute they wrote down that is in the kitchen. The tick starts here.
   */
  const matched = (item: RecipeItem): boolean => {
    const kind = matches?.get(item.id)?.kind;
    return kind === "exact" || kind === "likely" || swapFor.get(item.id) != null;
  };
  const haveItem = (item: RecipeItem) => isHave(ticks, item.id, matched(item));

  // The list is for what is not in the house. Everything ticked — matched,
  // confirmed, or obvious like water — stays off it.
  const toBuy = required.filter((item) => !haveItem(item));

  const tick = (item: RecipeItem, have: boolean) =>
    setTicks(setOverride(recipeId ?? "", item.id, have, matched(item)));

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
                {toBuy.length === 0 ? (
                  <span className="text-done">Nothing to buy for this.</span>
                ) : (
                  <>
                    {/* Counts what is ticked, not what matched: a mix the cook
                        confirmed and the water they obviously have are both in
                        the house, whatever Foodminder knows about them. */}
                    {required.length - toBuy.length} of {required.length} in the kitchen
                    {haveCount < required.length - toBuy.length && " — including what you ticked"}
                  </>
                )}
              </p>
            </div>
          )}

          <ul className="rule pt-1">
            {recipe.items.map((item) => (
              <Ingredient
                key={item.id}
                item={item}
                factor={factor}
                match={matches?.get(item.id)}
                swap={swapFor.get(item.id)}
                have={haveItem(item)}
                onHave={(value) => tick(item, value)}
              />
            ))}
          </ul>

          {list && toBuy.length > 0 && (
            <button
              onClick={() => addToList.mutate(toBuy)}
              disabled={addToList.isPending || added > 0}
              className="btn-gradient mt-4 w-full rounded-card px-4 py-2.5 text-sm font-medium"
            >
              {added > 0
                ? `${added} added to the list`
                : addToList.isPending
                  ? "Adding…"
                  : `Add ${toBuy.length} ${toBuy.length === 1 ? "ingredient" : "ingredients"} to the list`}
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
          <RecipeMarkdown>{stripMentions(recipe.description)}</RecipeMarkdown>

          {recipe.videos && recipe.videos.length > 0 && (
            <div className="mt-10 border-t border-hairline pt-6">
              <p className="label mb-3">Videos</p>
              <ul className="space-y-2">
                {recipe.videos.map((url) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 text-sm underline underline-offset-2
                                 transition hover:text-accent"
                    >
                      <Video size={14} />
                      {sourceLabel(url)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
