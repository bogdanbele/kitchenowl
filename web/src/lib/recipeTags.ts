/**
 * Classifying a recipe into tags you can filter by.
 *
 * The vocabulary is closed on purpose. Left to invent its own words a model
 * returns "veggie" for one recipe and "Vegetarian" for the next, and a filter
 * list of forty near-synonyms is worse than no filter at all — the tags stop
 * being a way to find things and become another thing to read.
 *
 * So: one cuisine, whatever diets are actually true, and the kind of dish. Two
 * things are deliberately *not* asked of the model — see NOT_ASKED below.
 */

export const CUISINES = [
  "Romanian", "Filipino", "Danish", "British", "Italian", "French", "Spanish",
  "Greek", "Turkish", "Middle Eastern", "Moroccan", "Indian", "Thai",
  "Vietnamese", "Chinese", "Japanese", "Korean", "Mexican", "American",
  "Caribbean", "West African", "Ethiopian", "German", "Polish", "Hungarian",
  "Nordic",
] as const;

export const DIETS = ["Vegan", "Vegetarian", "Pescatarian", "Gluten-free", "Dairy-free"] as const;

export const KINDS = [
  "Breakfast", "Soup", "Salad", "Main", "Side", "Snack", "Dessert", "Baking",
  "Drink", "Sauce", "Preserve",
] as const;

/**
 * "Healthy" is a claim, not an observation, and a model will happily attach it
 * to anything with a vegetable in it. It is offered because it is genuinely
 * useful to filter on, with a definition tight enough to argue with.
 */
export const QUALITIES = ["Healthy", "Comfort food", "Freezer-friendly", "One pot"] as const;

export const VOCABULARY = [...CUISINES, ...DIETS, ...KINDS, ...QUALITIES] as const;

/**
 * Not asked of the model, because the recipe already knows:
 *
 * - "Quick" is `time <= 30`, which is a number we have. Asking a model to
 *   estimate a number stored two fields away is how a recipe ends up tagged
 *   Quick and marked 2 hours.
 * - "AI-written" is provenance, set where the recipe is created.
 */
export const NOT_ASKED = ["Quick", "AI-written"] as const;

export const QUICK_MINUTES = 30;

export interface TaggableRecipe {
  name: string;
  description?: string;
  time?: number;
  items?: { name: string }[];
}

/** What the model is shown: enough to classify, not the whole method. */
export function describeForTagging(recipe: TaggableRecipe): string {
  const ingredients = (recipe.items ?? []).map((item) => item.name).join(", ");
  // The first stretch of the method is plenty to tell a soup from a bake, and
  // sending four screens of prose per recipe is what makes a batch expensive.
  const method = (recipe.description ?? "").replace(/\s+/g, " ").slice(0, 600);
  return [
    `Name: ${recipe.name}`,
    ingredients && `Ingredients: ${ingredients}`,
    method && `Method: ${method}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const TAGGING_PROMPT = `You label recipes with tags from a fixed list, for filtering.

Return ONLY a JSON array of strings, every one taken exactly from this list:
${VOCABULARY.join(", ")}

Rules:
- At most one cuisine, and only when the dish genuinely belongs to it. A recipe
  that is not clearly from one cuisine gets none rather than a guess.
- Diet tags only when true of the recipe as written: "Vegetarian" is wrong if it
  contains fish sauce, "Vegan" is wrong if it contains butter, egg or honey.
  Judge by the ingredients, not by the name.
- Exactly one of Breakfast, Soup, Salad, Main, Side, Snack, Dessert, Baking,
  Drink, Sauce or Preserve.
- "Healthy" only for a dish that is vegetable- or pulse-forward, not deep fried,
  and not built on butter, cream or sugar. Most food is not healthy; that is
  fine and the tag is not a compliment.
- Never invent a tag. Never explain. Four or five tags is a good answer.`;

/**
 * The model's reply, reduced to tags that exist.
 *
 * Case is folded against the vocabulary rather than trusted, so "vegan" becomes
 * "Vegan" and joins the same filter rather than starting a second one.
 */
export function parseTags(reply: unknown): string[] {
  const known = new Map(VOCABULARY.map((tag) => [tag.toLowerCase(), tag as string]));
  const list = Array.isArray(reply) ? reply : [];
  const out: string[] = [];

  for (const entry of list) {
    if (typeof entry !== "string") continue;
    const tag = known.get(entry.trim().toLowerCase());
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

/** Tags the recipe earns from its own fields, no model involved. */
export function derivedTags(recipe: TaggableRecipe): string[] {
  return recipe.time && recipe.time > 0 && recipe.time <= QUICK_MINUTES ? ["Quick"] : [];
}

/**
 * Merge suggestions into what a recipe already has.
 *
 * Existing tags are never dropped: somebody typed those, and a suggestion is
 * not grounds for overruling a person. Comparison is case-insensitive so a
 * suggested "Romanian" does not duplicate a hand-typed "romanian".
 */
export function mergeTags(existing: string[], suggested: string[]): string[] {
  const seen = new Set(existing.map((tag) => tag.toLowerCase()));
  return [...existing, ...suggested.filter((tag) => !seen.has(tag.toLowerCase()))];
}
