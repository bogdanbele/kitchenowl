import { describe, expect, it } from "vitest";
import { groupByPlace, sliceShelf, useFirst } from "./kitchenGroups";
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

describe("useFirst", () => {
  const day = 86_400_000;
  const inDays = (n: number) => new Date(Date.now() + n * day).toISOString();

  it("gathers what needs using from every place, soonest first", () => {
    const picked = useFirst([
      item("Rice", "pantry", null, inDays(400)),
      item("Milk", "fridge", null, inDays(1)),
      item("Cream", "fridge", null, inDays(-2)),
    ]);
    expect(picked.map((entry) => entry.name)).toEqual(["Cream", "Milk"]);
  });

  it("leaves out anything with no date, which cannot be urgent", () => {
    expect(useFirst([item("Flour", "pantry")])).toEqual([]);
  });

  it("stops at a handful — a strip of twenty is another list to read", () => {
    const many = Array.from({ length: 12 }, (_, i) => item(`Thing ${i}`, "fridge", null, inDays(1)));
    expect(useFirst(many)).toHaveLength(6);
  });

  it("is empty when nothing is urgent, so the strip disappears entirely", () => {
    expect(useFirst([item("Rice", "pantry", null, inDays(90))])).toEqual([]);
  });
});

describe("sliceShelf", () => {
  const day = 86_400_000;
  const inDays = (n: number) => new Date(Date.now() + n * day).toISOString();
  const many = (count: number, expires: string | null = null) =>
    Array.from({ length: count }, (_, i) => item(`Thing ${i}`, "pantry", null, expires));

  it("shows five and counts the rest", () => {
    const slice = sliceShelf(many(12));
    expect(slice.shown).toHaveLength(5);
    expect(slice.hidden).toBe(7);
    expect(slice.truncated).toBe(true);
  });

  it("never hides something going off, however many there are", () => {
    // A fold that hides the milk defeats the entire screen.
    const urgent = many(8, inDays(1));
    const slice = sliceShelf([...urgent, ...many(6, inDays(200))]);
    expect(slice.shown).toHaveLength(8);
    expect(slice.hidden).toBe(6);
  });

  it("does not trade a row for a button", () => {
    // Six items, one hidden: showing it costs nothing, hiding it costs a click.
    const slice = sliceShelf(many(6));
    expect(slice.shown).toHaveLength(6);
    expect(slice.truncated).toBe(false);
  });

  it("shows everything while searching", () => {
    // Hiding a match is how someone concludes it is not there.
    const slice = sliceShelf(many(12), { searching: true });
    expect(slice.shown).toHaveLength(12);
    expect(slice.hidden).toBe(0);
  });

  it("shows everything once expanded, and still offers to fold back", () => {
    const slice = sliceShelf(many(12), { expanded: true });
    expect(slice.shown).toHaveLength(12);
    expect(slice.truncated).toBe(true);
  });

  it("leaves a short shelf alone", () => {
    const slice = sliceShelf(many(3));
    expect(slice.shown).toHaveLength(3);
    expect(slice.truncated).toBe(false);
  });
});
