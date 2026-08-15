import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, ExternalLink, Eye, EyeOff, Sparkles } from "lucide-react";
import { DEFAULT_MODEL, listModels, openRouter, testKey } from "../api/openrouter";
import { useToast } from "../components/Toast";
import { ThemeToggle } from "../components/ThemeToggle";
import { useAuth } from "../auth";

/**
 * Personal settings — this browser's, not the household's.
 *
 * The OpenRouter key belongs here rather than in household settings because it
 * is yours and it never leaves this browser: nothing is written to the
 * KitchenOwl server, which has no field for it and no reason to hold it.
 */
export default function Settings() {
  const { toast } = useToast();
  const { user } = useAuth();

  const [key, setKey] = useState(openRouter.key ?? "");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(openRouter.model);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [filter, setFilter] = useState("");

  const { data: models, isPending: loadingModels } = useQuery({
    queryKey: ["openrouter-models"],
    queryFn: listModels,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  function save() {
    openRouter.setKey(key);
    openRouter.setModel(model);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function runTest() {
    openRouter.setKey(key);
    openRouter.setModel(model);
    setTesting(true);
    try {
      const reply = await testKey();
      toast(`${model} replied: ${reply}`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "That did not work.");
    } finally {
      setTesting(false);
    }
  }

  const visible = (models ?? []).filter((entry) =>
    `${entry.name} ${entry.id}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const chosen = models?.find((entry) => entry.id === model);

  return (
    <div className="mx-auto max-w-2xl">
      <p className="label">This browser</p>
      <h1 className="mt-1 mb-10 text-4xl font-semibold tracking-tight">Settings</h1>

      <section className="mb-12">
        <h2 className="mb-1 flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
          <Sparkles size={20} className="text-accent" />
          AI
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          An OpenRouter key turns on pasting a recipe from any text — a message from your
          grandmother, a photo you transcribed, a blog that refuses to be scraped. The key is stored
          in this browser and sent only to openrouter.ai; the KitchenOwl server never sees it.{" "}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-accent underline underline-offset-2"
          >
            Get a key <ExternalLink size={12} />
          </a>
        </p>

        <label className="label mb-1 block" htmlFor="openrouter-key">
          OpenRouter API key
        </label>
        <div className="mb-6 flex items-center gap-2">
          <input
            id="openrouter-key"
            type={showKey ? "text" : "password"}
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="sk-or-v1-…"
            autoComplete="off"
            spellCheck={false}
            className="field font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            aria-label={showKey ? "Hide the key" : "Show the key"}
            className="shrink-0 p-2 text-faint transition hover:text-ink"
          >
            {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <label className="label mb-1 block" htmlFor="model-filter">
          Model
        </label>
        <input
          id="model-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={loadingModels ? "Loading models…" : "Filter models…"}
          className="field mb-2 text-sm"
        />
        <select
          value={model}
          onChange={(event) => setModel(event.target.value)}
          aria-label="Model"
          size={8}
          className="mb-2 w-full rounded-card border border-hairline bg-transparent p-2 font-mono text-xs outline-none focus:border-accent"
        >
          {/* The stored model may not be in the filtered view; keep it selectable. */}
          {!visible.some((entry) => entry.id === model) && <option value={model}>{model}</option>}
          {visible.slice(0, 300).map((entry) => (
            <option key={entry.id} value={entry.id}>
              {/* 👁 marks a model that can read a photographed page. Reading
                  that requirement only after picking is how you find out by
                  watching the request fail. */}
              {entry.seesImages ? "👁 " : "   "}
              {entry.id}
            </option>
          ))}
        </select>
        <p className="mb-2 text-xs text-muted">
          {chosen
            ? `${chosen.name} · ${chosen.contextLength.toLocaleString()} token context${
                chosen.promptPrice ? ` · $${(chosen.promptPrice * 1_000_000).toFixed(2)}/M tokens in` : " · free"
              }`
            : `Using ${model}${model === DEFAULT_MODEL ? " (default)" : ""}`}
        </p>
        <p className="mb-6 text-xs text-faint">
          {chosen && !chosen.seesImages
            ? "👁 marks models that can read a photograph. This one cannot, so “From a photo” will not work."
            : "👁 marks models that can read a photographed page."}
        </p>

        <div className="flex flex-wrap gap-3">
          <button onClick={save} className="btn-gradient rounded-card px-5 py-2.5 font-medium">
            {saved ? (
              <span className="inline-flex items-center gap-2">
                <Check size={16} /> Saved
              </span>
            ) : (
              "Save"
            )}
          </button>
          <button
            onClick={runTest}
            disabled={!key.trim() || testing}
            className="rounded-card border border-hairline px-5 py-2.5 text-muted transition hover:text-ink disabled:opacity-40"
          >
            {testing ? "Testing…" : "Test the key"}
          </button>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">Appearance</h2>
        <div className="-ml-1.5">
          <ThemeToggle />
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-2xl font-semibold tracking-tight">Account</h2>
        <p className="text-sm text-muted">
          Signed in as <span className="text-ink">{user?.name}</span> ({user?.username})
        </p>
      </section>
    </div>
  );
}
