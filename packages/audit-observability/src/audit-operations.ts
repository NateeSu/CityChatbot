import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

export const SYNTHETIC_AUDIT_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const SYNTHETIC_AUDIT_OTHER_TENANT_ID = "00000000-0000-4000-8000-000000000002";
export const SYNTHETIC_AUDIT_ADMIN_ACCOUNT_ID = "10000000-0000-4000-8000-000000000003";
export const SYNTHETIC_AUDIT_STAFF_ACCOUNT_ID = "10000000-0000-4000-8000-000000000002";
export const SYNTHETIC_AUDIT_HEAD_ACCOUNT_ID = "10000000-0000-4000-8000-000000000004";
export const SYNTHETIC_AUDIT_EXECUTIVE_ACCOUNT_ID = "10000000-0000-4000-8000-000000000005";
export const SYNTHETIC_AUDIT_MEMBERSHIP_ID = "11000000-0000-4000-8000-000000000003";
export const LARGE_EXPORT_THRESHOLD = 1_000;
export const DEFAULT_EXPORT_TTL_MS = 5 * 60 * 1_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const ACTION_PATTERN = /^[A-Z][A-Z0-9_.:-]{2,127}$/u;
const RESOURCE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/u;
const SENSITIVE_FIELD_PATTERN = /authorization|password|secret|token|cookie|phone|mobile|email|address|location|citizen|prompt|document|raw|pii|api[-_]?key|service[-_]?role|content/iu;
const FORMULA_PATTERN = /^[=+\-@]/u;

export type AuditOperationsRole = "STAFF" | "DEPARTMENT_HEAD" | "PR_STAFF" | "KNOWLEDGE_STAFF" | "TENANT_ADMIN" | "EXECUTIVE";
export type AuditActorType = "CITIZEN" | "STAFF" | "SYSTEM" | "SUPER_ADMIN";

export type AuditOperationsActor = {
  tenantId: string;
  accountId: string;
  role: AuditOperationsRole;
  membershipId?: string;
  mfaVerified?: boolean;
};

export type AuditOperationsErrorCode =
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_STATE"
  | "EXPORT_EXPIRED"
  | "EXPORT_REVOKED"
  | "SIGNED_URL_INVALID"
  | "PROCESSING_FAILED";

export class AuditOperationsError extends Error {
  constructor(public readonly code: AuditOperationsErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "AuditOperationsError";
  }
}

export type RedactedJson = Record<string, unknown>;

export type AuditEntry = {
  id: string;
  tenantId: string;
  actorAccountId?: string;
  actorMembershipId?: string;
  actorType: AuditActorType;
  supportAccessGrantId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeRedactedJson?: RedactedJson;
  afterRedactedJson?: RedactedJson;
  reason: string;
  requestId: string;
  correlationId: string;
  ipHash?: string;
  userAgentSummary?: string;
  createdAt: string;
  integrityHash: string;
  previousHash?: string;
};

export type AuditAppendInput = {
  tenantId: string;
  actorAccountId?: string;
  actorMembershipId?: string;
  actorType: AuditActorType;
  supportAccessGrantId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  beforeRedactedJson?: RedactedJson;
  afterRedactedJson?: RedactedJson;
  reason: string;
  requestId?: string;
  correlationId?: string;
  ipHash?: string;
  userAgentSummary?: string;
};

export type AuditFilter = {
  action?: string;
  resourceType?: string;
  resourceId?: string;
  actorAccountId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
};

export type AuditPage = {
  items: readonly AuditEntry[];
  total: number;
  nextCursor?: string;
  hasMore: boolean;
  integrityValid: boolean;
};

export type NotificationPriority = "INFO" | "WARNING" | "CRITICAL";

export type StaffNotification = {
  id: string;
  tenantId: string;
  recipientAccountId: string;
  recipientMembershipId?: string;
  notificationType: string;
  priority: NotificationPriority;
  title: string;
  body: string;
  readAt?: string;
  createdAt: string;
  rowVersion: number;
};

export type NotificationPage = {
  items: readonly StaffNotification[];
  unreadCount: number;
};

export type ExportType = "AUDIT_LOG" | "REPORT";
export type ExportFormat = "CSV";
export type ExportStatus = "REQUESTED" | "APPROVED" | "QUEUED" | "READY" | "EXPIRED" | "REVOKED" | "FAILED";

