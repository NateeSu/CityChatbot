import { createHash } from "node:crypto";

import {
  calculateKpi,
  compareKpiResults,
  type KpiComplaintFact,
  type KpiFilter,
  type KpiMetricKey,
  type KpiResult,
  type KpiSupportTicketFact,
} from "./kpi";

export type SnapshotGranularity = "DAILY" | "MONTHLY";
export type SnapshotState = "CURRENT" | "SUPERSEDED" | "ARCHIVED";
export type SnapshotJobState = "RUNNING" | "PARTIAL" | "SUCCEEDED" | "FAILED";

export type KpiSnapshotWorkItem = {
  metricKey: KpiMetricKey;
  filter: KpiFilter;
  granularity: SnapshotGranularity;
  definitionVersion?: number;
  correctionReason?: string;
};

export type KpiSnapshot = {
  id: string;
  snapshotKey: string;
  tenantId: string;
  metricKey: KpiMetricKey;
  definitionVersion: number;
  granularity: SnapshotGranularity;
  periodFrom: string;
  periodTo: string;
  departmentId?: string;
  numerator: number;
  denominator: number;
  pending: number;
  excluded: number;
  value: number | null;
  unit: KpiResult["unit"];
  sourceWatermark: string;
  state: SnapshotState;
  revision: number;
  correctionReason?: string;
  retentionUntil?: string;
  createdAt: string;
};

export type KpiWatermark = {
  tenantId: string;
  jobKey: string;
  granularity: SnapshotGranularity;
  watermark: string;
  periodEnd?: string;
  updatedAt: string;
};

export type KpiReconciliation = {
  id: string;
  tenantId: string;
  snapshotId: string;
  matched: boolean;
  expected: Pick<KpiSnapshot, "numerator" | "denominator" | "pending" | "excluded" | "value" | "definitionVersion">;
  actual: Pick<KpiSnapshot, "numerator" | "denominator" | "pending" | "excluded" | "value" | "definitionVersion">;
  checkedAt: string;
};

export type KpiSnapshotJobRecord = {
  id: string;
  tenantId: string;
  jobKey: string;
  idempotencyKey: string;
  granularity: SnapshotGranularity;
  sourceWatermark: string;
  fingerprint: string;
  status: SnapshotJobState;
  cursor: number;
  totalWork: number;
  processedWork: number;
  lastError?: string;
  startedAt: string;
  completedAt?: string;
};

export type KpiSnapshotJobInput = {
  tenantId: string;
  jobKey: string;
  idempotencyKey: string;
  granularity: SnapshotGranularity;
  sourceWatermark: string;
  work: readonly KpiSnapshotWorkItem[];
  complaints?: readonly KpiComplaintFact[];
  supportTickets?: readonly KpiSupportTicketFact[];
  failureAfter?: number;
};

export type KpiSnapshotJobResult = KpiSnapshotJobRecord & {
  idempotentReplay: boolean;
  snapshots: readonly KpiSnapshot[];
  reconciliations: readonly KpiReconciliation[];
};

export type MaterializeSnapshotResult = {
  snapshot: KpiSnapshot;
  idempotentReplay: boolean;
};

export class KpiSnapshotError extends Error {
  constructor(
    public readonly code: "VALIDATION_ERROR" | "IDEMPOTENCY_CONFLICT" | "NOT_FOUND" | "RECONCILIATION_MISMATCH" | "INVALID_STATE",
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "KpiSnapshotError";
  }
}

const parseInstant = (value: string, field: string): number => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new KpiSnapshotError("VALIDATION_ERROR", `${field} must be an ISO instant`);
  return parsed;
};

const assertGranularity = (granularity: SnapshotGranularity): void => {
  if (!(["DAILY", "MONTHLY"] as const).includes(granularity)) throw new KpiSnapshotError("VALIDATION_ERROR", "granularity is invalid");
};

const assertWatermark = (watermark: string): void => {
  parseInstant(watermark, "sourceWatermark");
};

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

export const snapshotKeyFor = (work: KpiSnapshotWorkItem, definitionVersion: number): string => {
  assertGranularity(work.granularity);
  return [
    work.filter.tenantId,
    work.metricKey,
    definitionVersion,
    work.granularity,
    work.filter.from,
    work.filter.to,
    work.filter.departmentId ?? "TENANT",
  ].join("|");
};

