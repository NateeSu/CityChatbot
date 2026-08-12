import { complaintRepository, LOCAL_TENANT_ID } from "../../citizen/complaints/repository";
import type { ComplaintActorRole, ComplaintActorType, ComplaintCreateInput, ComplaintState } from "@citychatbot/complaints";

export const LOCAL_ADMIN_ACCOUNT_ID = "10000000-0000-4000-8000-000000000003";
export const LOCAL_STAFF_ACCOUNT_ID = "10000000-0000-4000-8000-000000000001";
export const LOCAL_OTHER_ACCOUNT_ID = "10000000-0000-4000-8000-000000000002";
export const LOCAL_DEPARTMENT_HEAD_ACCOUNT_ID = "10000000-0000-4000-8000-000000000004";
export const LOCAL_DEPARTMENT_A_ID = "55555555-5555-4555-8555-555555555555";
export const LOCAL_DEPARTMENT_B_ID = "77777777-7777-4777-8777-777777777777";
export const LOCAL_CATEGORY_WASTE_ID = "33000000-0000-4000-8000-000000000001";
export const LOCAL_CATEGORY_ROAD_ID = "33000000-0000-4000-8000-000000000002";

let seeded = false;

const transition = (record: ReturnType<typeof complaintRepository.create>["record"], toStatus: ComplaintState, actorType: ComplaintActorType, actorRole: ComplaintActorRole, details: { departmentId?: string; membershipId?: string; publicRequest?: string; resolutionSummary?: string } = {}) => complaintRepository.transition({
  tenantId: LOCAL_TENANT_ID,
  complaintId: record.id,
  toStatus,
  expectedVersion: record.rowVersion,
  actor: { type: actorType, role: actorRole, id: actorType === "SYSTEM" ? undefined : LOCAL_STAFF_ACCOUNT_ID },
  ...(details.departmentId ? { assignedDepartmentId: details.departmentId } : {}),
  ...(details.membershipId ? { assignedMembershipId: details.membershipId } : {}),
  ...(details.publicRequest ? { publicRequest: details.publicRequest } : {}),
  ...(details.resolutionSummary ? { resolutionSummary: details.resolutionSummary } : {}),
});

const seedOne = (input: ComplaintCreateInput, target: ComplaintState): void => {
  let record = complaintRepository.create(input).record;
  if (record.canonicalStatus !== "RECEIVED") return;
  if (target === "RECEIVED") return;
  record = transition(record, "UNDER_REVIEW", "STAFF", "STAFF");
  if (target === "UNDER_REVIEW") return;
  record = transition(record, "ASSIGNED", "STAFF", "DEPARTMENT_HEAD", { departmentId: input.assignedDepartmentId, membershipId: input.assignedMembershipId });
  if (target === "ASSIGNED") return;
  record = transition(record, "IN_PROGRESS", "STAFF", "STAFF");
  if (target === "IN_PROGRESS") return;
  if (target === "WAITING_FOR_CITIZEN") {
    transition(record, "WAITING_FOR_CITIZEN", "STAFF", "STAFF", { publicRequest: "กรุณาส่งข้อมูลเพิ่มเติมเพื่อประกอบการตรวจสอบ" });
    return;
  }
  if (target === "RESOLVED" || target === "CLOSED") {
    record = transition(record, "RESOLVED", "STAFF", "STAFF", { resolutionSummary: "ดำเนินการแก้ไขตามขั้นตอนแล้ว" });
    if (target === "CLOSED") transition(record, "CLOSED", "SYSTEM", "SYSTEM");
  }
};

export const ensureLocalAdminFixtures = (): void => {
  if (seeded) return;
  seeded = true;
  const base = {
    tenantId: LOCAL_TENANT_ID,
    lineUserId: "Uadminfixture",
    intakeQueueId: "34000000-0000-4000-8000-000000000001",
    categoryId: LOCAL_CATEGORY_WASTE_ID,
    description: "ข้อมูลสังเคราะห์สำหรับทดสอบขอบเขตการมองเห็นของเจ้าหน้าที่",
    location: { latitude: 13.690000, longitude: 101.077000 },
    occurredAt: new Date("2026-08-10T04:00:00.000Z"),
  } satisfies Omit<ComplaintCreateInput, "title" | "idempotencyKey">;
  seedOne({ ...base, lineUserId: "Uadminfixture1", idempotencyKey: "admin-fixture-001", title: "ไฟฟ้าส่องสว่างดับ บริเวณหน้าหมู่บ้านสุขสันต์", assignedDepartmentId: LOCAL_DEPARTMENT_A_ID, assignedMembershipId: LOCAL_STAFF_ACCOUNT_ID, priority: "URGENT" }, "IN_PROGRESS");
  seedOne({ ...base, lineUserId: "Uadminfixture2", idempotencyKey: "admin-fixture-002", title: "ท่อระบายน้ำอุดตัน น้ำท่วมขังหน้าบ้าน", assignedDepartmentId: LOCAL_DEPARTMENT_A_ID, assignedMembershipId: LOCAL_OTHER_ACCOUNT_ID, priority: "NORMAL" }, "WAITING_FOR_CITIZEN");
  seedOne({ ...base, lineUserId: "Uadminfixture3", idempotencyKey: "admin-fixture-003", title: "ขยะล้นถัง บริเวณตลาดสดเทศบาล", assignedDepartmentId: LOCAL_DEPARTMENT_A_ID, priority: "NORMAL" }, "UNDER_REVIEW");
  seedOne({ ...base, lineUserId: "Uadminfixture4", idempotencyKey: "admin-fixture-004", title: "ถนนชำรุด เป็นหลุมลึกในซอยเทศบาล 5", categoryId: LOCAL_CATEGORY_ROAD_ID, assignedDepartmentId: LOCAL_DEPARTMENT_B_ID, assignedMembershipId: LOCAL_OTHER_ACCOUNT_ID, priority: "HIGH" }, "IN_PROGRESS");
  seedOne({ ...base, lineUserId: "Uadminfixture5", idempotencyKey: "admin-fixture-005", title: "กลิ่นเหม็นจากบ่อพักใกล้บ้านพัก", assignedDepartmentId: LOCAL_DEPARTMENT_A_ID, assignedMembershipId: LOCAL_OTHER_ACCOUNT_ID, priority: "LOW" }, "CLOSED");
};

export const localDepartmentName = (departmentId: string): string | undefined => ({
  [LOCAL_DEPARTMENT_A_ID]: "กองช่าง",
  [LOCAL_DEPARTMENT_B_ID]: "กองสาธารณสุข",
}[departmentId]);
