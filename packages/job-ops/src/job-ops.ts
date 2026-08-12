import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "RETRY_WAIT" | "DEAD" | "QUARANTINED" | "CANCELLED";
export type JobOwner = "BE" | "SRE" | "AI" | "MESSAGING" | "CONTENT" | "DATA";
export type JobActorRole = "TENANT_ADMIN" | "EXECUTIVE";

export class JobOperationsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "JobOperationsError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JOB_TYPE_PATTERN = /^[a-z][a-z0-9_.-]{2,127}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.-]{2,199}$/;
const SENSITIVE_KEY_PATTERN = /authorization|password|secret|token|cookie|phone|mobile|email|address|location|prompt|content|raw|pii|api[-_]?key/i;
const MIN_CRON_SECRET_BYTES = 32;

const assertUuid = (value: string, field: string): void => {
  if (!UUID_PATTERN.test(value)) throw new JobOperationsError("VALIDATION_ERROR", `${field} must be a UUID`);
};

const assertIso = (value: string, field: string): void => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) || Number.isNaN(Date.parse(value))) throw new JobOperationsError("VALIDATION_ERROR", `${field} must be canonical UTC ISO`);
};

const stableSerialize = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const digest = (value: unknown): string => createHash("sha256").update(stableSerialize(value)).digest("hex");

const deterministicUuid = (seed: string): string => {
  const hex = digest(seed);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

const validateSafePayload = (payload: Record<string, unknown>): Record<string, unknown> => {
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEY_PATTERN.test(key) || (value !== null && typeof value === "object")) throw new JobOperationsError("UNSAFE_PAYLOAD", "Job payload must contain bounded non-sensitive scalar references only");
    if (typeof value === "string" && value.length > 256) throw new JobOperationsError("UNSAFE_PAYLOAD", "Job payload reference is too long");
  }
  return clone(payload);
};

export type JobDefinition = {
  jobType: string;
  version: number;
  owner: JobOwner;
  purpose: string;
  sloTargetMs: number;
  maxAttempts: number;
  retryBackoffMs: readonly number[];
  poisonErrorCodes: readonly string[];
  idempotencyKey: string;
  runbookId: string;
};

