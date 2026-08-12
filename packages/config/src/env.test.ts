import { describe, expect, it } from "vitest";

import { parsePublicEnv, parseServerEnv } from "./env";

describe("environment validation", () => {
  it("uses local-safe defaults without inventing a tenant or model", () => {
    const env = parseServerEnv({});

    expect(env.CITYCHATBOT_ENV).toBe("local");
    expect(env.TENANT_ID).toBeUndefined();
    expect(env.OPENROUTER_MODEL).toBeUndefined();
  });

  it("rejects production without an explicit app URL", () => {
    expect(() => parseServerEnv({ CITYCHATBOT_ENV: "production" })).toThrow(
      "APP_BASE_URL",
    );
  });

  it("accepts a valid tenant identifier without logging secrets", () => {
    const env = parseServerEnv({
      CITYCHATBOT_ENV: "test",
      TENANT_ID: "00000000-0000-4000-8000-000000000001",
      OPENROUTER_API_KEY: "test-only-secret",
      OPENROUTER_MODEL: "test/model",
    });

    expect(env.TENANT_ID).toBe("00000000-0000-4000-8000-000000000001");
    expect(env.OPENROUTER_MODEL).toBe("test/model");
  });

  it("requires a key version when tenant credential encryption is configured", () => {
    expect(() => parseServerEnv({ TENANT_CREDENTIAL_KEY: "12345678901234567890123456789012" })).toThrow(
      "TENANT_CREDENTIAL_KEY_VERSION",
    );
    const env = parseServerEnv({
      TENANT_CREDENTIAL_KEY: "12345678901234567890123456789012",
      TENANT_CREDENTIAL_KEY_VERSION: "key-v1",
    });
    expect(env.TENANT_CREDENTIAL_KEY_VERSION).toBe("key-v1");
  });

  it("parses public environment separately", () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_APP_ENV: "test" })).toEqual({
      NEXT_PUBLIC_APP_ENV: "test",
    });
  });
});
