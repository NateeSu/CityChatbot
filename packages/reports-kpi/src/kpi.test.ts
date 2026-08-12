import { describe, expect, it } from "vitest";

import {
  calculateKpi,
  calculateKpiSet,
  compareKpiResults,
  getKpiDefinition,
  KPI_DEFINITION_VERSION,
  KPI_DEFINITIONS,
  SYNTHETIC_KPI_DEPARTMENT_A1,
  SYNTHETIC_KPI_DEPARTMENT_A2,
  SYNTHETIC_KPI_OTHER_TENANT_ID,
  SYNTHETIC_KPI_TENANT_ID,
  type KpiComplaintFact,
  type KpiFilter,
  type KpiResult,
  type KpiSupportTicketFact,
} from "./kpi";

const filter: KpiFilter = {
  tenantId: SYNTHETIC_KPI_TENANT_ID,
  from: "2026-08-01T00:00:00.000Z",
  to: "2026-08-11T00:00:00.000Z",
};

const sla = (responseDueAt: string, resolutionDueAt: string, pausedBusinessSeconds = 0) => ({ responseDueAt, resolutionDueAt, pausedBusinessSeconds });

const complaints: readonly KpiComplaintFact[] = [
  {
    id: "c-one",
    tenantId: SYNTHETIC_KPI_TENANT_ID,
    departmentId: SYNTHETIC_KPI_DEPARTMENT_A1,
    createdAt: "2026-08-01T00:00:00.000Z",
    canonicalStatus: "CLOSED",
    firstResponseAt: "2026-08-01T01:00:00.000Z",
    resolvedAt: "2026-08-02T00:00:00.000Z",
    closedAt: "2026-08-02T01:00:00.000Z",
    slaSnapshot: sla("2026-08-01T02:00:00.000Z", "2026-08-03T00:00:00.000Z"),
    statusHistory: [
      { fromStatus: null, toStatus: "RECEIVED", occurredAt: "2026-08-01T00:00:00.000Z" },
      { fromStatus: "RECEIVED", toStatus: "IN_PROGRESS", occurredAt: "2026-08-01T00:30:00.000Z" },
      { fromStatus: "IN_PROGRESS", toStatus: "RESOLVED", occurredAt: "2026-08-02T00:00:00.000Z" },
      { fromStatus: "RESOLVED", toStatus: "CLOSED", occurredAt: "2026-08-02T01:00:00.000Z" },
    ],
  },
  {
    id: "c-reopened",
    tenantId: SYNTHETIC_KPI_TENANT_ID,
    departmentId: SYNTHETIC_KPI_DEPARTMENT_A1,
    createdAt: "2026-08-03T00:00:00.000Z",
    canonicalStatus: "IN_PROGRESS",
    firstResponseAt: "2026-08-03T03:00:00.000Z",
    resolvedAt: "2026-08-04T00:00:00.000Z",
    closedAt: "2026-08-04T01:00:00.000Z",
    slaSnapshot: sla("2026-08-03T02:00:00.000Z", "2026-08-04T02:00:00.000Z"),
    statusHistory: [
      { fromStatus: null, toStatus: "RECEIVED", occurredAt: "2026-08-03T00:00:00.000Z" },
      { fromStatus: "RECEIVED", toStatus: "RESOLVED", occurredAt: "2026-08-04T00:00:00.000Z" },
      { fromStatus: "RESOLVED", toStatus: "CLOSED", occurredAt: "2026-08-04T01:00:00.000Z" },
      { fromStatus: "CLOSED", toStatus: "IN_PROGRESS", occurredAt: "2026-08-05T00:00:00.000Z" },
    ],
  },
  {
    id: "c-cancelled",
    tenantId: SYNTHETIC_KPI_TENANT_ID,
    departmentId: SYNTHETIC_KPI_DEPARTMENT_A2,
    createdAt: "2026-08-05T00:00:00.000Z",
    canonicalStatus: "CANCELLED",
    slaSnapshot: sla("2026-08-05T02:00:00.000Z", "2026-08-06T00:00:00.000Z"),
    statusHistory: [{ fromStatus: null, toStatus: "CANCELLED", occurredAt: "2026-08-05T00:00:00.000Z" }],
  },
  {
    id: "c-oj",
    tenantId: SYNTHETIC_KPI_TENANT_ID,
    departmentId: SYNTHETIC_KPI_DEPARTMENT_A2,
    createdAt: "2026-08-06T00:00:00.000Z",
    canonicalStatus: "OUT_OF_JURISDICTION",
    slaSnapshot: sla("2026-08-06T02:00:00.000Z", "2026-08-07T00:00:00.000Z"),
    statusHistory: [{ fromStatus: null, toStatus: "OUT_OF_JURISDICTION", occurredAt: "2026-08-06T00:00:00.000Z" }],
  },
  {
    id: "c-paused",
    tenantId: SYNTHETIC_KPI_TENANT_ID,
    departmentId: SYNTHETIC_KPI_DEPARTMENT_A1,
    createdAt: "2026-08-07T00:00:00.000Z",
    canonicalStatus: "RESOLVED",
    firstResponseAt: "2026-08-07T01:00:00.000Z",
    resolvedAt: "2026-08-09T00:30:00.000Z",
    slaSnapshot: sla("2026-08-07T02:00:00.000Z", "2026-08-08T00:00:00.000Z", 86_400),
    statusHistory: [
      { fromStatus: null, toStatus: "RECEIVED", occurredAt: "2026-08-07T00:00:00.000Z" },
      { fromStatus: "RECEIVED", toStatus: "WAITING_FOR_CITIZEN", occurredAt: "2026-08-07T03:00:00.000Z" },
      { fromStatus: "WAITING_FOR_CITIZEN", toStatus: "IN_PROGRESS", occurredAt: "2026-08-08T03:00:00.000Z" },
      { fromStatus: "IN_PROGRESS", toStatus: "RESOLVED", occurredAt: "2026-08-09T00:30:00.000Z" },
    ],
  },
  {
    id: "c-boundary",
    tenantId: SYNTHETIC_KPI_TENANT_ID,
    departmentId: SYNTHETIC_KPI_DEPARTMENT_A1,
    createdAt: "2026-08-11T00:00:00.000Z",
    canonicalStatus: "RECEIVED",
    slaSnapshot: sla("2026-08-11T03:00:00.000Z", "2026-08-12T00:00:00.000Z"),
    statusHistory: [{ fromStatus: null, toStatus: "RECEIVED", occurredAt: "2026-08-11T00:00:00.000Z" }],
  },
  {
    id: "c-pending",
    tenantId: SYNTHETIC_KPI_TENANT_ID,
    departmentId: SYNTHETIC_KPI_DEPARTMENT_A1,
    createdAt: "2026-08-10T00:00:00.000Z",
    canonicalStatus: "RECEIVED",
    slaSnapshot: sla("2026-08-12T03:00:00.000Z", "2026-08-13T00:00:00.000Z"),
    statusHistory: [{ fromStatus: null, toStatus: "RECEIVED", occurredAt: "2026-08-10T00:00:00.000Z" }],
  },
  {
    id: "other-tenant",
    tenantId: SYNTHETIC_KPI_OTHER_TENANT_ID,
    departmentId: "30000000-0000-4000-8000-000000000003",
    createdAt: "2026-08-01T00:00:00.000Z",
    canonicalStatus: "CLOSED",
    closedAt: "2026-08-02T00:00:00.000Z",
    statusHistory: [{ fromStatus: null, toStatus: "CLOSED", occurredAt: "2026-08-02T00:00:00.000Z" }],
  },
];