export const JOB_DEFINITIONS = [
  { jobType: "document.process", version: 1, owner: "CONTENT", purpose: "Process quarantined document through the approved lifecycle", sloTargetMs: 300_000, maxAttempts: 4, retryBackoffMs: [5_000, 30_000, 120_000, 600_000], poisonErrorCodes: ["UNSAFE_PAYLOAD", "SCHEMA_MISMATCH"], idempotencyKey: "documentId:version", runbookId: "document-processing" },
  { jobType: "document.expiry", version: 1, owner: "CONTENT", purpose: "Retire expired source versions without touching active approved data", sloTargetMs: 3_600_000, maxAttempts: 3, retryBackoffMs: [30_000, 300_000, 1_800_000], poisonErrorCodes: ["TENANT_SCOPE_VIOLATION"], idempotencyKey: "documentId:expiryAt", runbookId: "document-expiry" },
  { jobType: "news.publish", version: 1, owner: "CONTENT", purpose: "Publish scheduled approved news revision and enqueue delivery", sloTargetMs: 300_000, maxAttempts: 4, retryBackoffMs: [5_000, 30_000, 120_000, 600_000], poisonErrorCodes: ["TENANT_SCOPE_VIOLATION", "SCHEMA_MISMATCH"], idempotencyKey: "newsId:revision", runbookId: "news-publish" },
  { jobType: "support.sla.scan", version: 1, owner: "BE", purpose: "Scan SLA windows and reconcile support ownership", sloTargetMs: 60_000, maxAttempts: 3, retryBackoffMs: [5_000, 30_000, 120_000], poisonErrorCodes: ["TENANT_SCOPE_VIOLATION"], idempotencyKey: "tenantId:watermark", runbookId: "support-sla" },
  { jobType: "kpi.snapshot", version: 1, owner: "DATA", purpose: "Materialize immutable KPI snapshot and reconciliation", sloTargetMs: 900_000, maxAttempts: 4, retryBackoffMs: [30_000, 120_000, 600_000, 1_800_000], poisonErrorCodes: ["TENANT_SCOPE_VIOLATION", "RECONCILIATION_MISMATCH"], idempotencyKey: "tenantId:metric:period:watermark", runbookId: "kpi-snapshot" },
  { jobType: "notification.dispatch", version: 1, owner: "MESSAGING", purpose: "Dispatch an already-approved notification through the provider boundary", sloTargetMs: 60_000, maxAttempts: 5, retryBackoffMs: [5_000, 30_000, 120_000, 600_000, 1_800_000], poisonErrorCodes: ["UNSAFE_PAYLOAD", "TENANT_SCOPE_VIOLATION"], idempotencyKey: "notificationId:channel", runbookId: "notification-dispatch" },
  { jobType: "line.webhook.process", version: 1, owner: "MESSAGING", purpose: "Process one encrypted LINE inbox event through the canonical chat boundary", sloTargetMs: 30_000, maxAttempts: 3, retryBackoffMs: [1_000, 10_000, 60_000], poisonErrorCodes: ["UNSAFE_PAYLOAD", "TENANT_SCOPE_VIOLATION", "CHAT_INVALID_OUTPUT"], idempotencyKey: "channelRecordId:webhookEventId", runbookId: "line-chat-consumer" },
  { jobType: "line.message.delivery", version: 1, owner: "MESSAGING", purpose: "Deliver one idempotent canonical LINE response through the provider boundary", sloTargetMs: 30_000, maxAttempts: 3, retryBackoffMs: [1_000, 10_000, 60_000], poisonErrorCodes: ["UNSAFE_PAYLOAD", "TENANT_SCOPE_VIOLATION", "PROVIDER_MALFORMED_RESPONSE"], idempotencyKey: "messageId:idempotencyKey", runbookId: "line-provider-delivery" },
  { jobType: "knowledge.index", version: 1, owner: "AI", purpose: "Index only approved active document versions", sloTargetMs: 900_000, maxAttempts: 4, retryBackoffMs: [30_000, 120_000, 600_000, 1_800_000], poisonErrorCodes: ["UNSAFE_PAYLOAD", "TENANT_SCOPE_VIOLATION", "CONFLICT_UNRESOLVED"], idempotencyKey: "documentVersionId:indexVersion", runbookId: "knowledge-index" },
  { jobType: "audit.export", version: 1, owner: "SRE", purpose: "Build an authorized redacted export with watermark and expiry", sloTargetMs: 900_000, maxAttempts: 3, retryBackoffMs: [30_000, 300_000, 1_800_000], poisonErrorCodes: ["UNSAFE_PAYLOAD", "TENANT_SCOPE_VIOLATION"], idempotencyKey: "exportId:watermark", runbookId: "audit-export" },
] as const satisfies readonly JobDefinition[];

export const CORE_RECONCILIATION_JOB_TYPES = ["document.expiry", "news.publish", "support.sla.scan", "kpi.snapshot"] as const;

const definitionFor = (jobType: string): JobDefinition => {
  const definition = JOB_DEFINITIONS.find((candidate) => candidate.jobType === jobType);
  if (!definition) throw new JobOperationsError("UNKNOWN_JOB_TYPE", `Unknown job type ${jobType}`);
  return definition;
};

export type JobRecord = {
  id: string;
  tenantId: string;
  jobType: string;
  jobVersion: number;
  idempotencyKey: string;
  payloadRefs: Record<string, unknown>;
  status: JobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  errorCode?: string;
  deadLetterReason?: string;
  quarantinedAt?: string;
  replayOf?: string;
  replayCount: number;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
};

export type JobView = Omit<JobRecord, "payloadRefs"> & { owner: JobOwner; purpose: string; sloTargetMs: number; runbookId: string };

