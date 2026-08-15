import { describe, expect, it } from "vitest";
import { contentWords, countMatched, matchIngredient, type PantryThing } from "./pantryMatch";

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

describe("countMatched", () => {
  it("counts what is in the kitchen, not what might be", () => {
    const matches = ["Potatoes", "Tomatoes", "1 teaspoon Oil for painting the dough", "Saffron"].map(
      (name) => matchIngredient(name, kitchen),
    );
    // exact + likely, but not the possible one and not the miss.
    expect(countMatched(matches)).toBe(2);
  });
});
