import type { RecipeItem } from "../api/types";

/**
 * Turning a written method into something you can cook from.
 *
 * All of this is pure so it can be tested against real recipe text, which is
 * the only kind that matters: methods are written by people, not to a schema,
 * and every rule here earns its place by surviving one.
 */

export interface CookingStep {
  /** The stage this step belongs to, e.g. "Cook the pork". */
  section: string | null;
  text: string;
  /** Timers found in the text, longest first. */
  timers: Timer[];
  /** Ids of ingredients this step mentions. */
  itemIds: number[];
}

export interface Timer {
  label: string;
  seconds: number;
}

const HEADING = /^#{2,3}\s+(.*)$/;
const ORDERED = /^\s*\d+[.)]\s+/;
const BULLET = /^\s*[-*]\s+/;

/**
 * Split markdown into steps.
 *
 * Numbered lines are steps. A paragraph under a heading is also a step, because
 * plenty of recipes — including everything the scraper produces from a site
 * that used prose — never number anything.
 *
 * Prose *before* the first heading or numbered line is an introduction, not a
 * step: "a sour soup my grandmother made" is not an instruction, and putting it
 * on the first screen of cooking mode wastes the one screen you look at while
 * deciding whether to start. It is only kept as a step when the method has no
 * structure at all, in which case the paragraphs are all there is.
 */
export function splitSteps(markdown: string, items: RecipeItem[] = []): CookingStep[] {
  if (!markdown?.trim()) return [];

  const structured = markdown
    .split("\n")
    .some((line) => HEADING.test(line.trim()) || ORDERED.test(line.trim()));

  const steps: CookingStep[] = [];
  let section: string | null = null;
  let buffer: string[] = [];
  let seenStructure = false;

  const flush = () => {
    const text = buffer.join(" ").trim();
    buffer = [];
    if (!text) return;
    // Intro prose in a method that is otherwise structured.
    if (structured && !seenStructure) return;
    steps.push({
      section,
      text,
      timers: findTimers(text),
      itemIds: mentionedItems(text, items),
    });
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();

    const heading = line.match(HEADING);
    if (heading) {
      flush();
      seenStructure = true;
      // "1. Cook the pork" as a heading: the number is the stage's, not a step's.
      section = heading[1].replace(/^\d+[.)]\s*/, "").trim() || null;
      continue;
    }

    if (!line) {
      flush();
      continue;
    }

    if (ORDERED.test(line) || BULLET.test(line)) {
      flush();
      seenStructure = true;
      buffer.push(line.replace(ORDERED, "").replace(BULLET, ""));
      flush();
      continue;
    }

    buffer.push(line);
  }
  flush();

  return steps;
}

const UNITS: { pattern: string; seconds: number }[] = [
  { pattern: "hours?|hrs?|h\\b", seconds: 3600 },
  { pattern: "minutes?|mins?|m\\b", seconds: 60 },
  { pattern: "seconds?|secs?|s\\b", seconds: 1 },
];

/**
 * Find durations written in prose: "45-60 minutes", "1 1/2 hours", "20 min".
 *
 * A range takes the **lower** bound. A timer is a prompt to come back and look,
 * not a promise the food is done, and the lower bound is when looking becomes
 * worthwhile — burnt is unrecoverable, underdone is another two minutes.
 */
export function findTimers(text: string): Timer[] {
  const timers: Timer[] = [];

  for (const { pattern, seconds } of UNITS) {
    const regex = new RegExp(
      `(\\d+(?:[.,]\\d+)?)\\s*(?:(?:-|–|to)\\s*\\d+(?:[.,]\\d+)?\\s*)?(?:${pattern})`,
      "gi",
    );
    for (const match of text.matchAll(regex)) {
      const amount = parseFloat(match[1].replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const total = Math.round(amount * seconds);
      // Anything under half a minute is a figure of speech ("30 seconds" is
      // real; "cook 1 s" is not) and anything over six hours is a marinade, not
      // something to stand a timer over.
      if (total < 20 || total > 6 * 3600) continue;
      timers.push({ label: match[0].trim(), seconds: total });
    }
  }

  return timers
    .sort((a, b) => b.seconds - a.seconds)
    .filter((timer, index, all) => all.findIndex((other) => other.seconds === timer.seconds) === index)
    .slice(0, 3);
}

/**
 * Which ingredients a step is talking about.
 *
 * Matching is on whole words and on the singular, so "onion" is found in "add
 * the onions" without "oil" matching "boil". Deliberately conservative: a
 * missed highlight costs nothing, a wrong one sends someone to the fridge.
 */
export function mentionedItems(text: string, items: RecipeItem[]): number[] {
  const haystack = ` ${text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ")} `;

  return items
    .filter((item) => {
      const name = item.name.toLowerCase().trim();
      if (name.length < 3) return false;
      const singular = name.replace(/(?:es|s)$/, "");
      return (
        haystack.includes(` ${name} `) ||
        haystack.includes(` ${name}s `) ||
        (singular.length >= 3 && haystack.includes(` ${singular} `))
      );
    })
    .map((item) => item.id);
}

export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
