import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { createCsrfToken, verifyCsrfToken } from "@citychatbot/security/csrf";
import { buildSessionCookieOptions, type CookieEnvironment } from "@citychatbot/security/cookies";

import { LINE_ISSUER, LIFF_SESSION_COOKIE_NAME, type LiffAppConfig, type LineTokenClaims, type SessionContext, type SessionCookie } from "./liff";

const VERSION = "v1" as const;
const MIN_SECRET_BYTES = 32;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export type ProductionLiffSessionClaims = {
  version: typeof VERSION;
  sessionId: string;
  tenantId: string;
  liffAppId: string;
  channelId: string;
  lineUserId: string;
  expiresAt: number;
  consentVersion?: string;
};

export type IssuedProductionLiffSession = {
  claims: ProductionLiffSessionClaims;
  sessionCookie: SessionCookie;
  csrfToken: string;
};

const secretKey = (secret: string): Buffer => {
  const key = Buffer.from(secret, "utf8");
  if (key.byteLength < MIN_SECRET_BYTES) throw new Error("LIFF session secret must be at least 32 bytes");
  return key;
};

const sign = (payload: string, secret: string): string => createHmac("sha256", secretKey(secret)).update(`${VERSION}.${payload}`).digest("base64url");

const encode = (value: unknown): string => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

const decode = (value: string): unknown => JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;

const assertClaims = (value: unknown): ProductionLiffSessionClaims => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("LIFF session claims are invalid");
  const claims = value as Partial<ProductionLiffSessionClaims>;
  if (
    claims.version !== VERSION
    || typeof claims.sessionId !== "string"
    || !IDENTIFIER_PATTERN.test(claims.sessionId)
    || typeof claims.tenantId !== "string"
    || !UUID_PATTERN.test(claims.tenantId)
    || typeof claims.liffAppId !== "string"
    || !IDENTIFIER_PATTERN.test(claims.liffAppId)
    || typeof claims.channelId !== "string"
    || !IDENTIFIER_PATTERN.test(claims.channelId)
    || typeof claims.lineUserId !== "string"
    || !IDENTIFIER_PATTERN.test(claims.lineUserId)
    || typeof claims.expiresAt !== "number"
    || !Number.isSafeInteger(claims.expiresAt)
    || (claims.consentVersion !== undefined && (typeof claims.consentVersion !== "string" || claims.consentVersion.length > 128))
  ) throw new Error("LIFF session claims are invalid");
  return { ...claims, version: VERSION } as ProductionLiffSessionClaims;
};

const toContext = (claims: ProductionLiffSessionClaims): SessionContext => ({
  sessionId: claims.sessionId,
  tenantId: claims.tenantId,
  liffAppId: claims.liffAppId,
  channelId: claims.channelId,
  lineUserId: claims.lineUserId,
  expiresAt: new Date(claims.expiresAt * 1000),
  ...(claims.consentVersion ? { consentVersion: claims.consentVersion } : {}),
});

export const issueProductionLiffSession = (input: {
  context: SessionContext;
  sessionSecret: string;
  csrfSecret: string;
  environment?: CookieEnvironment;
  now?: Date;
}): IssuedProductionLiffSession => {
  const now = input.now ?? new Date();
  const expiresAt = Math.floor(input.context.expiresAt.getTime() / 1000);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds) throw new Error("LIFF session expiry is invalid");
  const claims: ProductionLiffSessionClaims = {
    version: VERSION,
    sessionId: input.context.sessionId,
    tenantId: input.context.tenantId,
    liffAppId: input.context.liffAppId,
    channelId: input.context.channelId,
    lineUserId: input.context.lineUserId,
    expiresAt,
    ...(input.context.consentVersion ? { consentVersion: input.context.consentVersion } : {}),
  };
  const payload = encode(claims);
  const value = `${VERSION}.${payload}.${sign(payload, input.sessionSecret)}`;
  const csrfKey = csrfSecretForSession(input.csrfSecret, claims.sessionId);
  return {
    claims,
    sessionCookie: {
      name: LIFF_SESSION_COOKIE_NAME,
      value,
      options: buildSessionCookieOptions(input.environment ?? "production", Math.max(1, expiresAt - nowSeconds)),
    },
    csrfToken: createCsrfToken(csrfKey),
  };
};

export const decodeProductionLiffSession = (value: string | undefined, sessionSecret: string, now = new Date()): ProductionLiffSessionClaims | undefined => {
  if (!value) return undefined;
  const [version, payload, signature, ...extra] = value.split(".");
  if (version !== VERSION || !payload || !signature || extra.length > 0 || payload.length > 4096 || signature.length !== 43) return undefined;
  try {
    const expected = Buffer.from(sign(payload, sessionSecret), "utf8");
    const actual = Buffer.from(signature, "utf8");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
    const claims = assertClaims(decode(payload));
    if (claims.expiresAt <= Math.floor(now.getTime() / 1000)) return undefined;
    return claims;
  } catch {
    return undefined;
  }
};

export const csrfSecretForSession = (csrfSecret: string, sessionId: string): string =>
  createHmac("sha256", secretKey(csrfSecret)).update(`liff-csrf:${sessionId}`).digest("hex");

export const verifyProductionLiffCsrf = (input: { csrfToken: string | undefined; csrfSecret: string; sessionId: string }): boolean =>
  Boolean(input.csrfToken) && verifyCsrfToken(input.csrfToken!, csrfSecretForSession(input.csrfSecret, input.sessionId));

export const productionLiffContextFromClaims = toContext;

export const createOpaqueLiffSessionId = (): string => randomBytes(24).toString("base64url");

const sameAudience = (audience: string | readonly string[], expected: string): boolean =>
  Array.isArray(audience) ? audience.includes(expected) : audience === expected;

export const validateProductionLineClaims = (input: {
  claims: LineTokenClaims;
  config: Pick<LiffAppConfig, "channelId">;
  tokenKind: "id_token" | "access_token";
  now?: Date;
  expectedNonce?: string;
}): { lineUserId: string; expiresAt: Date; issuedAt?: Date } => {
  const now = input.now ?? new Date();
  const nowSeconds = Math.floor(now.getTime() / 1000);
  const claims = input.claims;
  const validTimes = Number.isSafeInteger(claims.exp)
    && claims.exp > nowSeconds
    && (claims.iat === undefined || (Number.isSafeInteger(claims.iat) && claims.iat <= nowSeconds + 60));
  const validNonce = input.tokenKind !== "id_token" || input.expectedNonce === undefined || claims.nonce === input.expectedNonce;
  if (
    claims.issuer !== LINE_ISSUER
    || claims.channelId !== input.config.channelId
    || !sameAudience(claims.audience, input.config.channelId)
    || !validTimes
    || !validNonce
    || typeof claims.subject !== "string"
    || !/^U[0-9a-fA-F]{8,64}$/.test(claims.subject)
  ) throw new Error("LIFF token could not be verified");
  return {
    lineUserId: claims.subject,
    expiresAt: new Date(claims.exp * 1000),
    ...(claims.iat === undefined ? {} : { issuedAt: new Date(claims.iat * 1000) }),
  };
};
