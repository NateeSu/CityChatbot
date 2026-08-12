import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

import { createCsrfToken, verifyCsrfToken } from "@citychatbot/security/csrf";
import { buildSessionCookieOptions, type CookieEnvironment } from "@citychatbot/security/cookies";

export const LINE_ISSUER = "https://access.line.me";
export const LINE_AUTHORIZATION_ENDPOINT = "https://access.line.me/oauth2/v2.1/authorize";
export const LIFF_SESSION_COOKIE_NAME = "citychatbot_liff_session";

export type LiffErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "FEATURE_DISABLED"
  | "DEPENDENCY_NOT_READY";

export class LiffIdentityError extends Error {
  constructor(public readonly code: LiffErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "LiffIdentityError";
  }
}

export type LiffAppConfig = {
  liffAppId: string;
  tenantId: string;
  channelId: string;
  callbackUrl: string;
  allowedReturnUrls: readonly string[];
  enabled?: boolean;
  requiredConsentVersion?: string;
  sessionTtlSeconds?: number;
};

export type LiffConfigResolver = {
  get(liffAppId: string): LiffAppConfig | undefined;
};

export type LineTokenClaims = {
  issuer: string;
  subject: string;
  audience: string | readonly string[];
  channelId: string;
  exp: number;
  iat?: number;
  nonce?: string;
};

export type LineIdentityProvider = {
  verifyIdToken(input: { token: string; channelId: string; nonce?: string }): Promise<LineTokenClaims>;
  verifyAccessToken(input: { token: string; channelId: string }): Promise<LineTokenClaims>;
};

export type VerifiedLineIdentity = {
  lineUserId: string;
  channelId: string;
  tokenKind: "id_token" | "access_token";
  expiresAt: Date;
  issuedAt?: Date;
};

export type LineUserRecord = {
  id: string;
  tenantId: string;
  lineUserId: string;
  channelId: string;
  firstVerifiedAt: string;
  lastVerifiedAt: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type LineUserStore = {
  upsert(input: { tenantId: string; lineUserId: string; channelId: string; verifiedAt: Date }): LineUserRecord;
  get(tenantId: string, lineUserId: string, channelId?: string): LineUserRecord | undefined;
};

export type ConsentInput = {
  version: string;
  accepted: boolean;
};

export type ConsentEvent = {
  id: string;
  tenantId: string;
  lineUserId: string;
  version: string;
  channel: "LIFF";
  accepted: boolean;
  occurredAt: string;
};

export type ConsentEventStore = {
  append(input: Omit<ConsentEvent, "id" | "occurredAt"> & { occurredAt: Date }): ConsentEvent;
  list(tenantId: string, lineUserId: string): readonly ConsentEvent[];
};

export type SessionContext = {
  sessionId: string;
  tenantId: string;
  liffAppId: string;
  channelId: string;
  lineUserId: string;
  expiresAt: Date;
  consentVersion?: string;
};

export type SessionCookie = {
  name: typeof LIFF_SESSION_COOKIE_NAME;
  value: string;
  options: ReturnType<typeof buildSessionCookieOptions>;
};

export type LiffSessionResult = {
  context: SessionContext;
  sessionCookie: SessionCookie;
  csrfToken: string;
  returnUrl?: string;
};

export type LiffSessionResolution =
  | { ok: true; context: SessionContext }
  | {
      ok: false;
      errorCode: "UNAUTHENTICATED";
      reason: "MISSING_COOKIE" | "INVALID_COOKIE" | "EXPIRED_SESSION";
      loginRequired: true;
      liffAppId?: string;
    };

export type ExternalLoginRedirect = {
  authorizationUrl: string;
  state: string;
  nonce: string;
  returnUrl: string;
};

export type CreateLiffSessionInput = {
  liffAppId: string;
  token: string;
  tokenKind: "id_token" | "access_token";
  state?: string;
  consent?: ConsentInput;
  now?: Date;
};

export type RefreshLiffSessionInput = {
  sessionCookie: string;
  token: string;
  tokenKind: "id_token" | "access_token";
  consent?: ConsentInput;
  now?: Date;
};

type PendingLogin = {
  liffAppId: string;
  nonce: string;
  returnUrl: string;
  expiresAt: number;
};

type StoredSession = SessionContext & {
  revokedAt?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const MAX_SESSION_TTL_SECONDS = 15 * 60;
const DEFAULT_SESSION_TTL_SECONDS = 5 * 60;
const STATE_TTL_SECONDS = 5 * 60;
const CLOCK_SKEW_SECONDS = 60;

const cloneConfig = (config: LiffAppConfig): LiffAppConfig => ({
  ...config,
  allowedReturnUrls: [...config.allowedReturnUrls],
});

const requireSecret = (secret: string, name: string): Buffer => {
  const key = Buffer.from(secret, "utf8");
  if (key.length < 32) throw new LiffIdentityError("VALIDATION_ERROR", `${name} must be at least 32 bytes`);
  return key;
};

const assertUuid = (value: string, field: string): void => {
  if (!UUID_PATTERN.test(value)) throw new LiffIdentityError("VALIDATION_ERROR", `${field} must be a UUID`);
};

const assertIdentifier = (value: string, field: string): void => {
  if (!SAFE_IDENTIFIER_PATTERN.test(value) || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new LiffIdentityError("VALIDATION_ERROR", `${field} is invalid`);
  }
};

const normalizeHttpsUrl = (value: string, field: string): string => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new LiffIdentityError("VALIDATION_ERROR", `${field} is invalid`);
  }
  const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.username || parsed.password || (!localHttp && parsed.protocol !== "https:")) {
    throw new LiffIdentityError("VALIDATION_ERROR", `${field} must use an allowed HTTPS URL`);
  }
  return parsed.toString();
};