export type ExportRecord = {
  id: string;
  tenantId: string;
  requestedByAccountId: string;
  requestedByMembershipId?: string;
  approvedByAccountId?: string;
  exportType: ExportType;
  format: ExportFormat;
  status: ExportStatus;
  filtersRedactedJson: RedactedJson;
  rowCount: number;
  reason: string;
  watermark: string;
  signedUrlDigest?: string;
  signedUrl?: string;
  requestedAt: string;
  approvedAt?: string;
  readyAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  rowVersion: number;
  jobId?: string;
};

export type ExportRequestInput = {
  exportType: ExportType;
  format: ExportFormat;
  filters: RedactedJson;
  reason: string;
  idempotencyKey: string;
  expectedVersion?: number;
  estimatedRows?: number;
};

export type ExportDownload = {
  fileName: string;
  contentType: "text/csv; charset=utf-8";
  body: string;
  watermark: string;
};

export type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "DEAD" | "CANCELLED";

export type AdminJob = {
  id: string;
  tenantId: string;
  jobType: string;
  status: JobStatus;
  attemptCount: number;
  maxAttempts: number;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
  exportId?: string;
};

export type AuditOperationsSnapshot = {
  audit: AuditPage;
  notifications: NotificationPage;
  exports: readonly ExportRecord[];
  jobs: readonly AdminJob[];
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const stableSerialize = (value: unknown): string => {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
};

const digest = (value: unknown): string => createHash("sha256").update(stableSerialize(value)).digest("hex");

const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

const assertUuid = (value: string | undefined, field: string): void => {
  if (!value || !isUuid(value)) throw new AuditOperationsError("VALIDATION_ERROR", `${field} must be a UUID`);
};

const assertText = (value: string, field: string, maxLength: number): string => {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || CONTROL_PATTERN.test(value)) {
    throw new AuditOperationsError("VALIDATION_ERROR", `${field} is invalid`);
  }
  return value.trim();
};

const redactReason = (value: string): string => value
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[REDACTED_EMAIL]")
  .replace(/(?:\+?66|0)[0-9 ()-]{8,15}/gu, "[REDACTED_PHONE]")
  .replace(/(authorization|password|secret|token|api[-_]?key)\s*[=:]\s*[^\s,;]+/giu, "$1=[REDACTED]");

const redactValue = (value: unknown, parentKey?: string): unknown => {
  if (parentKey && SENSITIVE_FIELD_PATTERN.test(parentKey)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactValue(child, key)]));
  }
  return value;
};

export const redactAuditJson = (value: RedactedJson): RedactedJson => redactValue(value) as RedactedJson;

const assertJsonObject = (value: unknown, field: string): RedactedJson => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AuditOperationsError("VALIDATION_ERROR", `${field} must be an object`);
  return redactAuditJson(value as RedactedJson);
};

const toIso = (value: Date): string => value.toISOString();

const encodeCursor = (id: string): string => Buffer.from(id, "utf8").toString("base64url");
const decodeCursor = (cursor: string): string => {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    assertUuid(decoded, "cursor");
    return decoded;
  } catch (error) {
    if (error instanceof AuditOperationsError) throw error;
    throw new AuditOperationsError("VALIDATION_ERROR", "cursor is invalid");
  }
};

const actorCanReadAll = (actor: AuditOperationsActor): boolean => (actor.role === "TENANT_ADMIN" && actor.mfaVerified !== false) || actor.role === "EXECUTIVE";
const actorCanExport = (actor: AuditOperationsActor): boolean => actor.role === "TENANT_ADMIN" && actor.mfaVerified !== false;
const actorCanReadEntry = (actor: AuditOperationsActor, entry: AuditEntry): boolean => actorCanReadAll(actor) || entry.actorAccountId === actor.accountId;

