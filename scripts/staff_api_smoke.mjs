const BASE = process.env.CITYCHATBOT_BASE_URL ?? "http://127.0.0.1:3223";
const TENANT = "00000000-0000-4000-8000-000000000001";
const ADMIN = "10000000-0000-4000-8000-000000000003";
const STAFF = "10000000-0000-4000-8000-000000000001";
const DEPARTMENT = "55555555-5555-4555-8555-555555555555";

const query = (role, accountId, stepUp = true, tenantId = TENANT) => new URLSearchParams({ tenantId, role, accountId, stepUp: stepUp ? "1" : "0" });
const read = async (path, init = {}) => {
  const response = await fetch(`${BASE}${path}`, { ...init, headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const bodyError = (result, code) => assert(result.body?.error?.reasonCode === code, `expected ${code}, got ${JSON.stringify(result.body)}`);

const health = await read("/api/health");
assert(health.status === 200, `health=${health.status}`);

const adminQuery = query("TENANT_ADMIN", ADMIN);
const staffQuery = query("STAFF", STAFF, false);
const initial = await read(`/api/v1/admin/staff?${adminQuery}`);
assert(initial.status === 200 && initial.body.staff.length >= 3, `initial=${initial.status}`);
const staffMember = initial.body.staff.find((member) => member.accountId === STAFF);
const adminMember = initial.body.staff.find((member) => member.accountId === ADMIN);
const staffRole = initial.body.roles.find((role) => role.code === "STAFF");
const prRole = initial.body.roles.find((role) => role.code === "PR_STAFF");
assert(staffMember && adminMember && staffRole && prRole, "synthetic staff fixtures missing");

const badEmail = await read(`/api/v1/admin/staff/invitations?${adminQuery}`, { method: "POST", body: JSON.stringify({ email: "not-an-email", displayName: "bad", roleIds: [staffRole.id], departmentIds: [], reason: "validation", idempotencyKey: "staff-bad-email-001" }) });
bodyError(badEmail, "VALIDATION_ERROR");

const inviteBody = { email: "api.staff@example.com", displayName: "API เจ้าหน้าที่", roleIds: [staffRole.id], departmentIds: [DEPARTMENT], expiresInHours: 24, reason: "API smoke invite", idempotencyKey: "staff-api-invite-001" };
const created = await read(`/api/v1/admin/staff/invitations?${adminQuery}`, { method: "POST", body: JSON.stringify(inviteBody) });
assert(created.status === 201 && created.body.inviteToken && created.body.invitation.status === "PENDING", `invite=${created.status}`);
const replay = await read(`/api/v1/admin/staff/invitations?${adminQuery}`, { method: "POST", body: JSON.stringify(inviteBody) });
assert(replay.status === 201 && replay.body.invitation.id === created.body.invitation.id && replay.body.inviteToken === created.body.inviteToken, "invite idempotency failed");

const noStepUp = await read(`/api/v1/admin/staff/invitations?${query("TENANT_ADMIN", ADMIN, false)}`, { method: "POST", body: JSON.stringify({ ...inviteBody, email: "nostep@example.com", idempotencyKey: "staff-no-step-001" }) });
bodyError(noStepUp, "FORBIDDEN");
const staffMutation = await read(`/api/v1/admin/staff/${staffMember.id}?${staffQuery}`, { method: "PATCH", body: JSON.stringify({ status: "SUSPENDED", expectedVersion: staffMember.rowVersion, reason: "staff mutation", idempotencyKey: "staff-deny-001" }) });
bodyError(staffMutation, "FORBIDDEN");
const wrongTenant = await read(`/api/v1/admin/staff/${staffMember.id}?${query("TENANT_ADMIN", ADMIN, true, "00000000-0000-4000-8000-000000000002")}`);
bodyError(wrongTenant, "NOT_FOUND");

const accepted = await read(`/api/v1/admin/staff/invitations/${created.body.invitation.id}/accept`, { method: "POST", body: JSON.stringify({ tenantId: TENANT, inviteToken: created.body.inviteToken, displayName: "API เจ้าหน้าที่รับแล้ว", authSubject: "supabase:api-staff-accepted-001" }) });
assert(accepted.status === 200 && accepted.body.staff.status === "ACTIVE", `accept=${accepted.status} body=${JSON.stringify(accepted.body)}`);
const replayAccept = await read(`/api/v1/admin/staff/invitations/${created.body.invitation.id}/accept`, { method: "POST", body: JSON.stringify({ tenantId: TENANT, inviteToken: created.body.inviteToken, displayName: "replay", authSubject: "supabase:api-staff-replay-001" }) });
bodyError(replayAccept, "INVITATION_REPLAYED");

const acceptedStaff = accepted.body.staff;
const assigned = await read(`/api/v1/admin/staff/${acceptedStaff.id}/role-assignments?${adminQuery}`, { method: "POST", body: JSON.stringify({ roleId: prRole.id, expectedVersion: acceptedStaff.rowVersion, reason: "assign PR role", idempotencyKey: "staff-role-assign-001" }) });
assert(assigned.status === 200 && assigned.body.staff.roles.some((role) => role.code === "PR_STAFF") && assigned.body.staff.sessionRevokedAt, `assign=${assigned.status}`);
const removed = await read(`/api/v1/admin/staff/${acceptedStaff.id}/role-assignments/${staffRole.id}?${adminQuery}`, { method: "DELETE", body: JSON.stringify({ expectedVersion: assigned.body.staff.rowVersion, reason: "remove initial role", idempotencyKey: "staff-role-remove-001" }) });
assert(removed.status === 200 && removed.body.staff.roles.length === 1, `remove=${removed.status}`);

const lastAdmin = await read(`/api/v1/admin/staff/${adminMember.id}?${adminQuery}`, { method: "PATCH", body: JSON.stringify({ status: "DEACTIVATED", expectedVersion: adminMember.rowVersion, reason: "last admin guard", idempotencyKey: "staff-last-admin-001" }) });
bodyError(lastAdmin, "LAST_ADMIN_GUARD");
const customRole = await read(`/api/v1/admin/roles?${adminQuery}`, { method: "POST", body: JSON.stringify({ code: "API_VIEWER", displayName: "API ผู้ดู", permissions: [{ resource: "KPI", action: "VIEW", scope: "TENANT" }], reason: "custom role smoke", idempotencyKey: "staff-custom-role-001" }) });
assert(customRole.status === 201 && customRole.body.role.kind === "CUSTOM", `custom-role=${customRole.status}`);
const builtInPatch = await read(`/api/v1/admin/roles/${staffRole.id}?${adminQuery}`, { method: "PATCH", body: JSON.stringify({ displayName: "ไม่ควรเปลี่ยน", expectedVersion: staffRole.rowVersion, reason: "built in lock", idempotencyKey: "staff-built-in-lock-001" }) });
bodyError(builtInPatch, "FORBIDDEN");

const page = await read(`/admin/staff?role=TENANT_ADMIN`);
assert(page.status === 200, `admin-page=${page.status}`);
const deniedPage = await read(`/admin/staff?role=STAFF`);
assert(deniedPage.status === 200, `staff-page=${deniedPage.status}`);

console.log(`health=${health.status} initial=${initial.status} bad_email=${badEmail.status}:${badEmail.body.error.reasonCode} invite=${created.status} replay=${replay.status}:same_token no_step_up=${noStepUp.status}:${noStepUp.body.error.reasonCode} staff_mutation=${staffMutation.status}:${staffMutation.body.error.reasonCode} other_tenant=${wrongTenant.status}:${wrongTenant.body.error.reasonCode} accept=${accepted.status}:ACTIVE replay_accept=${replayAccept.status}:${replayAccept.body.error.reasonCode} assign=${assigned.status}:session_revoked remove=${removed.status}:one_role last_admin=${lastAdmin.status}:${lastAdmin.body.error.reasonCode} custom_role=${customRole.status}:CUSTOM built_in=${builtInPatch.status}:${builtInPatch.body.error.reasonCode} admin_page=${page.status} staff_page=${deniedPage.status}`);
