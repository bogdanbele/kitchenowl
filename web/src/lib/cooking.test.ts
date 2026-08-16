import { describe, expect, it } from "vitest";
import { findTimers, formatCountdown, mentionedItems, splitSteps } from "./cooking";
import type { RecipeItem } from "../api/types";

const item = (id: number, name: string): RecipeItem =>
  ({ id, name, description: "", optional: false }) as RecipeItem;

describe("splitSteps", () => {
  it("splits a numbered method and keeps the stage each step belongs to", () => {
    const steps = splitSteps(
      "## 1. Cook the pork\n\n1. Put the water on.\n2. Skim the foam.\n\n## 2. Add the vegetables\n\n1. Add the daikon.",
    );
    expect(steps.map((s) => [s.section, s.text])).toEqual([
      ["Cook the pork", "Put the water on."],
      ["Cook the pork", "Skim the foam."],
      ["Add the vegetables", "Add the daikon."],
    ]);
  });

  it("keeps a numbered step that wraps onto a second line as one step", () => {
    // A photographed page transcribes with the printed line breaks intact, and
    // the continuation was becoming a step of its own: a screen in cooking mode
    // that says "about 1 minute a side" and nothing else.
    const steps = splitSteps(
      "1. Whisk the eggs.\n2. Fry thin in a hot pan,\n   about 1 minute a side, until golden.",
    );
    expect(steps).toHaveLength(2);
    expect(steps[1].text).toBe("Fry thin in a hot pan, about 1 minute a side, until golden.");
  });

  it("still ends a step at a blank line", () => {
    const steps = splitSteps("1. Whisk the eggs.\n\nServe warm.");
    expect(steps.map((s) => s.text)).toEqual(["Whisk the eggs.", "Serve warm."]);
  });

  it("treats a prose paragraph as a step, because plenty of recipes never number anything", () => {
    const steps = splitSteps("Heat the oil until it shimmers.\n\nAdd the onion and cook it slowly.");
    expect(steps).toHaveLength(2);
    expect(steps[1].text).toBe("Add the onion and cook it slowly.");
  });

  it("joins a wrapped paragraph into one step rather than one per line", () => {
    const steps = splitSteps("Put the water on\nand bring it to a boil.");
    expect(steps).toHaveLength(1);
    expect(steps[0].text).toBe("Put the water on and bring it to a boil.");
  });

  it("drops the introduction when the method is structured", () => {
    // "Filipino sour pork soup, serves 4" is not an instruction, and it was
    // landing on the first screen of cooking mode as step 1.
    const steps = splitSteps(
      "A sour soup my grandmother made.\n\nServes four generously.\n\n## 1. Start\n\n1. Boil the water.",
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].text).toBe("Boil the water.");
  });

  it("keeps the prose when that is all the method is", () => {
    // No headings, no numbers: the paragraphs are the method.
    const steps = splitSteps("Heat the oil.\n\nAdd the onion.");
    expect(steps.map((s) => s.text)).toEqual(["Heat the oil.", "Add the onion."]);
  });

  it("returns nothing for an empty method instead of one blank step", () => {
    expect(splitSteps("")).toEqual([]);
    expect(splitSteps("   \n\n  ")).toEqual([]);
  });
});

describe("findTimers", () => {
  it("reads a plain duration", () => {
    expect(findTimers("Simmer for 20 minutes.")).toEqual([{ label: "20 minutes", seconds: 1200 }]);
  });

  it("takes the lower bound of a range", () => {
    // A timer is a prompt to come and look, and looking early is free.
    expect(findTimers("Cook 45-60 minutes")[0].seconds).toBe(45 * 60);
    expect(findTimers("rest 10 to 15 min")[0].seconds).toBe(10 * 60);
  });

  it.each([
    ["Bake for 1 hour", 3600],
    ["Blanch 90 seconds", 90],
    ["Fry 3-4 min a side", 180],
  ])("reads %s", (text, seconds) => {
    expect(findTimers(text)[0].seconds).toBe(seconds);
  });

  it("ignores things that are not timers", () => {
    // "1 kg" and "180°C" must not become countdowns.
    expect(findTimers("Add 1 kg of pork belly at 180°C")).toEqual([]);
    expect(findTimers("Serve with bread")).toEqual([]);
  });

  it("ignores an overnight marinade, which nobody stands a timer over", () => {
    expect(findTimers("Refrigerate for 12 hours")).toEqual([]);
  });

  it("returns the longest first and does not repeat the same duration", () => {
    const timers = findTimers("Simmer 5 minutes, then another 5 minutes, then 1 hour.");
    expect(timers[0].seconds).toBe(3600);
    expect(timers.filter((t) => t.seconds === 300)).toHaveLength(1);
  });
});

