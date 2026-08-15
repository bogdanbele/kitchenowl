import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, SessionExpired, api, tokens, uploadFile } from "./client";

/**
 * The token dance is the part of this client that fails silently and late: a
 * mistake here signs someone out an hour after the mistake, on a page that has
 * nothing to do with auth. It is worth testing properly.
 */

/** The backend's real error shape: a bare string with no content type of note. */
function textResponse(body: string, status: number) {
  return new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const fetchMock = vi.fn();

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  tokens.set({ access_token: "access-1", refresh_token: "refresh-1" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api", () => {
  it("sends the access token and returns the body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1, name: "Bogdan" }));

    await expect(api("/user")).resolves.toEqual({ id: 1, name: "Bogdan" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/user");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-1");
  });

  it("refreshes once on a 401 and retries the original request", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ msg: "expired" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "access-2", refresh_token: "refresh-2", user: {} }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(api("/user")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/auth/refresh");
    // The retry must carry the new token, not the one that just failed.
    const retry = fetchMock.mock.calls[2][1] as RequestInit;
    expect(new Headers(retry.headers).get("Authorization")).toBe("Bearer access-2");
  });

  it("stores the rotated refresh token, not just the access token", async () => {
    // /auth/refresh invalidates the refresh token it was given. Keeping the old
    // one works until the next refresh and then signs you out for no visible
    // reason — the exact bug this asserts against.
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "access-2", refresh_token: "refresh-2", user: {} }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await api("/user");

    expect(tokens.access).toBe("access-2");
    expect(tokens.refresh).toBe("refresh-2");
  });

  it("shares one refresh between requests that all 401 at once", async () => {
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/auth/refresh") {
        return Promise.resolve(
          jsonResponse({ access_token: "access-2", refresh_token: "refresh-2", user: {} }),
        );
      }
      const auth = new Headers(init?.headers).get("Authorization");
      return Promise.resolve(
        auth === "Bearer access-2" ? jsonResponse({ ok: true }) : jsonResponse({}, 401),
      );
    });

    await Promise.all([api("/a"), api("/b"), api("/c")]);

    const refreshes = fetchMock.mock.calls.filter(([url]) => url === "/api/auth/refresh");
    // Four rotations for four parallel queries would leave three of them holding
    // a token the server has already invalidated.
    expect(refreshes).toHaveLength(1);
  });

  it("clears the session and reports it when the refresh itself fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 401))
      .mockResolvedValueOnce(jsonResponse({ msg: "gone" }, 401));

    await expect(api("/user")).rejects.toBeInstanceOf(SessionExpired);
    expect(tokens.access).toBeNull();
    expect(tokens.refresh).toBeNull();
  });

  it("does not retry anything other than a 401", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ msg: "Unsupported website" }, 400));

    await expect(api("/x")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces the server's message so a 400 says something useful", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ msg: "Unsupported website" }, 400));
    await expect(api("/x")).rejects.toThrow("Unsupported website");
  });

  it("handles a 204 with no body", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(api("/x", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("never tries to refresh while logging in", async () => {
    // A wrong password answers 401. Refreshing there would burn the refresh
    // token of whoever was signed in before.
    fetchMock.mockResolvedValueOnce(jsonResponse({ msg: "Unauthorized" }, 401));

    await expect(api("/auth", { method: "POST", anonymous: true, body: {} })).rejects.toBeInstanceOf(
      SessionExpired,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("error messages", () => {
  it("reads a plain-text error body, which is what this backend actually sends", async () => {
    // Its error handlers return text, not JSON. Parsing as JSON first made every
    // message collapse to "Bad Request" and hid what the server was telling us.
    fetchMock.mockResolvedValueOnce(textResponse("Request invalid: email", 400));
    await expect(api("/user")).rejects.toThrow("Request invalid: email");
  });

  it("still unwraps the routes that do answer with JSON", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ msg: "Onboarding not allowed" }, 403));
    await expect(api("/onboarding")).rejects.toThrow("Onboarding not allowed");
  });

  it("falls back to the status text when the body is empty", async () => {
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500, statusText: "Server Error" }));
    await expect(api("/x")).rejects.toThrow("Server Error");
  });
});

