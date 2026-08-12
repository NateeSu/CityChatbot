import {
  buildKpiReport,
  calculateKpi,
  KPI_DEFINITIONS,
  KpiSnapshotJobRunner,
  KpiSnapshotRepository,
  SYNTHETIC_KPI_TENANT_ID,
  type KpiComplaintFact,
  type KpiReport,
  type KpiReportFilter,
  type KpiSupportTicketFact,
} from "@citychatbot/reports-kpi";
import { LOCAL_DEPARTMENT_A_ID, LOCAL_DEPARTMENT_B_ID } from "../../complaints/repository";

export const LOCAL_REPORT_TENANT_ID = SYNTHETIC_KPI_TENANT_ID;
export const LOCAL_REPORT_NOW = new Date("2026-08-11T04:00:00.000Z");
export const DEFAULT_REPORT_FROM = "2026-07-01T00:00:00.000Z";
export const DEFAULT_REPORT_TO = "2026-09-01T00:00:00.000Z";
const LOCAL_REPORT_DEPARTMENT_C_ID = "88888888-8888-4888-8888-888888888888";

export const LOCAL_REPORT_DEPARTMENTS = [
  { id: "ALL", label: "ทุกหน่วยงาน" },
  { id: LOCAL_DEPARTMENT_A_ID, label: "กองช่าง" },
  { id: LOCAL_DEPARTMENT_B_ID, label: "สำนักปลัด" },
  { id: LOCAL_REPORT_DEPARTMENT_C_ID, label: "กองสาธารณสุข" },
] as const;

const localComplaints: readonly KpiComplaintFact[] = [
  { id: "local-report-complaint-001", tenantId: LOCAL_REPORT_TENANT_ID, departmentId: LOCAL_DEPARTMENT_A_ID, createdAt: "2026-07-04T03:00:00.000Z", canonicalStatus: "CLOSED", closedAt: "2026-07-10T03:00:00.000Z", firstResponseAt: "2026-07-04T04:00:00.000Z", resolvedAt: "2026-07-09T03:00:00.000Z" },
  { id: "local-report-complaint-002", tenantId: LOCAL_REPORT_TENANT_ID, departmentId: LOCAL_DEPARTMENT_A_ID, createdAt: "2026-08-03T03:00:00.000Z", canonicalStatus: "IN_PROGRESS", firstResponseAt: "2026-08-03T04:00:00.000Z" },
  { id: "local-report-complaint-003", tenantId: LOCAL_REPORT_TENANT_ID, departmentId: LOCAL_DEPARTMENT_B_ID, createdAt: "2026-08-06T03:00:00.000Z", canonicalStatus: "RESOLVED", firstResponseAt: "2026-08-06T04:00:00.000Z", resolvedAt: "2026-08-08T03:00:00.000Z" },
  { id: "local-report-complaint-004", tenantId: LOCAL_REPORT_TENANT_ID, departmentId: LOCAL_REPORT_DEPARTMENT_C_ID, createdAt: "2026-08-08T03:00:00.000Z", canonicalStatus: "OUT_OF_JURISDICTION" },
  { id: "local-report-complaint-005", tenantId: LOCAL_REPORT_TENANT_ID, departmentId: LOCAL_DEPARTMENT_B_ID, createdAt: "2026-08-10T03:00:00.000Z", canonicalStatus: "CANCELLED" },
] as const;

const localTickets: readonly KpiSupportTicketFact[] = [
  { id: "local-report-ticket-001", tenantId: LOCAL_REPORT_TENANT_ID, departmentId: LOCAL_DEPARTMENT_A_ID, createdAt: "2026-07-09T03:00:00.000Z", canonicalStatus: "CLOSED" },
  { id: "local-report-ticket-002", tenantId: LOCAL_REPORT_TENANT_ID, departmentId: LOCAL_DEPARTMENT_B_ID, createdAt: "2026-08-05T03:00:00.000Z", canonicalStatus: "IN_PROGRESS" },
  { id: "local-report-ticket-003", tenantId: LOCAL_REPORT_TENANT_ID, departmentId: LOCAL_REPORT_DEPARTMENT_C_ID, createdAt: "2026-08-07T03:00:00.000Z", canonicalStatus: "CLOSED" },
] as const;

