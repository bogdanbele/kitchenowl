import { describe, expect, it } from "vitest";
import { fromScrape, toDraft, type ScrapeResult } from "./scrape";
import type { Recipe } from "../api/types";

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: 1,
  name: "Sinigang na Baboy",
  description: "1. Rinse pork ribs.",
  yields: 4,
  time: 120,
  cook_time: 105,
  prep_time: 15,
  items: [],
  tags: [],
  ...over,
});

describe("toDraft", () => {
  it("fills the gaps the API leaves rather than putting undefined in an input", () => {
    // A controlled input handed undefined switches to uncontrolled and React
    // warns; worse, the field silently stops updating.
    const draft = toDraft({ ...recipe(), description: undefined as never, source: undefined });
    expect(draft.description).toBe("");
    expect(draft.source).toBe("");
    expect(draft.photo).toBeNull();
  });
});

describe("fromScrape", () => {
  const result = (items: ScrapeResult["items"]): ScrapeResult => ({ recipe: recipe(), items });

  it("uses the household's own name and amount for an ingredient it recognised", () => {
    const draft = fromScrape(
      result({
        "1 bunch bok choy": { id: 7, name: "Bok choy", description: "1 bunch", optional: false },
      }),
    );
    expect(draft.items).toEqual([{ name: "Bok choy", description: "1 bunch", optional: false }]);
  });

  it("keeps the site's wording when nothing matched, rather than dropping the line", () => {
    // Wrong-but-visible beats silently missing: a cook can fix "2 pounds pork
    // spare ribs" in the form, but cannot notice an ingredient that never
    // arrived.
    const draft = fromScrape(result({ "2 pounds pork spare ribs, cut into 2-inch pieces": null }));
    expect(draft.items).toEqual([
      { name: "2 pounds pork spare ribs, cut into 2-inch pieces", description: "", optional: false },
    ]);
  });

  it("keeps every line, matched or not, in the order the site gave them", () => {
    const draft = fromScrape(
      result({
        "1 onion": { id: 1, name: "Onion", description: "1 piece", optional: false },
        "8 pieces okra": null,
        "2 tomatoes": { id: 2, name: "Tomatoes", description: "2 pieces", optional: false },
      }),
    );
    expect(draft.items.map((item) => item.name)).toEqual(["Onion", "8 pieces okra", "Tomatoes"]);
  });

  it("carries the recipe's own fields through the import", () => {
    const draft = fromScrape(result({}));
    expect(draft).toMatchObject({ name: "Sinigang na Baboy", yields: 4, time: 120, cook_time: 105 });
  });

  it("survives a scrape that matched nothing at all", () => {
    expect(fromScrape(result({})).items).toEqual([]);
  });
});