export const utcPeriodFor = (granularity: SnapshotGranularity, at: Date): { from: string; to: string } => {
  assertGranularity(granularity);
  if (!(at instanceof Date) || !Number.isFinite(at.getTime())) throw new KpiSnapshotError("VALIDATION_ERROR", "period date is invalid");
  const year = at.getUTCFullYear();
  const month = at.getUTCMonth();
  const from = granularity === "DAILY" ? new Date(Date.UTC(year, month, at.getUTCDate())) : new Date(Date.UTC(year, month, 1));
  const to = granularity === "DAILY" ? new Date(from.getTime() + 86_400_000) : new Date(Date.UTC(year, month + 1, 1));
  return { from: from.toISOString(), to: to.toISOString() };
};

const fingerprintWork = (input: KpiSnapshotJobInput): string => hash(JSON.stringify({
  tenantId: input.tenantId,
  jobKey: input.jobKey,
  granularity: input.granularity,
  sourceWatermark: input.sourceWatermark,
  work: input.work.map((item) => ({
    metricKey: item.metricKey,
    filter: item.filter,
    granularity: item.granularity,
    definitionVersion: item.definitionVersion ?? null,
    correctionReason: item.correctionReason ?? null,
  })),
}));

const snapshotMatchesResult = (snapshot: KpiSnapshot, result: KpiResult): boolean =>
  snapshot.tenantId === result.tenantId
  && snapshot.metricKey === result.metricKey
  && snapshot.definitionVersion === result.definitionVersion
  && snapshot.periodFrom === result.from
  && snapshot.periodTo === result.to
  && snapshot.departmentId === result.departmentId
  && snapshot.numerator === result.numerator
  && snapshot.denominator === result.denominator
  && snapshot.pending === result.pending
  && snapshot.excluded === result.excluded
  && snapshot.value === result.value
  && snapshot.unit === result.unit;

export class KpiSnapshotRepository {
  private readonly snapshots = new Map<string, KpiSnapshot[]>();
  private readonly watermarks = new Map<string, KpiWatermark>();
  private readonly reconciliations: KpiReconciliation[] = [];

  materialize(result: KpiResult, work: KpiSnapshotWorkItem, sourceWatermark: string, now = new Date(), retentionUntil?: string): MaterializeSnapshotResult {
    assertWatermark(sourceWatermark);
    const nowIso = now.toISOString();
    const definitionVersion = result.definitionVersion;
    const key = snapshotKeyFor(work, definitionVersion);
    const versions = this.snapshots.get(key) ?? [];
    const current = versions.find((snapshot) => snapshot.state === "CURRENT");
    if (current && snapshotMatchesResult(current, result)) return { snapshot: { ...current }, idempotentReplay: true };
    if (current) current.state = "SUPERSEDED";
    const nextRevision = (versions.at(-1)?.revision ?? 0) + 1;
    const snapshot: KpiSnapshot = {
      id: `kpi-snapshot-${hash(`${key}|${nextRevision}`).slice(0, 24)}`,
      snapshotKey: key,
      tenantId: result.tenantId,
      metricKey: result.metricKey,
      definitionVersion,
      granularity: work.granularity,
      periodFrom: result.from,
      periodTo: result.to,
      ...(result.departmentId ? { departmentId: result.departmentId } : {}),
      numerator: result.numerator,
      denominator: result.denominator,
      pending: result.pending,
      excluded: result.excluded,
      value: result.value,
      unit: result.unit,
      sourceWatermark,
      state: "CURRENT",
      revision: nextRevision,
      ...(work.correctionReason ? { correctionReason: work.correctionReason } : {}),
      ...(retentionUntil ? { retentionUntil } : {}),
      createdAt: nowIso,
    };
    versions.push(snapshot);
    this.snapshots.set(key, versions);
    return { snapshot: { ...snapshot }, idempotentReplay: false };
  }

  getCurrent(snapshotKey: string, tenantId: string): KpiSnapshot {
    const snapshot = this.snapshots.get(snapshotKey)?.find((candidate) => candidate.state === "CURRENT" && candidate.tenantId === tenantId);
    if (!snapshot) throw new KpiSnapshotError("NOT_FOUND", "current KPI snapshot was not found");
    return { ...snapshot };
  }

