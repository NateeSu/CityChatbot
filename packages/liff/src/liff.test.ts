import { describe, expect, it } from "vitest";

import {
  InMemoryConsentEventStore,
  InMemoryLiffConfigRegistry,
  InMemoryLineUserStore,
  LINE_AUTHORIZATION_ENDPOINT,
  LiffIdentityError,
  LiffSessionService,
  type LiffAppConfig,
  type LineIdentityProvider,
  type LineTokenClaims,
} from "./liff";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const LIFF_A = "liff-app-a";
const LIFF_B = "liff-app-b";
const CHANNEL_A = "1234567890";
const CHANNEL_B = "9876543210";
const LINE_USER_A = "U11111111111111111111111111111111";
const LINE_USER_B = "U22222222222222222222222222222222";
const SESSION_SECRET = "session-secret-with-at-least-32-bytes-for-tests";
const CSRF_SECRET = "csrf-secret-with-at-least-32-bytes-for-tests";
const NOW = new Date("2026-08-10T00:00:00.000Z");

const config = (overrides: Partial<LiffAppConfig> = {}): LiffAppConfig => ({
  liffAppId: LIFF_A,
  tenantId: TENANT_A,
  channelId: CHANNEL_A,
  callbackUrl: "https://city.example/api/v1/liff/callback",
  allowedReturnUrls: ["https://city.example/liff/home", "https://city.example/liff/complaints"],
  ...overrides,
});

class FakeLineIdentityProvider implements LineIdentityProvider {
  claims: LineTokenClaims = {
    issuer: "https://access.line.me",
    subject: LINE_USER_A,
    audience: CHANNEL_A,
    channelId: CHANNEL_A,
    exp: Math.floor(NOW.getTime() / 1000) + 300,
    iat: Math.floor(NOW.getTime() / 1000),
  };
  idTokenCalls: Array<{ token: string; channelId: string; nonce?: string }> = [];
  accessTokenCalls: Array<{ token: string; channelId: string }> = [];
  error?: Error;

  async verifyIdToken(input: { token: string; channelId: string; nonce?: string }): Promise<LineTokenClaims> {
    this.idTokenCalls.push(input);
    if (this.error) throw this.error;
    return { ...this.claims };
  }

  async verifyAccessToken(input: { token: string; channelId: string }): Promise<LineTokenClaims> {
    this.accessTokenCalls.push(input);
    if (this.error) throw this.error;
    return { ...this.claims };
  }
}

const makeService = (inputConfig = config()) => {
  const configs = new InMemoryLiffConfigRegistry();
  configs.register(inputConfig);
  const provider = new FakeLineIdentityProvider();
  const users = new InMemoryLineUserStore();
  const consents = new InMemoryConsentEventStore();
  const service = new LiffSessionService({
    configs,
    identityProvider: provider,
    sessionSecret: SESSION_SECRET,
    csrfSecret: CSRF_SECRET,
    userStore: users,
    consentStore: consents,
    environment: "production",
    clock: () => NOW,
  });
  return { service, provider, users, consents };
};