const normalizeConfig = (input: LiffAppConfig): LiffAppConfig => {
  assertIdentifier(input.liffAppId, "liffAppId");
  assertUuid(input.tenantId, "tenantId");
  assertIdentifier(input.channelId, "channelId");
  const allowedReturnUrls = [...input.allowedReturnUrls].map((url) => normalizeHttpsUrl(url, "allowedReturnUrl"));
  if (allowedReturnUrls.length === 0 || new Set(allowedReturnUrls).size !== allowedReturnUrls.length) {
    throw new LiffIdentityError("VALIDATION_ERROR", "at least one unique return URL is required");
  }
  const sessionTtlSeconds = input.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  if (!Number.isSafeInteger(sessionTtlSeconds) || sessionTtlSeconds <= 0 || sessionTtlSeconds > MAX_SESSION_TTL_SECONDS) {
    throw new LiffIdentityError("VALIDATION_ERROR", "LIFF session TTL must be short and bounded");
  }
  if (input.requiredConsentVersion !== undefined && !input.requiredConsentVersion.trim()) {
    throw new LiffIdentityError("VALIDATION_ERROR", "required consent version is invalid");
  }
  return {
    ...input,
    callbackUrl: normalizeHttpsUrl(input.callbackUrl, "callbackUrl"),
    allowedReturnUrls,
    sessionTtlSeconds,
  };
};

export class InMemoryLiffConfigRegistry implements LiffConfigResolver {
  private readonly configs = new Map<string, LiffAppConfig>();

  register(config: LiffAppConfig): void {
    const normalized = normalizeConfig(config);
    if (this.configs.has(normalized.liffAppId)) throw new LiffIdentityError("CONFLICT", "LIFF app is already registered");
    this.configs.set(normalized.liffAppId, normalized);
  }

  get(liffAppId: string): LiffAppConfig | undefined {
    const config = this.configs.get(liffAppId);
    return config ? cloneConfig(config) : undefined;
  }
}

export class InMemoryLineUserStore implements LineUserStore {
  private readonly users = new Map<string, LineUserRecord>();

  upsert(input: { tenantId: string; lineUserId: string; channelId: string; verifiedAt: Date }): LineUserRecord {
    assertUuid(input.tenantId, "tenantId");
    assertIdentifier(input.lineUserId, "lineUserId");
    assertIdentifier(input.channelId, "channelId");
    const now = input.verifiedAt.toISOString();
    const key = `${input.tenantId}:${input.channelId}:${input.lineUserId}`;
    const existing = this.users.get(key);
    if (existing) {
      const updated = { ...existing, lastVerifiedAt: now, updatedAt: now, rowVersion: existing.rowVersion + 1 };
      this.users.set(key, updated);
      return { ...updated };
    }
    const created: LineUserRecord = {
      id: randomUUID(),
      tenantId: input.tenantId,
      lineUserId: input.lineUserId,
      channelId: input.channelId,
      firstVerifiedAt: now,
      lastVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
      rowVersion: 1,
    };
    this.users.set(key, created);
    return { ...created };
  }

  get(tenantId: string, lineUserId: string, channelId?: string): LineUserRecord | undefined {
    for (const user of this.users.values()) {
      if (user.tenantId === tenantId && user.lineUserId === lineUserId && (channelId === undefined || user.channelId === channelId)) {
        return { ...user };
      }
    }
    return undefined;
  }
}

