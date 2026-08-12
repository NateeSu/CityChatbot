import type { KpiReport } from "./report";

export type AiQualityOutcome = "ANSWER" | "CLARIFY" | "HANDOFF";
export type AiQualityStatus = "SUCCEEDED" | "HANDOFF" | "FAILED" | "CANCELLED";
export type AiFeedbackValue = "HELPFUL" | "INCORRECT";
export type AiNarrativeStatus = "DISABLED" | "VERIFIED" | "UNAVAILABLE";

export type AiQualityRun = {
  tenantId: string;
  runId: string;
  status: AiQualityStatus;
  outcome: AiQualityOutcome | null;
  reasonCode: string | null;
  modelRevision: string;
  promptVersion: string;
  indexVersion: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  inputCostPerMillionTokens: number;
  outputCostPerMillionTokens: number;
  reportedCostUsd?: number;
  materialClaimCount: number;
  citedMaterialClaimCount: number;
  feedback?: AiFeedbackValue;
  routing?: {
    recommendedDepartmentId: string;
    finalDepartmentId: string | null;
    staffAccepted: boolean | null;
  };
  createdAt: string;
};

export type AiQualityFilter = {
  tenantId: string;
  from: string;
  to: string;
};

export type ExecutiveFact = {
  key: string;
  label: string;
  value: number | string;
  unit: "COUNT" | "TOKENS" | "MILLISECONDS" | "USD" | "RATE" | "TEXT";
  entity?: string;
};

export type ExecutivePayload = {
  source: "SQL_PREPARED_AI_QUALITY";
  facts: readonly ExecutiveFact[];
  generatedAt: string;
};

export type ExecutiveNarrativeClaim = {
  factKey: string;
  kind: "FACT" | "INFERENCE";
  text: string;
};

export type ExecutiveNarrativeCandidate = {
  text: string;
  claims: readonly ExecutiveNarrativeClaim[];
};

export type VerifiedExecutiveNarrative = {
  status: "VERIFIED";
  text: string;
  claims: readonly ExecutiveNarrativeClaim[];
};

export type AiQualityReport = {
  tenantId: string;
  filter: AiQualityFilter;
  source: "SQL_PREPARED_AI_RUNS";
  generatedAt: string;
  status: "READY" | "EMPTY" | "PARTIAL";
  numeric: {
    totalRuns: number;
    succeededRuns: number;
    failedRuns: number;
    outcomeCounts: Readonly<Record<AiQualityOutcome, number>>;
    reasonCounts: Readonly<Record<string, number>>;
    feedback: {
      helpfulCount: number;
      incorrectCount: number;
      responseCount: number;
      denominator: number;
      helpfulRate: number | null;
    };
    citations: {
      materialClaimCount: number;
      citedMaterialClaimCount: number;
      coverageRate: number | null;
    };
    routing: {
      recommendationCount: number;
      correctionCount: number;
      correctionDenominator: number;
      correctionRate: number | null;
    };
    usage: {
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
      p95LatencyMs: number | null;
      costUsd: number;
      reportedCostUsd: number | null;
      costReconciliation: "MATCH" | "MISMATCH" | "UNAVAILABLE";
    };
    versions: {
      modelRevisions: readonly string[];
      promptVersions: readonly string[];
      indexVersions: readonly string[];
    };
  };
  executivePayload: ExecutivePayload;
  executiveNarrative: {
    status: AiNarrativeStatus;
    verified?: VerifiedExecutiveNarrative;
    reason?: "DISABLED" | "MALFORMED" | "REJECTED";
  };
};

export class AiQualityReportError extends Error {
  constructor(
    public readonly code: "VALIDATION_ERROR" | "TENANT_SCOPE" | "NARRATIVE_REJECTED",
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "AiQualityReportError";
  }
}

const COST_EPSILON = 0.000001;
const NUMBER_PATTERN = /(?:\d+(?:[.,]\d+)*)/gu;

const parseInstant = (value: string, field: string): number => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new AiQualityReportError("VALIDATION_ERROR", `${field} must be an ISO instant`);
  return parsed;
};

const assertNonNegativeInteger = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) throw new AiQualityReportError("VALIDATION_ERROR", `${field} must be a non-negative integer`);
};