  listForTenant(tenantId: string): readonly KpiSnapshot[] {
    return [...this.snapshots.values()].flat().filter((snapshot) => snapshot.tenantId === tenantId).map((snapshot) => ({ ...snapshot }));
  }

  reconcile(snapshot: KpiSnapshot, result: KpiResult, checkedAt = new Date()): KpiReconciliation {
    const actual = {
      numerator: snapshot.numerator,
      denominator: snapshot.denominator,
      pending: snapshot.pending,
      excluded: snapshot.excluded,
      value: snapshot.value,
      definitionVersion: snapshot.definitionVersion,
    } as const;
    const expected = {
      numerator: result.numerator,
      denominator: result.denominator,
      pending: result.pending,
      excluded: result.excluded,
      value: result.value,
      definitionVersion: result.definitionVersion,
    } as const;
    const reconciliation: KpiReconciliation = {
      id: `kpi-reconciliation-${hash(`${snapshot.id}|${checkedAt.toISOString()}`).slice(0, 24)}`,
      tenantId: result.tenantId,
      snapshotId: snapshot.id,
      matched: compareKpiResults(
        {
          ...result,
          from: snapshot.periodFrom,
          to: snapshot.periodTo,
        },
        {
          metricKey: snapshot.metricKey,
          definitionVersion: snapshot.definitionVersion as KpiResult["definitionVersion"],
          tenantId: snapshot.tenantId,
          ...(snapshot.departmentId ? { departmentId: snapshot.departmentId } : {}),
          from: snapshot.periodFrom,
          to: snapshot.periodTo,
          timezone: result.timezone,
          numerator: snapshot.numerator,
          denominator: snapshot.denominator,
          pending: snapshot.pending,
          excluded: snapshot.excluded,
          value: snapshot.value,
          unit: snapshot.unit,
          source: "APPROVED_SQL_DEFINITION",
        },
      ),
      expected,
      actual,
      checkedAt: checkedAt.toISOString(),
    };
    this.reconciliations.push(reconciliation);
    return { ...reconciliation };
  }

  listReconciliations(tenantId: string): readonly KpiReconciliation[] {
    return this.reconciliations.filter((reconciliation) => reconciliation.tenantId === tenantId).map((reconciliation) => ({ ...reconciliation }));
  }

  advanceWatermark(tenantId: string, jobKey: string, granularity: SnapshotGranularity, watermark: string, periodEnd?: string, now = new Date()): KpiWatermark {
    assertWatermark(watermark);
    assertGranularity(granularity);
    const key = `${tenantId}|${jobKey}`;
    const existing = this.watermarks.get(key);
    if (existing && parseInstant(existing.watermark, "watermark") >= parseInstant(watermark, "watermark")) return { ...existing };
    const next: KpiWatermark = {
      tenantId,
      jobKey,
      granularity,
      watermark,
      ...(periodEnd ? { periodEnd } : {}),
      updatedAt: now.toISOString(),
    };
    this.watermarks.set(key, next);
    return { ...next };
  }

  getWatermark(tenantId: string, jobKey: string): KpiWatermark | undefined {
    const watermark = this.watermarks.get(`${tenantId}|${jobKey}`);
    return watermark ? { ...watermark } : undefined;
  }

  archiveExpiredSuperseded(now = new Date()): number {
    const instant = now.getTime();
    let count = 0;
    for (const versions of this.snapshots.values()) {
      for (const snapshot of versions) {
        if (snapshot.state === "SUPERSEDED" && snapshot.retentionUntil && parseInstant(snapshot.retentionUntil, "retentionUntil") <= instant) {
          snapshot.state = "ARCHIVED";
          count += 1;
        }
      }
    }
    return count;
  }
}

export class KpiSnapshotJobRunner {
  private readonly jobs = new Map<string, KpiSnapshotJobRecord>();

  constructor(
    private readonly repository: KpiSnapshotRepository,
    private readonly calculate: typeof calculateKpi = calculateKpi,
  ) {}

