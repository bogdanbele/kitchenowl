import { beforeEach, describe, expect, it } from "vitest";
import { forgetRecipe, isHave, overridesFor, setOverride } from "./haveList";

beforeEach(() => {
  localStorage.clear();
});

describe("isHave", () => {
  it("follows the matcher when the cook has said nothing", () => {
    expect(isHave({}, 5, true)).toBe(true);
    expect(isHave({}, 5, false)).toBe(false);
  });

  it("lets the cook confirm a maybe the app hedged on", () => {
    // The knorr sinigang mix really is the sinigang mix.
    expect(isHave({ "5": true }, 5, false)).toBe(true);
  });

  it("lets the cook overrule a match that is wrong", () => {
    // Spring onions answering for onions, for instance.
    expect(isHave({ "5": false }, 5, true)).toBe(false);
  });
});

describe("setOverride", () => {
  it("records a tick that disagrees with the app", () => {
    const forRecipe = setOverride(2, 5, true, false);
    expect(forRecipe).toEqual({ "5": true });
    expect(overridesFor(2)).toEqual({ "5": true });
  });

  it("stores nothing when the tick agrees with the app", () => {
    // A match the app already found needs no record — and storing it would
    // freeze today's answer into a list that outlives the ingredient.
    setOverride(2, 5, true, true);
    expect(overridesFor(2)).toEqual({});
  });

  it("clears an override when the cook changes their mind back", () => {
    setOverride(2, 5, true, false);
    setOverride(2, 5, false, false);
    expect(overridesFor(2)).toEqual({});
  });

  it("keeps recipes apart", () => {
    setOverride(2, 5, true, false);
    setOverride(3, 5, false, true);
    expect(overridesFor(2)).toEqual({ "5": true });
    expect(overridesFor(3)).toEqual({ "5": false });
  });

  it("leaves nothing behind for a recipe that ends up agreeing", () => {
    setOverride(2, 5, true, false);
    setOverride(2, 5, false, false);
    expect(JSON.parse(localStorage.getItem("kitchenowl.have") ?? "{}")).toEqual({});
  });
});

describe("forgetRecipe", () => {
  it("drops every tick for one recipe and leaves the others", () => {
    setOverride(2, 5, true, false);
    setOverride(3, 9, true, false);
    forgetRecipe(2);
    expect(overridesFor(2)).toEqual({});
    expect(overridesFor(3)).toEqual({ "9": true });
  });
});

describe("storage that is missing or corrupt", () => {
  it("reads nothing rather than throwing", () => {
    localStorage.setItem("kitchenowl.have", "not json");
    expect(overridesFor(2)).toEqual({});
  });
});
