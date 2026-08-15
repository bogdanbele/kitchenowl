import { PRIVATE, type Draft } from "./scrape";

/**
 * Turning a wall of pasted text — or a photographed page — into a recipe.
 *
 * The prompt and the parsing live here, away from the network call, because
 * this is the part that can be tested: a model's reply is untrusted input, and
 * the failure that matters is not "the request failed" but "the model returned
 * something plausible and wrong".
 */

export const EXTRACTION_SYSTEM_PROMPT = `You convert a recipe — pasted text, or a photograph of a page — into a structured recipe.

Return ONLY a JSON object, no prose, no code fences, with this exact shape:
{
  "name": string,
  "description": string,
  "yields": number,
  "time": number,
  "prep_time": number,
  "cook_time": number,
  "items": [{ "name": string, "description": string, "optional": boolean }],
  "tags": [string]
}

Rules:
- "description" is the method in markdown. Use "## " headings for stages and a
  numbered list for steps. Do not put the ingredient list in it.
- "items" are ingredients. "name" is the ingredient alone, singular and without
  quantity ("pork belly", not "800g pork belly"). "description" is the quantity
  exactly as written in the source ("800 g", "2 tbsp", "a pinch").
- **Ingredient names in English**, whatever language the recipe is in: "brânză
  de vaci" becomes "cottage cheese", "griș" becomes "semolina", "făină" becomes
  "flour". Use the ordinary shop name a British cook would write on a list. An
  ingredient with no English name keeps its own ("borș", "gochujang").
- "description", "name" (the recipe's title) and the whole method stay in the
  source language. Only the ingredient names are translated: those are matched
  against a kitchen and a shopping list, and a name that only matches recipes
  written in the same language matches nothing.
- "optional": true only when the text says optional, to taste, or garnish.
- Times are whole minutes. "yields" is the number of servings. Use 0 when the
  text does not say — never guess a number. If only a total time is given, put
  it in "time" and leave "prep_time" and "cook_time" at 0; do not split it.
- Reproduce every diacritic exactly as printed — ș ț ă î â, ü ö, é è ç — in the
  title and the method. A word spelled without them is a different word, and
  this text is read back by someone who wrote it.
- Never invent an ingredient or a step that is not in the text. If the text is
  not a recipe, return {"name": ""} and nothing else.`;

export interface ExtractedRecipe {
  name: string;
  description: string;
  yields: number;
  time: number;
  prep_time: number;
  cook_time: number;
  items: { name: string; description: string; optional: boolean }[];
  tags: string[];
}

/** Thrown when the reply cannot be read as a recipe, with something showable. */
export class ExtractionError extends Error {}

/**
 * Pull the JSON object out of a model's reply.
 *
 * Models wrap JSON in ```json fences, prefix it with "Here is the recipe:", or
 * add a trailing sentence, whatever the prompt says. Slicing between the first
 * brace and the last is cruder than a parser and survives all three.
 */
export function extractJson(reply: string): unknown {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : reply;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new ExtractionError("The model did not return a recipe.");
  }
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new ExtractionError("The model's reply was not valid JSON.");
  }
}

const asNumber = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
};

const asText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * Validate and coerce, rather than trusting the shape.
 *
 * Everything here is defensive on purpose: a model that returns `yields: "4-6"`
 * or an ingredient as a bare string is common, and the alternative to coercing
 * is a runtime crash in a form the user has already started filling in.
 */
export function toExtractedRecipe(raw: unknown): ExtractedRecipe {
  if (!raw || typeof raw !== "object") throw new ExtractionError("The model returned nothing usable.");
  const source = raw as Record<string, unknown>;

  const name = asText(source.name);
  if (!name) {
    throw new ExtractionError("That text does not look like a recipe.");
  }

  const rawItems = Array.isArray(source.items) ? source.items : [];
  const items = rawItems
    .map((entry) => {
      // Some models answer with a plain string per ingredient.
      if (typeof entry === "string") return { name: entry.trim(), description: "", optional: false };
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const itemName = asText(item.name);
      if (!itemName) return null;
      return {
        name: itemName.slice(0, 128),
        description: asText(item.description),
        optional: item.optional === true,
      };
    })
    .filter((item): item is ExtractedRecipe["items"][number] => item !== null);

  const tags = (Array.isArray(source.tags) ? source.tags : [])
    .map(asText)
    .filter(Boolean)
    .slice(0, 8);

  return {
    name: name.slice(0, 128),
    description: asText(source.description),
    yields: asNumber(source.yields),
    time: asNumber(source.time),
    prep_time: asNumber(source.prep_time),
    cook_time: asNumber(source.cook_time),
    items,
    tags,
  };
}

/**
 * Into the editor's draft shape.
 *
 * `source` records that a model wrote this, which the recipe page reads to show
 * an "AI-written" badge. Passing generated text off as a tested recipe is the
 * one thing this feature must not do.
 */
export function toDraftFromExtraction(recipe: ExtractedRecipe, model: string): Draft {
  return {
    name: recipe.name,
    description: recipe.description,
    yields: recipe.yields,
    time: recipe.time,
    prep_time: recipe.prep_time,
    cook_time: recipe.cook_time,
    source: `ai://${model}`,
    photo: null,
    items: recipe.items.map((item) => ({ ...item, substitutes: [] })),
    // Tagged as written by a model, and private, without anyone having to
    // remember to set either after reading what came back.
    tags: ["AI-written"],
    visibility: PRIVATE,
  };
}
