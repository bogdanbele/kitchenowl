import { describe, expect, it } from "vitest";
import { byCategory } from "./group";
import type { ShoppinglistItem } from "../api/types";

const item = (id: number, name: string, category?: string): ShoppinglistItem => ({
  id,
  name,
  description: "",
  category: category ? { id: id + 100, name: category } : null,
});

describe("byCategory", () => {
  it("groups items under their category name", () => {
    const groups = byCategory([
      item(1, "Milk", "Dairy"),
      item(2, "Onion", "Vegetables"),
      item(3, "Cheese", "Dairy"),
    ]);
    expect(groups.map(([name, items]) => [name, items.map((i) => i.name)])).toEqual([
      ["Dairy", ["Milk", "Cheese"]],
      ["Vegetables", ["Onion"]],
    ]);
  });

  it("puts uncategorised items last, where they do not interrupt the aisles", () => {
    const groups = byCategory([item(1, "Batteries"), item(2, "Milk", "Dairy")]);
    expect(groups.map(([name]) => name)).toEqual(["Dairy", ""]);
  });

  it("returns nothing for an empty list rather than an empty group", () => {
    expect(byCategory([])).toEqual([]);
  });
});