export type JobAuditEvent = {
  id: string;
  tenantId: string;
  jobId: string;
  action: "ENQUEUED" | "CLAIMED" | "RETRIED" | "FAILED" | "QUARANTINED" | "REPLAYED" | "RECONCILED";
  actorType: "SYSTEM" | "STAFF";
  reason: string;
  createdAt: string;
  previousHash?: string;
  integrityHash: string;
};

export type JobReconciliation = {
  tenantId: string;
  expectedJobTypes: readonly string[];
  missingJobTypes: readonly string[];
  unexpectedJobTypes: readonly string[];
  deadJobIds: readonly string[];
  quarantinedJobIds: readonly string[];
  duplicateIdempotencyKeys: readonly string[];
  status: "MATCH" | "MISMATCH";
  checkedAt: string;
};

export type JobOperationsSnapshot = {
  definitions: readonly JobDefinition[];
  jobs: readonly JobView[];
  dlq: readonly JobView[];
  reconciliation: JobReconciliation;
  audit: readonly JobAuditEvent[];
  generatedAt: string;
};

export type EnqueueJobInput = {
  tenantId: string;
  jobType: string;
  idempotencyKey: string;
  payloadRefs: Record<string, unknown>;
  correlationId: string;
  now?: Date;
};

const toIso = (value: Date): string => value.toISOString();

export class JobOperationsRepository {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly idempotency = new Map<string, { hash: string; jobId: string }>();
  private readonly replayIdempotency = new Map<string, { hash: string; replayJobId: string }>();
  private readonly audit: JobAuditEvent[] = [];

  enqueue(input: EnqueueJobInput): JobRecord {
    assertUuid(input.tenantId, "tenantId");
    assertUuid(input.correlationId, "correlationId");
    if (!IDEMPOTENCY_PATTERN.test(input.idempotencyKey)) throw new JobOperationsError("VALIDATION_ERROR", "idempotencyKey is invalid");
    const definition = definitionFor(input.jobType);
    const payloadRefs = validateSafePayload(input.payloadRefs);
    const requestHash = digest({ jobType: input.jobType, version: definition.version, payloadRefs });
    const indexKey = `${input.tenantId}:${input.idempotencyKey}`;
    const existing = this.idempotency.get(indexKey);
    if (existing) {
      if (existing.hash !== requestHash) throw new JobOperationsError("IDEMPOTENCY_CONFLICT", "Idempotency key was reused with a different payload");
      return clone(this.jobs.get(existing.jobId)!);
    }
    const now = input.now ?? new Date();
    const createdAt = toIso(now);
    const job: JobRecord = {
      id: deterministicUuid(`${input.tenantId}:${input.idempotencyKey}`),
      tenantId: input.tenantId,
      jobType: input.jobType,
      jobVersion: definition.version,
      idempotencyKey: input.idempotencyKey,
      payloadRefs,
      status: "QUEUED",
      attemptCount: 0,
      maxAttempts: definition.maxAttempts,
      nextAttemptAt: createdAt,
      replayCount: 0,
      correlationId: input.correlationId,
      createdAt,
      updatedAt: createdAt,
    };
    this.jobs.set(job.id, job);
    this.idempotency.set(indexKey, { hash: requestHash, jobId: job.id });
    this.appendAudit(job, "ENQUEUED", "SYSTEM", "Job accepted with tenant-scoped idempotency key", now);
    return clone(job);
  }

  claim(jobId: string, workerId: string, now = new Date(), leaseMs = 30_000): JobRecord {
    const job = this.requireJob(jobId);
    if (!workerId || !Number.isSafeInteger(leaseMs) || leaseMs <= 0) throw new JobOperationsError("VALIDATION_ERROR", "worker and lease are required");
    if (!["QUEUED", "RETRY_WAIT"].includes(job.status) || job.nextAttemptAt > toIso(now)) throw new JobOperationsError("INVALID_STATE", "Only due queued jobs can be claimed");
    job.status = "RUNNING";
    job.attemptCount += 1;
    job.leaseOwner = workerId;
    job.leaseExpiresAt = toIso(new Date(now.getTime() + leaseMs));
    job.updatedAt = toIso(now);
    this.appendAudit(job, "CLAIMED", "SYSTEM", `Worker lease claimed attempt ${job.attemptCount}`, now);
    return clone(job);
  }

