import { describe, expect, it } from "vitest";
import { formatTime, scaleAmount } from "./amount";

describe("scaleAmount", () => {
  it("leaves an amount alone at its own serving count", () => {
    expect(scaleAmount("2 pound", 1)).toBe("2 pound");
  });

  it("scales the leading number and keeps the unit", () => {
    expect(scaleAmount("2 pound", 2)).toBe("4 pound");
    expect(scaleAmount("300 g", 0.5)).toBe("150 g");
  });

  it("reads a comma decimal, which is how half of Europe writes it", () => {
    expect(scaleAmount("1,5 kg", 2)).toBe("3 kg");
  });

  it("rounds to two decimals rather than showing false precision", () => {
    expect(scaleAmount("1 tbsp", 1 / 3)).toBe("0.33 tbsp");
    expect(scaleAmount("1 tbsp", 2)).toBe("2 tbsp");
  });

  it("does not invent a number where the recipe gave none", () => {
    // "2 pinch" would be worse than leaving the cook to judge it.
    expect(scaleAmount("a pinch", 2)).toBe("a pinch");
    expect(scaleAmount("", 2)).toBe("");
  });

  it("only touches a number at the start, not one inside the text", () => {
    expect(scaleAmount("cut into 4 pieces", 2)).toBe("cut into 4 pieces");
  });
});

describe("formatTime", () => {
  it.each([
    [0, null],
    [45, "45 min"],
    [60, "1 h"],
    [90, "1 h 30"],
    [125, "2 h 5"],
  ])("formats %i minutes", (minutes, expected) => {
    expect(formatTime(minutes as number)).toBe(expected);
  });
});
