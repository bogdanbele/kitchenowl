import { describe, expect, it } from "vitest";
import { byUrgency, daysUntil, expiryLabel, timeLeft, type SpisoItem } from "./spiso";

const now = new Date("2026-08-15T09:00:00Z");
const item = (name: string, expires_on: string | null): SpisoItem =>
  ({ id: name, name, quantity: 1, expires_on }) as SpisoItem;

describe("daysUntil", () => {
  it("counts whole days, not hours", () => {
    // 23:00 tomorrow and 01:00 tomorrow are both "tomorrow" to a cook.
    expect(daysUntil("2026-08-16T23:00:00Z", now)).toBe(1);
    expect(daysUntil("2026-08-16T01:00:00Z", now)).toBe(1);
  });

  it("is zero for today and negative once it has passed", () => {
    expect(daysUntil("2026-08-15T23:00:00Z", now)).toBe(0);
    expect(daysUntil("2026-08-12T09:00:00Z", now)).toBe(-3);
  });

  it("returns null rather than NaN for nothing or nonsense", () => {
    expect(daysUntil(null, now)).toBeNull();
    expect(daysUntil("not a date", now)).toBeNull();
  });
});

describe("expiryLabel", () => {
  it.each([
    ["2026-08-15T00:00:00Z", "Today"],
    ["2026-08-16T00:00:00Z", "Tomorrow"],
    ["2026-08-14T00:00:00Z", "Yesterday"],
    ["2026-08-11T00:00:00Z", "4 days past"],
  ])("reads %s as %s", (iso, expected) => {
    expect(expiryLabel(iso, now)).toBe(expected);
  });

  it("names the weekday inside the coming week", () => {
    // A day you can act on beats a number you have to count.
    expect(expiryLabel("2026-08-18T00:00:00Z", now)).toBe("Tuesday");
  });

  it("stops shouting past a week and just gives the date", () => {
    expect(expiryLabel("2026-09-30T00:00:00Z", now)).toMatch(/30/);
    expect(expiryLabel("2026-09-30T00:00:00Z", now)).not.toMatch(/day/i);
  });

  it("is null when nothing has a date", () => {
    expect(expiryLabel(null, now)).toBeNull();
  });
});

describe("timeLeft", () => {
  it.each([
    ["2026-08-15T00:00:00Z", "today"],
    ["2026-08-16T00:00:00Z", "tomorrow"],
    ["2026-08-14T00:00:00Z", "yesterday"],
    ["2026-08-20T00:00:00Z", "in 5 days"],
    ["2026-08-10T00:00:00Z", "5 days ago"],
  ])("says %s is %s", (iso, expected) => {
    expect(timeLeft(iso, now)).toBe(expected);
  });

  it("counts in weeks once days stop being countable", () => {
    expect(timeLeft("2026-09-01T00:00:00Z", now)).toBe("in 2 weeks, 3 days");
  });

  it("counts in months past two, which is what a pantry date means", () => {
    // "17 Mar" is a date you subtract today from; this is the answer.
    expect(timeLeft("2027-03-17T00:00:00Z", now)).toBe("in 7 months, 4 days");
  });

  it("drops to years when it gets that far, and never says three units", () => {
    const label = timeLeft("2028-10-15T00:00:00Z", now)!;
    expect(label).toMatch(/^in 2 years/);
    expect(label.split(",")).toHaveLength(2);
  });

  it("says the round number without a stray zero", () => {
    // 60 days exactly: "2 months", not "2 months, 0 days".
    expect(timeLeft("2026-10-14T00:00:00Z", now)).toBe("in 2 months");
  });

  it("keeps a single unit singular", () => {
    expect(timeLeft("2027-09-10T00:00:00Z", now)).toMatch(/^in 1 year, /);
  });

  it("has nothing to say about a thing with no date", () => {
    expect(timeLeft(null, now)).toBeNull();
  });
});

describe("byUrgency", () => {
  it("puts the soonest first and the undated last", () => {
    const sorted = [
      item("Rice", null),
      item("Milk", "2026-08-16T00:00:00Z"),
      item("Spinach", "2026-08-15T00:00:00Z"),
    ].sort(byUrgency);
    expect(sorted.map((entry) => entry.name)).toEqual(["Spinach", "Milk", "Rice"]);
  });

  it("keeps something already off at the very top, where it can be dealt with", () => {
    const sorted = [item("Milk", "2026-08-16T00:00:00Z"), item("Cream", "2026-08-13T00:00:00Z")].sort(
      byUrgency,
    );
    expect(sorted[0].name).toBe("Cream");
  });

  it("orders undated items alphabetically so the list is stable", () => {
    const sorted = [item("Rice", null), item("Flour", null)].sort(byUrgency);
    expect(sorted.map((entry) => entry.name)).toEqual(["Flour", "Rice"]);
  });
});
