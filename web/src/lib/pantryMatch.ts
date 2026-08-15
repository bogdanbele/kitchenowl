import { normaliseName } from "./cookable";

/**
 * Mapping a recipe's ingredient onto a thing in the kitchen.
 *
 * Two vocabularies meet here and neither is tidy. The kitchen holds "Cherry
 * tomatoes", "Sunflower oil", "Spring onions"; a recipe asks for "Tomatoes",
 * "Oil", "Onion"; and a scraped recipe asks for "1 teaspoon Oil for painting
 * the dough", which is a sentence rather than an ingredient.
 *
 * So the answer is graded rather than yes/no, and the match is always shown.
 * "You have this" is a claim the reader can check in a glance if it says *what*
 * it matched — and it needs checking, because "Spring onions" satisfying
 * "Onion" by head noun is precisely the kind of match that is wrong in a way
 * only a cook notices.
 */

export type MatchKind = "exact" | "likely" | "possible" | "none";

export interface PantryThing {
  name: string;
  quantity?: number;
  expires_on?: string | null;
}

export interface IngredientMatch {
  kind: MatchKind;
  /** The thing this ingredient was matched to, if any. */
  match?: PantryThing;
  /** Other things it could plausibly be, best first, excluding `match`. */
  alternatives: PantryThing[];
}

/**
 * Words that describe an amount, a preparation or a container rather than a
 * food. A scraped line is mostly these, and without dropping them "1 teaspoon
 * Oil for painting the dough" matches anything else containing "teaspoon".
 */
const NOISE = new Set([
  "a", "an", "and", "or", "of", "for", "the", "to", "with", "plus", "extra", "optional",
  "taste", "total", "amount", "about", "approximately", "fresh", "freshly", "ground",
  "large", "medium", "small", "whole", "half", "chopped", "sliced", "diced", "grated",
  "peeled", "roughly", "finely", "cut", "into", "pieces", "bunch", "can", "tin", "jar",
  "packet", "pack", "teaspoon", "teaspoons", "tsp", "tablespoon", "tablespoons", "tbsp",
  "spoon", "spoons", "cup", "cups", "g", "kg", "ml", "l", "oz", "lb", "pinch", "dash",
  "serve", "serving", "servings", "uncooked", "cooked", "raw", "dried", "frozen", "warm",
  "cold", "hot", "room", "temperature", "painting", "greasing", "dusting", "sauteing",
  "frying", "boiling",
]);

/** Content words, lower-cased, with amounts and preparation words dropped. */
export function contentWords(name: string): string[] {
  return normaliseName(name)
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !NOISE.has(word) && !/^\d+$/.test(word));
}

/** The last content word: in English, what the thing actually is. */
function head(name: string): string | null {
  const words = contentWords(name);
  return words.length ? words[words.length - 1] : null;
}

function score(ingredient: string, thing: string): MatchKind {
  const left = normaliseName(ingredient);
  const right = normaliseName(thing);
  if (!left || !right) return "none";
  if (left === right) return "exact";

  // "Cherry tomatoes" answers to "tomatoes". Only this way round: owning pork
  // is not owning pork belly.
  if (head(thing) === left) return "likely";
  // The ingredient is itself a phrase — a scraped line, usually — and the thing
  // is what it is about: "1 teaspoon Oil for painting the dough" vs "Oil".
  if (head(ingredient) === right) return "likely";

  const shared = contentWords(ingredient).filter((word) => contentWords(thing).includes(word));
  return shared.length > 0 ? "possible" : "none";
}

const RANK: Record<MatchKind, number> = { exact: 3, likely: 2, possible: 1, none: 0 };

export function matchIngredient(ingredient: string, inventory: PantryThing[]): IngredientMatch {
  const scored = inventory
    .map((thing) => ({ thing, kind: score(ingredient, thing.name) }))
    .filter((entry) => entry.kind !== "none")
    .sort((a, b) => RANK[b.kind] - RANK[a.kind] || a.thing.name.localeCompare(b.thing.name));

  if (scored.length === 0) return { kind: "none", alternatives: [] };

  const best = scored[0];
  return {
    kind: best.kind,
    match: best.thing,
    // Only worth offering when the best answer is not certain. Listing
    // alternatives to an exact match is noise.
    alternatives: best.kind === "exact" ? [] : scored.slice(1, 4).map((entry) => entry.thing),
  };
}

/** How many of a recipe's required ingredients are accounted for. */
export function countMatched(matches: IngredientMatch[]): number {
  return matches.filter((match) => match.kind === "exact" || match.kind === "likely").length;
}
