import type { Recipe, RecipeItem } from "../api/types";

export interface Draft {
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

export const EMPTY: Draft = {
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

export function toDraft(recipe: Recipe): Draft {
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
export interface ScrapeResult {
  recipe: Recipe;
  items: Record<string, (RecipeItem & { description?: string }) | null>;
}

export function fromScrape(result: ScrapeResult): Draft {
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

