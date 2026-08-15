import { describe, expect, it } from "vitest";
import { groupByPlace } from "./kitchenGroups";
import type { SpisoItem } from "../api/spiso";

const item = (
  name: string,
  location: string | null,
  space: string | null = null,
  expires_on: string | null = null,
): SpisoItem => ({ id: name, name, quantity: 1, location, space, expires_on }) as SpisoItem;

describe("groupByPlace", () => {
  it("walks the kitchen in a fixed order rather than alphabetically", () => {
    const places = groupByPlace([
      item("Rice", "pantry"),
      item("Peas", "freezer"),
      item("Milk", "fridge"),
    ]);
    expect(places.map((place) => place.label)).toEqual(["Fridge", "Freezer", "Pantry"]);
  });

  it("splits a place into its shelves, unfiled last", () => {
    const places = groupByPlace([
      item("Butter", "fridge", "Door shelf"),
      item("Milk", "fridge"),
      item("Yoghurt", "fridge", "Top shelf"),
    ]);
    expect(places[0].spaces.map((space) => space.space)).toEqual(["Door shelf", "Top shelf", null]);
  });

  it("keeps the date order inside a shelf, so the urgent thing is on top", () => {
    const places = groupByPlace([
      item("Cheese", "fridge", "Door shelf", "2030-01-01T00:00:00Z"),
      item("Cream", "fridge", "Door shelf", "2020-01-01T00:00:00Z"),
    ]);
    expect(places[0].spaces[0].items.map((entry) => entry.name)).toEqual(["Cream", "Cheese"]);
  });

  it("counts what is in each place and what is about to go", () => {
    const soon = new Date(Date.now() + 86_400_000).toISOString();
    const places = groupByPlace([
      item("Milk", "fridge", null, soon),
      item("Jam", "fridge", null, "2030-01-01T00:00:00Z"),
    ]);
    expect(places[0].count).toBe(2);
    expect(places[0].soon).toBe(1);
  });

  it("puts anything unclassified after the real places", () => {
    // A location Spiso does not set must not push the fridge below a heading
    // nobody was looking for.
    const places = groupByPlace([item("Mystery", null), item("Milk", "fridge")]);
    expect(places.map((place) => place.label)).toEqual(["Fridge", "Somewhere else"]);
  });

  it("keeps a location it has never heard of, named as it arrived", () => {
    const places = groupByPlace([item("Wine", "cellar")]);
    expect(places[0].label).toBe("Cellar");
  });

  it("is empty for an empty kitchen", () => {
    expect(groupByPlace([])).toEqual([]);
  });
});