describe("query parameters", () => {
  it("encodes values and drops the ones that are not set", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await api("/recipe/search", { query: { query: "pork sinigang", page: 0, language: undefined } });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/recipe/search?query=pork+sinigang&page=0");
  });

  it("repeats a key for array values, which is how the expense filter passes categories", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    await api("/household/1/expense", { query: { filter: [3, 7] } });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/household/1/expense?filter=3&filter=7");
  });
});

describe("uploadFile", () => {
  const file = () => new File(["x"], "photo.jpg", { type: "image/jpeg" });

  it("posts multipart without setting a content type", async () => {
    // Only fetch knows the boundary it generated; setting the header by hand
    // corrupts the request.
    fetchMock.mockResolvedValueOnce(jsonResponse({ filename: "abc.jpg" }));
    await expect(uploadFile(file())).resolves.toBe("abc.jpg");

    const init = fetchMock.mock.calls[0][1] as { body: unknown; headers: Headers };
    expect(init.body).toBeInstanceOf(FormData);
    expect(new Headers(init.headers).get("Content-Type")).toBeNull();
  });

  it("treats a 200 with no filename as a failure, because the server does that", async () => {
    // A fresh Response per call: a body can only be read once.
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ msg: "missing file" }, 200)));
    await expect(uploadFile(file())).rejects.toBeInstanceOf(ApiError);
    await expect(uploadFile(file())).rejects.toThrow("missing file");
  });
});

describe("refreshing across tabs", () => {
  /**
   * The failure this guards against signed a real session out mid-build: two
   * tabs open, both 401 when the access token ages out, both spend the same
   * refresh token, and the second spend trips reuse detection — which does not
   * expire the session, it destroys it.
   */
  it("takes a lock that other tabs share", async () => {
    const request = vi.fn((_name: string, work: () => Promise<unknown>) => work());
    vi.stubGlobal("navigator", { ...navigator, locks: { request } });

    fetchMock.mockImplementationOnce(() => Promise.resolve(textResponse("nope", 401)));
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse({ access_token: "access-2", refresh_token: "refresh-2" })),
    );
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({ ok: true })));

    await api("/household");
    expect(request).toHaveBeenCalledWith("kitchenowl.refresh", expect.any(Function));
  });

  it("does not spend a refresh token another tab already rotated", async () => {
    // The other tab wins the lock, refreshes, and stores new tokens while this
    // one waits. Spending the token we came in with would be the reuse.
    vi.stubGlobal("navigator", {
      ...navigator,
      locks: {
        request: (_name: string, work: () => Promise<unknown>) => {
          tokens.set({ access_token: "access-from-other-tab", refresh_token: "refresh-2" });
          return work();
        },
      },
    });

    fetchMock.mockImplementationOnce(() => Promise.resolve(textResponse("nope", 401)));
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({ ok: true })));

    await expect(api("/household")).resolves.toEqual({ ok: true });

    // Two calls: the 401 and the retry. No refresh request at all.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((call) => call[0])).not.toContain("/api/auth/refresh");
    // And the retry carries the token the other tab stored.
    const retry = fetchMock.mock.calls[1][1] as { headers: Headers };
    expect(new Headers(retry.headers).get("Authorization")).toBe("Bearer access-from-other-tab");
  });

  it("still refreshes normally where Web Locks are missing", async () => {
    vi.stubGlobal("navigator", { ...navigator, locks: undefined });

    fetchMock.mockImplementationOnce(() => Promise.resolve(textResponse("nope", 401)));
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse({ access_token: "access-2", refresh_token: "refresh-2" })),
    );
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({ ok: true })));

    await expect(api("/household")).resolves.toEqual({ ok: true });
    expect(tokens.access).toBe("access-2");
  });
});
