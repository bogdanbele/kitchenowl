import { describe, expect, it } from "vitest";
import {
  ExtractionError,
  extractJson,
  toDraftFromExtraction,
  toExtractedRecipe,
} from "./recipeExtraction";

/**
 * A model's reply is untrusted input. The failure worth guarding is not "the
 * request failed" but "the reply looked plausible and was shaped wrong", which
 * lands in a form the user has already started filling in.
 */

describe("extractJson", () => {
  it("reads a bare object", () => {
    expect(extractJson('{"name":"Sarmale"}')).toEqual({ name: "Sarmale" });
  });

  it("unwraps a fenced block, which most models produce whatever the prompt says", () => {
    expect(extractJson('```json\n{"name":"Mămăligă"}\n```')).toEqual({ name: "Mămăligă" });
  });

  it("survives a chatty preamble and a trailing sentence", () => {
    const reply = 'Sure! Here is the recipe:\n{"name":"Zacuscă"}\nLet me know if you want changes.';
    expect(extractJson(reply)).toEqual({ name: "Zacuscă" });
  });

  it("refuses a reply with no JSON at all", () => {
    expect(() => extractJson("I cannot help with that.")).toThrow(ExtractionError);
  });

  it("refuses malformed JSON rather than half-parsing it", () => {
    expect(() => extractJson('{"name": "Broken",}')).toThrow(ExtractionError);
  });
});

describe("toExtractedRecipe", () => {
  const base = { name: "Sarmale", description: "## 1. Roll\nRoll them." };

  it("keeps the fields it recognises", () => {
    const recipe = toExtractedRecipe({
      ...base,
      yields: 6,
      time: 180,
      items: [{ name: "cabbage", description: "1 head", optional: false }],
      tags: ["romanian"],
    });
    expect(recipe).toMatchObject({ name: "Sarmale", yields: 6, time: 180, tags: ["romanian"] });
    expect(recipe.items).toEqual([{ name: "cabbage", description: "1 head", optional: false }]);
  });

  it("refuses a reply with no name, which is how the prompt says 'not a recipe'", () => {
    expect(() => toExtractedRecipe({ name: "" })).toThrow(ExtractionError);
    expect(() => toExtractedRecipe(null)).toThrow(ExtractionError);
  });

  it("coerces a range or a string where a number was asked for", () => {
    // "4-6" is the single most common way a model answers a yields field.
    expect(toExtractedRecipe({ ...base, yields: "4-6" }).yields).toBe(4);
    expect(toExtractedRecipe({ ...base, time: "90 minutes" }).time).toBe(90);
  });

  it("treats an unusable number as absent rather than guessing", () => {
    expect(toExtractedRecipe({ ...base, yields: "some" }).yields).toBe(0);
    expect(toExtractedRecipe({ ...base, time: -5 }).time).toBe(0);
  });

  it("accepts ingredients given as plain strings", () => {
    const recipe = toExtractedRecipe({ ...base, items: ["cabbage", "rice"] });
    expect(recipe.items.map((item) => item.name)).toEqual(["cabbage", "rice"]);
  });

  it("drops ingredient entries with no name instead of adding a blank row", () => {
    const recipe = toExtractedRecipe({
      ...base,
      items: [{ description: "2 tbsp" }, null, { name: "  " }, { name: "salt" }],
    });
    expect(recipe.items).toHaveLength(1);
    expect(recipe.items[0].name).toBe("salt");
  });

  it("only marks optional when the model actually said so", () => {
    const recipe = toExtractedRecipe({
      ...base,
      items: [
        { name: "dill", optional: "yes" },
        { name: "salt", optional: true },
      ],
    });
    expect(recipe.items[0].optional).toBe(false);
    expect(recipe.items[1].optional).toBe(true);
  });

  it("survives items being something other than an array", () => {
    expect(toExtractedRecipe({ ...base, items: "cabbage, rice" }).items).toEqual([]);
  });
});

describe("toDraftFromExtraction", () => {
  it("records the model in source, so the recipe can be shown as AI-written", () => {
    // Passing generated text off as tested cooking is the one thing this
    // feature must not do quietly.
    const draft = toDraftFromExtraction(
      toExtractedRecipe({ name: "Papanași", description: "x" }),
      "anthropic/claude-3.5-haiku",
    );
    expect(draft.source).toBe("ai://anthropic/claude-3.5-haiku");
  });
});
