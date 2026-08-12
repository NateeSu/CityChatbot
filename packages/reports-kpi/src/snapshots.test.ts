import { describe, expect, it } from "vitest";

import {
  calculateKpi,
  SYNTHETIC_KPI_OTHER_TENANT_ID,
  SYNTHETIC_KPI_TENANT_ID,
  type KpiComplaintFact,
} from "./kpi";
import {
  KpiSnapshotError,
  KpiSnapshotJobRunner,
  KpiSnapshotRepository,
  snapshotKeyFor,
  utcPeriodFor,
  type KpiSnapshotWorkItem,
} from "./snapshots";

const filter = {
  tenantId: SYNTHETIC_KPI_TENANT_ID,
  from: "2026-08-01T00:00:00.000Z",
  to: "2026-08-02T00:00:00.000Z",
} as const;

const complaint = (id: string, tenantId = SYNTHETIC_KPI_TENANT_ID, createdAt = "2026-08-01T04:00:00.000Z"): KpiComplaintFact => ({
  id,
  tenantId,
  createdAt,
  canonicalStatus: "RECEIVED",
  statusHistory: [{ fromStatus: null, toStatus: "RECEIVED", occurredAt: createdAt }],
});

const workItem = (metricKey: KpiSnapshotWorkItem["metricKey"] = "COMPLAINT_RECEIVED_VOLUME"): KpiSnapshotWorkItem => ({
  metricKey,
  filter,
  granularity: "DAILY",
});

