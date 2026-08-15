import { describe, expect, it } from "vitest";
import {
  derivedTags,
  describeForTagging,
  mergeTags,
  parseTags,
  VOCABULARY,
} from "./recipeTags";

describe("parseTags", () => {
  it("keeps what is in the vocabulary and folds the case", () => {
    // "vegan" and "Vegan" must be one filter, not two.
    expect(parseTags(["romanian", "Soup", "VEGAN"])).toEqual(["Romanian", "Soup", "Vegan"]);
  });

  it("drops an invented tag rather than starting a synonym", () => {
    expect(parseTags(["Veggie", "Hearty", "Soup"])).toEqual(["Soup"]);
  });

  it("does not repeat a tag the model said twice", () => {
    expect(parseTags(["Soup", "soup"])).toEqual(["Soup"]);
  });

  it("survives a reply that is not a list at all", () => {
    expect(parseTags({ tags: ["Soup"] })).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(["Soup", 7, null])).toEqual(["Soup"]);
  });
});

describe("derivedTags", () => {
  it("calls a half-hour recipe quick, from the number already stored", () => {
    // Asking a model to estimate a field we hold is how a recipe ends up
    // tagged Quick and marked two hours.
    expect(derivedTags({ name: "Omelette", time: 12 })).toEqual(["Quick"]);
  });

  it("says nothing about a recipe with no time on it", () => {
    expect(derivedTags({ name: "Sarmale" })).toEqual([]);
    expect(derivedTags({ name: "Sarmale", time: 0 })).toEqual([]);
  });

  it("does not call four hours quick", () => {
    expect(derivedTags({ name: "Sarmale", time: 240 })).toEqual([]);
  });
});

describe("mergeTags", () => {
  it("adds what is new and keeps what was there", () => {
    expect(mergeTags(["AI-written"], ["Romanian", "Soup"])).toEqual([
      "AI-written",
      "Romanian",
      "Soup",
    ]);
  });

  it("never overrules a person's own spelling", () => {
    // Somebody typed "romanian"; a suggestion is not grounds to change it.
    expect(mergeTags(["romanian"], ["Romanian", "Soup"])).toEqual(["romanian", "Soup"]);
  });

  it("is a no-op when the suggestions are already there", () => {
    expect(mergeTags(["Soup", "Romanian"], ["Soup"])).toEqual(["Soup", "Romanian"]);
  });
});

describe("describeForTagging", () => {
  it("sends the name, the ingredients and a slice of the method", () => {
    const text = describeForTagging({
      name: "Ciorbă",
      items: [{ name: "Borș" }, { name: "Pork mince" }],
      description: "## Method\n1. Boil the water.",
    });
    expect(text).toContain("Name: Ciorbă");
    expect(text).toContain("Borș, Pork mince");
    expect(text).toContain("Boil the water");
  });

  it("does not send four screens of prose per recipe", () => {
    const text = describeForTagging({ name: "Long", description: "x".repeat(5000) });
    expect(text.length).toBeLessThan(700);
  });

  it("copes with a recipe that is only a name", () => {
    expect(describeForTagging({ name: "Mystery" })).toBe("Name: Mystery");
  });
});

describe("the vocabulary itself", () => {
  it("has no duplicates, which would show as two identical filters", () => {
    expect(new Set(VOCABULARY).size).toBe(VOCABULARY.length);
  });
});
