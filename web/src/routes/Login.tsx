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
    "w-full border-b border-line bg-transparent py-2 outline-none transition " +
    "placeholder:text-faint focus:border-accent";

  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm">
        <p className="label">Household · Access</p>
        <h1 className="gradient-ink mt-2 mb-10 text-4xl font-semibold tracking-tight">KitchenOwl</h1>

        <label className="label mb-1 block" htmlFor="username">
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

        <label className="label mt-8 mb-1 block" htmlFor="password">
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
          <p role="alert" className="mt-5 text-sm text-accent">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || !username || !password}
          className="btn-gradient mt-10 w-full rounded-card px-4 py-3 font-medium"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
