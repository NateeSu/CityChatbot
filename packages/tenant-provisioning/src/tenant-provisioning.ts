import { randomUUID } from "node:crypto";

export const SYSTEM_TENANT_ADMIN_ACCOUNT_ID = "90000000-0000-4000-8000-000000000001";
export const SYNTHETIC_PILOT_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const DEFAULT_TENANT_TIMEZONE = "Asia/Bangkok" as const;

export const PROVISIONING_STEP_KEYS = ["TENANT", "SETTINGS", "CHANNEL", "DEPARTMENTS", "ADMIN", "THEME", "MENU", "CONTACT", "FLAGS"] as const;
export type ProvisioningStepKey = (typeof PROVISIONING_STEP_KEYS)[number];
export type ProvisioningStepStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type ProvisioningRunStatus = "RUNNING" | "PARTIAL" | "COMPLETE" | "ROLLED_BACK";
export type TenantStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";
export type PackageCode = "PILOT" | "STANDARD" | "ENTERPRISE";
export type FeatureFlagKey = "ai_chat_enabled" | "complaint_ai_routing_enabled" | "news_broadcast_enabled" | "executive_ai_summary_enabled" | "rich_menu_enabled" | "gold_price_enabled";
export type FeatureFlagState = "ACTIVE" | "RETIRED";
export type UsageLimitKey = "staff_seats" | "line_events_daily" | "storage_bytes" | "ai_runs_monthly";
export type UsageWindow = "DAY" | "MONTH";

export const FEATURE_FLAG_KEYS: readonly FeatureFlagKey[] = ["ai_chat_enabled", "complaint_ai_routing_enabled", "news_broadcast_enabled", "executive_ai_summary_enabled", "rich_menu_enabled", "gold_price_enabled"];
export const USAGE_LIMIT_KEYS: readonly UsageLimitKey[] = ["staff_seats", "line_events_daily", "storage_bytes", "ai_runs_monthly"];

export type SuperAdminActor = {
  accountId: string;
  systemRole: "SUPER_ADMIN";
  mfaVerified: boolean;
  reauthenticatedAt?: string | null;
};

