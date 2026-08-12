import { describe, expect, it } from "vitest";

import {
  COMPLAINT_STATES,
  ComplaintDomainError,
  InMemoryComplaintRepository,
  isAllowedComplaintTransition,
  type ComplaintActorRole,
  type ComplaintCreateInput,
  type ComplaintState,
} from "./complaint";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const CATEGORY_A = "33333333-3333-4333-8333-333333333333";
const QUEUE_A = "44444444-4444-4444-8444-444444444444";
const DEPARTMENT_A = "55555555-5555-4555-8555-555555555555";
const MEMBERSHIP_A = "66666666-6666-4666-8666-666666666666";
const LINE_USER_A = "U11111111111111111111111111111111";
const LINE_USER_B = "U22222222222222222222222222222222";
const NOW = new Date("2026-08-10T00:00:00.000Z");

const input = (overrides: Partial<ComplaintCreateInput> = {}): ComplaintCreateInput => ({
  tenantId: TENANT_A,
  lineUserId: LINE_USER_A,
  categoryId: CATEGORY_A,
  title: "ถนนชำรุด",
  description: "พบถนนชำรุดบริเวณหน้าชุมชน ต้องการให้ตรวจสอบ",
  intakeQueueId: QUEUE_A,
  idempotencyKey: "complaint-1",
  occurredAt: NOW,
  ...overrides,
});

const errorCode = (callback: () => unknown): string => {
  try {
    callback();
  } catch (error) {
    if (error instanceof ComplaintDomainError) return error.code;
    throw error;
  }
  throw new Error("expected callback to throw");
};

