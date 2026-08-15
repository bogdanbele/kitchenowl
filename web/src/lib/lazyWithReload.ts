import { lazy, type ComponentType } from "react";

/**
 * A lazy route that survives a deploy.
 *
 * Every screen here is code-split, so opening one fetches a chunk by its hashed
 * filename. When the server is rebuilt those filenames change and the old ones
 * stop existing — so a tab that has been open since before the deploy asks for
 * a file that is gone and throws "Failed to fetch dynamically imported module".
 * The page it is already showing keeps working, which makes it look like one
 * screen is broken rather than the app being out of date.
 *
 * The tab reloads itself once and comes back on the new build. Once, guarded by
 * a sessionStorage flag: if the chunk is missing for any other reason — a bad
 * deploy, a proxy serving 404s — reloading forever would turn a broken screen
 * into a broken browser tab. The second failure is allowed to surface as an
 * error, where the boundary can show it.
 */
const RELOADED_KEY = "kitchenowl.reloaded-for-chunk";

export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    factory().catch((error: unknown) => {
      let alreadyTried = false;
      try {
        alreadyTried = sessionStorage.getItem(RELOADED_KEY) === "1";
        sessionStorage.setItem(RELOADED_KEY, "1");
      } catch {
        // Storage blocked. Without somewhere to remember the attempt a reload
        // could loop, so don't: let the error through to the boundary.
        throw error;
      }
      if (alreadyTried) throw error;
      window.location.reload();
      // Never settles — the reload is on its way and rendering anything here
      // would flash the wrong thing first.
      return new Promise<{ default: T }>(() => {});
    }),
  );
}

/** Cleared on a successful load, so the next deploy gets its own free reload. */
export function markAppLoaded(): void {
  try {
    sessionStorage.removeItem(RELOADED_KEY);
  } catch {
    // Nothing to clear if storage is blocked.
  }
}
