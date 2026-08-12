export const KPI_DEFINITION_VERSION = 1 as const;
export const KPI_DEFAULT_TIMEZONE = "Asia/Bangkok";
export const SYNTHETIC_KPI_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const SYNTHETIC_KPI_OTHER_TENANT_ID = "00000000-0000-4000-8000-000000000002";
export const SYNTHETIC_KPI_DEPARTMENT_A1 = "30000000-0000-4000-8000-000000000001";
export const SYNTHETIC_KPI_DEPARTMENT_A2 = "30000000-0000-4000-8000-000000000002";
export const SYNTHETIC_KPI_DEPARTMENT_B1 = "30000000-0000-4000-8000-000000000003";

const TERMINAL_COMPLAINT_STATES = ["CLOSED", "CANCELLED", "OUT_OF_JURISDICTION"] as const;
const EXCLUDED_SLA_STATES = ["CANCELLED", "OUT_OF_JURISDICTION"] as const;
const COMPLAINT_STATES = [
  "RECEIVED",
  "UNDER_REVIEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_FOR_CITIZEN",
  "RESOLVED",
  "CLOSED",
  "OUT_OF_JURISDICTION",
  "CANCELLED",
] as const;
const SUPPORT_TICKET_STATES = ["NEW", "ASSIGNED", "IN_PROGRESS", "WAITING_FOR_CITIZEN", "ANSWERED", "CLOSED", "CANCELLED"] as const;

export type ComplaintStatus = (typeof COMPLAINT_STATES)[number];
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATES)[number];
export type KpiMetricKey =
  | "COMPLAINT_RECEIVED_VOLUME"
  | "COMPLAINT_CLOSED_VOLUME"
  | "COMPLAINT_OPEN_BACKLOG"
  | "COMPLAINT_REOPENED_VOLUME"
  | "FIRST_RESPONSE_SLA_RATE"
  | "RESOLUTION_SLA_RATE"
  | "OUT_OF_JURISDICTION_RATE"
  | "SUPPORT_TICKET_VOLUME"
  | "SUPPORT_TICKET_CLOSED_RATE";
export type KpiMetricKind = "COUNT" | "RATE";
export type KpiUnit = "CASES" | "PERCENT";

export type KpiMetricDefinition = {
  metricKey: KpiMetricKey;
  version: typeof KPI_DEFINITION_VERSION;
  state: "APPROVED";
  displayName: string;
  kind: KpiMetricKind;
  unit: KpiUnit;
  formula: string;
  cohort: string;
  timezone: string;
  nullRule: string;
  tooltip: string;
  sourceTables: readonly string[];
  sqlFunction: "private.calculate_kpi";
  drilldown: string;
};

