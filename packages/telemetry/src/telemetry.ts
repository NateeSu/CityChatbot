import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

export type RuntimeEnvironment = "local" | "test" | "staging" | "production";
export type ActorType = "CITIZEN" | "STAFF" | "SYSTEM" | "SUPER_ADMIN";
export type LogSeverity = "debug" | "info" | "warn" | "error";
export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "RETRY_WAIT" | "DEAD" | "CANCELLED";

export class TelemetryContractError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "TelemetryContractError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+$/;
const ACTION_PATTERN = /^[a-z][a-z0-9_.-]{1,127}$/;
const SENSITIVE_FIELD_PATTERN = /authorization|password|secret|token|cookie|phone|mobile|email|address|location|citizen|prompt|document|raw|pii|api[-_]?key|service[-_]?role/i;
const EVENT_PII_FIELD_PATTERN = /authorization|password|secret|token|cookie|phone|mobile|email|address|location|citizen(?!_?id)|prompt|document(?!_?id)|raw|pii|api[-_]?key|service[-_]?role|description|content/i;
const MIN_SECRET_BYTES = 32;
const RETRY_SCHEDULE_MS = [5_000, 30_000, 120_000, 600_000, 1_800_000] as const;

const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

const assertUuid = (value: string, code: string): void => {
  if (!isUuid(value)) throw new TelemetryContractError(code, "Identifier must be a UUID");
};

const stableSerialize = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
};

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const redactValue = (value: unknown, parentKey?: string): unknown => {
  if (parentKey && SENSITIVE_FIELD_PATTERN.test(parentKey)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactValue(child, key)]));
  }
  return value;
};

export const redactStructuredValue = <T>(value: T): T => redactValue(value) as T;

export const redactErrorDetail = (detail: unknown, maxLength = 500): string => {
  const source = typeof detail === "string" ? detail : detail instanceof Error ? detail.message : "Unknown processing error";
  return source
    .replace(/(bearer\s+)[a-z0-9._~-]+/gi, "$1[REDACTED]")
    .replace(/(authorization|password|secret|token|cookie|phone|mobile|email|address|location|api[-_]?key)\s*[=:]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, maxLength);
};

const hashKey = (secret: string): Buffer => {
  const key = Buffer.from(secret, "utf8");
  if (key.byteLength < MIN_SECRET_BYTES) throw new TelemetryContractError("INVALID_REDACTION_SECRET", "Pseudonymization secret is too short");
  return key;
};

export const pseudonymizeTenantId = (tenantId: string, secret: string): string => {
  assertUuid(tenantId, "INVALID_TENANT_ID");
  return createHmac("sha256", hashKey(secret)).update(tenantId).digest("hex").slice(0, 24);
};

export type CorrelationContext = {
  requestId: string;
  correlationId: string;
  causationId?: string;
};

export const createCorrelationContext = (input: Partial<CorrelationContext> = {}): CorrelationContext => {
  for (const id of [input.requestId, input.correlationId, input.causationId]) {
    if (id !== undefined) assertUuid(id, "INVALID_CORRELATION_ID");
  }
  return {
    requestId: input.requestId ?? randomUUID(),
    correlationId: input.correlationId ?? input.requestId ?? randomUUID(),
    ...(input.causationId ? { causationId: input.causationId } : {}),
  };
};

export type StructuredLogRecord = {
  timestamp: string;
  severity: LogSeverity;
  service: string;
  module: string;
  environment: RuntimeEnvironment;
  requestId: string;
  correlationId: string;
  causationId?: string;
  tenantHash?: string;
  actorType: ActorType;
  routeOrJob: string;
  latencyMs?: number;
  status?: number;
  errorCode?: string;
  errorDetailRedacted?: string;
};

export type StructuredLogInput = Omit<StructuredLogRecord, "timestamp" | "tenantHash"> & {
  tenantId?: string;
  tenantHashSecret?: string;
  timestamp?: string;
  errorDetail?: unknown;
};

