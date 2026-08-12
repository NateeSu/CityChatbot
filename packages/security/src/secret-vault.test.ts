import { describe, expect, it } from "vitest";

import { decryptSecret, encryptSecret } from "./secret-vault";

describe("server-side encrypted secret envelope", () => {
  it("round-trips, records key version, and rejects tampering", () => {
    const key = new Uint8Array(32).fill(3);
    const payload = encryptSecret("synthetic-provider-secret", key, "test-key-v1");
    expect(payload.algorithm).toBe("aes-256-gcm");
    expect(payload.keyVersion).toBe("test-key-v1");
    expect(payload.ciphertext).not.toContain("synthetic-provider-secret");
    expect(decryptSecret(payload, key)).toBe("synthetic-provider-secret");
    expect(() => decryptSecret({ ...payload, authTag: `${payload.authTag}x` }, key)).toThrow();
  });

  it("supports key rotation by decrypting old material before re-encrypting", () => {
    const oldKey = new Uint8Array(32).fill(1);
    const newKey = new Uint8Array(32).fill(2);
    const oldPayload = encryptSecret("rotate-me", oldKey, "key-v1");
    const rotated = encryptSecret(decryptSecret(oldPayload, oldKey), newKey, "key-v2");
    expect(rotated.keyVersion).toBe("key-v2");
    expect(decryptSecret(rotated, newKey)).toBe("rotate-me");
    expect(() => decryptSecret(rotated, oldKey)).toThrow();
  });
});