  heartbeat(jobId: string, workerId: string, now = new Date(), leaseMs = 30_000): boolean {
    const job = this.requireJob(jobId);
    if (job.status !== "RUNNING" || job.leaseOwner !== workerId || !job.leaseExpiresAt || job.leaseExpiresAt <= toIso(now)) return false;
    job.leaseExpiresAt = toIso(new Date(now.getTime() + leaseMs));
    job.updatedAt = toIso(now);
    return true;
  }

  complete(jobId: string, workerId: string, now = new Date()): JobRecord {
    const job = this.requireOwned(jobId, workerId, now);
    job.status = "SUCCEEDED";
    job.leaseOwner = undefined;
    job.leaseExpiresAt = undefined;
    job.updatedAt = toIso(now);
    return clone(job);
  }

  fail(jobId: string, workerId: string, input: { errorCode: string; retryable: boolean; reason?: string; now?: Date }): JobRecord {
    const now = input.now ?? new Date();
    const job = this.requireOwned(jobId, workerId, now);
    const definition = definitionFor(job.jobType);
    job.errorCode = input.errorCode.slice(0, 64);
    job.leaseOwner = undefined;
    job.leaseExpiresAt = undefined;
    job.updatedAt = toIso(now);
    const poison = definition.poisonErrorCodes.includes(input.errorCode);
    if (poison) {
      job.status = "QUARANTINED";
      job.deadLetterReason = input.reason?.slice(0, 256) ?? "Poison message quarantined";
      job.quarantinedAt = toIso(now);
      this.appendAudit(job, "QUARANTINED", "SYSTEM", job.deadLetterReason, now);
    } else if (input.retryable && job.attemptCount < job.maxAttempts) {
      const retryDelay = definition.retryBackoffMs[Math.min(job.attemptCount - 1, definition.retryBackoffMs.length - 1)]!;
      job.status = "RETRY_WAIT";
      job.nextAttemptAt = toIso(new Date(now.getTime() + retryDelay));
      this.appendAudit(job, "RETRIED", "SYSTEM", `Retry scheduled after ${retryDelay}ms`, now);
    } else {
      job.status = "DEAD";
      job.deadLetterReason = input.reason?.slice(0, 256) ?? "Maximum attempts exhausted";
      this.appendAudit(job, "FAILED", "SYSTEM", job.deadLetterReason, now);
    }
    return clone(job);
  }

