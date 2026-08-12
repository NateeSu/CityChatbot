import { describe, expect, it } from "vitest";

import { RolloutCheckpointController, type RolloutDependencies, type RolloutMetrics } from "./rollout-checkpoints";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const BASE = new Date("2026-08-13T00:00:00.000Z");
const READY: RolloutDependencies = { tenantActive: true, chatBundleReady: true, groundedKnowledgeReady: true, handoffReady: true, rollbackReady: true, capacityReady: true };
const METRICS: RolloutMetrics = { tenantId: TENANT_A, totalObservations: 100, errorCount: 1, mismatchCount: 0, criticalErrorCount: 0 };

describe("P9-CAN-003 rollout checkpoints", () => {
  it("advances only through 25, 50 and 100 percent checkpoints", () => {
    const rollout = new RolloutCheckpointController();
    expect(rollout.transition({ tenantId: TENANT_A, targetPercent: 25, dependencies: READY, metrics: METRICS, reason: "start pilot", idempotencyKey: "rollout:25", now: BASE }).state).toBe("ROLLOUT_25");
    expect(rollout.transition({ tenantId: TENANT_A, targetPercent: 50, dependencies: READY, metrics: METRICS, reason: "expand pilot", idempotencyKey: "rollout:50", now: new Date(BASE.getTime() + 1000) }).state).toBe("ROLLOUT_50");
    expect(rollout.transition({ tenantId: TENANT_A, targetPercent: 100, dependencies: READY, metrics: METRICS, reason: "general availability", idempotencyKey: "rollout:100", now: new Date(BASE.getTime() + 2000) }).state).toBe("ROLLOUT_100");
    expect(rollout.resolve(TENANT_A)).toBe("AI_CHAT");
  });

  it("rejects skipped checkpoints and threshold breaches", () => {
    const rollout = new RolloutCheckpointController({ minimumObservations: 10, maxErrorRateBps: 500, maxMismatchCount: 0, maxCriticalErrorCount: 0 });
    expect(() => rollout.transition({ tenantId: TENANT_A, targetPercent: 50, dependencies: READY, metrics: METRICS, reason: "skip", idempotencyKey: "rollout:skip", now: BASE })).toThrowError(/INVALID_TRANSITION/);
    expect(() => rollout.transition({ tenantId: TENANT_A, targetPercent: 25, dependencies: READY, metrics: { ...METRICS, errorCount: 10 }, reason: "bad metrics", idempotencyKey: "rollout:bad", now: BASE })).toThrowError(/THRESHOLD_BREACH/);
    expect(() => rollout.transition({ tenantId: TENANT_A, targetPercent: 25, dependencies: { ...READY, capacityReady: false }, metrics: METRICS, reason: "not ready", idempotencyKey: "rollout:not-ready", now: BASE })).toThrowError(/DEPENDENCY_NOT_READY/);
  });

  it("keeps rollback fail-closed and idempotent", () => {
    const rollout = new RolloutCheckpointController();
    rollout.transition({ tenantId: TENANT_A, targetPercent: 25, dependencies: READY, metrics: METRICS, reason: "start", idempotencyKey: "rollout:start", now: BASE });
    const rollback = rollout.rollback({ tenantId: TENANT_A, reason: "incident", idempotencyKey: "rollback:1", now: new Date(BASE.getTime() + 1000) });
    expect(rollback).toMatchObject({ state: "ROLLED_BACK", percent: 0 });
    expect(rollout.rollback({ tenantId: TENANT_A, reason: "incident", idempotencyKey: "rollback:1", now: new Date(BASE.getTime() + 2000) })).toEqual(rollback);
    expect(rollout.resolve(TENANT_A)).toBe("HANDOFF");
  });

  it("rejects cross-tenant metrics and keeps tenants isolated", () => {
    const rollout = new RolloutCheckpointController();
    expect(() => rollout.transition({ tenantId: TENANT_A, targetPercent: 25, dependencies: READY, metrics: { ...METRICS, tenantId: TENANT_B }, reason: "wrong tenant", idempotencyKey: "rollout:wrong-tenant", now: BASE })).toThrowError(/TENANT_SCOPE_VIOLATION/);
    expect(rollout.get(TENANT_B)).toBeUndefined();
    expect(rollout.resolve(TENANT_B)).toBe("HANDOFF");
  });
});