export const KPI_DEFINITIONS: readonly KpiMetricDefinition[] = [
  {
    metricKey: "COMPLAINT_RECEIVED_VOLUME",
    version: KPI_DEFINITION_VERSION,
    state: "APPROVED",
    displayName: "เรื่องร้องเรียนที่รับเข้า",
    kind: "COUNT",
    unit: "CASES",
    formula: "count(complaints where created_at >= from and created_at < to)",
    cohort: "created_at in [from, to)",
    timezone: KPI_DEFAULT_TIMEZONE,
    nullRule: "zero rows returns 0 cases",
    tooltip: "จำนวนเรื่องร้องเรียนที่สร้างในช่วงเวลาที่เลือก โดยนับ from และไม่นับ to",
    sourceTables: ["complaints"],
    sqlFunction: "private.calculate_kpi",
    drilldown: "complaints.created_at in [from, to), same tenant and department scope",
  },
  {
    metricKey: "COMPLAINT_CLOSED_VOLUME",
    version: KPI_DEFINITION_VERSION,
    state: "APPROVED",
    displayName: "เรื่องร้องเรียนที่ปิด",
    kind: "COUNT",
    unit: "CASES",
    formula: "count(complaints where closed_at >= from and closed_at < to)",
    cohort: "closed_at in [from, to)",
    timezone: KPI_DEFAULT_TIMEZONE,
    nullRule: "null closed_at is not counted",
    tooltip: "จำนวนเรื่องร้องเรียนที่มีเวลาปิดเรื่องอยู่ในช่วงเวลาที่เลือก",
    sourceTables: ["complaints"],
    sqlFunction: "private.calculate_kpi",
    drilldown: "complaints.closed_at in [from, to), same tenant and department scope",
  },
  {
    metricKey: "COMPLAINT_OPEN_BACKLOG",
    version: KPI_DEFINITION_VERSION,
    state: "APPROVED",
    displayName: "เรื่องร้องเรียนค้าง ณ สิ้นงวด",
    kind: "COUNT",
    unit: "CASES",
    formula: "count(complaints created before to whose status at to is not CLOSED, CANCELLED or OUT_OF_JURISDICTION)",
    cohort: "snapshot at to; created_at < to",
    timezone: KPI_DEFAULT_TIMEZONE,
    nullRule: "zero eligible rows returns 0 cases",
    tooltip: "จำนวนเรื่องที่ยังไม่ปิด ณ เวลา to โดยไม่นับเรื่องยกเลิกหรืออยู่นอกอำนาจ",
    sourceTables: ["complaints", "complaint_status_logs"],
    sqlFunction: "private.calculate_kpi",
    drilldown: "status reconstructed from complaint_status_logs at to",
  },
  {
    metricKey: "COMPLAINT_REOPENED_VOLUME",
    version: KPI_DEFINITION_VERSION,
    state: "APPROVED",
    displayName: "เรื่องร้องเรียนที่เปิดใหม่หลังปิด",
    kind: "COUNT",
    unit: "CASES",
    formula: "count(status log where from_status in (RESOLVED, CLOSED) and to_status = IN_PROGRESS)",
    cohort: "reopen transition occurred_at in [from, to)",
    timezone: KPI_DEFAULT_TIMEZONE,
    nullRule: "zero matching transitions returns 0 cases",
    tooltip: "จำนวนครั้งที่เรื่องซึ่งเคยแก้ไขหรือปิดแล้วถูกเปิดกลับมาดำเนินการในช่วงเวลา",
    sourceTables: ["complaint_status_logs"],
    sqlFunction: "private.calculate_kpi",
    drilldown: "complaint_status_logs transition and occurred_at in [from, to)",
  },
  {
    metricKey: "FIRST_RESPONSE_SLA_RATE",
    version: KPI_DEFINITION_VERSION,
    state: "APPROVED",
    displayName: "อัตราตอบรับแรกภายใน SLA",
    kind: "RATE",
    unit: "PERCENT",
    formula: "successful applicable received complaints / applicable received complaints",
    cohort: "complaints created in [from, to); snapshot as of to",
    timezone: KPI_DEFAULT_TIMEZONE,
    nullRule: "pending cases whose adjusted due is after to are excluded; due cases without response fail; zero denominator returns null",
    tooltip: "สัดส่วนเรื่องที่มีการตอบรับแรกภายในกำหนด SLA ที่บันทึกใน snapshot; เคสที่ยังไม่ถึงกำหนดจะไม่อยู่ในตัวหาร",
    sourceTables: ["complaints", "complaint_sla_snapshots"],
    sqlFunction: "private.calculate_kpi",
    drilldown: "complaints joined to complaint_sla_snapshots by tenant_id and sla_snapshot_id",
  },
  {
    metricKey: "RESOLUTION_SLA_RATE",
    version: KPI_DEFINITION_VERSION,
    state: "APPROVED",
    displayName: "อัตราแก้ไขภายใน SLA",
    kind: "RATE",
    unit: "PERCENT",
    formula: "successful applicable resolved complaints / applicable resolved complaints",
    cohort: "complaints created in [from, to); snapshot as of to",
    timezone: KPI_DEFAULT_TIMEZONE,
    nullRule: "pending cases whose adjusted due is after to are excluded; due cases without resolution fail; zero denominator returns null",
    tooltip: "สัดส่วนเรื่องที่แก้ไขภายในกำหนด โดยหัก approved pause seconds จาก SLA snapshot",
    sourceTables: ["complaints", "complaint_sla_snapshots"],
    sqlFunction: "private.calculate_kpi",
    drilldown: "complaints joined to complaint_sla_snapshots by tenant_id and sla_snapshot_id",
  },
  {
    metricKey: "OUT_OF_JURISDICTION_RATE",
    version: KPI_DEFINITION_VERSION,
    state: "APPROVED",
    displayName: "อัตราเรื่องนอกอำนาจ",
    kind: "RATE",
    unit: "PERCENT",
    formula: "complaints whose status at to is OUT_OF_JURISDICTION / received complaints excluding CANCELLED",
    cohort: "complaints created in [from, to); status snapshot at to",
    timezone: KPI_DEFAULT_TIMEZONE,
    nullRule: "CANCELLED is excluded; zero denominator returns null",
    tooltip: "สัดส่วนเรื่องที่ถูกระบุว่าอยู่นอกอำนาจจากเรื่องที่รับเข้า โดยไม่นับเรื่องที่ยกเลิก",
    sourceTables: ["complaints", "complaint_status_logs"],
    sqlFunction: "private.calculate_kpi",
    drilldown: "status reconstructed from complaint_status_logs at to",
  },
  {
    metricKey: "SUPPORT_TICKET_VOLUME",
    version: KPI_DEFINITION_VERSION,
    state: "APPROVED",
    displayName: "งานส่งต่อที่รับเข้า",
    kind: "COUNT",
    unit: "CASES",
    formula: "count(support_tickets where created_at >= from and created_at < to)",
    cohort: "created_at in [from, to)",
    timezone: KPI_DEFAULT_TIMEZONE,
    nullRule: "zero rows returns 0 cases",
    tooltip: "จำนวนงานที่ถูกส่งต่อเข้าสู่คิวสนับสนุนในช่วงเวลาที่เลือก",
    sourceTables: ["support_tickets"],
    sqlFunction: "private.calculate_kpi",
    drilldown: "support_tickets.created_at in [from, to), same tenant and department scope",
  },
  {
    metricKey: "SUPPORT_TICKET_CLOSED_RATE",
    version: KPI_DEFINITION_VERSION,
    state: "APPROVED",
    displayName: "อัตราปิดงานส่งต่อ",
    kind: "RATE",
    unit: "PERCENT",
    formula: "support tickets whose status at to is CLOSED / received support tickets",
    cohort: "support tickets created in [from, to); status snapshot at to",
    timezone: KPI_DEFAULT_TIMEZONE,
    nullRule: "zero received tickets returns null",
    tooltip: "สัดส่วนงานส่งต่อที่มีสถานะปิด ณ เวลา to จากงานที่รับเข้าในช่วงเวลา",
    sourceTables: ["support_tickets", "support_ticket_status_logs"],
    sqlFunction: "private.calculate_kpi",
    drilldown: "support ticket status reconstructed from support_ticket_status_logs at to",
  },
] as const;

