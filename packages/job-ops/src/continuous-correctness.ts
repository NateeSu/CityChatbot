import { createHash } from "node:crypto";

export type BauCadence = "WEEKLY" | "MONTHLY" | "QUARTERLY";
export type BauDomainState = "ANSWER" | "HANDOFF";
export type BauAuditStatus = "GREEN" | "HANDOFF";

export type BauSource = {
  tenantId: string;
  domainKey: string;
  sourceId: string;
  generation: number;
  active: boolean;
  validUntil: string | null;
  lastCertifiedAt: string;
};

export type BauPolicy = {
  maxCertificationAgeMs: number;
  requiredCadences: readonly BauCadence[];
};

export type BauSourceAudit = {
  tenantId: string;
  status: BauAuditStatus;
  checkedAt: string;
  staleSourceIds: readonly string[];
  affectedDomainKeys: readonly string[];
  alerts: readonly string[];
};

export type BauScheduleJob = {
  id: string;
  tenantId: string;
  cadence: BauCadence;
  windowKey: string;
  status: "SCHEDULED" | "COMPLETED";
  dueAt: string;
};

export type BauRegressionResult = {
  tenantId: string;
  changeId: string;
  status: "PUBLISHED" | "FORCE_HANDOFF";
  traceId: string;
  reasonCode: "RECERTIFIED" | "REGRESSION_REQUIRED";
  changedAt: string;
};

export type BauRollbackResult = {
  tenantId: string;
  domainKey: string;
  status: "ROLLED_BACK";
  traceId: string;
  changedAt: string;
};

export class ContinuousCorrectnessError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "ContinuousCorrectnessError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/;
const DEFAULT_POLICY: BauPolicy = { maxCertificationAgeMs: 30 * 86_400_000, requiredCadences: ["WEEKLY", "MONTHLY", "QUARTERLY"] };
const CADENCE_MS: Readonly<Record<BauCadence, number>> = { WEEKLY: 7 * 86_400_000, MONTHLY: 30 * 86_400_000, QUARTERLY: 90 * 86_400_000 };

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const toIso = (value: Date): string => {
  if (Number.isNaN(value.getTime())) throw new ContinuousCorrectnessError("VALIDATION_ERROR", "date is invalid");
  return value.toISOString();
};
const assertTenantId = (value: string): void => {
  if (!UUID_PATTERN.test(value)) throw new ContinuousCorrectnessError("VALIDATION_ERROR", "tenantId must be a UUID");
};
const assertKey = (value: string, field: string): void => {
  if (!KEY_PATTERN.test(value)) throw new ContinuousCorrectnessError("VALIDATION_ERROR", `${field} is invalid`);
};
const deterministicId = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex").slice(0, 32);
const cadenceWindow = (cadence: BauCadence, date: Date): string => `${cadence}-${Math.floor(date.getTime() / CADENCE_MS[cadence])}`;

export class ContinuousCorrectnessMonitor {
  private readonly schedules = new Map<string, BauScheduleJob>();
  private readonly domainStates = new Map<string, BauDomainState>();
  private readonly regressionResults = new Map<string, BauRegressionResult>();
  private readonly rollbacks = new Map<string, BauRollbackResult>();

  constructor(private readonly policy: BauPolicy = DEFAULT_POLICY) {
    if (!Number.isSafeInteger(policy.maxCertificationAgeMs) || policy.maxCertificationAgeMs <= 0 || policy.maxCertificationAgeMs > 365 * 86_400_000) throw new ContinuousCorrectnessError("VALIDATION_ERROR", "maxCertificationAgeMs is invalid");
    if (!policy.requiredCadences.length || policy.requiredCadences.some((cadence) => !CADENCE_MS[cadence])) throw new ContinuousCorrectnessError("VALIDATION_ERROR", "requiredCadences is invalid");
  }

