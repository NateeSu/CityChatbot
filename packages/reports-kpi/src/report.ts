import {
  KPI_DEFINITIONS,
  KPI_DEFAULT_TIMEZONE,
  type KpiMetricDefinition,
  type KpiMetricKey,
  type KpiResult,
} from "./kpi";
import type { KpiReconciliation, KpiSnapshot } from "./snapshots";

export type KpiReportGranularity = "DAILY" | "MONTHLY";

export type KpiReportFilter = {
  tenantId: string;
  from: string;
  to: string;
  departmentId?: string;
  categoryId?: string;
  timezone?: string;
  granularity?: KpiReportGranularity;
};

export type KpiReportSnapshotView = Pick<
  KpiSnapshot,
  | "id"
  | "metricKey"
  | "definitionVersion"
  | "granularity"
  | "periodFrom"
  | "periodTo"
  | "departmentId"
  | "numerator"
  | "denominator"
  | "pending"
  | "excluded"
  | "value"
  | "unit"
  | "sourceWatermark"
  | "state"
  | "revision"
  | "createdAt"
>;

export type KpiReportMetric = {
  metricKey: KpiMetricKey;
  definition: KpiMetricDefinition;
  latest: KpiReportSnapshotView | null;
  previous: KpiReportSnapshotView | null;
  trend: readonly KpiReportSnapshotView[];
  change: number | null;
  changePercent: number | null;
  freshness: "FRESH" | "STALE" | "MISSING";
  reconciliation: "MATCH" | "MISMATCH" | "PENDING";
  drilldown: {
    queryKey: string;
    description: string;
  };
};

export type KpiReport = {
  tenantId: string;
  filter: Required<Pick<KpiReportFilter, "tenantId" | "from" | "to" | "timezone" | "granularity">> & Pick<KpiReportFilter, "departmentId" | "categoryId">;
  source: "APPROVED_KPI_SNAPSHOTS";
  generatedAt: string;
  latestSourceWatermark: string | null;
  status: "READY" | "EMPTY" | "PARTIAL" | "STALE";
  coverage: {
    definitionCount: number;
    metricsWithCurrentSnapshot: number;
    reconciledMetricCount: number;
    staleMetricCount: number;
  };
  metrics: readonly KpiReportMetric[];
};

export class KpiReportError extends Error {
  constructor(public readonly code: "VALIDATION_ERROR" | "FORBIDDEN", message: string) {
    super(`${code}: ${message}`);
    this.name = "KpiReportError";
  }
}

const MAX_FRESHNESS_AGE_MS = 36 * 60 * 60 * 1_000;

const parseInstant = (value: string, field: string): number => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new KpiReportError("VALIDATION_ERROR", `${field} must be an ISO instant`);
  return parsed;
};

const copySnapshot = (snapshot: KpiSnapshot): KpiReportSnapshotView => ({
  id: snapshot.id,
  metricKey: snapshot.metricKey,
  definitionVersion: snapshot.definitionVersion,
  granularity: snapshot.granularity,
  periodFrom: snapshot.periodFrom,
  periodTo: snapshot.periodTo,
  ...(snapshot.departmentId ? { departmentId: snapshot.departmentId } : {}),
  numerator: snapshot.numerator,
  denominator: snapshot.denominator,
  pending: snapshot.pending,
  excluded: snapshot.excluded,
  value: snapshot.value,
  unit: snapshot.unit,
  sourceWatermark: snapshot.sourceWatermark,
  state: snapshot.state,
  revision: snapshot.revision,
  createdAt: snapshot.createdAt,
});

const validateFilter = (filter: KpiReportFilter): Required<Pick<KpiReportFilter, "tenantId" | "from" | "to" | "timezone" | "granularity">> & Pick<KpiReportFilter, "departmentId" | "categoryId"> => {
  if (!filter.tenantId || filter.tenantId.length > 128) throw new KpiReportError("VALIDATION_ERROR", "tenantId is required");
  const from = parseInstant(filter.from, "from");
  const to = parseInstant(filter.to, "to");
  if (from >= to) throw new KpiReportError("VALIDATION_ERROR", "from must be before to");
  const timezone = filter.timezone ?? KPI_DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new KpiReportError("VALIDATION_ERROR", "timezone is invalid");
  }
  const granularity = filter.granularity ?? "MONTHLY";
  if (!(granularity === "DAILY" || granularity === "MONTHLY")) throw new KpiReportError("VALIDATION_ERROR", "granularity is invalid");
  if (filter.categoryId && filter.categoryId !== "ALL") {
    throw new KpiReportError("VALIDATION_ERROR", "category filter is unavailable until an approved category-aware KPI definition exists");
  }
  return {
    tenantId: filter.tenantId,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    timezone,
    granularity,
    ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
    ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
  };
};

const snapshotInFilter = (snapshot: KpiSnapshot, filter: ReturnType<typeof validateFilter>): boolean => {
  const periodFrom = parseInstant(snapshot.periodFrom, "snapshot.periodFrom");
  const periodTo = parseInstant(snapshot.periodTo, "snapshot.periodTo");
  return snapshot.tenantId === filter.tenantId
    && snapshot.state === "CURRENT"
    && snapshot.granularity === filter.granularity
    && snapshot.departmentId === filter.departmentId
    && periodFrom >= parseInstant(filter.from, "from")
    && periodTo <= parseInstant(filter.to, "to");
};

const freshnessFor = (snapshot: KpiSnapshot | undefined, now: number): "FRESH" | "STALE" | "MISSING" => {
  if (!snapshot) return "MISSING";
  const watermark = parseInstant(snapshot.sourceWatermark, "sourceWatermark");
  return now - watermark <= MAX_FRESHNESS_AGE_MS ? "FRESH" : "STALE";
};

