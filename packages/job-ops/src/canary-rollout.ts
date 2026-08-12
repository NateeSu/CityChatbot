import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type CanaryFeatureKey = "ai_chat_enabled" | "complaint_ai_routing_enabled";
export type CanaryState = "OFF" | "PILOT";
export type CanaryRoute = "AI_CHAT" | "HANDOFF";
export type CanaryDecisionReason =
  | "CANARY_ENABLED"
  | "CANARY_DISABLED"
  | "DEPENDENCY_NOT_READY"
  | "OUT_OF_COHORT"
  | "TENANT_SCOPE_VIOLATION"
  | "RECONCILIATION_FAILED";

export type CanaryDependencies = {
  tenantActive: boolean;
  channelHealthy: boolean;
  chatBundleReady: boolean;
  groundedKnowledgeReady: boolean;
  handoffReady: boolean;
  rollbackReady: boolean;
};

export type CanaryFlag = {
  tenantId: string;
  featureKey: CanaryFeatureKey;
  version: number;
  state: CanaryState;
  enabled: boolean;
  cohortPercent: number;
  audience: "STAFF_SUPERVISED";
  reason: string;
  updatedAt: string;
};

export type CanaryDecision = {
  tenantId: string;
  route: CanaryRoute;
  reasonCode: CanaryDecisionReason;
  flagVersion: number | null;
  cohortPercent: number;
};

export type CanaryObservation = {
  tenantId: string;
  subjectKey: string;
  eventId: string;
  route: CanaryRoute;
  outcome: "ANSWER" | "CLARIFY" | "HANDOFF";
  flagVersion: number | null;
  observedAt: string;
};

export type CanaryReconciliation = {
  tenantId: string;
  status: "MATCH" | "MISMATCH";
  checkedAt: string;
  observationCount: number;
  duplicateEventIds: readonly string[];
  outOfCohortEventIds: readonly string[];
  unexpectedTenantEventIds: readonly string[];
  staleFlagEventIds: readonly string[];
  invalidOutcomeEventIds: readonly string[];
};

export type CanarySamplingJob = {
  id: string;
  tenantId: string;
  windowKey: string;
  dueAt: string;
  sampleLimit: number;
  status: "SCHEDULED" | "COMPLETED";
  createdAt: string;
  completedAt?: string;
};

export type CanarySampleRun = {
  jobId: string;
  tenantId: string;
  status: "SAMPLED" | "NOT_DUE" | "FAIL_CLOSED";
  selectedEventIds: readonly string[];
  reconciled: CanaryReconciliation;
};

export class CanaryRolloutError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "CanaryRolloutError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBJECT_PATTERN = /^[A-Za-z0-9._:-]{1,256}$/;
const EVENT_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.-]{2,199}$/;
const MIN_SECRET_BYTES = 32;
const DAY_MS = 86_400_000;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const toIso = (value: Date): string => {
  if (Number.isNaN(value.getTime())) throw new CanaryRolloutError("VALIDATION_ERROR", "date is invalid");
  return value.toISOString();
};

const assertTenantId = (value: string): void => {
  if (!UUID_PATTERN.test(value)) throw new CanaryRolloutError("VALIDATION_ERROR", "tenantId must be a UUID");
};

const assertSubjectKey = (value: string): void => {
  if (!SUBJECT_PATTERN.test(value)) throw new CanaryRolloutError("VALIDATION_ERROR", "subjectKey must be a bounded opaque key");
};

const assertEventId = (value: string): void => {
  if (!EVENT_PATTERN.test(value)) throw new CanaryRolloutError("VALIDATION_ERROR", "eventId must be a bounded opaque key");
};

const assertIdempotencyKey = (value: string): void => {
  if (!IDEMPOTENCY_PATTERN.test(value)) throw new CanaryRolloutError("VALIDATION_ERROR", "idempotencyKey is invalid");
};

const assertPercent = (value: number): void => {
  if (!Number.isInteger(value) || value < 0 || value > 100) throw new CanaryRolloutError("VALIDATION_ERROR", "cohortPercent must be an integer from 0 to 100");
};

