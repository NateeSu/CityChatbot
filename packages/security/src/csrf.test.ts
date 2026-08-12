import { describe, expect, it } from "vitest";

import { createCsrfToken, verifyCsrfToken } from "./csrf";

describe("CSRF token", () => {
  it("round-trips with a server secret and rejects tampering", () => {
    const secret = "local-only-csrf-secret-with-32-bytes-minimum";
    const token = createCsrfToken(secret, Buffer.alloc(32, 7));
    expect(verifyCsrfToken(token, secret)).toBe(true);
    expect(verifyCsrfToken(`${token}x`, secret)).toBe(false);
    expect(verifyCsrfToken(token, `${secret}different`)).toBe(false);
  });

  it("rejects weak secrets instead of silently degrading", () => {
    expect(() => createCsrfToken("too-short")).toThrow();
    expect(verifyCsrfToken("not-a-token", "too-short")).toBe(false);
  });
});
