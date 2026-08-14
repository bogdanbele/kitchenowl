import { createContext, use, useCallback, useState, type ReactNode } from "react";
import { api, login as apiLogin, tokens } from "./api/client";
import type { User } from "./api/types";

interface AuthState {
  user: User | null;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Restores the session on first load.
 *
 * A stored token is not proof of a live session — it may have been revoked, or
 * the server rebuilt — so this asks the API who we are rather than trusting
 * what is in localStorage. `ready` stays false until that answer arrives, which
 * is what stops the login page flashing for an already signed-in user.
 */
function useRestoredSession(): [User | null, boolean, (user: User | null) => void] {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);

  if (!started) {
    setStarted(true);
    if (!tokens.refresh) {
      setReady(true);
    } else {
      api<User>("/user")
        .then(setUser)
        .catch(() => tokens.clear())
        .finally(() => setReady(true));
    }
  }

  return [user, ready, setUser];
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, ready, setUser] = useRestoredSession();

  const signIn = useCallback(
    async (username: string, password: string) => {
      const auth = await apiLogin(username, password);
      setUser(auth.user);
    },
    [setUser],
  );

  const signOut = useCallback(() => {
    // Deliberately local-only: the API's logout revokes the refresh token, but
    // failing to reach it must not leave you stuck in a session you asked to
    // leave. Revoking server-side belongs in the sessions screen.
    tokens.clear();
    setUser(null);
  }, [setUser]);

  return <AuthContext value={{ user, ready, signIn, signOut }}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const context = use(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
