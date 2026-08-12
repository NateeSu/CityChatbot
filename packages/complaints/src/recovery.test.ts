import { describe, expect, it } from "vitest";

import { ComplaintRecoveryService, InMemoryComplaintRepository, RecoveryReconciliationJob, runChatWithHandoff, type ComplaintRecoverySubmitInput } from "./index";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const QUEUE_A = "44444444-4444-4444-8444-444444444444";
const CATEGORY_A = "33333333-3333-4333-8333-333333333333";
const DEPARTMENT_A = "55555555-5555-4555-8555-555555555555";
const ACCOUNT_A = "66666666-6666-4666-8666-666666666666";
const NOW = new Date("2026-08-10T00:00:00.000Z");

const createInput = (overrides: Partial<ComplaintRecoverySubmitInput> = {}): ComplaintRecoverySubmitInput => ({
  tenantId: TENANT_A,
  lineUserId: "Urecovery-test",
  categoryId: CATEGORY_A,
  title: "ไฟฟ้าดับหน้าตลาด",
  description: "รายละเอียดสังเคราะห์สำหรับทดสอบการกู้คืนเมื่อ integration ล้มเหลว",
  intakeQueueId: undefined,
  idempotencyKey: "recovery-submit-001",
  occurredAt: NOW,
  location: { text: "หน้าตลาดเทศบาล" },
  ...overrides,
});

const failureIntegrations = () => ({
  OPENROUTER: async () => { throw new Error("provider token must never be persisted"); },
  EMBEDDING: async () => { throw new Error("embedding timeout"); },
  LINE_PUSH: async () => { throw new Error("LINE 503"); },
  MAP: async () => { throw new Error("map unavailable"); },
  REVERSE_GEOCODE: async () => { throw new Error("reverse geocode timeout"); },
});

