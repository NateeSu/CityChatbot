import { randomUUID } from "node:crypto";

export const ORGANIZATION_ADMIN_ROLES = ["STAFF", "DEPARTMENT_HEAD", "TENANT_ADMIN"] as const;
export type OrganizationAdminRole = (typeof ORGANIZATION_ADMIN_ROLES)[number];
export type OrganizationStatus = "ACTIVE" | "INACTIVE";
export type VersionState = "DRAFT" | "ACTIVE" | "RETIRED";
export type ContactType = "PHONE" | "EMAIL" | "URL" | "LOCATION" | "LINE";
export type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

export type OrganizationActor = {
  tenantId: string;
  accountId: string;
  role: OrganizationAdminRole;
  departmentIds: readonly string[];
};

export type WorkScopeAreaRule = { mode: "INCLUDE" | "EXCLUDE"; value: string };
export type WorkScopePriorityRule = { priority: Priority; riskLevel: "STANDARD" | "SENSITIVE" | "HIGH" };
export type WorkScopeRules = {
  title: string;
  description: string;
  includedKeywords: readonly string[];
  includedCategories: readonly string[];
  excludedTopics: readonly string[];
  areaRules: readonly WorkScopeAreaRule[];
  priorityRiskRules: readonly WorkScopePriorityRule[];
  positiveExamples: readonly string[];
  negativeExamples: readonly string[];
};

