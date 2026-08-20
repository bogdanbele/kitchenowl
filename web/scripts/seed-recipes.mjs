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
 *     --household <id>           default 1
 *     --server <url>             default http://localhost:8088
 *     --dry-run                  say what would be done, change nothing
 *     --photos                   also give already-present recipes their photo
 *     --token <access token>     discouraged; see below
 *
 * A recipe that is already there is normally left completely alone. --photos is
 * the one exception: a recipe that has no picture is given the one its seed
 * names. It still never overwrites a photo somebody already chose.
 *
 * With no files named, every *.json in public/seeds is seeded.
 *
 * Auth is a bearer token, never a password. With no token given the script
 * prompts for one and does not echo it, which is the recommended way: a token
 * on the command line is visible in `ps` and is kept in the shell's history
 * file, and these are credentials for the whole household. --token and
 * KITCHENOWL_TOKEN are still honoured for unattended runs.
 *
 * Get one from a logged-in browser tab, in the devtools console:
 *   localStorage.getItem("kitchenowl.access")
 * Access tokens last 15 minutes, so fetch it when you are ready to run.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const seedsDir = fileURLToPath(new URL("../public/seeds/", import.meta.url));

const args = process.argv.slice(2);
const flags = {
  server: "http://localhost:8088",
  household: "1",
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
    console.log(
      [
        "usage: node scripts/seed-recipes.mjs [seed-file ...] [options]",
        "",
        "  --household <id>   default 1",
        "  --server <url>     default http://localhost:8088",
        "  --dry-run          say what would be done, change nothing",
        "  --photos           also give already-present recipes their photo",
        "  --token <t>        discouraged: visible in ps and shell history.",
        "                     Omit it and you will be prompted without echo.",
      ].join("\n"),
    );
    process.exit(0);
  } else files.push(arg);
}

function fail(message) {
  console.error(`seed-recipes: ${message}`);
  process.exit(1);
}

/**
 * Read a secret from the terminal without printing it.
 *
 * Raw mode delivers a paste as one chunk rather than a keystroke at a time, so
 * this walks the chunk instead of assuming single characters — a pasted JWT is
 * three hundred bytes and arrives all at once.
 */
function promptSecret(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error("nothing to prompt on: pass --token or set KITCHENOWL_TOKEN"));
      return;
    }
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let value = "";
    const finish = (error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u0003") return finish(new Error("cancelled"));
        // Backspace, for a token typed rather than pasted.
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        // Skip the remaining control characters: they are never part of a JWT
        // and a stray escape sequence would corrupt the token silently.
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

/** Quoted pastes are the norm; a token is never quoted or padded. */
const tidyToken = (raw) => String(raw ?? "").trim().replace(/^['"]|['"]$/g, "").trim();

/**
 * Say how long the token is good for, and refuse an expired one.
 *
 * Access tokens last 15 minutes. Without this the first request fails with a
 * bare 401 and the obvious reading is "wrong token" rather than "too slow".
 */
function describeToken(token) {
  const parts = token.split(".");
  if (parts.length !== 3) {
    console.log("Token is not a JWT — sending it anyway, the server decides.");
    return;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!payload.exp) return;
    const seconds = payload.exp - Math.floor(Date.now() / 1000);
    if (seconds <= 0) {
      fail(`that token expired ${Math.abs(Math.round(seconds / 60))} minutes ago. Fetch a fresh one.`);
    }
    console.log(`Token valid for about ${Math.round(seconds / 60)} more minutes.`);
  } catch {
    /* Unreadable payload is the server's business, not ours. */
  }
}

if (!/^\d+$/.test(String(flags.household))) {
  fail(`--household wants a number, got "${flags.household}".`);
}

flags.token = tidyToken(flags.token);
if (!flags.token) {
  try {
    flags.token = tidyToken(await promptSecret("KitchenOwl access token (not shown): "));
  } catch (error) {
    fail(error.message);
  }
}
if (!flags.token) fail("no token given.");
describeToken(flags.token);

if (files.length === 0) {
  for (const file of readdirSync(seedsDir)) {
    if (file.endsWith(".json")) files.push(path.join(seedsDir, file));
  }
}

async function api(route, init = {}) {
  let response;
  try {
    response = await fetch(new URL(`/api${route}`, flags.server), {
      ...init,
      headers: {
        Authorization: `Bearer ${flags.token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    // No server at all: a stack trace here only obscures the one useful fact.
    fail(`cannot reach ${flags.server} — ${error.message}`);
  }
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

// The first call doubles as the credential check, so its failure is explained
// rather than thrown: a 401 here means the token, and a 404 means the household.
let existing;
try {
  existing = await api(`/household/${flags.household}/recipe`);
} catch (error) {
  if (/-> 401/.test(error.message)) {
    fail("the server rejected that token (401). Access tokens last 15 minutes — fetch a fresh one.");
  }
  // 422 with "Invalid crypto padding" is what a truncated or mangled paste
  // looks like, and the raw message reads like a server bug rather than a typo.
  if (/-> 422/.test(error.message)) {
    fail("the server could not read that token (422) — it looks truncated. Copy the whole value.");
  }
  if (/-> 40[34]/.test(error.message)) {
    fail(`no household ${flags.household} visible to this account. Pass --household with the right id.`);
  }
  fail(error.message);
}

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
