import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRef, useState } from "react";
import { api } from "../api/client";
import type { Recipe as RecipeModel, RecipeItem, Shoppinglist } from "../api/types";
import { Photo } from "../components/Photo";
import { scaleAmount } from "../lib/amount";

function Ingredient({ item, factor }: { item: RecipeItem; factor: number }) {
  const amount = scaleAmount(item.description, factor);
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-hairline py-2.5 last:border-0">
      <span>
        {item.name}
        {item.optional && <span className="label ml-2">optional</span>}
      </span>
      {amount && <span className="shrink-0 font-mono text-xs text-muted">{amount}</span>}
    </li>
  );
}

export default function Recipe() {
  const { householdId = "1", recipeId } = useParams();
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

  return (
    <article className="mx-auto max-w-5xl">
      <div className="flex items-center justify-between">
        <Link
          to={`/household/${householdId}/recipes`}
          className="label transition hover:text-accent"
        >
          ← The collection
        </Link>
        <Link
          to={`/household/${householdId}/recipes/${recipe.id}/edit`}
          className="label transition hover:text-accent"
        >
          Edit
        </Link>
      </div>

      <header className="mt-5 mb-8">
        <h1 className="text-5xl font-semibold tracking-tight text-balance">{recipe.name}</h1>
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] text-muted">
          {recipe.time > 0 && <span>{recipe.time} min total</span>}
          {recipe.prep_time > 0 && <span>{recipe.prep_time} min prep</span>}
          {recipe.cook_time > 0 && <span>{recipe.cook_time} min cooking</span>}
          {recipe.source && (
            <a
              href={recipe.source}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2 transition hover:text-accent"
            >
              {new URL(recipe.source).hostname.replace(/^www\./, "")}
            </a>
          )}
        </div>
      </header>

      <Photo
        photo={recipe.photo}
        className="mb-10 aspect-[21/9] w-full rounded-card object-cover"
      />

      <div className="grid gap-10 lg:grid-cols-[19rem_1fr] lg:gap-16">
        <aside className="lg:sticky lg:top-10 lg:self-start">
          <div className="mb-3 flex items-center justify-between">
            <p className="label">Ingredients</p>
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
          <ul className="rule pt-1">
            {recipe.items.map((item) => (
              <Ingredient key={item.id} item={item} factor={factor} />
            ))}
          </ul>

          {list && recipe.items.some((item) => !item.optional) && (
            <button
              onClick={() =>
                addToList.mutate(recipe.items.filter((item) => !item.optional))
              }
              disabled={addToList.isPending || added > 0}
              className="btn-gradient mt-4 w-full rounded-card px-4 py-2.5 text-sm font-medium"
            >
              {added > 0
                ? `${added} added to the list`
                : addToList.isPending
                  ? "Adding…"
                  : `Add ${recipe.items.filter((item) => !item.optional).length} ingredients to the list`}
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
          <Markdown remarkPlugins={[remarkGfm]}>{recipe.description}</Markdown>
        </div>
      </div>
    </article>
  );
}