export type WorkScopeVersion = {
  id: string;
  tenantId: string;
  departmentId: string;
  version: number;
  state: VersionState;
  scopeRules: WorkScopeRules;
  effectiveFrom?: string;
  effectiveUntil?: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type SlaRuleVersion = {
  id: string;
  tenantId: string;
  departmentId?: string;
  version: number;
  state: VersionState;
  priority?: Priority;
  calendarId: string;
  responseTargetSeconds: number;
  resolutionTargetSeconds: number;
  warningRatio: number;
  pauseStatuses: readonly string[];
  effectiveFrom?: string;
  effectiveUntil?: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type DepartmentContact = {
  id: string;
  tenantId: string;
  departmentId: string;
  contactType: ContactType;
  label: string;
  value: string;
  isPublic: boolean;
  reviewedAt?: string;
  rowVersion: number;
};

export type DepartmentMembership = {
  membershipId: string;
  departmentId: string;
  roleInDepartment: "STAFF" | "HEAD" | "KNOWLEDGE" | "PR";
  isPrimary: boolean;
};

export type DepartmentConfig = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  status: OrganizationStatus;
  memberships: readonly DepartmentMembership[];
  workScopes: readonly WorkScopeVersion[];
  slaRules: readonly SlaRuleVersion[];
  contacts: readonly DepartmentContact[];
  rowVersion: number;
  createdAt: string;
  updatedAt: string;
};

export type ComplaintCategoryConfig = {
  id: string;
  tenantId: string;
  code: string;
  publicName: string;
  description?: string;
  status: OrganizationStatus;
  defaultPriority: Priority;
  rowVersion: number;
};

export type OrganizationAuditEntry = {
  id: string;
  tenantId: string;
  actorAccountId: string;
  action: string;
  resourceType: "DEPARTMENT" | "WORK_SCOPE" | "SLA_RULE" | "CONTACT" | "CATEGORY";
  resourceId: string;
  beforeVersion?: number;
  afterVersion?: number;
  reason: string;
  occurredAt: string;
};

export type OrganizationSnapshot = {
  departments: readonly DepartmentConfig[];
  categories: readonly ComplaintCategoryConfig[];
};

export type CreateDepartmentInput = { code: string; name: string; reason: string; idempotencyKey: string };
export type UpdateDepartmentInput = { code?: string; name?: string; status?: OrganizationStatus; expectedVersion: number; reason: string; idempotencyKey: string };
export type CreateWorkScopeInput = {
  rules: WorkScopeRules;
  effectiveFrom?: string;
  effectiveUntil?: string;
  reason: string;
  idempotencyKey: string;
};
export type CreateSlaRuleInput = {
  departmentId?: string;
  priority?: Priority;
  calendarId: string;
  responseTargetSeconds: number;
  resolutionTargetSeconds: number;
  warningRatio: number;
  pauseStatuses: readonly string[];
  effectiveFrom?: string;
  effectiveUntil?: string;
  reason: string;
  idempotencyKey: string;
};
export type CreateContactInput = {
  contactType: ContactType;
  label: string;
  value: string;
  isPublic: boolean;
  reviewedAt?: string;
  reason: string;
  idempotencyKey: string;
};

export type OrganizationErrorCode =
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "VERSION_CONFLICT"
  | "CONFLICT"
  | "INVALID_STATE"
  | "IDEMPOTENCY_CONFLICT"
  | "IN_USE"
  | "EFFECTIVE_DATE_REQUIRED";

export class OrganizationConfigError extends Error {
  constructor(public readonly code: OrganizationErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "OrganizationConfigError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[A-Z][A-Z0-9_-]{1,31}$/;
const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,24}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const nowIso = (): string => new Date().toISOString();
const assertText = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new OrganizationConfigError("VALIDATION_ERROR", `${field} is invalid`);
  }
  return value.trim();
};
const assertUuid = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new OrganizationConfigError("VALIDATION_ERROR", `${field} must be a UUID`);
  return value;
};
const assertDate = (value: string | undefined, field: string): string | undefined => {
  if (value === undefined) return undefined;
  if (!ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) throw new OrganizationConfigError("VALIDATION_ERROR", `${field} must be an ISO UTC timestamp`);
  return value;
};
const assertWindow = (from: string | undefined, until: string | undefined): void => {
  if (from && until && Date.parse(until) <= Date.parse(from)) throw new OrganizationConfigError("VALIDATION_ERROR", "effectiveUntil must be after effectiveFrom");
};
const assertReason = (value: string): string => assertText(value, "reason", 2000);
const assertKey = (value: string): string => {
  if (!value || value.length < 8 || value.length > 255 || /[\u0000-\u001f\u007f]/.test(value)) throw new OrganizationConfigError("VALIDATION_ERROR", "idempotencyKey is invalid");
  return value;
};
const validateCode = (value: string): string => {
  const code = assertText(value, "code", 32).toUpperCase();
  if (!CODE_PATTERN.test(code)) throw new OrganizationConfigError("VALIDATION_ERROR", "code must use the canonical uppercase format");
  return code;
};
const validateContact = (type: ContactType, value: string): string => {
  const normalized = assertText(value, "contact value", 500);
  if (type === "PHONE" && !PHONE_PATTERN.test(normalized)) throw new OrganizationConfigError("VALIDATION_ERROR", "phone format is invalid");
  if (type === "EMAIL" && !EMAIL_PATTERN.test(normalized)) throw new OrganizationConfigError("VALIDATION_ERROR", "email format is invalid");
  if ((type === "URL" || type === "LINE") && !/^https:\/\//i.test(normalized)) throw new OrganizationConfigError("VALIDATION_ERROR", "public URL must use https");
  return normalized;
};
const validateRules = (rules: WorkScopeRules): WorkScopeRules => {
  if (!rules || !Array.isArray(rules.includedKeywords) || !Array.isArray(rules.includedCategories) || !Array.isArray(rules.excludedTopics) || !Array.isArray(rules.areaRules) || !Array.isArray(rules.priorityRiskRules) || !Array.isArray(rules.positiveExamples) || !Array.isArray(rules.negativeExamples)) {
    throw new OrganizationConfigError("VALIDATION_ERROR", "scopeRules is invalid");
  }
  const title = assertText(rules.title, "scope title", 200);
  const description = assertText(rules.description, "scope description", 2000);
  const list = (value: readonly string[], field: string, max: number): readonly string[] => {
    if (!Array.isArray(value) || value.length > max) throw new OrganizationConfigError("VALIDATION_ERROR", `${field} is invalid`);
    return value.map((item) => assertText(item, field, 160));
  };
  const areaRules = rules.areaRules.map((rule) => {
    if (rule.mode !== "INCLUDE" && rule.mode !== "EXCLUDE") throw new OrganizationConfigError("VALIDATION_ERROR", "area rule mode is invalid");
    return { mode: rule.mode, value: assertText(rule.value, "area rule", 200) };
  });
  const priorityRiskRules = rules.priorityRiskRules.map((rule) => {
    if (!["LOW", "NORMAL", "HIGH", "URGENT"].includes(rule.priority) || !["STANDARD", "SENSITIVE", "HIGH"].includes(rule.riskLevel)) {
      throw new OrganizationConfigError("VALIDATION_ERROR", "priority/risk rule is invalid");
    }
    return { priority: rule.priority, riskLevel: rule.riskLevel };
  });
  return {
    title,
    description,
    includedKeywords: list(rules.includedKeywords, "includedKeywords", 100),
    includedCategories: list(rules.includedCategories, "includedCategories", 100),
    excludedTopics: list(rules.excludedTopics, "excludedTopics", 100),
    areaRules,
    priorityRiskRules,
    positiveExamples: list(rules.positiveExamples, "positiveExamples", 50),
    negativeExamples: list(rules.negativeExamples, "negativeExamples", 50),
  };
};

type IdempotencyValue = { requestHash: string; value: unknown };

export class InMemoryOrganizationConfigRepository {
  private readonly departments = new Map<string, DepartmentConfig>();
  private readonly categories = new Map<string, ComplaintCategoryConfig>();
  private readonly tenantSlaRules: SlaRuleVersion[] = [];
  private readonly audits: OrganizationAuditEntry[] = [];
  private readonly idempotency = new Map<string, IdempotencyValue>();

  constructor(seed: OrganizationSnapshot = createSyntheticOrganizationSnapshot()) {
    for (const department of seed.departments) this.departments.set(department.id, clone(department));
    for (const category of seed.categories) this.categories.set(category.id, clone(category));
  }

  snapshot(actor: OrganizationActor): OrganizationSnapshot {
    return { departments: this.listDepartments(actor), categories: this.listCategories(actor) };
  }

  listDepartments(actor: OrganizationActor): readonly DepartmentConfig[] {
    return [...this.departments.values()]
      .filter((department) => department.tenantId === actor.tenantId)
      .filter((department) => actor.role === "TENANT_ADMIN" || actor.departmentIds.includes(department.id))
      .map(clone);
  }

  listCategories(actor: OrganizationActor): readonly ComplaintCategoryConfig[] {
    return [...this.categories.values()].filter((category) => category.tenantId === actor.tenantId).map(clone);
  }

  listSlaRules(actor: OrganizationActor): readonly SlaRuleVersion[] {
    return [...this.tenantSlaRules.filter((rule) => rule.tenantId === actor.tenantId), ...this.listDepartments(actor).flatMap((department) => department.slaRules)].map(clone);
  }

  getDepartment(actor: OrganizationActor, departmentId: string): DepartmentConfig {
    const id = assertUuid(departmentId, "departmentId");
    const department = this.departments.get(id);
    if (!department || department.tenantId !== actor.tenantId || (actor.role !== "TENANT_ADMIN" && !actor.departmentIds.includes(id))) {
      throw new OrganizationConfigError("NOT_FOUND", "department is not in the permitted tenant scope");
    }
    return clone(department);
  }

  createDepartment(actor: OrganizationActor, input: CreateDepartmentInput): DepartmentConfig {
    this.assertManageTenant(actor);
    const code = validateCode(input.code);
    const name = assertText(input.name, "name", 200);
    const reason = assertReason(input.reason);
    const key = assertKey(input.idempotencyKey);
    return this.idempotent(actor, "create-department", key, { code, name, reason }, () => {
      if ([...this.departments.values()].some((item) => item.tenantId === actor.tenantId && item.code === code)) throw new OrganizationConfigError("DUPLICATE", "department code already exists");
      const timestamp = nowIso();
      const department: DepartmentConfig = { id: randomUUID(), tenantId: actor.tenantId, code, name, status: "ACTIVE", memberships: [], workScopes: [], slaRules: [], contacts: [], rowVersion: 1, createdAt: timestamp, updatedAt: timestamp };
      this.departments.set(department.id, department);
      this.recordAudit(actor, "DEPARTMENT_CREATED", "DEPARTMENT", department.id, undefined, 1, reason);
      return department;
    });
  }

  updateDepartment(actor: OrganizationActor, departmentId: string, input: UpdateDepartmentInput): DepartmentConfig {
    this.assertManageTenant(actor);
    const current = this.getDepartment(actor, departmentId);
    if (current.rowVersion !== input.expectedVersion) throw new OrganizationConfigError("VERSION_CONFLICT", "department version is stale");
    const code = input.code === undefined ? current.code : validateCode(input.code);
    const name = input.name === undefined ? current.name : assertText(input.name, "name", 200);
    const status = input.status ?? current.status;
    const reason = assertReason(input.reason);
    const key = assertKey(input.idempotencyKey);
    return this.idempotent(actor, `update-department:${current.id}`, key, { code, name, status, expectedVersion: input.expectedVersion, reason }, () => {
      if (code !== current.code && [...this.departments.values()].some((item) => item.tenantId === actor.tenantId && item.code === code && item.id !== current.id)) throw new OrganizationConfigError("DUPLICATE", "department code already exists");
      if (status === "INACTIVE" && (current.workScopes.some((item) => item.state === "ACTIVE") || current.slaRules.some((item) => item.state === "ACTIVE") || current.contacts.some((item) => item.isPublic))) throw new OrganizationConfigError("IN_USE", "active configuration must be archived before department deactivation");
      const next: DepartmentConfig = { ...current, code, name, status, rowVersion: current.rowVersion + 1, updatedAt: nowIso() };
      this.departments.set(current.id, next);
      this.recordAudit(actor, "DEPARTMENT_UPDATED", "DEPARTMENT", current.id, current.rowVersion, next.rowVersion, reason);
      return next;
    });
  }

  createWorkScopeVersion(actor: OrganizationActor, departmentId: string, input: CreateWorkScopeInput): WorkScopeVersion {
    this.assertCanManageDepartment(actor, departmentId);
    const department = this.getDepartment(actor, departmentId);
    const rules = validateRules(input.rules);
    const effectiveFrom = assertDate(input.effectiveFrom, "effectiveFrom");
    const effectiveUntil = assertDate(input.effectiveUntil, "effectiveUntil");
    assertWindow(effectiveFrom, effectiveUntil);
    const reason = assertReason(input.reason);
    const key = assertKey(input.idempotencyKey);
    return this.idempotent(actor, `create-work-scope:${department.id}`, key, { rules, effectiveFrom, effectiveUntil, reason }, () => {
      const version = Math.max(0, ...department.workScopes.map((item) => item.version)) + 1;
      const timestamp = nowIso();
      const scope: WorkScopeVersion = { id: randomUUID(), tenantId: actor.tenantId, departmentId: department.id, version, state: "DRAFT", scopeRules: rules, ...(effectiveFrom ? { effectiveFrom } : {}), ...(effectiveUntil ? { effectiveUntil } : {}), createdAt: timestamp, updatedAt: timestamp, rowVersion: 1 };
      this.replaceDepartment(department, { workScopes: [...department.workScopes, scope] });
      this.recordAudit(actor, "WORK_SCOPE_DRAFT_CREATED", "WORK_SCOPE", scope.id, undefined, 1, reason);
      return scope;
    });
  }

  publishWorkScopeVersion(actor: OrganizationActor, departmentId: string, scopeId: string, expectedVersion: number, reasonInput: string, idempotencyKey: string): WorkScopeVersion {
    this.assertCanManageDepartment(actor, departmentId);
    const department = this.getDepartment(actor, departmentId);
    const scope = department.workScopes.find((item) => item.id === scopeId);
    if (!scope) throw new OrganizationConfigError("NOT_FOUND", "work scope version is not in the permitted tenant scope");
    if (scope.rowVersion !== expectedVersion) throw new OrganizationConfigError("VERSION_CONFLICT", "work scope version is stale");
    if (scope.state !== "DRAFT") throw new OrganizationConfigError("INVALID_STATE", "only a draft work scope can be published");
    if (!scope.effectiveFrom) throw new OrganizationConfigError("EFFECTIVE_DATE_REQUIRED", "work scope needs effectiveFrom before publish");
    const effectiveFrom = scope.effectiveFrom;
    const reason = assertReason(reasonInput);
    const key = assertKey(idempotencyKey);
    return this.idempotent(actor, `publish-work-scope:${scope.id}`, key, { expectedVersion, reason }, () => {
      const activeOverlap = department.workScopes.find((item) => item.state === "ACTIVE" && windowsOverlap(item.effectiveFrom, item.effectiveUntil, scope.effectiveFrom, scope.effectiveUntil));
      if (activeOverlap && activeOverlap.effectiveFrom && Date.parse(activeOverlap.effectiveFrom) >= Date.parse(effectiveFrom)) throw new OrganizationConfigError("CONFLICT", "work scope effective window overlaps an active version; retire or supersede it explicitly");
      const published: WorkScopeVersion = { ...scope, state: "ACTIVE", rowVersion: scope.rowVersion + 1, updatedAt: nowIso() };
      this.replaceDepartment(department, { workScopes: department.workScopes.map((item) => item.id === scope.id ? published : activeOverlap && item.id === activeOverlap.id ? { ...item, state: "RETIRED", effectiveUntil: effectiveFrom, rowVersion: item.rowVersion + 1, updatedAt: nowIso() } : item) });
      this.recordAudit(actor, "WORK_SCOPE_PUBLISHED", "WORK_SCOPE", scope.id, scope.rowVersion, published.rowVersion, reason);
      return published;
    });
  }

  createSlaRule(actor: OrganizationActor, input: CreateSlaRuleInput): SlaRuleVersion {
    const departmentId = input.departmentId;
    if (departmentId) this.assertCanManageDepartment(actor, departmentId); else this.assertManageTenant(actor);
    const department = departmentId ? this.getDepartment(actor, departmentId) : undefined;
    const calendarId = assertUuid(input.calendarId, "calendarId");
    const responseTargetSeconds = assertPositiveInteger(input.responseTargetSeconds, "responseTargetSeconds");
    const resolutionTargetSeconds = assertPositiveInteger(input.resolutionTargetSeconds, "resolutionTargetSeconds");
    if (resolutionTargetSeconds < responseTargetSeconds) throw new OrganizationConfigError("VALIDATION_ERROR", "resolutionTargetSeconds must be >= responseTargetSeconds");
    if (!Number.isFinite(input.warningRatio) || input.warningRatio <= 0 || input.warningRatio >= 1) throw new OrganizationConfigError("VALIDATION_ERROR", "warningRatio must be between 0 and 1");
    if (!Array.isArray(input.pauseStatuses) || input.pauseStatuses.length > 20) throw new OrganizationConfigError("VALIDATION_ERROR", "pauseStatuses is invalid");
    const priority = input.priority === undefined ? undefined : assertPriority(input.priority);
    const effectiveFrom = assertDate(input.effectiveFrom, "effectiveFrom");
    const effectiveUntil = assertDate(input.effectiveUntil, "effectiveUntil");
    assertWindow(effectiveFrom, effectiveUntil);
    const reason = assertReason(input.reason);
    const key = assertKey(input.idempotencyKey);
    return this.idempotent(actor, `create-sla-rule:${departmentId ?? "TENANT"}`, key, { departmentId, priority, calendarId, responseTargetSeconds, resolutionTargetSeconds, warningRatio: input.warningRatio, pauseStatuses: input.pauseStatuses, effectiveFrom, effectiveUntil, reason }, () => {
      const rules = department?.slaRules ?? [...this.departments.values()].filter((item) => item.tenantId === actor.tenantId).flatMap((item) => item.slaRules);
      const version = Math.max(0, ...rules.filter((item) => item.departmentId === departmentId && item.priority === priority).map((item) => item.version)) + 1;
      const timestamp = nowIso();
      const rule: SlaRuleVersion = { id: randomUUID(), tenantId: actor.tenantId, ...(departmentId ? { departmentId } : {}), version, state: "DRAFT", ...(priority ? { priority } : {}), calendarId, responseTargetSeconds, resolutionTargetSeconds, warningRatio: input.warningRatio, pauseStatuses: input.pauseStatuses.map((item) => assertText(item, "pauseStatuses", 80)), ...(effectiveFrom ? { effectiveFrom } : {}), ...(effectiveUntil ? { effectiveUntil } : {}), createdAt: timestamp, updatedAt: timestamp, rowVersion: 1 };
      if (department) this.replaceDepartment(department, { slaRules: [...department.slaRules, rule] });
      else this.tenantSlaRules.push(rule);
      this.recordAudit(actor, "SLA_RULE_DRAFT_CREATED", "SLA_RULE", rule.id, undefined, 1, reason);
      return rule;
    });
  }

  publishSlaRule(actor: OrganizationActor, ruleId: string, expectedVersion: number, reasonInput: string, idempotencyKey: string): SlaRuleVersion {
    const found = this.findSlaRule(actor, ruleId);
    if (!found) throw new OrganizationConfigError("NOT_FOUND", "SLA rule is not in the permitted tenant scope");
    const { department, rule } = found;
    if (rule.rowVersion !== expectedVersion) throw new OrganizationConfigError("VERSION_CONFLICT", "SLA rule version is stale");
    if (rule.state !== "DRAFT") throw new OrganizationConfigError("INVALID_STATE", "only a draft SLA rule can be published");
    if (!rule.effectiveFrom) throw new OrganizationConfigError("EFFECTIVE_DATE_REQUIRED", "SLA rule needs effectiveFrom before publish");
    const reason = assertReason(reasonInput);
    const key = assertKey(idempotencyKey);
    return this.idempotent(actor, `publish-sla-rule:${rule.id}`, key, { expectedVersion, reason }, () => {
      const siblings = department?.slaRules ?? [];
      const activeOverlap = siblings.find((item) => item.state === "ACTIVE" && item.priority === rule.priority && windowsOverlap(item.effectiveFrom, item.effectiveUntil, rule.effectiveFrom, rule.effectiveUntil));
      if (activeOverlap && activeOverlap.effectiveFrom && rule.effectiveFrom && Date.parse(activeOverlap.effectiveFrom) >= Date.parse(rule.effectiveFrom)) throw new OrganizationConfigError("CONFLICT", "SLA rule effective window overlaps an active rule with the same precedence");
      const published: SlaRuleVersion = { ...rule, state: "ACTIVE", rowVersion: rule.rowVersion + 1, updatedAt: nowIso() };
      if (department) this.replaceDepartment(department, { slaRules: siblings.map((item) => item.id === rule.id ? published : activeOverlap && item.id === activeOverlap.id ? { ...item, state: "RETIRED", effectiveUntil: rule.effectiveFrom, rowVersion: item.rowVersion + 1, updatedAt: nowIso() } : item) });
      else {
        const index = this.tenantSlaRules.findIndex((item) => item.id === rule.id);
        if (index >= 0) this.tenantSlaRules[index] = published;
      }
      this.recordAudit(actor, "SLA_RULE_PUBLISHED", "SLA_RULE", rule.id, rule.rowVersion, published.rowVersion, reason);
      return published;
    });
  }

  addContact(actor: OrganizationActor, departmentId: string, input: CreateContactInput): DepartmentContact {
    this.assertCanManageDepartment(actor, departmentId);
    const department = this.getDepartment(actor, departmentId);
    if (!["PHONE", "EMAIL", "URL", "LOCATION", "LINE"].includes(input.contactType)) throw new OrganizationConfigError("VALIDATION_ERROR", "contactType is invalid");
    const label = assertText(input.label, "label", 160);
    const value = validateContact(input.contactType, input.value);
    const reviewedAt = assertDate(input.reviewedAt, "reviewedAt");
    if (input.isPublic && !reviewedAt) throw new OrganizationConfigError("VALIDATION_ERROR", "public contact requires reviewedAt");
    const reason = assertReason(input.reason);
    const key = assertKey(input.idempotencyKey);
    return this.idempotent(actor, `create-contact:${department.id}`, key, { contactType: input.contactType, label, value, isPublic: input.isPublic, reviewedAt, reason }, () => {
      const contact: DepartmentContact = { id: randomUUID(), tenantId: actor.tenantId, departmentId: department.id, contactType: input.contactType, label, value, isPublic: input.isPublic, ...(reviewedAt ? { reviewedAt } : {}), rowVersion: 1 };
      this.replaceDepartment(department, { contacts: [...department.contacts, contact] });
      this.recordAudit(actor, "CONTACT_CREATED", "CONTACT", contact.id, undefined, 1, reason);
      return contact;
    });
  }

  listAudit(actor: OrganizationActor): readonly OrganizationAuditEntry[] {
    return this.audits.filter((entry) => entry.tenantId === actor.tenantId).map(clone);
  }

  private assertManageTenant(actor: OrganizationActor): void {
    if (actor.role !== "TENANT_ADMIN") throw new OrganizationConfigError("FORBIDDEN", "tenant configuration requires TENANT_ADMIN");
  }

  private assertCanManageDepartment(actor: OrganizationActor, departmentId: string): void {
    if (actor.role === "TENANT_ADMIN") return;
    if (actor.role === "DEPARTMENT_HEAD" && actor.departmentIds.includes(departmentId)) return;
    throw new OrganizationConfigError("FORBIDDEN", "department configuration is outside the actor scope");
  }

  private replaceDepartment(current: DepartmentConfig, patch: Partial<DepartmentConfig>): void {
    const next: DepartmentConfig = { ...current, ...patch, rowVersion: current.rowVersion + 1, updatedAt: nowIso() };
    this.departments.set(current.id, next);
  }

  private recordAudit(actor: OrganizationActor, action: string, resourceType: OrganizationAuditEntry["resourceType"], resourceId: string, beforeVersion: number | undefined, afterVersion: number | undefined, reason: string): void {
    this.audits.push({ id: randomUUID(), tenantId: actor.tenantId, actorAccountId: actor.accountId, action, resourceType, resourceId, ...(beforeVersion === undefined ? {} : { beforeVersion }), ...(afterVersion === undefined ? {} : { afterVersion }), reason, occurredAt: nowIso() });
  }

  private idempotent<T>(actor: OrganizationActor, route: string, key: string, input: unknown, operation: () => T): T {
    const requestHash = JSON.stringify(input);
    const idempotencyKey = `${actor.tenantId}:${actor.accountId}:${route}:${key}`;
    const previous = this.idempotency.get(idempotencyKey);
    if (previous && previous.requestHash !== requestHash) throw new OrganizationConfigError("IDEMPOTENCY_CONFLICT", "idempotency key was reused with different input");
    if (previous) return clone(previous.value as T);
    const value = operation();
    this.idempotency.set(idempotencyKey, { requestHash, value: clone(value) });
    return clone(value);
  }

  private findSlaRule(actor: OrganizationActor, ruleId: string): { department?: DepartmentConfig; rule: SlaRuleVersion } | undefined {
    const id = assertUuid(ruleId, "ruleId");
    const tenantRule = this.tenantSlaRules.find((item) => item.tenantId === actor.tenantId && item.id === id);
    if (tenantRule && actor.role === "TENANT_ADMIN") return { rule: clone(tenantRule) };
    for (const department of this.listDepartments(actor)) {
      const rule = department.slaRules.find((item) => item.id === id);
      if (rule) return { department, rule };
    }
    return undefined;
  }
}

const assertPositiveInteger = (value: number, field: string): number => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new OrganizationConfigError("VALIDATION_ERROR", `${field} must be a positive integer`);
  return value;
};
const assertPriority = (value: Priority): Priority => {
  if (!["LOW", "NORMAL", "HIGH", "URGENT"].includes(value)) throw new OrganizationConfigError("VALIDATION_ERROR", "priority is invalid");
  return value;
};
const windowsOverlap = (firstFrom: string | undefined, firstUntil: string | undefined, secondFrom: string | undefined, secondUntil: string | undefined): boolean => {
  const firstStart = firstFrom ? Date.parse(firstFrom) : Number.NEGATIVE_INFINITY;
  const firstEnd = firstUntil ? Date.parse(firstUntil) : Number.POSITIVE_INFINITY;
  const secondStart = secondFrom ? Date.parse(secondFrom) : Number.NEGATIVE_INFINITY;
  const secondEnd = secondUntil ? Date.parse(secondUntil) : Number.POSITIVE_INFINITY;
  return firstStart < secondEnd && secondStart < firstEnd;
};

