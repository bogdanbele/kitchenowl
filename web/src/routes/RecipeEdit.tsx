import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useState, type FormEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../api/client";
import type { Recipe, RecipeItem } from "../api/types";

interface Draft {
  name: string;
  description: string;
  yields: number;
  time: number;
  prep_time: number;
  cook_time: number;
  source: string;
  photo: string | null;
  items: { name: string; description: string; optional: boolean }[];
}

const EMPTY: Draft = {
  name: "",
  description: "",
  yields: 0,
  time: 0,
  prep_time: 0,
  cook_time: 0,
  source: "",
  photo: null,
  items: [],
};

function toDraft(recipe: Recipe): Draft {
  return {
    name: recipe.name,
    description: recipe.description ?? "",
    yields: recipe.yields ?? 0,
    time: recipe.time ?? 0,
    prep_time: recipe.prep_time ?? 0,
    cook_time: recipe.cook_time ?? 0,
    source: recipe.source ?? "",
    photo: recipe.photo ?? null,
    items: (recipe.items ?? []).map((item: RecipeItem) => ({
      name: item.name,
      description: item.description ?? "",
      optional: item.optional ?? false,
    })),
  };
}

/** What /recipe/scrape answers: the recipe, and each scraped ingredient line
 *  mapped to a known household item, or null when there was no match. */
interface ScrapeResult {
  recipe: Recipe;
  items: Record<string, (RecipeItem & { description?: string }) | null>;
}

function fromScrape(result: ScrapeResult): Draft {
  const draft = toDraft(result.recipe);
  draft.items = Object.entries(result.items).map(([originalText, matched]) =>
    matched
      ? { name: matched.name, description: matched.description ?? "", optional: false }
      : // No match: keep the site's own wording rather than dropping the line.
        // "2 lbs. pork belly" as a name is wrong, but it is visible and
        // editable, where a silently missing ingredient is neither.
        { name: originalText, description: "", optional: false },
  );
  return draft;
}

