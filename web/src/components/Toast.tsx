import { createContext, use, useCallback, useMemo, useState, type ReactNode } from "react";

/**
 * One place for "that didn't work".
 *
 * Without it every mutation needs its own error state and its own line of JSX,
 * which across the ~25 CRUD forms still to build is the difference between a
 * form being 40 lines and 60. Errors from the query client land here too.
 */
interface Toast {
  id: number;
  message: string;
  tone: "error" | "success";
}

interface ToastApi {
  toast: (message: string, tone?: Toast["tone"]) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, tone: Toast["tone"] = "error") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    // Long enough to read a sentence, short enough not to stack up while
    // someone is ticking items off a list.
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 6000);
  }, []);

  const api = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext value={api}>
      {children}
      {/* Above the mobile bottom bar, which is 4rem plus the safe area. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((entry) => (
          <div
            key={entry.id}
            role="status"
            className={`pointer-events-auto max-w-md rounded-card border px-4 py-2.5 text-sm shadow-lg
                        ${
                          entry.tone === "error"
                            ? "border-accent/40 bg-paper text-accent"
                            : "border-hairline bg-paper text-ink"
                        }`}
          >
            {entry.message}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}

export function useToast(): ToastApi {
  const context = use(ToastContext);
  // Deliberately not throwing: a toast is never load-bearing, and a component
  // rendered outside the provider in a test should not fail because of it.
  return context ?? { toast: () => {} };
}

/**
 * Lets non-React code (the query client's error handlers) raise a toast.
 * Set once by the provider's consumer in main.tsx.
 */
let externalToast: ToastApi["toast"] | null = null;

export function setExternalToast(fn: ToastApi["toast"]) {
  externalToast = fn;
}

export function notify(message: string, tone: Toast["tone"] = "error") {
  externalToast?.(message, tone);
}
