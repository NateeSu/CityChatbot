import { createHash } from "node:crypto";

export type HypercareState = "HEALTHY" | "FORCE_HANDOFF" | "ROLLED_BACK";
export type HypercareRunStatus = HypercareState | "NOT_DUE";

export type HypercareHealthSignals = {
  database: boolean;
  webhook: boolean;
  worker: boolean;
  provider: boolean;
  retrieval: boolean;
};

export type HypercareSamplingSummary = {
  sampledCount: number;
  reviewedCount: number;
  negativeFeedbackCount: number;
  negativeFeedbackReviewedCount: number;
  highRiskCount: number;
  highRiskReviewedCount: number;
  lowConfidenceCount: number;
  lowConfidenceReviewedCount: number;
  conflictCount: number;
  conflictReviewedCount: number;
};

export type HypercareReconciliationSummary = {
  complaint: "MATCH" | "MISMATCH";
  supportTicket: "MATCH" | "MISMATCH";
  outbox: "MATCH" | "MISMATCH";
  job: "MATCH" | "MISMATCH";
};

export type HypercareBudgetSummary = {
  sloWithinBudget: boolean;
  errorBudgetRemainingBps: number;
  costWithinBudget: boolean;
  criticalIncidentCount: number;
};

export type HypercarePolicy = {
  minimumSampleCount: number;
  maxCriticalIncidents: number;
  minimumErrorBudgetRemainingBps: number;
};

export type HypercareJob = {
  id: string;
  tenantId: string;
  windowKey: string;
  dueAt: string;
  status: "SCHEDULED" | "COMPLETED";
  createdAt: string;
  completedAt?: string;
};

export type HypercareRun = {
  id: string;
  tenantId: string;
  windowKey: string;
  status: HypercareRunStatus;
  alerts: readonly string[];
  reviewedCoverage: "PASS" | "FAIL";
  reconciliation: "MATCH" | "MISMATCH";
  checkedAt: string;
  jobId: string;
};

export class HypercareMonitorError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "HypercareMonitorError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.-]{2,199}$/;
const DAY_MS = 86_400_000;
const DEFAULT_POLICY: HypercarePolicy = { minimumSampleCount: 1, maxCriticalIncidents: 0, minimumErrorBudgetRemainingBps: 0 };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const toIso = (value: Date): string => {
  if (Number.isNaN(value.getTime())) throw new HypercareMonitorError("VALIDATION_ERROR", "date is invalid");
  return value.toISOString();
};
const assertTenantId = (value: string): void => {
  if (!UUID_PATTERN.test(value)) throw new HypercareMonitorError("VALIDATION_ERROR", "tenantId must be a UUID");
};
const assertIdempotencyKey = (value: string): void => {
  if (!IDEMPOTENCY_PATTERN.test(value)) throw new HypercareMonitorError("VALIDATION_ERROR", "idempotencyKey is invalid");
};
const assertNonNegativeInteger = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value < 0) throw new HypercareMonitorError("VALIDATION_ERROR", `${field} must be a non-negative integer`);
};
const assertHealth = (value: HypercareHealthSignals): void => {
  const keys: readonly (keyof HypercareHealthSignals)[] = ["database", "webhook", "worker", "provider", "retrieval"];
  if (!keys.every((key) => typeof value[key] === "boolean")) throw new HypercareMonitorError("VALIDATION_ERROR", "all health signals are required");
};
const assertSampling = (value: HypercareSamplingSummary): void => {
  const fields: readonly (keyof HypercareSamplingSummary)[] = ["sampledCount", "reviewedCount", "negativeFeedbackCount", "negativeFeedbackReviewedCount", "highRiskCount", "highRiskReviewedCount", "lowConfidenceCount", "lowConfidenceReviewedCount", "conflictCount", "conflictReviewedCount"];
  fields.forEach((field) => assertNonNegativeInteger(value[field], field));
  if (value.reviewedCount > value.sampledCount) throw new HypercareMonitorError("VALIDATION_ERROR", "reviewedCount cannot exceed sampledCount");
};
const assertBudget = (value: HypercareBudgetSummary): void => {
  assertNonNegativeInteger(value.errorBudgetRemainingBps, "errorBudgetRemainingBps");
  assertNonNegativeInteger(value.criticalIncidentCount, "criticalIncidentCount");
  if (value.errorBudgetRemainingBps > 10_000) throw new HypercareMonitorError("VALIDATION_ERROR", "errorBudgetRemainingBps must be at most 10000");
  if (typeof value.sloWithinBudget !== "boolean" || typeof value.costWithinBudget !== "boolean") throw new HypercareMonitorError("VALIDATION_ERROR", "SLO and cost signals are required");
};
const windowKey = (value: Date): string => `UTC-DAY-${Math.floor(value.getTime() / DAY_MS)}`;
const deterministicId = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32);

