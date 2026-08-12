import { describe, expect, it } from "vitest";

import {
  USER_MANAGEMENT_DEPARTMENT_ID,
  USER_MANAGEMENT_TENANT_ID,
  UserManagementError,
  createSyntheticUserManagementRepository,
  type UserManagementActor,
} from "./user-management";

const ADMIN_ACCOUNT = "10000000-0000-4000-8000-000000000003";
const STAFF_ACCOUNT = "10000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-11T04:00:00.000Z");

const admin: UserManagementActor = {
  tenantId: USER_MANAGEMENT_TENANT_ID,
  accountId: ADMIN_ACCOUNT,
  role: "TENANT_ADMIN",
  departmentIds: [],
  mfaVerified: true,
  reauthenticatedAt: "2026-08-11T03:58:00.000Z",
};
const staff: UserManagementActor = {
  tenantId: USER_MANAGEMENT_TENANT_ID,
  accountId: STAFF_ACCOUNT,
  role: "STAFF",
  departmentIds: [USER_MANAGEMENT_DEPARTMENT_ID],
  mfaVerified: false,
  reauthenticatedAt: null,
};

const expectCode = (operation: () => unknown, code: UserManagementError["code"]): void => {
  try {
    operation();
    throw new Error("expected user-management error");
  } catch (error) {
    expect(error).toBeInstanceOf(UserManagementError);
    expect((error as UserManagementError).code).toBe(code);
  }
};

describe("staff user and invitation lifecycle", () => {
  it("creates an expiring invitation with masked PII, hashed token boundary and idempotent replay", () => {
    const repository = createSyntheticUserManagementRepository();
    const role = repository.listRoles(admin).find((item) => item.code === "STAFF")!;
    const input = { email: "New.Staff@example.com", displayName: "เจ้าหน้าที่ใหม่", roleIds: [role.id], departmentIds: [USER_MANAGEMENT_DEPARTMENT_ID], expiresInHours: 24, reason: "pilot staffing", idempotencyKey: "invite-staff-001" };
    const first = repository.createInvitation(admin, input, NOW);
    const replay = repository.createInvitation(admin, input, NOW);
    expect(replay).toEqual(first);
    expect(first.inviteToken).not.toContain("@example.com");
    expect(first.invitation.emailMasked).toBe("n***@example.com");
    expect(first.invitation.status).toBe("PENDING");
    expect(first.invitation.expiresAt).toBe("2026-08-12T04:00:00.000Z");
    expect(repository.listAudit(admin)[0]?.afterRedacted).not.toHaveProperty("email");
    expectCode(() => repository.createInvitation(admin, { ...input, idempotencyKey: "invite-staff-002" }, NOW), "DUPLICATE");
  });

  it("accepts exactly once, rejects replay/expiry/wrong tenant and activates the membership", () => {
    const repository = createSyntheticUserManagementRepository();
    const role = repository.listRoles(admin).find((item) => item.code === "STAFF")!;
    const created = repository.createInvitation(admin, { email: "accept@example.com", displayName: "รอรับคำเชิญ", roleIds: [role.id], departmentIds: [], reason: "accept flow", idempotencyKey: "invite-accept-001" }, NOW);
    const accepted = repository.acceptInvitation(USER_MANAGEMENT_TENANT_ID, created.inviteToken, { displayName: "เจ้าหน้าที่รับแล้ว", authSubject: "supabase:user-accepted-001" }, new Date("2026-08-11T04:01:00.000Z"));
    expect(accepted.status).toBe("ACTIVE");
    expect(accepted.displayName).toBe("เจ้าหน้าที่รับแล้ว");
    expectCode(() => repository.acceptInvitation(USER_MANAGEMENT_TENANT_ID, created.inviteToken, { displayName: "replay", authSubject: "supabase:user-replay-001" }, new Date("2026-08-11T04:02:00.000Z")), "INVITATION_REPLAYED");
    expectCode(() => repository.acceptInvitation("00000000-0000-4000-8000-000000000002", created.inviteToken, { displayName: "wrong tenant", authSubject: "supabase:user-wrong-001" }, new Date("2026-08-11T04:02:00.000Z")), "NOT_FOUND");

    const expiring = repository.createInvitation(admin, { email: "expired@example.com", displayName: "หมดอายุ", roleIds: [role.id], departmentIds: [], expiresInHours: 1, reason: "expiry", idempotencyKey: "invite-expiry-001" }, NOW);
    expectCode(() => repository.acceptInvitation(USER_MANAGEMENT_TENANT_ID, expiring.inviteToken, { displayName: "หมดอายุ", authSubject: "supabase:user-expired-001" }, new Date("2026-08-11T05:01:00.000Z")), "INVITATION_EXPIRED");
  });

  it("enforces step-up, role limits, department scope, session revocation and last-admin guard", () => {
    const repository = createSyntheticUserManagementRepository();
    const staffMember = repository.listStaff(admin).find((item) => item.accountId === STAFF_ACCOUNT)!;
    expectCode(() => repository.updateStaff(staff, staffMember.id, { status: "DEACTIVATED", expectedVersion: staffMember.rowVersion, reason: "not allowed", idempotencyKey: "staff-deny-001" }, NOW), "FORBIDDEN");
    expectCode(() => repository.updateStaff({ ...admin, mfaVerified: false, reauthenticatedAt: null }, staffMember.id, { status: "SUSPENDED", expectedVersion: staffMember.rowVersion, reason: "suspend", idempotencyKey: "staff-suspend-001" }, NOW), "FORBIDDEN");
    const steppedAdmin = { ...admin, reauthenticatedAt: "2026-08-11T03:59:30.000Z" };
    const updated = repository.updateStaff(steppedAdmin, staffMember.id, { status: "SUSPENDED", expectedVersion: staffMember.rowVersion, reason: "suspend", idempotencyKey: "staff-suspend-002" }, NOW);
    expect(updated.status).toBe("SUSPENDED");
    expect(updated.sessionRevokedAt).toBeDefined();

    const tenantAdmin = repository.listStaff(admin).find((item) => item.roles.some((role) => role.code === "TENANT_ADMIN"))!;
    expectCode(() => repository.updateStaff(steppedAdmin, tenantAdmin.id, { status: "DEACTIVATED", expectedVersion: tenantAdmin.rowVersion, reason: "remove last admin", idempotencyKey: "staff-last-admin-001" }, NOW), "LAST_ADMIN_GUARD");
  });

  it("keeps built-in policy locked and custom role permissions bounded", () => {
    const repository = createSyntheticUserManagementRepository();
    const builtIn = repository.listRoles(admin).find((item) => item.code === "STAFF")!;
    expectCode(() => repository.updateRole(admin, builtIn.id, { displayName: "unsafe", expectedVersion: builtIn.rowVersion, reason: "lock", idempotencyKey: "role-lock-001" }, NOW), "FORBIDDEN");
    const custom = repository.createRole(admin, { code: "REPORT_VIEWER", displayName: "ผู้ดูรายงาน", permissions: [{ resource: "KPI", action: "VIEW", scope: "TENANT" }], reason: "limited role", idempotencyKey: "role-create-001" }, NOW);
    expect(custom.kind).toBe("CUSTOM");
    expectCode(() => repository.createRole(admin, { code: "SYSTEM_HELPER", displayName: "ห้าม", permissions: [{ resource: "AUDIT", action: "SUPPORT_ACCESS", scope: "SYSTEM" }], reason: "unsafe", idempotencyKey: "role-create-002" }, NOW), "FORBIDDEN");
  });
});
