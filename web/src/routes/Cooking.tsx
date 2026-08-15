import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Timer as TimerIcon, X } from "lucide-react";
import { api } from "../api/client";
import type { Recipe as RecipeModel } from "../api/types";
import { formatCountdown, splitSteps, type Timer } from "../lib/cooking";
import { stripMentions } from "../lib/mentions";
import { scaleAmount } from "../lib/amount";
import { useWakeLock } from "../hooks/useWakeLock";
import { useTimers } from "../hooks/useTimers";

/**
 * Cooking mode: one step at a time, set large, screen kept awake.
 *
 * The two things that make this more than a font-size change are the timers
 * lifted out of the step text — "cook 45-60 minutes" becomes a button — and the
 * ingredients for *this* step pulled out of the list, so you are not rereading
 * twelve ingredients to find the two you need now.
 */
export default function Cooking() {
  const { householdId = "1", recipeId } = useParams();
  const [params] = useSearchParams();
  const [index, setIndex] = useState(0);

  const { data: recipe, isPending } = useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: () => api<RecipeModel>(`/recipe/${recipeId}`),
  });

  const wakeLock = useWakeLock();
  const { timers, start, dismiss } = useTimers();

  const steps = useMemo(
    () => (recipe ? splitSteps(stripMentions(recipe.description), recipe.items) : []),
    [recipe],
  );

  // Servings carry over from the recipe page, so a doubled batch stays doubled.
  const servings = Number(params.get("servings")) || recipe?.yields || 1;
  const factor = recipe?.yields ? servings / recipe.yields : 1;

  const go = useCallback(
    (delta: number) => setIndex((current) => Math.min(Math.max(current + delta, 0), steps.length - 1)),
    [steps.length],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === " ") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (isPending || !recipe) {
    return <div className="h-screen animate-pulse bg-paper-deep" />;
  }

  if (steps.length === 0) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <p className="mb-4 text-muted">This recipe has no method to cook from.</p>
        <Link to={`/household/${householdId}/recipes/${recipeId}`} className="label hover:text-accent">
          ← Back to the recipe
        </Link>
      </div>
    );
  }

  const step = steps[index];
  const stepItems = recipe.items.filter((item) => step.itemIds.includes(item.id));
  const progress = ((index + 1) / steps.length) * 100;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-paper text-ink">
      <div className="h-1 w-full bg-paper-deep">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <header className="flex items-center justify-between gap-4 px-5 py-3 md:px-8">
        <div className="min-w-0">
          <p className="label truncate">
            {step.section ?? recipe.name} · step {index + 1} of {steps.length}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {wakeLock.active && <span className="label hidden sm:inline">screen stays on</span>}
          <Link
            to={`/household/${householdId}/recipes/${recipeId}`}
            aria-label="Leave cooking mode"
            className="text-faint transition hover:text-accent"
          >
            <X size={20} />
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-auto px-5 pb-40 md:px-8">
        <div className="mx-auto max-w-3xl">
          {/* Set very large on purpose: this is read standing up, at arm's
              length, usually while holding something. */}
          <p className="mt-6 text-2xl leading-relaxed font-medium text-balance sm:text-3xl sm:leading-relaxed">
            {step.text}
          </p>

          {step.timers.length > 0 && (
            <div className="mt-8 flex flex-wrap gap-2">
              {step.timers.map((timer: Timer) => (
                <button
                  key={timer.label}
                  onClick={() => start(timer, `${recipe.name} · step ${index + 1}`)}
                  className="inline-flex items-center gap-2 rounded-full border border-hairline px-4 py-2
                             text-sm transition hover:border-accent hover:text-accent"
                >
                  <TimerIcon size={15} />
                  Start {timer.label}
                </button>
              ))}
            </div>
          )}

          {stepItems.length > 0 && (
            <div className="mt-10">
              <p className="label mb-2">For this step</p>
              <ul className="rule">
                {stepItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-baseline justify-between gap-4 border-b border-hairline py-2.5"
                  >
                    <span>{item.name}</span>
                    {item.description && (
                      <span className="shrink-0 font-mono text-sm text-muted">
                        {scaleAmount(item.description, factor)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>

      {timers.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex flex-col items-center gap-2 px-4">
          {timers.map((timer) => (
            <button
              key={timer.id}
              onClick={() => dismiss(timer.id)}
              className={`pointer-events-auto flex w-full max-w-md items-center justify-between gap-4
                          rounded-card border px-4 py-3 text-sm shadow-lg transition ${
                            timer.remaining <= 0
                              ? "animate-pulse border-accent bg-accent text-white"
                              : "border-hairline bg-paper"
                          }`}
            >
              <span className="min-w-0 truncate">
                {timer.remaining <= 0 ? "Time is up — " : ""}
                {timer.note}
              </span>
              <span className="shrink-0 font-mono tabular-nums">
                {formatCountdown(timer.remaining)}
              </span>
            </button>
          ))}
        </div>
      )}

      <nav className="flex items-center gap-3 border-t border-hairline px-5 py-4 md:px-8">
        <button
          onClick={() => go(-1)}
          disabled={index === 0}
          className="inline-flex items-center gap-2 rounded-card border border-hairline px-5 py-3
                     text-muted transition hover:text-ink disabled:opacity-30"
        >
          <ChevronLeft size={18} /> Back
        </button>
        {index < steps.length - 1 ? (
          <button onClick={() => go(1)} className="btn-gradient flex-1 rounded-card px-5 py-3 font-medium">
            <span className="inline-flex items-center justify-center gap-2">
              Next <ChevronRight size={18} />
            </span>
          </button>
        ) : (
          <Link
            to={`/household/${householdId}/recipes/${recipeId}`}
            className="btn-gradient flex-1 rounded-card px-5 py-3 text-center font-medium"
          >
            Done
          </Link>
        )}
      </nav>
    </div>
  );
}