const assertDependencies = (dependencies: CanaryDependencies): void => {
  const keys: readonly (keyof CanaryDependencies)[] = ["tenantActive", "channelHealthy", "chatBundleReady", "groundedKnowledgeReady", "handoffReady", "rollbackReady"];
  if (!keys.every((key) => typeof dependencies[key] === "boolean")) throw new CanaryRolloutError("VALIDATION_ERROR", "all canary dependencies are required");
};

const dependenciesReady = (dependencies: CanaryDependencies): boolean => Object.values(dependencies).every(Boolean);

const stableHash = (secret: Uint8Array, value: string): number => {
  const digest = createHmac("sha256", secret).update(value, "utf8").digest();
  return digest.readUInt32BE(0) % 100;
};

const deterministicId = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32);

const windowKeyFor = (date: Date): string => `UTC-DAY-${Math.floor(date.getTime() / DAY_MS)}`;
const unique = (values: readonly string[]): string[] => [...new Set(values)].sort();

const reconcileEmpty = (tenantId: string, checkedAt: string): CanaryReconciliation => ({
  tenantId,
  status: "MATCH",
  checkedAt,
  observationCount: 0,
  duplicateEventIds: [],
  outOfCohortEventIds: [],
  unexpectedTenantEventIds: [],
  staleFlagEventIds: [],
  invalidOutcomeEventIds: [],
});

export class CanaryRolloutController {
  private readonly flags = new Map<string, CanaryFlag>();
  private readonly idempotency = new Map<string, { requestHash: string; flag: CanaryFlag }>();
  private readonly samplingJobs = new Map<string, CanarySamplingJob>();

  private readonly secret: Uint8Array;

  constructor(cohortSecret: Uint8Array | string) {
    const secret = typeof cohortSecret === "string" ? Buffer.from(cohortSecret, "utf8") : cohortSecret;
    if (secret.byteLength < MIN_SECRET_BYTES) throw new CanaryRolloutError("INVALID_COHORT_SECRET", "cohort secret must be at least 32 bytes");
    this.secret = new Uint8Array(secret);
  }

  configurePilot(input: { tenantId: string; featureKey: CanaryFeatureKey; cohortPercent: number; dependencies: CanaryDependencies; reason: string; idempotencyKey: string; now?: Date }): CanaryFlag {
    assertTenantId(input.tenantId);
    assertPercent(input.cohortPercent);
    assertDependencies(input.dependencies);
    assertIdempotencyKey(input.idempotencyKey);
    if (!input.reason.trim() || input.reason.length > 256) throw new CanaryRolloutError("AUDIT_REASON_REQUIRED", "reason is required and must be bounded");
    const requestHash = JSON.stringify({ featureKey: input.featureKey, cohortPercent: input.cohortPercent, dependencies: input.dependencies, reason: input.reason });
    const idempotencyIndex = `${input.tenantId}:${input.idempotencyKey}`;
    const prior = this.idempotency.get(idempotencyIndex);
    if (prior) {
      if (prior.requestHash !== requestHash) throw new CanaryRolloutError("IDEMPOTENCY_CONFLICT", "idempotency key was reused with different canary input");
      return clone(prior.flag);
    }
    const now = input.now ?? new Date();
    const current = this.flags.get(`${input.tenantId}:${input.featureKey}`);
    const ready = dependenciesReady(input.dependencies) && input.cohortPercent > 0;
    const flag: CanaryFlag = {
      tenantId: input.tenantId,
      featureKey: input.featureKey,
      version: (current?.version ?? 0) + 1,
      state: ready ? "PILOT" : "OFF",
      enabled: ready,
      cohortPercent: ready ? input.cohortPercent : 0,
      audience: "STAFF_SUPERVISED",
      reason: ready ? input.reason.trim() : "fail-closed: canary dependency is not ready",
      updatedAt: toIso(now),
    };
    this.flags.set(`${input.tenantId}:${input.featureKey}`, flag);
    this.idempotency.set(idempotencyIndex, { requestHash, flag: clone(flag) });
    return clone(flag);
  }

