import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * The only class component here, because React still offers no hook for this.
 *
 * Without it a single render throw anywhere blanks the entire app — no message,
 * no navigation, nothing in the UI to say what happened. With ~40 more screens
 * coming, that is not a risk worth carrying.
 *
 * Callers remount it with a `key` (the route path) so navigating away from a
 * broken screen clears the error, rather than resetting state from an update
 * lifecycle and triggering a second render pass.
 */
interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Self-hosted and single-user: the console is the error report.
    console.error("Unhandled error in render:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    /**
     * A chunk that will not load is almost always an old tab meeting a new
     * build, not a fault in this screen. `lazyWithReload` already reloads once;
     * getting here means that did not help, so name the likely cause instead of
     * showing a stack trace about modules.
     */
    const staleBuild =
      /dynamically imported module|Importing a module script failed|Loading chunk/i.test(
        error.message,
      );

    return (
      <div className="mx-auto max-w-lg py-16">
        <p className="label">Something broke</p>
        <h1 className="mt-1 mb-4 text-3xl font-semibold tracking-tight">
          {staleBuild ? "This tab is out of date" : "This screen crashed"}
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-muted">
          {staleBuild
            ? "The app was rebuilt while this tab was open, so a piece of it that had not loaded yet no longer exists. Reloading fixes it. If it comes back after a reload, the server is missing files the page is asking for."
            : "The rest of the app is still fine — the message below is what went wrong here."}
        </p>
        <pre className="mb-6 overflow-auto rounded-card border border-hairline bg-paper-deep p-4 font-mono text-xs">
          {error.message}
        </pre>
        <div className="flex gap-3">
          <button
            onClick={() => this.setState({ error: null })}
            className="btn-gradient rounded-card px-5 py-2.5 font-medium"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-card border border-hairline px-5 py-2.5 text-muted transition hover:text-ink"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
