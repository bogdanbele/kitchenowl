import { describe, expect, it } from "vitest";
import { alreadyListed, matchItems, parseItemInput } from "./itemInput";
import type { ShoppinglistItem } from "../api/types";

const listItem = (id: number, name: string, description = ""): ShoppinglistItem =>
  ({ id, name, description }) as ShoppinglistItem;

describe("parseItemInput", () => {
  it("splits the amount off after the first comma", () => {
    expect(parseItemInput("milk, 2 semi skimmed")).toEqual({
      name: "milk",
      description: "2 semi skimmed",
    });
  });

  it("keeps later commas in the description", () => {
    // "eggs, 12, large" is one item, not three.
    expect(parseItemInput("eggs, 12, large").description).toBe("12, large");
  });

  it("treats a plain name as a name", () => {
    expect(parseItemInput("bread")).toEqual({ name: "bread", description: "" });
  });

  it("trims the space people type after the comma", () => {
    expect(parseItemInput("  bread ,  sourdough ")).toEqual({
      name: "bread",
      description: "sourdough",
    });
  });

  it("survives a trailing comma mid-typing", () => {
    expect(parseItemInput("bread,")).toEqual({ name: "bread", description: "" });
  });
});

describe("matchItems", () => {
  const items = [
    listItem(1, "Milk", "2 semi skimmed"),
    listItem(2, "Bread", "sourdough"),
    listItem(3, "Milk chocolate"),
  ];

  it("finds by name", () => {
    expect(matchItems(items, "milk").map((item) => item.id)).toEqual([1, 3]);
  });

  it("finds by description, which is where the detail lives", () => {
    expect(matchItems(items, "sourdough").map((item) => item.id)).toEqual([2]);
  });

  it("filters on the name half only, since the rest is the amount being added", () => {
    // "flour, 2 bags" once reported "nothing matching flour" directly under a
    // field saying flour was already on the list.
    expect(matchItems(items, "milk, 2 bags").map((item) => item.id)).toEqual([1, 3]);
  });

  it("returns everything for an empty query", () => {
    expect(matchItems(items, "  ")).toHaveLength(3);
  });
});

describe("alreadyListed", () => {
  const items = [listItem(1, "Milk", "2 semi skimmed")];

  it("ignores case and the typed amount", () => {
    expect(alreadyListed(items, "MILK, 4")).toBe(true);
  });

  it("does not count a partial name as present", () => {
    // "Milk chocolate" is not milk; offering to add it must stay available.
    expect(alreadyListed(items, "milk chocolate")).toBe(false);
  });

  it("is false for nothing typed", () => {
    expect(alreadyListed(items, "")).toBe(false);
  });
});
