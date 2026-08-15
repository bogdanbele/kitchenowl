import { describe, expect, it } from "vitest";
import {
  contentWords,
  countMatched,
  matchIngredient,
  matchSubstitute,
  type PantryThing,
} from "./pantryMatch";

const thing = (name: string): PantryThing => ({ name, quantity: 1 });

const kitchen = [
  thing("Cherry tomatoes"),
  thing("Sunflower oil"),
  thing("Spring onions"),
  thing("Potatoes"),
  thing("Dry yeast"),
  thing("Club Sanwich bread"),
];

describe("contentWords", () => {
  it("drops amounts and preparation words, keeping the food", () => {
    expect(contentWords("1 teaspoon Oil for painting the dough")).toEqual(["oil", "dough"]);
  });

  it("keeps a plain ingredient intact", () => {
    expect(contentWords("Pork belly")).toEqual(["pork", "belly"]);
  });

  it("has nothing to say about a line that is all units", () => {
    expect(contentWords("2 tbsp of")).toEqual([]);
  });
});

describe("matchIngredient", () => {
  it("calls an identical name exact and offers no alternatives", () => {
    const match = matchIngredient("Potatoes", kitchen);
    expect(match.kind).toBe("exact");
    expect(match.match?.name).toBe("Potatoes");
    expect(match.alternatives).toEqual([]);
  });

  it("calls a qualified thing likely, and says which thing", () => {
    // The name is the point: "you have this" is checkable only if it says what.
    const match = matchIngredient("Tomatoes", kitchen);
    expect(match.kind).toBe("likely");
    expect(match.match?.name).toBe("Cherry tomatoes");
  });

  it("reads a scraped sentence down to the ingredient it is about", () => {
    const match = matchIngredient("1 teaspoon Oil for painting the dough", kitchen);
    expect(match.kind).toBe("possible");
    expect(match.match?.name).toBe("Sunflower oil");
  });

  it("does not let a qualifier you lack pass as the thing", () => {
    // Owning pork is not owning pork belly.
    expect(matchIngredient("Pork belly", [thing("Pork")]).kind).toBe("possible");
    expect(matchIngredient("Pork belly", [thing("Pork")]).match?.name).toBe("Pork");
  });

  it("offers the near misses when it is not certain", () => {
    const match = matchIngredient("Onion", kitchen);
    expect(match.kind).toBe("likely");
    // Spring onions are not onions, which is exactly why the name is shown.
    expect(match.match?.name).toBe("Spring onions");
  });

  it("says none when the kitchen has nothing like it", () => {
    const match = matchIngredient("Saffron", kitchen);
    expect(match.kind).toBe("none");
    expect(match.match).toBeUndefined();
  });

  it("ignores an empty kitchen without inventing a match", () => {
    expect(matchIngredient("Salt", []).kind).toBe("none");
  });
});

describe("matching through an English alias", () => {
  // The kitchen is Danish; the recipes are not. Spiso is never written to, so
  // the English name lives here and is used for matching only.
  const danish = [
    { name: "Æg", alias: "egg" },
    { name: "Citronfromage", alias: "lemon mousse" },
    { name: "Rugbrød", alias: "rye bread" },
  ];

  it("finds a thing by what it is in English", () => {
    // "Eggs" folds to "egg", which is the alias exactly — so this is as certain
    // as a match gets, even though the two written names share no letters.
    const match = matchIngredient("Eggs", danish);
    expect(match.kind).toBe("exact");
    // Reported as what the tub says, not as the translation.
    expect(match.match?.name).toBe("Æg");
  });

  it("matches on the head noun of an alias", () => {
    expect(matchIngredient("Bread", danish).match?.name).toBe("Rugbrød");
  });

  it("still matches the real name when that is what the recipe used", () => {
    expect(matchIngredient("Citronfromage", danish).kind).toBe("exact");
  });

  it("takes the stronger of the two readings", () => {
    // Exact on the name beats possible on the alias.
    const both = [{ name: "Rice", alias: "sushi rice" }];
    expect(matchIngredient("Rice", both).kind).toBe("exact");
  });
});

describe("countMatched", () => {
  it("counts what is in the kitchen, not what might be", () => {
    const matches = ["Potatoes", "Tomatoes", "1 teaspoon Oil for painting the dough", "Saffron"].map(
      (name) => matchIngredient(name, kitchen),
    );
    // exact + likely, but not the possible one and not the miss.
    expect(countMatched(matches)).toBe(2);
  });
});

describe("the cook's own substitutes", () => {
  const kitchen = [thing("Danish smoked bacon"), thing("Cherry tomatoes")];

  it("finds a written substitute that is in the kitchen", () => {
    // Not a guess: the person who wrote the recipe said bacon works here.
    const found = matchSubstitute(["pork shoulder", "bacon"], kitchen);
    expect(found?.thing.name).toBe("Danish smoked bacon");
    expect(found?.substitute).toBe("bacon");
  });

  it("takes the first written substitute that is actually available", () => {
    const found = matchSubstitute(["tomatoes", "bacon"], kitchen);
    expect(found?.substitute).toBe("tomatoes");
  });

  it("says nothing when none of them are in the kitchen", () => {
    expect(matchSubstitute(["pancetta", "guanciale"], kitchen)).toBeNull();
  });

  it("copes with a recipe that lists none", () => {
    expect(matchSubstitute(undefined, kitchen)).toBeNull();
    expect(matchSubstitute([], kitchen)).toBeNull();
  });
});
