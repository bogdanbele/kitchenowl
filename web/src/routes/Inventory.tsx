import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { byUrgency, daysUntil, timeLeft } from "../api/spiso";
import { useInventory, type KitchenThing } from "../hooks/useInventory";
import { groupByPlace, sliceShelf, useFirst } from "../lib/kitchenGroups";
import { ChevronDown } from "lucide-react";
import { Tabs, type Tab } from "../components/Tabs";

const COLLAPSED_KEY = "kitchenowl.kitchen.collapsed";

/** A place is easier to find by its shape than by reading three headings. */
const PLACE_EMOJI: Record<string, string> = {
  fridge: "🧊",
  freezer: "❄️",
  pantry: "🥫",
};

/**
 * What is actually in the kitchen, read from Spiso.
 *
 * Ordered by what goes off first rather than alphabetically. An inventory
 * sorted A–Z answers "do we have rice"; this one answers "what do I have to
 * cook tonight", which is the question that makes anyone open it.
 */
function urgencyTone(days: number | null): string {
  if (days === null) return "text-muted";
  if (days < 0) return "text-accent";
  if (days <= 2) return "text-accent";
  return "text-muted";
}

/** The date behind the duration, for a hover or a screen reader. */
function exactDate(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function ItemRow({ item, showPlace = true }: { item: KitchenThing; showPlace?: boolean }) {
  const days = daysUntil(item.expires_on);
  const left = timeLeft(item.expires_on);
  // Under a "Fridge · Door shelf" heading, repeating it on every row is noise.
  const place = showPlace ? [item.location, item.space].filter(Boolean).join(" · ") : "";

  return (
    <li className="flex items-center gap-3 border-b border-hairline py-3">
      <span aria-hidden className="w-6 shrink-0 text-center text-lg">
        {item.emoji || "🍽"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.name}</span>
        {(place || item.alias) && (
          <span className="block font-mono text-[11px] text-faint">
            {place}
            {/* What recipes will match this by. Shown because a translation you
                cannot see is one you cannot correct — and "Kefir Blabaer" is not
                a word any recipe will ever ask for. */}
            {item.alias && (
              <span className="text-muted">
                {place ? " · " : ""}
                matched as {item.alias}
              </span>
            )}
          </span>
        )}
      </span>
      {item.quantity > 1 && (
        <span className="shrink-0 font-mono text-xs text-muted">×{item.quantity}</span>
      )}
      {left && (
        // How long is left, with the date itself on hover: "in 7 months" is the
        // answer to the question being asked, and "17 March 2027" is the
        // evidence for it.
        <span
          title={exactDate(item.expires_on)}
          className={`shrink-0 text-right text-xs ${urgencyTone(days)}`}
        >
          {days !== null && days < 0 ? `Went off ${left}` : left}
        </span>
      )}
    </li>
  );
}

export default function Inventory() {
  const { householdId = "1" } = useParams();
  const [query, setQuery] = useState("");
  const [grouping, setGrouping] = useState<"place" | "date">("place");
  // Which places are folded away, remembered per browser. Storing the shut ones
  // rather than the open ones means a new place — a freezer someone starts
  // using — arrives open rather than hidden.
  const [collapsed, setCollapsed] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  });

  // Per-shelf, and deliberately not remembered: unfolding a shelf answers a
  // question you had once. Which *places* you care about is a standing
  // preference; which shelf you opened last Tuesday is not.
  const [expandedShelves, setExpandedShelves] = useState<string[]>([]);
  // Which shelf tab is open, per place. Same reasoning as the shelves above:
  // a filter you chose once is not a preference worth outliving the visit.
  const [openTab, setOpenTab] = useState<Record<string, string>>({});
  const toggleShelf = (key: string) =>
    setExpandedShelves((current) =>
      current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
    );

  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key];
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        // Storage blocked: folding still works, it just forgets.
      }
      return next;
    });

  const { items: all, homeName, needsHome, isPending, error } = useInventory();

  const items = useMemo(() => {
    const sorted = [...all].sort(byUrgency);
    const needle = query.trim().toLowerCase();
    return needle
      ? sorted.filter(
          (item) =>
            item.name.toLowerCase().includes(needle) ||
            // Searching "eggs" should find "Æg" for the same reason a recipe can.
            item.alias?.toLowerCase().includes(needle),
        )
      : sorted;
  }, [all, query]);

  const soon = items.filter((item) => {
    const days = daysUntil(item.expires_on);
    return days !== null && days <= 2;
  });
  const urgent = useFirst(items);

  /**
   * A place can be folded away, and stays folded.
   *
   * A pantry of twenty-two things is most of a screen you scroll past to reach
   * the fridge. Remembering which are shut means the second visit opens on the
   * kitchen you actually look at.
   */
  const places = groupByPlace(items).map((place) => {
    const key = place.location ?? "unfiled";
    const open = !collapsed.includes(key);

    return (
      <section key={place.label} className="mb-8">
        <button
          type="button"
          onClick={() => toggle(key)}
          aria-expanded={open}
          className="group mb-1 flex w-full items-baseline justify-between gap-3 text-left"
        >
          <span className="flex items-baseline gap-2">
            <ChevronDown
              size={14}
              className={`shrink-0 self-center text-faint transition ${open ? "" : "-rotate-90"}`}
            />
            <span aria-hidden>{PLACE_EMOJI[place.location ?? ""] ?? "🍽"}</span>
            <h2 className="font-display text-xl font-semibold tracking-tight transition group-hover:text-accent">
              {place.label}
            </h2>
          </span>
          <span className="font-mono text-[11px] text-muted">
            {place.count}
            {place.soon > 0 && <span className="text-accent"> · {place.soon} to use</span>}
          </span>
        </button>

        {open && (() => {
          const idPrefix = `place-${key.replace(/\W+/g, "-")}`;
          const hasShelves = place.spaces.length > 1;
          // "All" first and selected by default, so tabs filter rather than
          // hide: a pantry you can only read a third of at a time is worse than
          // the list it replaced.
          const tabs: Tab[] = hasShelves
            ? [
                { id: "all", label: "All", count: place.count, badge: place.soon },
                ...place.spaces.map((space) => ({
                  id: space.space ?? "unfiled",
                  label: space.space ?? "Elsewhere",
                  count: space.items.length,
                  badge: space.items.filter((entry) => {
                    const days = daysUntil(entry.expires_on);
                    return days !== null && days <= 2;
                  }).length,
                })),
              ]
            : [];

          const selected = hasShelves ? (openTab[key] ?? "all") : "all";
          const shelf =
            selected === "all"
              ? place.spaces.flatMap((space) => space.items)
              : (place.spaces.find((space) => (space.space ?? "unfiled") === selected)?.items ?? []);

          const shelfKey = `${key}::${selected}`;
          const slice = sliceShelf(shelf, {
            expanded: expandedShelves.includes(shelfKey),
            searching: query.trim().length > 0,
          });
          const listId = `${idPrefix}-panel-${selected}`;

          return (
            <div className="mt-3">
              {hasShelves && (
                <Tabs
                  tabs={tabs}
                  selected={selected}
                  onSelect={(id) => setOpenTab((current) => ({ ...current, [key]: id }))}
                  label={`Shelves in the ${place.label.toLowerCase()}`}
                  idPrefix={idPrefix}
                />
              )}

              <div
                role={hasShelves ? "tabpanel" : undefined}
                id={hasShelves ? listId : undefined}
                aria-labelledby={hasShelves ? `${idPrefix}-tab-${selected}` : undefined}
                tabIndex={hasShelves ? 0 : undefined}
              >
                <ul className="rule">
                  {slice.shown.map((item) => (
                    <ItemRow
                      key={item.id || item.name}
                      item={item}
                      // On "All" the shelf is the one thing a row cannot say
                      // for itself, so it says it.
                      showPlace={selected === "all" && hasShelves}
                    />
                  ))}
                </ul>

                {slice.truncated && (
                  // Labelled with what happens and to how many, rather than a
                  // bare chevron: "Show 7 more" is a decision, "⌄" is a guess.
                  <button
                    type="button"
                    onClick={() => toggleShelf(shelfKey)}
                    aria-expanded={slice.hidden === 0}
                    aria-controls={listId}
                    className="mt-2 inline-flex items-center gap-1.5 py-1 text-xs text-muted
                               transition hover:text-accent"
                  >
                    <ChevronDown
                      size={13}
                      className={`transition ${slice.hidden === 0 ? "rotate-180" : ""}`}
                    />
                    {slice.hidden === 0 ? "Show fewer" : `Show ${slice.hidden} more`}
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </section>
    );
  });

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-3 text-4xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-accent">{(error as Error).message}</p>
        <Link
          to={`/household/${householdId}/settings/spiso`}
          className="label mt-4 inline-block transition hover:text-accent"
        >
          Foodminder settings →
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="label">{homeName ? `From ${homeName}` : "From Foodminder"}</p>
      <h1 className="mt-1 mb-2 text-4xl font-semibold tracking-tight">In the kitchen</h1>
      <p className="mb-8 text-sm text-muted">
        {isPending
          ? "Reading…"
          : soon.length > 0
            ? `${items.length} things in. ${soon.length} to use in the next two days.`
            : `${items.length} things in.`}
      </p>

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search…"
        aria-label="Search the inventory"
        className="mb-6 w-full border-b border-hairline bg-transparent py-2 outline-none
                   placeholder:text-faint focus:border-accent"
      />

      {/* Two orders, two questions. By place answers "what is in the fridge",
          which is what you want standing in front of it or writing a list; by
          date answers "what has to be cooked tonight". Neither is a subset of
          the other, so both stay. */}
      <div className="mb-5 flex items-center gap-2">
        {(["place", "date"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setGrouping(option)}
            aria-pressed={grouping === option}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              grouping === option
                ? "btn-gradient"
                : "border border-hairline text-muted hover:border-accent hover:text-ink"
            }`}
          >
            {option === "place" ? "By place" : "Going off first"}
          </button>
        ))}
      </div>

      {isPending ? (
        <div className="h-64 animate-pulse rounded-card bg-paper-deep" />
      ) : needsHome ? (
        <p className="text-muted">
          Connected, but no home chosen yet —{" "}
          <Link
            to={`/household/${householdId}/settings/spiso`}
            className="text-accent underline underline-offset-2"
          >
            pick one
          </Link>
          .
        </p>
      ) : items.length === 0 ? (
        <p className="text-muted">{query ? `Nothing matching “${query}”.` : "Nothing in yet."}</p>
      ) : grouping === "place" && urgent.length > 0 ? (
        <>
          {/* The count in the header is a fact you then have to go and find.
              These are the actual things, wherever they live — and they stay in
              their place below as well, because the fridge list has to remain a
              true account of the fridge. */}
          <section className="mb-8 rounded-card border border-accent/40 bg-accent-soft/40 p-4">
            <p className="label mb-2 text-accent">Use first</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {urgent.map((item) => (
                <li key={`urgent-${item.id || item.name}`} className="text-sm">
                  {item.emoji && <span aria-hidden>{item.emoji} </span>}
                  {item.name}{" "}
                  <span className="text-xs text-accent">
                    {(daysUntil(item.expires_on) ?? 0) < 0 ? "went off " : ""}
                    {timeLeft(item.expires_on)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          {places}
        </>
      ) : grouping === "place" ? (
        places
      ) : (
        <ul className="rule">
          {items.map((item) => (
            // Flat list: where a thing lives is worth knowing, since nothing
            // above the row says it.
            <ItemRow key={item.id || item.name} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