  run(input: KpiSnapshotJobInput, now = new Date()): KpiSnapshotJobResult {
    assertGranularity(input.granularity);
    assertWatermark(input.sourceWatermark);
    if (!input.tenantId || !input.jobKey || !input.idempotencyKey) throw new KpiSnapshotError("VALIDATION_ERROR", "tenant, job and idempotency keys are required");
    if (input.failureAfter !== undefined && (!Number.isSafeInteger(input.failureAfter) || input.failureAfter < 0)) throw new KpiSnapshotError("VALIDATION_ERROR", "failureAfter is invalid");
    if (input.work.some((item) => item.filter.tenantId !== input.tenantId || item.granularity !== input.granularity)) throw new KpiSnapshotError("VALIDATION_ERROR", "snapshot work crosses tenant or granularity scope");
    const fingerprint = fingerprintWork(input);
    const jobId = `${input.tenantId}|${input.jobKey}|${input.idempotencyKey}`;
    const existing = this.jobs.get(jobId);
    if (existing && existing.fingerprint !== fingerprint) throw new KpiSnapshotError("IDEMPOTENCY_CONFLICT", "snapshot job replay payload differs");
    if (existing?.status === "SUCCEEDED") return this.resultFor(existing, true);
    const job: KpiSnapshotJobRecord = existing ?? {
      id: `kpi-job-${hash(jobId).slice(0, 24)}`,
      tenantId: input.tenantId,
      jobKey: input.jobKey,
      idempotencyKey: input.idempotencyKey,
      granularity: input.granularity,
      sourceWatermark: input.sourceWatermark,
      fingerprint,
      status: "RUNNING",
      cursor: 0,
      totalWork: input.work.length,
      processedWork: 0,
      startedAt: now.toISOString(),
    };
    job.status = "RUNNING";
    job.lastError = undefined;
    this.jobs.set(jobId, job);
    const snapshots: KpiSnapshot[] = [];
    const reconciliations: KpiReconciliation[] = [];
    try {
      for (let index = job.cursor; index < input.work.length; index += 1) {
        if (input.failureAfter !== undefined && job.processedWork >= input.failureAfter) {
          job.status = "PARTIAL";
          job.lastError = "synthetic worker interruption; safe to resume with the same idempotency key";
          return this.resultFor(job, false, snapshots, reconciliations);
        }
        const work = input.work[index]!;
        const result = this.calculate(work.metricKey, work.filter, input.complaints ?? [], input.supportTickets ?? []);
        if (work.definitionVersion !== undefined && result.definitionVersion !== work.definitionVersion) throw new KpiSnapshotError("INVALID_STATE", "work definition version does not match approved calculation");
        const materialized = this.repository.materialize(result, work, input.sourceWatermark, now);
        const reconciliation = this.repository.reconcile(materialized.snapshot, result, now);
        if (!reconciliation.matched) throw new KpiSnapshotError("RECONCILIATION_MISMATCH", "snapshot differs from approved raw calculation");
        snapshots.push(materialized.snapshot);
        reconciliations.push(reconciliation);
        job.cursor = index + 1;
        job.processedWork = job.cursor;
      }
      this.repository.advanceWatermark(input.tenantId, input.jobKey, input.granularity, input.sourceWatermark, input.work.at(-1)?.filter.to, now);
      job.status = "SUCCEEDED";
      job.completedAt = now.toISOString();
      return this.resultFor(job, false, snapshots, reconciliations);
    } catch (error) {
      job.status = "PARTIAL";
      job.lastError = error instanceof Error ? error.message : "snapshot worker failed";
      return this.resultFor(job, false, snapshots, reconciliations);
    }
  }

  getJob(tenantId: string, jobKey: string, idempotencyKey: string): KpiSnapshotJobRecord {
    const job = this.jobs.get(`${tenantId}|${jobKey}|${idempotencyKey}`);
    if (!job) throw new KpiSnapshotError("NOT_FOUND", "snapshot job was not found");
    return { ...job };
  }

  private resultFor(job: KpiSnapshotJobRecord, idempotentReplay: boolean, snapshots: readonly KpiSnapshot[] = [], reconciliations: readonly KpiReconciliation[] = []): KpiSnapshotJobResult {
    return {
      ...job,
      idempotentReplay,
      snapshots: snapshots.map((snapshot) => ({ ...snapshot })),
      reconciliations: reconciliations.map((reconciliation) => ({ ...reconciliation })),
    };
  }
}
