import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useState, type FormEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api, uploadFile } from "../api/client";
import type { Recipe, Tag } from "../api/types";
import {
  EMPTY,
  LINK_ONLY,
  PRIVATE,
  PUBLIC,
  fromScrape,
  toBody,
  toDraft,
  type Draft,
  type ScrapeResult,
} from "../lib/scrape";
import { extractRecipeFromImages, extractRecipeFromText, openRouter } from "../api/openrouter";
import { toDraftFromExtraction } from "../lib/recipeExtraction";
import { missingFromIngredients } from "../lib/mentions";
import { dataUrlBytes, imageFromClipboard, toDownscaledDataUrl } from "../lib/image";
import { Photo } from "../components/Photo";
import { Link as RouterLink } from "react-router-dom";
import { Camera, ImagePlus, Link2, Sparkles, X } from "lucide-react";

export default function RecipeEdit() {
  const { householdId = "1", recipeId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = !recipeId;

  const [draft, setDraft] = useState<Draft | null>(isNew ? EMPTY : null);
  const [url, setUrl] = useState("");
  const [pasted, setPasted] = useState("");
  const [importMode, setImportMode] = useState<"link" | "text" | "photo">("link");
  const [pages, setPages] = useState<string[]>([]);
  const [pageNote, setPageNote] = useState("");
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");

  // The household's existing tags, so a second "Weeknight" is a click rather
  // than a typo waiting to happen.
  const { data: knownTags } = useQuery({
    queryKey: ["tags", householdId],
    queryFn: () => api<Tag[]>(`/household/${householdId}/tag`),
  });

  useQuery({
    queryKey: ["recipe", recipeId],
    queryFn: async () => {
      const recipe = await api<Recipe>(`/recipe/${recipeId}`);
      setDraft((current) => current ?? toDraft(recipe));
      return recipe;
    },
    enabled: !isNew,
  });

  const importFromUrl = useMutation({
    mutationFn: (value: string) =>
      api<ScrapeResult>(
        `/household/${householdId}/recipe/scrape?url=${encodeURIComponent(value)}`,
      ),
    onSuccess: (result) => {
      setError(null);
      setDraft(fromScrape(result));
    },
    // The API answers 400 "Unsupported website" both for a page it cannot read
    // and for a URL that 404s, which are different problems for the person
    // pasting. Say so rather than repeating the server's guess.
    onError: () =>
      setError(
        "Could not read that page. Check the link opens in a browser — a dead link and an unreadable page look the same from here.",
      ),
  });

  /**
   * Paste anything and get a recipe.
   *
   * The scraper needs a page it can parse; this needs nothing but text, which
   * covers the cases that actually defeat it — a photo of a cookbook you typed
   * up, a voice note transcript, a message from a relative, a site that blocks
   * robots. The model fills the form and you correct it; nothing is saved until
   * you press the button, because a model is a decent typist and an unreliable
   * cook.
   */
  const extract = useMutation({
    mutationFn: (text: string) => extractRecipeFromText(text),
    onSuccess: (recipe) => {
      setError(null);
      setDraft(toDraftFromExtraction(recipe, openRouter.model));
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : "Could not read that text."),
  });

  /**
   * The photo uploads immediately and the draft keeps the returned filename.
   *
   * Deferring the upload to save time would mean holding a File across an
   * import, a preview toggle and a possible navigation, and losing it silently
   * if any of those reset the form.
   */
  const upload = useMutation({
    mutationFn: (file: File) => uploadFile(file),
    onSuccess: (filename) => {
      setError(null);
      setDraft((current) => (current ? { ...current, photo: filename } : current));
    },
    onError: (caught) =>
      setError(caught instanceof Error ? caught.message : "Could not upload that image."),
  });

  /**
   * Photographs go in downscaled, and the same page can be added twice — a
   * recipe that runs over a page turn is two photos, and the model needs both
   * to see the method it starts on one and finishes on the other.
   */
  const addPage = useMutation({
    mutationFn: (file: File) => toDownscaledDataUrl(file),
    onSuccess: (dataUrl) => {
      setError(null);
      setPages((current) => [...current, dataUrl]);
    },
    onError: () => setError("Could not read that image file."),
  });

  const readPhotos = useMutation({
    mutationFn: (images: string[]) => extractRecipeFromImages(images, pageNote),
    onSuccess: (recipe) => {
      setError(null);
      setDraft(toDraftFromExtraction(recipe, openRouter.model));
    },
    onError: (caught) =>
      caught instanceof Error
        ? setError(caught.message)
        : setError("Could not read that photo."),
  });

  const save = useMutation({
    mutationFn: (value: Draft) =>
      isNew
        ? api<Recipe>(`/household/${householdId}/recipe`, { method: "POST", body: toBody(value) })
        : api<Recipe>(`/recipe/${recipeId}`, { method: "POST", body: toBody(value) }),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["recipes", householdId] });
      queryClient.invalidateQueries({ queryKey: ["recipe", String(saved?.id ?? recipeId)] });
      navigate(`/household/${householdId}/recipes/${saved?.id ?? recipeId}`);
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : "Could not save"),
  });

  if (!draft) return <div className="h-96 animate-pulse rounded-card bg-paper-deep" />;

  /**
   * Every edit is a functional update.
   *
   * Reading `draft` from the closure loses writes whenever two changes land in
   * one render — clicking two "mentioned ingredient" chips in quick succession
   * added only the second, because both handlers spread the same stale draft.
   */
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));

  const update = (change: (current: Draft) => Draft) =>
    setDraft((current) => (current ? change(current) : current));

  const setItem = (index: number, patch: Partial<Draft["items"][number]>) =>
    update((current) => ({
      ...current,
      items: current.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));

  const addTag = (name: string) => {
    const clean = name.trim();
    setTagDraft("");
    if (!clean) return;
    update((current) =>
      // Case-insensitive, because "romanian" and "Romanian" as two tags is how
      // a tag list stops being useful.
      current.tags.some((tag) => tag.toLowerCase() === clean.toLowerCase())
        ? current
        : { ...current, tags: [...current.tags, clean] },
    );
  };

  const suggestedTags = (knownTags ?? [])
    .map((tag) => tag.name)
    .filter((name) => !draft.tags.some((tag) => tag.toLowerCase() === name.toLowerCase()))
    .filter((name) => !tagDraft.trim() || name.toLowerCase().includes(tagDraft.trim().toLowerCase()))
    .slice(0, 8);

  const mentioned = missingFromIngredients(draft.description, draft.items);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    // The API rejects a blank or whitespace-only name with a validation error
    // that surfaces as a bare 400; catching it here says something useful.
    if (!draft.name.trim()) return setError("A recipe needs a name.");
    save.mutate({ ...draft, items: draft.items.filter((item) => item.name.trim()) });
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl">
      <p className="label">{isNew ? "New recipe" : "Editing"}</p>
      <input
        value={draft.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder="Untitled recipe"
        aria-label="Recipe name"
        className="mt-1 mb-8 w-full bg-transparent font-display text-4xl font-semibold tracking-tight
                   outline-none placeholder:text-faint"
      />

      {isNew && (
        <section className="mb-10 rounded-card border border-hairline p-4">
          <div className="mb-3 flex gap-1">
            <button
              type="button"
              onClick={() => setImportMode("link")}
              aria-pressed={importMode === "link"}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                importMode === "link" ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
              }`}
            >
              <Link2 size={13} /> From a link
            </button>
            <button
              type="button"
              onClick={() => setImportMode("text")}
              aria-pressed={importMode === "text"}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                importMode === "text" ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
              }`}
            >
              <Sparkles size={13} /> From pasted text
            </button>
            <button
              type="button"
              onClick={() => setImportMode("photo")}
              aria-pressed={importMode === "photo"}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                importMode === "photo" ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
              }`}
            >
              <Camera size={13} /> From a photo
            </button>
          </div>

          {importMode === "photo" ? (
            <div
              // Photograph the page, paste it straight in. Saving the file and
              // then finding it again is the slow half of that job.
              onPaste={(event) => {
                const file = imageFromClipboard(event.nativeEvent);
                if (file) {
                  event.preventDefault();
                  addPage.mutate(file);
                }
              }}
              tabIndex={0}
              className="rounded-card outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              {pages.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {pages.map((page, index) => (
                    <div key={index} className="relative">
                      <img
                        src={page}
                        alt={`Page ${index + 1}`}
                        className="size-24 rounded-card border border-hairline object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setPages(pages.filter((_, i) => i !== index))}
                        aria-label={`Remove page ${index + 1}`}
                        className="absolute -top-2 -right-2 rounded-full border border-hairline bg-paper p-1
                                   text-faint transition hover:text-accent"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mb-3 flex flex-wrap items-center gap-3">
                <label className="cursor-pointer rounded-card border border-line px-4 py-2 text-sm transition hover:border-accent hover:text-accent">
                  {addPage.isPending
                    ? "Reading…"
                    : pages.length
                      ? "Add another page"
                      : "Choose a photo"}
                  <input
                    type="file"
                    accept="image/*"
                    // capture asks a phone for the camera rather than the roll,
                    // which is the whole point when the book is open in front of you.
                    capture="environment"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) addPage.mutate(file);
                    }}
                  />
                </label>
                <span className="label">or paste one here</span>
              </div>

              {pages.length > 0 && (
                <input
                  value={pageNote}
                  onChange={(e) => setPageNote(e.target.value)}
                  placeholder="Anything the page does not say — “halve it”, “Mum's, from 1994”…"
                  aria-label="Note for the reader"
                  className="field mb-3"
                />
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={pages.length === 0 || readPhotos.isPending || !openRouter.configured}
                  onClick={() => readPhotos.mutate(pages)}
                  className="btn-gradient rounded-card px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {readPhotos.isPending
                    ? "Reading the page…"
                    : `Read ${pages.length > 1 ? `${pages.length} pages` : "the page"}`}
                </button>
                {openRouter.configured ? (
                  <span className="label">
                    via {openRouter.model}
                    {pages.length > 0 &&
                      ` · ${Math.round(pages.reduce((total, page) => total + dataUrlBytes(page), 0) / 1024)} kB`}
                  </span>
                ) : (
                  <RouterLink
                    to={`/household/${householdId}/settings`}
                    className="label transition hover:text-accent"
                  >
                    Add an OpenRouter key first →
                  </RouterLink>
                )}
              </div>
              <p className="mt-2 text-xs text-faint">
                Needs a model that can see images — the picker in Settings marks them.
              </p>
            </div>
          ) : importMode === "link" ? (
            <div className="flex gap-2">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                aria-label="Recipe URL"
                className="field"
              />
              <button
                type="button"
                disabled={!url.trim() || importFromUrl.isPending}
                onClick={() => importFromUrl.mutate(url.trim())}
                className="shrink-0 rounded-card border border-line px-4 py-2 text-sm transition
                           hover:border-accent hover:text-accent disabled:opacity-40"
              >
                {importFromUrl.isPending ? "Reading…" : "Import"}
              </button>
            </div>
          ) : (
            <div>
              <textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                rows={6}
                aria-label="Recipe text"
                placeholder={"Paste anything: a message, a transcript, a page that will not scrape…"}
                className="mb-2 w-full rounded-card border border-hairline bg-transparent p-3 text-sm
                           outline-none placeholder:text-faint focus:border-accent"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!pasted.trim() || extract.isPending || !openRouter.configured}
                  onClick={() => extract.mutate(pasted.trim())}
                  className="btn-gradient rounded-card px-4 py-2 text-sm font-medium"
                >
                  {extract.isPending ? "Reading the text…" : "Extract the recipe"}
                </button>
                {openRouter.configured ? (
                  <span className="label">via {openRouter.model}</span>
                ) : (
                  <RouterLink
                    to={`/household/${householdId}/settings`}
                    className="label transition hover:text-accent"
                  >
                    Add an OpenRouter key first →
                  </RouterLink>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="mb-10 flex items-center gap-4">
        <Photo
          photo={draft.photo}
          className="size-24 shrink-0 rounded-card object-cover"
          fallback={
            <div className="grid size-24 shrink-0 place-items-center rounded-card border border-dashed border-line text-faint">
              <ImagePlus size={18} />
            </div>
          }
        />
        <div>
          <label className="cursor-pointer rounded-card border border-line px-4 py-2 text-sm transition hover:border-accent hover:text-accent">
            {upload.isPending ? "Uploading…" : draft.photo ? "Replace photo" : "Add a photo"}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                // Clear the input so choosing the same file twice still fires.
                event.target.value = "";
                if (file) upload.mutate(file);
              }}
            />
          </label>
          {draft.photo && (
            <button
              type="button"
              onClick={() => set("photo", null)}
              className="ml-3 text-sm text-muted transition hover:text-accent"
            >
              Remove
            </button>
          )}
        </div>
      </section>

      <div className="mb-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {(
          [
            ["yields", "Serves"],
            ["time", "Total min"],
            ["prep_time", "Prep min"],
            ["cook_time", "Cook min"],
          ] as const
        ).map(([key, label]) => (
          <div key={key}>
            <label className="label mb-1 block" htmlFor={key}>
              {label}
            </label>
            <input
              id={key}
              type="number"
              min={0}
              value={draft[key]}
              onChange={(e) => set(key, Math.max(0, Number(e.target.value)))}
              className="field font-mono"
            />
          </div>
        ))}
      </div>

      <section className="mb-10">
        <div className="mb-2 flex items-center justify-between">
          <p className="label">Ingredients</p>
          <button
            type="button"
            onClick={() =>
              update((current) => ({
                ...current,
                items: [...current.items, { name: "", description: "", optional: false }],
              }))
            }
            className="label transition hover:text-accent"
          >
            + Add
          </button>
        </div>

        <ul className="rule">
          {draft.items.map((item, index) => (
            <li key={index} className="flex items-center gap-3 border-b border-hairline py-2">
              <input
                value={item.name}
                onChange={(e) => setItem(index, { name: e.target.value })}
                placeholder="Ingredient"
                aria-label={`Ingredient ${index + 1}`}
                className="flex-1 bg-transparent py-1 outline-none placeholder:text-faint"
              />
              <input
                value={item.description}
                onChange={(e) => setItem(index, { description: e.target.value })}
                placeholder="Amount"
                aria-label={`Amount for ingredient ${index + 1}`}
                className="w-36 bg-transparent py-1 text-right font-mono text-xs outline-none placeholder:text-faint"
              />
              <button
                type="button"
                onClick={() => setItem(index, { optional: !item.optional })}
                aria-pressed={item.optional}
                className={`label transition ${item.optional ? "text-accent" : "hover:text-muted"}`}
              >
                opt
              </button>
              {/* Removal is its own control, never the row itself. In the
                  Flutter editor a tap on the ingredient deleted it, which is
                  the single easiest way to lose work in this app. */}
              <button
                type="button"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    items: current.items.filter((_, i) => i !== index),
                  }))
                }
                aria-label={`Remove ${item.name || "ingredient"}`}
                className="px-1 text-faint transition hover:text-accent"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {draft.items.length === 0 && <p className="py-3 text-sm text-faint">No ingredients yet.</p>}
      </section>

      <section className="mb-10">
        <div className="mb-2 flex items-center justify-between">
          <p className="label">Method · markdown</p>
          <button
            type="button"
            onClick={() => setPreview(!preview)}
            className="label transition hover:text-accent"
          >
            {preview ? "Write" : "Preview"}
          </button>
        </div>

        {preview ? (
          <div className="prose-recipe min-h-64 rounded-card border border-hairline p-4">
            <Markdown remarkPlugins={[remarkGfm]}>{draft.description}</Markdown>
          </div>
        ) : (
          <textarea
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            rows={16}
            aria-label="Method"
            placeholder={"## 1. Do this\nThen this."}
            className="w-full rounded-card border border-hairline bg-transparent p-4 font-mono text-sm
                       leading-relaxed outline-none placeholder:text-faint focus:border-accent"
          />
        )}

        {/* Nothing is added silently: a mistyped @onin stays a mistyped word
            rather than becoming an ingredient nobody notices. */}
        {mentioned.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted">Mentioned in the method but not listed:</span>
            {mentioned.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    items: [...current.items, { name, description: "", optional: false }],
                  }))
                }
                className="rounded-full border border-hairline px-3 py-1 text-muted
                           transition hover:border-accent hover:text-accent"
              >
                + {name}
              </button>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-faint">
          Write @onion or @{"{pork belly}"} in a step to pull it into the ingredients.
        </p>
      </section>

      <section className="mb-10">
        <p className="label mb-2">Tags</p>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {draft.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs text-accent"
            >
              {tag}
              <button
                type="button"
                onClick={() =>
                  update((current) => ({
                    ...current,
                    tags: current.tags.filter((other) => other !== tag),
                  }))
                }
                aria-label={`Remove tag ${tag}`}
                className="transition hover:text-ink"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            // Enter inside a form submits it; a tag is not a save.
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(tagDraft);
              }
            }}
            placeholder="Add a tag…"
            aria-label="Add a tag"
            className="w-36 bg-transparent py-1 text-sm outline-none placeholder:text-faint"
          />
        </div>
        {suggestedTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {suggestedTags.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => addTag(name)}
                className="rounded-full border border-hairline px-3 py-1 text-xs text-muted
                           transition hover:border-accent hover:text-accent"
              >
                + {name}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <p className="label mb-2">Who can see it</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              [PRIVATE, "Just this household"],
              [LINK_ONLY, "Anyone with the link"],
              [PUBLIC, "Public — listed in discover"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => set("visibility", value)}
              aria-pressed={draft.visibility === value}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                draft.visibility === value
                  ? "btn-gradient"
                  : "border border-hairline text-muted hover:border-accent hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {error && (
        <p role="alert" className="mb-4 text-sm text-accent">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={save.isPending}
          className="btn-gradient rounded-card px-5 py-2.5 font-medium"
        >
          {save.isPending ? "Saving…" : isNew ? "Create recipe" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-card border border-hairline px-5 py-2.5 text-muted transition hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