export type KpiStatusLog = {
  fromStatus: ComplaintStatus | null;
  toStatus: ComplaintStatus;
  occurredAt: string;
};

export type SupportTicketStatusLog = {
  fromStatus: SupportTicketStatus | null;
  toStatus: SupportTicketStatus;
  occurredAt: string;
};

export type KpiSlaSnapshot = {
  responseDueAt: string;
  resolutionDueAt: string;
  pausedBusinessSeconds: number;
};

export type KpiComplaintFact = {
  id: string;
  tenantId: string;
  departmentId?: string;
  createdAt: string;
  canonicalStatus: ComplaintStatus;
  firstResponseAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  slaSnapshot?: KpiSlaSnapshot;
  statusHistory?: readonly KpiStatusLog[];
};

export type KpiSupportTicketFact = {
  id: string;
  tenantId: string;
  departmentId?: string;
  createdAt: string;
  canonicalStatus: SupportTicketStatus;
  statusHistory?: readonly SupportTicketStatusLog[];
};

export type KpiFilter = {
  tenantId: string;
  from: string;
  to: string;
  departmentId?: string;
  timezone?: string;
};

export type KpiResult = {
  metricKey: KpiMetricKey;
  definitionVersion: typeof KPI_DEFINITION_VERSION;
  tenantId: string;
  departmentId?: string;
  from: string;
  to: string;
  timezone: string;
  numerator: number;
  denominator: number;
  pending: number;
  excluded: number;
  value: number | null;
  unit: KpiUnit;
  source: "APPROVED_SQL_DEFINITION";
};

export class KpiDomainError extends Error {
  constructor(public readonly code: "VALIDATION_ERROR" | "UNKNOWN_METRIC", message: string) {
    super(`${code}: ${message}`);
    this.name = "KpiDomainError";
  }
}

const definitionByKey = new Map(KPI_DEFINITIONS.map((definition) => [definition.metricKey, definition]));

const parseInstant = (value: string, field: string): number => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new KpiDomainError("VALIDATION_ERROR", `${field} must be an ISO instant`);
  return parsed;
};

const validateFilter = (filter: KpiFilter): { from: number; to: number; timezone: string } => {
  if (!filter.tenantId || filter.tenantId.length > 128) throw new KpiDomainError("VALIDATION_ERROR", "tenantId is required");
  const from = parseInstant(filter.from, "from");
  const to = parseInstant(filter.to, "to");
  if (from >= to) throw new KpiDomainError("VALIDATION_ERROR", "from must be before to");
  const timezone = filter.timezone ?? KPI_DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
  } catch {
    throw new KpiDomainError("VALIDATION_ERROR", "timezone is invalid");
  }
  return { from, to, timezone };
};