export type TenantRecord = {
  id: string;
  slug: string;
  displayName: string;
  defaultTimezone: string;
  packageCode: PackageCode;
  status: TenantStatus;
  provisioningStatus: "RUNNING" | "PARTIAL" | "COMPLETE";
  isTestTenant: boolean;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type ProvisioningStep = {
  key: ProvisioningStepKey;
  status: ProvisioningStepStatus;
  attempt: number;
  startedAt?: string;
  completedAt?: string;
  errorCode?: string;
  detail: string;
};

export type ProvisioningRun = {
  id: string;
  tenantId: string;
  status: ProvisioningRunStatus;
  steps: readonly ProvisioningStep[];
  createdByAccountId: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type FeatureFlagVersion = {
  id: string;
  tenantId: string;
  key: FeatureFlagKey;
  version: number;
  state: FeatureFlagState;
  enabled: boolean;
  dependencyKeys: readonly FeatureFlagKey[];
  effectiveFrom: string;
  effectiveUntil?: string;
  updatedAt: string;
  rowVersion: number;
};

export type UsageLimitVersion = {
  id: string;
  tenantId: string;
  key: UsageLimitKey;
  window: UsageWindow;
  limit: number;
  version: number;
  state: FeatureFlagState;
  updatedAt: string;
  rowVersion: number;
};

export type UsageCounter = {
  tenantId: string;
  key: UsageLimitKey;
  window: UsageWindow;
  periodStart: string;
  periodEnd: string;
  used: number;
  limit: number;
  updatedAt: string;
};

export type TenantAuditEntry = {
  id: string;
  actorAccountId: string;
  tenantId?: string;
  action: string;
  resourceType: "TENANT" | "PROVISIONING" | "FEATURE_FLAG" | "USAGE_LIMIT";
  resourceId: string;
  beforeRedacted?: Record<string, unknown>;
  afterRedacted?: Record<string, unknown>;
  reason: string;
  occurredAt: string;
};

export type TenantProvisioningSnapshot = {
  tenants: readonly TenantRecord[];
  runs: readonly ProvisioningRun[];
  flags: readonly FeatureFlagVersion[];
  limits: readonly UsageLimitVersion[];
  usage: readonly UsageCounter[];
  audit: readonly TenantAuditEntry[];
};

export type CreateTenantInput = {
  slug: string;
  displayName: string;
  defaultTimezone?: string;
  packageCode?: PackageCode;
  isTestTenant?: boolean;
  reason: string;
  idempotencyKey: string;
};

export type SetFeatureFlagInput = {
  key: FeatureFlagKey;
  enabled: boolean;
  effectiveFrom?: string;
  reason: string;
  idempotencyKey: string;
};

export type SetUsageLimitInput = {
  key: UsageLimitKey;
  window: UsageWindow;
  limit: number;
  reason: string;
  idempotencyKey: string;
};

export type TenantProvisioningErrorCode =
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_STATE"
  | "DEPENDENCY_UNMET"
  | "FEATURE_DISABLED"
  | "USAGE_LIMIT_EXCEEDED"
  | "TEST_TARGET_REQUIRED";

export class TenantProvisioningError extends Error {
  constructor(public readonly code: TenantProvisioningErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "TenantProvisioningError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const STEP_UP_WINDOW_MS = 5 * 60 * 1000;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const nowIso = (now = new Date()): string => now.toISOString();
const assertText = (value: unknown, field: string, max: number): string => {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) throw new TenantProvisioningError("VALIDATION_ERROR", `${field} is invalid`);
  return value.trim();
};
const assertUuid = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new TenantProvisioningError("VALIDATION_ERROR", `${field} must be a UUID`);
  return value;
};
const assertReason = (value: string): string => assertText(value, "reason", 2000);
const assertKey = (value: string): string => {
  const key = assertText(value, "idempotencyKey", 255);
  if (key.length < 8) throw new TenantProvisioningError("VALIDATION_ERROR", "idempotencyKey is too short");
  return key;
};
const assertDate = (value: string, field: string): string => {
  if (!ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) throw new TenantProvisioningError("VALIDATION_ERROR", `${field} must be ISO UTC`);
  return value;
};
const requestHash = (value: unknown): string => JSON.stringify(value);

const FEATURE_DEPENDENCIES: Readonly<Record<FeatureFlagKey, readonly FeatureFlagKey[]>> = {
  ai_chat_enabled: [],
  complaint_ai_routing_enabled: [],
  news_broadcast_enabled: [],
  executive_ai_summary_enabled: [],
  rich_menu_enabled: [],
  gold_price_enabled: [],
};

const DEFAULT_LIMITS: Readonly<Record<UsageLimitKey, { window: UsageWindow; limit: number }>> = {
  staff_seats: { window: "MONTH", limit: 50 },
  line_events_daily: { window: "DAY", limit: 20_000 },
  storage_bytes: { window: "MONTH", limit: 10_737_418_240 },
  ai_runs_monthly: { window: "MONTH", limit: 10_000 },
};

type IdempotencyValue = { hash: string; value: unknown };
type RepositoryOptions = { failAtStep?: ProvisioningStepKey };

export class InMemoryTenantProvisioningRepository {
  private readonly tenants = new Map<string, TenantRecord>();
  private readonly runs = new Map<string, ProvisioningRun>();
  private readonly flags = new Map<string, FeatureFlagVersion[]>();
  private readonly limits = new Map<string, UsageLimitVersion[]>();
  private readonly usage = new Map<string, UsageCounter>();
  private readonly audits: TenantAuditEntry[] = [];
  private readonly idempotency = new Map<string, IdempotencyValue>();

  constructor(seed: TenantProvisioningSnapshot = createSyntheticTenantProvisioningSnapshot()) {
    for (const tenant of seed.tenants) this.tenants.set(tenant.id, clone(tenant));
    for (const run of seed.runs) this.runs.set(run.id, clone(run));
    for (const flag of seed.flags) this.pushVersion(this.flags, this.flagKey(flag.tenantId, flag.key), clone(flag));
    for (const limit of seed.limits) this.pushVersion(this.limits, this.limitKey(limit.tenantId, limit.key), clone(limit));
    for (const counter of seed.usage) this.usage.set(this.usageKey(counter.tenantId, counter.key, counter.window, counter.periodStart), clone(counter));
    this.audits.push(...seed.audit.map(clone));
  }

  snapshot(actor: SuperAdminActor, now = new Date()): TenantProvisioningSnapshot {
    this.assertSystem(actor, now);
    return { tenants: this.listTenants(actor, now), runs: [...this.runs.values()].map(clone), flags: [...this.flags.values()].flat().map(clone), limits: [...this.limits.values()].flat().map(clone), usage: [...this.usage.values()].map(clone), audit: this.audits.map(clone) };
  }

  listTenants(actor: SuperAdminActor, now = new Date()): readonly TenantRecord[] {
    this.assertSystem(actor, now);
    return [...this.tenants.values()].map(clone);
  }

  getTenant(actor: SuperAdminActor, tenantId: string, now = new Date()): TenantRecord {
    this.assertSystem(actor, now);
    const id = assertUuid(tenantId, "tenantId");
    const tenant = this.tenants.get(id);
    if (!tenant) throw new TenantProvisioningError("NOT_FOUND", "tenant is not available");
    return clone(tenant);
  }

  provisionTenant(actor: SuperAdminActor, input: CreateTenantInput, now = new Date(), options: RepositoryOptions = {}): { tenant: TenantRecord; run: ProvisioningRun } {
    this.assertSystem(actor, now);
    const slug = assertText(input.slug, "slug", 64).toLowerCase();
    if (!SLUG_PATTERN.test(slug)) throw new TenantProvisioningError("VALIDATION_ERROR", "slug format is invalid");
    const displayName = assertText(input.displayName, "displayName", 200);
    const defaultTimezone = assertText(input.defaultTimezone ?? DEFAULT_TENANT_TIMEZONE, "defaultTimezone", 64);
    const packageCode = input.packageCode ?? "PILOT";
    if (!(["PILOT", "STANDARD", "ENTERPRISE"] as const).includes(packageCode)) throw new TenantProvisioningError("VALIDATION_ERROR", "packageCode is invalid");
    const isTestTenant = input.isTestTenant ?? false;
    if (typeof isTestTenant !== "boolean") throw new TenantProvisioningError("VALIDATION_ERROR", "isTestTenant is invalid");
    const reason = assertReason(input.reason);
    const key = assertKey(input.idempotencyKey);
    return this.idempotent(actor, "provision-tenant", key, { slug, displayName, defaultTimezone, packageCode, isTestTenant, reason }, () => {
      if ([...this.tenants.values()].some((tenant) => tenant.slug === slug)) throw new TenantProvisioningError("DUPLICATE", "tenant slug already exists");
      const timestamp = nowIso(now);
      const tenant: TenantRecord = { id: randomUUID(), slug, displayName, defaultTimezone, packageCode, status: "SUSPENDED", provisioningStatus: "RUNNING", isTestTenant, createdAt: timestamp, updatedAt: timestamp, rowVersion: 1 };
      const run: ProvisioningRun = { id: randomUUID(), tenantId: tenant.id, status: "RUNNING", steps: PROVISIONING_STEP_KEYS.map((keyName) => ({ key: keyName, status: "PENDING", attempt: 0, detail: this.stepDetail(keyName) })), createdByAccountId: actor.accountId, createdAt: timestamp, updatedAt: timestamp, rowVersion: 1 };
      this.tenants.set(tenant.id, tenant);
      this.runs.set(run.id, run);
      this.createDefaultLimits(tenant.id, timestamp);
      this.createDefaultFlags(tenant.id, timestamp);
      const completed = this.executeRun(actor, tenant, run, now, options);
      this.recordAudit(actor, "TENANT_PROVISION_REQUESTED", "TENANT", tenant.id, undefined, { slug, packageCode, isTestTenant }, reason, timestamp);
      return completed;
    });
  }

  resumeProvisioning(actor: SuperAdminActor, tenantId: string, reasonInput: string, idempotencyKey: string, now = new Date()): { tenant: TenantRecord; run: ProvisioningRun } {
    this.assertSystem(actor, now);
    const tenant = this.getStoredTenant(tenantId);
    const run = this.getRun(tenant.id);
    const reason = assertReason(reasonInput);
    const key = assertKey(idempotencyKey);
    return this.idempotent(actor, `resume-provisioning:${tenant.id}`, key, { tenantId: tenant.id, reason }, () => {
      if (run.status === "COMPLETE") return { tenant: clone(tenant), run: clone(run) };
      const completed = this.executeRun(actor, tenant, run, now);
      this.recordAudit(actor, "TENANT_PROVISION_RESUMED", "PROVISIONING", run.id, { status: run.status }, { status: completed.run.status }, reason, nowIso(now));
      return completed;
    });
  }

  setFeatureFlag(actor: SuperAdminActor, tenantId: string, input: SetFeatureFlagInput, now = new Date()): FeatureFlagVersion {
    this.assertSystem(actor, now);
    const tenant = this.getStoredTenant(tenantId);
    if (tenant.status !== "ACTIVE") throw new TenantProvisioningError("INVALID_STATE", "suspended or incomplete tenant cannot enable feature flags");
    if (!FEATURE_FLAG_KEYS.includes(input.key)) throw new TenantProvisioningError("VALIDATION_ERROR", "feature flag key is invalid");
    if (typeof input.enabled !== "boolean") throw new TenantProvisioningError("VALIDATION_ERROR", "enabled is invalid");
    const effectiveFrom = input.effectiveFrom ? assertDate(input.effectiveFrom, "effectiveFrom") : nowIso(now);
    const reason = assertReason(input.reason);
    const key = assertKey(input.idempotencyKey);
    return this.idempotent(actor, `feature-flag:${tenant.id}:${input.key}`, key, { enabled: input.enabled, effectiveFrom, reason }, () => {
      const dependencies = FEATURE_DEPENDENCIES[input.key];
      if (input.enabled && dependencies.some((dependency) => !this.isFlagEnabled(tenant.id, dependency, now))) throw new TenantProvisioningError("DEPENDENCY_UNMET", `feature flag ${input.key} dependencies are not active`);
      const previous = this.currentFlag(tenant.id, input.key);
      const version: FeatureFlagVersion = { id: randomUUID(), tenantId: tenant.id, key: input.key, version: (previous?.version ?? 0) + 1, state: "ACTIVE", enabled: input.enabled, dependencyKeys: dependencies, effectiveFrom, ...(previous && previous.enabled && !input.enabled ? { effectiveUntil: effectiveFrom } : {}), updatedAt: nowIso(now), rowVersion: 1 };
      this.pushVersion(this.flags, this.flagKey(tenant.id, input.key), version);
      if (previous) previous.state = "RETIRED";
      this.recordAudit(actor, "FEATURE_FLAG_CHANGED", "FEATURE_FLAG", version.id, previous ? { key: previous.key, enabled: previous.enabled, version: previous.version } : undefined, { key: version.key, enabled: version.enabled, version: version.version }, reason, version.updatedAt);
      return version;
    });
  }

  assertFeatureEnabled(tenantId: string, key: FeatureFlagKey, now = new Date()): void {
    const tenant = this.getStoredTenant(tenantId);
    if (tenant.status !== "ACTIVE" || tenant.provisioningStatus !== "COMPLETE" || !this.isFlagEnabled(tenant.id, key, now)) throw new TenantProvisioningError("FEATURE_DISABLED", `feature ${key} is disabled for tenant`);
  }

  setUsageLimit(actor: SuperAdminActor, tenantId: string, input: SetUsageLimitInput, now = new Date()): UsageLimitVersion {
    this.assertSystem(actor, now);
    const tenant = this.getStoredTenant(tenantId);
    if (tenant.status === "ARCHIVED") throw new TenantProvisioningError("INVALID_STATE", "archived tenant cannot change limits");
    if (!USAGE_LIMIT_KEYS.includes(input.key) || !["DAY", "MONTH"].includes(input.window)) throw new TenantProvisioningError("VALIDATION_ERROR", "usage limit key/window is invalid");
    if (!Number.isSafeInteger(input.limit) || input.limit < 1) throw new TenantProvisioningError("VALIDATION_ERROR", "usage limit must be a positive integer");
    const reason = assertReason(input.reason);
    const key = assertKey(input.idempotencyKey);
    return this.idempotent(actor, `usage-limit:${tenant.id}:${input.key}`, key, { window: input.window, limit: input.limit, reason }, () => {
      const previous = this.currentLimit(tenant.id, input.key);
      const version: UsageLimitVersion = { id: randomUUID(), tenantId: tenant.id, key: input.key, window: input.window, limit: input.limit, version: (previous?.version ?? 0) + 1, state: "ACTIVE", updatedAt: nowIso(now), rowVersion: 1 };
      this.pushVersion(this.limits, this.limitKey(tenant.id, input.key), version);
      if (previous) previous.state = "RETIRED";
      this.recordAudit(actor, "USAGE_LIMIT_CHANGED", "USAGE_LIMIT", version.id, previous ? { key: previous.key, limit: previous.limit, window: previous.window } : undefined, { key: version.key, limit: version.limit, window: version.window }, reason, version.updatedAt);
      return version;
    });
  }

  consumeUsage(tenantId: string, key: UsageLimitKey, amount: number, periodStart: string, periodEnd: string, now = new Date()): UsageCounter {
    const tenant = this.getStoredTenant(tenantId);
    if (tenant.status !== "ACTIVE" || tenant.provisioningStatus !== "COMPLETE") throw new TenantProvisioningError("INVALID_STATE", "tenant is not operational");
    if (!USAGE_LIMIT_KEYS.includes(key) || !Number.isSafeInteger(amount) || amount < 1) throw new TenantProvisioningError("VALIDATION_ERROR", "usage amount is invalid");
    const limit = this.currentLimit(tenant.id, key);
    if (!limit) throw new TenantProvisioningError("NOT_FOUND", "usage limit is not configured");
    const start = assertDate(periodStart, "periodStart");
    const end = assertDate(periodEnd, "periodEnd");
    if (Date.parse(end) <= Date.parse(start)) throw new TenantProvisioningError("VALIDATION_ERROR", "usage period is invalid");
    const counterKey = this.usageKey(tenant.id, key, limit.window, start);
    const current = this.usage.get(counterKey) ?? { tenantId: tenant.id, key, window: limit.window, periodStart: start, periodEnd: end, used: 0, limit: limit.limit, updatedAt: nowIso(now) };
    if (current.used + amount > limit.limit) throw new TenantProvisioningError("USAGE_LIMIT_EXCEEDED", `usage limit exceeded for ${key}`);
    const next = { ...current, used: current.used + amount, limit: limit.limit, periodEnd: end, updatedAt: nowIso(now) };
    this.usage.set(counterKey, next);
    return clone(next);
  }

  suspendTenant(actor: SuperAdminActor, tenantId: string, expectedVersion: number, reasonInput: string, idempotencyKey: string, now = new Date()): TenantRecord {
    this.assertSystem(actor, now);
    const tenant = this.getStoredTenant(tenantId);
    if (tenant.rowVersion !== expectedVersion) throw new TenantProvisioningError("VERSION_CONFLICT", "tenant version is stale");
    const reason = assertReason(reasonInput);
    const key = assertKey(idempotencyKey);
    return this.idempotent(actor, `suspend-tenant:${tenant.id}`, key, { expectedVersion, reason }, () => {
      if (tenant.status === "ARCHIVED") throw new TenantProvisioningError("INVALID_STATE", "archived tenant cannot be suspended");
      const before = { status: tenant.status, provisioningStatus: tenant.provisioningStatus };
      tenant.status = "SUSPENDED";
      tenant.updatedAt = nowIso(now);
      tenant.rowVersion += 1;
      this.recordAudit(actor, "TENANT_SUSPENDED", "TENANT", tenant.id, before, { status: tenant.status }, reason, tenant.updatedAt);
      return clone(tenant);
    });
  }

  reactivateTenant(actor: SuperAdminActor, tenantId: string, expectedVersion: number, reasonInput: string, idempotencyKey: string, now = new Date()): TenantRecord {
    this.assertSystem(actor, now);
    const tenant = this.getStoredTenant(tenantId);
    if (tenant.rowVersion !== expectedVersion) throw new TenantProvisioningError("VERSION_CONFLICT", "tenant version is stale");
    const reason = assertReason(reasonInput);
    const key = assertKey(idempotencyKey);
    return this.idempotent(actor, `reactivate-tenant:${tenant.id}`, key, { expectedVersion, reason }, () => {
      if (tenant.status !== "SUSPENDED" || tenant.provisioningStatus !== "COMPLETE") throw new TenantProvisioningError("INVALID_STATE", "tenant must be a complete suspended tenant");
      tenant.status = "ACTIVE";
      tenant.updatedAt = nowIso(now);
      tenant.rowVersion += 1;
      this.recordAudit(actor, "TENANT_REACTIVATED", "TENANT", tenant.id, { status: "SUSPENDED" }, { status: tenant.status }, reason, tenant.updatedAt);
      return clone(tenant);
    });
  }

  archiveTestTenant(actor: SuperAdminActor, tenantId: string, expectedVersion: number, verificationText: string, reasonInput: string, idempotencyKey: string, now = new Date()): TenantRecord {
    this.assertSystem(actor, now);
    const tenant = this.getStoredTenant(tenantId);
    if (!tenant.isTestTenant || verificationText !== tenant.slug) throw new TenantProvisioningError("TEST_TARGET_REQUIRED", "archive is allowed only for a verified test tenant");
    if (tenant.rowVersion !== expectedVersion) throw new TenantProvisioningError("VERSION_CONFLICT", "tenant version is stale");
    const reason = assertReason(reasonInput);
    const key = assertKey(idempotencyKey);
    return this.idempotent(actor, `archive-test-tenant:${tenant.id}`, key, { expectedVersion, verificationText, reason }, () => {
      tenant.status = "ARCHIVED";
      tenant.updatedAt = nowIso(now);
      tenant.rowVersion += 1;
      this.recordAudit(actor, "TEST_TENANT_ARCHIVED", "TENANT", tenant.id, { status: "SUSPENDED" }, { status: tenant.status }, reason, tenant.updatedAt);
      return clone(tenant);
    });
  }

  private executeRun(actor: SuperAdminActor, tenant: TenantRecord, run: ProvisioningRun, now: Date, options: RepositoryOptions = {}): { tenant: TenantRecord; run: ProvisioningRun } {
    for (const current of run.steps) {
      if (current.status === "SUCCEEDED") continue;
      const timestamp = nowIso(now);
      current.status = "RUNNING";
      current.attempt += 1;
      current.startedAt = timestamp;
      current.errorCode = undefined;
      run.updatedAt = timestamp;
      run.rowVersion += 1;
      if (options.failAtStep === current.key) {
        current.status = "FAILED";
        current.errorCode = "SYNTHETIC_STEP_FAILURE";
        current.detail = `${current.key} failed safely; resume is required`;
        run.status = "PARTIAL";
        tenant.provisioningStatus = "PARTIAL";
        tenant.status = "SUSPENDED";
        tenant.updatedAt = timestamp;
        tenant.rowVersion += 1;
        run.updatedAt = timestamp;
        return { tenant: clone(tenant), run: clone(run) };
      }
      current.status = "SUCCEEDED";
      current.completedAt = timestamp;
      current.detail = this.stepDetail(current.key);
      run.updatedAt = timestamp;
      run.rowVersion += 1;
    }
    run.status = "COMPLETE";
    tenant.provisioningStatus = "COMPLETE";
    tenant.status = "ACTIVE";
    tenant.updatedAt = nowIso(now);
    tenant.rowVersion += 1;
    run.updatedAt = tenant.updatedAt;
    run.rowVersion += 1;
    return { tenant: clone(tenant), run: clone(run) };
  }

  private createDefaultFlags(tenantId: string, timestamp: string): void {
    for (const key of FEATURE_FLAG_KEYS) {
      const flag: FeatureFlagVersion = { id: randomUUID(), tenantId, key, version: 1, state: "ACTIVE", enabled: false, dependencyKeys: FEATURE_DEPENDENCIES[key], effectiveFrom: timestamp, updatedAt: timestamp, rowVersion: 1 };
      this.pushVersion(this.flags, this.flagKey(tenantId, key), flag);
    }
  }

  private createDefaultLimits(tenantId: string, timestamp: string): void {
    for (const key of USAGE_LIMIT_KEYS) {
      const setting = DEFAULT_LIMITS[key];
      this.pushVersion(this.limits, this.limitKey(tenantId, key), { id: randomUUID(), tenantId, key, window: setting.window, limit: setting.limit, version: 1, state: "ACTIVE", updatedAt: timestamp, rowVersion: 1 });
    }
  }

  private stepDetail(key: ProvisioningStepKey): string {
    return key === "CHANNEL" ? "channel/LIFF record reserved; credential reference required before production" : `${key} synthetic configuration completed with no provider secret`;
  }

  private isFlagEnabled(tenantId: string, key: FeatureFlagKey, now: Date): boolean {
    const flag = this.currentFlag(tenantId, key);
    return Boolean(flag?.state === "ACTIVE" && flag.enabled && Date.parse(flag.effectiveFrom) <= now.getTime() && (!flag.effectiveUntil || Date.parse(flag.effectiveUntil) > now.getTime()));
  }

  private currentFlag(tenantId: string, key: FeatureFlagKey): FeatureFlagVersion | undefined { return [...(this.flags.get(this.flagKey(tenantId, key)) ?? [])].reverse().find((flag) => flag.state === "ACTIVE"); }
  private currentLimit(tenantId: string, key: UsageLimitKey): UsageLimitVersion | undefined { return [...(this.limits.get(this.limitKey(tenantId, key)) ?? [])].reverse().find((limit) => limit.state === "ACTIVE"); }
  private getStoredTenant(tenantId: string): TenantRecord { const id = assertUuid(tenantId, "tenantId"); const tenant = this.tenants.get(id); if (!tenant) throw new TenantProvisioningError("NOT_FOUND", "tenant is not available"); return tenant; }
  private getRun(tenantId: string): ProvisioningRun { const run = [...this.runs.values()].find((item) => item.tenantId === tenantId && item.status !== "ROLLED_BACK"); if (!run) throw new TenantProvisioningError("NOT_FOUND", "provisioning run is not available"); return run; }
  private assertSystem(actor: SuperAdminActor, now = new Date()): void { assertUuid(actor.accountId, "accountId"); if (actor.systemRole !== "SUPER_ADMIN" || !actor.mfaVerified || !actor.reauthenticatedAt || Date.parse(actor.reauthenticatedAt) > now.getTime() || now.getTime() - Date.parse(actor.reauthenticatedAt) > STEP_UP_WINDOW_MS) throw new TenantProvisioningError("FORBIDDEN", "Super Admin MFA step-up is required"); }
  private idempotent<T>(actor: SuperAdminActor, operation: string, key: string, input: unknown, execute: () => T): T { const composite = `${actor.accountId}:${operation}:${key}`; const hash = requestHash(input); const previous = this.idempotency.get(composite); if (previous) { if (previous.hash !== hash) throw new TenantProvisioningError("IDEMPOTENCY_CONFLICT", "idempotency key was reused with different input"); return clone(previous.value) as T; } const value = execute(); this.idempotency.set(composite, { hash, value: clone(value) }); return clone(value); }
  private recordAudit(actor: SuperAdminActor, action: string, resourceType: TenantAuditEntry["resourceType"], resourceId: string, beforeRedacted: Record<string, unknown> | undefined, afterRedacted: Record<string, unknown> | undefined, reason: string, occurredAt: string): void { this.audits.push({ id: randomUUID(), actorAccountId: actor.accountId, ...(resourceType === "TENANT" || resourceType === "PROVISIONING" || resourceType === "FEATURE_FLAG" || resourceType === "USAGE_LIMIT" ? { tenantId: resourceType === "TENANT" ? resourceId : undefined } : {}), action, resourceType, resourceId, ...(beforeRedacted ? { beforeRedacted: clone(beforeRedacted) } : {}), ...(afterRedacted ? { afterRedacted: clone(afterRedacted) } : {}), reason, occurredAt }); }
  private flagKey(tenantId: string, key: FeatureFlagKey): string { return `${tenantId}:${key}`; }
  private limitKey(tenantId: string, key: UsageLimitKey): string { return `${tenantId}:${key}`; }
  private usageKey(tenantId: string, key: UsageLimitKey, window: UsageWindow, periodStart: string): string { return `${tenantId}:${key}:${window}:${periodStart}`; }
  private pushVersion<T>(map: Map<string, T[]>, key: string, value: T): void { const values = map.get(key) ?? []; values.push(value); map.set(key, values); }
}

export const createSyntheticTenantProvisioningSnapshot = (): TenantProvisioningSnapshot => {
  const timestamp = "2026-08-11T00:00:00.000Z";
  const tenant: TenantRecord = { id: SYNTHETIC_PILOT_TENANT_ID, slug: "citychatbot-pilot", displayName: "CityChatbot Pilot", defaultTimezone: DEFAULT_TENANT_TIMEZONE, packageCode: "PILOT", status: "ACTIVE", provisioningStatus: "COMPLETE", isTestTenant: true, createdAt: timestamp, updatedAt: timestamp, rowVersion: 1 };
  const flags = FEATURE_FLAG_KEYS.map((key) => ({ id: randomUUID(), tenantId: tenant.id, key, version: 1, state: "ACTIVE" as const, enabled: false, dependencyKeys: FEATURE_DEPENDENCIES[key], effectiveFrom: timestamp, updatedAt: timestamp, rowVersion: 1 }));
  const limits = USAGE_LIMIT_KEYS.map((key) => ({ id: randomUUID(), tenantId: tenant.id, key, window: DEFAULT_LIMITS[key].window, limit: DEFAULT_LIMITS[key].limit, version: 1, state: "ACTIVE" as const, updatedAt: timestamp, rowVersion: 1 }));
  return { tenants: [tenant], runs: [], flags, limits, usage: [], audit: [] };
};

export const createSyntheticTenantProvisioningRepository = (): InMemoryTenantProvisioningRepository => new InMemoryTenantProvisioningRepository();