  schedule(input: { tenantId: string; cadence: BauCadence; now?: Date }): BauScheduleJob {
    assertTenantId(input.tenantId);
    const now = input.now ?? new Date();
    const windowKey = cadenceWindow(input.cadence, now);
    const key = `${input.tenantId}:${input.cadence}:${windowKey}`;
    const prior = this.schedules.get(key);
    if (prior) return clone(prior);
    const job: BauScheduleJob = { id: deterministicId(`bau:${key}`), tenantId: input.tenantId, cadence: input.cadence, windowKey, status: "SCHEDULED", dueAt: toIso(new Date(now.getTime() + CADENCE_MS[input.cadence])) };
    this.schedules.set(key, job);
    return clone(job);
  }

  auditSources(input: { tenantId: string; sources: readonly BauSource[]; now?: Date }): BauSourceAudit {
    assertTenantId(input.tenantId);
    const now = input.now ?? new Date();
    const checkedAt = toIso(now);
    const staleSourceIds: string[] = [];
    const affectedDomainKeys = new Set<string>();
    for (const source of input.sources) {
      assertKey(source.sourceId, "sourceId");
      assertKey(source.domainKey, "domainKey");
      assertTenantId(source.tenantId);
      if (source.tenantId !== input.tenantId) throw new ContinuousCorrectnessError("TENANT_SCOPE_VIOLATION", "source belongs to another tenant");
      const certificationAge = now.getTime() - Date.parse(source.lastCertifiedAt);
      const expired = source.validUntil !== null && Date.parse(source.validUntil) <= now.getTime();
      const stale = !source.active || expired || Number.isNaN(certificationAge) || certificationAge > this.policy.maxCertificationAgeMs;
      if (stale) {
        staleSourceIds.push(source.sourceId);
        affectedDomainKeys.add(source.domainKey);
        this.domainStates.set(`${input.tenantId}:${source.domainKey}`, "HANDOFF");
      }
    }
    return { tenantId: input.tenantId, status: staleSourceIds.length ? "HANDOFF" : "GREEN", checkedAt, staleSourceIds: [...new Set(staleSourceIds)].sort(), affectedDomainKeys: [...affectedDomainKeys].sort(), alerts: staleSourceIds.length ? ["SOURCE_EXPIRED_OR_STALE", "STALE_DOMAIN_FORCE_HANDOFF"] : [] };
  }

  recordRegression(input: { tenantId: string; changeId: string; affectedUnitGateGreen: boolean; recertificationPassed: boolean; now?: Date }): BauRegressionResult {
    assertTenantId(input.tenantId);
    assertKey(input.changeId, "changeId");
    const key = `${input.tenantId}:${input.changeId}`;
    const prior = this.regressionResults.get(key);
    if (prior) return clone(prior);
    const now = input.now ?? new Date();
    const passed = input.affectedUnitGateGreen && input.recertificationPassed;
    const result: BauRegressionResult = { tenantId: input.tenantId, changeId: input.changeId, status: passed ? "PUBLISHED" : "FORCE_HANDOFF", traceId: deterministicId(`bau-regression:${key}`), reasonCode: passed ? "RECERTIFIED" : "REGRESSION_REQUIRED", changedAt: toIso(now) };
    this.regressionResults.set(key, result);
    return clone(result);
  }

  rollbackDomain(input: { tenantId: string; domainKey: string; now?: Date }): BauRollbackResult {
    assertTenantId(input.tenantId);
    assertKey(input.domainKey, "domainKey");
    const key = `${input.tenantId}:${input.domainKey}`;
    const prior = this.rollbacks.get(key);
    if (prior) return clone(prior);
    const now = input.now ?? new Date();
    const result: BauRollbackResult = { tenantId: input.tenantId, domainKey: input.domainKey, status: "ROLLED_BACK", traceId: deterministicId(`bau-rollback:${key}`), changedAt: toIso(now) };
    this.domainStates.set(key, "HANDOFF");
    this.rollbacks.set(key, result);
    return clone(result);
  }

  resolveDomain(tenantId: string, domainKey: string): BauDomainState {
    assertTenantId(tenantId);
    assertKey(domainKey, "domainKey");
    return this.domainStates.get(`${tenantId}:${domainKey}`) ?? "ANSWER";
  }
}

