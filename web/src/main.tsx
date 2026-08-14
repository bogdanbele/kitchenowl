import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth";
import { SessionExpired, tokens } from "./api/client";
import { ToastProvider, notify, setExternalToast, useToast } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

/**
 * Errors surface once, here, rather than in every screen.
 *
 * A failed read still renders its own inline message (the screen knows what is
 * missing); this is the safety net for everything else, and the only place that
 * reacts to a session ending. Without it a SessionExpired thrown by a mutation
 * left the app sitting there looking signed in.
 */
function handleError(error: unknown) {
  if (error instanceof SessionExpired) {
    tokens.clear();
    notify("Your session ended. Sign in again.");
    return;
  }
  notify(error instanceof Error ? error.message : "Something went wrong.");
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleError }),
  mutationCache: new MutationCache({ onError: handleError }),
  defaultOptions: {
    queries: {
      // A revoked session will not start working because we asked again, and
      // retrying a 401 three times just delays showing the login form.
      retry: (failureCount, error) => !(error instanceof SessionExpired) && failureCount < 2,
      staleTime: 30_000,
      // Online-only by decision, so the offline machinery is off: a request
      // that fails should fail visibly rather than being held as "paused" with
      // a skeleton on screen and no error raised.
      networkMode: "always",
    },
    mutations: { networkMode: "always" },
  },
});

// Dev-only handles. The query library also pauses retries while the document is
// unfocused, which a driven browser tab always is — so verifying an error state
// from automation needs focusManager.setFocused(true).
if (import.meta.env.DEV) {
  Object.assign(window as unknown as Record<string, unknown>, { __qc: queryClient, __focus: focusManager });
}

/** Hands the toast function to the non-React error handlers above. */
function ToastBridge() {
  const { toast } = useToast();
  useEffect(() => setExternalToast(toast), [toast]);
  return null;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <ToastBridge />
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <BrowserRouter basename={import.meta.env.BASE_URL}>
              <App />
            </BrowserRouter>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </ToastProvider>
  </StrictMode>,
);
