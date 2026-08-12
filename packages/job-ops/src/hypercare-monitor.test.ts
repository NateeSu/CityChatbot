import { describe, expect, it } from "vitest";

import { HypercareMonitor, type HypercareBudgetSummary, type HypercareHealthSignals, type HypercareReconciliationSummary, type HypercareSamplingSummary } from "./hypercare-monitor";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const BASE = new Date("2026-08-13T00:00:00.000Z");
const HEALTHY: HypercareHealthSignals = { database: true, webhook: true, worker: true, provider: true, retrieval: true };
const SAMPLING: HypercareSamplingSummary = { sampledCount: 10, reviewedCount: 10, negativeFeedbackCount: 1, negativeFeedbackReviewedCount: 1, highRiskCount: 1, highRiskReviewedCount: 1, lowConfidenceCount: 1, lowConfidenceReviewedCount: 1, conflictCount: 1, conflictReviewedCount: 1 };
const RECONCILIATION: HypercareReconciliationSummary = { complaint: "MATCH", supportTicket: "MATCH", outbox: "MATCH", job: "MATCH" };
const BUDGET: HypercareBudgetSummary = { sloWithinBudget: true, errorBudgetRemainingBps: 9_500, costWithinBudget: true, criticalIncidentCount: 0 };

describe("P9-HC-001 hypercare monitor", () => {
  it("schedules an idempotent daily job and records a healthy run", () => {
    const monitor = new HypercareMonitor();
    const scheduled = monitor.scheduleDaily({ tenantId: TENANT_A, now: BASE });
    expect(monitor.scheduleDaily({ tenantId: TENANT_A, now: new Date(BASE.getTime() + 1000) })).toEqual(scheduled);
    const run = monitor.runDaily({ tenantId: TENANT_A, health: HEALTHY, sampling: SAMPLING, reconciliation: RECONCILIATION, budget: BUDGET, idempotencyKey: "hc:day-1", now: new Date(BASE.getTime() + 86_400_000 + 1) });
    expect(run.status).toBe("HEALTHY");
    expect(monitor.resolve(TENANT_A)).toBe("AI_CHAT");
  });

  it("forces handoff when review coverage or health is incomplete", () => {
    const monitor = new HypercareMonitor();
    monitor.scheduleDaily({ tenantId: TENANT_A, now: BASE });
    const run = monitor.runDaily({ tenantId: TENANT_A, health: { ...HEALTHY, provider: false }, sampling: { ...SAMPLING, highRiskReviewedCount: 0 }, reconciliation: RECONCILIATION, budget: BUDGET, idempotencyKey: "hc:degraded", now: new Date(BASE.getTime() + 86_400_000 + 1) });
    expect(run.status).toBe("FORCE_HANDOFF");
    expect(run.alerts).toEqual(["HEALTH_DEGRADED", "REVIEW_COVERAGE_INCOMPLETE"]);
    expect(monitor.resolve(TENANT_A)).toBe("HANDOFF");
  });

  it("rolls back on reconciliation/budget failure and keeps the event tenant-scoped", () => {
    const monitor = new HypercareMonitor({ minimumSampleCount: 1, maxCriticalIncidents: 0, minimumErrorBudgetRemainingBps: 100 });
    monitor.scheduleDaily({ tenantId: TENANT_A, now: BASE });
    const run = monitor.runDaily({ tenantId: TENANT_A, health: HEALTHY, sampling: SAMPLING, reconciliation: { ...RECONCILIATION, outbox: "MISMATCH" }, budget: { ...BUDGET, errorBudgetRemainingBps: 0, criticalIncidentCount: 1 }, idempotencyKey: "hc:rollback", now: new Date(BASE.getTime() + 86_400_000 + 1) });
    expect(run.status).toBe("ROLLED_BACK");
    expect(monitor.resolve(TENANT_A)).toBe("HANDOFF");
    expect(monitor.resolve(TENANT_B)).toBe("HANDOFF");
  });

  it("supports an idempotent manual rollback", () => {
    const monitor = new HypercareMonitor();
    const first = monitor.rollback({ tenantId: TENANT_A, reason: "incident", idempotencyKey: "hc:manual-rollback", now: BASE });
    expect(first.status).toBe("ROLLED_BACK");
    expect(monitor.rollback({ tenantId: TENANT_A, reason: "incident", idempotencyKey: "hc:manual-rollback", now: new Date(BASE.getTime() + 1000) })).toEqual(first);
    expect(monitor.resolve(TENANT_A)).toBe("HANDOFF");
  });
});