describe("mentionedItems", () => {
  const items = [item(1, "Onion"), item(2, "Oil"), item(3, "Pork belly"), item(4, "Tomatoes")];

  it("finds an ingredient named in the step", () => {
    expect(mentionedItems("Add the onion and the pork belly.", items)).toEqual([1, 3]);
  });

  it("matches a plural in the text against a singular ingredient", () => {
    expect(mentionedItems("Chop the onions", items)).toEqual([1]);
  });

  it("matches a singular in the text against a plural ingredient", () => {
    expect(mentionedItems("Add one tomato", items)).toEqual([4]);
  });

  it("does not match inside another word", () => {
    // "boil" contains "oil"; sending someone to the cupboard for oil because a
    // step said "bring to a boil" is worse than not highlighting at all.
    expect(mentionedItems("Bring to a boil", items)).toEqual([]);
  });

  it("copes with punctuation around the word", () => {
    expect(mentionedItems("Add the onion, then wait.", items)).toEqual([1]);
  });

  it("finds a compound ingredient by its head noun, since a step says the noun and not the qualifier", () => {
    const flours = [item(5, "Plain flour"), item(6, "strong bread flour"), item(7, "dried yeast")];
    expect(mentionedItems("Sift both flours together, mix in the yeast and sugar.", flours)).toEqual([
      5, 6, 7,
    ]);
  });

  it("does not let a head noun match inside another word", () => {
    // "flour" is the head of "Plain flour"; "flourish" must not count.
    const plainFlour = [item(8, "Plain flour")];
    expect(mentionedItems("Let the sauce flourish on low heat.", plainFlour)).toEqual([]);
  });
});

describe("splitSteps step photos", () => {
  it("pulls a step's photo out of its markdown and strips the syntax from the text", () => {
    const steps = splitSteps("1. Crush the biscuits.\n2. Press ![](crust.jpg) into the tin.");
    expect(steps[0].image).toBeUndefined();
    expect(steps[1].image).toBe("crust.jpg");
    expect(steps[1].text).toBe("Press into the tin.");
  });

  it("takes an absolute URL the same as an uploaded filename", () => {
    const steps = splitSteps("1. Chill for 4 hours. ![set](https://example.com/set.jpg)");
    expect(steps[0].image).toBe("https://example.com/set.jpg");
  });

  it("leaves a step with no photo alone", () => {
    const steps = splitSteps("1. Whisk the eggs.");
    expect(steps[0].image).toBeUndefined();
    expect(steps[0].text).toBe("Whisk the eggs.");
  });

  it("folds a photo inserted as its own paragraph into the step before it", () => {
    // This is what the editor's "insert a photo at the cursor" button writes:
    // a blank line on each side, so the recipe view gets a photo-sized
    // paragraph rather than a thumbnail wedged mid-sentence. Split naively,
    // that paragraph is a step of its own — text "", nothing to do.
    const steps = splitSteps(
      "1. Press the crumbs into the tin.\n\n![](crust.jpg)\n\n2. Chill for 20 minutes.",
    );
    expect(steps).toHaveLength(2);
    expect(steps[0].text).toBe("Press the crumbs into the tin.");
    expect(steps[0].image).toBe("crust.jpg");
    expect(steps[1].text).toBe("Chill for 20 minutes.");
    expect(steps[1].image).toBeUndefined();
  });

  it("keeps a photo as its own step when there is no step before it to fold into", () => {
    const steps = splitSteps("## 1. Start\n\n![](before-anything.jpg)\n\n1. Whisk the eggs.");
    expect(steps).toHaveLength(2);
    expect(steps[0].image).toBe("before-anything.jpg");
    expect(steps[1].text).toBe("Whisk the eggs.");
  });
});

describe("formatCountdown", () => {
  it.each([
    [90, "1:30"],
    [59, "0:59"],
    [3600, "1:00:00"],
    [3725, "1:02:05"],
    [-5, "0:00"],
  ])("formats %i seconds", (seconds, expected) => {
    expect(formatCountdown(seconds as number)).toBe(expected);
  });
});
