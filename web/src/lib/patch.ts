/**
 * Field allowlists for the endpoints that reject unknown fields.
 *
 * Several marshmallow schemas in the backend have no `Meta.unknown = EXCLUDE`,
 * so posting an object with one extra key answers `400 Request invalid` — and
 * the obvious client shape, "read an object, change a field, post it back",
 * always carries extra keys (`id`, `created_at`, `household_id`, …).
 *
 * The failure mode is nasty: creating works, editing does not, and the message
 * reads like the user typed something wrong. So every update body is built by
 * `pick`, and each list below was copied from the matching schema file.
 *
 * When adding an endpoint, open `backend/app/controller/<area>/schemas.py`
 * first and copy the field names — do not guess from the response shape, which
 * is a different thing entirely (the expense category is an int on the way in
 * and an object on the way out).
 */

/**
 * The key list is deliberately not constrained to `keyof T`.
 *
 * An allowlist mirrors a *write* schema, and that is not the shape of what was
 * read: `merge_category_id` and `password` are accepted on the way in and never
 * come back out. Demanding that every allowed field exist on the source type
 * would mean inventing those on the read models, where they would be wrong.
 */
export function pick<T extends object, K extends PropertyKey>(
  source: T,
  keys: readonly K[],
): Partial<Pick<T, Extract<K, keyof T>>> {
  const result: Record<PropertyKey, unknown> = {};
  for (const key of keys) {
    const value = (source as Record<PropertyKey, unknown>)[key];
    // undefined means "not changing this"; null is a real value that clears it.
    if (value !== undefined) result[key] = value;
  }
  return result as Partial<Pick<T, Extract<K, keyof T>>>;
}

/** backend/app/controller/item/schemas.py :: UpdateItem */
export const ITEM_UPDATE_FIELDS = ["name", "icon", "category", "merge_item_id"] as const;

/** backend/app/controller/category/schemas.py :: UpdateCategory (no EXCLUDE) */
export const CATEGORY_UPDATE_FIELDS = ["name", "ordering", "merge_category_id"] as const;

/** backend/app/controller/tag/schemas.py :: UpdateTag (no EXCLUDE) */
export const TAG_UPDATE_FIELDS = ["name", "merge_tag_id"] as const;

/** backend/app/controller/expense/schemas.py :: UpdateExpense (no EXCLUDE) */
export const EXPENSE_UPDATE_FIELDS = [
  "name",
  "amount",
  "description",
  "date",
  "photo",
  "category",
  "exclude_from_statistics",
  "paid_by",
  "paid_for",
] as const;

/** backend/app/controller/expense/schemas.py :: UpdateExpenseCategory */
export const EXPENSE_CATEGORY_FIELDS = ["name", "color", "budget", "merge_category_id"] as const;

/** backend/app/controller/user/schemas.py :: UpdateUser (no EXCLUDE) */
export const USER_UPDATE_FIELDS = ["name", "photo", "email", "password", "admin"] as const;

/** backend/app/controller/household/schemas.py :: UpdateHousehold */
export const HOUSEHOLD_UPDATE_FIELDS = [
  "name",
  "photo",
  "link",
  "description",
  "language",
  "planner_feature",
  "expenses_feature",
  "view_ordering",
] as const;

/** backend/app/controller/recipe/schemas.py :: UpdateRecipe */
export const RECIPE_UPDATE_FIELDS = [
  "name",
  "description",
  "time",
  "cook_time",
  "prep_time",
  "yields",
  "source",
  "photo",
  "visibility",
  "server_curated",
  "items",
  "tags",
] as const;
