import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { spisoApi, type SpisoItem } from "../api/spiso";
import { openRouter, translateToEnglish } from "../api/openrouter";
import {
  cachedEnglish,
  parseTranslations,
  rememberEnglish,
  untranslated,
} from "../lib/pantryTranslate";

export interface KitchenThing extends SpisoItem {
  /** English name for matching. Never shown in place of `name`. */
  alias?: string;
}

/**
 * The kitchen, with English aliases for anything that needs one.
 *
 * The alias exists so a recipe asking for eggs can find "Æg", and a Romanian
 * recipe's cottage cheese can find whatever the tub actually says. It is only
 * ever used for matching: every screen shows `name`, because that is what is
 * written on the thing in the fridge, and replacing it with a translation would
 * make the app describe a kitchen nobody recognises.
 *
 * Spiso is not written to. This is a reading aid on this side of the bridge.
 */
export function useInventory() {
  const query = useQuery({
    queryKey: ["spiso-inventory"],
    queryFn: spisoApi.inventory,
    staleTime: 60_000,
    retry: false,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  // Bumped when new translations land, to recompute from the cache. The cache
  // is localStorage rather than state because it outlives the page.
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (items.length === 0 || !openRouter.configured) return;
    const missing = untranslated(items.map((item) => item.name));
    if (missing.length === 0) return;

    const abort = new AbortController();
    void translateToEnglish(missing, abort.signal)
      .then((reply) => {
        const useful = parseTranslations(reply, missing);
        if (Object.keys(useful).length === 0) return;
        rememberEnglish(useful);
        setGeneration((value) => value + 1);
      })
      .catch(() => {
        // No key, no credit, no network: the kitchen still matches on whatever
        // is already in English. A failed reading aid is not an error to show.
      });
    return () => abort.abort();
  }, [items]);

  const withAliases: KitchenThing[] = useMemo(
    () =>
      items.map((item) => {
        const english = cachedEnglish(item.name);
        // An alias identical to the name buys nothing and would only clutter
        // the screen if it were ever shown.
        return english && english.toLowerCase() !== item.name.trim().toLowerCase()
          ? { ...item, alias: english }
          : item;
      }),
    // generation is the dependency that matters: the cache changed underneath.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, generation],
  );

  return {
    items: withAliases,
    homeName: query.data?.home_name ?? null,
    needsHome: query.data?.needs_home === true,
    isPending: query.isPending,
    error: query.error,
    connected: !query.error && query.data != null,
  };
}
