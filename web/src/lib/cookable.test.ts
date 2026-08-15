import { describe, expect, it } from "vitest";
import { normaliseName, pantryFrom, pantryNames, rankCookable } from "./cookable";
import type { Recipe, RecipeItem, ShoppinglistItem } from "../api/types";

const ingredient = (name: string, optional = false): RecipeItem =>
  ({ id: name.length + name.charCodeAt(0), name, description: "", optional }) as RecipeItem;

const recipe = (name: string, items: RecipeItem[]): Recipe =>
  ({ id: name.length, name, description: "", yields: 2, time: 0, cook_time: 0, prep_time: 0, items, tags: [] }) as Recipe;

const bought = (name: string): ShoppinglistItem =>
  ({ id: name.length, name, description: "" }) as ShoppinglistItem;

describe("normaliseName", () => {
  it.each([
    ["Tomatoes", "tomato"],
    ["tomato", "tomato"],
    ["  Onion  ", "onion"],
    ["Pork belly", "pork belly"],
  ])("folds %s", (input, expected) => {
    expect(normaliseName(input)).toBe(expected);
  });

  it("lets a name with punctuation meet the same name without it", () => {
    expect(normaliseName("crème fraîche,")).toBe(normaliseName("Crème fraîche"));
  });
});

describe("pantryFrom", () => {
  it("counts both what is on the list and what was bought recently", () => {
    const pantry = pantryFrom([bought("Onion")], [bought("Tomatoes")]);
    expect(pantry.has("onion")).toBe(true);
    expect(pantry.has("tomato")).toBe(true);
  });
});

describe("pantryNames", () => {
  it("lets a qualified thing answer to what it is", () => {
    // A real kitchen holds "Cherry tomatoes"; recipes ask for "Tomatoes".
    // Exact matching found neither, and a connected inventory of thirty things
    // produced an empty "Cook now".
    expect(pantryNames("Cherry tomatoes")).toEqual(["cherry tomato", "tomato"]);
    expect(pantryNames("Danish smoked bacon")).toContain("bacon");
  });

  it("does not invent a second name for a single word", () => {
    expect(pantryNames("Butter")).toEqual(["butter"]);
  });

  it("ignores a two-letter tail, which is a preposition and not an ingredient", () => {
    expect(pantryNames("Tin of ta")).toEqual(["tin of ta"]);
  });

  it("is empty for a blank name", () => {
    expect(pantryNames("   ")).toEqual([]);
  });
});

describe("qualified pantry items in ranking", () => {
  it("matches a recipe's plain ingredient against the qualified thing you own", () => {
    const soup = recipe("Soup", [ingredient("Tomatoes"), ingredient("Bacon")]);
    const pantry = pantryFrom([bought("Cherry tomatoes"), bought("Danish smoked bacon")]);
    const [ranked] = rankCookable([soup], pantry);
    expect(ranked.missing).toHaveLength(0);
  });

  it("does not let a qualifier you lack pass as the thing itself", () => {
    // Having "pork" is not having pork belly — the qualifier is the ingredient.
    const dish = recipe("Sinigang", [ingredient("Pork belly")]);
    expect(rankCookable([dish], pantryFrom([bought("Pork")]))).toEqual([]);
  });
});

describe("rankCookable", () => {
  const sinigang = recipe("Sinigang", [ingredient("Pork belly"), ingredient("Tomatoes"), ingredient("Fish sauce")]);
  const mamaliga = recipe("Mămăligă", [ingredient("Cornmeal"), ingredient("Water")]);

  it("puts the recipe you are closest to cooking first", () => {
    const pantry = pantryFrom([bought("Cornmeal"), bought("Water"), bought("Tomatoes")]);
    const ranked = rankCookable([sinigang, mamaliga], pantry);
    expect(ranked[0].recipe.name).toBe("Mămăligă");
    expect(ranked[0].missing).toHaveLength(0);
  });

  it("says exactly what is missing, which is the useful part", () => {
    const ranked = rankCookable([sinigang], pantryFrom([bought("Pork belly"), bought("Tomatoes")]));
    expect(ranked[0].missing.map((item) => item.name)).toEqual(["Fish sauce"]);
  });

  it("does not count an optional ingredient as missing", () => {
    // A recipe you can cook without the dill is a recipe you can cook.
    const withGarnish = recipe("Soup", [ingredient("Water"), ingredient("Dill", true)]);
    const ranked = rankCookable([withGarnish], pantryFrom([bought("Water")]));
    expect(ranked[0].missing).toHaveLength(0);
    expect(ranked[0].readiness).toBe(1);
  });

  it("ignores recipes you have nothing for, rather than listing everything", () => {
    expect(rankCookable([sinigang], pantryFrom([bought("Chocolate")]))).toEqual([]);
  });

  it("does not float an empty recipe to the top as fully ready", () => {
    // No ingredients listed is unknown, not complete.
    const empty = recipe("Mystery", []);
    const ranked = rankCookable([empty, mamaliga], pantryFrom([bought("Cornmeal")]));
    expect(ranked.map((entry) => entry.recipe.name)).toEqual(["Mămăligă"]);
  });

  it("matches a plural ingredient against a singular purchase", () => {
    const ranked = rankCookable([sinigang], pantryFrom([bought("Tomato")]));
    expect(ranked[0].have.map((item) => item.name)).toEqual(["Tomatoes"]);
  });

  it("orders stably when two recipes are equally close", () => {
    const a = recipe("Beta", [ingredient("Water"), ingredient("Salt")]);
    const b = recipe("Alpha", [ingredient("Water"), ingredient("Pepper")]);
    const ranked = rankCookable([a, b], pantryFrom([bought("Water")]));
    expect(ranked.map((entry) => entry.recipe.name)).toEqual(["Alpha", "Beta"]);
  });
});