export const buildStructuredLogRecord = (input: StructuredLogInput): StructuredLogRecord => {
  const context = createCorrelationContext({ requestId: input.requestId, correlationId: input.correlationId, causationId: input.causationId });
  if (!input.service || !input.module || !input.routeOrJob) throw new TelemetryContractError("INVALID_LOG_CONTEXT", "Log service/module/route is required");
  if (input.latencyMs !== undefined && (!Number.isFinite(input.latencyMs) || input.latencyMs < 0)) {
    throw new TelemetryContractError("INVALID_LOG_CONTEXT", "Log latency must be non-negative");
  }
  const tenantHash = input.tenantId === undefined
    ? undefined
    : pseudonymizeTenantId(input.tenantId, input.tenantHashSecret ?? "");
  return {
    timestamp: input.timestamp ?? new Date().toISOString(),
    severity: input.severity,
    service: input.service,
    module: input.module,
    environment: input.environment,
    requestId: context.requestId,
    correlationId: context.correlationId,
    ...(context.causationId ? { causationId: context.causationId } : {}),
    ...(tenantHash ? { tenantHash } : {}),
    actorType: input.actorType,
    routeOrJob: input.routeOrJob,
    ...(input.latencyMs !== undefined ? { latencyMs: input.latencyMs } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.errorCode ? { errorCode: input.errorCode } : {}),
    ...(input.errorDetail !== undefined ? { errorDetailRedacted: redactErrorDetail(input.errorDetail) } : {}),
  };
};

export const serializeStructuredLog = (record: StructuredLogRecord): string => JSON.stringify(record);

export type LogSink = (record: StructuredLogRecord) => void;

export class StructuredLogger {
  constructor(private readonly sink: LogSink) {}

  write(input: StructuredLogInput): StructuredLogRecord {
    const record = buildStructuredLogRecord(input);
    this.sink(record);
    return record;
  }
}

export type DomainEvent<TPayload = unknown> = {
  eventId: string;
  eventType: string;
  eventVersion: number;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  idempotencyKey: string;
  payload: TPayload;
  occurredAt: string;
  availableAt: string;
  correlationId: string;
  causationId?: string;
  actor: { type: ActorType; id?: string };
};

const assertEventPayloadSafe = (value: unknown, path = "payload"): void => {
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertEventPayloadSafe(child, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (EVENT_PII_FIELD_PATTERN.test(key)) {
      throw new TelemetryContractError("PII_IN_EVENT", `Sensitive event field is not allowed at ${path}.${key}`);
    }
    assertEventPayloadSafe(child, `${path}.${key}`);
  }
};

export type DomainEventInput<TPayload = unknown> = {
  eventType: string;
  eventVersion: number;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  idempotencyKey: string;
  payload: TPayload;
  correlationId: string;
  causationId?: string;
  actor: { type: ActorType; id?: string };
  occurredAt?: string;
  availableAt?: string;
};

export const createDomainEvent = <TPayload>(input: DomainEventInput<TPayload>): DomainEvent<TPayload> => {
  assertUuid(input.tenantId, "INVALID_TENANT_ID");
  assertUuid(input.aggregateId, "INVALID_AGGREGATE_ID");
  assertUuid(input.correlationId, "INVALID_CORRELATION_ID");
  if (!EVENT_TYPE_PATTERN.test(input.eventType) || input.eventType.endsWith(".v1")) {
    throw new TelemetryContractError("INVALID_EVENT_TYPE", "Event type must be canonical and omit a .v1 suffix");
  }
  if (!Number.isSafeInteger(input.eventVersion) || input.eventVersion <= 0) {
    throw new TelemetryContractError("INVALID_EVENT_VERSION", "Event version must be a positive integer");
  }
  if (!input.idempotencyKey || input.idempotencyKey.length > 200) {
    throw new TelemetryContractError("INVALID_IDEMPOTENCY_KEY", "Event idempotency key is required and bounded");
  }
  assertEventPayloadSafe(input.payload);
  return {
    eventId: randomUUID(),
    eventType: input.eventType,
    eventVersion: input.eventVersion,
    tenantId: input.tenantId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    idempotencyKey: input.idempotencyKey,
    payload: cloneJson(input.payload),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    availableAt: input.availableAt ?? input.occurredAt ?? new Date().toISOString(),
    correlationId: input.correlationId,
    ...(input.causationId ? { causationId: input.causationId } : {}),
    actor: { ...input.actor },
  };
};

export type OutboxRecord<TPayload = unknown> = DomainEvent<TPayload> & {
  publishedAt?: string;
  attemptCount: number;
  lastErrorCode?: string;
};

