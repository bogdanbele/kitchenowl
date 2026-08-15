import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { byUrgency, daysUntil, expiryLabel } from "../api/spiso";
import { useInventory, type KitchenThing } from "../hooks/useInventory";

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

function ItemRow({ item }: { item: KitchenThing }) {
  const days = daysUntil(item.expires_on);
  const label = expiryLabel(item.expires_on);

  return (
    <li className="flex items-center gap-3 border-b border-hairline py-3">
      <span aria-hidden className="w-6 shrink-0 text-center text-lg">
        {item.emoji || "🍽"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.name}</span>
        <span className="block font-mono text-[11px] text-faint">
          {item.location}
          {/* What recipes will match this by. Shown because a translation you
              cannot see is one you cannot correct — and "Kefir Blabaer" is not
              a word any recipe will ever ask for. */}
          {item.alias && (
            <span className="text-muted">
              {item.location ? " · " : ""}
              matched as {item.alias}
            </span>
          )}
        </span>
      </span>
      {item.quantity > 1 && (
        <span className="shrink-0 font-mono text-xs text-muted">×{item.quantity}</span>
      )}
      {label && (
        <span className={`shrink-0 text-right text-xs ${urgencyTone(days)}`}>
          {days !== null && days < 0 ? "Went off " : ""}
          {label}
        </span>
      )}
    </li>
  );
}

export default function Inventory() {
  const { householdId = "1" } = useParams();
  const [query, setQuery] = useState("");

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
      ) : (
        <ul className="rule">
          {items.map((item) => (
            <ItemRow key={item.id || item.name} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
