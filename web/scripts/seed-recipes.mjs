#!/usr/bin/env node
/**
 * Push the seed recipe files into a KitchenOwl household.
 *
 * The files under public/seeds are the reviewable record of what a model wrote;
 * this script is how they become recipes. It is idempotent by name — a recipe
 * the household already has is skipped, not duplicated — so running it after
 * pulling new seeds only adds what is new.
 *
 *   node scripts/seed-recipes.mjs [seed-file ...]
 *     --household <id>           required: which household receives the recipes
 *     --server <url>             default http://localhost:8088
 *     --token <access token>     or set KITCHENOWL_TOKEN
 *     --dry-run                  say what would be added, add nothing
 *     --photos                   also give already-present recipes their photo
 *
 * A recipe that is already there is normally left completely alone. --photos is
 * the one exception: a recipe that has no picture is given the one its seed
 * names. It still never overwrites a photo somebody already chose.
 *
 * With no files named, every *.json in public/seeds is seeded. Auth is a bearer
 * token on purpose: this script never sees a password. Copy the token from a
 * logged-in browser (localStorage key "kitchenowl.access") or mint one via the
 * API yourself.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const seedsDir = fileURLToPath(new URL("../public/seeds/", import.meta.url));

const args = process.argv.slice(2);
const flags = {
  server: "http://localhost:8088",
  household: null,
  token: process.env.KITCHENOWL_TOKEN,
  dryRun: false,
  photos: false,
};
const files = [];

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--server") flags.server = args[++i];
  else if (arg === "--household") flags.household = args[++i];
  else if (arg === "--token") flags.token = args[++i];
  else if (arg === "--dry-run") flags.dryRun = true;
  else if (arg === "--photos") flags.photos = true;
  else if (arg === "--help" || arg === "-h") {
    console.log("usage: node scripts/seed-recipes.mjs [seed-file ...] --household <id> [--server <url>] [--token <t>] [--dry-run] [--photos]");
    process.exit(0);
  } else files.push(arg);
}

if (!flags.household) fail("--household is required (the numeric household id).");
if (!flags.token) fail("no token: pass --token or set KITCHENOWL_TOKEN. The script does not take passwords.");

if (files.length === 0) {
  for (const file of readdirSync(seedsDir)) {
    if (file.endsWith(".json")) files.push(path.join(seedsDir, file));
  }
}

function fail(message) {
  console.error(`seed-recipes: ${message}`);
  process.exit(1);
}

async function api(route, init = {}) {
  const response = await fetch(new URL(`/api${route}`, flags.server), {
    ...init,
    headers: {
      Authorization: `Bearer ${flags.token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = (await response.text().catch(() => "")).trim();
    throw new Error(`${init.method ?? "GET"} ${route} -> ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return response.json();
}

/** What the AddRecipe schema accepts, and nothing the seed format keeps to itself. */
function toBody(recipe) {
  return {
    name: recipe.name,
    description: recipe.description,
    yields: recipe.yields,
    time: recipe.time,
    cook_time: recipe.cook_time,
    prep_time: recipe.prep_time,
    source: recipe.source,
    tags: recipe.tags,
    // A URL here is not stored as a URL: the server fetches it and keeps its own
    // copy, so the recipe keeps its picture if the source ever disappears.
    // photo_credit stays behind in the seed file — the API would drop it.
    ...(recipe.photo ? { photo: recipe.photo } : {}),
    // The API defaults a missing "optional" to true — the opposite of what a
    // seed means by omitting it — so it is always sent explicitly.
    items: recipe.items.map((item) => ({
      name: item.name,
      description: item.description ?? "",
      optional: item.optional === true,
    })),
  };
}

const existing = await api(`/household/${flags.household}/recipe`);
const have = new Map(existing.map((recipe) => [recipe.name.trim().toLowerCase(), recipe]));
console.log(`Household ${flags.household} has ${have.size} recipes.`);

let added = 0;
let skipped = 0;
let failed = 0;
let photographed = 0;

for (const file of files) {
  const { recipes } = JSON.parse(readFileSync(file, "utf-8"));
  console.log(`\n${path.basename(file)} — ${recipes.length} recipes`);

  for (const recipe of recipes) {
    const key = recipe.name.trim().toLowerCase();
    const present = have.get(key);
    if (present) {
      skipped++;
      // The only thing an existing recipe is allowed to receive. A photo the
      // household already has was chosen by a person and is never replaced.
      if (flags.photos && recipe.photo && !present.photo) {
        if (flags.dryRun) {
          console.log(`  would photograph: ${recipe.name}`);
          photographed++;
          continue;
        }
        try {
          await api(`/recipe/${present.id}`, {
            method: "POST",
            body: JSON.stringify({ photo: recipe.photo }),
          });
          photographed++;
          console.log(`  photographed: ${recipe.name}`);
        } catch (error) {
          failed++;
          console.error(`  PHOTO FAILED: ${recipe.name} — ${error.message}`);
        }
      }
      continue;
    }
    if (flags.dryRun) {
      console.log(`  would add: ${recipe.name}${recipe.photo ? " (with photo)" : ""}`);
      added++;
      continue;
    }
    try {
      const created = await api(`/household/${flags.household}/recipe`, {
        method: "POST",
        body: JSON.stringify(toBody(recipe)),
      });
      have.set(key, created ?? { name: recipe.name });
      added++;
      console.log(`  added: ${recipe.name}`);
    } catch (error) {
      failed++;
      console.error(`  FAILED: ${recipe.name} — ${error.message}`);
    }
  }
}

const photoNote = photographed
  ? `, ${flags.dryRun ? "would photograph" : "photographed"} ${photographed} of them`
  : "";
console.log(
  `\n${flags.dryRun ? "Would add" : "Added"} ${added}, skipped ${skipped} already present${photoNote}${failed ? `, ${failed} FAILED` : ""}.`,
);
if (failed) process.exit(1);