export class InMemoryOutbox<TPayload = unknown> {
  private readonly records = new Map<string, OutboxRecord<TPayload>>();
  private readonly idempotencyIndex = new Map<string, string>();
  private readonly claimedUntil = new Map<string, number>();

  append(event: DomainEvent<TPayload>): OutboxRecord<TPayload> {
    const indexKey = `${event.tenantId}:${event.idempotencyKey}`;
    const existingId = this.idempotencyIndex.get(indexKey);
    if (existingId) {
      const existing = this.records.get(existingId)!;
      if (stableSerialize(existing.payload) !== stableSerialize(event.payload) || existing.eventType !== event.eventType) {
        throw new TelemetryContractError("OUTBOX_IDEMPOTENCY_CONFLICT", "Outbox key was reused with a different event");
      }
      return cloneJson(existing);
    }
    const record: OutboxRecord<TPayload> = { ...cloneJson(event), attemptCount: 0 };
    this.records.set(record.eventId, record);
    this.idempotencyIndex.set(indexKey, record.eventId);
    return cloneJson(record);
  }

  claim(limit: number, now = new Date(), leaseMs = 30_000): OutboxRecord<TPayload>[] {
    if (!Number.isSafeInteger(limit) || limit <= 0 || !Number.isSafeInteger(leaseMs) || leaseMs <= 0) {
      throw new TelemetryContractError("INVALID_OUTBOX_LIMIT", "Outbox claim limit and lease must be positive");
    }
    for (const [eventId, claimedUntil] of this.claimedUntil) {
      if (claimedUntil <= now.getTime()) this.claimedUntil.delete(eventId);
    }
    const nowIso = now.toISOString();
    return [...this.records.values()]
      .filter((record) => !record.publishedAt && record.availableAt <= nowIso && (this.claimedUntil.get(record.eventId) ?? 0) <= now.getTime())
      .sort((left, right) => left.availableAt.localeCompare(right.availableAt) || left.occurredAt.localeCompare(right.occurredAt))
      .slice(0, limit)
      .map((record) => {
        record.attemptCount += 1;
        this.claimedUntil.set(record.eventId, now.getTime() + leaseMs);
        return cloneJson(record);
      });
  }

  markPublished(eventId: string, now = new Date()): OutboxRecord<TPayload> {
    const record = this.records.get(eventId);
    if (!record) throw new TelemetryContractError("OUTBOX_NOT_FOUND", "Outbox event was not found");
    record.publishedAt = now.toISOString();
    this.claimedUntil.delete(eventId);
    return cloneJson(record);
  }

  markFailed(eventId: string, errorCode: string, availableAt: Date): OutboxRecord<TPayload> {
    const record = this.records.get(eventId);
    if (!record) throw new TelemetryContractError("OUTBOX_NOT_FOUND", "Outbox event was not found");
    record.lastErrorCode = errorCode.slice(0, 64);
    record.availableAt = availableAt.toISOString();
    this.claimedUntil.delete(eventId);
    return cloneJson(record);
  }

  list(): OutboxRecord<TPayload>[] {
    return [...this.records.values()].map((record) => cloneJson(record));
  }
}

export type AuditRecord = {
  id: string;
  tenantId: string;
  actorAccountId?: string;
  actorMembershipId?: string;
  actorType: ActorType;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeRedactedJson?: Record<string, unknown>;
  afterRedactedJson?: Record<string, unknown>;
  reason: string;
  requestId: string;
  correlationId: string;
  ipHash?: string;
  userAgentSummary?: string;
  createdAt: string;
  integrityHash: string;
  previousIntegrityHash?: string;
};

export type AuditInput = Omit<AuditRecord, "id" | "createdAt" | "integrityHash" | "previousIntegrityHash">;

const auditHash = (record: Omit<AuditRecord, "integrityHash">): string => createHash("sha256").update(stableSerialize(record)).digest("hex");

