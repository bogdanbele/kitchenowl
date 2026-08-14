import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";
import { api } from "../api/client";
import type { Recipe as RecipeModel, RecipeItem } from "../api/types";
import { Photo } from "../components/Photo";

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
  const {
    data: recipe,
    isPending,
    error,
  } = useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: () => api<RecipeModel>(`/recipe/${recipeId}`),
  });

  const [servings, setServings] = useState<number | null>(null);

  if (isPending) return <div className="h-96 animate-pulse rounded-card bg-paper-deep" />;
  if (error) return <p className="text-accent">{(error as Error).message}</p>;

  const base = recipe.yields || 1;
  const current = servings ?? base;
  const factor = current / base;

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
