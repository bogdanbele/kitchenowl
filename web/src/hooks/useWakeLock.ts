import { useEffect, useState } from "react";

/**
 * Keep the screen on while cooking.
 *
 * A phone locking itself mid-recipe, to be unlocked with greasy hands, is the
 * single most annoying thing about cooking from one. The API is not everywhere
 * (Safari got it late, Firefox later) and it throws rather than resolving false
 * when refused, so every path here is a silent no-op: a screen that dims is a
 * far smaller problem than an error message you cannot act on.
 */
interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
}

export function useWakeLock(): { active: boolean } {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const api = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> } })
      .wakeLock;
    if (!api) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        sentinel = await api.request("screen");
        if (cancelled) {
          void sentinel.release();
          return;
        }
        setActive(true);
        sentinel.addEventListener("release", () => setActive(false));
      } catch {
        setActive(false);
      }
    };

    void acquire();

    // The lock is dropped whenever the tab is hidden — switching apps to check a
    // message and coming back must not silently end it.
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) void acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
      setActive(false);
    };
  }, []);

  return { active };
}
