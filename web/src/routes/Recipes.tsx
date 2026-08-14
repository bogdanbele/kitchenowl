import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Recipe } from "../api/types";
import { photoUrl } from "../photo";

function Time({ minutes }: { minutes: number }) {
  if (!minutes) return null;
  const label = minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60 || ""}`.trim() : `${minutes} min`;
  return (
    <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-ink-soft">
      {label}
    </span>
  );
}

function RecipeCard({ recipe, householdId }: { recipe: Recipe; householdId: string }) {
  const photo = photoUrl(recipe.photo);

  return (
    <Link
      to={`/household/${householdId}/recipes/${recipe.id}`}
      className="group overflow-hidden rounded-card border border-line bg-surface transition
                 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5"
    >
      {photo ? (
        <img
          src={photo}
          alt=""
          loading="lazy"
          className="aspect-[16/10] w-full object-cover transition group-hover:scale-[1.02]"
        />
      ) : (
        // Not a broken-image icon and not empty space: a plain tinted block
        // keeps the grid's rhythm when a recipe has no photo, which is most of
        // them when you type recipes in yourself.
        <div className="aspect-[16/10] w-full bg-accent-50 dark:bg-accent-700/15" />
      )}
      <div className="p-4">
        <h2 className="font-medium leading-snug">{recipe.name}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Time minutes={recipe.time} />
          {recipe.tags?.slice(0, 2).map((tag) => (
            <span
              key={tag.id}
              className="rounded-full bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700
                         dark:bg-accent-700/20 dark:text-accent-300"
            >
              {tag.name}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

export default function Recipes() {
  const { householdId = "1" } = useParams();
  const { data, isPending, error } = useQuery({
    queryKey: ["recipes", householdId],
    queryFn: () => api<Recipe[]>(`/household/${householdId}/recipe`),
  });

  if (isPending) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-56 animate-pulse rounded-card bg-surface" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="text-red-600 dark:text-red-400">{(error as Error).message}</p>;
  }

  if (!data?.length) {
    return <p className="text-ink-soft">No recipes yet.</p>;
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {data.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} householdId={householdId} />
      ))}
    </div>
  );
}