export class InMemoryConsentEventStore implements ConsentEventStore {
  private readonly events: ConsentEvent[] = [];

  append(input: Omit<ConsentEvent, "id" | "occurredAt"> & { occurredAt: Date }): ConsentEvent {
    if (!input.version.trim()) throw new LiffIdentityError("VALIDATION_ERROR", "consent version is required");
    const event: ConsentEvent = {
      ...input,
      id: randomUUID(),
      occurredAt: input.occurredAt.toISOString(),
    };
    this.events.push(event);
    return { ...event };
  }

  list(tenantId: string, lineUserId: string): readonly ConsentEvent[] {
    return this.events.filter((event) => event.tenantId === tenantId && event.lineUserId === lineUserId).map((event) => ({ ...event }));
  }
}

type LiffSessionServiceOptions = {
  configs: LiffConfigResolver;
  identityProvider: LineIdentityProvider;
  sessionSecret: string;
  csrfSecret: string;
  userStore?: LineUserStore;
  consentStore?: ConsentEventStore;
  environment?: CookieEnvironment;
  clock?: () => Date;
};

const signedValue = (value: string, secret: Buffer): string => createHmac("sha256", secret).update(value).digest("base64url");

const hashState = (state: string, secret: Buffer): string => createHmac("sha256", secret).update(`liff-state:${state}`).digest("hex");

const randomOpaqueValue = (): string => randomBytes(32).toString("base64url");

const sameAudience = (audience: string | readonly string[], expected: string): boolean => Array.isArray(audience) ? audience.includes(expected) : audience === expected;

const genericTokenError = (): LiffIdentityError => new LiffIdentityError("UNAUTHENTICATED", "LIFF token could not be verified");

export class LiffSessionService {
  private readonly configs: LiffConfigResolver;
  private readonly identityProvider: LineIdentityProvider;
  private readonly sessionSecret: Buffer;
  private readonly csrfSecret: Buffer;
  private readonly userStore: LineUserStore;
  private readonly consentStore: ConsentEventStore;
  private readonly environment: CookieEnvironment;
  private readonly clock: () => Date;
  private readonly pendingLogins = new Map<string, PendingLogin>();
  private readonly sessions = new Map<string, StoredSession>();

  constructor(options: LiffSessionServiceOptions) {
    this.configs = options.configs;
    this.identityProvider = options.identityProvider;
    this.sessionSecret = requireSecret(options.sessionSecret, "session secret");
    this.csrfSecret = requireSecret(options.csrfSecret, "CSRF secret");
    this.userStore = options.userStore ?? new InMemoryLineUserStore();
    this.consentStore = options.consentStore ?? new InMemoryConsentEventStore();
    this.environment = options.environment ?? "production";
    this.clock = options.clock ?? (() => new Date());
  }

  beginExternalLogin(input: { liffAppId: string; returnUrl: string; now?: Date }): ExternalLoginRedirect {
    const config = this.requireConfig(input.liffAppId);
    const returnUrl = this.assertAllowedReturnUrl(config, input.returnUrl);
    const now = input.now ?? this.clock();
    this.removeExpiredPendingLogins(now);
    const state = randomOpaqueValue();
    const nonce = randomOpaqueValue();
    this.pendingLogins.set(hashState(state, this.sessionSecret), {
      liffAppId: config.liffAppId,
      nonce,
      returnUrl,
      expiresAt: now.getTime() + STATE_TTL_SECONDS * 1000,
    });
    const authorizationUrl = new URL(LINE_AUTHORIZATION_ENDPOINT);
    authorizationUrl.searchParams.set("response_type", "code");
    authorizationUrl.searchParams.set("client_id", config.channelId);
    authorizationUrl.searchParams.set("redirect_uri", config.callbackUrl);
    authorizationUrl.searchParams.set("state", state);
    authorizationUrl.searchParams.set("nonce", nonce);
    authorizationUrl.searchParams.set("scope", "openid profile");
    return { authorizationUrl: authorizationUrl.toString(), state, nonce, returnUrl };
  }

  async createSession(input: CreateLiffSessionInput): Promise<LiffSessionResult> {
    return this.createSessionInternal(input);
  }