export class HypercareMonitor {
  private readonly jobs = new Map<string, HypercareJob>();
  private readonly runs = new Map<string, HypercareRun>();
  private readonly idempotency = new Map<string, { hash: string; run: HypercareRun }>();
  private readonly latest = new Map<string, HypercareState>();

  constructor(private readonly policy: HypercarePolicy = DEFAULT_POLICY) {
    assertNonNegativeInteger(policy.minimumSampleCount, "minimumSampleCount");
    assertNonNegativeInteger(policy.maxCriticalIncidents, "maxCriticalIncidents");
    assertNonNegativeInteger(policy.minimumErrorBudgetRemainingBps, "minimumErrorBudgetRemainingBps");
    if (policy.minimumSampleCount < 1 || policy.minimumErrorBudgetRemainingBps > 10_000) throw new HypercareMonitorError("VALIDATION_ERROR", "hypercare policy is invalid");
  }

  scheduleDaily(input: { tenantId: string; now?: Date }): HypercareJob {
    assertTenantId(input.tenantId);
    const now = input.now ?? new Date();
    const key = `${input.tenantId}:${windowKey(now)}`;
    const prior = this.jobs.get(key);
    if (prior) return clone(prior);
    const createdAt = toIso(now);
    const job: HypercareJob = { id: deterministicId(`hypercare:${key}`), tenantId: input.tenantId, windowKey: windowKey(now), dueAt: toIso(new Date(now.getTime() + DAY_MS)), status: "SCHEDULED", createdAt };
    this.jobs.set(key, job);
    return clone(job);
  }