export const createAuditRecord = (input: AuditInput, previousIntegrityHash?: string, now = new Date()): AuditRecord => {
  assertUuid(input.tenantId, "INVALID_TENANT_ID");
  assertUuid(input.resourceId, "INVALID_RESOURCE_ID");
  assertUuid(input.requestId, "INVALID_REQUEST_ID");
  assertUuid(input.correlationId, "INVALID_CORRELATION_ID");
  if (!ACTION_PATTERN.test(input.action) || !input.reason.trim()) {
    throw new TelemetryContractError("INVALID_AUDIT_CONTEXT", "Audit action and reason are required");
  }
  if (input.actorAccountId) assertUuid(input.actorAccountId, "INVALID_ACTOR_ID");
  if (input.actorMembershipId) assertUuid(input.actorMembershipId, "INVALID_ACTOR_ID");
  const partial: Omit<AuditRecord, "integrityHash"> = {
    id: randomUUID(),
    tenantId: input.tenantId,
    ...(input.actorAccountId ? { actorAccountId: input.actorAccountId } : {}),
    ...(input.actorMembershipId ? { actorMembershipId: input.actorMembershipId } : {}),
    actorType: input.actorType,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    ...(input.beforeRedactedJson ? { beforeRedactedJson: redactStructuredValue(input.beforeRedactedJson) } : {}),
    ...(input.afterRedactedJson ? { afterRedactedJson: redactStructuredValue(input.afterRedactedJson) } : {}),
    reason: input.reason.slice(0, 500),
    requestId: input.requestId,
    correlationId: input.correlationId,
    ...(input.ipHash ? { ipHash: input.ipHash } : {}),
    ...(input.userAgentSummary ? { userAgentSummary: input.userAgentSummary.slice(0, 200) } : {}),
    createdAt: now.toISOString(),
    ...(previousIntegrityHash ? { previousIntegrityHash } : {}),
  };
  return { ...partial, integrityHash: auditHash(partial) };
};

export class InMemoryAuditLog {
  private readonly records: AuditRecord[] = [];

  append(input: AuditInput, now = new Date()): AuditRecord {
    const previous = this.records.at(-1)?.integrityHash;
    const record = createAuditRecord(input, previous, now);
    this.records.push(record);
    return cloneJson(record);
  }

  list(tenantId?: string): AuditRecord[] {
    return this.records
      .filter((record) => tenantId === undefined || record.tenantId === tenantId)
      .map((record) => cloneJson(record));
  }

  verifyIntegrity(): boolean {
    let previous: string | undefined;
    for (const record of this.records) {
      const { integrityHash, ...partial } = record;
      if (record.previousIntegrityHash !== previous || integrityHash !== auditHash(partial)) return false;
      previous = integrityHash;
    }
    return true;
  }
}

export type JobRecord<TPayload = unknown> = {
  id: string;
  tenantId: string;
  jobType: string;
  jobVersion: number;
  dedupeKey: string;
  payload: TPayload;
  status: JobStatus;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  heartbeatAt?: string;
  errorCode?: string;
  errorDetailRedacted?: string;
  correlationId: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};

export type EnqueueJobInput<TPayload = unknown> = {
  tenantId: string;
  jobType: string;
  jobVersion: number;
  dedupeKey: string;
  payload: TPayload;
  priority?: number;
  maxAttempts?: number;
  nextAttemptAt?: Date;
  correlationId: string;
};

export type AdminJobView = Omit<JobRecord, "payload">;

const validateJobInput = <TPayload>(input: EnqueueJobInput<TPayload>): void => {
  assertUuid(input.tenantId, "INVALID_TENANT_ID");
  assertUuid(input.correlationId, "INVALID_CORRELATION_ID");
  if (!input.jobType || !/^[a-z][a-z0-9_.-]{1,127}$/.test(input.jobType)) throw new TelemetryContractError("INVALID_JOB_TYPE", "Job type is invalid");
  if (!Number.isSafeInteger(input.jobVersion) || input.jobVersion <= 0) throw new TelemetryContractError("INVALID_JOB_VERSION", "Job version is invalid");
  if (!input.dedupeKey || input.dedupeKey.length > 200) throw new TelemetryContractError("INVALID_JOB_DEDUPE_KEY", "Job dedupe key is invalid");
  if (input.priority !== undefined && !Number.isSafeInteger(input.priority)) throw new TelemetryContractError("INVALID_JOB_PRIORITY", "Job priority is invalid");
  if (input.maxAttempts !== undefined && (!Number.isSafeInteger(input.maxAttempts) || input.maxAttempts <= 0)) throw new TelemetryContractError("INVALID_MAX_ATTEMPTS", "Job max attempts is invalid");
  assertEventPayloadSafe(input.payload);
};

