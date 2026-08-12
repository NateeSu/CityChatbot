import { describe, expect, it } from "vitest";

import {
  AuditOperationsError,
  AuditOperationsRepository,
  LARGE_EXPORT_THRESHOLD,
  SYNTHETIC_AUDIT_ADMIN_ACCOUNT_ID,
  SYNTHETIC_AUDIT_EXECUTIVE_ACCOUNT_ID,
  SYNTHETIC_AUDIT_OTHER_TENANT_ID,
  SYNTHETIC_AUDIT_STAFF_ACCOUNT_ID,
  SYNTHETIC_AUDIT_TENANT_ID,
  verifyAuditChain,
  type AuditEntry,
  type AuditOperationsActor,
} from "./audit-operations";

const RESOURCE_ID = "16000000-0000-4000-8000-000000000001";
const REQUEST_ID = "17000000-0000-4000-8000-000000000001";
const baseTime = new Date("2026-08-11T01:00:00.000Z");
const admin: AuditOperationsActor = { tenantId: SYNTHETIC_AUDIT_TENANT_ID, accountId: SYNTHETIC_AUDIT_ADMIN_ACCOUNT_ID, role: "TENANT_ADMIN" };
const executive: AuditOperationsActor = { tenantId: SYNTHETIC_AUDIT_TENANT_ID, accountId: SYNTHETIC_AUDIT_EXECUTIVE_ACCOUNT_ID, role: "EXECUTIVE" };
const staff: AuditOperationsActor = { tenantId: SYNTHETIC_AUDIT_TENANT_ID, accountId: SYNTHETIC_AUDIT_STAFF_ACCOUNT_ID, role: "STAFF" };

