import { describe, expect, it } from "vitest";
import {
  DAY_MS,
  argbToCss,
  isUnscheduled,
  money,
  relativeDay,
  utcMidnight,
} from "./format";

describe("utcMidnight", () => {
  it("collapses a timestamp to midnight UTC of its own day", () => {
    expect(utcMidnight(new Date("2026-08-14T22:15:00Z"))).toBe(Date.UTC(2026, 7, 14));
  });

  it("uses the UTC day, not the local one", () => {
    // 23:30 UTC is already tomorrow in Copenhagen. Reading it locally would put
    // a plan on the wrong day for anyone east of Greenwich.
    expect(utcMidnight(new Date("2026-08-14T23:30:00Z"))).toBe(Date.UTC(2026, 7, 14));
  });
});

describe("isUnscheduled", () => {
  it("recognises the API's date.min sentinel for a plan with no day", () => {
    expect(isUnscheduled(-62135596800000)).toBe(true);
    expect(isUnscheduled(Date.UTC(2026, 7, 14))).toBe(false);
  });
});

describe("relativeDay", () => {
  const today = Date.UTC(2026, 7, 14);

  it.each([
    [today, "Today"],
    [today + DAY_MS, "Tomorrow"],
    [today - DAY_MS, "Yesterday"],
  ])("names the days around today", (timestamp, expected) => {
    expect(relativeDay(timestamp as number, today)).toBe(expected);
  });

  it("falls back to a dated label further out", () => {
    expect(relativeDay(today + 5 * DAY_MS, today)).toMatch(/19/);
  });
});

describe("money", () => {
  it("always shows two decimals", () => {
    expect(money(5)).toBe("5.00");
    expect(money(5.5)).toBe("5.50");
  });

  it("does not invent a currency symbol", () => {
    // The API stores a bare float and there is no currency setting; a wrong
    // symbol on a number people settle up with is worse than none.
    expect(money(12.34)).not.toMatch(/[€$£]/);
  });

  it("keeps a negative balance negative", () => {
    expect(money(-7.5)).toMatch(/^-7\.50$/);
  });
});

describe("argbToCss", () => {
  it("converts the signed ARGB integer Flutter stores", () => {
    expect(argbToCss(0xffef4b52)).toBe("rgb(239 75 82)");
  });

  it("survives the value arriving negative through JSON", () => {
    // 0xFFEF4B52 does not fit a signed 32-bit int, so it can come back as a
    // negative number. `| 0` is the same reinterpretation the server's store did.
    expect(argbToCss(0xffef4b52 | 0)).toBe("rgb(239 75 82)");
  });

  it("returns nothing for a category with no colour", () => {
    expect(argbToCss(null)).toBeNull();
    expect(argbToCss(undefined)).toBeNull();
  });
});