const retryDelayMs = (attemptCount: number, jitterMs?: number): number => {
  const base = RETRY_SCHEDULE_MS[Math.min(Math.max(attemptCount - 1, 0), RETRY_SCHEDULE_MS.length - 1)]!;
  const jitter = jitterMs ?? randomInt(0, Math.max(1, Math.floor(base * 0.1) + 1));
  return base + Math.max(0, Math.min(jitter, base));
};

export const calculateRetryDelayMs = retryDelayMs;

export class InMemoryJobQueue<TPayload = unknown> {
  private readonly jobs = new Map<string, JobRecord<TPayload>>();
  private readonly dedupeIndex = new Map<string, string>();

  enqueue(input: EnqueueJobInput<TPayload>): JobRecord<TPayload> {
    validateJobInput(input);
    const dedupeIndex = `${input.tenantId}:${input.dedupeKey}`;
    const existingId = this.dedupeIndex.get(dedupeIndex);
    if (existingId) {
      const existing = this.jobs.get(existingId)!;
      if (stableSerialize(existing.payload) !== stableSerialize(input.payload)) {
        throw new TelemetryContractError("JOB_DEDUPE_CONFLICT", "Job dedupe key was reused with a different payload");
      }
      return cloneJson(existing);
    }
    const now = new Date();
    const job: JobRecord<TPayload> = {
      id: randomUUID(),
      tenantId: input.tenantId,
      jobType: input.jobType,
      jobVersion: input.jobVersion,
      dedupeKey: input.dedupeKey,
      payload: cloneJson(input.payload),
      status: "QUEUED",
      priority: input.priority ?? 0,
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 3,
      nextAttemptAt: (input.nextAttemptAt ?? now).toISOString(),
      correlationId: input.correlationId,
      createdAt: now.toISOString(),
    };
    this.jobs.set(job.id, job);
    this.dedupeIndex.set(dedupeIndex, job.id);
    return cloneJson(job);
  }

  private recoverExpiredLeases(now: Date): void {
    const nowIso = now.toISOString();
    for (const job of this.jobs.values()) {
      if (job.status !== "RUNNING" || !job.leaseExpiresAt || job.leaseExpiresAt > nowIso) continue;
      job.leaseOwner = undefined;
      job.leaseExpiresAt = undefined;
      job.heartbeatAt = undefined;
      if (job.attemptCount >= job.maxAttempts) {
        job.status = "DEAD";
        job.errorCode = "LEASE_EXPIRED";
        job.errorDetailRedacted = "Worker lease expired after maximum attempts";
      } else {
        job.status = "RETRY_WAIT";
        job.nextAttemptAt = nowIso;
        job.errorCode = "LEASE_EXPIRED";
        job.errorDetailRedacted = "Worker lease expired; job requeued";
      }
    }
  }

  claim(workerId: string, limit: number, now = new Date(), leaseMs = 30_000): JobRecord<TPayload>[] {
    if (!workerId || !Number.isSafeInteger(limit) || limit <= 0 || !Number.isSafeInteger(leaseMs) || leaseMs <= 0) {
      throw new TelemetryContractError("INVALID_JOB_CLAIM", "Worker claim parameters are invalid");
    }
    this.recoverExpiredLeases(now);
    const nowIso = now.toISOString();
    return [...this.jobs.values()]
      .filter((job) => (job.status === "QUEUED" || job.status === "RETRY_WAIT") && job.nextAttemptAt <= nowIso)
      .sort((left, right) => right.priority - left.priority || left.nextAttemptAt.localeCompare(right.nextAttemptAt))
      .slice(0, limit)
      .map((job) => {
        job.status = "RUNNING";
        job.attemptCount += 1;
        job.leaseOwner = workerId;
        job.leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
        job.heartbeatAt = nowIso;
        job.startedAt ??= nowIso;
        return cloneJson(job);
      });
  }

