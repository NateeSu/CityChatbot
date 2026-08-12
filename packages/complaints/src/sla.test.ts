import { describe, expect, it } from "vitest";

import { SlaDomainError, addBusinessSeconds, applySlaStatus, businessSecondsBetween, createSlaSnapshot, evaluateSla, recomputeSlaSnapshot, scanSlaSnapshots, selectSlaRule, validateBusinessCalendar, type SlaBusinessCalendar, type SlaRuleVersion } from "./sla";

const TENANT = "tenant-a";
const DEPARTMENT = "department-a";
const CATEGORY = "category-a";
const calendar: SlaBusinessCalendar = { id: "calendar-bkk", tenantId: TENANT, timezone: "Asia/Bangkok", workingWeekdays: [1, 2, 3, 4, 5], windows: [{ start: "09:00", end: "17:00" }], holidayDates: [] };
const rule = (overrides: Partial<SlaRuleVersion> = {}): SlaRuleVersion => ({ id: "rule-default", tenantId: TENANT, version: 1, state: "ACTIVE", responseTargetSeconds: 3_600, resolutionTargetSeconds: 7_200, priority: "HIGH", calendar, pauseStatuses: ["WAITING_FOR_CITIZEN"], ...overrides });

describe("SLA calendar, rule selection and scan contract", () => {
  it("selects the full precedence chain deterministically", () => {
    const rules = [
      rule({ id: "default", priority: undefined, departmentId: undefined, categoryId: undefined }),
      rule({ id: "tenant-priority", priority: "HIGH", departmentId: undefined, categoryId: undefined }),
      rule({ id: "department-priority", priority: "HIGH", departmentId: DEPARTMENT, categoryId: undefined }),
      rule({ id: "category-priority", priority: "HIGH", departmentId: undefined, categoryId: CATEGORY }),
      rule({ id: "full", priority: "HIGH", departmentId: DEPARTMENT, categoryId: CATEGORY }),
    ];
    expect(selectSlaRule(rules, { tenantId: TENANT, departmentId: DEPARTMENT, categoryId: CATEGORY, priority: "HIGH", at: new Date("2026-08-10T02:00:00.000Z") }).id).toBe("full");
    expect(selectSlaRule(rules.filter((candidate) => candidate.id !== "full"), { tenantId: TENANT, departmentId: DEPARTMENT, categoryId: CATEGORY, priority: "HIGH", at: new Date("2026-08-10T02:00:00.000Z") }).id).toBe("category-priority");
    expect(selectSlaRule(rules.filter((candidate) => !["full", "category-priority"].includes(candidate.id)), { tenantId: TENANT, departmentId: DEPARTMENT, priority: "HIGH", at: new Date("2026-08-10T02:00:00.000Z") }).id).toBe("department-priority");
    expect(selectSlaRule(rules.filter((candidate) => !["full", "category-priority", "department-priority"].includes(candidate.id)), { tenantId: TENANT, departmentId: DEPARTMENT, priority: "HIGH", at: new Date("2026-08-10T02:00:00.000Z") }).id).toBe("tenant-priority");
    expect(selectSlaRule(rules.filter((candidate) => candidate.id === "default"), { tenantId: TENANT, departmentId: DEPARTMENT, priority: "HIGH", at: new Date("2026-08-10T02:00:00.000Z") }).id).toBe("default");
  });

  it("counts exact business seconds across weekend and holiday in Bangkok", () => {
    const fridayNine = new Date("2026-08-07T02:00:00.000Z");
    const mondayTen = addBusinessSeconds(fridayNine, 9 * 60 * 60, calendar);
    expect(mondayTen.toISOString()).toBe("2026-08-10T03:00:00.000Z");
    const holidayCalendar = { ...calendar, holidayDates: ["2026-08-10"] };
    const tuesdayTen = addBusinessSeconds(fridayNine, 9 * 60 * 60, holidayCalendar);
    expect(tuesdayTen.toISOString()).toBe("2026-08-11T03:00:00.000Z");
    expect(businessSecondsBetween(new Date("2026-08-07T02:00:00.000Z"), new Date("2026-08-10T03:00:00.000Z"), calendar)).toBe(9 * 60 * 60);
  });

  it("keeps IANA DST conversion stable and rejects unsafe calendar configuration", () => {
    const easternCalendar: SlaBusinessCalendar = { id: "calendar-ny", tenantId: TENANT, timezone: "America/New_York", workingWeekdays: [1, 2, 3, 4, 5], windows: [{ start: "09:00", end: "17:00" }], holidayDates: [] };
    expect(addBusinessSeconds(new Date("2026-03-06T14:00:00.000Z"), 16 * 60 * 60, easternCalendar).toISOString()).toBe("2026-03-09T21:00:00.000Z");
    expect(() => validateBusinessCalendar({ ...calendar, windows: [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "17:00" }] })).toThrowError(SlaDomainError);
    expect(() => validateBusinessCalendar({ ...calendar, holidayDates: ["2026-02-30"] })).toThrowError(SlaDomainError);
    expect(() => selectSlaRule([rule({ state: "RETIRED" })], { tenantId: TENANT, priority: "HIGH", at: new Date("2026-08-10T02:00:00.000Z") })).toThrowError(SlaDomainError);
  });

  it("snapshots rule version and evaluates exact 80% and 100% boundaries", () => {
    const snapshot = createSlaSnapshot({ id: "snapshot-001", complaintId: "complaint-001", tenantId: TENANT, departmentId: DEPARTMENT, categoryId: CATEGORY, priority: "HIGH", startedAt: new Date("2026-08-10T02:00:00.000Z"), rules: [rule({ id: "rule-v7", version: 7, responseTargetSeconds: 100, resolutionTargetSeconds: 200 })] });
    expect(snapshot.ruleVersion).toBe(7);
    expect(evaluateSla(snapshot, { now: new Date(snapshot.responseWarningAt) }).response).toBe("WARNING");
    expect(evaluateSla(snapshot, { now: new Date(snapshot.responseDueAt) }).response).toBe("BREACHED");
    expect(evaluateSla(snapshot, { now: new Date(snapshot.resolutionWarningAt) }).resolution).toBe("WARNING");
    expect(evaluateSla(snapshot, { now: new Date(snapshot.resolutionDueAt) }).resolution).toBe("BREACHED");
  });

  it("pauses during WAITING_FOR_CITIZEN and resumes with business-time shift only", () => {
    const snapshot = createSlaSnapshot({ id: "snapshot-pause", complaintId: "complaint-pause", tenantId: TENANT, departmentId: DEPARTMENT, priority: "HIGH", startedAt: new Date("2026-08-10T02:00:00.000Z"), rules: [rule({ responseTargetSeconds: 7_200, resolutionTargetSeconds: 14_400 })] });
    const paused = applySlaStatus(snapshot, "WAITING_FOR_CITIZEN", new Date("2026-08-10T03:00:00.000Z"), calendar);
    expect(paused.state).toBe("PAUSED");
    const resumed = applySlaStatus(paused, "IN_PROGRESS", new Date("2026-08-11T03:00:00.000Z"), calendar);
    expect(resumed.state).toBe("ACTIVE");
    expect(resumed.pausedBusinessSeconds).toBe(8 * 60 * 60);
    expect(resumed.resolutionDueAt).toBe("2026-08-11T06:00:00.000Z");
  });

  it("emits warning/breach once per milestone and never rewrites history silently", () => {
    const snapshot = createSlaSnapshot({ id: "snapshot-scan", complaintId: "complaint-scan", tenantId: TENANT, priority: "HIGH", startedAt: new Date("2026-08-10T02:00:00.000Z"), rules: [rule({ responseTargetSeconds: 100, resolutionTargetSeconds: 200 })] });
    const warning = scanSlaSnapshots([{ snapshot, status: "IN_PROGRESS", calendar }], new Date(snapshot.responseWarningAt));
    expect(warning.events).toHaveLength(1);
    expect(warning.events[0]).toMatchObject({ type: "complaint.sla_warning", milestone: "response" });
    const now = new Date(snapshot.responseDueAt);
    const first = scanSlaSnapshots([{ snapshot, status: "IN_PROGRESS", calendar }], now);
    expect(first.events).toHaveLength(1);
    expect(first.events[0]).toMatchObject({ type: "complaint.sla_breached", milestone: "response" });
    const replay = scanSlaSnapshots([{ snapshot, status: "IN_PROGRESS", calendar }], now, new Set(first.emittedKeys));
    expect(replay.events).toHaveLength(0);
    const currentRule = rule({ id: "rule-default", version: 1 });
    const skipped = recomputeSlaSnapshot(snapshot, currentRule, { at: now, reason: "ตรวจสอบซ้ำตามรอบ" });
    expect(skipped.audit.action).toBe("SLA_RECOMPUTE_SKIPPED");
    expect(() => recomputeSlaSnapshot(snapshot, rule({ id: "rule-v2", version: 2 }), { at: now, reason: "ห้ามแก้ย้อนหลัง" })).toThrowError(SlaDomainError);
    expect(() => selectSlaRule([rule({ state: "RETIRED" })], { tenantId: TENANT, priority: "HIGH", at: now })).toThrowError(SlaDomainError);
  });

  it("marks terminal statuses completed and preserves explicit historical override audit", () => {
    const snapshot = createSlaSnapshot({ id: "snapshot-close", complaintId: "complaint-close", tenantId: TENANT, priority: "NORMAL", startedAt: new Date("2026-08-10T02:00:00.000Z"), rules: [rule({ priority: undefined, departmentId: undefined, categoryId: undefined })] });
    const completed = applySlaStatus(snapshot, "RESOLVED", new Date("2026-08-10T03:00:00.000Z"), calendar);
    expect(completed.state).toBe("COMPLETED");
    expect(evaluateSla(completed, { now: new Date("2026-08-10T03:00:00.000Z"), resolvedAt: completed.resolutionDueAt }).resolution).toBe("COMPLETED");
    const rewritten = recomputeSlaSnapshot(snapshot, rule({ id: "rule-v2", version: 2, priority: undefined, departmentId: undefined, categoryId: undefined }), { at: new Date("2026-08-10T04:00:00.000Z"), reason: "approved policy change", allowHistoricalRewrite: true });
    expect(rewritten.audit.action).toBe("SLA_RECOMPUTED");
    expect(rewritten.snapshot.ruleVersion).toBe(2);
  });
});
