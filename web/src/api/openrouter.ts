import {
  EXTRACTION_SYSTEM_PROMPT,
  ExtractionError,
  extractJson,
  toExtractedRecipe,
  type ExtractedRecipe,
} from "../lib/recipeExtraction";

/**
 * OpenRouter, called straight from the browser.
 *
 * The key is yours and stays in this browser: it is kept in localStorage and
 * sent only to openrouter.ai, never to the KitchenOwl server, which has no
 * field for it and no reason to see it. The trade is the usual one for a
 * localStorage secret — any script on this origin could read it — which is
 * acceptable for a self-hosted app you run for yourself, and would not be for a
 * shared service.
 */
const BASE = "https://openrouter.ai/api/v1";
const KEY_STORAGE = "kitchenowl.openrouter.key";
const MODEL_STORAGE = "kitchenowl.openrouter.model";

/** Sensible default: cheap, fast, and good enough at strict JSON. */
export const DEFAULT_MODEL = "anthropic/claude-3.5-haiku";

export const openRouter = {
  get key(): string | null {
    return localStorage.getItem(KEY_STORAGE);
  },
  setKey(value: string) {
    const trimmed = value.trim();
    if (trimmed) localStorage.setItem(KEY_STORAGE, trimmed);
    else localStorage.removeItem(KEY_STORAGE);
  },
  get model(): string {
    return localStorage.getItem(MODEL_STORAGE) ?? DEFAULT_MODEL;
  },
  setModel(value: string) {
    localStorage.setItem(MODEL_STORAGE, value);
  },
  get configured(): boolean {
    return !!localStorage.getItem(KEY_STORAGE);
  },
};

export interface OpenRouterModel {
  id: string;
  name: string;
  /** Prompt price per token as a string, e.g. "0.0000008". */
  promptPrice: number;
  contextLength: number;
}

interface RawModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string };
}

/** The catalogue is public, so this works before a key is entered. */
export async function listModels(): Promise<OpenRouterModel[]> {
  const response = await fetch(`${BASE}/models`);
  if (!response.ok) throw new Error(`OpenRouter answered ${response.status}`);
  const body = (await response.json()) as { data?: RawModel[] };

  return (body.data ?? [])
    .map((model) => ({
      id: model.id,
      name: model.name ?? model.id,
      promptPrice: parseFloat(model.pricing?.prompt ?? "0") || 0,
      contextLength: model.context_length ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface CompletionChoice {
  message?: { content?: string };
}

async function complete(system: string, user: string, signal?: AbortSignal): Promise<string> {
  const key = openRouter.key;
  if (!key) throw new ExtractionError("Add an OpenRouter key in Settings first.");

  const response = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // OpenRouter attributes usage with these; they are not required but they
      // make the dashboard readable.
      "HTTP-Referer": window.location.origin,
      "X-Title": "KitchenOwl",
    },
    body: JSON.stringify({
      model: openRouter.model,
      // Deterministic-ish: this is extraction, not writing, and a creative
      // sampler is exactly how an ingredient that was never in the text appears.
      temperature: 0.1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (response.status === 401) {
    throw new ExtractionError("OpenRouter rejected that key.");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ExtractionError(
      `OpenRouter answered ${response.status}. ${detail.slice(0, 200)}`.trim(),
    );
  }

  const body = (await response.json()) as { choices?: CompletionChoice[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new ExtractionError("OpenRouter returned an empty reply.");
  return content;
}

/** Paste anything — a message, a photo transcript, a blog — get a recipe back. */
export async function extractRecipeFromText(
  text: string,
  signal?: AbortSignal,
): Promise<ExtractedRecipe> {
  const reply = await complete(EXTRACTION_SYSTEM_PROMPT, text, signal);
  return toExtractedRecipe(extractJson(reply));
}

/** Cheap round trip to prove a key works, without pretending to be a recipe. */
export async function testKey(): Promise<string> {
  const reply = await complete(
    'Reply with exactly: {"ok":true}',
    "ping",
    AbortSignal.timeout(30_000),
  );
  return reply.trim().slice(0, 80);
}