  private async createSessionInternal(
    input: CreateLiffSessionInput,
    expectedIdentity?: { tenantId: string; lineUserId: string },
  ): Promise<LiffSessionResult> {
    const now = input.now ?? this.clock();
    const config = this.requireConfig(input.liffAppId);
    this.assertEnabled(config);
    const pendingLogin = input.state ? this.consumePendingLogin(input.state, config.liffAppId, now) : undefined;
    const claims = await this.verifyWithProvider(input, config, pendingLogin?.nonce);
    const identity = this.verifyClaims(claims, config, input.tokenKind, pendingLogin?.nonce, now);
    if (expectedIdentity && (expectedIdentity.tenantId !== config.tenantId || expectedIdentity.lineUserId !== identity.lineUserId)) {
      throw new LiffIdentityError("UNAUTHENTICATED", "LIFF token does not match the active session");
    }
    const consentVersion = this.validateConsent(config, input.consent);
    this.userStore.upsert({ tenantId: config.tenantId, lineUserId: identity.lineUserId, channelId: config.channelId, verifiedAt: now });
    if (input.consent) {
      this.consentStore.append({
        tenantId: config.tenantId,
        lineUserId: identity.lineUserId,
        version: input.consent.version,
        channel: "LIFF",
        accepted: input.consent.accepted,
        occurredAt: now,
      });
    }
    const issued = this.issueSession(config, identity, consentVersion, now);
    return { ...issued, ...(pendingLogin ? { returnUrl: pendingLogin.returnUrl } : {}) };
  }

  async refreshSession(input: RefreshLiffSessionInput): Promise<LiffSessionResult> {
    const now = input.now ?? this.clock();
    const current = this.resolveSession(input.sessionCookie, now);
    if (!current.ok) throw new LiffIdentityError("UNAUTHENTICATED", "LIFF session is not active");
    const consent = input.consent ?? (current.context.consentVersion ? { version: current.context.consentVersion, accepted: true } : undefined);
    const refreshed = await this.createSessionInternal(
      { liffAppId: current.context.liffAppId, token: input.token, tokenKind: input.tokenKind, consent, now },
      { tenantId: current.context.tenantId, lineUserId: current.context.lineUserId },
    );
    this.sessions.delete(current.context.sessionId);
    return refreshed;
  }

  resolveSession(cookieValue: string | undefined, now = this.clock()): LiffSessionResolution {
    if (!cookieValue) return { ok: false, errorCode: "UNAUTHENTICATED", reason: "MISSING_COOKIE", loginRequired: true };
    const sessionId = this.decodeSessionCookie(cookieValue);
    if (!sessionId) return { ok: false, errorCode: "UNAUTHENTICATED", reason: "INVALID_COOKIE", loginRequired: true };
    const session = this.sessions.get(sessionId);
    if (!session) return { ok: false, errorCode: "UNAUTHENTICATED", reason: "INVALID_COOKIE", loginRequired: true };
    if (session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
      this.sessions.delete(sessionId);
      return { ok: false, errorCode: "UNAUTHENTICATED", reason: "EXPIRED_SESSION", loginRequired: true, liffAppId: session.liffAppId };
    }
    return { ok: true, context: this.cloneContext(session) };
  }

  createCsrfTokenForSession(cookieValue: string, now = this.clock()): string {
    const resolution = this.resolveSession(cookieValue, now);
    if (!resolution.ok) throw new LiffIdentityError("UNAUTHENTICATED", "LIFF session is not active");
    return createCsrfToken(this.csrfKeyForSession(resolution.context.sessionId));
  }

  verifyCsrfTokenForSession(cookieValue: string, token: string, now = this.clock()): boolean {
    const resolution = this.resolveSession(cookieValue, now);
    return resolution.ok && verifyCsrfToken(token, this.csrfKeyForSession(resolution.context.sessionId));
  }

  revokeSession(cookieValue: string): void {
    const sessionId = this.decodeSessionCookie(cookieValue);
    if (sessionId) this.sessions.delete(sessionId);
  }

  private requireConfig(liffAppId: string): LiffAppConfig {
    const config = this.configs.get(liffAppId);
    if (!config) throw new LiffIdentityError("NOT_FOUND", "LIFF app configuration was not found");
    return normalizeConfig(config);
  }

  private assertEnabled(config: LiffAppConfig): void {
    if (config.enabled === false) throw new LiffIdentityError("FEATURE_DISABLED", "LIFF is disabled for this app");
  }

  private assertAllowedReturnUrl(config: LiffAppConfig, value: string): string {
    const normalized = normalizeHttpsUrl(value, "returnUrl");
    if (!config.allowedReturnUrls.includes(normalized)) throw new LiffIdentityError("FORBIDDEN", "returnUrl is not allowlisted");
    return normalized;
  }

  private consumePendingLogin(state: string, liffAppId: string, now: Date): PendingLogin {
    const key = hashState(state, this.sessionSecret);
    const pending = this.pendingLogins.get(key);
    this.pendingLogins.delete(key);
    if (!pending || pending.expiresAt <= now.getTime() || pending.liffAppId !== liffAppId) {
      throw new LiffIdentityError("UNAUTHENTICATED", "LIFF login state is invalid or expired");
    }
    return { ...pending };
  }

