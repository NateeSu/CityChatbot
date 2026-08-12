import { describe, expect, it } from "vitest";

import { ContinuousCorrectnessMonitor } from "./continuous-correctness";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const BASE = new Date("2026-08-13T00:00:00.000Z");

describe("P9-BAU-001 continuous correctness", () => {
  it("schedules weekly/monthly/quarterly cadence idempotently", () => {
    const monitor = new ContinuousCorrectnessMonitor();
    const weekly = monitor.schedule({ tenantId: TENANT_A, cadence: "WEEKLY", now: BASE });
    expect(monitor.schedule({ tenantId: TENANT_A, cadence: "WEEKLY", now: new Date(BASE.getTime() + 1_000) })).toEqual(weekly);
    expect(monitor.schedule({ tenantId: TENANT_A, cadence: "MONTHLY", now: BASE }).cadence).toBe("MONTHLY");
    expect(monitor.schedule({ tenantId: TENANT_A, cadence: "QUARTERLY", now: BASE }).cadence).toBe("QUARTERLY");
  });

  it("disables stale or expired source domains and preserves tenant scope", () => {
    const monitor = new ContinuousCorrectnessMonitor({ maxCertificationAgeMs: 1_000, requiredCadences: ["WEEKLY"] });
    const audit = monitor.auditSources({ tenantId: TENANT_A, sources: [{ tenantId: TENANT_A, domainKey: "waste", sourceId: "source-1", generation: 1, active: true, validUntil: "2026-08-13T00:00:01.000Z", lastCertifiedAt: BASE.toISOString() }], now: new Date(BASE.getTime() + 2_000) });
    expect(audit.status).toBe("HANDOFF");
    expect(monitor.resolveDomain(TENANT_A, "waste")).toBe("HANDOFF");
    expect(() => monitor.auditSources({ tenantId: TENANT_A, sources: [{ tenantId: TENANT_B, domainKey: "waste", sourceId: "source-2", generation: 1, active: true, validUntil: null, lastCertifiedAt: BASE.toISOString() }], now: BASE })).toThrowError(/TENANT_SCOPE_VIOLATION/);
  });

  it("requires unit gate plus recertification before publishing a change", () => {
    const monitor = new ContinuousCorrectnessMonitor();
    expect(monitor.recordRegression({ tenantId: TENANT_A, changeId: "prompt-v2", affectedUnitGateGreen: false, recertificationPassed: true, now: BASE }).status).toBe("FORCE_HANDOFF");
    const passed = monitor.recordRegression({ tenantId: TENANT_A, changeId: "index-v2", affectedUnitGateGreen: true, recertificationPassed: true, now: BASE });
    expect(passed.status).toBe("PUBLISHED");
    expect(monitor.recordRegression({ tenantId: TENANT_A, changeId: "index-v2", affectedUnitGateGreen: true, recertificationPassed: true, now: new Date(BASE.getTime() + 1_000) })).toEqual(passed);
  });

  it("rolls back stale domains idempotently and routes to handoff", () => {
    const monitor = new ContinuousCorrectnessMonitor();
    const first = monitor.rollbackDomain({ tenantId: TENANT_A, domainKey: "fees", now: BASE });
    expect(first.status).toBe("ROLLED_BACK");
    expect(monitor.rollbackDomain({ tenantId: TENANT_A, domainKey: "fees", now: new Date(BASE.getTime() + 1_000) })).toEqual(first);
    expect(monitor.resolveDomain(TENANT_A, "fees")).toBe("HANDOFF");
  });
});

