import { randomUUID } from "node:crypto";

import { ComplaintDomainError, InMemoryComplaintRepository, type ComplaintCreateInput, type ComplaintRecord } from "./complaint";

export const RECOVERY_INTEGRATIONS = ["OPENROUTER", "EMBEDDING", "LINE_PUSH", "MAP", "REVERSE_GEOCODE"] as const;
export type RecoveryIntegration = (typeof RECOVERY_INTEGRATIONS)[number];
export type RecoveryJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "RETRY_WAIT" | "DEAD" | "CANCELLED";
export type RecoveryOutcome = "SUCCEEDED" | "RETRY_WAIT";

export class ComplaintRecoveryError extends Error {
  constructor(public readonly code: "CONFIGURATION_UNAVAILABLE" | "VALIDATION_ERROR", message: string) {
    super(`${code}: ${message}`);
    this.name = "ComplaintRecoveryError";
  }
}

export type RecoveryIntegrationContext = {
  tenantId: string;
  complaintId: string;
  complaintNo: string;
  correlationId: string;
  hasManualLocation: boolean;
};

export type ComplaintRecoveryIntegrations = Partial<Record<RecoveryIntegration, (context: RecoveryIntegrationContext) => Promise<void>>>;

export type RecoveryJobRecord = {
  id: string;
  tenantId: string;
  complaintId: string;
  integration: RecoveryIntegration;
  dedupeKey: string;
  status: RecoveryJobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  heartbeatAt?: string;
  errorCode?: string;
  createdAt: string;
  completedAt?: string;
};

type StoredRecoveryJob = RecoveryJobRecord & { handler: () => Promise<void> };

export type RecoveryJobEnqueueInput = {
  tenantId: string;
  complaintId: string;
  integration: RecoveryIntegration;
  dedupeKey: string;
  handler: () => Promise<void>;
  maxAttempts?: number;
  nextAttemptAt?: Date;
};

export type RecoveryJobRunResult = {
  claimed: RecoveryJobRecord;
  result: RecoveryJobRecord;
};

export type RecoveryIntegrationState = {
  integration: RecoveryIntegration;
  status: "SUCCEEDED" | "QUEUED";
  jobId?: string;
  reasonCode?: "AI_UNAVAILABLE" | "EXTERNAL_DEPENDENCY_FAILED";
};

export type ComplaintRecoverySubmitInput = Omit<ComplaintCreateInput, "intakeQueueId"> & { intakeQueueId?: string };

export type ComplaintRecoverySubmitResult = {
  coreCommitted: true;
  complaintId: string;
  complaintNo: string;
  intakeQueueId: string;
  idempotentReplay: boolean;
  integrationStates: readonly RecoveryIntegrationState[];
};

export type ChatRecoveryResult<T> =
  | { outcome: "ANSWER"; value: T }
  | { outcome: "HANDOFF"; reasonCode: "SYSTEM_ERROR"; answerText: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const RETRY_DELAYS_MS = [5_000, 30_000, 300_000, 1_800_000, 7_200_000] as const;

const cloneJob = (job: RecoveryJobRecord): RecoveryJobRecord => ({ ...job });

const assertUuid = (value: string, field: string): void => {
  if (!UUID_PATTERN.test(value)) throw new ComplaintRecoveryError("VALIDATION_ERROR", `${field} is invalid`);
};

const assertDate = (value: Date, field: string): void => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new ComplaintRecoveryError("VALIDATION_ERROR", `${field} is invalid`);
};

const retryDelayMs = (attemptCount: number): number => RETRY_DELAYS_MS[Math.min(Math.max(attemptCount - 1, 0), RETRY_DELAYS_MS.length - 1)]!;

export const executeWithTimeout = async <T>(operation: () => Promise<T>, timeoutMs: number): Promise<T> => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new ComplaintRecoveryError("VALIDATION_ERROR", "timeoutMs is invalid");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

export class RecoveryReconciliationJob {
  private readonly jobs = new Map<string, StoredRecoveryJob>();
  private readonly dedupe = new Map<string, string>();