describe("complaint schema contract and state machine", () => {
  it("allocates configurable Buddhist-year complaint numbers across a Bangkok year boundary", () => {
    const repository = new InMemoryComplaintRepository({ prefixForTenant: () => "CITY" });
    const beforeBoundary = repository.create(input({ idempotencyKey: "boundary-1", occurredAt: new Date("2026-12-31T16:59:59.000Z") }));
    const afterBoundary = repository.create(input({ idempotencyKey: "boundary-2", occurredAt: new Date("2026-12-31T17:00:00.000Z") }));
    expect(beforeBoundary.record.complaintNo).toBe("CITY-2569-000001");
    expect(afterBoundary.record.complaintNo).toBe("CITY-2570-000002");
    expect(afterBoundary.record.complaintYear).toBe(2570);
  });

  it("keeps 1,000 concurrent-style creates unique and emits one initial outbox per complaint", () => {
    const repository = new InMemoryComplaintRepository({ clock: () => NOW });
    const numbers = new Set<string>();
    for (let index = 0; index < 1000; index += 1) {
      const created = repository.create(input({ idempotencyKey: `bulk-${String(index).padStart(5, "0")}`, title: `แจ้งเหตุ ${index}` }));
      numbers.add(created.record.complaintNo);
    }
    expect(numbers).toHaveLength(1000);
    expect(repository.listInternal(TENANT_A)).toHaveLength(1000);
    expect(repository.listOutbox(TENANT_A)).toHaveLength(1000);
  });

  it("is idempotent and rejects a changed request under the same key", () => {
    const repository = new InMemoryComplaintRepository();
    const first = repository.create(input());
    const replay = repository.create(input());
    expect(replay).toMatchObject({ idempotentReplay: true, record: { id: first.record.id, complaintNo: first.record.complaintNo } });
    expect(errorCode(() => repository.create(input({ title: "ข้อมูลเปลี่ยนแล้ว" })))).toBe("IDEMPOTENCY_CONFLICT");
    expect(repository.listInternal(TENANT_A)).toHaveLength(1);
  });

  it("replays a request when only the server-generated timestamp changes", () => {
    let tick = 0;
    const repository = new InMemoryComplaintRepository({ clock: () => new Date(NOW.getTime() + tick++ * 1_000) });
    const first = repository.create(input({ idempotencyKey: "clock-replay", occurredAt: undefined }));
    const replay = repository.create(input({ idempotencyKey: "clock-replay", occurredAt: undefined }));
    expect(first.idempotentReplay).toBe(false);
    expect(replay).toMatchObject({ idempotentReplay: true, record: { id: first.record.id } });
  });

  it("covers every canonical transition and rejects every unspecified edge", () => {
    const expected: ReadonlyArray<readonly [ComplaintState, ComplaintState, ComplaintActorRole]> = [
      ["RECEIVED", "UNDER_REVIEW", "STAFF"],
      ["RECEIVED", "UNDER_REVIEW", "DEPARTMENT_HEAD"],
      ["RECEIVED", "UNDER_REVIEW", "TENANT_ADMIN"],
      ["RECEIVED", "UNDER_REVIEW", "SUPER_ADMIN"],
      ["RECEIVED", "ASSIGNED", "DEPARTMENT_HEAD"],
      ["RECEIVED", "ASSIGNED", "TENANT_ADMIN"],
      ["RECEIVED", "ASSIGNED", "SUPER_ADMIN"],
      ["RECEIVED", "OUT_OF_JURISDICTION", "DEPARTMENT_HEAD"],
      ["RECEIVED", "OUT_OF_JURISDICTION", "TENANT_ADMIN"],
      ["RECEIVED", "OUT_OF_JURISDICTION", "SUPER_ADMIN"],
      ["RECEIVED", "CANCELLED", "CITIZEN"],
      ["RECEIVED", "CANCELLED", "TENANT_ADMIN"],
      ["RECEIVED", "CANCELLED", "SUPER_ADMIN"],
      ["UNDER_REVIEW", "ASSIGNED", "DEPARTMENT_HEAD"],
      ["UNDER_REVIEW", "ASSIGNED", "TENANT_ADMIN"],
      ["UNDER_REVIEW", "ASSIGNED", "SUPER_ADMIN"],
      ["UNDER_REVIEW", "OUT_OF_JURISDICTION", "DEPARTMENT_HEAD"],
      ["UNDER_REVIEW", "OUT_OF_JURISDICTION", "TENANT_ADMIN"],
      ["UNDER_REVIEW", "OUT_OF_JURISDICTION", "SUPER_ADMIN"],
      ["UNDER_REVIEW", "CANCELLED", "TENANT_ADMIN"],
      ["UNDER_REVIEW", "CANCELLED", "SUPER_ADMIN"],
      ["ASSIGNED", "IN_PROGRESS", "STAFF"],
      ["ASSIGNED", "IN_PROGRESS", "DEPARTMENT_HEAD"],
      ["ASSIGNED", "IN_PROGRESS", "TENANT_ADMIN"],
      ["ASSIGNED", "IN_PROGRESS", "SUPER_ADMIN"],
      ["ASSIGNED", "OUT_OF_JURISDICTION", "DEPARTMENT_HEAD"],
      ["ASSIGNED", "OUT_OF_JURISDICTION", "TENANT_ADMIN"],
      ["ASSIGNED", "OUT_OF_JURISDICTION", "SUPER_ADMIN"],
      ["IN_PROGRESS", "WAITING_FOR_CITIZEN", "STAFF"],
      ["IN_PROGRESS", "WAITING_FOR_CITIZEN", "DEPARTMENT_HEAD"],
      ["IN_PROGRESS", "WAITING_FOR_CITIZEN", "TENANT_ADMIN"],
      ["IN_PROGRESS", "WAITING_FOR_CITIZEN", "SUPER_ADMIN"],
      ["IN_PROGRESS", "RESOLVED", "STAFF"],
      ["IN_PROGRESS", "RESOLVED", "DEPARTMENT_HEAD"],
      ["IN_PROGRESS", "RESOLVED", "TENANT_ADMIN"],
      ["IN_PROGRESS", "RESOLVED", "SUPER_ADMIN"],
      ["IN_PROGRESS", "OUT_OF_JURISDICTION", "DEPARTMENT_HEAD"],
      ["IN_PROGRESS", "OUT_OF_JURISDICTION", "TENANT_ADMIN"],
      ["IN_PROGRESS", "OUT_OF_JURISDICTION", "SUPER_ADMIN"],
      ["WAITING_FOR_CITIZEN", "IN_PROGRESS", "CITIZEN"],
      ["WAITING_FOR_CITIZEN", "IN_PROGRESS", "STAFF"],
      ["WAITING_FOR_CITIZEN", "IN_PROGRESS", "DEPARTMENT_HEAD"],
      ["WAITING_FOR_CITIZEN", "IN_PROGRESS", "TENANT_ADMIN"],
      ["WAITING_FOR_CITIZEN", "IN_PROGRESS", "SUPER_ADMIN"],
      ["WAITING_FOR_CITIZEN", "IN_PROGRESS", "SYSTEM"],
      ["RESOLVED", "CLOSED", "DEPARTMENT_HEAD"],
      ["RESOLVED", "CLOSED", "TENANT_ADMIN"],
      ["RESOLVED", "CLOSED", "SUPER_ADMIN"],
      ["RESOLVED", "CLOSED", "SYSTEM"],
      ["RESOLVED", "IN_PROGRESS", "DEPARTMENT_HEAD"],
      ["RESOLVED", "IN_PROGRESS", "TENANT_ADMIN"],
      ["RESOLVED", "IN_PROGRESS", "SUPER_ADMIN"],
      ["CLOSED", "IN_PROGRESS", "DEPARTMENT_HEAD"],
      ["CLOSED", "IN_PROGRESS", "TENANT_ADMIN"],
      ["CLOSED", "IN_PROGRESS", "SUPER_ADMIN"],
    ];
    const roles: readonly ComplaintActorRole[] = ["CITIZEN", "STAFF", "DEPARTMENT_HEAD", "TENANT_ADMIN", "SYSTEM", "SUPER_ADMIN"];
    const key = (from: ComplaintState, to: ComplaintState, role: ComplaintActorRole): string => `${from}:${to}:${role}`;
    const allowed = new Set(expected.map(([from, to, role]) => key(from, to, role)));
    for (const [from, to, role] of expected) expect(isAllowedComplaintTransition(from, to, role)).toBe(true);
    for (const from of COMPLAINT_STATES) {
      for (const to of COMPLAINT_STATES) {
        for (const role of roles) {
          expect(isAllowedComplaintTransition(from, to, role)).toBe(allowed.has(key(from, to, role)));
        }
      }
    }
  });

  it("validates category uncertainty, location pairs and bounded fields before allocation", () => {
    const repository = new InMemoryComplaintRepository();
    expect(errorCode(() => repository.create(input({ categoryId: undefined })))).toBe("VALIDATION_ERROR");
    expect(errorCode(() => repository.create(input({ categoryId: CATEGORY_A, categoryUncertain: true, idempotencyKey: "bad-xor-1" })))).toBe("VALIDATION_ERROR");
    expect(errorCode(() => repository.create(input({ location: { latitude: 13.7 }, idempotencyKey: "bad-location" })))).toBe("VALIDATION_ERROR");
    expect(errorCode(() => repository.create(input({ location: { latitude: 91, longitude: 100 }, idempotencyKey: "bad-range" })))).toBe("VALIDATION_ERROR");
    expect(errorCode(() => repository.create(input({ title: "\u0000", idempotencyKey: "bad-control" })))).toBe("VALIDATION_ERROR");
  });

  it("creates RECEIVED truth, immutable initial timeline and a redacted public projection", () => {
    const repository = new InMemoryComplaintRepository();
    const created = repository.create(input({ citizenName: "Synthetic Citizen", citizenPhoneEncrypted: "encrypted-phone-value-1234" }));
    const internal = repository.getInternalView(TENANT_A, created.record.id)!;
    const publicView = repository.getPublicView(TENANT_A, LINE_USER_A, created.record.id)!;
    expect(created.record.canonicalStatus).toBe("RECEIVED");
    expect(internal.timeline).toMatchObject([{ fromStatus: null, toStatus: "RECEIVED", publicVisible: true }]);
    expect(repository.listOutbox(TENANT_A)[0]).toMatchObject({ eventType: "complaint.created", aggregateId: created.record.id, payload: { complaintNo: created.record.complaintNo } });
    expect(publicView).not.toHaveProperty("description");
    expect(publicView).not.toHaveProperty("lineUserId");
    expect(JSON.stringify(publicView)).not.toContain("encrypted-phone-value-1234");
  });

  it("allows the canonical happy-path transitions with required side-effect fields", () => {
    const repository = new InMemoryComplaintRepository();
    let record = repository.create(input()).record;
    record = repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "UNDER_REVIEW", expectedVersion: record.rowVersion, actor: { type: "STAFF", role: "STAFF", id: "staff-a" }, occurredAt: NOW });
    expect(record.firstResponseAt).toBe(NOW.toISOString());
    record = repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "ASSIGNED", expectedVersion: record.rowVersion, actor: { type: "STAFF", role: "DEPARTMENT_HEAD", id: "head-a" }, assignedDepartmentId: DEPARTMENT_A, assignedMembershipId: MEMBERSHIP_A, reason: "ส่งต่อหน่วยงาน", occurredAt: NOW });
    record = repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "IN_PROGRESS", expectedVersion: record.rowVersion, actor: { type: "STAFF", role: "STAFF", id: "staff-a" }, occurredAt: NOW });
    record = repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "WAITING_FOR_CITIZEN", expectedVersion: record.rowVersion, actor: { type: "STAFF", role: "STAFF", id: "staff-a" }, publicRequest: "กรุณาส่งรูปเพิ่มเติม", occurredAt: NOW });
    record = repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "IN_PROGRESS", expectedVersion: record.rowVersion, actor: { type: "CITIZEN", role: "CITIZEN", id: LINE_USER_A }, occurredAt: NOW });
    record = repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "RESOLVED", expectedVersion: record.rowVersion, actor: { type: "STAFF", role: "STAFF", id: "staff-a" }, resolutionSummary: "แก้ไขเรียบร้อย", occurredAt: NOW });
    record = repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "CLOSED", expectedVersion: record.rowVersion, actor: { type: "SYSTEM", role: "SYSTEM" }, occurredAt: NOW });
    expect(record).toMatchObject({ canonicalStatus: "CLOSED", resolvedAt: NOW.toISOString(), closedAt: NOW.toISOString(), rowVersion: 8 });
  });

  it("rejects forbidden transitions, missing requirements and stale versions", () => {
    const repository = new InMemoryComplaintRepository();
    const created = repository.create(input()).record;
    expect(errorCode(() => repository.transition({ tenantId: TENANT_A, complaintId: created.id, toStatus: "CLOSED", expectedVersion: 1, actor: { type: "STAFF", role: "STAFF" } }))).toBe("INVALID_STATE_TRANSITION");
    expect(errorCode(() => repository.transition({ tenantId: TENANT_A, complaintId: created.id, toStatus: "ASSIGNED", expectedVersion: 1, actor: { type: "STAFF", role: "STAFF" } }))).toBe("INVALID_STATE_TRANSITION");
    expect(errorCode(() => repository.transition({ tenantId: TENANT_A, complaintId: created.id, toStatus: "UNDER_REVIEW", expectedVersion: 99, actor: { type: "STAFF", role: "STAFF" } }))).toBe("VERSION_CONFLICT");
    expect(errorCode(() => repository.transition({ tenantId: TENANT_A, complaintId: created.id, toStatus: "CANCELLED", expectedVersion: 1, actor: { type: "CITIZEN", role: "CITIZEN", id: LINE_USER_B }, reason: "ยกเลิก" }))).toBe("FORBIDDEN");
    const reviewed = repository.transition({ tenantId: TENANT_A, complaintId: created.id, toStatus: "UNDER_REVIEW", expectedVersion: 1, actor: { type: "STAFF", role: "STAFF" } });
    expect(errorCode(() => repository.transition({ tenantId: TENANT_A, complaintId: created.id, toStatus: "ASSIGNED", expectedVersion: reviewed.rowVersion, actor: { type: "STAFF", role: "DEPARTMENT_HEAD" } }))).toBe("VALIDATION_ERROR");
  });

  it("does not leave a partial record after a transaction failure and never reuses the reserved number", () => {
    const repository = new InMemoryComplaintRepository({ prefixForTenant: () => "ROLL" });
    repository.failNextTransaction();
    expect(errorCode(() => repository.create(input({ idempotencyKey: "rollback-1" })))).toBe("PROCESSING_FAILED");
    expect(repository.listInternal(TENANT_A)).toHaveLength(0);
    const retry = repository.create(input({ idempotencyKey: "rollback-2" }));
    expect(retry.record.complaintNo).toBe("ROLL-2569-000002");
  });

  it("enforces tenant isolation and keeps internal comments out of the citizen view", () => {
    const repository = new InMemoryComplaintRepository();
    const a = repository.create(input()).record;
    const b = repository.create(input({ tenantId: TENANT_B, lineUserId: LINE_USER_B, categoryId: "77777777-7777-4777-8777-777777777777", intakeQueueId: "88888888-8888-4888-8888-888888888888", idempotencyKey: "tenant-b-1" })).record;
    expect(repository.get(TENANT_B, a.id)).toBeUndefined();
    expect(repository.getPublicView(TENANT_A, LINE_USER_A, b.id)).toBeUndefined();
    const internal = repository.addComment({ tenantId: TENANT_A, complaintId: a.id, expectedVersion: a.rowVersion, author: { type: "STAFF", role: "STAFF", id: "staff-a" }, body: "บันทึกภายใน", visibility: "INTERNAL" });
    expect(internal.visibility).toBe("INTERNAL");
    const publicComment = repository.addComment({ tenantId: TENANT_A, complaintId: a.id, expectedVersion: a.rowVersion + 1, author: { type: "CITIZEN", role: "CITIZEN", id: LINE_USER_A }, body: "ข้อมูลเพิ่มเติม", visibility: "PUBLIC" });
    expect(publicComment.visibility).toBe("PUBLIC");
    const publicView = repository.getPublicView(TENANT_A, LINE_USER_A, a.id)!;
    expect(publicView.publicComments).toHaveLength(1);
    expect(publicView.publicComments[0]?.body).toBe("ข้อมูลเพิ่มเติม");
    expect(repository.getInternalView(TENANT_A, a.id)?.comments).toHaveLength(2);
  });

  it("paginates the citizen list and applies active/closed filters without cross-tenant records", () => {
    const repository = new InMemoryComplaintRepository({ clock: () => NOW });
    const first = repository.create(input({ idempotencyKey: "list-001", title: "first" })).record;
    const second = repository.create(input({ idempotencyKey: "list-002", title: "second" })).record;
    const third = repository.create(input({ idempotencyKey: "list-003", title: "third" })).record;
    let closed = repository.transition({ tenantId: TENANT_A, complaintId: third.id, toStatus: "UNDER_REVIEW", expectedVersion: third.rowVersion, actor: { type: "STAFF", role: "STAFF" }, occurredAt: NOW });
    closed = repository.transition({ tenantId: TENANT_A, complaintId: third.id, toStatus: "ASSIGNED", expectedVersion: closed.rowVersion, actor: { type: "STAFF", role: "DEPARTMENT_HEAD" }, assignedDepartmentId: DEPARTMENT_A, occurredAt: NOW });
    closed = repository.transition({ tenantId: TENANT_A, complaintId: third.id, toStatus: "IN_PROGRESS", expectedVersion: closed.rowVersion, actor: { type: "STAFF", role: "STAFF" }, occurredAt: NOW });
    closed = repository.transition({ tenantId: TENANT_A, complaintId: third.id, toStatus: "RESOLVED", expectedVersion: closed.rowVersion, actor: { type: "STAFF", role: "STAFF" }, resolutionSummary: "fixed", occurredAt: NOW });
    repository.transition({ tenantId: TENANT_A, complaintId: third.id, toStatus: "CLOSED", expectedVersion: closed.rowVersion, actor: { type: "SYSTEM", role: "SYSTEM" }, occurredAt: NOW });
    const page = repository.listPublicPage(TENANT_A, LINE_USER_A, { limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe("2");
    expect(page.items.map((item) => item.id)).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(repository.listPublicPage(TENANT_A, LINE_USER_A, { status: "CLOSED" }).items.map((item) => item.id)).toEqual([third.id]);
    expect(repository.listPublicPage(TENANT_A, LINE_USER_A, { status: "ACTIVE" }).items.map((item) => item.id)).not.toContain(third.id);
    expect(repository.listPublicPage(TENANT_B, LINE_USER_B).items).toHaveLength(0);
  });

  it("moves a waiting complaint back to progress when citizen sends additional information exactly once", () => {
    const repository = new InMemoryComplaintRepository({ clock: () => NOW });
    let record = repository.create(input({ idempotencyKey: "more-info-1" })).record;
    record = repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "UNDER_REVIEW", expectedVersion: record.rowVersion, actor: { type: "STAFF", role: "STAFF" }, occurredAt: NOW });
    record = repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "ASSIGNED", expectedVersion: record.rowVersion, actor: { type: "STAFF", role: "DEPARTMENT_HEAD" }, assignedDepartmentId: DEPARTMENT_A, occurredAt: NOW });
    record = repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "IN_PROGRESS", expectedVersion: record.rowVersion, actor: { type: "STAFF", role: "STAFF" }, occurredAt: NOW });
    record = repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "WAITING_FOR_CITIZEN", expectedVersion: record.rowVersion, actor: { type: "STAFF", role: "STAFF" }, publicRequest: "กรุณาส่งรูปเพิ่มเติม", occurredAt: NOW });
    expect(record.canonicalStatus).toBe("WAITING_FOR_CITIZEN");
    expect(repository.get(TENANT_A, record.id)?.canonicalStatus).toBe("WAITING_FOR_CITIZEN");
    const sent = repository.addCitizenInformation({ tenantId: TENANT_A, lineUserId: LINE_USER_A, complaintId: record.id, expectedVersion: record.rowVersion, body: "ส่งรูปบริเวณหน้าร้านให้แล้ว", idempotencyKey: "message-retry-1", occurredAt: NOW });
    expect(sent.view.canonicalStatus).toBe("IN_PROGRESS");
    expect(sent.view.publicComments).toHaveLength(1);
    expect(sent.view.requestForInformation).toBeUndefined();
    const replay = repository.addCitizenInformation({ tenantId: TENANT_A, lineUserId: LINE_USER_A, complaintId: record.id, expectedVersion: record.rowVersion, body: "ส่งรูปบริเวณหน้าร้านให้แล้ว", idempotencyKey: "message-retry-1", occurredAt: NOW });
    expect(replay.idempotentReplay).toBe(true);
    expect(repository.listOutbox(TENANT_A).filter((event) => event.eventType === "complaint.status_changed")).toHaveLength(5);
    expect(errorCode(() => repository.addCitizenInformation({ tenantId: TENANT_A, lineUserId: LINE_USER_A, complaintId: record.id, expectedVersion: record.rowVersion, body: "changed", idempotencyKey: "message-retry-1", occurredAt: NOW }))).toBe("IDEMPOTENCY_CONFLICT");
    expect(errorCode(() => repository.addCitizenInformation({ tenantId: TENANT_A, lineUserId: LINE_USER_B, complaintId: record.id, expectedVersion: record.rowVersion, body: "other citizen", idempotencyKey: "message-other", occurredAt: NOW }))).toBe("FORBIDDEN");
  });

  it("allows one eligible survey and supports a safe idempotent replay", () => {
    const repository = new InMemoryComplaintRepository({ clock: () => NOW });
    let record = repository.create(input({ idempotencyKey: "survey-1" })).record;
    record = repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "UNDER_REVIEW", expectedVersion: record.rowVersion, actor: { type: "STAFF", role: "STAFF" }, occurredAt: NOW });
    record = repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "ASSIGNED", expectedVersion: record.rowVersion, actor: { type: "STAFF", role: "DEPARTMENT_HEAD" }, assignedDepartmentId: DEPARTMENT_A, occurredAt: NOW });
    record = repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "IN_PROGRESS", expectedVersion: record.rowVersion, actor: { type: "STAFF", role: "STAFF" }, occurredAt: NOW });
    record = repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "RESOLVED", expectedVersion: record.rowVersion, actor: { type: "STAFF", role: "STAFF" }, resolutionSummary: "fixed", occurredAt: NOW });
    repository.transition({ tenantId: TENANT_A, complaintId: record.id, toStatus: "CLOSED", expectedVersion: record.rowVersion, actor: { type: "SYSTEM", role: "SYSTEM" }, occurredAt: NOW });
    const submitted = repository.submitSurvey({ tenantId: TENANT_A, lineUserId: LINE_USER_A, complaintId: record.id, rating: 5, comment: "บริการดี", idempotencyKey: "survey-retry-1", occurredAt: NOW });
    expect(submitted.survey.rating).toBe(5);
    expect(repository.getPublicView(TENANT_A, LINE_USER_A, record.id)?.survey).toEqual({ eligible: true, submitted: true });
    const replay = repository.submitSurvey({ tenantId: TENANT_A, lineUserId: LINE_USER_A, complaintId: record.id, rating: 5, comment: "บริการดี", idempotencyKey: "survey-retry-1", occurredAt: NOW });
    expect(replay.idempotentReplay).toBe(true);
    expect(errorCode(() => repository.submitSurvey({ tenantId: TENANT_A, lineUserId: LINE_USER_A, complaintId: record.id, rating: 4, idempotencyKey: "survey-second", occurredAt: NOW }))).toBe("CONFLICT");
    expect(errorCode(() => repository.submitSurvey({ tenantId: TENANT_A, lineUserId: LINE_USER_A, complaintId: record.id, rating: 6, idempotencyKey: "survey-bad", occurredAt: NOW }))).toBe("VALIDATION_ERROR");
  });

  it("keeps the citizen tracking projection on a public allowlist", () => {
    const repository = new InMemoryComplaintRepository({
      departmentPublicNameForId: (departmentId) => departmentId === DEPARTMENT_A ? "กองช่าง" : undefined,
    });
    const created = repository.create(input({
      idempotencyKey: "public-allowlist-1",
      location: { text: "หน้าตลาด", latitude: 13.7563, longitude: 100.5018 },
      assignedDepartmentId: DEPARTMENT_A,
      attachments: [
        { fileName: "ready.jpg", contentType: "image/jpeg", byteLength: 100, state: "READY", publicUrl: "https://cdn.example.test/ready.jpg" },
        { fileName: "pending.jpg", contentType: "image/jpeg", byteLength: 100, state: "QUARANTINED" },
      ],
      citizenPhoneEncrypted: "encrypted-phone-value-1234",
    })).record;
    const view = repository.getPublicView(TENANT_A, LINE_USER_A, created.id)!;
    expect(view.publicAttachments).toHaveLength(1);
    expect(view.publicAttachments[0]).toMatchObject({ fileName: "ready.jpg", publicUrl: "https://cdn.example.test/ready.jpg" });
    expect(view).toMatchObject({ statusLabel: "รับเรื่องแล้ว", departmentPublicName: "กองช่าง", nextExpectedStep: expect.any(String) });
    expect(JSON.stringify(view)).not.toContain("tenantId");
    expect(JSON.stringify(view)).not.toContain("lineUserId");
    expect(JSON.stringify(view)).not.toContain("description");
    expect(JSON.stringify(view)).not.toContain("encrypted-phone-value-1234");
    expect(JSON.stringify(view)).not.toContain("pending.jpg");
    expect(Object.keys(view)).not.toContain("actorId");
  });
});
