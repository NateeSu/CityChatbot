import { describe, expect, it } from "vitest";

import { InMemoryRateLimiter, createRateLimitKey } from "./rate-limit";

describe("rate limiting", () => {
  it("separates tenant, actor, IP hash and feature dimensions", () => {
    const a = createRateLimitKey({ tenantId: "tenant-a", actorId: "actor", ipHash: "ip", feature: "chat" });
    const b = createRateLimitKey({ tenantId: "tenant-b", actorId: "actor", ipHash: "ip", feature: "chat" });
    expect(a).not.toBe(b);
    expect(() => createRateLimitKey({ feature: "Bad Feature" })).toThrow();
  });

  it("returns a deterministic 429 decision after the burst and refills over time", () => {
    const limiter = new InMemoryRateLimiter({ capacity: 2, refillPerSecond: 1 });
    expect(limiter.consume("tenant-a:actor:ip:chat", 1, 0).allowed).toBe(true);
    expect(limiter.consume("tenant-a:actor:ip:chat", 1, 0).allowed).toBe(true);
    const limited = limiter.consume("tenant-a:actor:ip:chat", 1, 0);
    expect(limited).toMatchObject({ allowed: false, remaining: 0, retryAfterSeconds: 1, limit: 2 });
    expect(limiter.consume("tenant-a:actor:ip:chat", 1, 1000).allowed).toBe(true);
    expect(limiter.consume("tenant-b:actor:ip:chat", 1, 0).allowed).toBe(true);
  });
});