  constructor(private readonly clock: () => Date = () => new Date()) {}

  enqueue(input: RecoveryJobEnqueueInput): RecoveryJobRecord {
    assertUuid(input.tenantId, "tenantId");
    assertUuid(input.complaintId, "complaintId");
    if (!RECOVERY_INTEGRATIONS.includes(input.integration)) throw new ComplaintRecoveryError("VALIDATION_ERROR", "integration is invalid");
    if (!input.dedupeKey || input.dedupeKey.length > 200 || CONTROL_PATTERN.test(input.dedupeKey)) throw new ComplaintRecoveryError("VALIDATION_ERROR", "dedupeKey is invalid");
    if (!Number.isSafeInteger(input.maxAttempts ?? 3) || (input.maxAttempts ?? 3) < 1 || (input.maxAttempts ?? 3) > 10) throw new ComplaintRecoveryError("VALIDATION_ERROR", "maxAttempts is invalid");
    const dedupeKey = `${input.tenantId}:${input.dedupeKey}`;
    const existingId = this.dedupe.get(dedupeKey);
    if (existingId) return cloneJob(this.jobs.get(existingId)!);
    const now = this.clock();
    assertDate(now, "clock");
    const nextAttemptAt = input.nextAttemptAt ?? now;
    assertDate(nextAttemptAt, "nextAttemptAt");
    const job: StoredRecoveryJob = {
      id: randomUUID(),
      tenantId: input.tenantId,
      complaintId: input.complaintId,
      integration: input.integration,
      dedupeKey: input.dedupeKey,
      status: "QUEUED",
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 3,
      nextAttemptAt: nextAttemptAt.toISOString(),
      createdAt: now.toISOString(),
      handler: input.handler,
    };
    this.jobs.set(job.id, job);
    this.dedupe.set(dedupeKey, job.id);
    return cloneJob(job);
  }

  reclaimExpired(now = this.clock()): RecoveryJobRecord[] {
    assertDate(now, "now");
    const nowIso = now.toISOString();
    const recovered: RecoveryJobRecord[] = [];
    for (const job of this.jobs.values()) {
      if (job.status !== "RUNNING" || !job.leaseExpiresAt || job.leaseExpiresAt > nowIso) continue;
      job.leaseOwner = undefined;
      job.leaseExpiresAt = undefined;
      job.heartbeatAt = undefined;
      if (job.attemptCount >= job.maxAttempts) {
        job.status = "DEAD";
        job.errorCode = "LEASE_EXPIRED";
        job.completedAt = nowIso;
      } else {
        job.status = "RETRY_WAIT";
        job.errorCode = "LEASE_EXPIRED";
        job.nextAttemptAt = nowIso;
      }
      recovered.push(cloneJob(job));
    }
    return recovered;
  }

  claim(workerId: string, now = this.clock(), leaseMs = 30_000): RecoveryJobRecord[] {
    if (!workerId || CONTROL_PATTERN.test(workerId) || !Number.isSafeInteger(leaseMs) || leaseMs < 1 || leaseMs > 300_000) throw new ComplaintRecoveryError("VALIDATION_ERROR", "worker claim is invalid");
    assertDate(now, "now");
    this.reclaimExpired(now);
    const nowIso = now.toISOString();
    return [...this.jobs.values()]
      .filter((job) => (job.status === "QUEUED" || job.status === "RETRY_WAIT") && job.nextAttemptAt <= nowIso)
      .sort((left, right) => left.nextAttemptAt.localeCompare(right.nextAttemptAt) || left.id.localeCompare(right.id))
      .slice(0, 1)
      .map((job) => {
        job.status = "RUNNING";
        job.attemptCount += 1;
        job.leaseOwner = workerId;
        job.leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
        job.heartbeatAt = nowIso;
        return cloneJob(job);
      });
  }

