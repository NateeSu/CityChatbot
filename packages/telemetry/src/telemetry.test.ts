import { describe, expect, it } from "vitest";

import {
  InMemoryAuditLog,
  InMemoryJobQueue,
  InMemoryOutbox,
  StructuredLogger,
  TelemetryContractError,
  buildStructuredLogRecord,
  calculateRetryDelayMs,
  createCorrelationContext,
  createDomainEvent,
  pseudonymizeTenantId,
  redactErrorDetail,
} from "./telemetry";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const RESOURCE_A = "33333333-3333-4333-8333-333333333333";
const ACCOUNT_A = "55555555-5555-4555-8555-555555555555";
const CORRELATION_A = "66666666-6666-4666-8666-666666666666";
const REDACTION_SECRET = "telemetry-pseudonymization-secret-32-bytes";

const event = () => createDomainEvent({
  eventType: "complaint.created",
  eventVersion: 1,
  tenantId: TENANT_A,
  aggregateType: "complaint",
  aggregateId: RESOURCE_A,
  idempotencyKey: "complaint-created-1",
  payload: { complaintId: RESOURCE_A, categoryId: "waste" },
  correlationId: CORRELATION_A,
  actor: { type: "SYSTEM" },
});

describe("structured telemetry and redaction", () => {
  it("creates correlation IDs and pseudonymizes tenants without exposing raw IDs", () => {
    const context = createCorrelationContext({ requestId: CORRELATION_A });
    expect(context.requestId).toBe(CORRELATION_A);
    expect(context.correlationId).toBe(CORRELATION_A);
    const hash = pseudonymizeTenantId(TENANT_A, REDACTION_SECRET);
    expect(hash).toHaveLength(24);
    expect(hash).not.toContain(TENANT_A);
  });

  it("builds structured logs with tenant hash and redacted error detail", () => {
    const logs: unknown[] = [];
    const logger = new StructuredLogger((record) => logs.push(record));
    const record = logger.write({
      severity: "error",
      service: "web",
      module: "complaints",
      environment: "test",
      requestId: CORRELATION_A,
      correlationId: CORRELATION_A,
      tenantId: TENANT_A,
      tenantHashSecret: REDACTION_SECRET,
      actorType: "STAFF",
      routeOrJob: "POST /api/v1/complaints",
      status: 500,
      errorCode: "PROCESSING_FAILED",
      errorDetail: "authorization=super-secret-token phone=0812345678",
    });
    const serialized = JSON.stringify(record);
    expect(record.tenantHash).toHaveLength(24);
    expect(serialized).not.toContain(TENANT_A);
    expect(serialized).not.toContain("super-secret-token");
    expect(serialized).not.toContain("0812345678");
    expect(logs).toHaveLength(1);
  });

  it("rejects raw PII fields in domain events and accepts ID-only payloads", () => {
    expect(() => createDomainEvent({
      ...event(),
      payload: { complaintId: RESOURCE_A, phone: "0812345678" },
    })).toThrowError(/PII_IN_EVENT/);
    expect(event().eventType).toBe("complaint.created");
    expect(() => createDomainEvent({ ...event(), eventType: "complaint.created.v1" })).toThrowError(/INVALID_EVENT_TYPE/);
  });

  it("deduplicates transactional outbox events and rejects changed idempotency payloads", () => {
    const outbox = new InMemoryOutbox();
    const first = outbox.append(event());
    const same = outbox.append(event());
    expect(same.eventId).toBe(first.eventId);
    expect(outbox.claim(1)).toHaveLength(1);
    expect(() => outbox.append({ ...event(), payload: { complaintId: RESOURCE_A, state: "RECEIVED" } })).toThrowError(/OUTBOX_IDEMPOTENCY_CONFLICT/);
    outbox.markPublished(first.eventId);
    expect(outbox.list()[0]?.publishedAt).toBeDefined();
  });

  it("keeps audit append-only, redacts sensitive fields and verifies its hash chain", () => {
    const audit = new InMemoryAuditLog();
    const base = {
      tenantId: TENANT_A,
      actorAccountId: ACCOUNT_A,
      actorType: "STAFF" as const,
      action: "complaint.view",
      resourceType: "complaint",
      resourceId: RESOURCE_A,
      reason: "Investigate assigned complaint",
      requestId: CORRELATION_A,
      correlationId: CORRELATION_A,
      beforeRedactedJson: { phone: "0812345678", status: "RECEIVED" },
      afterRedactedJson: { status: "RECEIVED" },
    };
    const first = audit.append(base);
    audit.append({ ...base, action: "complaint.assign", reason: "Assign to department" });
    expect(JSON.stringify(first)).not.toContain("0812345678");
    expect(audit.verifyIntegrity()).toBe(true);
    expect(audit.list(TENANT_B)).toEqual([]);
  });

  it("claims jobs with leases, heartbeats, retries and deterministic backoff", () => {
    const queue = new InMemoryJobQueue<{ entityId: string }>();
    const queued = queue.enqueue({
      tenantId: TENANT_A,
      jobType: "notification.send",
      jobVersion: 1,
      dedupeKey: "notification-1",
      payload: { entityId: RESOURCE_A },
      correlationId: CORRELATION_A,
      maxAttempts: 3,
      nextAttemptAt: new Date(1_700_000_000_000),
    });
    const claimed = queue.claim("worker-a", 1, new Date(1_700_000_000_000), 30_000);
    expect(claimed[0]?.id).toBe(queued.id);
    expect(queue.heartbeat(queued.id, "worker-a", new Date(1_700_000_005_000), 30_000)).toBe(true);
    const retry = queue.fail(queued.id, "worker-a", {
      errorCode: "EXTERNAL_DEPENDENCY_FAILED",
      errorDetail: "token=secret",
      retryable: true,
      now: new Date(1_700_000_006_000),
      jitterMs: 0,
    });
    expect(retry.status).toBe("RETRY_WAIT");
    expect(retry.errorDetailRedacted).not.toContain("secret");
    expect(calculateRetryDelayMs(1, 0)).toBe(5_000);
  });

  it("recovers expired leases to retry and moves exhausted jobs to DLQ", () => {
    const queue = new InMemoryJobQueue();
    const queued = queue.enqueue({
      tenantId: TENANT_A,
      jobType: "document.process",
      jobVersion: 1,
      dedupeKey: "document-1",
      payload: { documentId: RESOURCE_A },
      correlationId: CORRELATION_A,
      maxAttempts: 3,
      nextAttemptAt: new Date(1_700_000_000_000),
    });
    queue.claim("worker-a", 1, new Date(1_700_000_000_000), 1_000);
    const recovered = queue.claim("worker-b", 1, new Date(1_700_000_002_000), 1_000);
    expect(recovered[0]?.id).toBe(queued.id);
    queue.fail(queued.id, "worker-b", { errorCode: "TIMEOUT", retryable: true, now: new Date(1_700_000_002_100), jitterMs: 0 });
    const second = queue.claim("worker-c", 1, new Date(1_700_000_032_100), 1_000);
    expect(second[0]?.id).toBe(queued.id);
    const dead = queue.fail(queued.id, "worker-c", { errorCode: "TIMEOUT", retryable: true, now: new Date(1_700_000_032_200), jitterMs: 0 });
    expect(dead.status).toBe("DEAD");
    expect(Object.prototype.hasOwnProperty.call(queue.listForAdmin(TENANT_A)[0], "payload")).toBe(false);
  });

  it("requires authorized same-tenant replay and writes an audit record", () => {
    const queue = new InMemoryJobQueue();
    const audit = new InMemoryAuditLog();
    const queued = queue.enqueue({
      tenantId: TENANT_A,
      jobType: "report.export",
      jobVersion: 1,
      dedupeKey: "report-1",
      payload: { reportId: RESOURCE_A },
      correlationId: CORRELATION_A,
      maxAttempts: 1,
    });
    queue.claim("worker-a", 1);
    queue.fail(queued.id, "worker-a", { errorCode: "FAILED", retryable: true, jitterMs: 0 });
    expect(() => queue.replay({
      jobId: queued.id,
      tenantId: TENANT_A,
      actorType: "STAFF",
      reason: "retry failed export",
      authorized: false,
      auditSink: (record) => audit.append(record),
    })).toThrowError(/FORBIDDEN/);
    const replay = queue.replay({
      jobId: queued.id,
      tenantId: TENANT_A,
      actorType: "STAFF",
      reason: "retry failed export",
      authorized: true,
      auditSink: (record) => audit.append(record),
    });
    expect(replay.status).toBe("QUEUED");
    expect(audit.list(TENANT_A)[0]?.action).toBe("jobs.replay");
    expect(audit.verifyIntegrity()).toBe(true);
  });

  it("redacts error details and does not allow cross-tenant audit views", () => {
    expect(redactErrorDetail("Bearer abc.def.ghi token=secret")).not.toContain("abc.def.ghi");
    const audit = new InMemoryAuditLog();
    audit.append({
      tenantId: TENANT_A,
      actorType: "SYSTEM",
      action: "job.failed",
      resourceType: "job",
      resourceId: RESOURCE_A,
      reason: "system retry",
      requestId: CORRELATION_A,
      correlationId: CORRELATION_A,
    });
    expect(audit.list(TENANT_B)).toEqual([]);
  });

  it("fails closed on invalid telemetry contract identifiers", () => {
    expect(() => buildStructuredLogRecord({
      severity: "info",
      service: "web",
      module: "test",
      environment: "test",
      requestId: "not-a-uuid",
      correlationId: CORRELATION_A,
      actorType: "SYSTEM",
      routeOrJob: "health",
    })).toThrowError(TelemetryContractError);
  });
});