describe("complaint recovery and degradation", () => {
  it("commits complaint/number/queue before all integration failures and deduplicates retry jobs", async () => {
    const repository = new InMemoryComplaintRepository({ prefixForTenant: () => "CCM", clock: () => NOW });
    const reconciliation = new RecoveryReconciliationJob(() => NOW);
    const service = new ComplaintRecoveryService({
      repository,
      defaultIntakeQueueForTenant: (tenantId) => tenantId === TENANT_A ? QUEUE_A : undefined,
      integrations: failureIntegrations(),
      reconciliation,
      clock: () => NOW,
      timeoutMs: 50,
    });
    const input = createInput();
    const result = await service.submit(input);
    expect(result).toMatchObject({ coreCommitted: true, intakeQueueId: QUEUE_A, idempotentReplay: false });
    expect(result.integrationStates).toHaveLength(5);
    expect(result.integrationStates.every((state) => state.status === "QUEUED")).toBe(true);
    expect(reconciliation.list(TENANT_A)).toHaveLength(5);
    const saved = service.getComplaint(TENANT_A, result.complaintId)!;
    expect(saved).toMatchObject({ canonicalStatus: "RECEIVED", intakeQueueId: QUEUE_A, complaintNo: result.complaintNo });
    expect(repository.listInternal(TENANT_A)).toHaveLength(1);
    const replay = await service.submit(input);
    expect(replay).toMatchObject({ complaintId: result.complaintId, complaintNo: result.complaintNo, idempotentReplay: true });
    expect(replay.integrationStates).toEqual(result.integrationStates);
    expect(reconciliation.list(TENANT_A)).toHaveLength(5);

    const assigned = repository.assign({
      tenantId: TENANT_A,
      complaintId: result.complaintId,
      expectedVersion: saved.rowVersion,
      departmentId: DEPARTMENT_A,
      actor: { type: "STAFF", role: "DEPARTMENT_HEAD", id: ACCOUNT_A },
      reason: "รับเรื่องเข้าคิวสำรองหลังระบบภายนอกขัดข้อง",
      idempotencyKey: "recovery-manual-assign-001",
      occurredAt: NOW,
    });
    expect(assigned.assignedDepartmentId).toBe(DEPARTMENT_A);
  });

  it("retries a failed LINE operation once without creating a duplicate job", async () => {
    const repository = new InMemoryComplaintRepository({ prefixForTenant: () => "CCM", clock: () => NOW });
    let attempts = 0;
    const reconciliation = new RecoveryReconciliationJob(() => NOW);
    const service = new ComplaintRecoveryService({
      repository,
      defaultIntakeQueueForTenant: () => QUEUE_A,
      integrations: { LINE_PUSH: async () => { attempts += 1; if (attempts === 1) throw new Error("LINE 503"); } },
      reconciliation,
      clock: () => NOW,
      timeoutMs: 50,
    });
    const result = await service.submit(createInput({ idempotencyKey: "recovery-line-001" }));
    const jobId = result.integrationStates[0]?.jobId;
    expect(jobId).toBeDefined();
    const run = await service.runReconciliationOnce("worker-line", NOW, 50);
    expect(run?.result).toMatchObject({ id: jobId, status: "SUCCEEDED", attemptCount: 1 });
    expect(reconciliation.list(TENANT_A)).toHaveLength(1);
    expect(attempts).toBe(2);
  });

  it("waits for an in-flight same-key submission instead of returning a partial integration result", async () => {
    const repository = new InMemoryComplaintRepository({ prefixForTenant: () => "CCM", clock: () => NOW });
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const service = new ComplaintRecoveryService({
      repository,
      defaultIntakeQueueForTenant: () => QUEUE_A,
      integrations: { OPENROUTER: async () => gate },
      clock: () => NOW,
      timeoutMs: 50,
    });
    const firstPromise = service.submit(createInput({ idempotencyKey: "recovery-concurrent-001" }));
    await Promise.resolve();
    const secondPromise = service.submit(createInput({ idempotencyKey: "recovery-concurrent-001" }));
    release!();
    const [first, second] = await Promise.all([firstPromise, secondPromise]);
    expect(first.idempotentReplay).toBe(false);
    expect(second).toMatchObject({ complaintId: first.complaintId, idempotentReplay: true });
    expect(second.integrationStates).toEqual(first.integrationStates);
    expect(repository.listInternal(TENANT_A)).toHaveLength(1);
  });

  it("reclaims an expired worker lease and prevents completion by the old worker", () => {
    const repository = new RecoveryReconciliationJob(() => NOW);
    const job = repository.enqueue({ tenantId: TENANT_A, complaintId: CATEGORY_A, integration: "MAP", dedupeKey: "map-lease-001", handler: async () => undefined });
    const claimed = repository.claim("worker-a", NOW, 1_000)[0]!;
    expect(claimed.id).toBe(job.id);
    const recovered = repository.reclaimExpired(new Date(NOW.getTime() + 2_000));
    expect(recovered[0]).toMatchObject({ id: job.id, status: "RETRY_WAIT", errorCode: "LEASE_EXPIRED" });
    expect(repository.heartbeat(job.id, "worker-a", new Date(NOW.getTime() + 2_000), 1_000)).toBe(false);
    const reclaimed = repository.claim("worker-b", new Date(NOW.getTime() + 2_000), 1_000)[0]!;
    expect(() => repository.complete(job.id, "worker-a", new Date(NOW.getTime() + 2_000))).toThrow();
    expect(repository.complete(job.id, "worker-b", new Date(NOW.getTime() + 2_000))).toMatchObject({ status: "SUCCEEDED", attemptCount: 2 });
    expect(reclaimed.id).toBe(job.id);
  });

  it("returns canonical HANDOFF/SYSTEM_ERROR when AI times out and preserves safe fallback semantics", async () => {
    const answer = await runChatWithHandoff(async () => "grounded answer", 50);
    expect(answer).toEqual({ outcome: "ANSWER", value: "grounded answer" });
    const handoff = await runChatWithHandoff(async () => new Promise<string>(() => undefined), 5);
    expect(handoff).toMatchObject({ outcome: "HANDOFF", reasonCode: "SYSTEM_ERROR" });
    expect(JSON.stringify(handoff)).not.toContain("token");
  });
});