  runDaily(input: { tenantId: string; health: HypercareHealthSignals; sampling: HypercareSamplingSummary; reconciliation: HypercareReconciliationSummary; budget: HypercareBudgetSummary; idempotencyKey: string; now?: Date }): HypercareRun {
    assertTenantId(input.tenantId);
    assertIdempotencyKey(input.idempotencyKey);
    assertHealth(input.health);
    assertSampling(input.sampling);
    assertBudget(input.budget);
    const now = input.now ?? new Date();
    const checkedAt = toIso(now);
    const job = [...this.jobs.values()]
      .filter((candidate) => candidate.tenantId === input.tenantId && candidate.status === "SCHEDULED" && candidate.dueAt <= checkedAt)
      .sort((left, right) => left.dueAt.localeCompare(right.dueAt))[0];
    const currentWindow = job?.windowKey ?? windowKey(now);
    const fallbackJobId = deterministicId(`hypercare:${input.tenantId}:${currentWindow}`);
    if (!job) return { id: deterministicId(`hypercare-run:${input.tenantId}:${input.idempotencyKey}`), tenantId: input.tenantId, windowKey: currentWindow, status: "NOT_DUE", alerts: ["SAMPLE_NOT_DUE"], reviewedCoverage: "FAIL", reconciliation: "MISMATCH", checkedAt, jobId: fallbackJobId };
    const key = `${input.tenantId}:${input.idempotencyKey}`;
    const hash = JSON.stringify(input);
    const prior = this.idempotency.get(key);
    if (prior) {
      if (prior.hash !== hash) throw new HypercareMonitorError("IDEMPOTENCY_CONFLICT", "idempotency key was reused with different hypercare input");
      return clone(prior.run);
    }
    const coverageOk = input.sampling.reviewedCount >= input.sampling.sampledCount && input.sampling.negativeFeedbackReviewedCount >= input.sampling.negativeFeedbackCount && input.sampling.highRiskReviewedCount >= input.sampling.highRiskCount && input.sampling.lowConfidenceReviewedCount >= input.sampling.lowConfidenceCount && input.sampling.conflictReviewedCount >= input.sampling.conflictCount && input.sampling.sampledCount >= this.policy.minimumSampleCount;
    const reconciliationOk = Object.values(input.reconciliation).every((value) => value === "MATCH");
    const healthOk = Object.values(input.health).every(Boolean);
    const budgetOk = input.budget.sloWithinBudget && input.budget.costWithinBudget && input.budget.errorBudgetRemainingBps >= this.policy.minimumErrorBudgetRemainingBps;
    const critical = input.budget.criticalIncidentCount > this.policy.maxCriticalIncidents;
    const alerts = [
      ...(healthOk ? [] : ["HEALTH_DEGRADED"]),
      ...(coverageOk ? [] : ["REVIEW_COVERAGE_INCOMPLETE"]),
      ...(reconciliationOk ? [] : ["RECONCILIATION_MISMATCH"]),
      ...(budgetOk ? [] : ["SLO_OR_COST_BUDGET_BREACH"]),
      ...(critical ? ["CRITICAL_INCIDENT_THRESHOLD"] : []),
    ];
    const status: HypercareState = critical ? "ROLLED_BACK" : alerts.length > 0 ? "FORCE_HANDOFF" : "HEALTHY";
    const run: HypercareRun = { id: deterministicId(`hypercare-run:${key}`), tenantId: input.tenantId, windowKey: currentWindow, status, alerts, reviewedCoverage: coverageOk ? "PASS" : "FAIL", reconciliation: reconciliationOk ? "MATCH" : "MISMATCH", checkedAt, jobId: job.id };
    job.status = "COMPLETED";
    job.completedAt = run.checkedAt;
    this.jobs.set(`${input.tenantId}:${job.windowKey}`, job);
    this.runs.set(run.id, run);
    this.latest.set(input.tenantId, status);
    this.idempotency.set(key, { hash, run: clone(run) });
    return clone(run);
  }

  rollback(input: { tenantId: string; reason: string; idempotencyKey: string; now?: Date }): HypercareRun {
    assertTenantId(input.tenantId);
    assertIdempotencyKey(input.idempotencyKey);
    if (!input.reason.trim() || input.reason.length > 256) throw new HypercareMonitorError("AUDIT_REASON_REQUIRED", "rollback reason is required and bounded");
    const key = `${input.tenantId}:${input.idempotencyKey}`;
    const hash = JSON.stringify({ reason: input.reason });
    const prior = this.idempotency.get(key);
    if (prior) {
      if (prior.hash !== hash) throw new HypercareMonitorError("IDEMPOTENCY_CONFLICT", "idempotency key was reused with different rollback input");
      return clone(prior.run);
    }
    const now = input.now ?? new Date();
    const run: HypercareRun = { id: deterministicId(`hypercare-rollback:${key}`), tenantId: input.tenantId, windowKey: windowKey(now), status: "ROLLED_BACK", alerts: ["MANUAL_ROLLBACK"], reviewedCoverage: "FAIL", reconciliation: "MISMATCH", checkedAt: toIso(now), jobId: deterministicId(`hypercare:${input.tenantId}:${windowKey(now)}`) };
    this.latest.set(input.tenantId, "ROLLED_BACK");
    this.runs.set(run.id, run);
    this.idempotency.set(key, { hash, run: clone(run) });
    return clone(run);
  }

  resolve(tenantId: string): "AI_CHAT" | "HANDOFF" {
    assertTenantId(tenantId);
    return this.latest.get(tenantId) === "HEALTHY" ? "AI_CHAT" : "HANDOFF";
  }
}
