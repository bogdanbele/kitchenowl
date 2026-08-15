import { beforeEach, describe, expect, it } from "vitest";
import {
  cacheKey,
  cachedEnglish,
  forgetTranslations,
  parseTranslations,
  rememberEnglish,
  untranslated,
} from "./pantryTranslate";

beforeEach(() => {
  forgetTranslations();
});

describe("cacheKey", () => {
  it("does not split an entry on case or spacing", () => {
    expect(cacheKey("  Citron­fromage ".replace("­", ""))).toBe(cacheKey("citronfromage"));
    expect(cacheKey("Brânză  de   vaci")).toBe("brânză de vaci");
  });
});

describe("the cache", () => {
  it("remembers a translation and answers with it", () => {
    rememberEnglish({ Citronfromage: "lemon mousse" });
    expect(cachedEnglish("citronfromage")).toBe("lemon mousse");
  });

  it("stores a name that was already English, so it is not asked about twice", () => {
    rememberEnglish({ Cucumber: "cucumber" });
    expect(untranslated(["Cucumber"])).toEqual([]);
  });

  it("knows nothing about a name it has not seen", () => {
    expect(cachedEnglish("gochujang")).toBeNull();
  });
});

describe("untranslated", () => {
  it("asks only about what is new, once each", () => {
    rememberEnglish({ Cucumber: "cucumber" });
    expect(untranslated(["Cucumber", "Citronfromage", "citronfromage", "  "])).toEqual([
      "Citronfromage",
    ]);
  });
});

describe("parseTranslations", () => {
  const asked = ["Citronfromage", "Rugbrød"];

  it("maps the reply back onto the names that were sent", () => {
    expect(parseTranslations({ Citronfromage: "lemon mousse", Rugbrød: "rye bread" }, asked)).toEqual(
      { Citronfromage: "lemon mousse", Rugbrød: "rye bread" },
    );
  });

  it("matches the reply's key however it was cased", () => {
    expect(parseTranslations({ citronfromage: "lemon mousse" }, asked)).toEqual({
      Citronfromage: "lemon mousse",
    });
  });

  it("drops a name nobody asked about", () => {
    // A model that answers for things it was not shown is a model inventing
    // food, and an invented alias matches confidently and wrongly.
    expect(parseTranslations({ Sourdough: "sourdough" }, asked)).toEqual({});
  });

  it("drops a sentence, which is an explanation rather than a name", () => {
    const reply = { Citronfromage: "a Danish dessert made with lemon, eggs and cream" };
    expect(parseTranslations(reply, asked)).toEqual({});
  });

  it("survives a reply that is not an object at all", () => {
    expect(parseTranslations("no thanks", asked)).toEqual({});
    expect(parseTranslations(null, asked)).toEqual({});
  });
});