describe("audit observability operations", () => {
  it("redacts sensitive diffs and detects a tampered append-only hash chain", () => {
    const repository = new AuditOperationsRepository({ seed: false });
    const first = repository.appendAudit({
      tenantId: SYNTHETIC_AUDIT_TENANT_ID,
      actorAccountId: SYNTHETIC_AUDIT_ADMIN_ACCOUNT_ID,
      actorType: "STAFF",
      action: "STAFF_UPDATED",
      resourceType: "STAFF_MEMBER",
      resourceId: RESOURCE_ID,
      beforeRedactedJson: { phone: "0812345678", status: "INVITED" },
      afterRedactedJson: { status: "ACTIVE", password: "do-not-store" },
      reason: "Activate staff account",
      requestId: REQUEST_ID,
      correlationId: REQUEST_ID,
    }, baseTime);
    const second = repository.appendAudit({
      tenantId: SYNTHETIC_AUDIT_TENANT_ID,
      actorAccountId: SYNTHETIC_AUDIT_ADMIN_ACCOUNT_ID,
      actorType: "STAFF",
      action: "STAFF_VIEWED",
      resourceType: "STAFF_MEMBER",
      resourceId: RESOURCE_ID,
      reason: "Review staff access",
      requestId: "17000000-0000-4000-8000-000000000002",
      correlationId: "17000000-0000-4000-8000-000000000002",
    }, new Date(baseTime.getTime() + 1_000));
    expect(JSON.stringify(first)).not.toContain("0812345678");
    expect(JSON.stringify(first)).not.toContain("do-not-store");
    expect(repository.verifyAuditIntegrity()).toBe(true);
    const tampered: AuditEntry[] = [{ ...first, reason: "changed" }, second];
    expect(verifyAuditChain(tampered)).toBe(false);
  });

  it("enforces same-tenant and role-scoped audit visibility with cursor filters", () => {
    const repository = new AuditOperationsRepository({ seed: false });
    repository.appendAudit({ tenantId: SYNTHETIC_AUDIT_TENANT_ID, actorAccountId: SYNTHETIC_AUDIT_STAFF_ACCOUNT_ID, actorType: "STAFF", action: "COMPLAINT_VIEWED", resourceType: "COMPLAINT", resourceId: RESOURCE_ID, reason: "Assigned work review" }, baseTime);
    repository.appendAudit({ tenantId: SYNTHETIC_AUDIT_OTHER_TENANT_ID, actorAccountId: SYNTHETIC_AUDIT_ADMIN_ACCOUNT_ID, actorType: "STAFF", action: "COMPLAINT_VIEWED", resourceType: "COMPLAINT", resourceId: RESOURCE_ID, reason: "Other tenant fixture" }, baseTime);
    expect(repository.listAudit(admin, { action: "complaint_viewed" }).total).toBe(1);
    expect(repository.listAudit(executive).items).toHaveLength(1);
    expect(repository.listAudit(staff).items).toHaveLength(1);
    expect(repository.listAudit({ ...staff, accountId: SYNTHETIC_AUDIT_EXECUTIVE_ACCOUNT_ID }).items).toHaveLength(0);
    expect(repository.listAudit({ ...admin, tenantId: SYNTHETIC_AUDIT_OTHER_TENANT_ID }).items).toHaveLength(1);
  });

  it("marks notifications read idempotently and audits the mutation", () => {
    const repository = new AuditOperationsRepository();
    const initial = repository.listNotifications(admin);
    const notification = initial.items[0]!;
    const read = repository.markNotificationRead(admin, notification.id, notification.rowVersion, baseTime);
    const replay = repository.markNotificationRead(admin, notification.id, read.rowVersion, new Date(baseTime.getTime() + 1_000));
    expect(read.readAt).toBeDefined();
    expect(replay.rowVersion).toBe(read.rowVersion);
    expect(repository.listNotifications(admin).unreadCount).toBe(0);
    expect(repository.listAudit(admin, { action: "NOTIFICATION_READ" }).total).toBe(1);
    expect(() => repository.markNotificationRead({ ...admin, tenantId: SYNTHETIC_AUDIT_OTHER_TENANT_ID }, notification.id)).toThrowError(/NOT_FOUND/);
  });

  it("requires privileged reason/idempotency, queues large exports and blocks unauthorized export", () => {
    const repository = new AuditOperationsRepository();
    expect(() => repository.requestExport(staff, { exportType: "AUDIT_LOG", format: "CSV", filters: {}, reason: "no", idempotencyKey: "staff-export-1" })).toThrowError(/FORBIDDEN/);
    const queued = repository.requestExport(admin, { exportType: "AUDIT_LOG", format: "CSV", filters: { email: "private@example.invalid" }, reason: "Monthly audit review", idempotencyKey: "audit-export-large-1", expectedVersion: 1, estimatedRows: LARGE_EXPORT_THRESHOLD + 1 }, baseTime);
    expect(queued.status).toBe("QUEUED");
    expect(queued.signedUrl).toBeUndefined();
    const replay = repository.requestExport(admin, { exportType: "AUDIT_LOG", format: "CSV", filters: { email: "private@example.invalid" }, reason: "Monthly audit review", idempotencyKey: "audit-export-large-1", expectedVersion: 1, estimatedRows: LARGE_EXPORT_THRESHOLD + 1 }, baseTime);
    expect(replay.id).toBe(queued.id);
    expect(() => repository.requestExport(admin, { exportType: "AUDIT_LOG", format: "CSV", filters: {}, reason: "Different reason", idempotencyKey: "audit-export-large-1", expectedVersion: 1, estimatedRows: LARGE_EXPORT_THRESHOLD + 1 })).toThrowError(AuditOperationsError);
    const ready = repository.runPendingExportJobs(baseTime)[0]!;
    expect(ready.status).toBe("READY");
    expect(ready.watermark).toContain(ready.id);
    expect(repository.listAudit(admin, { action: "EXPORT_APPROVED" }).total).toBe(1);
  });

  it("sanitizes spreadsheet formulas, honors signed URL expiry, and supports revocation", () => {
    const repository = new AuditOperationsRepository({ seed: false });
    repository.appendAudit({ tenantId: SYNTHETIC_AUDIT_TENANT_ID, actorAccountId: SYNTHETIC_AUDIT_ADMIN_ACCOUNT_ID, actorType: "STAFF", action: "FORMULA_TESTED", resourceType: "EXPORT", resourceId: RESOURCE_ID, reason: "=SUM(1,2)" }, baseTime);
    const exportRecord = repository.requestExport(admin, { exportType: "AUDIT_LOG", format: "CSV", filters: {}, reason: "Download audit evidence", idempotencyKey: "audit-export-small-1", expectedVersion: 1, estimatedRows: 1 }, baseTime);
    expect(exportRecord.status).toBe("READY");
    const token = exportRecord.signedUrl?.split("token=")[1];
    expect(token).toBeDefined();
    const downloaded = repository.downloadExport(admin, exportRecord.id, decodeURIComponent(token!), baseTime);
    expect(downloaded.body).toContain("'=SUM(1,2)");
    expect(() => repository.downloadExport(admin, exportRecord.id, "invalid-token", baseTime)).toThrowError(/SIGNED_URL_INVALID/);
    expect(() => repository.downloadExport(admin, exportRecord.id, decodeURIComponent(token!), new Date(baseTime.getTime() + 5 * 60 * 1_000))).toThrowError(/EXPORT_EXPIRED/);
    const revoked = repository.requestExport(admin, { exportType: "REPORT", format: "CSV", filters: {}, reason: "Rollback test export", idempotencyKey: "report-export-revoke-1", expectedVersion: 1, estimatedRows: 1 }, baseTime);
    const revokedRecord = repository.revokeExport(admin, revoked.id, "Disable links during rollback", revoked.rowVersion, baseTime);
    expect(revokedRecord.status).toBe("REVOKED");
    expect(() => repository.downloadExport(admin, revoked.id, "any-token", baseTime)).toThrowError(/EXPORT_REVOKED/);
  });
});
