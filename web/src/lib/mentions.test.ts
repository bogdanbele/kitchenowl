import { describe, expect, it } from "vitest";
import { mentionedNames, missingFromIngredients, stripMentions } from "./mentions";

describe("mentionedNames", () => {
  it("finds a plain mention", () => {
    expect(mentionedNames("Fry the @onion until soft.")).toEqual(["onion"]);
  });

  it("finds a braced mention, which is how anything with a space is written", () => {
    expect(mentionedNames("Add the @{pork belly} and brown it.")).toEqual(["pork belly"]);
  });

  it("does not repeat a name mentioned twice, in either case", () => {
    expect(mentionedNames("@Onion first, then more @onion.")).toEqual(["Onion"]);
  });

  it("stops at punctuation", () => {
    expect(mentionedNames("Add @salt, then @pepper.")).toEqual(["salt", "pepper"]);
  });

  it("keeps a hyphen or apostrophe inside a name", () => {
    expect(mentionedNames("@crème-fraîche and @cook's-treat")).toEqual([
      "crème-fraîche",
      "cook's-treat",
    ]);
  });

  it("ignores a bare @ and an email address's domain half", () => {
    // "@" alone is not a mention; an address in a source note should not turn
    // its domain into an ingredient — that it yields one word, not two, is the
    // point.
    expect(mentionedNames("Sent by cook@example.com and @ the end")).toEqual(["example"]);
  });

  it("returns nothing for empty or absent text", () => {
    expect(mentionedNames("")).toEqual([]);
    expect(mentionedNames(undefined as unknown as string)).toEqual([]);
  });
});

describe("missingFromIngredients", () => {
  it("reports only what is not already listed", () => {
    const missing = missingFromIngredients("Fry the @onion, add @garlic.", [
      { name: "Onion" },
      { name: "" },
    ]);
    expect(missing).toEqual(["garlic"]);
  });

  it("is empty when everything mentioned is listed", () => {
    expect(missingFromIngredients("Add @salt", [{ name: "salt" }])).toEqual([]);
  });
});

describe("stripMentions", () => {
  it("leaves the words and removes the markers", () => {
    expect(stripMentions("Fry the @onion with @{pork belly}.")).toBe(
      "Fry the onion with pork belly.",
    );
  });

  it("leaves text without mentions alone", () => {
    expect(stripMentions("Fry the onion.")).toBe("Fry the onion.");
  });
});