  heartbeat(jobId: string, workerId: string, now = this.clock(), leaseMs = 30_000): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "RUNNING" || job.leaseOwner !== workerId || !job.leaseExpiresAt || job.leaseExpiresAt <= now.toISOString()) return false;
    job.heartbeatAt = now.toISOString();
    job.leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    return true;
  }

  complete(jobId: string, workerId: string, now = this.clock()): RecoveryJobRecord {
    const job = this.requireOwned(jobId, workerId, now);
    job.status = "SUCCEEDED";
    job.completedAt = now.toISOString();
    job.leaseOwner = undefined;
    job.leaseExpiresAt = undefined;
    job.heartbeatAt = undefined;
    return cloneJob(job);
  }

  fail(jobId: string, workerId: string, errorCode: "TIMEOUT" | "EXTERNAL_DEPENDENCY_FAILED" | "HANDLER_NOT_REGISTERED", retryable: boolean, now = this.clock()): RecoveryJobRecord {
    const job = this.requireOwned(jobId, workerId, now);
    job.errorCode = errorCode;
    job.leaseOwner = undefined;
    job.leaseExpiresAt = undefined;
    job.heartbeatAt = undefined;
    if (retryable && job.attemptCount < job.maxAttempts) {
      job.status = "RETRY_WAIT";
      job.nextAttemptAt = new Date(now.getTime() + retryDelayMs(job.attemptCount)).toISOString();
    } else {
      job.status = "DEAD";
      job.completedAt = now.toISOString();
    }
    return cloneJob(job);
  }

  async runOnce(workerId: string, now = this.clock(), timeoutMs = 30_000, leaseMs = 30_000): Promise<RecoveryJobRunResult | undefined> {
    const claimed = this.claim(workerId, now, leaseMs)[0];
    if (!claimed) return undefined;
    const stored = this.jobs.get(claimed.id)!;
    try {
      await executeWithTimeout(stored.handler, timeoutMs);
      return { claimed, result: this.complete(claimed.id, workerId, now) };
    } catch (error) {
      const errorCode = stored.handler === undefined ? "HANDLER_NOT_REGISTERED" : error instanceof Error && error.message === "TIMEOUT" ? "TIMEOUT" : "EXTERNAL_DEPENDENCY_FAILED";
      return { claimed, result: this.fail(claimed.id, workerId, errorCode, errorCode !== "HANDLER_NOT_REGISTERED", now) };
    }
  }

  get(jobId: string): RecoveryJobRecord | undefined {
    const job = this.jobs.get(jobId);
    return job ? cloneJob(job) : undefined;
  }

  list(tenantId: string): RecoveryJobRecord[] {
    return [...this.jobs.values()].filter((job) => job.tenantId === tenantId).map(cloneJob);
  }

  private requireOwned(jobId: string, workerId: string, now: Date): StoredRecoveryJob {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "RUNNING" || job.leaseOwner !== workerId || !job.leaseExpiresAt || job.leaseExpiresAt <= now.toISOString()) throw new ComplaintRecoveryError("VALIDATION_ERROR", "job lease is invalid");
    return job;
  }
}

const retryReasonFor = (integration: RecoveryIntegration): "AI_UNAVAILABLE" | "EXTERNAL_DEPENDENCY_FAILED" => integration === "OPENROUTER" ? "AI_UNAVAILABLE" : "EXTERNAL_DEPENDENCY_FAILED";

const cloneSubmitResult = (result: ComplaintRecoverySubmitResult): ComplaintRecoverySubmitResult => ({
  ...result,
  integrationStates: result.integrationStates.map((state) => ({ ...state })),
});

export class ComplaintRecoveryService {
  private readonly submitted = new Map<string, ComplaintRecoverySubmitResult>();
  private readonly completion = new Map<string, Promise<void>>();
  private readonly integrations: ComplaintRecoveryIntegrations;
  private readonly clock: () => Date;
  private readonly timeoutMs: number;
  readonly reconciliation: RecoveryReconciliationJob;