const assertNonNegativeNumber = (value: number, field: string): void => {
  if (!Number.isFinite(value) || value < 0) throw new AiQualityReportError("VALIDATION_ERROR", `${field} must be non-negative`);
};

const roundMoney = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

const expectedCost = (run: AiQualityRun): number => roundMoney(
  run.inputTokens / 1_000_000 * run.inputCostPerMillionTokens
  + run.outputTokens / 1_000_000 * run.outputCostPerMillionTokens,
);

const percentile = (values: readonly number[], percentileValue: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(1, Math.ceil(sorted.length * percentileValue));
  return sorted[rank - 1] ?? null;
};

const increment = (record: Record<string, number>, key: string): void => {
  record[key] = (record[key] ?? 0) + 1;
};

const validateRun = (run: AiQualityRun, filter: AiQualityFilter): void => {
  if (run.tenantId !== filter.tenantId) throw new AiQualityReportError("TENANT_SCOPE", "AI quality input crosses tenant scope");
  if (!run.runId || !run.modelRevision || !run.promptVersion || !run.indexVersion) {
    throw new AiQualityReportError("VALIDATION_ERROR", "AI quality lineage fields are required");
  }
  for (const [value, field] of [
    [run.inputTokens, "inputTokens"],
    [run.outputTokens, "outputTokens"],
    [run.latencyMs, "latencyMs"],
    [run.materialClaimCount, "materialClaimCount"],
    [run.citedMaterialClaimCount, "citedMaterialClaimCount"],
  ] as const) assertNonNegativeInteger(value, field);
  for (const [value, field] of [
    [run.inputCostPerMillionTokens, "inputCostPerMillionTokens"],
    [run.outputCostPerMillionTokens, "outputCostPerMillionTokens"],
  ] as const) assertNonNegativeNumber(value, field);
  if (run.reportedCostUsd !== undefined) assertNonNegativeNumber(run.reportedCostUsd, "reportedCostUsd");
  if (run.citedMaterialClaimCount > run.materialClaimCount) {
    throw new AiQualityReportError("VALIDATION_ERROR", "cited claims cannot exceed material claims");
  }
  if (run.routing) {
    if (!run.routing.recommendedDepartmentId) throw new AiQualityReportError("VALIDATION_ERROR", "routing recommendation is required");
    if (run.routing.finalDepartmentId === "") throw new AiQualityReportError("VALIDATION_ERROR", "routing final department is invalid");
  }
  parseInstant(run.createdAt, "createdAt");
};

const factNumberTokens = (value: number | string): string[] => typeof value === "number" ? [String(value), String(value).replace(".", ",")] : [];
const normalizeNumber = (value: string): string => value.replace(/,/gu, "");

const validateNarrativeCandidate = (payload: ExecutivePayload, candidate: unknown): VerifiedExecutiveNarrative => {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new AiQualityReportError("NARRATIVE_REJECTED", "narrative payload is malformed");
  }
  const input = candidate as Partial<ExecutiveNarrativeCandidate>;
  if (typeof input.text !== "string" || input.text.trim().length === 0 || input.text.length > 4_000 || !Array.isArray(input.claims) || input.claims.length === 0) {
    throw new AiQualityReportError("NARRATIVE_REJECTED", "narrative claims are malformed");
  }
  const facts = new Map(payload.facts.map((fact) => [fact.key, fact]));
  const claims: ExecutiveNarrativeClaim[] = [];
  for (const rawClaim of input.claims) {
    if (!rawClaim || typeof rawClaim !== "object") throw new AiQualityReportError("NARRATIVE_REJECTED", "narrative claim is malformed");
    const claim = rawClaim as Partial<ExecutiveNarrativeClaim>;
    if (typeof claim.factKey !== "string" || !facts.has(claim.factKey) || (claim.kind !== "FACT" && claim.kind !== "INFERENCE") || typeof claim.text !== "string" || claim.text.trim().length === 0) {
      throw new AiQualityReportError("NARRATIVE_REJECTED", "narrative claim references an unsupported fact");
    }
    const fact = facts.get(claim.factKey)!;
    const factValue = String(fact.value);
    if (!claim.text.includes(fact.label) || !claim.text.includes(factValue)) {
      throw new AiQualityReportError("NARRATIVE_REJECTED", "narrative claim is not grounded in its fact label and value");
    }
    const numbers = claim.text.match(NUMBER_PATTERN) ?? [];
    const allowedNumbers = new Set(factNumberTokens(fact.value).map(normalizeNumber));
    if (numbers.some((number) => !allowedNumbers.has(normalizeNumber(number)))) {
      throw new AiQualityReportError("NARRATIVE_REJECTED", "narrative introduced an unsupported number");
    }
    if (fact.entity && !claim.text.includes(fact.entity)) throw new AiQualityReportError("NARRATIVE_REJECTED", "narrative omitted the fact entity");
    claims.push({ factKey: claim.factKey, kind: claim.kind, text: claim.text });
  }
  const expectedText = claims.map((claim) => claim.text).join(" ");
  if (input.text.trim() !== expectedText.trim()) throw new AiQualityReportError("NARRATIVE_REJECTED", "narrative text must equal its grounded claims");
  return { status: "VERIFIED", text: expectedText, claims };
};

