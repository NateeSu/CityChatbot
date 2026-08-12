import { describe, expect, it } from "vitest";

import { HttpLineIdentityProvider } from "./line-provider";

const NOW = new Date("2026-08-10T00:00:00.000Z");
const CHANNEL_ID = "1234567890";

const response = (payload: unknown, status = 200): Response => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
} as Response);

describe("HTTP LINE identity provider", () => {
  it("verifies ID tokens through the LINE endpoint and maps only verified claims", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const provider = new HttpLineIdentityProvider({
      clock: () => NOW,
      fetchImpl: async (input, init) => {
        calls.push({ input, init });
        return response({ iss: "https://access.line.me", sub: "U11111111111111111111111111111111", aud: CHANNEL_ID, exp: 1_800_000_300, iat: 1_800_000_000, nonce: "nonce-value" });
      },
    });
    const claims = await provider.verifyIdToken({ token: "id-token", channelId: CHANNEL_ID, nonce: "nonce-value" });
    expect(claims).toMatchObject({ issuer: "https://access.line.me", subject: "U11111111111111111111111111111111", audience: CHANNEL_ID, channelId: CHANNEL_ID, nonce: "nonce-value" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.input).toBe("https://api.line.me/oauth2/v2.1/verify");
    expect(calls[0]?.init?.method).toBe("POST");
    expect((calls[0]?.init?.body as URLSearchParams).get("id_token")).toBe("id-token");
    expect((calls[0]?.init?.body as URLSearchParams).get("client_id")).toBe(CHANNEL_ID);
    expect((calls[0]?.init?.body as URLSearchParams).get("nonce")).toBe("nonce-value");
  });

  it("verifies access-token validity and fetches the user subject from the server-side profile API", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const provider = new HttpLineIdentityProvider({
      clock: () => NOW,
      fetchImpl: async (input, init) => {
        calls.push({ input, init });
        return calls.length === 1 ? response({ client_id: CHANNEL_ID, expires_in: 120 }) : response({ userId: "U22222222222222222222222222222222" });
      },
    });
    const claims = await provider.verifyAccessToken({ token: "access-token", channelId: CHANNEL_ID });
    const nowSeconds = Math.floor(NOW.getTime() / 1000);
    expect(claims).toMatchObject({ issuer: "https://access.line.me", subject: "U22222222222222222222222222222222", audience: CHANNEL_ID, channelId: CHANNEL_ID, exp: nowSeconds + 120, iat: nowSeconds });
    expect(String(calls[0]?.input)).toContain("access_token=access-token");
    expect(calls[1]?.input).toBe("https://api.line.me/v2/profile");
    expect(calls[1]?.init?.headers).toMatchObject({ authorization: "Bearer access-token" });
  });

  it("fails closed on provider errors and channel mismatch without reading a profile", async () => {
    let profileCalls = 0;
    const provider = new HttpLineIdentityProvider({
      fetchImpl: async (input, init) => {
        if (init?.method === "GET" && String(input) === "https://api.line.me/v2/profile") profileCalls += 1;
        return response({ client_id: "9999999999", expires_in: 120 });
      },
    });
    await expect(provider.verifyAccessToken({ token: "token", channelId: CHANNEL_ID })).rejects.toThrowError(/channel mismatch/);
    expect(profileCalls).toBe(0);
    const failing = new HttpLineIdentityProvider({ fetchImpl: async () => response({ error: "invalid" }, 400) });
    await expect(failing.verifyIdToken({ token: "token", channelId: CHANNEL_ID })).rejects.toThrowError(/verification failed/);
  });
});
