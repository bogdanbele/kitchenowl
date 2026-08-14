import type { Recipe, RecipeItem, ShoppinglistItem } from "../api/types";

/**
 * "What can I cook right now?"
 *
 * KitchenOwl has no pantry — nobody keeps one up to date anyway — so this
 * approximates it from what the household has actually bought recently plus
 * what is on the list about to be bought. That is a guess, and it is labelled
 * as one in the UI: the value is not certainty, it is turning "what's for
 * dinner" into a ranked list of three answers instead of scrolling forty
 * recipes.
 *
 * Optional ingredients never count as missing. A recipe you can cook without
 * the dill is a recipe you can cook.
 */
export interface CookableRecipe {
  recipe: Recipe;
  have: RecipeItem[];
  missing: RecipeItem[];
  /** 0–1, share of the required ingredients you have. */
  readiness: number;
}

/**
 * Names, normalised for comparison.
 *
 * Ingredient names come from three places — typed by hand, matched by the
 * scraper, invented by a model — so "Tomatoes", "tomato" and " Tomato " have to
 * meet somewhere.
 */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/(?:es|s)$/, "");
}

export function pantryFrom(
  onList: ShoppinglistItem[] = [],
  recentlyBought: ShoppinglistItem[] = [],
): Set<string> {
  return new Set(
    [...onList, ...recentlyBought].map((item) => normaliseName(item.name)).filter(Boolean),
  );
}

export function rankCookable(recipes: Recipe[], pantry: Set<string>): CookableRecipe[] {
  return recipes
    .map((recipe) => {
      const required = (recipe.items ?? []).filter((item) => !item.optional);
      const have = required.filter((item) => pantry.has(normaliseName(item.name)));
      const missing = required.filter((item) => !pantry.has(normaliseName(item.name)));

      return {
        recipe,
        have,
        missing,
        // A recipe with no ingredients listed is not "100% ready", it is
        // unknown; scoring it 1 would float empty recipes to the top.
        readiness: required.length === 0 ? 0 : have.length / required.length,
      };
    })
    .filter((entry) => entry.have.length > 0)
    .sort((a, b) => {
      // Fewest things to buy first; break ties by the more complete recipe, then
      // alphabetically so the order is stable between renders.
      if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length;
      if (b.readiness !== a.readiness) return b.readiness - a.readiness;
      return a.recipe.name.localeCompare(b.recipe.name);
    });
}