export const verifyExecutiveNarrative = (payload: ExecutivePayload, candidate: unknown): VerifiedExecutiveNarrative => validateNarrativeCandidate(payload, candidate);

const executiveFactsFor = (numeric: AiQualityReport["numeric"]): readonly ExecutiveFact[] => [
  { key: "totalRuns", label: "AI runs", value: numeric.totalRuns, unit: "COUNT" },
  { key: "answerCount", label: "ANSWER outcomes", value: numeric.outcomeCounts.ANSWER, unit: "COUNT" },
  { key: "handoffCount", label: "HANDOFF outcomes", value: numeric.outcomeCounts.HANDOFF, unit: "COUNT" },
  { key: "citationCoverageRate", label: "citation coverage", value: numeric.citations.coverageRate ?? 0, unit: "RATE" },
  { key: "routingCorrectionRate", label: "routing correction rate", value: numeric.routing.correctionRate ?? 0, unit: "RATE" },
  { key: "costUsd", label: "AI cost USD", value: numeric.usage.costUsd, unit: "USD" },
  { key: "p95LatencyMs", label: "p95 latency milliseconds", value: numeric.usage.p95LatencyMs ?? 0, unit: "MILLISECONDS" },
];

export const buildAiQualityReport = (input: {
  filter: AiQualityFilter;
  runs: readonly AiQualityRun[];
  now?: Date;
  narrativeCandidate?: unknown;
}): AiQualityReport => {
  const from = parseInstant(input.filter.from, "from");
  const to = parseInstant(input.filter.to, "to");
  if (!input.filter.tenantId || from >= to) throw new AiQualityReportError("VALIDATION_ERROR", "AI quality filter is invalid");
  const filter: AiQualityFilter = { tenantId: input.filter.tenantId, from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  const selected = input.runs.filter((run) => {
    validateRun(run, filter);
    const createdAt = parseInstant(run.createdAt, "createdAt");
    return createdAt >= from && createdAt < to;
  });
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new AiQualityReportError("VALIDATION_ERROR", "now is invalid");
  const outcomeCounts: Record<AiQualityOutcome, number> = { ANSWER: 0, CLARIFY: 0, HANDOFF: 0 };
  const reasonCounts: Record<string, number> = {};
  const modelRevisions = new Set<string>();
  const promptVersions = new Set<string>();
  const indexVersions = new Set<string>();
  let succeededRuns = 0;
  let failedRuns = 0;
  let helpfulCount = 0;
  let incorrectCount = 0;
  let responseCount = 0;
  let materialClaimCount = 0;
  let citedMaterialClaimCount = 0;
  let recommendationCount = 0;
  let correctionCount = 0;
  let correctionDenominator = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let reportedCostUsd = 0;
  let hasReportedCost = false;
  let costMismatch = false;
  const latencies: number[] = [];
  for (const run of selected) {
    if (run.status === "FAILED" || run.status === "CANCELLED") failedRuns += 1; else succeededRuns += 1;
    if (run.outcome) outcomeCounts[run.outcome] += 1;
    if (run.reasonCode) increment(reasonCounts, run.reasonCode);
    modelRevisions.add(run.modelRevision);
    promptVersions.add(run.promptVersion);
    indexVersions.add(run.indexVersion);
    if (run.feedback) {
      responseCount += 1;
      if (run.feedback === "HELPFUL") helpfulCount += 1; else incorrectCount += 1;
    }
    materialClaimCount += run.materialClaimCount;
    citedMaterialClaimCount += run.citedMaterialClaimCount;
    if (run.routing) {
      recommendationCount += 1;
      if (run.routing.finalDepartmentId !== null) {
        correctionDenominator += 1;
        if (run.routing.finalDepartmentId !== run.routing.recommendedDepartmentId) correctionCount += 1;
      }
    }
    inputTokens += run.inputTokens;
    outputTokens += run.outputTokens;
    const computedCost = expectedCost(run);
    costUsd = roundMoney(costUsd + computedCost);
    if (run.reportedCostUsd !== undefined) {
      hasReportedCost = true;
      reportedCostUsd = roundMoney(reportedCostUsd + run.reportedCostUsd);
      if (Math.abs(run.reportedCostUsd - computedCost) > COST_EPSILON) costMismatch = true;
    }
    latencies.push(run.latencyMs);
  }
  const coverageRate = materialClaimCount === 0 ? null : citedMaterialClaimCount / materialClaimCount;
  const helpfulRate = responseCount === 0 ? null : helpfulCount / responseCount;
  const correctionRate = correctionDenominator === 0 ? null : correctionCount / correctionDenominator;
  const numeric: AiQualityReport["numeric"] = {
    totalRuns: selected.length,
    succeededRuns,
    failedRuns,
    outcomeCounts,
    reasonCounts,
    feedback: { helpfulCount, incorrectCount, responseCount, denominator: responseCount, helpfulRate },
    citations: { materialClaimCount, citedMaterialClaimCount, coverageRate },
    routing: { recommendationCount, correctionCount, correctionDenominator, correctionRate },
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      p95LatencyMs: percentile(latencies, 0.95),
      costUsd,
      reportedCostUsd: hasReportedCost ? reportedCostUsd : null,
      costReconciliation: hasReportedCost ? (costMismatch ? "MISMATCH" : "MATCH") : "UNAVAILABLE",
    },
    versions: {
      modelRevisions: [...modelRevisions].sort(),
      promptVersions: [...promptVersions].sort(),
      indexVersions: [...indexVersions].sort(),
    },
  };
  const nowIso = now.toISOString();
  const executivePayload: ExecutivePayload = { source: "SQL_PREPARED_AI_QUALITY", facts: executiveFactsFor(numeric), generatedAt: nowIso };
  let executiveNarrative: AiQualityReport["executiveNarrative"] = { status: "DISABLED", reason: "DISABLED" };
  if (input.narrativeCandidate !== undefined) {
    try {
      executiveNarrative = { status: "VERIFIED", verified: { ...verifyExecutiveNarrative(executivePayload, input.narrativeCandidate) } };
    } catch (error) {
      executiveNarrative = { status: "UNAVAILABLE", reason: error instanceof AiQualityReportError ? "REJECTED" : "MALFORMED" };
    }
  }
  const status = selected.length === 0 ? "EMPTY" : costMismatch || selected.some((run) => run.status === "FAILED" || run.outcome === null) ? "PARTIAL" : "READY";
  return {
    tenantId: filter.tenantId,
    filter,
    source: "SQL_PREPARED_AI_RUNS",
    generatedAt: nowIso,
    status,
    numeric,
    executivePayload,
    executiveNarrative,
  };
};

export const aiQualityFromKpiReport = (report: KpiReport): ExecutivePayload => ({
  source: "SQL_PREPARED_AI_QUALITY",
  generatedAt: report.generatedAt,
  facts: [
    { key: "kpiMetricCount", label: "KPI metrics", value: report.coverage.definitionCount, unit: "COUNT" },
    { key: "kpiStaleMetricCount", label: "stale KPI metrics", value: report.coverage.staleMetricCount, unit: "COUNT" },
  ],
});
