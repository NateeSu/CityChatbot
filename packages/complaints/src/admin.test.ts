import { describe, expect, it } from "vitest";

import { ComplaintDomainError, InMemoryComplaintRepository, addAdminComplaintComment, assignAdminComplaint, buildAdminComplaintPage, getAdminComplaintDetail, transitionAdminComplaint, type ComplaintAdminContext, type ComplaintCreateInput } from "./index";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const QUEUE_A = "44444444-4444-4444-8444-444444444444";
const DEPARTMENT_A = "55555555-5555-4555-8555-555555555555";
const DEPARTMENT_B = "77777777-7777-4777-8777-777777777777";
const ACCOUNT_STAFF = "66666666-6666-4666-8666-666666666666";
const ACCOUNT_OTHER = "88888888-8888-4888-8888-888888888888";
const NOW = new Date("2026-08-10T00:00:00.000Z");

const input = (overrides: Partial<ComplaintCreateInput> = {}): ComplaintCreateInput => ({
  tenantId: TENANT_A,
  lineUserId: "U11111111111111111111111111111111",
  categoryId: "33333333-3333-4333-8333-333333333333",
  title: "ถนนชำรุดหน้าชุมชน",
  description: "รายละเอียดภายในที่ไม่ควรอยู่ใน list projection",
  intakeQueueId: QUEUE_A,
  idempotencyKey: "admin-fixture-001",
  occurredAt: NOW,
  ...overrides,
});

const context = (overrides: Partial<ComplaintAdminContext> = {}): ComplaintAdminContext => ({
  tenantId: TENANT_A,
  accountId: ACCOUNT_STAFF,
  role: "STAFF",
  departmentIds: [DEPARTMENT_A],
  ...overrides,
});