  constructor(input: {
    repository: InMemoryComplaintRepository;
    defaultIntakeQueueForTenant: (tenantId: string) => string | undefined;
    integrations?: ComplaintRecoveryIntegrations;
    reconciliation?: RecoveryReconciliationJob;
    clock?: () => Date;
    timeoutMs?: number;
  }) {
    this.repository = input.repository;
    this.defaultIntakeQueueForTenant = input.defaultIntakeQueueForTenant;
    this.integrations = input.integrations ?? {};
    this.reconciliation = input.reconciliation ?? new RecoveryReconciliationJob(input.clock);
    this.clock = input.clock ?? (() => new Date());
    this.timeoutMs = input.timeoutMs ?? 5_000;
  }

  private readonly repository: InMemoryComplaintRepository;
  private readonly defaultIntakeQueueForTenant: (tenantId: string) => string | undefined;

  async submit(input: ComplaintRecoverySubmitInput): Promise<ComplaintRecoverySubmitResult> {
    const queueId = input.intakeQueueId ?? this.defaultIntakeQueueForTenant(input.tenantId);
    if (!queueId) throw new ComplaintRecoveryError("CONFIGURATION_UNAVAILABLE", "default intake queue is not configured");
    const scope = `${input.tenantId}:${input.idempotencyKey}`;
    const existing = this.submitted.get(scope);
    if (existing) {
      const pending = this.completion.get(scope);
      if (pending) await pending;
      return cloneSubmitResult({ ...this.submitted.get(scope)!, idempotentReplay: true });
    }
    const created = this.repository.create({ ...input, intakeQueueId: queueId });
    const result: ComplaintRecoverySubmitResult = {
      coreCommitted: true,
      complaintId: created.record.id,
      complaintNo: created.record.complaintNo,
      intakeQueueId: queueId,
      idempotentReplay: created.idempotentReplay,
      integrationStates: [],
    };
    this.submitted.set(scope, result);
    if (created.idempotentReplay) return cloneSubmitResult(result);

    const context: RecoveryIntegrationContext = {
      tenantId: created.record.tenantId,
      complaintId: created.record.id,
      complaintNo: created.record.complaintNo,
      correlationId: created.record.id,
      hasManualLocation: Boolean(created.record.location?.text),
    };
    const pending = (async () => {
      const states: RecoveryIntegrationState[] = [];
      for (const integration of RECOVERY_INTEGRATIONS) {
        const handler = this.integrations[integration];
        if (!handler) continue;
        try {
          await executeWithTimeout(() => handler(context), this.timeoutMs);
          states.push({ integration, status: "SUCCEEDED" });
        } catch {
          const job = this.reconciliation.enqueue({
            tenantId: context.tenantId,
            complaintId: context.complaintId,
            integration,
            dedupeKey: `complaint:${context.complaintId}:${integration.toLowerCase()}`,
            handler: () => handler(context),
          });
          states.push({ integration, status: "QUEUED", jobId: job.id, reasonCode: retryReasonFor(integration) });
        }
      }
      result.integrationStates = states;
    })();
    this.completion.set(scope, pending);
    try {
      await pending;
    } finally {
      this.completion.delete(scope);
    }
    return cloneSubmitResult(result);
  }

  async runReconciliationOnce(workerId: string, now = this.clock(), timeoutMs = this.timeoutMs): Promise<RecoveryJobRunResult | undefined> {
    return this.reconciliation.runOnce(workerId, now, timeoutMs);
  }

  getComplaint(tenantId: string, complaintId: string): ComplaintRecord | undefined {
    return this.repository.get(tenantId, complaintId);
  }
}

export const runChatWithHandoff = async <T>(operation: () => Promise<T>, timeoutMs = 5_000): Promise<ChatRecoveryResult<T>> => {
  try {
    return { outcome: "ANSWER", value: await executeWithTimeout(operation, timeoutMs) };
  } catch {
    return { outcome: "HANDOFF", reasonCode: "SYSTEM_ERROR", answerText: "ขออภัย ระบบตอบอัตโนมัติขัดข้อง กรุณาติดต่อเจ้าหน้าที่" };
  }
};

export const isRecoveryRetryable = (status: RecoveryJobStatus): boolean => status === "QUEUED" || status === "RUNNING" || status === "RETRY_WAIT";