export default function RecipeEdit() {
  const { householdId = "1", recipeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !recipeId;

  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: async () => {
      const recipe = await api<Recipe>(`/recipe/${recipeId}`);
      setDraft((current) => current ?? toDraft(recipe));
      return recipe;
    },
    enabled: !isNew,
  });

  const importFromUrl = useMutation({
    mutationFn: (value: string) =>
      api<ScrapeResult>(
        `/household/${householdId}/recipe/scrape?url=${encodeURIComponent(value)}`,
      ),
    onSuccess: (result) => {
      setError(null);
      setDraft(fromScrape(result));
    },
    // The API answers 400 "Unsupported website" both for a page it cannot read
    // and for a URL that 404s, which are different problems for the person
    // pasting. Say so rather than repeating the server's guess.
    onError: () =>
      setError(
        "Could not read that page. Check the link opens in a browser — a dead link and an unreadable page look the same from here.",
      ),
  });

  const save = useMutation({
    mutationFn: (value: Draft) =>
      isNew
        ? api<Recipe>(`/household/${householdId}/recipe`, { method: "POST", body: value })
        : api<Recipe>(`/recipe/${recipeId}`, { method: "POST", body: value }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["recipes", householdId] });
      queryClient.invalidateQueries({ queryKey: ["recipe", String(saved?.id ?? recipeId)] });
      navigate(`/household/${householdId}/recipes/${saved?.id ?? recipeId}`);
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "Could not save"),
  });

  if (!draft) return <div className="h-96 animate-pulse rounded-card bg-paper-deep" />;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft({ ...draft, [key]: value });

  const setItem = (index: number, patch: Partial<Draft["items"][number]>) =>
    setDraft({
      ...draft,
      items: draft.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    // The API rejects a blank or whitespace-only name with a validation error
    // that surfaces as a bare 400; catching it here says something useful.
    if (!draft.name.trim()) return setError("A recipe needs a name.");
    save.mutate({ ...draft, items: draft.items.filter((item) => item.name.trim()) });
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl">
      <p className="label">{isNew ? "New recipe" : "Editing"}</p>
      <input
        value={draft.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder="Untitled recipe"
        aria-label="Recipe name"
        className="mt-1 mb-8 w-full bg-transparent font-display text-4xl font-semibold tracking-tight
                   outline-none placeholder:text-faint"
      />

      {isNew && (
        <section className="mb-10 rounded-card border border-hairline p-4">
          <p className="label mb-2">Import from a link</p>
          <div className="flex gap-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              aria-label="Recipe URL"
              className="field"
            />
            <button
              type="button"
              disabled={!url.trim() || importFromUrl.isPending}
              onClick={() => importFromUrl.mutate(url.trim())}
              className="shrink-0 rounded-card border border-line px-4 py-2 text-sm transition
                         hover:border-accent hover:text-accent disabled:opacity-40"
            >
              {importFromUrl.isPending ? "Reading…" : "Import"}
            </button>
          </div>
        </section>
      )}

      <div className="mb-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {(
          [
            ["yields", "Serves"],
            ["time", "Total min"],
            ["prep_time", "Prep min"],
            ["cook_time", "Cook min"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="label mb-1 block" htmlFor={key}>
              {label}
            </label>
            <input
              id={key}
              type="number"
              min={0}
              value={draft[key]}
              onChange={(e) => set(key, Math.max(0, Number(e.target.value)))}
              className="field font-mono"
            />
          </div>
        ))}
      </div>

      <section className="mb-10">
        <div className="mb-2 flex items-center justify-between">
          <p className="label">Ingredients</p>
          <button
            type="button"
            onClick={() => set("items", [...draft.items, { name: "", description: "", optional: false }])}
            className="label transition hover:text-accent"
          >
            + Add
          </button>
        </div>

        <ul className="rule">
          {draft.items.map((item, index) => (
            <li key={index} className="flex items-center gap-3 border-b border-hairline py-2">
              <input
                value={item.name}
                onChange={(e) => setItem(index, { name: e.target.value })}
                placeholder="Ingredient"
                aria-label={`Ingredient ${index + 1}`}
                className="flex-1 bg-transparent py-1 outline-none placeholder:text-faint"
              />
              <input
                value={item.description}
                onChange={(e) => setItem(index, { description: e.target.value })}
                placeholder="Amount"
                aria-label={`Amount for ingredient ${index + 1}`}
                className="w-36 bg-transparent py-1 text-right font-mono text-xs outline-none placeholder:text-faint"
              />
              <button
                type="button"
                onClick={() => setItem(index, { optional: !item.optional })}
                aria-pressed={item.optional}
                className={`label transition ${item.optional ? "text-accent" : "hover:text-muted"}`}
              >
                opt
              </button>
              {/* Removal is its own control, never the row itself. In the
                  Flutter editor a tap on the ingredient deleted it, which is
                  the single easiest way to lose work in this app. */}
              <button
                type="button"
                onClick={() => set("items", draft.items.filter((_, i) => i !== index))}
                aria-label={`Remove ${item.name || "ingredient"}`}
                className="px-1 text-faint transition hover:text-accent"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {draft.items.length === 0 && <p className="py-3 text-sm text-faint">No ingredients yet.</p>}
      </section>

      <section className="mb-10">
        <div className="mb-2 flex items-center justify-between">
          <p className="label">Method · markdown</p>
          <button
            type="button"
            onClick={() => setPreview(!preview)}
            className="label transition hover:text-accent"
          >
            {preview ? "Write" : "Preview"}
          </button>
        </div>

        {preview ? (
          <div className="prose-recipe min-h-64 rounded-card border border-hairline p-4">
            <Markdown remarkPlugins={[remarkGfm]}>{draft.description}</Markdown>
          </div>
        ) : (
          <textarea
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            rows={16}
            aria-label="Method"
            placeholder={"## 1. Do this\nThen this."}
            className="w-full rounded-card border border-hairline bg-transparent p-4 font-mono text-sm
                       leading-relaxed outline-none placeholder:text-faint focus:border-accent"
          />
        )}
      </section>

      {error && (
        <p role="alert" className="mb-4 text-sm text-accent">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={save.isPending}
          className="btn-gradient rounded-card px-5 py-2.5 font-medium"
        >
          {save.isPending ? "Saving…" : isNew ? "Create recipe" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-card border border-hairline px-5 py-2.5 text-muted transition hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
