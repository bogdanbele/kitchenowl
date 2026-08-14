import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { api } from "../api/client";
import type { Recipe } from "../api/types";
import { Photo } from "../components/Photo";

function formatTime(minutes: number): string | null {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest}` : `${hours} h`;
}

function RecipeCard({ recipe, householdId }: { recipe: Recipe; householdId: string }) {
  const time = formatTime(recipe.time);

  // A tinted initial rather than a broken-image icon: most hand-typed recipes
  // have no photo, and the row should still hold its shape.
  const placeholder = (
    <div className="grid size-20 shrink-0 place-items-center rounded-card bg-paper-deep">
      <span className="font-display text-xl text-faint">{recipe.name.charAt(0)}</span>
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
        </div>
      </div>
    </Link>
  );
}

export default function Recipes() {
  const { householdId = "1" } = useParams();
  const [query, setQuery] = useState("");
  const { data, isPending, error } = useQuery({
    queryKey: ["recipes", householdId],
    queryFn: () => api<Recipe[]>(`/household/${householdId}/recipe`),
  });

  // Filtering happens here rather than through /recipe/search: the list is a
  // household's own recipes, which is tens of items, and a local filter answers
  // on every keystroke without a request per letter.
  const visible = (data ?? []).filter((recipe) =>
    recipe.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-end justify-between">
        <div>
          <p className="label">The collection</p>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight">Recipes</h1>
        </div>
        <Link
          to={`/household/${householdId}/recipes/new`}
          className="mb-1 rounded-card bg-accent px-4 py-2 text-sm font-medium text-white transition hover:brightness-95"
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

      {isPending ? (
        <div className="space-y-4 pt-6">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-card bg-paper-deep" />
          ))}
        </div>
      ) : error ? (
        <p className="pt-6 text-accent">{(error as Error).message}</p>
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
