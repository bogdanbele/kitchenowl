import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { api } from "../api/client";
import type { Recipe } from "../api/types";
import { DAY_MS, isUnscheduled, relativeDay, utcMidnight } from "../lib/format";

interface PlannedRecipe {
  recipe_id: number;
  cooking_date: number;
  yields: number;
  recipe: Recipe;
}

export default function Planner() {
  const { householdId = "1" } = useParams();
  const queryClient = useQueryClient();
  const [pickingFor, setPickingFor] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const plannerKey = ["planner", householdId];
  const { data: planned, isPending } = useQuery({
    queryKey: plannerKey,
    queryFn: () => api<PlannedRecipe[]>(`/household/${householdId}/planner`),
  });

  const { data: recipes } = useQuery({
    queryKey: ["recipes", householdId],
    queryFn: () => api<Recipe[]>(`/household/${householdId}/recipe`),
    enabled: pickingFor !== null,
  });

  const plan = useMutation({
    mutationFn: ({ recipeId, date }: { recipeId: number; date: number | null }) =>
      api(`/household/${householdId}/planner/recipe`, {
        method: "POST",
        // Omitting cooking_date is what the API reads as "planned, no day".
        body: date === null ? { recipe_id: recipeId } : { recipe_id: recipeId, cooking_date: date },
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: plannerKey }),
  });

  const unplan = useMutation({
    mutationFn: ({ recipeId, date }: { recipeId: number; date: number }) =>
      api(`/household/${householdId}/planner/recipe/${recipeId}`, {
        method: "DELETE",
        body: { cooking_date: date },
      }),
    onMutate: async ({ recipeId, date }) => {
      await queryClient.cancelQueries({ queryKey: plannerKey });
      const previous = queryClient.getQueryData<PlannedRecipe[]>(plannerKey) ?? [];
      queryClient.setQueryData<PlannedRecipe[]>(
        plannerKey,
        previous.filter((entry) => !(entry.recipe_id === recipeId && entry.cooking_date === date)),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => queryClient.setQueryData(plannerKey, context?.previous),
    onSettled: () => queryClient.invalidateQueries({ queryKey: plannerKey }),
  });

  const today = utcMidnight(new Date());
  const week = Array.from({ length: 7 }, (_, i) => today + i * DAY_MS);
  const entriesFor = (timestamp: number) =>
    (planned ?? []).filter((entry) => utcMidnight(new Date(entry.cooking_date)) === timestamp);
  const someday = (planned ?? []).filter((entry) => isUnscheduled(entry.cooking_date));

  const choices = (recipes ?? []).filter((recipe) =>
    recipe.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  function choose(recipeId: number) {
    plan.mutate({ recipeId, date: pickingFor === -1 ? null : pickingFor });
    setPickingFor(null);
    setQuery("");
  }

  function PlannedCard({ entry }: { entry: PlannedRecipe }) {
    return (
      <div className="group flex items-start justify-between gap-2 border-b border-hairline py-2">
        <Link
          to={`/household/${householdId}/recipes/${entry.recipe_id}`}
          className="text-sm leading-snug transition group-hover:text-accent"
        >
          {entry.recipe?.name ?? "Recipe"}
        </Link>
        <button
          onClick={() => unplan.mutate({ recipeId: entry.recipe_id, date: entry.cooking_date })}
          aria-label={`Remove ${entry.recipe?.name ?? "recipe"} from the plan`}
          className="shrink-0 px-1 text-faint transition hover:text-accent"
        >
          ×
        </button>
      </div>
    );
  }

  function AddButton({ target }: { target: number }) {
    return (
      <button onClick={() => setPickingFor(target)} className="label mt-2 transition hover:text-accent">
        + Plan a meal
      </button>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <p className="label">The week ahead</p>
      <h1 className="mt-1 mb-8 text-4xl font-semibold tracking-tight">Meal planner</h1>

      {isPending ? (
        <div className="h-64 animate-pulse rounded-card bg-paper-deep" />
      ) : (
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {week.map((timestamp) => {
            const entries = entriesFor(timestamp);
            return (
              <section key={timestamp}>
                <p
                  className={`label mb-1 ${timestamp === today ? "text-accent" : ""}`}
                >
                  {relativeDay(timestamp, today)}
                </p>
                <div className="rule pt-1">
                  {entries.map((entry) => (
                    <PlannedCard key={`${entry.recipe_id}-${entry.cooking_date}`} entry={entry} />
                  ))}
                  {entries.length === 0 && <p className="py-2 text-sm text-faint">—</p>}
                  <AddButton target={timestamp} />
                </div>
              </section>
            );
          })}

          {/* The API's own third state: planned, but not on a day yet. Hiding it
              would make those recipes look unplanned while the API still counts
              them as planned. */}
          <section>
            <p className="label mb-1">Someday</p>
            <div className="rule pt-1">
              {someday.map((entry) => (
                <PlannedCard key={`${entry.recipe_id}-someday`} entry={entry} />
              ))}
              {someday.length === 0 && <p className="py-2 text-sm text-faint">—</p>}
              <AddButton target={-1} />
            </div>
          </section>
        </div>
      )}

      {pickingFor !== null && (
        <div
          className="fixed inset-0 z-20 grid place-items-center bg-black/40 p-6"
          onClick={() => setPickingFor(null)}
        >
          <div
            className="max-h-[70vh] w-full max-w-md overflow-auto rounded-card border border-hairline bg-paper p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <p className="label mb-3">
              Plan for {pickingFor === -1 ? "someday" : relativeDay(pickingFor, today)}
            </p>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search recipes…"
              aria-label="Search recipes"
              autoFocus
              className="field mb-2"
            />
            {choices.map((recipe) => (
              <button
                key={recipe.id}
                onClick={() => choose(recipe.id)}
                className="block w-full border-b border-hairline py-2.5 text-left text-sm transition hover:text-accent"
              >
                {recipe.name}
              </button>
            ))}
            {choices.length === 0 && <p className="py-3 text-sm text-faint">No recipes match.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
