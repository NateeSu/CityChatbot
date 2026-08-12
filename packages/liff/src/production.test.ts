import { describe, expect, it } from "vitest";

import { decodeProductionLiffSession, issueProductionLiffSession, validateProductionLineClaims, verifyProductionLiffCsrf } from "./production";

const NOW = new Date("2026-08-12T08:00:00.000Z");
const SESSION_SECRET = "production-session-secret-with-at-least-32-bytes";
const CSRF_SECRET = "production-csrf-secret-with-at-least-32-bytes";

describe("stateless production LIFF session", () => {
  it("issues a verifiable cookie and a session-bound CSRF token", () => {
    const issued = issueProductionLiffSession({
      context: {
        sessionId: "opaque-session-1",
        tenantId: "e3371764-7456-4927-8c96-7e12644350ee",
        liffAppId: "2011079856-gKTrdPNA",
        channelId: "2011079856",
        lineUserId: "U1234567890abcdef",
        expiresAt: new Date(NOW.getTime() + 300_000),
        consentVersion: "privacy-2026-08",
      },
      sessionSecret: SESSION_SECRET,
      csrfSecret: CSRF_SECRET,
      environment: "production",
      now: NOW,
    });

    expect(decodeProductionLiffSession(issued.sessionCookie.value, SESSION_SECRET, NOW)).toMatchObject({
      tenantId: "e3371764-7456-4927-8c96-7e12644350ee",
      liffAppId: "2011079856-gKTrdPNA",
      lineUserId: "U1234567890abcdef",
    });
    expect(verifyProductionLiffCsrf({ csrfToken: issued.csrfToken, csrfSecret: CSRF_SECRET, sessionId: "opaque-session-1" })).toBe(true);
    expect(verifyProductionLiffCsrf({ csrfToken: `${issued.csrfToken}x`, csrfSecret: CSRF_SECRET, sessionId: "opaque-session-1" })).toBe(false);
  });

  it("rejects tampered and expired cookies without a server-side session map", () => {
    const issued = issueProductionLiffSession({
      context: {
        sessionId: "opaque-session-2",
        tenantId: "e3371764-7456-4927-8c96-7e12644350ee",
        liffAppId: "2011079856-gKTrdPNA",
        channelId: "2011079856",
        lineUserId: "U1234567890abcdef",
        expiresAt: new Date(NOW.getTime() + 60_000),
      },
      sessionSecret: SESSION_SECRET,
      csrfSecret: CSRF_SECRET,
      now: NOW,
    });
    expect(decodeProductionLiffSession(`${issued.sessionCookie.value}x`, SESSION_SECRET, NOW)).toBeUndefined();
    expect(decodeProductionLiffSession(issued.sessionCookie.value, SESSION_SECRET, new Date(NOW.getTime() + 61_000))).toBeUndefined();
  });

  it("accepts only verified LINE claims for the configured channel", () => {
    expect(validateProductionLineClaims({
      claims: {
        issuer: "https://access.line.me",
        subject: "U1234567890abcdef",
        audience: "2011079856",
        channelId: "2011079856",
        exp: Math.floor(NOW.getTime() / 1000) + 300,
        iat: Math.floor(NOW.getTime() / 1000),
      },
      config: { channelId: "2011079856" },
      tokenKind: "id_token",
      now: NOW,
    }).lineUserId).toBe("U1234567890abcdef");
    expect(() => validateProductionLineClaims({
      claims: {
        issuer: "https://access.line.me",
        subject: "U1234567890abcdef",
        audience: "wrong-channel",
        channelId: "wrong-channel",
        exp: Math.floor(NOW.getTime() / 1000) + 300,
      },
      config: { channelId: "2011079856" },
      tokenKind: "access_token",
      now: NOW,
    })).toThrow("LIFF token could not be verified");
    expect(() => validateProductionLineClaims({
      claims: {
        issuer: "https://access.line.me",
        subject: "U1234567890abcdef-not-a-line-id",
        audience: "2011079856",
        channelId: "2011079856",
        exp: Math.floor(NOW.getTime() / 1000) + 300,
      },
      config: { channelId: "2011079856" },
      tokenKind: "access_token",
      now: NOW,
    })).toThrow("LIFF token could not be verified");
  });
});
