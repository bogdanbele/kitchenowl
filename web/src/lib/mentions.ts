/**
 * Ingredients written into the method.
 *
 * The Flutter editor lets you type `@onion` in a step and treats it as an
 * ingredient. Keeping the syntax means recipes written there still make sense
 * here, and it fits how people actually draft: you write "fry the @onion until
 * soft" while thinking about the cooking, not while maintaining a list.
 *
 * Nothing is added silently. This only reports what was mentioned; the editor
 * offers it, and a mistyped `@onin` stays a mistyped word instead of becoming a
 * shopping list entry.
 */

// `@` then a word, optionally `@{two words}` for anything with a space in it.
const MENTION = /@(?:\{([^}]{1,48})\}|([\p{L}\p{N}][\p{L}\p{N}'-]{1,31}))/gu;

export function mentionedNames(markdown: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const match of (markdown ?? "").matchAll(MENTION)) {
    const name = (match[1] ?? match[2] ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(name);
  }

  return found;
}

/** What is mentioned in the method but missing from the ingredient list. */
export function missingFromIngredients(
  markdown: string,
  items: { name: string }[],
): string[] {
  const listed = new Set(items.map((item) => item.name.trim().toLowerCase()).filter(Boolean));
  return mentionedNames(markdown).filter((name) => !listed.has(name.toLowerCase()));
}

/**
 * Strip the markers for display.
 *
 * The method is rendered as markdown on the recipe page, and `@onion` in the
 * middle of a sentence is editor syntax leaking into the cooking.
 */
export function stripMentions(markdown: string): string {
  return (markdown ?? "").replace(MENTION, (_match, braced, bare) => braced ?? bare ?? "");
}
