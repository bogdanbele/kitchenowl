import type { AuthResponse } from "./types";

const ACCESS_KEY = "kitchenowl.access";
const REFRESH_KEY = "kitchenowl.refresh";

/**
 * Tokens live in localStorage.
 *
 * That is readable by any script on the origin, which for a self-hosted app you
 * run for your own household is an acceptable trade for surviving a page
 * reload. It would not be acceptable for a multi-tenant service.
 */
export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set({ access_token, refresh_token }: Pick<AuthResponse, "access_token" | "refresh_token">) {
    localStorage.setItem(ACCESS_KEY, access_token);
    localStorage.setItem(REFRESH_KEY, refresh_token);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Thrown when the session is gone for good, so the UI can send you to /login. */
export class SessionExpired extends ApiError {}

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return body?.msg ?? body?.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

/**
 * Refresh, with the rotation the backend actually performs.
 *
 * /api/auth/refresh issues a *new* refresh token and invalidates the old one.
 * Storing only the new access token would work until the next refresh and then
 * log you out with no explanation, so both tokens are replaced together.
 *
 * Concurrent 401s share one in-flight refresh; otherwise a page that fires four
 * queries at once rotates four times and three of them lose the race.
 */
let refreshing: Promise<void> | null = null;

function refreshTokens(): Promise<void> {
  refreshing ??= (async () => {
    const refresh = tokens.refresh;
    if (!refresh) throw new SessionExpired(401, "Not signed in");

    const response = await fetch("/api/auth/refresh", {
      headers: { Authorization: `Bearer ${refresh}` },
    });
    if (!response.ok) {
      tokens.clear();
      throw new SessionExpired(response.status, "Session expired");
    }
    tokens.set((await response.json()) as AuthResponse);
  })().finally(() => {
    refreshing = null;
  });

  return refreshing;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Set for the one call that must not try to refresh: logging in. */
  anonymous?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, anonymous = false } = options;

  const send = () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (!anonymous && tokens.access) headers.Authorization = `Bearer ${tokens.access}`;

    return fetch(`/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let response = await send();

  // One retry, and only for 401: an expired access token is routine, anything
  // else is a real error and retrying it just doubles the load.
  if (response.status === 401 && !anonymous) {
    await refreshTokens();
    response = await send();
  }

  if (!response.ok) {
    const message = await readError(response);
    throw response.status === 401
      ? new SessionExpired(401, message)
      : new ApiError(response.status, message);
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const auth = await api<AuthResponse>("/auth", {
    method: "POST",
    anonymous: true,
    // The backend records this against the refresh token so sessions are
    // distinguishable in settings.
    body: { username, password, device: "KitchenOwl Web" },
  });
  tokens.set(auth);
  return auth;
}