describe("LIFF server-side identity and session", () => {
  it("creates a secure external login redirect with state, nonce and an exact return allowlist", () => {
    const { service } = makeService();
    const redirect = service.beginExternalLogin({ liffAppId: LIFF_A, returnUrl: "https://city.example/liff/home" });
    const url = new URL(redirect.authorizationUrl);
    expect(url.origin + url.pathname).toBe(LINE_AUTHORIZATION_ENDPOINT);
    expect(url.searchParams.get("client_id")).toBe(CHANNEL_A);
    expect(url.searchParams.get("redirect_uri")).toBe("https://city.example/api/v1/liff/callback");
    expect(url.searchParams.get("state")).toBe(redirect.state);
    expect(url.searchParams.get("nonce")).toBe(redirect.nonce);
    expect(redirect.returnUrl).toBe("https://city.example/liff/home");
    expect(() => service.beginExternalLogin({ liffAppId: LIFF_A, returnUrl: "https://attacker.example/steal" })).toThrowError(/FORBIDDEN/);
  });

  it("verifies the provider token, binds the configured tenant and issues a short secure session", async () => {
    const { service, provider, users } = makeService();
    const redirect = service.beginExternalLogin({ liffAppId: LIFF_A, returnUrl: "https://city.example/liff/home" });
    provider.claims.nonce = redirect.nonce;
    const result = await service.createSession({ liffAppId: LIFF_A, token: "id-token-value", tokenKind: "id_token", state: redirect.state });
    expect(provider.idTokenCalls).toMatchObject([{ token: "id-token-value", channelId: CHANNEL_A, nonce: redirect.nonce }]);
    expect(result.context).toMatchObject({ tenantId: TENANT_A, liffAppId: LIFF_A, channelId: CHANNEL_A, lineUserId: LINE_USER_A });
    expect(result.returnUrl).toBe("https://city.example/liff/home");
    expect(result.sessionCookie.options).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 300 });
    expect(service.resolveSession(result.sessionCookie.value)).toMatchObject({ ok: true, context: { tenantId: TENANT_A, lineUserId: LINE_USER_A } });
    expect(users.get(TENANT_A, LINE_USER_A, CHANNEL_A)).toMatchObject({ tenantId: TENANT_A, lineUserId: LINE_USER_A, channelId: CHANNEL_A });
  });

  it("rejects issuer, audience, channel, expiry, future-issued and nonce mismatches", async () => {
    const cases: Array<Partial<LineTokenClaims>> = [
      { issuer: "https://evil.example" },
      { audience: "9999999999" },
      { channelId: CHANNEL_B },
      { exp: Math.floor(NOW.getTime() / 1000) - 1 },
      { iat: Math.floor(NOW.getTime() / 1000) + 61 },
      { nonce: "wrong-nonce" },
    ];
    for (const changes of cases) {
      const { service, provider } = makeService();
      const redirect = service.beginExternalLogin({ liffAppId: LIFF_A, returnUrl: "https://city.example/liff/home" });
      provider.claims = { ...provider.claims, ...changes, nonce: changes.nonce ?? redirect.nonce };
      await expect(service.createSession({ liffAppId: LIFF_A, token: "token", tokenKind: "id_token", state: redirect.state })).rejects.toThrowError(/UNAUTHENTICATED/);
    }
  });

  it("consumes state once and does not allow state to be transferred to another LIFF app", async () => {
    const configs = new InMemoryLiffConfigRegistry();
    configs.register(config());
    configs.register(config({ liffAppId: LIFF_B, tenantId: TENANT_B, channelId: CHANNEL_B, allowedReturnUrls: ["https://other.example/liff/home"], callbackUrl: "https://other.example/api/v1/liff/callback" }));
    const provider = new FakeLineIdentityProvider();
    const service = new LiffSessionService({ configs, identityProvider: provider, sessionSecret: SESSION_SECRET, csrfSecret: CSRF_SECRET, environment: "test", clock: () => NOW });
    const redirect = service.beginExternalLogin({ liffAppId: LIFF_A, returnUrl: "https://city.example/liff/home" });
    provider.claims.nonce = redirect.nonce;
    await service.createSession({ liffAppId: LIFF_A, token: "token", tokenKind: "id_token", state: redirect.state });
    await expect(service.createSession({ liffAppId: LIFF_A, token: "token", tokenKind: "id_token", state: redirect.state })).rejects.toThrowError(/UNAUTHENTICATED/);
    const other = service.beginExternalLogin({ liffAppId: LIFF_B, returnUrl: "https://other.example/liff/home" });
    await expect(service.createSession({ liffAppId: LIFF_A, token: "token", tokenKind: "id_token", state: other.state })).rejects.toThrowError(/UNAUTHENTICATED/);
  });

  it("does not use a browser-supplied profile and only upserts the verified subject", async () => {
    const { service, users, provider } = makeService();
    const input = { liffAppId: LIFF_A, token: "token", tokenKind: "id_token" as const, profile: { userId: "U-attacker", displayName: "Attacker" } };
    const result = await service.createSession(input as typeof input & { profile: unknown });
    expect(result.context.lineUserId).toBe(LINE_USER_A);
    expect(users.get(TENANT_A, "U-attacker")).toBeUndefined();
    expect(provider.idTokenCalls).toHaveLength(1);
  });

  it("keeps the line-user store and session tenant scoped", async () => {
    const configs = new InMemoryLiffConfigRegistry();
    configs.register(config());
    configs.register(config({ liffAppId: LIFF_B, tenantId: TENANT_B, channelId: CHANNEL_B, allowedReturnUrls: ["https://other.example/liff/home"], callbackUrl: "https://other.example/api/v1/liff/callback" }));
    const provider = new FakeLineIdentityProvider();
    const users = new InMemoryLineUserStore();
    const service = new LiffSessionService({ configs, identityProvider: provider, userStore: users, sessionSecret: SESSION_SECRET, csrfSecret: CSRF_SECRET, environment: "test", clock: () => NOW });
    const a = await service.createSession({ liffAppId: LIFF_A, token: "token-a", tokenKind: "access_token" });
    provider.claims = { ...provider.claims, channelId: CHANNEL_B, audience: [CHANNEL_B], subject: LINE_USER_B };
    const b = await service.createSession({ liffAppId: LIFF_B, token: "token-b", tokenKind: "access_token" });
    expect(a.context.tenantId).toBe(TENANT_A);
    expect(b.context.tenantId).toBe(TENANT_B);
    expect(users.get(TENANT_A, LINE_USER_B)).toBeUndefined();
    expect(users.get(TENANT_B, LINE_USER_B, CHANNEL_B)).toBeDefined();
    expect(service.resolveSession(`${a.sessionCookie.value.slice(0, -1)}x`)).toMatchObject({ ok: false, reason: "INVALID_COOKIE", loginRequired: true });
  });

  it("binds CSRF tokens to the session and rejects tampering or cross-session reuse", async () => {
    const { service } = makeService();
    const first = await service.createSession({ liffAppId: LIFF_A, token: "token-a", tokenKind: "id_token" });
    expect(service.verifyCsrfTokenForSession(first.sessionCookie.value, first.csrfToken)).toBe(true);
    expect(service.verifyCsrfTokenForSession(first.sessionCookie.value, `${first.csrfToken}x`)).toBe(false);
    const second = await service.createSession({ liffAppId: LIFF_A, token: "token-b", tokenKind: "id_token" });
    expect(service.verifyCsrfTokenForSession(second.sessionCookie.value, first.csrfToken)).toBe(false);
    expect(service.createCsrfTokenForSession(first.sessionCookie.value)).toMatch(/\./);
  });

  it("requires and audits the configured consent version", async () => {
    const { service, consents } = makeService({ ...config(), requiredConsentVersion: "privacy-2026-01" });
    await expect(service.createSession({ liffAppId: LIFF_A, token: "token", tokenKind: "id_token" })).rejects.toThrowError(/consent/);
    const result = await service.createSession({ liffAppId: LIFF_A, token: "token", tokenKind: "id_token", consent: { version: "privacy-2026-01", accepted: true } });
    expect(result.context.consentVersion).toBe("privacy-2026-01");
    expect(consents.list(TENANT_A, LINE_USER_A)).toMatchObject([{ tenantId: TENANT_A, lineUserId: LINE_USER_A, version: "privacy-2026-01", accepted: true, channel: "LIFF" }]);
  });

  it("supports access-token verification and keeps provider failure details out of errors", async () => {
    const { service, provider } = makeService();
    const result = await service.createSession({ liffAppId: LIFF_A, token: "access-token", tokenKind: "access_token" });
    expect(result.context.lineUserId).toBe(LINE_USER_A);
    expect(provider.accessTokenCalls).toMatchObject([{ token: "access-token", channelId: CHANNEL_A }]);
    provider.error = new Error("provider secret=do-not-disclose");
    await expect(service.createSession({ liffAppId: LIFF_A, token: "expired", tokenKind: "access_token" })).rejects.toThrowError("LIFF token could not be verified");
  });

  it("expires sessions, requires a fresh LINE token and rotates the cookie on refresh", async () => {
    const { service, provider, users } = makeService({ ...config(), sessionTtlSeconds: 120 });
    const initial = await service.createSession({ liffAppId: LIFF_A, token: "token", tokenKind: "id_token", now: NOW });
    expect(service.resolveSession(initial.sessionCookie.value, new Date(NOW.getTime() + 120_000))).toMatchObject({ ok: false, reason: "EXPIRED_SESSION", loginRequired: true, liffAppId: LIFF_A });
    const active = await service.createSession({ liffAppId: LIFF_A, token: "token-2", tokenKind: "id_token", now: NOW });
    const refreshed = await service.refreshSession({ sessionCookie: active.sessionCookie.value, token: "token-3", tokenKind: "id_token", now: new Date(NOW.getTime() + 30_000) });
    expect(refreshed.sessionCookie.value).not.toBe(active.sessionCookie.value);
    expect(service.resolveSession(active.sessionCookie.value)).toMatchObject({ ok: false, reason: "INVALID_COOKIE" });
    expect(service.resolveSession(refreshed.sessionCookie.value)).toMatchObject({ ok: true, context: { tenantId: TENANT_A, lineUserId: LINE_USER_A } });
    provider.claims = { ...provider.claims, subject: LINE_USER_B };
    await expect(service.refreshSession({ sessionCookie: refreshed.sessionCookie.value, token: "wrong-user", tokenKind: "id_token" })).rejects.toThrowError(/UNAUTHENTICATED/);
    expect(users.get(TENANT_A, LINE_USER_B)).toBeUndefined();
  });
});
