import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm" as const;
const KEY_BYTES = 32;
const IV_BYTES = 12;

export type EncryptedSecret = {
  algorithm: typeof ALGORITHM;
  keyVersion: string;
  iv: string;
  ciphertext: string;
  authTag: string;
};

const normalizeKey = (key: Uint8Array): Buffer => {
  if (key.byteLength !== KEY_BYTES) throw new Error("credential encryption key must be 32 bytes");
  return Buffer.from(key);
};

export const encryptSecret = (plaintext: string, key: Uint8Array, keyVersion: string): EncryptedSecret => {
  if (!keyVersion.trim()) throw new Error("keyVersion is required");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, normalizeKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    algorithm: ALGORITHM,
    keyVersion,
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    authTag: cipher.getAuthTag().toString("base64url"),
  };
};

export const decryptSecret = (payload: EncryptedSecret, key: Uint8Array): string => {
  if (payload.algorithm !== ALGORITHM) throw new Error("unsupported credential encryption algorithm");
  const decipher = createDecipheriv(ALGORITHM, normalizeKey(key), Buffer.from(payload.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
};