describe("admin complaint list contract", () => {
  it("enforces tenant and department scope before filters or facets", () => {
    const repository = new InMemoryComplaintRepository();
    repository.create(input({ idempotencyKey: "admin-a-001", title: "ไฟฟ้าดับ", assignedDepartmentId: DEPARTMENT_A, assignedMembershipId: ACCOUNT_STAFF, priority: "URGENT" }));
    repository.create(input({ idempotencyKey: "admin-a-002", title: "น้ำท่วม", assignedDepartmentId: DEPARTMENT_B, assignedMembershipId: ACCOUNT_OTHER, priority: "HIGH" }));
    repository.create(input({ tenantId: TENANT_B, idempotencyKey: "admin-b-001", title: "ข้อมูลต่าง tenant", assignedDepartmentId: DEPARTMENT_A, assignedMembershipId: ACCOUNT_STAFF }));
    const result = buildAdminComplaintPage(repository.listInternal(TENANT_A), context(), {});
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ title: "ไฟฟ้าดับ", priority: "URGENT", assignedToCurrentUser: true });
    expect(result.facets).toEqual({ total: 1, active: 1, closed: 0, urgent: 1 });
  });

  it("supports tenant admin, department and personal queues with stable cursor pagination", () => {
    const repository = new InMemoryComplaintRepository();
    repository.create(input({ idempotencyKey: "admin-page-001", title: "one", assignedDepartmentId: DEPARTMENT_A, assignedMembershipId: ACCOUNT_STAFF }));
    repository.create(input({ idempotencyKey: "admin-page-002", title: "two", assignedDepartmentId: DEPARTMENT_A, assignedMembershipId: ACCOUNT_OTHER }));
    repository.create(input({ idempotencyKey: "admin-page-003", title: "three", assignedDepartmentId: DEPARTMENT_B, assignedMembershipId: ACCOUNT_OTHER }));
    repository.create(input({ idempotencyKey: "admin-page-004", title: "unassigned", assignedDepartmentId: undefined, assignedMembershipId: undefined }));
    const staff = buildAdminComplaintPage(repository.listInternal(TENANT_A), context(), { limit: 1 });
    expect(staff.items).toHaveLength(1);
    expect(staff.hasMore).toBe(true);
    expect(staff.nextCursor).toBe("1");
    const mine = buildAdminComplaintPage(repository.listInternal(TENANT_A), context(), { queue: "MINE" });
    expect(mine.items).toHaveLength(1);
    const admin = buildAdminComplaintPage(repository.listInternal(TENANT_A), context({ role: "TENANT_ADMIN", departmentIds: [] }), { queue: "TENANT", limit: 10 });
    expect(admin.items).toHaveLength(4);
    expect(admin.facets.total).toBe(4);
  });

  it("keeps filter parity and rejects unsafe or unauthorized filter requests", () => {
    const repository = new InMemoryComplaintRepository();
    repository.create(input({ idempotencyKey: "admin-filter-001", title: "ขยะหน้าตลาด", priority: "HIGH", assignedDepartmentId: DEPARTMENT_A }));
    repository.create(input({ idempotencyKey: "admin-filter-002", title: "ถนนชำรุด", priority: "LOW", assignedDepartmentId: DEPARTMENT_A }));
    const filtered = buildAdminComplaintPage(repository.listInternal(TENANT_A), context(), { search: "ขยะ", priority: "HIGH", departmentId: DEPARTMENT_A });
    expect(filtered.items).toHaveLength(1);
    expect(filtered.items[0]?.title).toBe("ขยะหน้าตลาด");
    expect(() => buildAdminComplaintPage(repository.listInternal(TENANT_A), context(), { queue: "TENANT" })).toThrowError(ComplaintDomainError);
    expect(() => buildAdminComplaintPage(repository.listInternal(TENANT_A), context(), { limit: 101 })).toThrowError(ComplaintDomainError);
    expect(buildAdminComplaintPage(repository.listInternal(TENANT_A), context(), { departmentId: DEPARTMENT_B }).items).toHaveLength(0);
  });

  it("returns a staff-safe projection without citizen or internal note fields", () => {
    const repository = new InMemoryComplaintRepository();
    repository.create(input({ idempotencyKey: "admin-privacy-001", citizenPhoneEncrypted: "encrypted-phone-value-1234", assignedDepartmentId: DEPARTMENT_A }));
    const item = buildAdminComplaintPage(repository.listInternal(TENANT_A), context(), {}, { departmentNameForId: () => "กองช่าง" }).items[0]!;
    expect(item).toMatchObject({ departmentName: "กองช่าง", sla: { state: "NOT_CONFIGURED" } });
    expect(item).not.toHaveProperty("description");
    expect(item).not.toHaveProperty("lineUserId");
    expect(item).not.toHaveProperty("citizenPhoneEncrypted");
    expect(JSON.stringify(item)).not.toContain("encrypted-phone-value-1234");
  });

  it("returns an A-25 detail projection with attachments, timeline and audit without identity PII", () => {
    const repository = new InMemoryComplaintRepository();
    const created = repository.create(input({
      idempotencyKey: "admin-detail-001",
      description: "รายละเอียดที่เจ้าหน้าที่ต้องใช้",
      citizenPhoneEncrypted: "encrypted-phone-value-1234",
      location: { text: "หน้าตลาด", latitude: 13.7, longitude: 100.5 },
      assignedDepartmentId: DEPARTMENT_A,
      attachments: [
        { fileName: "ready.jpg", contentType: "image/jpeg", byteLength: 100, state: "READY", publicUrl: "https://cdn.example.test/ready.jpg" },
        { fileName: "pending.jpg", contentType: "image/jpeg", byteLength: 100, state: "QUARANTINED" },
      ],
    })).record;
    const detail = getAdminComplaintDetail(repository, context({ role: "TENANT_ADMIN", departmentIds: [] }), created.id, { departmentNameForId: () => "กองช่าง" });
    expect(detail).toMatchObject({ complaintNo: created.complaintNo, description: "รายละเอียดที่เจ้าหน้าที่ต้องใช้", departmentName: "กองช่าง", rowVersion: 1, permissions: { canAssign: true } });
    expect(detail.attachments).toHaveLength(2);
    expect(detail.attachments[0]).toMatchObject({ state: "READY", publicUrl: "https://cdn.example.test/ready.jpg" });
    expect(detail.attachments[1]).toMatchObject({ state: "QUARANTINED" });
    expect(JSON.stringify(detail)).not.toContain("lineUserId");
    expect(JSON.stringify(detail)).not.toContain("encrypted-phone-value-1234");
    expect(detail.auditTrail).toHaveLength(1);
  });

  it("audits admin mutations, makes private notes silent and publishes only public-update outbox events", () => {
    const repository = new InMemoryComplaintRepository();
    const staffContext = context({ role: "DEPARTMENT_HEAD", departmentIds: [DEPARTMENT_A] });
    const created = repository.create(input({ idempotencyKey: "admin-mutation-001", assignedDepartmentId: DEPARTMENT_A })).record;
    const assignment = { tenantId: TENANT_A, complaintId: created.id, expectedVersion: 1, departmentId: DEPARTMENT_A, membershipId: ACCOUNT_STAFF, actor: { type: "STAFF" as const, role: "DEPARTMENT_HEAD" as const, id: ACCOUNT_STAFF }, reason: "หัวหน้ามอบหมายงาน", idempotencyKey: "assign-retry-001" };
    const assigned = assignAdminComplaint(repository, staffContext, assignment);
    expect(assigned.rowVersion).toBe(2);
    expect(assignAdminComplaint(repository, staffContext, assignment).rowVersion).toBe(2);
    const privateNote = addAdminComplaintComment(repository, staffContext, { tenantId: TENANT_A, complaintId: created.id, expectedVersion: 2, author: { type: "STAFF", role: "DEPARTMENT_HEAD", id: ACCOUNT_STAFF }, body: "ตรวจสอบกับหน่วยงานแล้ว", visibility: "INTERNAL", idempotencyKey: "note-retry-001" });
    expect(privateNote.visibility).toBe("INTERNAL");
    expect(repository.listOutbox(TENANT_A).filter((event) => event.eventType === "complaint.public_update_added")).toHaveLength(0);
    const publicUpdate = addAdminComplaintComment(repository, staffContext, { tenantId: TENANT_A, complaintId: created.id, expectedVersion: 3, author: { type: "STAFF", role: "DEPARTMENT_HEAD", id: ACCOUNT_STAFF }, body: "เจ้าหน้าที่กำลังดำเนินการตรวจสอบให้คุณ", visibility: "PUBLIC", idempotencyKey: "public-retry-001" });
    expect(publicUpdate.visibility).toBe("PUBLIC");
    expect(repository.listOutbox(TENANT_A).filter((event) => event.eventType === "complaint.public_update_added")).toHaveLength(1);
    expect(addAdminComplaintComment(repository, staffContext, { tenantId: TENANT_A, complaintId: created.id, expectedVersion: 3, author: { type: "STAFF", role: "DEPARTMENT_HEAD", id: ACCOUNT_STAFF }, body: "เจ้าหน้าที่กำลังดำเนินการตรวจสอบให้คุณ", visibility: "PUBLIC", idempotencyKey: "public-retry-001" }).id).toBe(publicUpdate.id);
    expect(repository.getInternalView(TENANT_A, created.id)?.auditTrail.map((entry) => entry.action)).toEqual(["COMPLAINT_CREATED", "ASSIGNMENT_CHANGED", "INTERNAL_NOTE_ADDED", "PUBLIC_UPDATE_ADDED"]);
  });

  it("enforces admin action scope and optimistic concurrency before mutation", () => {
    const repository = new InMemoryComplaintRepository();
    const created = repository.create(input({ idempotencyKey: "admin-scope-001", assignedDepartmentId: DEPARTMENT_A })).record;
    const staffContext = context({ role: "STAFF", departmentIds: [DEPARTMENT_A] });
    expect(() => assignAdminComplaint(repository, staffContext, { tenantId: TENANT_A, complaintId: created.id, expectedVersion: 1, departmentId: DEPARTMENT_A, actor: { type: "STAFF", role: "STAFF", id: ACCOUNT_STAFF }, reason: "ไม่ควรทำได้", idempotencyKey: "staff-assign-001" })).toThrowError(ComplaintDomainError);
    expect(() => transitionAdminComplaint(repository, staffContext, { tenantId: TENANT_A, complaintId: created.id, toStatus: "UNDER_REVIEW", expectedVersion: 99, actor: { type: "STAFF", role: "STAFF", id: ACCOUNT_STAFF }, idempotencyKey: "transition-stale-001" })).toThrowError(ComplaintDomainError);
    expect(() => getAdminComplaintDetail(repository, context({ role: "STAFF", departmentIds: [DEPARTMENT_B] }), created.id)).toThrowError(ComplaintDomainError);
  });
});