const inHalfOpen = (timestamp: string | undefined, from: number, to: number): boolean => {
  if (!timestamp) return false;
  const value = parseInstant(timestamp, "event timestamp");
  return value >= from && value < to;
};

const before = (timestamp: string | undefined, instant: number): boolean => timestamp !== undefined && parseInstant(timestamp, "event timestamp") < instant;

const statusAt = <TStatus extends string>(
  createdAt: string,
  currentStatus: TStatus,
  history: readonly { fromStatus: TStatus | null; toStatus: TStatus; occurredAt: string }[] | undefined,
  asOf: number,
): TStatus => {
  let status = currentStatus;
  let latest = parseInstant(createdAt, "createdAt") <= asOf ? parseInstant(createdAt, "createdAt") : Number.NEGATIVE_INFINITY;
  for (const entry of [...(history ?? [])].sort((left, right) => parseInstant(left.occurredAt, "occurredAt") - parseInstant(right.occurredAt, "occurredAt"))) {
    const occurredAt = parseInstant(entry.occurredAt, "occurredAt");
    if (occurredAt > asOf || occurredAt < latest) continue;
    status = entry.toStatus;
    latest = occurredAt;
  }
  return status;
};

const matchesComplaintScope = (fact: KpiComplaintFact, filter: KpiFilter): boolean => fact.tenantId === filter.tenantId && (filter.departmentId === undefined || fact.departmentId === filter.departmentId);
const matchesTicketScope = (fact: KpiSupportTicketFact, filter: KpiFilter): boolean => fact.tenantId === filter.tenantId && (filter.departmentId === undefined || fact.departmentId === filter.departmentId);

const approvedPauseSeconds = (snapshot: KpiSlaSnapshot | undefined): number => {
  if (!snapshot) return 0;
  if (!Number.isSafeInteger(snapshot.pausedBusinessSeconds) || snapshot.pausedBusinessSeconds < 0) throw new KpiDomainError("VALIDATION_ERROR", "pausedBusinessSeconds is invalid");
  return snapshot.pausedBusinessSeconds;
};

const adjustedDue = (dueAt: string, snapshot: KpiSlaSnapshot): number => parseInstant(dueAt, "SLA due time") + approvedPauseSeconds(snapshot) * 1_000;

const rateValue = (numerator: number, denominator: number): number | null => (denominator === 0 ? null : numerator / denominator);

const baseResult = (definition: KpiMetricDefinition, filter: KpiFilter, context: { numerator: number; denominator?: number; pending?: number; excluded?: number }): KpiResult => {
  const denominator = context.denominator ?? (definition.kind === "COUNT" ? context.numerator : 0);
  return {
    metricKey: definition.metricKey,
    definitionVersion: definition.version,
    tenantId: filter.tenantId,
    ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
    from: filter.from,
    to: filter.to,
    timezone: filter.timezone ?? KPI_DEFAULT_TIMEZONE,
    numerator: context.numerator,
    denominator,
    pending: context.pending ?? 0,
    excluded: context.excluded ?? 0,
    value: definition.kind === "COUNT" ? context.numerator : rateValue(context.numerator, denominator),
    unit: definition.unit,
    source: "APPROVED_SQL_DEFINITION",
  };
};

export const getKpiDefinition = (metricKey: KpiMetricKey): KpiMetricDefinition => {
  const definition = definitionByKey.get(metricKey);
  if (!definition) throw new KpiDomainError("UNKNOWN_METRIC", `metric ${metricKey} is not approved`);
  return definition;
};

