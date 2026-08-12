import { describe, expect, it } from "vitest";

import {
  CORE_RECONCILIATION_JOB_TYPES,
  JOB_DEFINITIONS,
  JobOperationsError,
  JobOperationsRepository,
  signCronRequest,
  verifyCronRequest,
} from "./job-ops";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const CORRELATION = "33333333-3333-4333-8333-333333333333";
const BASE = new Date("2026-08-11T00:00:00.000Z");

describe("job operations and recovery", () => {
  it("pins inventory, owners, SLOs and idempotency policies for core jobs", () => {
    expect(JOB_DEFINITIONS.length).toBeGreaterThanOrEqual(8);
    expect(CORE_RECONCILIATION_JOB_TYPES).toEqual(["document.expiry", "news.publish", "support.sla.scan", "kpi.snapshot"]);
    expect(JOB_DEFINITIONS.every((definition) => definition.owner && definition.sloTargetMs > 0 && definition.idempotencyKey && definition.runbookId)).toBe(true);
  });

  it("deduplicates the same idempotent enqueue and rejects changed payload", () => {
    const repo = new JobOperationsRepository();
    const first = repo.enqueue({ tenantId: TENANT_A, jobType: "kpi.snapshot", idempotencyKey: "kpi:tenant:period:1", payloadRefs: { metricKey: "COMPLAINT_RECEIVED_VOLUME", period: "2026-08", watermark: "w1" }, correlationId: CORRELATION, now: BASE });
    const same = repo.enqueue({ tenantId: TENANT_A, jobType: "kpi.snapshot", idempotencyKey: "kpi:tenant:period:1", payloadRefs: { metricKey: "COMPLAINT_RECEIVED_VOLUME", period: "2026-08", watermark: "w1" }, correlationId: CORRELATION, now: BASE });
    expect(same.id).toBe(first.id);
    expect(() => repo.enqueue({ tenantId: TENANT_A, jobType: "kpi.snapshot", idempotencyKey: "kpi:tenant:period:1", payloadRefs: { metricKey: "OTHER", period: "2026-08", watermark: "w1" }, correlationId: CORRELATION, now: BASE })).toThrowError(/IDEMPOTENCY_CONFLICT/);
  });

  it("retries provider failures with a bounded policy and never exposes payload refs in the view", () => {
    const repo = new JobOperationsRepository();
    const job = repo.enqueue({ tenantId: TENANT_A, jobType: "notification.dispatch", idempotencyKey: "notification:1:line", payloadRefs: { notificationId: "n1", channel: "LINE" }, correlationId: CORRELATION, now: BASE });
    repo.claim(job.id, "worker-a", BASE);
    const failed = repo.fail(job.id, "worker-a", { errorCode: "PROVIDER_503", retryable: true, now: new Date(BASE.getTime() + 1000) });
    expect(failed.status).toBe("RETRY_WAIT");
    expect(repo.listForTenant(TENANT_A)[0]).not.toHaveProperty("payloadRefs");
    expect(failed.nextAttemptAt).toBe("2026-08-11T00:00:06.000Z");
  });

  it("quarantines poison messages and requires explicit approval before replay", () => {
    const repo = new JobOperationsRepository();
    const job = repo.enqueue({ tenantId: TENANT_A, jobType: "document.process", idempotencyKey: "document:1:v1", payloadRefs: { documentId: "d1", version: 1 }, correlationId: CORRELATION, now: BASE });
    repo.claim(job.id, "worker-a", BASE);
    const quarantined = repo.fail(job.id, "worker-a", { errorCode: "SCHEMA_MISMATCH", retryable: true, reason: "schema version not approved", now: new Date(BASE.getTime() + 1000) });
    expect(quarantined.status).toBe("QUARANTINED");
    expect(() => repo.replay({ tenantId: TENANT_A, actor: { accountId: "44444444-4444-4444-8444-444444444444", role: "TENANT_ADMIN" }, jobId: job.id, reason: "retry without quarantine review", idempotencyKey: "replay:1", now: BASE })).toThrowError(/QUARANTINE_APPROVAL_REQUIRED/);
    const replay = repo.replay({ tenantId: TENANT_A, actor: { accountId: "44444444-4444-4444-8444-444444444444", role: "TENANT_ADMIN" }, jobId: job.id, reason: "schema reviewed and fixed", idempotencyKey: "replay:1", quarantineApproved: true, now: new Date(BASE.getTime() + 2000) });
    expect(replay.status).toBe("QUEUED");
    expect(replay.replayOf).toBe(job.id);
    expect(repo.replay({ tenantId: TENANT_A, actor: { accountId: "44444444-4444-4444-8444-444444444444", role: "TENANT_ADMIN" }, jobId: job.id, reason: "schema reviewed and fixed", idempotencyKey: "replay:1", quarantineApproved: true, now: new Date(BASE.getTime() + 3000) }).id).toBe(replay.id);
    expect(repo.auditForTenant(TENANT_A).some((event) => event.action === "REPLAYED" && event.actorType === "STAFF")).toBe(true);
  });

  it("denies unauthorized, cross-tenant and non-DLQ replay", () => {
    const repo = new JobOperationsRepository();
    const job = repo.enqueue({ tenantId: TENANT_A, jobType: "news.publish", idempotencyKey: "news:1:v1", payloadRefs: { newsId: "n1", revision: 1 }, correlationId: CORRELATION, now: BASE });
    expect(() => repo.replay({ tenantId: TENANT_A, actor: { accountId: "44444444-4444-4444-8444-444444444444", role: "EXECUTIVE" }, jobId: job.id, reason: "not dead", idempotencyKey: "replay:2", now: BASE })).toThrowError(/FORBIDDEN/);
    expect(() => repo.replay({ tenantId: TENANT_B, actor: { accountId: "44444444-4444-4444-8444-444444444444", role: "TENANT_ADMIN" }, jobId: job.id, reason: "wrong tenant", idempotencyKey: "replay:3", now: BASE })).toThrowError(/FORBIDDEN/);
    expect(() => repo.replay({ tenantId: TENANT_A, actor: { accountId: "44444444-4444-4444-8444-444444444444", role: "TENANT_ADMIN" }, jobId: job.id, reason: "not dead", idempotencyKey: "replay:4", now: BASE })).toThrowError(/INVALID_STATE/);
  });

  it("reconciles expired-doc/news/SLA/KPI job coverage and reports DLQ mismatch", () => {
    const repo = new JobOperationsRepository();
    for (const [index, jobType] of CORE_RECONCILIATION_JOB_TYPES.entries()) repo.enqueue({ tenantId: TENANT_A, jobType, idempotencyKey: `${jobType}:fixture:${index}`, payloadRefs: { referenceId: `ref-${index}` }, correlationId: CORRELATION, now: BASE });
    const matched = repo.reconcile(TENANT_A, CORE_RECONCILIATION_JOB_TYPES, BASE);
    expect(matched.status).toBe("MATCH");
    const missing = new JobOperationsRepository().reconcile(TENANT_A, CORE_RECONCILIATION_JOB_TYPES, BASE);
    expect(missing.status).toBe("MISMATCH");
    expect(missing.missingJobTypes).toContain("kpi.snapshot");
  });

  it("keeps optional DLQ work visible without making core reconciliation ambiguous", () => {
    const repo = new JobOperationsRepository();
    for (const [index, jobType] of CORE_RECONCILIATION_JOB_TYPES.entries()) {
      const job = repo.enqueue({ tenantId: TENANT_A, jobType, idempotencyKey: `${jobType}:fixture:optional:${index}`, payloadRefs: { referenceId: `ref-${index}` }, correlationId: CORRELATION, now: BASE });
      repo.claim(job.id, `worker-${index}`, BASE);
      repo.fail(job.id, `worker-${index}`, { errorCode: "TENANT_SCOPE_VIOLATION", retryable: false, reason: "core poison fixture", now: new Date(BASE.getTime() + 1000) });
    }
    const optional = repo.enqueue({ tenantId: TENANT_A, jobType: "notification.dispatch", idempotencyKey: "notification:optional:dead", payloadRefs: { notificationId: "n1", channel: "LINE" }, correlationId: CORRELATION, now: BASE });
    let attemptAt = BASE;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      repo.claim(optional.id, "notification-worker", attemptAt);
      const failedAt = new Date(attemptAt.getTime() + 1000);
      repo.fail(optional.id, "notification-worker", { errorCode: "PROVIDER_503", retryable: true, reason: "provider outage", now: failedAt });
      attemptAt = new Date(BASE.getTime() + [6_000, 37_000, 158_000, 759_000, 1_800_000][attempt]!);
    }
    const reconciliation = repo.reconcile(TENANT_A, CORE_RECONCILIATION_JOB_TYPES, BASE);
    expect(reconciliation.status).toBe("MISMATCH");
    expect(reconciliation.deadJobIds).toHaveLength(0);
    expect(reconciliation.unexpectedJobTypes).toContain("notification.dispatch");
    expect(repo.listDlq(TENANT_A)).toHaveLength(5);
  });

  it("authenticates cron requests with a bounded timestamp and timing-safe signature", () => {
    const secret = "cron-secret-with-at-least-32-bytes-for-tests";
    const timestamp = "2026-08-11T00:00:00.000Z";
    const body = '{"job":"kpi.snapshot"}';
    const signature = signCronRequest(secret, timestamp, body);
    expect(verifyCronRequest({ secret, timestamp, body, signature, now: BASE })).toBe(true);
    expect(verifyCronRequest({ secret, timestamp, body: '{"job":"news.publish"}', signature, now: BASE })).toBe(false);
    expect(verifyCronRequest({ secret, timestamp: "2026-08-10T00:00:00.000Z", body, signature, now: BASE })).toBe(false);
    expect(() => signCronRequest("short", timestamp, body)).toThrowError(/INVALID_CRON_SECRET/);
  });

  it("rejects unsafe payload references before they enter the job store", () => {
    const repo = new JobOperationsRepository();
    expect(() => repo.enqueue({ tenantId: TENANT_A, jobType: "audit.export", idempotencyKey: "export:1:watermark", payloadRefs: { exportId: "e1", token: "secret" }, correlationId: CORRELATION, now: BASE })).toThrowError(JobOperationsError);
  });
});