const createAuditEntry = (input: AuditAppendInput, previousHash: string | undefined, now: Date): AuditEntry => {
  assertUuid(input.tenantId, "tenantId");
  assertUuid(input.resourceId, "resourceId");
  if (input.actorAccountId) assertUuid(input.actorAccountId, "actorAccountId");
  if (input.actorMembershipId) assertUuid(input.actorMembershipId, "actorMembershipId");
  if (input.supportAccessGrantId) assertUuid(input.supportAccessGrantId, "supportAccessGrantId");
  if (input.requestId) assertUuid(input.requestId, "requestId");
  if (input.correlationId) assertUuid(input.correlationId, "correlationId");
  if (!ACTION_PATTERN.test(input.action)) throw new AuditOperationsError("VALIDATION_ERROR", "action is invalid");
  if (!RESOURCE_PATTERN.test(input.resourceType)) throw new AuditOperationsError("VALIDATION_ERROR", "resourceType is invalid");
  const reason = redactReason(assertText(input.reason, "reason", 2_000));
  const partial: Omit<AuditEntry, "integrityHash"> = {
    id: randomUUID(),
    tenantId: input.tenantId,
    ...(input.actorAccountId ? { actorAccountId: input.actorAccountId } : {}),
    ...(input.actorMembershipId ? { actorMembershipId: input.actorMembershipId } : {}),
    actorType: input.actorType,
    ...(input.supportAccessGrantId ? { supportAccessGrantId: input.supportAccessGrantId } : {}),
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    ...(input.beforeRedactedJson ? { beforeRedactedJson: redactAuditJson(input.beforeRedactedJson) } : {}),
    ...(input.afterRedactedJson ? { afterRedactedJson: redactAuditJson(input.afterRedactedJson) } : {}),
    reason,
    requestId: input.requestId ?? randomUUID(),
    correlationId: input.correlationId ?? input.requestId ?? randomUUID(),
    ...(input.ipHash ? { ipHash: assertText(input.ipHash, "ipHash", 256) } : {}),
    ...(input.userAgentSummary ? { userAgentSummary: assertText(input.userAgentSummary, "userAgentSummary", 200) } : {}),
    createdAt: toIso(now),
    ...(previousHash ? { previousHash } : {}),
  };
  return { ...partial, integrityHash: digest(partial) };
};

export const verifyAuditChain = (records: readonly AuditEntry[]): boolean => {
  const previousByTenant = new Map<string, string | undefined>();
  for (const record of records) {
    const { integrityHash, ...partial } = record;
    if (record.previousHash !== previousByTenant.get(record.tenantId) || integrityHash !== digest(partial)) return false;
    previousByTenant.set(record.tenantId, integrityHash);
  }
  return true;
};

class AuditStore {
  private readonly records: AuditEntry[] = [];

  append(input: AuditAppendInput, now: Date): AuditEntry {
    const previousHash = [...this.records].reverse().find((record) => record.tenantId === input.tenantId)?.integrityHash;
    const record = createAuditEntry(input, previousHash, now);
    this.records.push(record);
    return clone(record);
  }

  list(actor: AuditOperationsActor, filter: AuditFilter = {}): AuditPage {
    assertUuid(actor.tenantId, "tenantId");
    const limit = filter.limit ?? 25;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new AuditOperationsError("VALIDATION_ERROR", "limit must be between 1 and 100");
    const cursorId = filter.cursor ? decodeCursor(filter.cursor) : undefined;
    const action = filter.action?.trim().toUpperCase();
    const resourceType = filter.resourceType?.trim().toUpperCase();
    const resourceId = filter.resourceId;
    if (resourceId) assertUuid(resourceId, "resourceId");
    const filtered = this.records
      .filter((record) => record.tenantId === actor.tenantId && actorCanReadEntry(actor, record))
      .filter((record) => !action || record.action === action)
      .filter((record) => !resourceType || record.resourceType === resourceType)
      .filter((record) => !resourceId || record.resourceId === resourceId)
      .filter((record) => !filter.actorAccountId || record.actorAccountId === filter.actorAccountId)
      .filter((record) => !filter.from || record.createdAt >= filter.from)
      .filter((record) => !filter.to || record.createdAt <= filter.to)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    const start = cursorId ? Math.max(0, filtered.findIndex((record) => record.id === cursorId) + 1) : 0;
    const items = filtered.slice(start, start + limit).map(clone);
    const hasMore = start + items.length < filtered.length;
    return { items, total: filtered.length, ...(hasMore && items.length > 0 ? { nextCursor: encodeCursor(items[items.length - 1]!.id) } : {}), hasMore, integrityValid: verifyAuditChain(this.records) };
  }

