import { describe, expect, it } from "vitest";

import {
  createSyntheticOrganizationRepository,
  OrganizationConfigError,
  SYNTHETIC_CALENDAR_ID,
  SYNTHETIC_DEPARTMENT_A_ID,
  SYNTHETIC_ORG_TENANT_ID,
  type OrganizationActor,
  type WorkScopeRules,
} from "./organization";

const admin: OrganizationActor = { tenantId: SYNTHETIC_ORG_TENANT_ID, accountId: "10000000-0000-4000-8000-000000000003", role: "TENANT_ADMIN", departmentIds: [] };
const head: OrganizationActor = { tenantId: SYNTHETIC_ORG_TENANT_ID, accountId: "10000000-0000-4000-8000-000000000004", role: "DEPARTMENT_HEAD", departmentIds: [SYNTHETIC_DEPARTMENT_A_ID] };
const otherTenant: OrganizationActor = { tenantId: "00000000-0000-4000-8000-000000000002", accountId: "10000000-0000-4000-8000-000000000002", role: "TENANT_ADMIN", departmentIds: [] };
const rules: WorkScopeRules = { title: "Public works scope", description: "Road and drainage requests", includedKeywords: ["road", "drain"], includedCategories: ["GENERAL"], excludedTopics: ["private dispute"], areaRules: [{ mode: "INCLUDE", value: "municipal area" }], priorityRiskRules: [{ priority: "NORMAL", riskLevel: "STANDARD" }], positiveExamples: ["road damage"], negativeExamples: ["private dispute"] };

const expectCode = (operation: () => unknown, code: OrganizationConfigError["code"]): void => {
  try { operation(); throw new Error("expected organization error"); } catch (error) { expect(error).toBeInstanceOf(OrganizationConfigError); expect((error as OrganizationConfigError).code).toBe(code); }
};

describe("organization configuration contract", () => {
  it("keeps department list and detail tenant/department scoped", () => {
    const repository = createSyntheticOrganizationRepository();
    expect(repository.listDepartments(admin)).toHaveLength(2);
    expect(repository.listDepartments(otherTenant)).toHaveLength(0);
    expectCode(() => repository.getDepartment(otherTenant, SYNTHETIC_DEPARTMENT_A_ID), "NOT_FOUND");
  });

  it("creates an auditable department idempotently and rejects duplicate codes", () => {
    const repository = createSyntheticOrganizationRepository();
    const input = { code: "NEW1", name: "New department", reason: "approved config change", idempotencyKey: "create-dept-001" };
    const first = repository.createDepartment(admin, input);
    const replay = repository.createDepartment(admin, input);
    expect(replay).toEqual(first);
    expect(repository.listDepartments(admin)).toHaveLength(3);
    expectCode(() => repository.createDepartment(admin, { ...input, idempotencyKey: "create-dept-002" }), "DUPLICATE");
    expect(repository.listAudit(admin)).toHaveLength(1);
  });

  it("requires optimistic version and prevents deactivation while active config is referenced", () => {
    const repository = createSyntheticOrganizationRepository();
    expectCode(() => repository.updateDepartment(admin, SYNTHETIC_DEPARTMENT_A_ID, { status: "INACTIVE", expectedVersion: 1, reason: "archive", idempotencyKey: "archive-dept-001" }), "IN_USE");
    expectCode(() => repository.updateDepartment(admin, SYNTHETIC_DEPARTMENT_A_ID, { name: "stale", expectedVersion: 9, reason: "edit", idempotencyKey: "edit-dept-001" }), "VERSION_CONFLICT");
  });

  it("creates and publishes a work-scope version only with effective date and non-overlap", () => {
    const repository = createSyntheticOrganizationRepository();
    const draft = repository.createWorkScopeVersion(admin, SYNTHETIC_DEPARTMENT_A_ID, { rules, effectiveFrom: "2027-01-01T00:00:00.000Z", reason: "new routing scope", idempotencyKey: "scope-draft-001" });
    expect(draft.state).toBe("DRAFT");
    expect(repository.publishWorkScopeVersion(admin, SYNTHETIC_DEPARTMENT_A_ID, draft.id, draft.rowVersion, "publish scope", "scope-publish-001").state).toBe("ACTIVE");
    const noDate = repository.createWorkScopeVersion(admin, SYNTHETIC_DEPARTMENT_A_ID, { rules, reason: "missing date", idempotencyKey: "scope-draft-002" });
    expectCode(() => repository.publishWorkScopeVersion(admin, SYNTHETIC_DEPARTMENT_A_ID, noDate.id, noDate.rowVersion, "publish", "scope-publish-002"), "EFFECTIVE_DATE_REQUIRED");
  });

  it("validates SLA targets, public contacts, role scope and audit trail", () => {
    const repository = createSyntheticOrganizationRepository();
    expectCode(() => repository.createSlaRule(admin, { departmentId: SYNTHETIC_DEPARTMENT_A_ID, calendarId: SYNTHETIC_CALENDAR_ID, responseTargetSeconds: 20, resolutionTargetSeconds: 10, warningRatio: 0.8, pauseStatuses: [], reason: "bad sla", idempotencyKey: "sla-bad-001" }), "VALIDATION_ERROR");
    const rule = repository.createSlaRule(head, { departmentId: SYNTHETIC_DEPARTMENT_A_ID, calendarId: SYNTHETIC_CALENDAR_ID, responseTargetSeconds: 60, resolutionTargetSeconds: 600, warningRatio: 0.8, pauseStatuses: ["WAITING_FOR_CITIZEN"], effectiveFrom: "2027-01-01T00:00:00.000Z", reason: "department SLA", idempotencyKey: "sla-good-001" });
    expect(repository.publishSlaRule(head, rule.id, rule.rowVersion, "publish SLA", "sla-publish-001").state).toBe("ACTIVE");
    const contact = repository.addContact(admin, SYNTHETIC_DEPARTMENT_A_ID, { contactType: "PHONE", label: "Public line", value: "+66 2 123 4567", isPublic: true, reviewedAt: "2026-08-11T00:00:00.000Z", reason: "verified contact", idempotencyKey: "contact-001" });
    expect(contact.isPublic).toBe(true);
    expectCode(() => repository.addContact(admin, SYNTHETIC_DEPARTMENT_A_ID, { contactType: "PHONE", label: "Bad", value: "not-phone", isPublic: true, reason: "invalid", idempotencyKey: "contact-002" }), "VALIDATION_ERROR");
    expectCode(() => repository.createWorkScopeVersion(otherTenant, SYNTHETIC_DEPARTMENT_A_ID, { rules, effectiveFrom: "2027-01-01T00:00:00.000Z", reason: "cross tenant", idempotencyKey: "cross-001" }), "NOT_FOUND");
    expect(repository.listAudit(admin).length).toBeGreaterThanOrEqual(3);
  });
});