  private async verifyWithProvider(input: CreateLiffSessionInput, config: LiffAppConfig, nonce?: string): Promise<LineTokenClaims> {
    if ((input.tokenKind !== "id_token" && input.tokenKind !== "access_token") || !input.token || input.token.length > 16_384 || /[\u0000-\u001f\u007f]/.test(input.token)) throw genericTokenError();
    try {
      return input.tokenKind === "id_token"
        ? await this.identityProvider.verifyIdToken({ token: input.token, channelId: config.channelId, ...(nonce ? { nonce } : {}) })
        : await this.identityProvider.verifyAccessToken({ token: input.token, channelId: config.channelId });
    } catch {
      throw genericTokenError();
    }
  }

  private verifyClaims(claims: LineTokenClaims, config: LiffAppConfig, tokenKind: CreateLiffSessionInput["tokenKind"], expectedNonce: string | undefined, now: Date): VerifiedLineIdentity {
    if (!claims || typeof claims !== "object") throw genericTokenError();
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const validTimes = Number.isSafeInteger(claims.exp) && claims.exp > nowSeconds && (claims.iat === undefined || (Number.isSafeInteger(claims.iat) && claims.iat <= nowSeconds + CLOCK_SKEW_SECONDS));
    const validNonce = tokenKind !== "id_token" || expectedNonce === undefined || claims.nonce === expectedNonce;
    if (claims.issuer !== LINE_ISSUER || claims.channelId !== config.channelId || !sameAudience(claims.audience, config.channelId) || !validTimes || !validNonce) {
      throw genericTokenError();
    }
    try {
      assertIdentifier(claims.subject, "lineUserId");
    } catch {
      throw genericTokenError();
    }
    return {
      lineUserId: claims.subject,
      channelId: claims.channelId,
      tokenKind,
      expiresAt: new Date(claims.exp * 1000),
      ...(claims.iat === undefined ? {} : { issuedAt: new Date(claims.iat * 1000) }),
    };
  }

  private validateConsent(config: LiffAppConfig, consent?: ConsentInput): string | undefined {
    if (consent && (!consent.version.trim() || consent.version.length > 128)) throw new LiffIdentityError("VALIDATION_ERROR", "consent version is invalid");
    if (config.requiredConsentVersion !== undefined && (!consent || !consent.accepted || consent.version !== config.requiredConsentVersion)) {
      throw new LiffIdentityError("VALIDATION_ERROR", "required privacy consent is missing or outdated");
    }
    return consent?.accepted ? consent.version : undefined;
  }

  private issueSession(config: LiffAppConfig, identity: VerifiedLineIdentity, consentVersion: string | undefined, now: Date): LiffSessionResult {
    const ttlSeconds = config.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
    const sessionId = randomOpaqueValue();
    const context: SessionContext = {
      sessionId,
      tenantId: config.tenantId,
      liffAppId: config.liffAppId,
      channelId: identity.channelId,
      lineUserId: identity.lineUserId,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
      ...(consentVersion ? { consentVersion } : {}),
    };
    this.sessions.set(sessionId, { ...context });
    return {
      context: this.cloneContext(context),
      sessionCookie: {
        name: LIFF_SESSION_COOKIE_NAME,
        value: `${sessionId}.${signedValue(sessionId, this.sessionSecret)}`,
        options: buildSessionCookieOptions(this.environment, ttlSeconds),
      },
      csrfToken: createCsrfToken(this.csrfKeyForSession(sessionId)),
    };
  }

  private decodeSessionCookie(cookieValue: string): string | undefined {
    const [sessionId, signature, ...extra] = cookieValue.split(".");
    if (!sessionId || !signature || extra.length > 0 || sessionId.length > 512 || signature.length !== 43) return undefined;
    const expected = Buffer.from(signedValue(sessionId, this.sessionSecret));
    const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return undefined;
    return sessionId;
  }

  private csrfKeyForSession(sessionId: string): string {
    return createHmac("sha256", this.csrfSecret).update(`liff-csrf:${sessionId}`).digest("hex");
  }

  private removeExpiredPendingLogins(now: Date): void {
    for (const [key, pending] of this.pendingLogins) if (pending.expiresAt <= now.getTime()) this.pendingLogins.delete(key);
  }

  private cloneContext(context: SessionContext): SessionContext {
    return { ...context, expiresAt: new Date(context.expiresAt.getTime()) };
  }
}
