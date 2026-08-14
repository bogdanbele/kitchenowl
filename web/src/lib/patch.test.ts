import { describe, expect, it } from "vitest";
import { EXPENSE_UPDATE_FIELDS, CATEGORY_UPDATE_FIELDS, pick } from "./patch";

describe("pick", () => {
  it("keeps only the allowed fields", () => {
    const fromServer = {
      id: 4,
      name: "Groceries",
      amount: 12.5,
      household_id: 1,
      created_at: 1755000000000,
    };
    expect(pick(fromServer, EXPENSE_UPDATE_FIELDS)).toEqual({ name: "Groceries", amount: 12.5 });
  });

  it("drops undefined so a partial update stays partial", () => {
    expect(pick({ name: "Dairy", ordering: undefined }, CATEGORY_UPDATE_FIELDS)).toEqual({
      name: "Dairy",
    });
  });

  it("keeps an explicit null, which is how a category is cleared", () => {
    expect(pick({ category: null }, EXPENSE_UPDATE_FIELDS)).toEqual({ category: null });
  });

  it("never lets an id or timestamp through", () => {
    // These schemas have no `unknown = EXCLUDE`, so one extra key is a 400 that
    // reads like the user's fault and only ever happens on edit.
    const picked = pick(
      { id: 1, created_at: 1, updated_at: 2, name: "x" },
      CATEGORY_UPDATE_FIELDS,
    );
    expect(Object.keys(picked)).toEqual(["name"]);
  });
});