  rollback(input: { tenantId: string; featureKey: CanaryFeatureKey; reason: string; idempotencyKey: string; now?: Date }): CanaryFlag {
    assertTenantId(input.tenantId);
    assertIdempotencyKey(input.idempotencyKey);
    if (!input.reason.trim() || input.reason.length > 256) throw new CanaryRolloutError("AUDIT_REASON_REQUIRED", "reason is required and must be bounded");
    const requestHash = JSON.stringify({ featureKey: input.featureKey, reason: input.reason });
    const idempotencyIndex = `${input.tenantId}:${input.idempotencyKey}`;
    const prior = this.idempotency.get(idempotencyIndex);
    if (prior) {
      if (prior.requestHash !== requestHash) throw new CanaryRolloutError("IDEMPOTENCY_CONFLICT", "idempotency key was reused with different rollback input");
      return clone(prior.flag);
    }
    const now = input.now ?? new Date();
    const current = this.flags.get(`${input.tenantId}:${input.featureKey}`);
    const flag: CanaryFlag = {
      tenantId: input.tenantId,
      featureKey: input.featureKey,
      version: (current?.version ?? 0) + 1,
      state: "OFF",
      enabled: false,
      cohortPercent: 0,
      audience: "STAFF_SUPERVISED",
      reason: input.reason.trim(),
      updatedAt: toIso(now),
    };
    this.flags.set(`${input.tenantId}:${input.featureKey}`, flag);
    this.idempotency.set(idempotencyIndex, { requestHash, flag: clone(flag) });
    return clone(flag);
  }

  getFlag(tenantId: string, featureKey: CanaryFeatureKey): CanaryFlag | undefined {
    assertTenantId(tenantId);
    const flag = this.flags.get(`${tenantId}:${featureKey}`);
    return flag ? clone(flag) : undefined;
  }

  isInCohort(tenantId: string, featureKey: CanaryFeatureKey, subjectKey: string): boolean {
    assertTenantId(tenantId);
    assertSubjectKey(subjectKey);
    const flag = this.flags.get(`${tenantId}:${featureKey}`);
    if (!flag || flag.state !== "PILOT" || !flag.enabled || flag.cohortPercent <= 0) return false;
    if (flag.cohortPercent >= 100) return true;
    return stableHash(this.secret, `${tenantId}:${featureKey}:${subjectKey}`) < flag.cohortPercent;
  }

  resolve(input: { tenantId: string; featureKey: CanaryFeatureKey; subjectKey: string; dependencies: CanaryDependencies }): CanaryDecision {
    assertTenantId(input.tenantId);
    assertSubjectKey(input.subjectKey);
    assertDependencies(input.dependencies);
    const flag = this.flags.get(`${input.tenantId}:${input.featureKey}`);
    if (!flag || !flag.enabled || flag.state !== "PILOT") return { tenantId: input.tenantId, route: "HANDOFF", reasonCode: "CANARY_DISABLED", flagVersion: flag?.version ?? null, cohortPercent: flag?.cohortPercent ?? 0 };
    if (!dependenciesReady(input.dependencies)) return { tenantId: input.tenantId, route: "HANDOFF", reasonCode: "DEPENDENCY_NOT_READY", flagVersion: flag.version, cohortPercent: flag.cohortPercent };
    if (!this.isInCohort(input.tenantId, input.featureKey, input.subjectKey)) return { tenantId: input.tenantId, route: "HANDOFF", reasonCode: "OUT_OF_COHORT", flagVersion: flag.version, cohortPercent: flag.cohortPercent };
    return { tenantId: input.tenantId, route: "AI_CHAT", reasonCode: "CANARY_ENABLED", flagVersion: flag.version, cohortPercent: flag.cohortPercent };
  }

