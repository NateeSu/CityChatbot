import { createHash } from "node:crypto";

export const RETENTION_KEYS = ["COMPLAINT", "CHAT", "SUPPORT", "AUDIT", "FILE", "AI_TRACE", "BACKUP"] as const;
export type RetentionKey = (typeof RETENTION_KEYS)[number];
export type PrivacyRequestType = "ACCESS" | "RECTIFICATION" | "ERASURE" | "RESTRICTION";
export type PrivacyRequestState = "REQUESTED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CANCELLED";

export type RetentionDurations = Readonly<Record<RetentionKey, number>>;
export type RetentionPolicy = {
  id: string;
  tenantId: string;
  version: number;
  state: "ACTIVE" | "RETIRED";
  retentionDays: RetentionDurations;
  effectiveFrom?: string;
  effectiveUntil?: string;
  activatedBy: "SYSTEM_UNIT_GATE";
  createdAt: string;
};

export type LegalHoldScopeKey = RetentionKey | "ALL";

export type LegalHold = {
  id: string;
  tenantId: string;
  holdKey: string;
  state: "ACTIVE" | "RELEASED";
  reason: string;
  scopeKeys: readonly LegalHoldScopeKey[];
  startsAt: string;
  releasedAt?: string;
};

export type DataSubjectRequest = {
  id: string;
  tenantId: string;
  requestKey: string;
  subjectHash: string;
  requestType: PrivacyRequestType;
  state: PrivacyRequestState;
  requestedAt: string;
  dueAt: string;
  completedAt?: string;
  resultRedacted?: Readonly<Record<string, number>>;
};

export type PrivacyRecord = {
  id: string;
  tenantId: string;
  store: RetentionKey;
  subjectHash?: string;
  createdAt: string;
};

export type PurgeDecision = {
  recordId: string;
  decision: "PURGE_ALLOWED" | "HOLD_ACTIVE" | "RETENTION_NOT_DUE" | "NO_ACTIVE_POLICY";
  policyVersion?: number;
  holdId?: string;
};

export class PrivacyLifecycleError extends Error {
  constructor(public readonly code: "VALIDATION_ERROR" | "TENANT_SCOPE" | "IDEMPOTENCY_CONFLICT" | "NOT_FOUND" | "INVALID_STATE", message: string) {
    super(`${code}: ${message}`);
    this.name = "PrivacyLifecycleError";
  }
}

const SUBJECT_HASH = /^sha256:[a-f0-9]{64}$/u;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const digest = (value: string): string => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const iso = (date: Date): string => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new PrivacyLifecycleError("VALIDATION_ERROR", "clock value is invalid");
  return date.toISOString();
};
const validateTenant = (tenantId: string): void => {
  if (!tenantId || tenantId.length > 128) throw new PrivacyLifecycleError("VALIDATION_ERROR", "tenantId is required");
};
const validateSubjectHash = (subjectHash: string): void => {
  if (!SUBJECT_HASH.test(subjectHash)) throw new PrivacyLifecycleError("VALIDATION_ERROR", "subjectHash must be a sha256 pseudonym");
};
const assertRetentionKeys = (input: RetentionDurations): void => {
  if (Object.keys(input).sort().join("|") !== [...RETENTION_KEYS].sort().join("|")) throw new PrivacyLifecycleError("VALIDATION_ERROR", "retention policy must cover every data store");
  for (const key of RETENTION_KEYS) if (!Number.isSafeInteger(input[key]) || input[key] < 0) throw new PrivacyLifecycleError("VALIDATION_ERROR", `${key} retention must be a non-negative integer`);
};

export const subjectHashForTest = (stableSubject: string): string => digest(stableSubject);

export class InMemoryPrivacyLifecycle {
  private readonly policies = new Map<string, RetentionPolicy[]>();
  private readonly holds = new Map<string, LegalHold>();
  private readonly requests = new Map<string, DataSubjectRequest>();
  private readonly audit: Array<{ tenantId: string; action: string; resourceId: string; at: string }> = [];

