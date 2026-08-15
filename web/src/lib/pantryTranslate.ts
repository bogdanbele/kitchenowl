/**
 * English names for things in the kitchen, without touching the kitchen.
 *
 * The inventory belongs to Spiso and is never written to from here, so a
 * Danish "Citronfromage" or a Romanian "brânză de vaci" has to be understood on
 * this side. The translation is a *view*: matching uses it, the screen still
 * shows the name the shopping actually has, because that is what is written on
 * the tub in the fridge.
 *
 * Cached by name and kept forever. Names repeat every week — the same twenty
 * things come back — so this converges to zero requests almost immediately, and
 * a cache that never expires is right for a fact that never changes: what
 * "citronfromage" is in English was settled long before this app existed.
 */

const CACHE_KEY = "kitchenowl.pantry.english";

type Cache = Record<string, string>;

function read(): Cache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === "object" ? (parsed as Cache) : {};
  } catch {
    return {};
  }
}

function write(cache: Cache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full or blocked. Translation then costs a request per load,
    // which is worse but not broken.
  }
}

/** The key a name is cached under: case and spacing should not split an entry. */
export function cacheKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function cachedEnglish(name: string): string | null {
  return read()[cacheKey(name)] ?? null;
}

export function rememberEnglish(translations: Record<string, string>): void {
  const cache = read();
  for (const [original, english] of Object.entries(translations)) {
    const key = cacheKey(original);
    const value = english.trim();
    // A translation identical to the name is still worth storing: it records
    // "already English, do not ask again".
    if (key && value) cache[key] = value;
  }
  write(cache);
}

/** Names not yet known, deduplicated — the only ones worth a request. */
export function untranslated(names: string[]): string[] {
  const cache = read();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = cacheKey(name);
    if (!key || cache[key] || seen.has(key)) continue;
    seen.add(key);
    out.push(name.trim());
  }
  return out;
}

/**
 * The model's reply, mapped back onto the names that were sent.
 *
 * Anything it did not answer for, answered with something absurd, or invented
 * out of nowhere is dropped rather than guessed at — a wrong alias is worse
 * than no alias, because it produces a confident match to the wrong thing.
 */
export function parseTranslations(reply: unknown, asked: string[]): Record<string, string> {
  if (!reply || typeof reply !== "object") return {};
  const wanted = new Map(asked.map((name) => [cacheKey(name), name]));
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(reply as Record<string, unknown>)) {
    const original = wanted.get(cacheKey(key));
    if (!original || typeof value !== "string") continue;
    const english = value.trim();
    // A name, not a sentence: an ingredient is a few words at most.
    if (!english || english.length > 60 || english.split(/\s+/).length > 5) continue;
    out[original] = english;
  }
  return out;
}

export function forgetTranslations(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Nothing to forget if storage is blocked.
  }
}
