import { LINE_ISSUER, type LineIdentityProvider, type LineTokenClaims } from "./liff";

const LINE_VERIFY_ENDPOINT = "https://api.line.me/oauth2/v2.1/verify";
const LINE_PROFILE_ENDPOINT = "https://api.line.me/v2/profile";

type JsonRecord = Record<string, unknown>;

export type HttpLineIdentityProviderOptions = {
  fetchImpl?: typeof fetch;
  clock?: () => Date;
};

const asRecord = (value: unknown): JsonRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("LINE identity response is invalid");
  return value as JsonRecord;
};

const asString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`LINE identity response field ${field} is invalid`);
  return value;
};

const asPositiveInteger = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(`LINE identity response field ${field} is invalid`);
  return value;
};

const readJson = async (response: Response): Promise<JsonRecord> => {
  if (!response.ok) throw new Error("LINE identity verification failed");
  return asRecord(await response.json());
};

export class HttpLineIdentityProvider implements LineIdentityProvider {
  private readonly fetchImpl: typeof fetch;
  private readonly clock: () => Date;

  constructor(options: HttpLineIdentityProviderOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.clock = options.clock ?? (() => new Date());
  }

  async verifyIdToken(input: { token: string; channelId: string; nonce?: string }): Promise<LineTokenClaims> {
    const body = new URLSearchParams({ id_token: input.token, client_id: input.channelId });
    if (input.nonce) body.set("nonce", input.nonce);
    const response = await this.fetchImpl(LINE_VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = await readJson(response);
    const audience = asString(payload.aud, "aud");
    return {
      issuer: asString(payload.iss, "iss"),
      subject: asString(payload.sub, "sub"),
      audience,
      channelId: audience,
      exp: asPositiveInteger(payload.exp, "exp"),
      iat: asPositiveInteger(payload.iat, "iat"),
      ...(payload.nonce === undefined ? {} : { nonce: asString(payload.nonce, "nonce") }),
    };
  }

  async verifyAccessToken(input: { token: string; channelId: string }): Promise<LineTokenClaims> {
    const verificationUrl = new URL(LINE_VERIFY_ENDPOINT);
    verificationUrl.searchParams.set("access_token", input.token);
    const verificationResponse = await this.fetchImpl(verificationUrl, { method: "GET" });
    const verification = await readJson(verificationResponse);
    const channelId = asString(verification.client_id, "client_id");
    const expiresIn = asPositiveInteger(verification.expires_in, "expires_in");
    if (channelId !== input.channelId) throw new Error("LINE access token channel mismatch");

    const profileResponse = await this.fetchImpl(LINE_PROFILE_ENDPOINT, {
      method: "GET",
      headers: { authorization: `Bearer ${input.token}` },
    });
    const profile = await readJson(profileResponse);
    const nowSeconds = Math.floor(this.clock().getTime() / 1000);
    return {
      issuer: LINE_ISSUER,
      subject: asString(profile.userId, "userId"),
      audience: channelId,
      channelId,
      iat: nowSeconds,
      exp: nowSeconds + expiresIn,
    };
  }
}