  replay(input: { tenantId: string; actor: { accountId: string; role: JobActorRole }; jobId: string; reason: string; idempotencyKey: string; quarantineApproved?: boolean; now?: Date }): JobRecord {
    assertUuid(input.tenantId, "tenantId");
    assertUuid(input.actor.accountId, "accountId");
    const original = this.requireJob(input.jobId);
    if (original.tenantId !== input.tenantId) throw new JobOperationsError("FORBIDDEN", "Job belongs to another tenant");
    if (input.actor.role !== "TENANT_ADMIN") throw new JobOperationsError("FORBIDDEN", "Only tenant admin can replay a job");
    if (!input.reason.trim() || input.reason.length > 500) throw new JobOperationsError("AUDIT_REASON_REQUIRED", "Replay reason is required");
    if (!IDEMPOTENCY_PATTERN.test(input.idempotencyKey)) throw new JobOperationsError("VALIDATION_ERROR", "Replay idempotencyKey is invalid");
    if (!["DEAD", "QUARANTINED"].includes(original.status)) throw new JobOperationsError("INVALID_STATE", "Only DLQ or quarantined jobs can be replayed");
    if (original.status === "QUARANTINED" && input.quarantineApproved !== true) throw new JobOperationsError("QUARANTINE_APPROVAL_REQUIRED", "Quarantined jobs require explicit approval");
    const now = input.now ?? new Date();
    const replayIndex = `${input.tenantId}:${input.idempotencyKey}`;
    const replayHash = digest({ jobId: original.id, reason: input.reason.trim(), quarantineApproved: input.quarantineApproved === true });
    const existingReplay = this.replayIdempotency.get(replayIndex);
    if (existingReplay) {
      if (existingReplay.hash !== replayHash) throw new JobOperationsError("IDEMPOTENCY_CONFLICT", "Replay idempotency key was reused with different input");
      return clone(this.jobs.get(existingReplay.replayJobId)!);
    }
    const replayKey = `${original.idempotencyKey}:replay:${original.replayCount + 1}`;
    const replay = this.enqueue({ tenantId: original.tenantId, jobType: original.jobType, idempotencyKey: replayKey, payloadRefs: original.payloadRefs, correlationId: original.correlationId, now });
    original.replayCount += 1;
    original.updatedAt = toIso(now);
    replay.replayOf = original.id;
    replay.replayCount = 0;
    this.jobs.set(replay.id, replay);
    this.replayIdempotency.set(replayIndex, { hash: replayHash, replayJobId: replay.id });
    this.appendAudit(original, "REPLAYED", "STAFF", `Authorized replay by ${input.actor.accountId}: ${input.reason.trim()}`, now);
    return clone(replay);
  }

