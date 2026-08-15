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
/**
 * Anything holding a copy of the access token subscribes here.
 *
 * The socket authenticates with the same header and would otherwise keep using
 * a token that has already been rotated. A listener rather than an import,
 * because live.ts already imports this module and a cycle between the two is
 * the kind of thing that only breaks once the bundler reorders them.
 */
const tokenListeners = new Set<() => void>();

export function onTokensChanged(listener: () => void): () => void {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

const announce = () => tokenListeners.forEach((listener) => listener());

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
    announce();
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    announce();
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

/**
 * Read whatever the backend put in the body of a failed response.
 *
 * Its error handlers return **plain text** ("Request invalid: email"), not JSON,
 * while a few routes do answer with `{"msg": …}`. Parsing as JSON first meant
 * every message degraded to response.statusText, so the app has only ever shown
 * "Bad Request" where the server was being specific.
 */
async function readError(response: Response): Promise<string> {
  const text = (await response.text().catch(() => "")).trim();
  if (!text) return response.statusText;

  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const body = JSON.parse(text);
      return body?.msg ?? body?.message ?? text;
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * Refresh, with the rotation the backend actually performs.
 *
 * /api/auth/refresh issues a *new* refresh token and invalidates the old one,
 * and reusing a rotated token trips the server's reuse detection and logs the
 * device out for good. So: both tokens are replaced together, and concurrent
 * callers share one in-flight refresh rather than racing.
 */
let refreshing: Promise<void> | null = null;

const REFRESH_LOCK = "kitchenowl.refresh";

/**
 * Serialise across tabs, not just within this page.
 *
 * The in-page promise below only ever covered one document. Two tabs open on
 * the same household each hit a 401 when the access token ages out, each spends
 * the *same* refresh token, and the second spend is exactly what reuse
 * detection is looking for: the server invalidates the whole family and both
 * tabs are signed out for good, with no way back but the login screen. That
 * happened during this build with two tabs open.
 *
 * Web Locks are shared between same-origin tabs, which is the only coordination
 * primitive that is. Where they are missing the behaviour is what it was.
 */
function withTabLock<T>(work: () => Promise<T>): Promise<T> {
  if (!navigator.locks?.request) return work();
  return navigator.locks.request(REFRESH_LOCK, work) as Promise<T>;
}

function refreshTokens(): Promise<void> {
  refreshing ??= (async () => {
    const stale = tokens.refresh;
    if (!stale) throw new SessionExpired(401, "Not signed in");

    await withTabLock(async () => {
      // Inside the lock, look again: whoever held it before us may have
      // rotated the tokens already, and spending ours now is the reuse that
      // logs the household out.
      const current = tokens.refresh;
      if (!current) throw new SessionExpired(401, "Not signed in");
      if (current !== stale) return;

      const response = await fetch("/api/auth/refresh", {
        headers: { Authorization: `Bearer ${current}` },
      });
      if (!response.ok) {
        tokens.clear();
        throw new SessionExpired(response.status, "Session expired");
      }
      tokens.set((await response.json()) as AuthResponse);
    });
  })().finally(() => {
    refreshing = null;
  });

  return refreshing;
}

// A rotation in another tab is news here too: the socket holds a copy of the
// access token and would go on using one that has been replaced.
window.addEventListener("storage", (event) => {
  if (event.key === ACCESS_KEY || event.key === REFRESH_KEY) announce();
});

/**
 * Every authenticated request goes through here, including image loads.
 *
 * Anything that calls fetch directly gets no refresh on a 401 — which is how
 * photos used to break silently once an access token aged out.
 */
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const send = () => {
    const headers = new Headers(init.headers);
    if (tokens.access) headers.set("Authorization", `Bearer ${tokens.access}`);
    return fetch(`/api${path}`, { ...init, headers });
  };

  const response = await send();
  // One retry, and only for 401: an expired access token is routine, anything
  // else is a real error and retrying it just doubles the load.
  if (response.status !== 401) return response;

  await refreshTokens();
  return send();
}

function toQueryString(query: QueryParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    // Repeated params are how the expense filter passes several category ids.
    if (Array.isArray(value)) value.forEach((entry) => params.append(key, String(entry)));
    else params.append(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Multipart payload. Set instead of `body`; the browser writes the boundary. */
  form?: FormData;
  query?: QueryParams;
  /** Set for the one call that must not try to refresh: logging in. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, form, query, anonymous = false, signal } = options;
  const url = query ? `${path}${toQueryString(query)}` : path;

  const init: RequestInit = { method, signal };
  if (form) {
    // Deliberately no Content-Type: fetch must set it, because only fetch knows
    // the multipart boundary it generated.
    init.body = form;
  } else if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }

  const response = anonymous
    ? await fetch(`/api${url}`, init)
    : await authedFetch(url, init);

  if (!response.ok) {
    const message = await readError(response);
    throw response.status === 401
      ? new SessionExpired(401, message)
      : new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

interface UploadResponse {
  filename?: string;
  msg?: string;
}

/**
 * Upload a file and return the filename to store on a recipe, expense, user or
 * household.
 *
 * The endpoint answers **HTTP 200 with `{"msg": "missing file"}`** when it does
 * not like the request, so the status code is not the test — the presence of a
 * filename is.
 */
export async function uploadFile(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const result = await api<UploadResponse>("/upload", { method: "POST", form });
  if (!result?.filename) {
    throw new ApiError(400, result?.msg ?? "The server rejected that file.");
  }
  return result.filename;
}

/**
 * Sign in with a Spiso (Foodminder) password.
 *
 * The server works out which KitchenOwl account that is from the link made in
 * settings; no server address is sent from here, because a login form that
 * names the server it posts a password to is a login form that can be pointed
 * somewhere else.
 */
export async function loginWithSpiso(email: string, password: string): Promise<AuthResponse> {
  const auth = await api<AuthResponse>("/spiso/login", {
    method: "POST",
    anonymous: true,
    body: { email, password, device: "KitchenOwl Web · Spiso" },
  });
  tokens.set(auth);
  return auth;
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
