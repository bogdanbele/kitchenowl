import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";

export default function Login() {
  const { signIn, signInWithSpiso } = useAuth();
  const [mode, setMode] = useState<"kitchenowl" | "spiso">("kitchenowl");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (mode === "spiso" ? signInWithSpiso(username, password) : signIn(username, password));
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

        {/* Two ways in, one form. A separate "sign in with…" button would mean
            deciding which one you are before typing anything; the toggle keeps
            the fields and swaps what they mean. */}
        <div className="mb-8 flex gap-1">
          {(["kitchenowl", "spiso"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setMode(option);
                setError(null);
              }}
              aria-pressed={mode === option}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                mode === option ? "bg-accent-soft text-accent" : "text-muted hover:text-ink"
              }`}
            >
              {option === "kitchenowl" ? "KitchenOwl" : "Foodminder"}
            </button>
          ))}
        </div>

        <label className="label mb-1 block" htmlFor="username">
          {mode === "spiso" ? "Foodminder email" : "Username or email"}
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
          {busy ? "Signing in…" : mode === "spiso" ? "Sign in with Foodminder" : "Sign in"}
        </button>

        {mode === "spiso" && (
          <p className="mt-4 text-xs text-faint">
            Uses your Foodminder password. Works once that account has been connected from
            Settings while signed in here — KitchenOwl asks your Spiso server, so if it is down,
            this way in is too.
          </p>
        )}
      </form>
    </main>
  );
}