  activateRetentionPolicy(input: { tenantId: string; version: number; retentionDays: RetentionDurations; effectiveFrom?: string; effectiveUntil?: string }, now = new Date()): RetentionPolicy {
    validateTenant(input.tenantId);
    if (!Number.isSafeInteger(input.version) || input.version <= 0) throw new PrivacyLifecycleError("VALIDATION_ERROR", "policy version is invalid");
    assertRetentionKeys(input.retentionDays);
    const createdAt = iso(now);
    const policies = this.policies.get(input.tenantId) ?? [];
    if (policies.some((policy) => policy.version === input.version)) throw new PrivacyLifecycleError("IDEMPOTENCY_CONFLICT", "policy version already exists");
    const policy: RetentionPolicy = {
      id: `retention-${digest(`${input.tenantId}|${input.version}`).slice(7, 31)}`,
      tenantId: input.tenantId,
      version: input.version,
      state: "ACTIVE",
      retentionDays: clone(input.retentionDays),
      ...(input.effectiveFrom ? { effectiveFrom: input.effectiveFrom } : {}),
      ...(input.effectiveUntil ? { effectiveUntil: input.effectiveUntil } : {}),
      activatedBy: "SYSTEM_UNIT_GATE",
      createdAt,
    };
    if (policy.effectiveFrom && policy.effectiveUntil && policy.effectiveUntil <= policy.effectiveFrom) throw new PrivacyLifecycleError("VALIDATION_ERROR", "retention policy window is invalid");
    for (const existing of policies) existing.state = "RETIRED";
    policies.push(policy);
    this.policies.set(input.tenantId, policies);
    this.audit.push({ tenantId: input.tenantId, action: "RETENTION_POLICY_ACTIVATED", resourceId: policy.id, at: createdAt });
    return clone(policy);
  }

  placeLegalHold(input: { tenantId: string; holdKey: string; reason: string; scopeKeys?: readonly LegalHoldScopeKey[]; startsAt?: string }, now = new Date()): LegalHold {
    validateTenant(input.tenantId);
    if (input.holdKey.length < 8 || !input.reason.trim()) throw new PrivacyLifecycleError("VALIDATION_ERROR", "legal hold key/reason is invalid");
    const existing = this.holds.get(`${input.tenantId}|${input.holdKey}`);
    if (existing) return clone(existing);
    const scopeKeys: LegalHoldScopeKey[] = input.scopeKeys && input.scopeKeys.length > 0 ? [...input.scopeKeys] : ["ALL"];
    if (scopeKeys.some((key) => ![...RETENTION_KEYS, "ALL"].includes(key))) throw new PrivacyLifecycleError("VALIDATION_ERROR", "legal hold scope is invalid");
    const startsAt = input.startsAt ?? iso(now);
    const hold: LegalHold = {
      id: `hold-${digest(`${input.tenantId}|${input.holdKey}`).slice(7, 31)}`,
      tenantId: input.tenantId,
      holdKey: input.holdKey,
      state: "ACTIVE",
      reason: input.reason.slice(0, 2_000),
      scopeKeys,
      startsAt,
    };
    this.holds.set(`${input.tenantId}|${input.holdKey}`, hold);
    this.audit.push({ tenantId: input.tenantId, action: "LEGAL_HOLD_PLACED", resourceId: hold.id, at: iso(now) });
    return clone(hold);
  }

  releaseLegalHold(tenantId: string, holdKey: string, now = new Date()): LegalHold {
    validateTenant(tenantId);
    const hold = this.holds.get(`${tenantId}|${holdKey}`);
    if (!hold) throw new PrivacyLifecycleError("NOT_FOUND", "legal hold was not found");
    if (hold.state === "RELEASED") return clone(hold);
    hold.state = "RELEASED";
    hold.releasedAt = iso(now);
    this.audit.push({ tenantId, action: "LEGAL_HOLD_RELEASED", resourceId: hold.id, at: hold.releasedAt });
    return clone(hold);
  }

  createDataSubjectRequest(input: { tenantId: string; requestKey: string; subjectHash: string; requestType: PrivacyRequestType; dueAt?: string }, now = new Date()): DataSubjectRequest {
    validateTenant(input.tenantId);
    validateSubjectHash(input.subjectHash);
    if (input.requestKey.length < 8) throw new PrivacyLifecycleError("VALIDATION_ERROR", "request key is invalid");
    if (!(input.requestType === "ACCESS" || input.requestType === "RECTIFICATION" || input.requestType === "ERASURE" || input.requestType === "RESTRICTION")) throw new PrivacyLifecycleError("VALIDATION_ERROR", "request type is invalid");
    const key = `${input.tenantId}|${input.requestKey}`;
    const existing = this.requests.get(key);
    if (existing) {
      if (existing.subjectHash !== input.subjectHash || existing.requestType !== input.requestType) throw new PrivacyLifecycleError("IDEMPOTENCY_CONFLICT", "subject request key was reused with different data");
      return clone(existing);
    }
    const requestedAt = iso(now);
    const request: DataSubjectRequest = {
      id: `dsar-${digest(key).slice(7, 31)}`,
      tenantId: input.tenantId,
      requestKey: input.requestKey,
      subjectHash: input.subjectHash,
      requestType: input.requestType,
      state: "REQUESTED",
      requestedAt,
      dueAt: input.dueAt ?? iso(new Date(now.getTime() + 30 * 86_400_000)),
    };
    if (request.dueAt < requestedAt) throw new PrivacyLifecycleError("VALIDATION_ERROR", "DSAR due date is before request date");
    this.requests.set(key, request);
    this.audit.push({ tenantId: input.tenantId, action: "DATA_SUBJECT_REQUESTED", resourceId: request.id, at: requestedAt });
    return clone(request);
  }