  heartbeat(jobId: string, workerId: string, now = new Date(), leaseMs = 30_000): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "RUNNING" || job.leaseOwner !== workerId || !job.leaseExpiresAt || job.leaseExpiresAt <= now.toISOString()) return false;
    job.heartbeatAt = now.toISOString();
    job.leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    return true;
  }

  complete(jobId: string, workerId: string, now = new Date()): JobRecord<TPayload> {
    const job = this.requireOwned(jobId, workerId, now);
    job.status = "SUCCEEDED";
    job.completedAt = now.toISOString();
    job.leaseOwner = undefined;
    job.leaseExpiresAt = undefined;
    job.heartbeatAt = undefined;
    return cloneJson(job);
  }

  fail(jobId: string, workerId: string, input: { errorCode: string; errorDetail?: unknown; retryable: boolean; now?: Date; jitterMs?: number }): JobRecord<TPayload> {
    const now = input.now ?? new Date();
    const job = this.requireOwned(jobId, workerId, now);
    job.errorCode = input.errorCode.slice(0, 64);
    job.errorDetailRedacted = redactErrorDetail(input.errorDetail ?? input.errorCode);
    job.leaseOwner = undefined;
    job.leaseExpiresAt = undefined;
    job.heartbeatAt = undefined;
    if (input.retryable && job.attemptCount < job.maxAttempts) {
      job.status = "RETRY_WAIT";
      job.nextAttemptAt = new Date(now.getTime() + retryDelayMs(job.attemptCount, input.jitterMs)).toISOString();
    } else {
      job.status = "DEAD";
      job.completedAt = now.toISOString();
    }
    return cloneJson(job);
  }

  cancel(jobId: string, now = new Date()): JobRecord<TPayload> {
    const job = this.jobs.get(jobId);
    if (!job || !["QUEUED", "RETRY_WAIT"].includes(job.status)) throw new TelemetryContractError("INVALID_JOB_STATE", "Only queued jobs can be cancelled");
    job.status = "CANCELLED";
    job.completedAt = now.toISOString();
    return cloneJson(job);
  }

  replay(input: {
    jobId: string;
    actorType: ActorType;
    tenantId: string;
    reason: string;
    authorized: boolean;
    now?: Date;
    auditSink: (record: AuditInput) => void;
  }): JobRecord<TPayload> {
    const now = input.now ?? new Date();
    const original = this.jobs.get(input.jobId);
    if (!input.authorized) throw new TelemetryContractError("FORBIDDEN", "Job replay requires an authorized action");
    if (!original || original.tenantId !== input.tenantId || original.status !== "DEAD") throw new TelemetryContractError("INVALID_JOB_STATE", "Only a same-tenant dead job can be replayed");
    if (!input.reason.trim()) throw new TelemetryContractError("AUDIT_REASON_REQUIRED", "Job replay reason is required");
    const replay = this.enqueue({
      tenantId: original.tenantId,
      jobType: original.jobType,
      jobVersion: original.jobVersion,
      dedupeKey: `${original.dedupeKey}:replay:${randomUUID()}`,
      payload: original.payload,
      priority: original.priority,
      maxAttempts: original.maxAttempts,
      nextAttemptAt: now,
      correlationId: original.correlationId,
    });
    input.auditSink({
      tenantId: original.tenantId,
      actorType: input.actorType,
      action: "jobs.replay",
      resourceType: "job",
      resourceId: original.id,
      reason: input.reason,
      requestId: original.correlationId,
      correlationId: original.correlationId,
      afterRedactedJson: { replayJobId: replay.id, originalJobId: original.id },
    });
    return replay;
  }

  get(jobId: string): JobRecord<TPayload> | undefined {
    const job = this.jobs.get(jobId);
    return job ? cloneJson(job) : undefined;
  }

  listForAdmin(tenantId: string): AdminJobView[] {
    return [...this.jobs.values()]
      .filter((job) => job.tenantId === tenantId)
      .map(({ payload: _payload, ...view }) => cloneJson(view));
  }

  private requireOwned(jobId: string, workerId: string, now: Date): JobRecord<TPayload> {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "RUNNING" || job.leaseOwner !== workerId || !job.leaseExpiresAt || job.leaseExpiresAt <= now.toISOString()) {
      throw new TelemetryContractError("JOB_LEASE_INVALID", "Job lease is missing, expired or owned by another worker");
    }
    return job;
  }
}

export const constantTimeEqual = (left: string, right: string): boolean => {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
};
