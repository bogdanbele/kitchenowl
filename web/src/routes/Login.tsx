import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";

export default function Login() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
    } catch (caught) {
      // The API answers 401 for both a wrong password and an unknown user, and
      // says so deliberately. Repeat that rather than inventing a distinction
      // the server refused to make.
      setError(caught instanceof Error ? caught.message : "Could not sign in");
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-lg border border-line bg-surface px-3 py-2.5 outline-none " +
    "focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20";

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 mb-8 text-sm text-ink-soft">to your KitchenOwl household</p>

        <label className="mb-1.5 block text-sm font-medium" htmlFor="username">
          Username or email
        </label>
        <input
          id="username"
          className={field}
          value={username}
          autoComplete="username"
          autoFocus
          onChange={(e) => setUsername(e.target.value)}
        />

        <label className="mt-5 mb-1.5 block text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          className={field}
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="mt-7 w-full rounded-lg bg-accent-600 px-4 py-2.5 font-medium text-white
                     transition hover:bg-accent-700 disabled:opacity-40"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
