import { describe, expect, it } from "vitest";

import {
  AiQualityReportError,
  buildAiQualityReport,
  verifyExecutiveNarrative,
  type AiQualityRun,
} from "./ai-report";

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER_TENANT = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-08-12T04:00:00.000Z");

const run = (overrides: Partial<AiQualityRun> = {}): AiQualityRun => ({
  tenantId: TENANT,
  runId: "run-default",
  status: "SUCCEEDED",
  outcome: "ANSWER",
  reasonCode: "ANSWERABLE",
  modelRevision: "model-v1",
  promptVersion: "prompt-v1",
  indexVersion: "index-v1",
  inputTokens: 100,
  outputTokens: 50,
  latencyMs: 100,
  inputCostPerMillionTokens: 1,
  outputCostPerMillionTokens: 2,
  reportedCostUsd: 0.0002,
  materialClaimCount: 2,
  citedMaterialClaimCount: 2,
  createdAt: "2026-08-11T04:00:00.000Z",
  ...overrides,
});

describe("AI quality and executive summary guard", () => {
  it("keeps deterministic outcome, citation, correction denominator and cost arithmetic exact", () => {
    const report = buildAiQualityReport({
      filter: { tenantId: TENANT, from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" },
      runs: [
        run({ runId: "run-1", routing: { recommendedDepartmentId: "A", finalDepartmentId: "A", staffAccepted: true } }),
        run({ runId: "run-2", outcome: "HANDOFF", reasonCode: "STAFF_REQUESTED", inputTokens: 200, outputTokens: 0, latencyMs: 200, materialClaimCount: 0, citedMaterialClaimCount: 0, routing: { recommendedDepartmentId: "A", finalDepartmentId: "B", staffAccepted: true } }),
        run({ runId: "run-3", status: "FAILED", outcome: null, reasonCode: "SYSTEM_ERROR", reportedCostUsd: 0, materialClaimCount: 0, citedMaterialClaimCount: 0, latencyMs: 300 }),
      ],
      now: NOW,
    });
    expect(report.numeric.totalRuns).toBe(3);
    expect(report.numeric.outcomeCounts).toEqual({ ANSWER: 1, CLARIFY: 0, HANDOFF: 1 });
    expect(report.numeric.citations).toEqual({ materialClaimCount: 2, citedMaterialClaimCount: 2, coverageRate: 1 });
    expect(report.numeric.routing).toEqual({ recommendationCount: 2, correctionCount: 1, correctionDenominator: 2, correctionRate: 0.5 });
    expect(report.numeric.usage.inputTokens).toBe(400);
    expect(report.numeric.usage.outputTokens).toBe(100);
    expect(report.numeric.usage.costUsd).toBe(0.0006);
    expect(report.numeric.usage.costReconciliation).toBe("MISMATCH");
    expect(report.numeric.usage.p95LatencyMs).toBe(300);
    expect(report.executiveNarrative.status).toBe("DISABLED");
  });

  it("rejects cross-tenant input and does not widen report scope", () => {
    expect(() => buildAiQualityReport({
      filter: { tenantId: TENANT, from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" },
      runs: [run({ tenantId: OTHER_TENANT })],
      now: NOW,
    })).toThrowError(AiQualityReportError);
  });

  it("accepts only a fact-keyed narrative with source label/value and blocks invented numbers", () => {
    const report = buildAiQualityReport({
      filter: { tenantId: TENANT, from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" },
      runs: [run({ runId: "run-1" })],
      now: NOW,
    });
    const totalRuns = report.executivePayload.facts.find((fact) => fact.key === "totalRuns")!;
    const valid = { text: `${totalRuns.label}: ${totalRuns.value}`, claims: [{ factKey: "totalRuns", kind: "FACT" as const, text: `${totalRuns.label}: ${totalRuns.value}` }] };
    expect(verifyExecutiveNarrative(report.executivePayload, valid).status).toBe("VERIFIED");
    const invalid = { text: "AI runs: 999", claims: [{ factKey: "totalRuns", kind: "FACT" as const, text: "AI runs: 999" }] };
    expect(() => verifyExecutiveNarrative(report.executivePayload, invalid)).toThrowError(AiQualityReportError);
    const malformedReport = buildAiQualityReport({
      filter: { tenantId: TENANT, from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" },
      runs: [run({ runId: "run-2" })],
      now: NOW,
      narrativeCandidate: invalid,
    });
    expect(malformedReport.numeric.totalRuns).toBe(1);
    expect(malformedReport.executiveNarrative.status).toBe("UNAVAILABLE");
  });
});