  get(actor: AuditOperationsActor, id: string): AuditEntry {
    assertUuid(id, "id");
    const record = this.records.find((item) => item.id === id);
    if (!record || record.tenantId !== actor.tenantId || !actorCanReadEntry(actor, record)) throw new AuditOperationsError("NOT_FOUND", "audit record was not found");
    return clone(record);
  }

  allForTenant(tenantId: string): AuditEntry[] {
    return this.records.filter((record) => record.tenantId === tenantId).map(clone);
  }

  verifyIntegrity(): boolean {
    return verifyAuditChain(this.records);
  }
}

type NotificationInput = Omit<StaffNotification, "id" | "createdAt" | "readAt" | "rowVersion"> & { id?: string; createdAt?: string };

type ExportInternal = ExportRecord & { signedUrlToken?: string; csvBody?: string };

const cloneExport = (record: ExportInternal): ExportRecord => {
  const { signedUrlToken: _signedUrlToken, csvBody: _csvBody, ...publicRecord } = record;
  return clone(publicRecord);
};

const safeCsvCell = (value: unknown): string => {
  const text = String(value ?? "");
  const protectedText = FORMULA_PATTERN.test(text) ? `'${text}` : text;
  return `"${protectedText.replaceAll('"', '""')}"`;
};

const maskIdentifier = (value: string): string => `${value.slice(0, 8)}...`;

const validateExportFilters = (filters: RedactedJson): RedactedJson => {
  const redacted = assertJsonObject(filters, "filters");
  if (Object.keys(redacted).length > 20) throw new AuditOperationsError("VALIDATION_ERROR", "filters contain too many fields");
  return redacted;
};

export class AuditOperationsRepository {
  private readonly auditStore = new AuditStore();
  private readonly notifications = new Map<string, StaffNotification>();
  private readonly exports = new Map<string, ExportInternal>();
  private readonly exportIdempotency = new Map<string, { requestHash: string; exportId: string }>();
  private readonly jobs = new Map<string, AdminJob>();
  private readonly seeded: boolean;
  private readonly seedNow: Date;

  constructor(options: { seed?: boolean; now?: Date } = {}) {
    this.seeded = options.seed ?? true;
    this.seedNow = options.now ?? new Date("2026-08-11T00:00:00.000Z");
    if (this.seeded) this.seed();
  }

  private seed(): void {
    const requestId = "12000000-0000-4000-8000-000000000001";
    const resourceId = "13000000-0000-4000-8000-000000000001";
    this.auditStore.append({
      tenantId: SYNTHETIC_AUDIT_TENANT_ID,
      actorAccountId: SYNTHETIC_AUDIT_ADMIN_ACCOUNT_ID,
      actorMembershipId: SYNTHETIC_AUDIT_MEMBERSHIP_ID,
      actorType: "STAFF",
      action: "STAFF_INVITATION_CREATED",
      resourceType: "STAFF_INVITATION",
      resourceId,
      afterRedactedJson: { role: "STAFF", email: "admin@example.invalid" },
      reason: "Initial pilot audit fixture",
      requestId,
      correlationId: requestId,
    }, this.seedNow);
    this.auditStore.append({
      tenantId: SYNTHETIC_AUDIT_TENANT_ID,
      actorAccountId: SYNTHETIC_AUDIT_ADMIN_ACCOUNT_ID,
      actorMembershipId: SYNTHETIC_AUDIT_MEMBERSHIP_ID,
      actorType: "STAFF",
      action: "TENANT_SETTINGS_PUBLISHED",
      resourceType: "TENANT_SETTINGS",
      resourceId: "13000000-0000-4000-8000-000000000002",
      afterRedactedJson: { feature: "audit-observability", enabled: true },
      reason: "Initial pilot settings fixture",
      requestId: "12000000-0000-4000-8000-000000000002",
      correlationId: "12000000-0000-4000-8000-000000000002",
    }, new Date(this.seedNow.getTime() + 1_000));
    this.notifications.set("14000000-0000-4000-8000-000000000001", {
      id: "14000000-0000-4000-8000-000000000001",
      tenantId: SYNTHETIC_AUDIT_TENANT_ID,
      recipientAccountId: SYNTHETIC_AUDIT_ADMIN_ACCOUNT_ID,
      recipientMembershipId: SYNTHETIC_AUDIT_MEMBERSHIP_ID,
      notificationType: "audit.integrity",
      priority: "INFO",
      title: "Audit chain พร้อมตรวจสอบ",
      body: "ตรวจพบ audit records ที่ผ่านการ redaction และ hash-chain แล้ว",
      createdAt: toIso(new Date(this.seedNow.getTime() + 2_000)),
      rowVersion: 1,
    });
    const jobId = "15000000-0000-4000-8000-000000000001";
    this.jobs.set(jobId, {
      id: jobId,
      tenantId: SYNTHETIC_AUDIT_TENANT_ID,
      jobType: "AUDIT_RETENTION_CHECK",
      status: "SUCCEEDED",
      attemptCount: 1,
      maxAttempts: 3,
      createdAt: toIso(this.seedNow),
      updatedAt: toIso(new Date(this.seedNow.getTime() + 3_000)),
    });
  }