const timestamp = "2026-08-10T00:00:00.000Z";
export const SYNTHETIC_ORG_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const SYNTHETIC_DEPARTMENT_A_ID = "55555555-5555-4555-8555-555555555555";
export const SYNTHETIC_DEPARTMENT_B_ID = "77777777-7777-4777-8777-777777777777";
export const SYNTHETIC_CALENDAR_ID = "52000000-0000-4000-8000-000000000001";

const syntheticScope = (departmentId: string, id: string, name: string): WorkScopeVersion => ({
  id,
  tenantId: SYNTHETIC_ORG_TENANT_ID,
  departmentId,
  version: 1,
  state: "ACTIVE",
  scopeRules: { title: `${name} scope`, description: "Synthetic scope for local contract tests", includedKeywords: [name.toLowerCase()], includedCategories: ["GENERAL"], excludedTopics: [], areaRules: [{ mode: "INCLUDE", value: "tenant-area" }], priorityRiskRules: [{ priority: "NORMAL", riskLevel: "STANDARD" }], positiveExamples: ["ตัวอย่างงานในขอบเขต"], negativeExamples: ["เรื่องนอกขอบเขต"] },
  effectiveFrom: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
  rowVersion: 1,
});

const syntheticSla = (departmentId: string, id: string): SlaRuleVersion => ({ id, tenantId: SYNTHETIC_ORG_TENANT_ID, departmentId, version: 1, state: "ACTIVE", priority: "NORMAL", calendarId: SYNTHETIC_CALENDAR_ID, responseTargetSeconds: 3600, resolutionTargetSeconds: 172800, warningRatio: 0.8, pauseStatuses: ["WAITING_FOR_CITIZEN"], effectiveFrom: timestamp, createdAt: timestamp, updatedAt: timestamp, rowVersion: 1 });