export const calculateKpi = (
  metricKey: KpiMetricKey,
  filter: KpiFilter,
  complaints: readonly KpiComplaintFact[] = [],
  supportTickets: readonly KpiSupportTicketFact[] = [],
): KpiResult => {
  const definition = getKpiDefinition(metricKey);
  const { from, to } = validateFilter(filter);
  const scopedComplaints = complaints.filter((fact) => matchesComplaintScope(fact, filter));
  const scopedTickets = supportTickets.filter((fact) => matchesTicketScope(fact, filter));
  const received = scopedComplaints.filter((fact) => inHalfOpen(fact.createdAt, from, to));
  const asOfStatuses = new Map(scopedComplaints.map((fact) => [fact.id, statusAt(fact.createdAt, fact.canonicalStatus, fact.statusHistory, to)]));

  switch (metricKey) {
    case "COMPLAINT_RECEIVED_VOLUME":
      return baseResult(definition, filter, { numerator: received.length });
    case "COMPLAINT_CLOSED_VOLUME":
      return baseResult(definition, filter, { numerator: scopedComplaints.filter((fact) => inHalfOpen(fact.closedAt, from, to)).length });
    case "COMPLAINT_OPEN_BACKLOG":
      return baseResult(definition, filter, {
        numerator: scopedComplaints.filter((fact) => parseInstant(fact.createdAt, "createdAt") < to && !TERMINAL_COMPLAINT_STATES.includes(asOfStatuses.get(fact.id) as (typeof TERMINAL_COMPLAINT_STATES)[number])).length,
      });
    case "COMPLAINT_REOPENED_VOLUME":
      return baseResult(definition, filter, {
        numerator: scopedComplaints.reduce((count, fact) => count + (fact.statusHistory ?? []).filter((entry) => entry.fromStatus !== null && ["RESOLVED", "CLOSED"].includes(entry.fromStatus) && entry.toStatus === "IN_PROGRESS" && inHalfOpen(entry.occurredAt, from, to)).length, 0),
      });
    case "FIRST_RESPONSE_SLA_RATE": {
      let numerator = 0;
      let denominator = 0;
      let pending = 0;
      let excluded = 0;
      for (const fact of received) {
        const status = asOfStatuses.get(fact.id);
        if (EXCLUDED_SLA_STATES.includes(status as (typeof EXCLUDED_SLA_STATES)[number]) || !fact.slaSnapshot) {
          excluded += 1;
          continue;
        }
        const snapshot = fact.slaSnapshot;
        const due = adjustedDue(snapshot.responseDueAt, snapshot);
        if (fact.firstResponseAt && before(fact.firstResponseAt, to)) {
          denominator += 1;
          if (parseInstant(fact.firstResponseAt, "firstResponseAt") <= due) numerator += 1;
        } else if (due <= to) {
          denominator += 1;
        } else {
          pending += 1;
        }
      }
      return baseResult(definition, filter, { numerator, denominator, pending, excluded });
    }
    case "RESOLUTION_SLA_RATE": {
      let numerator = 0;
      let denominator = 0;
      let pending = 0;
      let excluded = 0;
      for (const fact of received) {
        const status = asOfStatuses.get(fact.id);
        if (EXCLUDED_SLA_STATES.includes(status as (typeof EXCLUDED_SLA_STATES)[number]) || !fact.slaSnapshot) {
          excluded += 1;
          continue;
        }
        const snapshot = fact.slaSnapshot;
        const due = adjustedDue(snapshot.resolutionDueAt, snapshot);
        if (fact.resolvedAt && before(fact.resolvedAt, to)) {
          denominator += 1;
          if (parseInstant(fact.resolvedAt, "resolvedAt") <= due) numerator += 1;
        } else if (due <= to) {
          denominator += 1;
        } else {
          pending += 1;
        }
      }
      return baseResult(definition, filter, { numerator, denominator, pending, excluded });
    }
    case "OUT_OF_JURISDICTION_RATE": {
      const applicable = received.filter((fact) => asOfStatuses.get(fact.id) !== "CANCELLED");
      const numerator = applicable.filter((fact) => asOfStatuses.get(fact.id) === "OUT_OF_JURISDICTION").length;
      return baseResult(definition, filter, { numerator, denominator: applicable.length, excluded: received.length - applicable.length });
    }
    case "SUPPORT_TICKET_VOLUME":
      return baseResult(definition, filter, { numerator: scopedTickets.filter((fact) => inHalfOpen(fact.createdAt, from, to)).length });
    case "SUPPORT_TICKET_CLOSED_RATE": {
      const receivedTickets = scopedTickets.filter((fact) => inHalfOpen(fact.createdAt, from, to));
      const numerator = receivedTickets.filter((fact) => statusAt(fact.createdAt, fact.canonicalStatus, fact.statusHistory, to) === "CLOSED").length;
      return baseResult(definition, filter, { numerator, denominator: receivedTickets.length });
    }
  }
};

export const calculateKpiSet = (
  filter: KpiFilter,
  complaints: readonly KpiComplaintFact[] = [],
  supportTickets: readonly KpiSupportTicketFact[] = [],
): readonly KpiResult[] => KPI_DEFINITIONS.map((definition) => calculateKpi(definition.metricKey, filter, complaints, supportTickets));

export const compareKpiResults = (left: KpiResult, right: KpiResult): boolean =>
  left.metricKey === right.metricKey
  && left.definitionVersion === right.definitionVersion
  && left.tenantId === right.tenantId
  && left.departmentId === right.departmentId
  && left.from === right.from
  && left.to === right.to
  && left.numerator === right.numerator
  && left.denominator === right.denominator
  && left.pending === right.pending
  && left.excluded === right.excluded
  && left.value === right.value;
