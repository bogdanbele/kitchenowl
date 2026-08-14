import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, SessionExpired, api, tokens } from "./client";

/**
 * The token dance is the part of this client that fails silently and late: a
 * mistake here signs someone out an hour after the mistake, on a page that has
 * nothing to do with auth. It is worth testing properly.
 */

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
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access-1");
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
    const retry = fetchMock.mock.calls[2][1] as { headers: Record<string, string> };
    expect(retry.headers.Authorization).toBe("Bearer access-2");
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
    fetchMock.mockImplementation((url: string, init?: { headers?: Record<string, string> }) => {
      if (url === "/api/auth/refresh") {
        return Promise.resolve(
          jsonResponse({ access_token: "access-2", refresh_token: "refresh-2", user: {} }),
        );
      }
      const auth = init?.headers?.Authorization;
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