  appendAudit(input: AuditAppendInput, now = new Date()): AuditEntry {
    return this.auditStore.append(input, now);
  }

  listAudit(actor: AuditOperationsActor, filter: AuditFilter = {}): AuditPage {
    return this.auditStore.list(actor, filter);
  }

  getAudit(actor: AuditOperationsActor, id: string): AuditEntry {
    return this.auditStore.get(actor, id);
  }

  verifyAuditIntegrity(): boolean {
    return this.auditStore.verifyIntegrity();
  }

  listNotifications(actor: AuditOperationsActor, unreadOnly = false): NotificationPage {
    assertUuid(actor.tenantId, "tenantId");
    const items = [...this.notifications.values()]
      .filter((notification) => notification.tenantId === actor.tenantId)
      .filter((notification) => actorCanReadAll(actor) || notification.recipientAccountId === actor.accountId)
      .filter((notification) => !unreadOnly || !notification.readAt)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
      .map(clone);
    return { items, unreadCount: items.filter((item) => !item.readAt).length };
  }

  markNotificationRead(actor: AuditOperationsActor, id: string, expectedVersion?: number, now = new Date()): StaffNotification {
    assertUuid(id, "id");
    const notification = this.notifications.get(id);
    if (!notification || notification.tenantId !== actor.tenantId || (!actorCanReadAll(actor) && notification.recipientAccountId !== actor.accountId)) {
      throw new AuditOperationsError("NOT_FOUND", "notification was not found");
    }
    if (expectedVersion !== undefined && expectedVersion !== notification.rowVersion) throw new AuditOperationsError("VERSION_CONFLICT", "notification has changed");
    if (!notification.readAt) {
      notification.readAt = toIso(now);
      notification.rowVersion += 1;
      this.auditStore.append({
        tenantId: notification.tenantId,
        actorAccountId: actor.accountId,
        actorMembershipId: actor.membershipId,
        actorType: "STAFF",
        action: "NOTIFICATION_READ",
        resourceType: "STAFF_NOTIFICATION",
        resourceId: notification.id,
        reason: "Mark notification as read",
        afterRedactedJson: { readAt: notification.readAt, rowVersion: notification.rowVersion },
      }, now);
    }
    return clone(notification);
  }