  reconcile(input: { tenantId: string; featureKey: CanaryFeatureKey; dependencies: CanaryDependencies; observations: readonly CanaryObservation[]; now?: Date }): CanaryReconciliation {
    assertTenantId(input.tenantId);
    assertDependencies(input.dependencies);
    const checkedAt = toIso(input.now ?? new Date());
    const duplicateEventIds: string[] = [];
    const outOfCohortEventIds: string[] = [];
    const unexpectedTenantEventIds: string[] = [];
    const staleFlagEventIds: string[] = [];
    const invalidOutcomeEventIds: string[] = [];
    const seen = new Set<string>();
    const currentFlag = this.flags.get(`${input.tenantId}:${input.featureKey}`);
    for (const observation of input.observations) {
      assertEventId(observation.eventId);
      if (seen.has(observation.eventId)) duplicateEventIds.push(observation.eventId);
      seen.add(observation.eventId);
      if (observation.tenantId !== input.tenantId) {
        unexpectedTenantEventIds.push(observation.eventId);
        continue;
      }
      assertSubjectKey(observation.subjectKey);
      if (!["ANSWER", "CLARIFY", "HANDOFF"].includes(observation.outcome)) invalidOutcomeEventIds.push(observation.eventId);
      if (observation.route === "AI_CHAT" && (!currentFlag || observation.flagVersion !== currentFlag.version || !this.isInCohort(input.tenantId, input.featureKey, observation.subjectKey) || !dependenciesReady(input.dependencies))) outOfCohortEventIds.push(observation.eventId);
      if (observation.route === "AI_CHAT" && currentFlag && observation.flagVersion !== currentFlag.version) staleFlagEventIds.push(observation.eventId);
    }
    const allIssues = [duplicateEventIds, outOfCohortEventIds, unexpectedTenantEventIds, staleFlagEventIds, invalidOutcomeEventIds];
    return {
      tenantId: input.tenantId,
      status: allIssues.some((items) => items.length > 0) ? "MISMATCH" : "MATCH",
      checkedAt,
      observationCount: input.observations.length,
      duplicateEventIds: unique(duplicateEventIds),
      outOfCohortEventIds: unique(outOfCohortEventIds),
      unexpectedTenantEventIds: unique(unexpectedTenantEventIds),
      staleFlagEventIds: unique(staleFlagEventIds),
      invalidOutcomeEventIds: unique(invalidOutcomeEventIds),
    };
  }

  scheduleSampling(input: { tenantId: string; now?: Date; intervalMs?: number; sampleLimit?: number }): CanarySamplingJob {
    assertTenantId(input.tenantId);
    const now = input.now ?? new Date();
    const intervalMs = input.intervalMs ?? DAY_MS;
    const sampleLimit = input.sampleLimit ?? 100;
    if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0 || intervalMs > 30 * DAY_MS) throw new CanaryRolloutError("VALIDATION_ERROR", "intervalMs must be bounded and positive");
    if (!Number.isSafeInteger(sampleLimit) || sampleLimit <= 0 || sampleLimit > 1_000) throw new CanaryRolloutError("VALIDATION_ERROR", "sampleLimit must be bounded and positive");
    const windowKey = windowKeyFor(now);
    const key = `${input.tenantId}:${windowKey}`;
    const prior = this.samplingJobs.get(key);
    if (prior) return clone(prior);
    const createdAt = toIso(now);
    const job: CanarySamplingJob = {
      id: deterministicId(`canary-sample:${key}`),
      tenantId: input.tenantId,
      windowKey,
      dueAt: toIso(new Date(now.getTime() + intervalMs)),
      sampleLimit,
      status: "SCHEDULED",
      createdAt,
    };
    this.samplingJobs.set(key, job);
    return clone(job);
  }

  runDueSampling(input: { tenantId: string; featureKey: CanaryFeatureKey; dependencies: CanaryDependencies; observations: readonly CanaryObservation[]; now?: Date }): CanarySampleRun {
    assertTenantId(input.tenantId);
    const now = input.now ?? new Date();
    const key = `${input.tenantId}:${windowKeyFor(now)}`;
    const job = this.samplingJobs.get(key);
    const checkedAt = toIso(now);
    if (!job || job.status !== "SCHEDULED" || job.dueAt > checkedAt) return { jobId: job?.id ?? deterministicId(`canary-sample:${key}`), tenantId: input.tenantId, status: "NOT_DUE", selectedEventIds: [], reconciled: reconcileEmpty(input.tenantId, checkedAt) };
    const reconciled = this.reconcile({ ...input, observations: input.observations.slice(0, job.sampleLimit), now });
    if (reconciled.status === "MISMATCH") return { jobId: job.id, tenantId: input.tenantId, status: "FAIL_CLOSED", selectedEventIds: [], reconciled };
    job.status = "COMPLETED";
    job.completedAt = checkedAt;
    this.samplingJobs.set(key, job);
    return { jobId: job.id, tenantId: input.tenantId, status: "SAMPLED", selectedEventIds: input.observations.slice(0, job.sampleLimit).map((observation) => observation.eventId), reconciled: clone(reconciled) };
  }

  static constantTimeEqual(left: string, right: string): boolean {
    const leftBytes = Buffer.from(left, "utf8");
    const rightBytes = Buffer.from(right, "utf8");
    return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
  }
}

