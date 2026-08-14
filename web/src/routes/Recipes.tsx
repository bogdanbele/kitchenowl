import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { api } from "../api/client";
import type { Recipe } from "../api/types";
import { Photo } from "../components/Photo";
import { formatTime } from "../lib/amount";
import { rankCookable } from "../lib/cookable";
import { usePantry } from "../hooks/usePantry";

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

  // A tinted initial rather than a broken-image icon: most hand-typed recipes
  // have no photo, and the row should still hold its shape.
  const placeholder = (
    <div className="gradient-surface grid size-20 shrink-0 place-items-center rounded-card opacity-90">
      <span className="font-display text-xl text-white/90">{recipe.name.charAt(0)}</span>
    </div>
  );

  return (
    <Link
      to={`/household/${householdId}/recipes/${recipe.id}`}
      className="group block border-b border-hairline py-5 transition hover:border-accent"
    >
      <div className="flex items-start gap-5">
        <Photo
          photo={recipe.photo}
          className="size-20 shrink-0 rounded-card object-cover"
          fallback={placeholder}
        />

        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl leading-tight font-semibold transition group-hover:text-accent">
            {recipe.name}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {time && <span className="font-mono text-[11px] text-muted">{time}</span>}
            {recipe.yields > 0 && (
              <span className="font-mono text-[11px] text-muted">serves {recipe.yields}</span>
            )}
            {recipe.tags?.slice(0, 3).map((tag) => (
              <span key={tag.id} className="label">
                {tag.name}
              </span>
            ))}
          </div>
          {footer}
        </div>
      </div>
    </Link>
  );
}

export default function Recipes() {
  const { householdId = "1" } = useParams();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "cookable">("all");
  const { data, isPending, error } = useQuery({
    queryKey: ["recipes", householdId],
    queryFn: () => api<Recipe[]>(`/household/${householdId}/recipe`),
  });
  const { pantry, knownCount } = usePantry(householdId);

  // Filtering happens here rather than through /recipe/search: the list is a
  // household's own recipes, which is tens of items, and a local filter answers
  // on every keystroke without a request per letter.
  const visible = (data ?? []).filter((recipe) =>
    recipe.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const ranked = mode === "cookable" ? rankCookable(visible, pantry) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between">
        <div>
          <p className="label">The collection</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">Recipes</h1>
        </div>
        <Link
          to={`/household/${householdId}/recipes/new`}
          className="btn-gradient mb-1 rounded-card px-4 py-2 text-sm font-medium"
        >
          New recipe
        </Link>
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
            from {knownCount} items on the list and recently bought
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
          <div>
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
        <div>
          {visible.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} householdId={householdId} />
          ))}
        </div>
      )}
    </div>
  );
}