const valueChange = (latest: KpiSnapshot | undefined, previous: KpiSnapshot | undefined): { change: number | null; changePercent: number | null } => {
  if (!latest || !previous || latest.value === null || previous.value === null) return { change: null, changePercent: null };
  const change = latest.value - previous.value;
  return { change, changePercent: previous.value === 0 ? null : change / Math.abs(previous.value) };
};

const reconciliationFor = (snapshot: KpiSnapshot | undefined, reconciliations: readonly KpiReconciliation[]): "MATCH" | "MISMATCH" | "PENDING" => {
  if (!snapshot) return "PENDING";
  const rows = reconciliations.filter((item) => item.snapshotId === snapshot.id);
  if (rows.length === 0) return "PENDING";
  return rows.every((item) => item.matched) ? "MATCH" : "MISMATCH";
};

const sourceWatermarkFor = (snapshots: readonly KpiSnapshot[]): string | null => {
  const values = snapshots.map((snapshot) => parseInstant(snapshot.sourceWatermark, "sourceWatermark"));
  if (values.length === 0) return null;
  return new Date(Math.max(...values)).toISOString();
};

export const buildKpiReport = (input: {
  filter: KpiReportFilter;
  snapshots: readonly KpiSnapshot[];
  reconciliations?: readonly KpiReconciliation[];
  now?: Date;
  allowedDepartmentIds?: readonly string[];
}): KpiReport => {
  const filter = validateFilter(input.filter);
  if (filter.departmentId && input.allowedDepartmentIds && !input.allowedDepartmentIds.includes(filter.departmentId)) {
    throw new KpiReportError("FORBIDDEN", "department is outside the signed-in scope");
  }
  const nowDate = input.now ?? new Date();
  if (!(nowDate instanceof Date) || !Number.isFinite(nowDate.getTime())) throw new KpiReportError("VALIDATION_ERROR", "now is invalid");
  const now = nowDate.getTime();
  const reconciliations = input.reconciliations ?? [];
  const visible = input.snapshots
    .filter((snapshot) => snapshotInFilter(snapshot, filter))
    .sort((left, right) => left.periodFrom.localeCompare(right.periodFrom) || left.metricKey.localeCompare(right.metricKey) || left.revision - right.revision);
  const metrics = KPI_DEFINITIONS.map((definition): KpiReportMetric => {
    const rows = visible.filter((snapshot) => snapshot.metricKey === definition.metricKey);
    const latest = rows.at(-1);
    const previous = rows.at(-2);
    const change = valueChange(latest, previous);
    return {
      metricKey: definition.metricKey,
      definition,
      latest: latest ? copySnapshot(latest) : null,
      previous: previous ? copySnapshot(previous) : null,
      trend: rows.map(copySnapshot),
      ...change,
      freshness: freshnessFor(latest, now),
      reconciliation: reconciliationFor(latest, reconciliations),
      drilldown: {
        queryKey: `${definition.metricKey}|${filter.from}|${filter.to}|${filter.departmentId ?? "TENANT"}`,
        description: definition.drilldown,
      },
    };
  });
  const withCurrent = metrics.filter((metric) => metric.latest !== null).length;
  const reconciled = metrics.filter((metric) => metric.reconciliation === "MATCH").length;
  const stale = metrics.filter((metric) => metric.freshness === "STALE").length;
  const status = withCurrent === 0 ? "EMPTY" : stale > 0 || metrics.some((metric) => metric.reconciliation === "MISMATCH" || metric.reconciliation === "PENDING") ? "PARTIAL" : "READY";
  return {
    tenantId: filter.tenantId,
    filter,
    source: "APPROVED_KPI_SNAPSHOTS",
    generatedAt: nowDate.toISOString(),
    latestSourceWatermark: sourceWatermarkFor(visible),
    status: status === "PARTIAL" && stale === metrics.filter((metric) => metric.latest !== null).length ? "STALE" : status,
    coverage: {
      definitionCount: KPI_DEFINITIONS.length,
      metricsWithCurrentSnapshot: withCurrent,
      reconciledMetricCount: reconciled,
      staleMetricCount: stale,
    },
    metrics,
  };
};

const csvCell = (value: string | number | null | undefined): string => {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/u.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/gu, '""').replace(/[\r\n]+/gu, " ")}"`;
};

export const kpiReportToCsv = (report: KpiReport): string => {
  const header = ["metricKey", "displayName", "unit", "value", "previousValue", "change", "changePercent", "numerator", "denominator", "pending", "excluded", "definitionVersion", "periodFrom", "periodTo", "freshness", "reconciliation", "sourceWatermark"].map(csvCell).join(",");
  const rows = report.metrics.map((metric) => [
    metric.metricKey,
    metric.definition.displayName,
    metric.latest?.unit,
    metric.latest?.value,
    metric.previous?.value,
    metric.change,
    metric.changePercent,
    metric.latest?.numerator,
    metric.latest?.denominator,
    metric.latest?.pending,
    metric.latest?.excluded,
    metric.latest?.definitionVersion ?? metric.definition.version,
    metric.latest?.periodFrom,
    metric.latest?.periodTo,
    metric.freshness,
    metric.reconciliation,
    metric.latest?.sourceWatermark,
  ].map(csvCell).join(","));
  return `${header}\n${rows.join("\n")}\n`;
};

export const reportMetricValue = (metric: KpiReportMetric): KpiResult["value"] => metric.latest?.value ?? null;
