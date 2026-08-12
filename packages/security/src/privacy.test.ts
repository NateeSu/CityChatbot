import { describe, expect, it } from "vitest";

import { InMemoryPrivacyLifecycle, PrivacyLifecycleError, RETENTION_KEYS, subjectHashForTest } from "./privacy";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const NOW = new Date("2026-08-12T00:00:00.000Z");
const OLD = "2025-01-01T00:00:00.000Z";
const RECENT = "2026-08-01T00:00:00.000Z";
const policy = Object.fromEntries(RETENTION_KEYS.map((key) => [key, 30])) as Record<(typeof RETENTION_KEYS)[number], number>;

describe("privacy retention and data-subject lifecycle", () => {
  it("uses a versioned machine-activated policy and safe-denies missing policy", () => {
    const lifecycle = new InMemoryPrivacyLifecycle();
    const before = lifecycle.decidePurge({ id: "record-1", tenantId: TENANT_A, store: "CHAT", createdAt: OLD }, NOW);
    expect(before.decision).toBe("NO_ACTIVE_POLICY");
    const active = lifecycle.activateRetentionPolicy({ tenantId: TENANT_A, version: 1, retentionDays: policy }, NOW);
    expect(active.activatedBy).toBe("SYSTEM_UNIT_GATE");
    expect(active.state).toBe("ACTIVE");
    expect(lifecycle.decidePurge({ id: "record-1", tenantId: TENANT_A, store: "CHAT", createdAt: OLD }, NOW).decision).toBe("PURGE_ALLOWED");
    expect(lifecycle.decidePurge({ id: "record-2", tenantId: TENANT_A, store: "CHAT", createdAt: RECENT }, NOW).decision).toBe("RETENTION_NOT_DUE");
  });

  it("stops purge across matching stores while a legal hold is active and resumes after release", () => {
    const lifecycle = new InMemoryPrivacyLifecycle();
    lifecycle.activateRetentionPolicy({ tenantId: TENANT_A, version: 1, retentionDays: policy }, NOW);
    lifecycle.placeLegalHold({ tenantId: TENANT_A, holdKey: "hold-case-001", reason: "active investigation", scopeKeys: ["CHAT", "FILE"] }, NOW);
    expect(lifecycle.decidePurge({ id: "chat-1", tenantId: TENANT_A, store: "CHAT", createdAt: OLD }, NOW).decision).toBe("HOLD_ACTIVE");
    expect(lifecycle.decidePurge({ id: "complaint-1", tenantId: TENANT_A, store: "COMPLAINT", createdAt: OLD }, NOW).decision).toBe("PURGE_ALLOWED");
    lifecycle.releaseLegalHold(TENANT_A, "hold-case-001", NOW);
    expect(lifecycle.decidePurge({ id: "chat-1", tenantId: TENANT_A, store: "CHAT", createdAt: OLD }, NOW).decision).toBe("PURGE_ALLOWED");
  });

  it("keeps DSAR idempotent, pseudonymous and tenant-isolated", () => {
    const lifecycle = new InMemoryPrivacyLifecycle();
    const subjectHash = subjectHashForTest("synthetic-line-user-a");
    const request = lifecycle.createDataSubjectRequest({ tenantId: TENANT_A, requestKey: "dsar-key-001", subjectHash, requestType: "ACCESS" }, NOW);
    expect(request.subjectHash).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(lifecycle.createDataSubjectRequest({ tenantId: TENANT_A, requestKey: "dsar-key-001", subjectHash, requestType: "ACCESS" }, NOW).id).toBe(request.id);
    expect(() => lifecycle.createDataSubjectRequest({ tenantId: TENANT_A, requestKey: "dsar-key-001", subjectHash: subjectHashForTest("other"), requestType: "ERASURE" }, NOW)).toThrowError(PrivacyLifecycleError);
    lifecycle.transitionDataSubjectRequest(TENANT_A, "dsar-key-001", "IN_PROGRESS", NOW);
    const completed = lifecycle.completeDataSubjectRequest(TENANT_A, "dsar-key-001", { COMPLAINT: 2, CHAT: 1 }, NOW);
    expect(completed.state).toBe("COMPLETED");
    expect(completed.resultRedacted).toEqual({ COMPLAINT: 2, CHAT: 1 });
    expect(() => lifecycle.purgePlan(TENANT_A, [{ id: "leak", tenantId: TENANT_B, store: "CHAT", createdAt: OLD }], NOW)).toThrowError(/TENANT_SCOPE/u);
  });
});