export const createSyntheticOrganizationSnapshot = (): OrganizationSnapshot => ({
  departments: [
    { id: SYNTHETIC_DEPARTMENT_A_ID, tenantId: SYNTHETIC_ORG_TENANT_ID, code: "A1", name: "Synthetic Department A1", status: "ACTIVE", memberships: [{ membershipId: "10000000-0000-4000-8000-000000000001", departmentId: SYNTHETIC_DEPARTMENT_A_ID, roleInDepartment: "STAFF", isPrimary: true }], workScopes: [syntheticScope(SYNTHETIC_DEPARTMENT_A_ID, "a1000000-0000-4000-8000-000000000001", "Department A1")], slaRules: [syntheticSla(SYNTHETIC_DEPARTMENT_A_ID, "a2000000-0000-4000-8000-000000000001")], contacts: [{ id: "a3000000-0000-4000-8000-000000000001", tenantId: SYNTHETIC_ORG_TENANT_ID, departmentId: SYNTHETIC_DEPARTMENT_A_ID, contactType: "PHONE", label: "Synthetic public phone", value: "+66 2 000 0001", isPublic: true, reviewedAt: timestamp, rowVersion: 1 }], rowVersion: 1, createdAt: timestamp, updatedAt: timestamp },
    { id: SYNTHETIC_DEPARTMENT_B_ID, tenantId: SYNTHETIC_ORG_TENANT_ID, code: "B1", name: "Synthetic Department B1", status: "ACTIVE", memberships: [], workScopes: [], slaRules: [], contacts: [], rowVersion: 1, createdAt: timestamp, updatedAt: timestamp },
  ],
  categories: [{ id: "b1000000-0000-4000-8000-000000000001", tenantId: SYNTHETIC_ORG_TENANT_ID, code: "GENERAL", publicName: "Synthetic general service", description: "Synthetic category for local contract tests", status: "ACTIVE", defaultPriority: "NORMAL", rowVersion: 1 }],
});

export const createSyntheticOrganizationRepository = (): InMemoryOrganizationConfigRepository => new InMemoryOrganizationConfigRepository();
