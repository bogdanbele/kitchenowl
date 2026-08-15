/**
 * What you could use instead, from what is actually in the kitchen.
 *
 * The constraint that makes this useful rather than decorative: every
 * suggestion must name something the house already has. "Use pancetta" is a
 * fact about cooking; "use the smoked bacon in the fridge" is a dinner. So the
 * kitchen is sent with the question, and anything the reply names that is not
 * in it is dropped rather than shown.
 *
 * Nothing is written anywhere. A substitution is advice at the moment of
 * cooking, and quietly editing a recipe to say bacon would be a lie about what
 * the recipe is.
 */

export interface Substitution {
  /** The recipe's ingredient, exactly as the recipe names it. */
  missing: string;
  /** What to use instead — a name from the kitchen, verbatim. */
  use: string;
  /** How it changes the dish. One sentence, and honest about the trade. */
  note: string;
}

export const SUBSTITUTION_PROMPT = `You suggest ingredient substitutions for a cook mid-recipe.

You are given a dish, the ingredients it needs that the kitchen does not have,
and everything the kitchen does have. Return ONLY a JSON array:
[{ "missing": string, "use": string, "note": string }]

Rules:
- "use" must be copied exactly from the kitchen list. Never suggest something
  they would have to buy — that is the problem they already have.
- Only suggest a swap that genuinely works in this dish. Most missing
  ingredients have no substitute in a given kitchen; returning fewer, or none at
  all, is the right answer and an empty array is a fine reply.
- Never substitute the thing the dish is named after or built on. Sinigang
  without the souring agent is not Sinigang with a note.
- Never use the same replacement for two missing ingredients. One thing cannot
  stand in for four, and answering "cucumber" for every vegetable is a way of
  saying you have no answer.
- The swap must survive the cooking. A crisp salad vegetable does not replace
  something simmered for an hour, whatever they have in common raw.
- "note" is one short sentence saying how it differs and what to adjust —
  "saltier, so use a third less and hold the salt". Say if it changes the dish
  materially.
- Never invent an ingredient, never explain yourself, never return prose.`;

export function buildSubstitutionRequest(
  dish: string,
  missing: string[],
  kitchen: string[],
): string {
  return [
    `Dish: ${dish}`,
    `Missing: ${missing.join(", ")}`,
    `In the kitchen: ${kitchen.join(", ")}`,
  ].join("\n");
}

/**
 * The reply, reduced to suggestions that are actually usable.
 *
 * Three things are checked, and all three have been worth checking: that the
 * suggestion names something in the kitchen, that it answers an ingredient we
 * asked about, and that it is not suggesting a thing be replaced by itself.
 */
export function parseSubstitutions(
  reply: unknown,
  missing: string[],
  kitchen: string[],
): Substitution[] {
  if (!Array.isArray(reply)) return [];

  const fold = (value: string) => value.trim().toLowerCase();
  const asked = new Map(missing.map((name) => [fold(name), name]));
  const have = new Map(kitchen.map((name) => [fold(name), name]));
  const out: Substitution[] = [];

  for (const entry of reply) {
    if (!entry || typeof entry !== "object") continue;
    const { missing: gap, use, note } = entry as Record<string, unknown>;
    if (typeof gap !== "string" || typeof use !== "string") continue;

    const ingredient = asked.get(fold(gap));
    const replacement = have.get(fold(use));
    // Not asked about, not in the kitchen, or a thing replacing itself.
    if (!ingredient || !replacement || fold(gap) === fold(use)) continue;
    if (out.some((existing) => existing.missing === ingredient)) continue;
    // One thing cannot stand in for four. Asked for in the prompt and enforced
    // here, because the first run answered "cucumber" for bok choy, daikon,
    // eggplant and green beans — four suggestions that each admitted, in their
    // own note, that they were wrong.
    if (out.some((existing) => fold(existing.use) === fold(use))) continue;

    out.push({
      missing: ingredient,
      use: replacement,
      note: typeof note === "string" ? note.trim().slice(0, 160) : "",
    });
  }
  return out;
}
