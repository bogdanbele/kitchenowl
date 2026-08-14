import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const KEY = "kitchenowl.theme";
const listeners = new Set<() => void>();

function read(): Theme {
  const stored = localStorage.getItem(KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/**
 * The attribute is written to <html>, not to a React tree.
 *
 * index.html sets it before first paint from the same key, so a reload of a
 * dark-themed page never flashes paper-white on the way in.
 */
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme) {
  localStorage.setItem(KEY, theme);
  apply(theme);
  listeners.forEach((listener) => listener());
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(
    useCallback((onChange: () => void) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    }, []),
    read,
    () => "system" as Theme,
  );

  return [theme, setTheme];
}