  requestExport(actor: AuditOperationsActor, input: ExportRequestInput, now = new Date()): ExportRecord {
    if (!actorCanExport(actor)) throw new AuditOperationsError("FORBIDDEN", "privileged export requires TENANT_ADMIN");
    assertUuid(actor.tenantId, "tenantId");
    if (input.exportType !== "AUDIT_LOG" && input.exportType !== "REPORT") throw new AuditOperationsError("VALIDATION_ERROR", "exportType is invalid");
    if (input.format !== "CSV") throw new AuditOperationsError("VALIDATION_ERROR", "format must be CSV");
    const filters = validateExportFilters(input.filters);
    const reason = redactReason(assertText(input.reason, "reason", 2_000));
    const idempotencyKey = assertText(input.idempotencyKey, "idempotencyKey", 255);
    if (idempotencyKey.length < 8) throw new AuditOperationsError("VALIDATION_ERROR", "idempotencyKey is too short");
    if (input.expectedVersion !== undefined && input.expectedVersion !== 1) throw new AuditOperationsError("VERSION_CONFLICT", "export policy version is not current");
    const estimatedRows = input.estimatedRows ?? (input.exportType === "AUDIT_LOG" ? this.auditStore.allForTenant(actor.tenantId).length : 2);
    if (!Number.isSafeInteger(estimatedRows) || estimatedRows < 0 || estimatedRows > 100_000) throw new AuditOperationsError("VALIDATION_ERROR", "estimatedRows is invalid");
    const idempotencyIndex = `${actor.tenantId}:${actor.accountId}:${input.exportType}:${idempotencyKey}`;
    const requestHash = digest({ exportType: input.exportType, format: input.format, filters, reason, estimatedRows });
    const existing = this.exportIdempotency.get(idempotencyIndex);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new AuditOperationsError("IDEMPOTENCY_CONFLICT", "idempotency key was reused with different export input");
      return this.getExportForActor(actor, existing.exportId, now);
    }
    const id = randomUUID();
    const watermark = `CityChatbot export=${id} tenant=${maskIdentifier(actor.tenantId)} actor=${maskIdentifier(actor.accountId)} issued=${toIso(now)}`;
    const record: ExportInternal = {
      id,
      tenantId: actor.tenantId,
      requestedByAccountId: actor.accountId,
      ...(actor.membershipId ? { requestedByMembershipId: actor.membershipId } : {}),
      exportType: input.exportType,
      format: input.format,
      status: "REQUESTED",
      filtersRedactedJson: filters,
      rowCount: estimatedRows,
      reason,
      watermark,
      requestedAt: toIso(now),
      rowVersion: 1,
    };
    this.exports.set(id, record);
    this.exportIdempotency.set(idempotencyIndex, { requestHash, exportId: id });
    this.auditStore.append({
      tenantId: actor.tenantId,
      actorAccountId: actor.accountId,
      actorMembershipId: actor.membershipId,
      actorType: "STAFF",
      action: "EXPORT_REQUESTED",
      resourceType: "EXPORT",
      resourceId: id,
      afterRedactedJson: { exportType: record.exportType, format: record.format, rowCount: record.rowCount, filters: filters },
      reason,
    }, now);
    record.status = "APPROVED";
    record.approvedByAccountId = actor.accountId;
    record.approvedAt = toIso(now);
    record.rowVersion += 1;
    this.auditStore.append({
      tenantId: actor.tenantId,
      actorAccountId: actor.accountId,
      actorMembershipId: actor.membershipId,
      actorType: "STAFF",
      action: "EXPORT_APPROVED",
      resourceType: "EXPORT",
      resourceId: id,
      afterRedactedJson: { approvedByAccountId: actor.accountId, rowVersion: record.rowVersion },
      reason: `Approve export: ${reason}`,
    }, now);
    if (estimatedRows > LARGE_EXPORT_THRESHOLD) {
      record.status = "QUEUED";
      record.rowVersion += 1;
      const jobId = randomUUID();
      record.jobId = jobId;
      this.jobs.set(jobId, {
        id: jobId,
        tenantId: actor.tenantId,
        jobType: "EXPORT_BUILD",
        status: "QUEUED",
        attemptCount: 0,
        maxAttempts: 3,
        createdAt: toIso(now),
        updatedAt: toIso(now),
        exportId: id,
      });
      this.auditStore.append({
        tenantId: actor.tenantId,
        actorAccountId: actor.accountId,
        actorMembershipId: actor.membershipId,
        actorType: "STAFF",
        action: "EXPORT_QUEUED",
        resourceType: "EXPORT",
        resourceId: id,
        afterRedactedJson: { jobId, rowCount: estimatedRows },
        reason: "Large export queued for background processing",
      }, now);
      return cloneExport(record);
    }
    this.prepareExport(record, actor, now);
    return this.getExportForActor(actor, id, now);
  }

  private prepareExport(record: ExportInternal, actor: AuditOperationsActor, now: Date): void {
    record.status = "READY";
    record.readyAt = toIso(now);
    record.expiresAt = toIso(new Date(now.getTime() + DEFAULT_EXPORT_TTL_MS));
    record.signedUrlToken = randomUUID();
    record.signedUrlDigest = digest(record.signedUrlToken);
    record.csvBody = this.buildCsv(record);
    record.rowVersion += 1;
    if (record.jobId) {
      const job = this.jobs.get(record.jobId);
      if (job) {
        job.status = "SUCCEEDED";
        job.attemptCount += 1;
        job.updatedAt = toIso(now);
      }
    }
    this.auditStore.append({
      tenantId: record.tenantId,
      actorAccountId: actor.accountId,
      actorMembershipId: actor.membershipId,
      actorType: "STAFF",
      action: "EXPORT_READY",
      resourceType: "EXPORT",
      resourceId: record.id,
      afterRedactedJson: { rowCount: record.rowCount, expiresAt: record.expiresAt, watermark: record.watermark },
      reason: "Export artifact prepared with watermark and expiry",
    }, now);
  }

  runPendingExportJobs(now = new Date()): readonly ExportRecord[] {
    const completed: ExportRecord[] = [];
    for (const job of this.jobs.values()) {
      if (job.jobType !== "EXPORT_BUILD" || job.status !== "QUEUED" || !job.exportId) continue;
      const record = this.exports.get(job.exportId);
      if (!record) {
        job.status = "DEAD";
        job.errorCode = "EXPORT_NOT_FOUND";
        job.updatedAt = toIso(now);
        continue;
      }
      job.status = "RUNNING";
      job.attemptCount += 1;
      job.updatedAt = toIso(now);
      const actor: AuditOperationsActor = { tenantId: record.tenantId, accountId: record.approvedByAccountId ?? record.requestedByAccountId, role: "TENANT_ADMIN", ...(record.requestedByMembershipId ? { membershipId: record.requestedByMembershipId } : {}) };
      this.prepareExport(record, actor, now);
      completed.push(cloneExport(record));
    }
    return completed;
  }

  private expireIfNeeded(record: ExportInternal, now: Date): void {
    if (record.status === "READY" && record.expiresAt && Date.parse(record.expiresAt) <= now.getTime()) {
      record.status = "EXPIRED";
      record.signedUrlToken = undefined;
      record.signedUrl = undefined;
      record.rowVersion += 1;
      this.auditStore.append({
        tenantId: record.tenantId,
        actorAccountId: record.approvedByAccountId ?? record.requestedByAccountId,
        actorMembershipId: record.requestedByMembershipId,
        actorType: "SYSTEM",
        action: "EXPORT_EXPIRED",
        resourceType: "EXPORT",
        resourceId: record.id,
        reason: "Signed export URL expired",
        afterRedactedJson: { expiredAt: record.expiresAt },
      }, now);
    }
  }

  private getExportForActor(actor: AuditOperationsActor, id: string, now: Date): ExportRecord {
    assertUuid(id, "id");
    const record = this.exports.get(id);
    if (!record || record.tenantId !== actor.tenantId || !actorCanReadAll(actor)) throw new AuditOperationsError("NOT_FOUND", "export was not found");
    this.expireIfNeeded(record, now);
    const publicRecord = cloneExport(record);
    if (record.status === "READY" && record.signedUrlToken && record.expiresAt) {
      publicRecord.signedUrl = `/api/v1/admin/exports/${record.id}?token=${encodeURIComponent(record.signedUrlToken)}`;
    }
    return publicRecord;
  }

  getExport(actor: AuditOperationsActor, id: string, now = new Date()): ExportRecord {
    return this.getExportForActor(actor, id, now);
  }

  listExports(actor: AuditOperationsActor): readonly ExportRecord[] {
    if (!actorCanReadAll(actor)) throw new AuditOperationsError("FORBIDDEN", "export visibility requires an administrative role");
    return [...this.exports.values()].filter((record) => record.tenantId === actor.tenantId).sort((left, right) => right.requestedAt.localeCompare(left.requestedAt) || right.id.localeCompare(left.id)).map((record) => this.getExportForActor(actor, record.id, new Date()));
  }

  revokeExport(actor: AuditOperationsActor, id: string, reason: string, expectedVersion?: number, now = new Date()): ExportRecord {
    if (!actorCanExport(actor)) throw new AuditOperationsError("FORBIDDEN", "only TENANT_ADMIN can revoke exports");
    const record = this.exports.get(id);
    if (!record || record.tenantId !== actor.tenantId) throw new AuditOperationsError("NOT_FOUND", "export was not found");
    if (expectedVersion !== undefined && expectedVersion !== record.rowVersion) throw new AuditOperationsError("VERSION_CONFLICT", "export has changed");
    if (record.status === "REVOKED") return cloneExport(record);
    if (record.status === "EXPIRED") throw new AuditOperationsError("EXPORT_EXPIRED", "expired export cannot be revoked");
    const normalizedReason = redactReason(assertText(reason, "reason", 2_000));
    record.status = "REVOKED";
    record.revokedAt = toIso(now);
    record.signedUrlToken = undefined;
    record.signedUrl = undefined;
    record.rowVersion += 1;
    this.auditStore.append({
      tenantId: record.tenantId,
      actorAccountId: actor.accountId,
      actorMembershipId: actor.membershipId,
      actorType: "STAFF",
      action: "EXPORT_REVOKED",
      resourceType: "EXPORT",
      resourceId: record.id,
      reason: normalizedReason,
      afterRedactedJson: { revokedAt: record.revokedAt, rowVersion: record.rowVersion },
    }, now);
    return cloneExport(record);
  }

  downloadExport(actor: AuditOperationsActor, id: string, token: string, now = new Date()): ExportDownload {
    if (!actorCanExport(actor)) throw new AuditOperationsError("FORBIDDEN", "export download requires TENANT_ADMIN");
    const record = this.exports.get(id);
    if (!record || record.tenantId !== actor.tenantId) throw new AuditOperationsError("NOT_FOUND", "export was not found");
    this.expireIfNeeded(record, now);
    if (record.status === "EXPIRED") throw new AuditOperationsError("EXPORT_EXPIRED", "signed export URL has expired");
    if (record.status === "REVOKED") throw new AuditOperationsError("EXPORT_REVOKED", "export link was revoked");
    if (record.status !== "READY" || !record.signedUrlDigest || !record.csvBody || !record.expiresAt) throw new AuditOperationsError("INVALID_STATE", "export artifact is not ready");
    const expected = Buffer.from(record.signedUrlDigest, "utf8");
    const actual = Buffer.from(digest(token), "utf8");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new AuditOperationsError("SIGNED_URL_INVALID", "signed export URL is invalid");
    if (Date.parse(record.expiresAt) <= now.getTime()) throw new AuditOperationsError("EXPORT_EXPIRED", "signed export URL has expired");
    this.auditStore.append({
      tenantId: record.tenantId,
      actorAccountId: actor.accountId,
      actorMembershipId: actor.membershipId,
      actorType: "STAFF",
      action: "EXPORT_DOWNLOADED",
      resourceType: "EXPORT",
      resourceId: record.id,
      reason: "Download approved export artifact",
      afterRedactedJson: { watermark: record.watermark },
    }, now);
    return { fileName: `citychatbot-${record.exportType.toLowerCase()}-${record.id}.csv`, contentType: "text/csv; charset=utf-8", body: record.csvBody, watermark: record.watermark };
  }

  private buildCsv(record: ExportInternal): string {
    const header = ["id", "action", "resource_type", "reason", "created_at", "watermark"].map(safeCsvCell).join(",");
    const rows = record.exportType === "AUDIT_LOG"
      ? this.auditStore.allForTenant(record.tenantId).slice(0, record.rowCount).map((entry) => [entry.id, entry.action, entry.resourceType, entry.reason, entry.createdAt, record.watermark].map(safeCsvCell).join(","))
      : [[record.id, "REPORT_EXPORT", "REPORT", "deterministic report fixture", record.requestedAt, record.watermark].map(safeCsvCell).join(",")];
    return [`# ${record.watermark}`, header, ...rows].join("\r\n") + "\r\n";
  }

  listJobs(actor: AuditOperationsActor): readonly AdminJob[] {
    if (!actorCanReadAll(actor)) throw new AuditOperationsError("FORBIDDEN", "job visibility requires an administrative role");
    return [...this.jobs.values()].filter((job) => job.tenantId === actor.tenantId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)).map(clone);
  }

  getJob(actor: AuditOperationsActor, id: string): AdminJob {
    assertUuid(id, "id");
    const job = this.jobs.get(id);
    if (!job || job.tenantId !== actor.tenantId || !actorCanReadAll(actor)) throw new AuditOperationsError("NOT_FOUND", "job was not found");
    return clone(job);
  }

  snapshot(actor: AuditOperationsActor): AuditOperationsSnapshot {
    return {
      audit: this.listAudit(actor),
      notifications: this.listNotifications(actor),
      exports: this.listExports(actor),
      jobs: this.listJobs(actor),
    };
  }
}

export const auditOperationsRepository = new AuditOperationsRepository();