const tickets: readonly KpiSupportTicketFact[] = [
  {
    id: "t-one",
    tenantId: SYNTHETIC_KPI_TENANT_ID,
    departmentId: SYNTHETIC_KPI_DEPARTMENT_A1,
    createdAt: "2026-08-02T00:00:00.000Z",
    canonicalStatus: "CLOSED",
    statusHistory: [
      { fromStatus: null, toStatus: "NEW", occurredAt: "2026-08-02T00:00:00.000Z" },
      { fromStatus: "NEW", toStatus: "CLOSED", occurredAt: "2026-08-03T00:00:00.000Z" },
    ],
  },
  {
    id: "t-open",
    tenantId: SYNTHETIC_KPI_TENANT_ID,
    departmentId: SYNTHETIC_KPI_DEPARTMENT_A1,
    createdAt: "2026-08-04T00:00:00.000Z",
    canonicalStatus: "IN_PROGRESS",
    statusHistory: [{ fromStatus: null, toStatus: "IN_PROGRESS", occurredAt: "2026-08-04T00:00:00.000Z" }],
  },
];

describe("deterministic KPI dictionary and fixture oracle", () => {
  it("defines every metric as an approved, versioned SQL-backed definition", () => {
    expect(KPI_DEFINITIONS).toHaveLength(9);
    expect(new Set(KPI_DEFINITIONS.map((definition) => definition.metricKey)).size).toBe(9);
    for (const definition of KPI_DEFINITIONS) {
      expect(definition.version).toBe(KPI_DEFINITION_VERSION);
      expect(definition.state).toBe("APPROVED");
      expect(definition.sqlFunction).toBe("private.calculate_kpi");
      expect(definition.formula.length).toBeGreaterThan(10);
      expect(definition.cohort.length).toBeGreaterThan(5);
      expect(definition.tooltip.length).toBeGreaterThan(10);
      expect(definition.drilldown.length).toBeGreaterThan(10);
    }
  });

  it("handles zero, one, many and half-open period boundaries", () => {
    const empty = calculateKpi("COMPLAINT_RECEIVED_VOLUME", filter, [], []);
    expect(empty.numerator).toBe(0);
    expect(empty.value).toBe(0);
    const received = calculateKpi("COMPLAINT_RECEIVED_VOLUME", filter, complaints, []);
    expect(received.numerator).toBe(6);
    const boundary = calculateKpi("COMPLAINT_RECEIVED_VOLUME", { ...filter, to: "2026-08-11T00:00:00.000Z" }, complaints, []);
    expect(boundary.numerator).toBe(6);
    const nextPeriod = calculateKpi("COMPLAINT_RECEIVED_VOLUME", { ...filter, from: "2026-08-11T00:00:00.000Z", to: "2026-08-12T00:00:00.000Z" }, complaints, []);
    expect(nextPeriod.numerator).toBe(1);
  });

  it("keeps tenant and department scopes isolated and reconstructs reopened backlog", () => {
    expect(calculateKpi("COMPLAINT_OPEN_BACKLOG", filter, complaints, []).numerator).toBe(3);
    expect(calculateKpi("COMPLAINT_REOPENED_VOLUME", filter, complaints, []).numerator).toBe(1);
    expect(calculateKpi("COMPLAINT_RECEIVED_VOLUME", { ...filter, tenantId: SYNTHETIC_KPI_OTHER_TENANT_ID }, complaints, []).numerator).toBe(1);
    expect(calculateKpi("COMPLAINT_RECEIVED_VOLUME", { ...filter, departmentId: SYNTHETIC_KPI_DEPARTMENT_A1 }, complaints, []).numerator).toBe(4);
    expect(calculateKpi("COMPLAINT_RECEIVED_VOLUME", { ...filter, departmentId: SYNTHETIC_KPI_DEPARTMENT_A2 }, complaints, []).numerator).toBe(2);
  });

  it("handles cancelled and out-of-jurisdiction exclusions with explicit null rules", () => {
    const result = calculateKpi("OUT_OF_JURISDICTION_RATE", filter, complaints, []);
    expect(result.numerator).toBe(1);
    expect(result.denominator).toBe(5);
    expect(result.excluded).toBe(1);
    const noData = calculateKpi("OUT_OF_JURISDICTION_RATE", { ...filter, departmentId: "missing" }, complaints, []);
    expect(noData.value).toBeNull();
    expect(noData.denominator).toBe(0);
  });

  it("counts first response and resolution SLA with approved pause seconds", () => {
    const response = calculateKpi("FIRST_RESPONSE_SLA_RATE", filter, complaints, []);
    expect(response.numerator).toBe(2);
    expect(response.denominator).toBe(3);
    expect(response.pending).toBe(1);
    expect(response.excluded).toBe(2);
    const resolution = calculateKpi("RESOLUTION_SLA_RATE", filter, complaints, []);
    expect(resolution.numerator).toBe(2);
    expect(resolution.denominator).toBe(3);
    expect(resolution.pending).toBe(1);
    expect(resolution.excluded).toBe(2);
  });

  it("uses support ticket status history for volume and closure rate", () => {
    const volume = calculateKpi("SUPPORT_TICKET_VOLUME", filter, [], tickets);
    expect(volume.numerator).toBe(2);
    const closed = calculateKpi("SUPPORT_TICKET_CLOSED_RATE", filter, [], tickets);
    expect(closed.numerator).toBe(1);
    expect(closed.denominator).toBe(2);
    expect(closed.value).toBe(0.5);
  });

  it("supports exact result comparison and rejects invalid windows", () => {
    const left = calculateKpi("COMPLAINT_RECEIVED_VOLUME", filter, complaints, []);
    const right: KpiResult = { ...left };
    expect(compareKpiResults(left, right)).toBe(true);
    expect(compareKpiResults(left, { ...right, numerator: right.numerator + 1 })).toBe(false);
    expect(() => calculateKpi("COMPLAINT_RECEIVED_VOLUME", { ...filter, from: filter.to }, complaints, [])).toThrowError(/from must be before to/);
    expect(() => getKpiDefinition("NOT_APPROVED" as never)).toThrowError(/UNKNOWN_METRIC/);
  });

  it("calculates the full dictionary without an AI dependency", () => {
    const results = calculateKpiSet(filter, complaints, tickets);
    expect(results).toHaveLength(9);
    expect(results.every((result) => result.source === "APPROVED_SQL_DEFINITION")).toBe(true);
    expect(JSON.stringify(results)).not.toMatch(/openrouter|prompt|model|token/i);
  });
});