const periods = [
  { from: "2026-07-01T00:00:00.000Z", to: "2026-08-01T00:00:00.000Z" },
  { from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" },
] as const;

const dailyPeriods = [
  { from: "2026-08-08T00:00:00.000Z", to: "2026-08-09T00:00:00.000Z" },
  { from: "2026-08-09T00:00:00.000Z", to: "2026-08-10T00:00:00.000Z" },
  { from: "2026-08-10T00:00:00.000Z", to: "2026-08-11T00:00:00.000Z" },
] as const;

const localReportDepartmentIds = [
  LOCAL_DEPARTMENT_A_ID,
  LOCAL_DEPARTMENT_B_ID,
  LOCAL_REPORT_DEPARTMENT_C_ID,
] as const;

const createSnapshotWork = <TGranularity extends "MONTHLY" | "DAILY">(
  sourcePeriods: readonly { from: string; to: string }[],
  granularity: TGranularity,
) => sourcePeriods.flatMap((period) => KPI_DEFINITIONS.flatMap((definition) => [
  {
    metricKey: definition.metricKey,
    filter: { tenantId: LOCAL_REPORT_TENANT_ID, ...period },
    granularity,
  },
  ...localReportDepartmentIds.map((departmentId) => ({
    metricKey: definition.metricKey,
    filter: { tenantId: LOCAL_REPORT_TENANT_ID, departmentId, ...period },
    granularity,
  })),
]));

const createLocalSnapshots = (): KpiSnapshotRepository => {
  const repository = new KpiSnapshotRepository();
  const runner = new KpiSnapshotJobRunner(repository);
  const work = createSnapshotWork(periods, "MONTHLY");
  const result = runner.run({
    tenantId: LOCAL_REPORT_TENANT_ID,
    jobKey: "kpi.report.local-fixture",
    idempotencyKey: "local-report-v1",
    granularity: "MONTHLY",
    sourceWatermark: LOCAL_REPORT_NOW.toISOString(),
    work,
    complaints: localComplaints,
    supportTickets: localTickets,
  }, LOCAL_REPORT_NOW);
  if (result.status !== "SUCCEEDED") throw new Error(`local KPI report fixture failed: ${result.lastError ?? "unknown error"}`);
  const dailyWork = createSnapshotWork(dailyPeriods, "DAILY");
  const dailyResult = runner.run({
    tenantId: LOCAL_REPORT_TENANT_ID,
    jobKey: "kpi.report.local-fixture.daily",
    idempotencyKey: "local-report-daily-v1",
    granularity: "DAILY",
    sourceWatermark: LOCAL_REPORT_NOW.toISOString(),
    work: dailyWork,
    complaints: localComplaints,
    supportTickets: localTickets,
  }, LOCAL_REPORT_NOW);
  if (dailyResult.status !== "SUCCEEDED") throw new Error(`local daily KPI report fixture failed: ${dailyResult.lastError ?? "unknown error"}`);
  return repository;
};

const localSnapshotRepository = createLocalSnapshots();

export const getLocalKpiReport = (input: {
  filter: KpiReportFilter;
  allowedDepartmentIds?: readonly string[];
}): KpiReport => buildKpiReport({
  filter: input.filter,
  snapshots: localSnapshotRepository.listForTenant(LOCAL_REPORT_TENANT_ID),
  reconciliations: localSnapshotRepository.listReconciliations(LOCAL_REPORT_TENANT_ID),
  now: LOCAL_REPORT_NOW,
  allowedDepartmentIds: input.allowedDepartmentIds,
});

export const localKpiReportSource = {
  snapshotCount: localSnapshotRepository.listForTenant(LOCAL_REPORT_TENANT_ID).length,
  reconciliationCount: localSnapshotRepository.listReconciliations(LOCAL_REPORT_TENANT_ID).length,
  calculate: calculateKpi,
};