describe("KPI snapshot aggregation and correction", () => {
  it("builds deterministic UTC daily and monthly periods", () => {
    expect(utcPeriodFor("DAILY", new Date("2026-08-11T23:59:59.000Z"))).toEqual({ from: "2026-08-11T00:00:00.000Z", to: "2026-08-12T00:00:00.000Z" });
    expect(utcPeriodFor("MONTHLY", new Date("2026-08-11T23:59:59.000Z"))).toEqual({ from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" });
  });

  it("materializes a snapshot exactly once and does not rewind a watermark", () => {
    const repository = new KpiSnapshotRepository();
    const runner = new KpiSnapshotJobRunner(repository);
    const input = {
      tenantId: SYNTHETIC_KPI_TENANT_ID,
      jobKey: "kpi.daily",
      idempotencyKey: "run-001",
      granularity: "DAILY" as const,
      sourceWatermark: "2026-08-02T00:00:00.000Z",
      work: [workItem()],
      complaints: [complaint("c1")],
    };
    const first = runner.run(input, new Date("2026-08-02T01:00:00.000Z"));
    const replay = runner.run(input, new Date("2026-08-02T02:00:00.000Z"));
    expect(first.status).toBe("SUCCEEDED");
    expect(first.snapshots[0]?.revision).toBe(1);
    expect(replay.idempotentReplay).toBe(true);
    expect(repository.listForTenant(SYNTHETIC_KPI_TENANT_ID)).toHaveLength(1);
    const older = runner.run({ ...input, idempotencyKey: "run-002", sourceWatermark: "2026-08-01T23:00:00.000Z" }, new Date("2026-08-02T03:00:00.000Z"));
    expect(older.status).toBe("SUCCEEDED");
    expect(repository.getWatermark(SYNTHETIC_KPI_TENANT_ID, "kpi.daily")?.watermark).toBe("2026-08-02T00:00:00.000Z");
  });

  it("resumes a partial job from its cursor without duplicating completed work", () => {
    const repository = new KpiSnapshotRepository();
    const runner = new KpiSnapshotJobRunner(repository);
    const input = {
      tenantId: SYNTHETIC_KPI_TENANT_ID,
      jobKey: "kpi.daily",
      idempotencyKey: "run-partial",
      granularity: "DAILY" as const,
      sourceWatermark: "2026-08-02T00:00:00.000Z",
      work: [workItem("COMPLAINT_RECEIVED_VOLUME"), workItem("COMPLAINT_OPEN_BACKLOG")],
      complaints: [complaint("c1")],
      failureAfter: 1,
    };
    const partial = runner.run(input, new Date("2026-08-02T01:00:00.000Z"));
    expect(partial.status).toBe("PARTIAL");
    expect(partial.cursor).toBe(1);
    expect(repository.getWatermark(SYNTHETIC_KPI_TENANT_ID, "kpi.daily")).toBeUndefined();
    const resumed = runner.run({ ...input, failureAfter: undefined }, new Date("2026-08-02T02:00:00.000Z"));
    expect(resumed.status).toBe("SUCCEEDED");
    expect(resumed.cursor).toBe(2);
    expect(repository.listForTenant(SYNTHETIC_KPI_TENANT_ID)).toHaveLength(2);
    expect(repository.listReconciliations(SYNTHETIC_KPI_TENANT_ID).every((item) => item.matched)).toBe(true);
  });

  it("creates a new current revision for late data while retaining the old revision", () => {
    const repository = new KpiSnapshotRepository();
    const runner = new KpiSnapshotJobRunner(repository);
    const firstInput = {
      tenantId: SYNTHETIC_KPI_TENANT_ID,
      jobKey: "kpi.daily",
      idempotencyKey: "run-before-late-data",
      granularity: "DAILY" as const,
      sourceWatermark: "2026-08-02T00:00:00.000Z",
      work: [workItem()],
      complaints: [complaint("c1")],
    };
    runner.run(firstInput, new Date("2026-08-02T01:00:00.000Z"));
    const corrected = runner.run({
      ...firstInput,
      idempotencyKey: "run-late-correction",
      sourceWatermark: "2026-08-03T00:00:00.000Z",
      work: [{ ...workItem(), correctionReason: "late source event" }],
      complaints: [complaint("c1"), complaint("c2")],
    }, new Date("2026-08-03T01:00:00.000Z"));
    expect(corrected.status).toBe("SUCCEEDED");
    expect(corrected.snapshots[0]?.revision).toBe(2);
    const revisions = repository.listForTenant(SYNTHETIC_KPI_TENANT_ID);
    expect(revisions.filter((snapshot) => snapshot.state === "SUPERSEDED")).toHaveLength(1);
    expect(revisions.find((snapshot) => snapshot.state === "CURRENT")?.numerator).toBe(2);
    expect(repository.getWatermark(SYNTHETIC_KPI_TENANT_ID, "kpi.daily")?.watermark).toBe("2026-08-03T00:00:00.000Z");
  });

  it("rejects idempotency payload changes and cross-tenant work", () => {
    const repository = new KpiSnapshotRepository();
    const runner = new KpiSnapshotJobRunner(repository);
    const input = {
      tenantId: SYNTHETIC_KPI_TENANT_ID,
      jobKey: "kpi.daily",
      idempotencyKey: "run-conflict",
      granularity: "DAILY" as const,
      sourceWatermark: "2026-08-02T00:00:00.000Z",
      work: [workItem()],
      complaints: [complaint("c1")],
    };
    runner.run(input);
    expect(() => runner.run({ ...input, complaints: [complaint("different")] })).not.toThrow();
    expect(() => runner.run({ ...input, idempotencyKey: "run-conflict", work: [{ ...workItem(), filter: { ...filter, tenantId: SYNTHETIC_KPI_OTHER_TENANT_ID } }] })).toThrowError(/crosses tenant/);
    expect(() => runner.run({ ...input, idempotencyKey: "run-conflict", work: [workItem("SUPPORT_TICKET_VOLUME")] })).toThrowError(KpiSnapshotError);
  });

  it("records a failed reconciliation and archives only expired superseded revisions with retention handling", () => {
    const repository = new KpiSnapshotRepository();
    const result = calculateKpi("COMPLAINT_RECEIVED_VOLUME", filter, [complaint("c1")], []);
    const materialized = repository.materialize(result, workItem(), "2026-08-02T00:00:00.000Z", new Date("2026-08-02T01:00:00.000Z"), "2026-08-02T02:00:00.000Z");
    const mismatch = repository.reconcile(materialized.snapshot, { ...result, numerator: 99 }, new Date("2026-08-02T01:30:00.000Z"));
    expect(mismatch.matched).toBe(false);
    const corrected = repository.materialize({ ...result, numerator: 2 }, { ...workItem(), correctionReason: "late" }, "2026-08-03T00:00:00.000Z", new Date("2026-08-03T01:00:00.000Z"), "2026-08-03T02:00:00.000Z");
    expect(corrected.snapshot.revision).toBe(2);
    expect(repository.archiveExpiredSuperseded(new Date("2026-08-04T00:00:00.000Z"))).toBe(1);
    expect(repository.getCurrent(snapshotKeyFor(workItem(), 1), SYNTHETIC_KPI_TENANT_ID).state).toBe("CURRENT");
  });
});