  transitionDataSubjectRequest(tenantId: string, requestKey: string, state: "IN_PROGRESS" | "REJECTED" | "CANCELLED", now = new Date()): DataSubjectRequest {
    const request = this.requireRequest(tenantId, requestKey);
    if (request.state !== "REQUESTED" && request.state !== "IN_PROGRESS") throw new PrivacyLifecycleError("INVALID_STATE", "DSAR cannot transition from its terminal state");
    request.state = state;
    this.audit.push({ tenantId, action: `DATA_SUBJECT_${state}`, resourceId: request.id, at: iso(now) });
    return clone(request);
  }

  completeDataSubjectRequest(tenantId: string, requestKey: string, resultRedacted: Readonly<Record<string, number>>, now = new Date()): DataSubjectRequest {
    const request = this.requireRequest(tenantId, requestKey);
    if (request.state !== "REQUESTED" && request.state !== "IN_PROGRESS") throw new PrivacyLifecycleError("INVALID_STATE", "only an open DSAR can complete");
    if (Object.values(resultRedacted).some((value) => !Number.isSafeInteger(value) || value < 0)) throw new PrivacyLifecycleError("VALIDATION_ERROR", "DSAR result must contain counts only");
    request.state = "COMPLETED";
    request.completedAt = iso(now);
    request.resultRedacted = clone(resultRedacted);
    this.audit.push({ tenantId, action: "DATA_SUBJECT_COMPLETED", resourceId: request.id, at: request.completedAt });
    return clone(request);
  }

  decidePurge(record: PrivacyRecord, now = new Date()): PurgeDecision {
    validateTenant(record.tenantId);
    if (!record.id || !RETENTION_KEYS.includes(record.store)) throw new PrivacyLifecycleError("VALIDATION_ERROR", "privacy record is invalid");
    const at = iso(now);
    const hold = [...this.holds.values()].find((candidate) => candidate.tenantId === record.tenantId && candidate.state === "ACTIVE" && candidate.startsAt <= at && (candidate.scopeKeys.includes("ALL") || candidate.scopeKeys.includes(record.store)));
    if (hold) return { recordId: record.id, decision: "HOLD_ACTIVE", holdId: hold.id };
    const policy = this.activePolicy(record.tenantId, at);
    if (!policy) return { recordId: record.id, decision: "NO_ACTIVE_POLICY" };
    const createdAt = Date.parse(record.createdAt);
    if (!Number.isFinite(createdAt)) throw new PrivacyLifecycleError("VALIDATION_ERROR", "record createdAt is invalid");
    if (createdAt + policy.retentionDays[record.store] * 86_400_000 > now.getTime()) return { recordId: record.id, decision: "RETENTION_NOT_DUE", policyVersion: policy.version };
    return { recordId: record.id, decision: "PURGE_ALLOWED", policyVersion: policy.version };
  }

  purgePlan(tenantId: string, records: readonly PrivacyRecord[], now = new Date()): readonly PurgeDecision[] {
    validateTenant(tenantId);
    if (records.some((record) => record.tenantId !== tenantId)) throw new PrivacyLifecycleError("TENANT_SCOPE", "purge plan crosses tenant scope");
    return records.map((record) => this.decidePurge(record, now));
  }

  listAudit(tenantId: string): readonly { tenantId: string; action: string; resourceId: string; at: string }[] {
    validateTenant(tenantId);
    return clone(this.audit.filter((entry) => entry.tenantId === tenantId));
  }

  private activePolicy(tenantId: string, at: string): RetentionPolicy | undefined {
    return [...(this.policies.get(tenantId) ?? [])].filter((policy) => policy.state === "ACTIVE" && (!policy.effectiveFrom || policy.effectiveFrom <= at) && (!policy.effectiveUntil || policy.effectiveUntil > at)).sort((left, right) => right.version - left.version)[0];
  }

  private requireRequest(tenantId: string, requestKey: string): DataSubjectRequest {
    validateTenant(tenantId);
    const request = this.requests.get(`${tenantId}|${requestKey}`);
    if (!request) throw new PrivacyLifecycleError("NOT_FOUND", "data subject request was not found");
    return request;
  }
}
