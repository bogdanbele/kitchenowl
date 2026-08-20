import { describe, expect, it } from "vitest";
import { CUISINES, KINDS, VOCABULARY } from "./recipeTags";

/**
 * The seed files under public/seeds are pushed into households by
 * scripts/seed-recipes.mjs, so a malformed entry does not fail here in CI —
 * it fails months later as a recipe with no method, a tag the filters cannot
 * find, or a shopping-list item named "  Onion ". These tests hold every seed
 * file to the shape the API and the tag vocabulary expect, so review can be
 * about the cooking.
 */

/** "The 50 most common" is each file's contract, not a coincidence to drift from. */
const PROMISED_COUNTS: Record<string, number> = {
  "romanian-recipes.json": 50,
  "filipino-recipes.json": 50,
  "danish-recipes.json": 50,
};

const RECIPE_KEYS = new Set([
  "name",
  "yields",
  "prep_time",
  "cook_time",
  "time",
  "tags",
  "source",
  "photo",
  "photo_credit",
  "items",
  "description",
]);

// Deliberately absent: "substitutes" (cook-written by design, a model must not
// seed them) and "videos" (a seed must never invent a URL).
const ITEM_KEYS = new Set(["name", "description", "optional"]);

/**
 * A photo may only be a Wikimedia Commons file.
 *
 * The rule used to be "no photo at all", to stop a model inventing an address.
 * That is still the risk being managed — the answer is now a source whose
 * licensing is checkable and whose URL shape can be asserted, rather than
 * trusting a free-text URL. Anything else, including a link to a recipe blog's
 * hotlinked JPEG, fails here.
 */
// Special:FilePath rather than a direct upload.wikimedia.org address: the upload
// host rate-limits bulk fetching hard (429, retry-after 600), and this is the
// URL the recipe server will be asked to fetch. ?width= keeps it card-sized.
const COMMONS_FILE =
  /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/\S+\.(jpg|jpeg|png|webp)(\?width=\d+)?$/i;
const COMMONS_PAGE = /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/;
const CREDIT_KEYS = new Set(["author", "licence", "source"]);

// Free licences only. A seed must never carry a file that cannot be reused.
const FREE_LICENCES =
  /^(CC0|Public domain|CC BY(-SA)? [1-4]\.0|CC BY(-SA)? 2\.5|CC BY(-SA)? 3\.0 [a-z]{2}|GFDL)$/i;

const cuisineSet = new Set<string>(CUISINES);
const kindSet = new Set<string>(KINDS);
const knownTags = new Set<string>([...VOCABULARY, "AI-written"]);

interface SeedItem {
  name: string;
  description?: string;
  optional?: boolean;
}

interface SeedCredit {
  author: string;
  licence: string;
  source: string;
}

interface SeedRecipe {
  name: string;
  yields: number;
  prep_time: number;
  cook_time: number;
  time: number;
  tags: string[];
  source: string;
  photo?: string;
  photo_credit?: SeedCredit;
  items: SeedItem[];
  description: string;
}

interface SeedFile {
  note: string;
  recipes: SeedRecipe[];
}

/**
 * Loaded through Vite's glob rather than node:fs, so this file stays inside
 * what tsconfig.app.json types (no "node" in `types`) — and so a new seed file
 * is picked up by dropping it in the directory, with no list to remember.
 */
const modules = import.meta.glob<SeedFile>("../../public/seeds/*.json", {
  eager: true,
  import: "default",
});

const seeds = Object.entries(modules)
  .map(([filePath, parsed]) => ({ file: filePath.split("/").pop()!, ...parsed }))
  .sort((a, b) => a.file.localeCompare(b.file));

const files = seeds.map((seed) => seed.file);

it("ships the three promised cuisines", () => {
  expect(files).toEqual(expect.arrayContaining(Object.keys(PROMISED_COUNTS)));
});

it("never repeats a recipe name, within a file or across files", () => {
  const seen = new Map<string, string>();
  for (const { file, recipes } of seeds) {
    for (const recipe of recipes) {
      const key = recipe.name.trim().toLowerCase();
      expect(
        seen.get(key),
        `"${recipe.name}" in both ${seen.get(key)} and ${file}`,
      ).toBeUndefined();
      seen.set(key, file);
    }
  }
});

