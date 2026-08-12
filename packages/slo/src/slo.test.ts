import { describe, expect, it } from "vitest";

import {
  SLO_DEFINITIONS,
  SloContractError,
  buildSloAlerts,
  buildSloDashboard,
  buildSyntheticProbeResult,
  evaluateSlo,
  sloDefinition,
  type SloObservation,
} from "./slo";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const REQUEST = "33333333-3333-4333-8333-333333333333";
const CORRELATION = "44444444-4444-4444-8444-444444444444";
const WINDOW = { from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" } as const;
const evaluatedAt = "2026-08-11T04:00:00.000Z";

const observationsFor = (sloId: string, values: readonly number[], good?: readonly boolean[]): SloObservation[] => values.map((value, index) => ({
  tenantId: TENANT_A,
  sloId,
  observedAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
  value,
  ...(good ? { good: good[index] } : {}),
  requestId: REQUEST,
  correlationId: CORRELATION,
}));

describe("SLO registry and deterministic evaluation", () => {
  it("pins all fullspec SLO targets and runbook ownership", () => {
    expect(SLO_DEFINITIONS).toHaveLength(11);
    expect(sloDefinition("NFR-AVAIL-001").targetValue).toBe(0.999);
    expect(sloDefinition("NFR-LINE-001-P95").targetValue).toBe(1000);
    expect(sloDefinition("NFR-LINE-001-P99").targetValue).toBe(2000);
    expect(sloDefinition("NFR-DR-001-RTO").targetValue).toBe(14_400_000);
    expect(SLO_DEFINITIONS.every((definition) => definition.runbookId.length > 2 && definition.owner.length > 0)).toBe(true);
  });

  it("evaluates availability and preserves error-budget arithmetic", () => {
    const definition = sloDefinition("NFR-AVAIL-001");
    const evaluation = evaluateSlo({ tenantId: TENANT_A, definition, window: WINDOW, observations: observationsFor(definition.sloId, [1, 1, 1, 1, 1], [true, true, true, true, true]), evaluatedAt });
    expect(evaluation.status).toBe("HEALTHY");
    expect(evaluation.measuredValue).toBe(1);
    expect(evaluation.errorBudget.allowedFailureRatio).toBeCloseTo(0.001);
    expect(evaluation.errorBudget.remainingFraction).toBe(1);
  });

  it("uses deterministic nearest-rank percentile and breaches latency without LLM judgment", () => {
    const definition = sloDefinition("NFR-LINE-001-P95");
    const evaluation = evaluateSlo({ tenantId: TENANT_A, definition, window: WINDOW, observations: observationsFor(definition.sloId, [100, 200, 300, 400, 2500]), evaluatedAt });
    expect(evaluation.measuredValue).toBe(2500);
    expect(evaluation.targetMet).toBe(false);
    expect(evaluation.status).toBe("BREACHED");
    expect(evaluation.errorBudget.consumedFraction).toBe(1);
  });

  it("returns NO_DATA rather than inventing a healthy value", () => {
    const evaluation = evaluateSlo({ tenantId: TENANT_A, definition: sloDefinition("NFR-API-001-P95"), window: WINDOW, observations: [], evaluatedAt });
    expect(evaluation.status).toBe("NO_DATA");
    expect(evaluation.measuredValue).toBeUndefined();
    expect(evaluation.errorBudget.observedFailureRatio).toBe(1);
  });

  it("rejects cross-tenant observations before producing a dashboard", () => {
    expect(() => evaluateSlo({ tenantId: TENANT_A, definition: sloDefinition("NFR-API-001-P95"), window: WINDOW, observations: [{ ...observationsFor("NFR-API-001-P95", [100])[0]!, tenantId: TENANT_B }], evaluatedAt })).toThrowError(SloContractError);
    const probe = buildSyntheticProbeResult({ probeId: "probe-health", tenantId: TENANT_B, observedAt: evaluatedAt, statusCode: 200, latencyMs: 10, correlationId: CORRELATION });
    expect(() => buildSloDashboard({ tenantId: TENANT_A, window: WINDOW, observations: [], probes: [probe], generatedAt: evaluatedAt })).toThrowError(/CROSS_TENANT_PROBE/);
  });

  it("deduplicates breach alerts and closes them with a recovery action", () => {
    const definition = sloDefinition("NFR-API-001-P95");
    const breached = evaluateSlo({ tenantId: TENANT_A, definition, window: WINDOW, observations: observationsFor(definition.sloId, [900]), evaluatedAt });
    const first = buildSloAlerts([breached]);
    expect(first).toHaveLength(1);
    expect(first[0]?.action).toBe("OPEN");
    const repeated = buildSloAlerts([breached], first);
    expect(repeated[0]?.action).toBe("UPDATE");
    const healthy = evaluateSlo({ tenantId: TENANT_A, definition, window: WINDOW, observations: observationsFor(definition.sloId, [100]), evaluatedAt });
    const recovery = buildSloAlerts([healthy], first);
    expect(recovery[0]?.action).toBe("RECOVERY");
    expect(recovery[0]?.status).toBe("RECOVERED");
    expect(recovery[0]?.runbookUrl).toBe("/runbooks/citizen-api-latency");
  });

  it("exposes probe failures without raw response content", () => {
    const probe = buildSyntheticProbeResult({ probeId: "probe-health", tenantId: TENANT_A, observedAt: evaluatedAt, statusCode: 503, latencyMs: 120, correlationId: CORRELATION });
    expect(probe.status).toBe("FAIL");
    expect(probe.failureCode).toBe("HTTP_503");
    expect(Object.keys(probe)).not.toContain("body");
  });

  it("builds a tenant-scoped dashboard summary with alerts and probes", () => {
    const definition = sloDefinition("NFR-API-001-P95");
    const observations = observationsFor(definition.sloId, [100]);
    const probes = [buildSyntheticProbeResult({ probeId: "probe-health", tenantId: TENANT_A, observedAt: evaluatedAt, statusCode: 200, latencyMs: 20, correlationId: CORRELATION })];
    const dashboard = buildSloDashboard({ tenantId: TENANT_A, window: WINDOW, observations, probes, generatedAt: evaluatedAt, source: "SYNTHETIC_FIXTURE" });
    expect(dashboard.evaluations).toHaveLength(11);
    expect(dashboard.evaluations.find((item) => item.definition.sloId === definition.sloId)?.status).toBe("HEALTHY");
    expect(dashboard.summary.failedProbes).toBe(0);
    expect(dashboard.source).toBe("SYNTHETIC_FIXTURE");
    expect(dashboard.evaluations.some((item) => item.status === "NO_DATA")).toBe(true);
  });
});
