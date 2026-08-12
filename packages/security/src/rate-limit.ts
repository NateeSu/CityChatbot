export type RateLimitKeyParts = {
  tenantId?: string;
  actorId?: string;
  ipHash?: string;
  feature: string;
};

export type RateLimitPolicy = {
  capacity: number;
  refillPerSecond: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
  resetAt: number;
};

type Bucket = {
  tokens: number;
  updatedAt: number;
};

const FEATURE_PATTERN = /^[a-z][a-z0-9_.-]{1,63}$/;

export const createRateLimitKey = (parts: RateLimitKeyParts): string => {
  if (!FEATURE_PATTERN.test(parts.feature)) throw new Error("Invalid rate-limit feature");
  return [parts.tenantId ?? "anonymous", parts.actorId ?? "anonymous", parts.ipHash ?? "unknown", parts.feature].join(":");
};

export class InMemoryRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly policy: RateLimitPolicy) {
    if (!Number.isFinite(policy.capacity) || policy.capacity <= 0) throw new Error("capacity must be positive");
    if (!Number.isFinite(policy.refillPerSecond) || policy.refillPerSecond <= 0) throw new Error("refillPerSecond must be positive");
  }

  consume(key: string, cost = 1, now = Date.now()): RateLimitResult {
    if (!key || !Number.isFinite(cost) || cost <= 0) throw new Error("invalid rate-limit request");
    const current = this.buckets.get(key) ?? { tokens: this.policy.capacity, updatedAt: now };
    const elapsedSeconds = Math.max(0, now - current.updatedAt) / 1000;
    const replenished = Math.min(this.policy.capacity, current.tokens + elapsedSeconds * this.policy.refillPerSecond);
    const allowed = replenished >= cost;
    const tokens = allowed ? replenished - cost : replenished;
    const retryAfterSeconds = allowed ? 0 : Math.ceil((cost - replenished) / this.policy.refillPerSecond);
    const resetAt = now + Math.ceil((this.policy.capacity - tokens) / this.policy.refillPerSecond) * 1000;
    this.buckets.set(key, { tokens, updatedAt: now });
    return {
      allowed,
      remaining: Math.max(0, Math.floor(tokens)),
      limit: this.policy.capacity,
      retryAfterSeconds,
      resetAt,
    };
  }

  clear(key?: string): void {
    if (key) this.buckets.delete(key);
    else this.buckets.clear();
  }
}
