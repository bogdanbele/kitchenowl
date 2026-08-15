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

/**
 * Cheap, fast, strict enough at JSON — and it can see.
 *
 * Vision is the deciding property now that a photographed page is one of the
 * three ways in: a text-only default means the most impressive path in the app
 * fails on first use, for a reason nobody would guess.
 */
export const DEFAULT_MODEL = "openai/gpt-4o-mini";

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
  /** Whether the model can be shown a photograph. */
  seesImages: boolean;
}

interface RawModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string };
  architecture?: { input_modalities?: string[]; modality?: string };
}

/**
 * Newer entries carry `architecture.input_modalities`; older ones only the
 * legacy `modality` string like "text+image->text". Reading both means the
 * picker does not quietly lose vision models on either side of that change.
 */
function readsImages(model: RawModel): boolean {
  const modalities = model.architecture?.input_modalities;
  if (modalities?.length) return modalities.includes("image");
  return (model.architecture?.modality ?? "").split("->")[0]?.includes("image") ?? false;
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
      seesImages: readsImages(model),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface CompletionChoice {
  message?: { content?: string };
}

/** A user message is either plain text or text alongside images. */
type UserContent = string | ({ type: "text"; text: string } | ImagePart)[];
interface ImagePart {
  type: "image_url";
  image_url: { url: string };
}

async function complete(
  system: string,
  user: UserContent,
  signal?: AbortSignal,
): Promise<string> {
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

/**
 * A photograph of a page — a cookbook, a card in someone's handwriting, a menu.
 *
 * This is the one source nothing else reaches: the scraper needs a page, the
 * paste box needs text that already exists somewhere. Paper needs eyes.
 *
 * The reply goes through exactly the same parsing and the same `ai://` source
 * marker as pasted text, so a photographed recipe is flagged as model-written
 * for the same reason — it is a transcription nobody has checked yet.
 */
export async function extractRecipeFromImages(
  dataUrls: string[],
  note = "",
  signal?: AbortSignal,
): Promise<ExtractedRecipe> {
  if (dataUrls.length === 0) throw new ExtractionError("No photo to read.");

  const instruction = [
    "Read the recipe in these photographs and return it as JSON.",
    "Transcribe only what is printed or written. If the photograph cuts off a",
    "line, leave that ingredient or step out rather than inventing the rest.",
    note.trim() && `The person adds: ${note.trim()}`,
  ]
    .filter(Boolean)
    .join(" ");

  const reply = await complete(
    EXTRACTION_SYSTEM_PROMPT,
    [
      { type: "text", text: instruction },
      ...dataUrls.map((url): ImagePart => ({ type: "image_url", image_url: { url } })),
    ],
    signal,
  );
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
