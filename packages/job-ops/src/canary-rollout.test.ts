import { describe, expect, it } from "vitest";

import { CanaryRolloutController, type CanaryDependencies, type CanaryObservation } from "./canary-rollout";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const BASE = new Date("2026-08-13T00:00:00.000Z");
const READY: CanaryDependencies = { tenantActive: true, channelHealthy: true, chatBundleReady: true, groundedKnowledgeReady: true, handoffReady: true, rollbackReady: true };

const controller = (): CanaryRolloutController => new CanaryRolloutController("01234567890123456789012345678901");

describe("P9-CAN-002 canary rollout", () => {
  it("keeps cohorts deterministic, tenant-scoped and staff-supervised", () => {
    const rollout = controller();
    const flag = rollout.configurePilot({ tenantId: TENANT_A, featureKey: "ai_chat_enabled", cohortPercent: 100, dependencies: READY, reason: "pilot", idempotencyKey: "pilot:tenant-a:1", now: BASE });
    expect(flag.state).toBe("PILOT");
    expect(flag.audience).toBe("STAFF_SUPERVISED");
    expect(rollout.isInCohort(TENANT_A, "ai_chat_enabled", "line-user-hash-a")).toBe(true);
    expect(rollout.resolve({ tenantId: TENANT_A, featureKey: "ai_chat_enabled", subjectKey: "line-user-hash-a", dependencies: READY }).route).toBe("AI_CHAT");
    expect(rollout.resolve({ tenantId: TENANT_B, featureKey: "ai_chat_enabled", subjectKey: "line-user-hash-a", dependencies: READY }).route).toBe("HANDOFF");
    expect(rollout.getFlag(TENANT_B, "ai_chat_enabled")).toBeUndefined();
  });

  it("fails closed when dependencies are not ready and rollback is idempotent", () => {
    const rollout = controller();
    const notReady = { ...READY, groundedKnowledgeReady: false };
    const disabled = rollout.configurePilot({ tenantId: TENANT_A, featureKey: "ai_chat_enabled", cohortPercent: 50, dependencies: notReady, reason: "pilot blocked", idempotencyKey: "pilot:blocked:1", now: BASE });
    expect(disabled).toMatchObject({ state: "OFF", enabled: false, cohortPercent: 0 });
    expect(rollout.resolve({ tenantId: TENANT_A, featureKey: "ai_chat_enabled", subjectKey: "line-user-hash-a", dependencies: notReady }).reasonCode).toBe("CANARY_DISABLED");
    const first = rollout.configurePilot({ tenantId: TENANT_A, featureKey: "ai_chat_enabled", cohortPercent: 50, dependencies: READY, reason: "pilot ready", idempotencyKey: "pilot:ready:1", now: BASE });
    const rollback = rollout.rollback({ tenantId: TENANT_A, featureKey: "ai_chat_enabled", reason: "provider degraded", idempotencyKey: "rollback:1", now: new Date(BASE.getTime() + 1000) });
    expect(rollback.version).toBe(first.version + 1);
    expect(rollout.rollback({ tenantId: TENANT_A, featureKey: "ai_chat_enabled", reason: "provider degraded", idempotencyKey: "rollback:1", now: new Date(BASE.getTime() + 2000) })).toEqual(rollback);
    expect(rollout.resolve({ tenantId: TENANT_A, featureKey: "ai_chat_enabled", subjectKey: "line-user-hash-a", dependencies: READY }).route).toBe("HANDOFF");
  });

  it("reconciles duplicate, cross-tenant, stale and out-of-cohort observations", () => {
    const rollout = controller();
    const flag = rollout.configurePilot({ tenantId: TENANT_A, featureKey: "ai_chat_enabled", cohortPercent: 100, dependencies: READY, reason: "pilot", idempotencyKey: "pilot:reconcile:1", now: BASE });
    const observations: CanaryObservation[] = [
      { tenantId: TENANT_A, subjectKey: "line-user-hash-a", eventId: "event-1", route: "AI_CHAT", outcome: "ANSWER", flagVersion: flag.version, observedAt: BASE.toISOString() },
      { tenantId: TENANT_A, subjectKey: "line-user-hash-a", eventId: "event-1", route: "AI_CHAT", outcome: "ANSWER", flagVersion: flag.version, observedAt: BASE.toISOString() },
      { tenantId: TENANT_B, subjectKey: "line-user-hash-b", eventId: "event-2", route: "AI_CHAT", outcome: "ANSWER", flagVersion: flag.version, observedAt: BASE.toISOString() },
      { tenantId: TENANT_A, subjectKey: "line-user-hash-a", eventId: "event-3", route: "AI_CHAT", outcome: "ANSWER", flagVersion: flag.version - 1, observedAt: BASE.toISOString() },
    ];
    const result = rollout.reconcile({ tenantId: TENANT_A, featureKey: "ai_chat_enabled", dependencies: READY, observations, now: BASE });
    expect(result.status).toBe("MISMATCH");
    expect(result.duplicateEventIds).toEqual(["event-1"]);
    expect(result.unexpectedTenantEventIds).toEqual(["event-2"]);
    expect(result.staleFlagEventIds).toEqual(["event-3"]);
    expect(result.outOfCohortEventIds).toEqual(["event-3"]);
  });

  it("schedules one tenant-scoped sample window and fails closed on mismatch", () => {
    const rollout = controller();
    const flag = rollout.configurePilot({ tenantId: TENANT_A, featureKey: "ai_chat_enabled", cohortPercent: 100, dependencies: READY, reason: "pilot", idempotencyKey: "pilot:sampling:1", now: BASE });
    const scheduled = rollout.scheduleSampling({ tenantId: TENANT_A, now: BASE, intervalMs: 1_000, sampleLimit: 10 });
    expect(rollout.scheduleSampling({ tenantId: TENANT_A, now: new Date(BASE.getTime() + 500), intervalMs: 1_000, sampleLimit: 10 })).toEqual(scheduled);
    const observation: CanaryObservation = { tenantId: TENANT_A, subjectKey: "line-user-hash-a", eventId: "sample-1", route: "AI_CHAT", outcome: "ANSWER", flagVersion: flag.version, observedAt: BASE.toISOString() };
    expect(rollout.runDueSampling({ tenantId: TENANT_A, featureKey: "ai_chat_enabled", dependencies: READY, observations: [observation], now: new Date(BASE.getTime() + 1001) }).status).toBe("SAMPLED");
    const next = new Date(BASE.getTime() + 86_400_000);
    rollout.scheduleSampling({ tenantId: TENANT_A, now: next, intervalMs: 1_000, sampleLimit: 10 });
    const bad: CanaryObservation = { ...observation, eventId: "sample-cross-tenant", tenantId: TENANT_B };
    expect(rollout.runDueSampling({ tenantId: TENANT_A, featureKey: "ai_chat_enabled", dependencies: READY, observations: [bad], now: new Date(next.getTime() + 1001) }).status).toBe("FAIL_CLOSED");
  });
});

