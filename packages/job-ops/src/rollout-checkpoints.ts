import { createHash } from "node:crypto";

export type RolloutPercent = 25 | 50 | 100;
export type RolloutState = "OFF" | "ROLLOUT_25" | "ROLLOUT_50" | "ROLLOUT_100" | "ROLLED_BACK";

export type RolloutDependencies = {
  tenantActive: boolean;
  chatBundleReady: boolean;
  groundedKnowledgeReady: boolean;
  handoffReady: boolean;
  rollbackReady: boolean;
  capacityReady: boolean;
};

export type RolloutThresholds = {
  minimumObservations: number;
  maxErrorRateBps: number;
  maxMismatchCount: number;
  maxCriticalErrorCount: number;
};

export type RolloutMetrics = {
  tenantId: string;
  totalObservations: number;
  errorCount: number;
  mismatchCount: number;
  criticalErrorCount: number;
};

export type RolloutCheckpoint = {
  tenantId: string;
  featureKey: "ai_chat_enabled";
  version: number;
  state: RolloutState;
  percent: 0 | RolloutPercent;
  thresholds: RolloutThresholds;
  metrics: RolloutMetrics | null;
  reason: string;
  updatedAt: string;
};

export class RolloutCheckpointError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "RolloutCheckpointError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.-]{2,199}$/;
const DEFAULT_THRESHOLDS: RolloutThresholds = { minimumObservations: 1, maxErrorRateBps: 500, maxMismatchCount: 0, maxCriticalErrorCount: 0 };
const NEXT_PERCENT: Readonly<Record<RolloutState, RolloutPercent | null>> = { OFF: 25, ROLLOUT_25: 50, ROLLOUT_50: 100, ROLLOUT_100: null, ROLLED_BACK: 25 };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const toIso = (value: Date): string => {
  if (Number.isNaN(value.getTime())) throw new RolloutCheckpointError("VALIDATION_ERROR", "date is invalid");
  return value.toISOString();
};
const assertTenantId = (value: string): void => {
  if (!UUID_PATTERN.test(value)) throw new RolloutCheckpointError("VALIDATION_ERROR", "tenantId must be a UUID");
};
const assertIdempotencyKey = (value: string): void => {
  if (!IDEMPOTENCY_PATTERN.test(value)) throw new RolloutCheckpointError("VALIDATION_ERROR", "idempotencyKey is invalid");
};
const assertDependencies = (value: RolloutDependencies): void => {
  const keys: readonly (keyof RolloutDependencies)[] = ["tenantActive", "chatBundleReady", "groundedKnowledgeReady", "handoffReady", "rollbackReady", "capacityReady"];
  if (!keys.every((key) => typeof value[key] === "boolean")) throw new RolloutCheckpointError("VALIDATION_ERROR", "all rollout dependencies are required");
};
const assertThresholds = (value: RolloutThresholds): void => {
  if (!Number.isSafeInteger(value.minimumObservations) || value.minimumObservations < 1 || value.minimumObservations > 1_000_000) throw new RolloutCheckpointError("VALIDATION_ERROR", "minimumObservations is invalid");
  if (!Number.isSafeInteger(value.maxErrorRateBps) || value.maxErrorRateBps < 0 || value.maxErrorRateBps > 10_000) throw new RolloutCheckpointError("VALIDATION_ERROR", "maxErrorRateBps is invalid");
  if (!Number.isSafeInteger(value.maxMismatchCount) || value.maxMismatchCount < 0 || value.maxCriticalErrorCount < 0) throw new RolloutCheckpointError("VALIDATION_ERROR", "rollout count thresholds are invalid");
};
const assertMetrics = (value: RolloutMetrics): void => {
  assertTenantId(value.tenantId);
  if (![value.totalObservations, value.errorCount, value.mismatchCount, value.criticalErrorCount].every((item) => Number.isSafeInteger(item) && item >= 0)) throw new RolloutCheckpointError("VALIDATION_ERROR", "rollout metrics must be non-negative integers");
  if (value.errorCount > value.totalObservations) throw new RolloutCheckpointError("VALIDATION_ERROR", "errorCount cannot exceed totalObservations");
};
const requestHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
const dependenciesReady = (value: RolloutDependencies): boolean => Object.values(value).every(Boolean);

export class RolloutCheckpointController {
  private current = new Map<string, RolloutCheckpoint>();
  private idempotency = new Map<string, { hash: string; checkpoint: RolloutCheckpoint }>();

  constructor(private readonly thresholds: RolloutThresholds = DEFAULT_THRESHOLDS) {
    assertThresholds(thresholds);
  }

  get(tenantId: string): RolloutCheckpoint | undefined {
    assertTenantId(tenantId);
    const checkpoint = this.current.get(tenantId);
    return checkpoint ? clone(checkpoint) : undefined;
  }