for (const { file, note, recipes } of seeds) {
  describe(file, () => {
    it("explains itself in a note", () => {
      expect(typeof note).toBe("string");
      expect(note.length).toBeGreaterThan(0);
    });

    it("keeps the promised recipe count", () => {
      const promised = PROMISED_COUNTS[file];
      if (promised) expect(recipes).toHaveLength(promised);
      else expect(recipes.length).toBeGreaterThan(0);
    });

    // The file name is the claim: romanian-recipes.json holds Romanian recipes.
    const claimed = file.split("-")[0];
    const cuisine = claimed.charAt(0).toUpperCase() + claimed.slice(1);

    for (const recipe of recipes) {
      describe(recipe.name, () => {
        it("carries only the keys the API accepts", () => {
          for (const key of Object.keys(recipe)) {
            expect(RECIPE_KEYS.has(key), `unexpected key "${key}"`).toBe(true);
          }
          expect(recipe.name).toBe(recipe.name.trim());
          expect(recipe.name.length).toBeGreaterThan(0);
        });

        it("keeps its times honest", () => {
          for (const minutes of [recipe.yields, recipe.prep_time, recipe.cook_time, recipe.time]) {
            expect(Number.isInteger(minutes)).toBe(true);
            expect(minutes).toBeGreaterThanOrEqual(0);
          }
          expect(recipe.yields).toBeGreaterThan(0);
          // time is total elapsed — marinating and proofing included — so it can
          // exceed prep + cook but never undercut it.
          expect(recipe.time).toBeGreaterThanOrEqual(recipe.prep_time + recipe.cook_time);
          expect(recipe.time).toBeGreaterThan(0);
        });

        it("tags from the closed vocabulary: one cuisine, one kind, provenance", () => {
          expect(new Set(recipe.tags).size).toBe(recipe.tags.length);
          for (const tag of recipe.tags) {
            expect(knownTags.has(tag), `tag "${tag}" is not in the vocabulary`).toBe(true);
          }
          expect(recipe.tags.filter((tag) => cuisineSet.has(tag))).toEqual([cuisine]);
          expect(recipe.tags.filter((tag) => kindSet.has(tag))).toHaveLength(1);
          // Provenance is not optional: the app badges model-written recipes.
          expect(recipe.tags).toContain("AI-written");
          // Quick is derived from time by the app; storing it would let the two disagree.
          expect(recipe.tags).not.toContain("Quick");
        });

        it("admits a model wrote it", () => {
          expect(recipe.source).toMatch(/^ai:\/\/.+/);
        });

        it("lists real ingredients", () => {
          expect(recipe.items.length).toBeGreaterThan(0);
          for (const item of recipe.items) {
            for (const key of Object.keys(item)) {
              expect(ITEM_KEYS.has(key), `unexpected item key "${key}"`).toBe(true);
            }
            expect(item.name).toBe(item.name.trim());
            expect(item.name.length).toBeGreaterThan(0);
            expect(typeof item.description).toBe("string");
            // The convention is presence-means-optional; a literal false would
            // read as a third state that does not exist.
            if ("optional" in item) expect(item.optional).toBe(true);
          }
        });

        it("opens with prose and cooks in stages", () => {
          expect(recipe.description.length).toBeGreaterThan(0);
          expect(recipe.description.startsWith("#")).toBe(false);
          expect(recipe.description).toContain("\n## ");
        });

        it("never carries a photo it cannot credit", () => {
          // A picture and its attribution travel together or not at all —
          // most Commons licences require the credit, and a photo whose
          // provenance was dropped somewhere cannot be re-checked later.
          expect(Boolean(recipe.photo)).toBe(Boolean(recipe.photo_credit));
          if (!recipe.photo) return;

          expect(recipe.photo).toMatch(COMMONS_FILE);
          const credit = recipe.photo_credit!;
          for (const key of Object.keys(credit)) {
            expect(CREDIT_KEYS.has(key), `unexpected credit key "${key}"`).toBe(true);
          }
          expect(credit.author.trim().length).toBeGreaterThan(0);
          // Markup would end up rendered as literal HTML in the credit line.
          expect(credit.author).not.toMatch(/[<>]/);
          expect(credit.licence).toMatch(FREE_LICENCES);
          expect(credit.source).toMatch(COMMONS_PAGE);
        });
      });
    }
  });
}
