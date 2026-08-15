/**
 * "I have this" — the cook's answer, over the app's guess.
 *
 * The matcher gets some of it right, hedges on the rest, and cannot know about
 * water. So each ingredient can be ticked, and what is ticked is left off the
 * shopping list.
 *
 * Only *overrides* are stored, never the whole state. A match the app already
 * found needs no record, and storing "have" for it would freeze today's answer
 * into a list that outlives the ingredient being used up. What is worth keeping
 * is the two disagreements: a maybe the cook confirmed, and a match the cook
 * knows is wrong.
 *
 * Kept in this browser rather than on the recipe. Whether there is water at
 * your tap is not a fact about the recipe, and writing it there would tell
 * everyone else in the household something about your kitchen instead.
 */

const KEY = "kitchenowl.have";

type Overrides = Record<string, Record<string, boolean>>;

function read(): Overrides {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Overrides) : {};
  } catch {
    return {};
  }
}

function write(all: Overrides): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage blocked: ticks last for the visit, which is most of their value.
  }
}

export function overridesFor(recipeId: string | number): Record<string, boolean> {
  return read()[String(recipeId)] ?? {};
}

/**
 * Record a tick, or clear it when it agrees with what the app already thinks.
 *
 * Dropping the redundant entry keeps the store to genuine disagreements, so a
 * recipe whose ingredients all match cleanly leaves nothing behind at all.
 */
export function setOverride(
  recipeId: string | number,
  itemId: string | number,
  have: boolean,
  matched: boolean,
): Record<string, boolean> {
  const all = read();
  const forRecipe = { ...(all[String(recipeId)] ?? {}) };

  if (have === matched) delete forRecipe[String(itemId)];
  else forRecipe[String(itemId)] = have;

  if (Object.keys(forRecipe).length === 0) delete all[String(recipeId)];
  else all[String(recipeId)] = forRecipe;

  write(all);
  return forRecipe;
}

/** Whether this ingredient counts as in the house, cook's word first. */
export function isHave(
  overrides: Record<string, boolean>,
  itemId: string | number,
  matched: boolean,
): boolean {
  const said = overrides[String(itemId)];
  return said === undefined ? matched : said;
}

export function forgetRecipe(recipeId: string | number): void {
  const all = read();
  delete all[String(recipeId)];
  write(all);
}
