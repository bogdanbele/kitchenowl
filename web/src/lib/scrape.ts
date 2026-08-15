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
  tags: string[];
  /** 0 private, 1 link-only, 2 public — ints, because that is what the API takes. */
  visibility: number;
}

export const PRIVATE = 0;
export const LINK_ONLY = 1;
export const PUBLIC = 2;

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
  tags: [],
  // New recipes start private. Anything else would publish someone's cooking by
  // default, and the button to share is easier to find than the one to unshare.
  visibility: PRIVATE,
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
    // Tags round-trip as names: the API answers with objects and takes strings.
    tags: (recipe.tags ?? []).map((tag) => tag.name),
    visibility: recipe.visibility ?? PRIVATE,
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

