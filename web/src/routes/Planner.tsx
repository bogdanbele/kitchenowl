import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { api } from "../api/client";
import type { Recipe } from "../api/types";
import { DAY_MS, isUnscheduled, relativeDay, utcMidnight } from "../lib/format";
import { Modal } from "../components/Modal";

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
      <div className="group flex items-start justify-between gap-2 border-b border-hairline py-2.5">
        {/* The meal is the only thing on this page anyone reads from across the
            kitchen, so it is the one thing set at a readable size in full ink. */}
        <Link
          to={`/household/${householdId}/recipes/${entry.recipe_id}`}
          className="text-[15px] leading-snug transition group-hover:text-accent"
        >
          {entry.recipe?.name ?? "Recipe"}
        </Link>
        <button
          onClick={() => unplan.mutate({ recipeId: entry.recipe_id, date: entry.cooking_date })}
          aria-label={`Remove ${entry.recipe?.name ?? "recipe"} from the plan`}
          className="shrink-0 p-1 text-muted transition hover:text-accent"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  function AddButton({ target }: { target: number }) {
    return (
      // A 10px grey caption was doing the job of the main action on this screen.
      // Same restraint, but sized and coloured like something you can press.
      <button
        onClick={() => setPickingFor(target)}
        className="mt-1.5 inline-flex items-center gap-1.5 py-1.5 text-sm text-muted
                   transition hover:text-accent"
      >
        <Plus size={14} /> Plan a meal
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
                {/* Today is marked twice over — colour and weight — because
                    colour alone is the one cue a colour-blind reader loses,
                    and finding today is the whole job of this screen. */}
                <p className={`label mb-1 ${timestamp === today ? "font-semibold text-accent" : ""}`}>
                  {relativeDay(timestamp, today)}
                </p>
                <div className="rule pt-1">
                  {entries.map((entry) => (
                    <PlannedCard key={`${entry.recipe_id}-${entry.cooking_date}`} entry={entry} />
                  ))}
                  {/* An em-dash is a shrug. "Nothing planned" is the same
                      information in words a person can read at a glance. */}
                  {entries.length === 0 && (
                    <p className="py-2 text-sm text-faint">Nothing planned</p>
                  )}
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
              {someday.length === 0 && (
                <p className="py-2 text-sm text-faint">Nothing planned</p>
              )}
              <AddButton target={-1} />
            </div>
          </section>
        </div>
      )}

      {/* Was a hand-rolled fixed overlay: no Escape, no focus trap, and the page
          behind it still tabbable. Modal is built on <dialog>, which gives all
          three. */}
      <Modal
        open={pickingFor !== null}
        onClose={() => {
          setPickingFor(null);
          setQuery("");
        }}
        title={`Plan for ${pickingFor === -1 ? "someday" : pickingFor !== null ? relativeDay(pickingFor, today) : ""}`}
      >
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
            className="block w-full border-b border-hairline py-3 text-left text-[15px] transition hover:text-accent"
          >
            {recipe.name}
          </button>
        ))}
        {choices.length === 0 && <p className="py-3 text-sm text-muted">No recipes match.</p>}
      </Modal>
    </div>
  );
}