  transition(input: { tenantId: string; targetPercent: RolloutPercent; dependencies: RolloutDependencies; metrics: RolloutMetrics; reason: string; idempotencyKey: string; now?: Date }): RolloutCheckpoint {
    assertTenantId(input.tenantId);
    assertDependencies(input.dependencies);
    assertMetrics(input.metrics);
    assertIdempotencyKey(input.idempotencyKey);
    if (input.metrics.tenantId !== input.tenantId) throw new RolloutCheckpointError("TENANT_SCOPE_VIOLATION", "metrics belong to another tenant");
    if (!input.reason.trim() || input.reason.length > 256) throw new RolloutCheckpointError("AUDIT_REASON_REQUIRED", "reason is required and bounded");
    const key = `${input.tenantId}:${input.idempotencyKey}`;
    const hash = requestHash({ targetPercent: input.targetPercent, dependencies: input.dependencies, metrics: input.metrics, reason: input.reason });
    const prior = this.idempotency.get(key);
    if (prior) {
      if (prior.hash !== hash) throw new RolloutCheckpointError("IDEMPOTENCY_CONFLICT", "idempotency key was reused with different rollout input");
      return clone(prior.checkpoint);
    }
    const previous = this.current.get(input.tenantId);
    const expected = NEXT_PERCENT[previous?.state ?? "OFF"];
    if (expected !== input.targetPercent) throw new RolloutCheckpointError("INVALID_TRANSITION", `next rollout checkpoint must be ${expected ?? "none"}`);
    if (!dependenciesReady(input.dependencies)) throw new RolloutCheckpointError("DEPENDENCY_NOT_READY", "rollout remains fail-closed until dependencies are ready");
    const thresholdFailure = this.thresholdFailure(input.metrics);
    if (thresholdFailure) throw new RolloutCheckpointError("THRESHOLD_BREACH", thresholdFailure);
    const now = input.now ?? new Date();
    const checkpoint: RolloutCheckpoint = {
      tenantId: input.tenantId,
      featureKey: "ai_chat_enabled",
      version: (previous?.version ?? 0) + 1,
      state: `ROLLOUT_${input.targetPercent}`,
      percent: input.targetPercent,
      thresholds: clone(this.thresholds),
      metrics: clone(input.metrics),
      reason: input.reason.trim(),
      updatedAt: toIso(now),
    };
    this.current.set(input.tenantId, checkpoint);
    this.idempotency.set(key, { hash, checkpoint: clone(checkpoint) });
    return clone(checkpoint);
  }

  rollback(input: { tenantId: string; reason: string; idempotencyKey: string; now?: Date }): RolloutCheckpoint {
    assertTenantId(input.tenantId);
    assertIdempotencyKey(input.idempotencyKey);
    if (!input.reason.trim() || input.reason.length > 256) throw new RolloutCheckpointError("AUDIT_REASON_REQUIRED", "reason is required and bounded");
    const key = `${input.tenantId}:${input.idempotencyKey}`;
    const hash = requestHash({ action: "ROLLBACK", reason: input.reason });
    const prior = this.idempotency.get(key);
    if (prior) {
      if (prior.hash !== hash) throw new RolloutCheckpointError("IDEMPOTENCY_CONFLICT", "idempotency key was reused with different rollback input");
      return clone(prior.checkpoint);
    }
    const previous = this.current.get(input.tenantId);
    const now = input.now ?? new Date();
    const checkpoint: RolloutCheckpoint = {
      tenantId: input.tenantId,
      featureKey: "ai_chat_enabled",
      version: (previous?.version ?? 0) + 1,
      state: "ROLLED_BACK",
      percent: 0,
      thresholds: clone(this.thresholds),
      metrics: previous?.metrics ? clone(previous.metrics) : null,
      reason: input.reason.trim(),
      updatedAt: toIso(now),
    };
    this.current.set(input.tenantId, checkpoint);
    this.idempotency.set(key, { hash, checkpoint: clone(checkpoint) });
    return clone(checkpoint);
  }

  resolve(tenantId: string): "AI_CHAT" | "HANDOFF" {
    assertTenantId(tenantId);
    return this.current.get(tenantId)?.percent ? "AI_CHAT" : "HANDOFF";
  }

  private thresholdFailure(metrics: RolloutMetrics): string | undefined {
    if (metrics.totalObservations < this.thresholds.minimumObservations) return "minimum observation threshold is not met";
    const errorRateBps = metrics.totalObservations === 0 ? 10_000 : Math.floor((metrics.errorCount * 10_000) / metrics.totalObservations);
    if (errorRateBps > this.thresholds.maxErrorRateBps) return "error rate threshold is breached";
    if (metrics.mismatchCount > this.thresholds.maxMismatchCount) return "reconciliation mismatch threshold is breached";
    if (metrics.criticalErrorCount > this.thresholds.maxCriticalErrorCount) return "critical error threshold is breached";
    return undefined;
  }
}

