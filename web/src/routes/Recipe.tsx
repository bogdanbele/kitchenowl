import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";
import { api } from "../api/client";
import type { Recipe as RecipeModel, RecipeItem } from "../api/types";
import { photoUrl } from "../photo";

/**
 * Scale an amount with the serving count.
 *
 * Amounts are free text ("2 pound", "1 packet", "a pinch"), so only a leading
 * number is scaled and everything else is left alone. Text with no number is
 * returned untouched rather than guessed at — doubling "a pinch" means nothing.
 */
function scaleAmount(description: string, factor: number): string {
  if (factor === 1) return description;
  return description.replace(/^(\d+(?:[.,]\d+)?)/, (match) => {
    const scaled = parseFloat(match.replace(",", ".")) * factor;
    return String(Math.round(scaled * 100) / 100);
  });
}

function Ingredient({ item, factor }: { item: RecipeItem; factor: number }) {
  const amount = scaleAmount(item.description, factor);
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-0">
      <span>
        {item.name}
        {item.optional && <span className="ml-2 text-xs text-ink-soft">optional</span>}
      </span>
      {amount && <span className="shrink-0 text-sm text-ink-soft tabular-nums">{amount}</span>}
    </li>
  );
}

export default function Recipe() {
  const { householdId = "1", recipeId } = useParams();
  const { data: recipe, isPending, error } = useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: () => api<RecipeModel>(`/recipe/${recipeId}`),
  });

  const [servings, setServings] = useState<number | null>(null);

  if (isPending) return <div className="h-96 animate-pulse rounded-card bg-surface" />;
  if (error) return <p className="text-red-600 dark:text-red-400">{(error as Error).message}</p>;

  const base = recipe.yields || 1;
  const current = servings ?? base;
  const factor = current / base;
  const photo = photoUrl(recipe.photo);

  return (
    <article className="mx-auto max-w-5xl">
      <Link to={`/household/${householdId}/recipes`} className="text-sm text-ink-soft hover:text-ink">
        ← Recipes
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">{recipe.name}</h1>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
          {recipe.time > 0 && <span>{recipe.time} min total</span>}
          {recipe.prep_time > 0 && <span>{recipe.prep_time} min prep</span>}
          {recipe.cook_time > 0 && <span>{recipe.cook_time} min cooking</span>}
          {recipe.source && (
            <a
              href={recipe.source}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2 hover:text-ink"
            >
              {new URL(recipe.source).hostname.replace(/^www\./, "")}
            </a>
          )}
        </div>
      </header>

      {photo && (
        <img src={photo} alt="" className="mb-10 aspect-[21/9] w-full rounded-card object-cover" />
      )}

      <div className="grid gap-10 lg:grid-cols-[20rem_1fr] lg:gap-14">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium">Ingredients</h2>
            {recipe.yields > 0 && (
              <div className="flex items-center gap-1 rounded-full border border-line">
                <button
                  onClick={() => setServings(Math.max(1, current - 1))}
                  aria-label="Fewer servings"
                  className="size-8 rounded-full text-ink-soft transition hover:bg-canvas hover:text-ink"
                >
                  −
                </button>
                <span className="min-w-6 text-center text-sm tabular-nums">{current}</span>
                <button
                  onClick={() => setServings(current + 1)}
                  aria-label="More servings"
                  className="size-8 rounded-full text-ink-soft transition hover:bg-canvas hover:text-ink"
                >
                  +
                </button>
              </div>
            )}
          </div>
          <ul className="rounded-card border border-line bg-surface px-4">
            {recipe.items.map((item) => (
              <Ingredient key={item.id} item={item} factor={factor} />
            ))}
          </ul>
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
