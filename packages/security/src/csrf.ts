import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_SEPARATOR = ".";
const MIN_SECRET_BYTES = 32;

const toKey = (secret: string): Buffer => {
  const key = Buffer.from(secret, "utf8");
  if (key.length < MIN_SECRET_BYTES) throw new Error("CSRF secret must be at least 32 bytes");
  return key;
};

export const createCsrfToken = (secret: string, nonce = randomBytes(32)): string => {
  const key = toKey(secret);
  const encodedNonce = nonce.toString("base64url");
  const signature = createHmac("sha256", key).update(nonce).digest("base64url");
  return `${encodedNonce}${TOKEN_SEPARATOR}${signature}`;
};

export const verifyCsrfToken = (token: string, secret: string): boolean => {
  try {
    const [encodedNonce, encodedSignature, ...extra] = token.split(TOKEN_SEPARATOR);
    if (!encodedNonce || !encodedSignature || extra.length > 0) return false;
    const nonce = Buffer.from(encodedNonce, "base64url");
    const expected = createHmac("sha256", toKey(secret)).update(nonce).digest();
    const actual = Buffer.from(encodedSignature, "base64url");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};
