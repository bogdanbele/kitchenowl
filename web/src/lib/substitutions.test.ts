import { describe, expect, it } from "vitest";
import { buildSubstitutionRequest, parseSubstitutions } from "./substitutions";

const missing = ["Pork belly", "Fish sauce"];
const kitchen = ["Danish smoked bacon", "Soy sauce", "Æg", "Cherry tomatoes"];

describe("parseSubstitutions", () => {
  it("keeps a swap that names something the kitchen actually has", () => {
    const reply = [
      { missing: "Pork belly", use: "Danish smoked bacon", note: "Saltier, so hold the salt." },
    ];
    expect(parseSubstitutions(reply, missing, kitchen)).toEqual([
      { missing: "Pork belly", use: "Danish smoked bacon", note: "Saltier, so hold the salt." },
    ]);
  });

  it("drops a swap for something they would have to go and buy", () => {
    // "Use pancetta" is a fact about cooking, not a dinner.
    const reply = [{ missing: "Pork belly", use: "Pancetta", note: "Similar fat." }];
    expect(parseSubstitutions(reply, missing, kitchen)).toEqual([]);
  });

  it("drops an answer to a question nobody asked", () => {
    const reply = [{ missing: "Saffron", use: "Soy sauce", note: "" }];
    expect(parseSubstitutions(reply, missing, kitchen)).toEqual([]);
  });

  it("refuses to replace a thing with itself", () => {
    const reply = [{ missing: "Fish sauce", use: "Fish sauce", note: "Same thing." }];
    expect(parseSubstitutions(reply, [...missing, "Fish sauce"], [...kitchen, "Fish sauce"])).toEqual(
      [],
    );
  });

  it("takes one suggestion per ingredient, not a menu", () => {
    const reply = [
      { missing: "Fish sauce", use: "Soy sauce", note: "Less funk." },
      { missing: "Fish sauce", use: "Cherry tomatoes", note: "Nonsense." },
    ];
    expect(parseSubstitutions(reply, missing, kitchen)).toHaveLength(1);
  });

  it("does not let one thing stand in for four", () => {
    // The first real run answered "cucumber" for bok choy, daikon, eggplant and
    // green beans — four suggestions whose own notes admitted they were wrong.
    const reply = [
      { missing: "Pork belly", use: "Cherry tomatoes", note: "No." },
      { missing: "Fish sauce", use: "Cherry tomatoes", note: "Also no." },
    ];
    const kept = parseSubstitutions(reply, missing, kitchen);
    expect(kept).toHaveLength(1);
    expect(kept[0].missing).toBe("Pork belly");
  });

  it("uses the kitchen's own spelling, whatever case the model replied in", () => {
    const reply = [{ missing: "pork belly", use: "danish smoked bacon", note: "Close enough." }];
    const [swap] = parseSubstitutions(reply, missing, kitchen);
    expect(swap.missing).toBe("Pork belly");
    expect(swap.use).toBe("Danish smoked bacon");
  });

  it("survives a reply that is not a list, or is full of rubbish", () => {
    expect(parseSubstitutions({ swaps: [] }, missing, kitchen)).toEqual([]);
    expect(parseSubstitutions([null, 7, {}], missing, kitchen)).toEqual([]);
  });

  it("trims a note that turned into an essay", () => {
    const reply = [{ missing: "Pork belly", use: "Danish smoked bacon", note: "x".repeat(400) }];
    expect(parseSubstitutions(reply, missing, kitchen)[0].note.length).toBeLessThanOrEqual(160);
  });
});

describe("buildSubstitutionRequest", () => {
  it("sends the dish, the gaps and the kitchen", () => {
    const text = buildSubstitutionRequest("Sinigang", missing, kitchen);
    expect(text).toContain("Dish: Sinigang");
    expect(text).toContain("Pork belly, Fish sauce");
    expect(text).toContain("Danish smoked bacon");
  });
});