  listForTenant(tenantId: string): JobView[] {
    assertUuid(tenantId, "tenantId");
    return [...this.jobs.values()].filter((job) => job.tenantId === tenantId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)).map((job) => this.toView(job));
  }

  listDlq(tenantId: string): JobView[] {
    return this.listForTenant(tenantId).filter((job) => job.status === "DEAD" || job.status === "QUARANTINED");
  }

  reconcile(tenantId: string, expectedJobTypes: readonly string[] = CORE_RECONCILIATION_JOB_TYPES, now = new Date()): JobReconciliation {
    assertUuid(tenantId, "tenantId");
    expectedJobTypes.forEach((jobType) => { definitionFor(jobType); });
    const jobs = [...this.jobs.values()].filter((job) => job.tenantId === tenantId);
    const expectedSet = new Set(expectedJobTypes);
    const expectedJobs = jobs.filter((job) => expectedSet.has(job.jobType));
    const present = new Set(jobs.map((job) => job.jobType));
    const idempotencyCounts = new Map<string, number>();
    expectedJobs.forEach((job) => idempotencyCounts.set(job.idempotencyKey, (idempotencyCounts.get(job.idempotencyKey) ?? 0) + 1));
    const duplicateIdempotencyKeys = [...idempotencyCounts.entries()].filter(([, count]) => count > 1).map(([key]) => key);
    const missingJobTypes = expectedJobTypes.filter((jobType) => !present.has(jobType));
    const unexpectedJobTypes = jobs.map((job) => job.jobType).filter((jobType) => !expectedJobTypes.includes(jobType));
    const deadJobIds = expectedJobs.filter((job) => job.status === "DEAD").map((job) => job.id);
    const quarantinedJobIds = expectedJobs.filter((job) => job.status === "QUARANTINED").map((job) => job.id);
    const result: JobReconciliation = { tenantId, expectedJobTypes: [...expectedJobTypes], missingJobTypes, unexpectedJobTypes, deadJobIds, quarantinedJobIds, duplicateIdempotencyKeys, status: missingJobTypes.length || duplicateIdempotencyKeys.length || deadJobIds.length || quarantinedJobIds.length ? "MISMATCH" : "MATCH", checkedAt: toIso(now) };
    this.appendAudit({ id: deterministicUuid(`${tenantId}:reconcile:${result.checkedAt}`), tenantId, jobType: "reconciliation", jobVersion: 1, idempotencyKey: "reconciliation", payloadRefs: {}, status: "SUCCEEDED", attemptCount: 0, maxAttempts: 0, nextAttemptAt: result.checkedAt, replayCount: 0, correlationId: deterministicUuid(`${tenantId}:reconcile:correlation`), createdAt: result.checkedAt, updatedAt: result.checkedAt }, "RECONCILED", "SYSTEM", `Job reconciliation ${result.status}`, now);
    return clone(result);
  }

  auditForTenant(tenantId: string): JobAuditEvent[] {
    assertUuid(tenantId, "tenantId");
    return this.audit.filter((event) => event.tenantId === tenantId).map(clone);
  }

  snapshot(tenantId: string, now = new Date()): JobOperationsSnapshot {
    const jobs = this.listForTenant(tenantId);
    return { definitions: JOB_DEFINITIONS.map(clone), jobs, dlq: jobs.filter((job) => job.status === "DEAD" || job.status === "QUARANTINED"), reconciliation: this.reconcile(tenantId, CORE_RECONCILIATION_JOB_TYPES, now), audit: this.auditForTenant(tenantId), generatedAt: toIso(now) };
  }

  private toView(job: JobRecord): JobView {
    const definition = definitionFor(job.jobType);
    const { payloadRefs: _payloadRefs, ...view } = clone(job);
    return { ...view, owner: definition.owner, purpose: definition.purpose, sloTargetMs: definition.sloTargetMs, runbookId: definition.runbookId };
  }

  private requireJob(jobId: string): JobRecord {
    assertUuid(jobId, "jobId");
    const job = this.jobs.get(jobId);
    if (!job) throw new JobOperationsError("NOT_FOUND", "Job was not found");
    return job;
  }

  private requireOwned(jobId: string, workerId: string, now: Date): JobRecord {
    const job = this.requireJob(jobId);
    if (job.status !== "RUNNING" || job.leaseOwner !== workerId || !job.leaseExpiresAt || job.leaseExpiresAt <= toIso(now)) throw new JobOperationsError("LEASE_INVALID", "Job lease is missing, expired or owned by another worker");
    return job;
  }

  private appendAudit(job: JobRecord, action: JobAuditEvent["action"], actorType: JobAuditEvent["actorType"], reason: string, now: Date): void {
    const previousHash = this.audit.at(-1)?.integrityHash;
    const partial: Omit<JobAuditEvent, "integrityHash"> = { id: deterministicUuid(`${job.id}:${action}:${job.attemptCount}:${now.toISOString()}:${this.audit.length}`), tenantId: job.tenantId, jobId: job.id, action, actorType, reason: reason.slice(0, 500), createdAt: toIso(now), ...(previousHash ? { previousHash } : {}) };
    this.audit.push({ ...partial, integrityHash: digest(partial) });
  }
}

export const signCronRequest = (secret: string, timestamp: string, body: string): string => {
  if (Buffer.byteLength(secret, "utf8") < MIN_CRON_SECRET_BYTES) throw new JobOperationsError("INVALID_CRON_SECRET", "Cron secret must be at least 32 bytes");
  assertIso(timestamp, "timestamp");
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex")}`;
};

export const verifyCronRequest = (input: { secret: string; timestamp: string; body: string; signature: string; now?: Date; maxSkewMs?: number }): boolean => {
  try {
    const now = input.now ?? new Date();
    const maxSkewMs = input.maxSkewMs ?? 300_000;
    if (Math.abs(now.getTime() - Date.parse(input.timestamp)) > maxSkewMs) return false;
    const expected = signCronRequest(input.secret, input.timestamp, input.body);
    const expectedBytes = Buffer.from(expected, "utf8");
    const actualBytes = Buffer.from(input.signature, "utf8");
    return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
  } catch {
    return false;
  }
};

export const jobDefinition = (jobType: string): JobDefinition => definitionFor(jobType);

export * from "./canary-rollout";
export * from "./rollout-checkpoints";
export * from "./hypercare-monitor";
export * from "./operations-handoff";
export * from "./continuous-correctness";
export * from "./release-close";
