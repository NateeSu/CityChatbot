import { createHash, randomBytes, randomUUID } from "node:crypto";

export const USER_MANAGEMENT_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const USER_MANAGEMENT_DEPARTMENT_ID = "55555555-5555-4555-8555-555555555555";

export const STAFF_ROLE_CODES = [
  "STAFF",
  "DEPARTMENT_HEAD",
  "PR_STAFF",
  "KNOWLEDGE_STAFF",
  "TENANT_ADMIN",
  "EXECUTIVE",
] as const;
export type StaffRoleCode = (typeof STAFF_ROLE_CODES)[number];
export type MembershipStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
export type RoleStatus = "ACTIVE" | "INACTIVE";
export type DepartmentRole = "STAFF" | "HEAD" | "KNOWLEDGE" | "PR";
export type UserManagementRole = StaffRoleCode | "CUSTOM";

export const PERMISSION_RESOURCES = ["COMPLAINT", "SUPPORT_TICKET", "KNOWLEDGE", "NEWS", "SERVICE", "KPI", "SETTINGS", "STAFF", "AUDIT", "JOB"] as const;
export const PERMISSION_ACTIONS = ["VIEW", "CREATE", "UPDATE", "ASSIGN", "FORWARD", "REPLY", "RESOLVE", "CLOSE", "PUBLISH", "EXPORT", "MANAGE", "SUPPORT_ACCESS"] as const;
export const PERMISSION_SCOPES = ["OWN", "ASSIGNED", "DEPARTMENT", "TENANT", "SYSTEM"] as const;
export type PermissionResource = (typeof PERMISSION_RESOURCES)[number];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];

export type Permission = {
  resource: PermissionResource;
  action: PermissionAction;
  scope: PermissionScope;
};

export type UserManagementActor = {
  tenantId: string;
  accountId: string;
  role: StaffRoleCode;
  departmentIds: readonly string[];
  mfaVerified: boolean;
  reauthenticatedAt?: string | null;
};

export type RoleDefinition = {
  id: string;
  tenantId: string;
  code: string;
  displayName: string;
  status: RoleStatus;
  kind: UserManagementRole;
  permissions: readonly Permission[];
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type DepartmentMembership = {
  departmentId: string;
  roleInDepartment: DepartmentRole;
  isPrimary: boolean;
};

export type StaffMember = {
  id: string;
  tenantId: string;
  accountId: string;
  displayName: string;
  emailMasked: string;
  status: MembershipStatus;
  roleIds: readonly string[];
  roles: readonly Pick<RoleDefinition, "id" | "code" | "displayName" | "kind">[];
  departmentMemberships: readonly DepartmentMembership[];
  sessionRevokedAt?: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type StaffInvitation = {
  id: string;
  tenantId: string;
  membershipId: string;
  emailMasked: string;
  status: InvitationStatus;
  roleIds: readonly string[];
  departmentIds: readonly string[];
  expiresAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  createdByAccountId: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type UserAuditEntry = {
  id: string;
  tenantId: string;
  actorAccountId: string;
  action: string;
  resourceType: "STAFF" | "INVITATION" | "ROLE";
  resourceId: string;
  beforeRedacted?: Record<string, unknown>;
  afterRedacted?: Record<string, unknown>;
  reason: string;
  occurredAt: string;
};

export type UserManagementSnapshot = {
  staff: readonly StaffMember[];
  invitations: readonly StaffInvitation[];
  roles: readonly RoleDefinition[];
  audit: readonly UserAuditEntry[];
};

export type CreateInvitationInput = {
  email: string;
  displayName: string;
  roleIds: readonly string[];
  departmentIds: readonly string[];
  expiresInHours?: number;
  reason: string;
  idempotencyKey: string;
};

export type CreateInvitationResult = {
  invitation: StaffInvitation;
  staff: StaffMember;
  inviteToken: string;
};

export type AcceptInvitationInput = {
  displayName: string;
  authSubject: string;
};

export type UpdateStaffInput = {
  status?: Exclude<MembershipStatus, "INVITED">;
  displayName?: string;
  departmentIds?: readonly string[];
  expectedVersion: number;
  reason: string;
  idempotencyKey: string;
};

export type AssignRoleInput = {
  roleId: string;
  expectedVersion: number;
  reason: string;
  idempotencyKey: string;
};

export type CreateRoleInput = {
  code: string;
  displayName: string;
  permissions: readonly Permission[];
  reason: string;
  idempotencyKey: string;
};

export type UpdateRoleInput = {
  displayName?: string;
  status?: RoleStatus;
  permissions?: readonly Permission[];
  expectedVersion: number;
  reason: string;
  idempotencyKey: string;
};

export type UserManagementErrorCode =
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "DUPLICATE"
  | "VERSION_CONFLICT"
  | "INVALID_STATE"
  | "IDEMPOTENCY_CONFLICT"
  | "INVITATION_EXPIRED"
  | "INVITATION_REPLAYED"
  | "LAST_ADMIN_GUARD";

export class UserManagementError extends Error {
  constructor(public readonly code: UserManagementErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "UserManagementError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_SUBJECT_PATTERN = /^[a-zA-Z0-9:_|.\-]{8,255}$/;
const ROLE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{2,63}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const STEP_UP_WINDOW_MS = 5 * 60 * 1000;
const MAX_ASSIGNED_ROLES = 4;
const MAX_DEPARTMENTS = 20;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const nowIso = (now = new Date()): string => now.toISOString();
const assertText = (value: unknown, field: string, max: number): string => {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new UserManagementError("VALIDATION_ERROR", `${field} is invalid`);
  }
  return value.trim();
};
const assertUuid = (value: unknown, field: string): string => {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new UserManagementError("VALIDATION_ERROR", `${field} must be a UUID`);
  return value;
};
const assertReason = (value: string): string => assertText(value, "reason", 2000);
const assertIdempotencyKey = (value: string): string => {
  const key = assertText(value, "idempotencyKey", 255);
  if (key.length < 8) throw new UserManagementError("VALIDATION_ERROR", "idempotencyKey is too short");
  return key;
};
const normalizeEmail = (value: unknown): string => {
  if (typeof value !== "string") throw new UserManagementError("VALIDATION_ERROR", "email is invalid");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) throw new UserManagementError("VALIDATION_ERROR", "email is invalid");
  return email;
};
const emailDigest = (email: string): string => createHash("sha256").update(email, "utf8").digest("hex");
const maskEmail = (email: string): string => {
  const [localPart = "", domain = ""] = email.split("@");
  const visible = localPart.slice(0, 1);
  return `${visible}${"*".repeat(localPart.length > 1 ? 3 : 2)}@${domain}`;
};
const assertIsoDate = (value: string, field: string): string => {
  if (!ISO_DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) throw new UserManagementError("VALIDATION_ERROR", `${field} must be an ISO UTC timestamp`);
  return value;
};
const hashToken = (token: string): string => createHash("sha256").update(token, "utf8").digest("hex");
const requestHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
const unique = (values: readonly string[]): string[] => [...new Set(values)];

const BUILT_IN_ROLE_PERMISSIONS: Readonly<Record<StaffRoleCode, readonly Permission[]>> = {
  STAFF: [
    { resource: "COMPLAINT", action: "VIEW", scope: "DEPARTMENT" },
    { resource: "COMPLAINT", action: "UPDATE", scope: "ASSIGNED" },
    { resource: "COMPLAINT", action: "REPLY", scope: "ASSIGNED" },
    { resource: "SUPPORT_TICKET", action: "VIEW", scope: "DEPARTMENT" },
    { resource: "SERVICE", action: "VIEW", scope: "TENANT" },
  ],
  DEPARTMENT_HEAD: [
    { resource: "COMPLAINT", action: "MANAGE", scope: "DEPARTMENT" },
    { resource: "SUPPORT_TICKET", action: "MANAGE", scope: "DEPARTMENT" },
    { resource: "KPI", action: "EXPORT", scope: "DEPARTMENT" },
    { resource: "SERVICE", action: "VIEW", scope: "TENANT" },
  ],
  PR_STAFF: [
    { resource: "NEWS", action: "MANAGE", scope: "TENANT" },
    { resource: "SERVICE", action: "MANAGE", scope: "TENANT" },
    { resource: "KNOWLEDGE", action: "VIEW", scope: "TENANT" },
  ],
  KNOWLEDGE_STAFF: [
    { resource: "KNOWLEDGE", action: "MANAGE", scope: "TENANT" },
    { resource: "SERVICE", action: "VIEW", scope: "TENANT" },
  ],
  TENANT_ADMIN: [
    { resource: "STAFF", action: "MANAGE", scope: "TENANT" },
    { resource: "SETTINGS", action: "MANAGE", scope: "TENANT" },
    { resource: "AUDIT", action: "VIEW", scope: "TENANT" },
    { resource: "SERVICE", action: "MANAGE", scope: "TENANT" },
  ],
  EXECUTIVE: [
    { resource: "KPI", action: "VIEW", scope: "TENANT" },
    { resource: "KPI", action: "EXPORT", scope: "TENANT" },
    { resource: "SERVICE", action: "VIEW", scope: "TENANT" },
  ],
};

const BUILT_IN_ROLE_IDS: Readonly<Record<StaffRoleCode, string>> = {
  STAFF: "50000000-0000-4000-8000-000000000001",
  DEPARTMENT_HEAD: "50000000-0000-4000-8000-000000000002",
  PR_STAFF: "50000000-0000-4000-8000-000000000003",
  KNOWLEDGE_STAFF: "50000000-0000-4000-8000-000000000004",
  TENANT_ADMIN: "50000000-0000-4000-8000-000000000005",
  EXECUTIVE: "50000000-0000-4000-8000-000000000006",
};

const BUILT_IN_ROLE_LABELS: Readonly<Record<StaffRoleCode, string>> = {
  STAFF: "เจ้าหน้าที่",
  DEPARTMENT_HEAD: "หัวหน้าหน่วยงาน",
  PR_STAFF: "ประชาสัมพันธ์",
  KNOWLEDGE_STAFF: "คลังความรู้",
  TENANT_ADMIN: "ผู้ดูแลเทศบาล",
  EXECUTIVE: "ผู้บริหาร",
};

type StoredAccount = { id: string; authSubject: string; status: "ACTIVE" | "SUSPENDED" | "DEACTIVATED" };
type StoredMembership = {
  id: string;
  tenantId: string;
  accountId: string;
  displayName: string;
  emailDigest: string;
  emailMasked: string;
  status: MembershipStatus;
  roleIds: string[];
  departmentMemberships: DepartmentMembership[];
  sessionRevokedAt?: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};
type IdempotencyValue = { requestHash: string; value: unknown };

export class InMemoryUserManagementRepository {
  private readonly accounts = new Map<string, StoredAccount>();
  private readonly memberships = new Map<string, StoredMembership>();
  private readonly roles = new Map<string, RoleDefinition>();
  private readonly invitations = new Map<string, StaffInvitation & { emailDigest: string; tokenDigest: string }>();
  private readonly audits: UserAuditEntry[] = [];
  private readonly idempotency = new Map<string, IdempotencyValue>();
  private readonly departmentIds = new Set<string>([USER_MANAGEMENT_DEPARTMENT_ID]);

  constructor(seed: UserManagementSnapshot = createSyntheticUserManagementSnapshot()) {
    for (const role of seed.roles) this.roles.set(role.id, clone(role));
    for (const staff of seed.staff) {
      this.accounts.set(staff.accountId, { id: staff.accountId, authSubject: `synthetic:${staff.accountId}`, status: staff.status === "DEACTIVATED" ? "DEACTIVATED" : "ACTIVE" });
      this.memberships.set(staff.id, {
        id: staff.id,
        tenantId: staff.tenantId,
        accountId: staff.accountId,
        displayName: staff.displayName,
        emailDigest: emailDigest(`${staff.accountId}@synthetic.invalid`),
        emailMasked: staff.emailMasked,
        status: staff.status,
        roleIds: [...staff.roleIds],
        departmentMemberships: staff.departmentMemberships.map(clone),
        ...(staff.sessionRevokedAt ? { sessionRevokedAt: staff.sessionRevokedAt } : {}),
        createdAt: staff.createdAt,
        updatedAt: staff.updatedAt,
        rowVersion: staff.rowVersion,
      });
    }
    for (const invitation of seed.invitations) this.invitations.set(invitation.id, { ...clone(invitation), emailDigest: "", tokenDigest: "" });
    this.audits.push(...seed.audit.map(clone));
  }

  snapshot(actor: UserManagementActor): UserManagementSnapshot {
    return {
      staff: this.listStaff(actor),
      invitations: this.listInvitations(actor),
      roles: this.listRoles(actor),
      audit: this.listAudit(actor),
    };
  }

  listStaff(actor: UserManagementActor): readonly StaffMember[] {
    this.assertTenant(actor);
    return [...this.memberships.values()]
      .filter((membership) => membership.tenantId === actor.tenantId)
      .filter((membership) => actor.role === "TENANT_ADMIN" || membership.departmentMemberships.some((item) => actor.departmentIds.includes(item.departmentId)))
      .map((membership) => this.publicStaff(membership));
  }

  getStaff(actor: UserManagementActor, membershipId: string): StaffMember {
    const membership = this.getMembership(actor, membershipId);
    return this.publicStaff(membership);
  }

  listInvitations(actor: UserManagementActor): readonly StaffInvitation[] {
    this.assertTenant(actor);
    return [...this.invitations.values()]
      .filter((invitation) => invitation.tenantId === actor.tenantId)
      .filter((invitation) => actor.role === "TENANT_ADMIN" || invitation.departmentIds.some((id) => actor.departmentIds.includes(id)))
      .map((invitation) => this.publicInvitation(invitation));
  }

  listRoles(actor: UserManagementActor): readonly RoleDefinition[] {
    this.assertTenant(actor);
    return [...this.roles.values()].filter((role) => role.tenantId === actor.tenantId && role.status === "ACTIVE").map(clone);
  }

  listAudit(actor: UserManagementActor): readonly UserAuditEntry[] {
    this.assertTenant(actor);
    return this.audits.filter((entry) => entry.tenantId === actor.tenantId).map(clone);
  }

  createInvitation(actor: UserManagementActor, input: CreateInvitationInput, now = new Date()): CreateInvitationResult {
    this.assertManage(actor, now);
    const email = normalizeEmail(input.email);
    const displayName = assertText(input.displayName, "displayName", 200);
    const roleIds = this.validateRoleIds(actor, input.roleIds);
    const departmentIds = this.validateDepartmentIds(actor, input.departmentIds);
    const reason = assertReason(input.reason);
    const idempotencyKey = assertIdempotencyKey(input.idempotencyKey);
    const expiresInHours = input.expiresInHours ?? 72;
    if (!Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > 168) throw new UserManagementError("VALIDATION_ERROR", "expiresInHours must be between 1 and 168");
    const request = { emailDigest: emailDigest(email), displayName, roleIds, departmentIds, expiresInHours, reason };
    return this.idempotent(actor, "create-invitation", idempotencyKey, request, () => {
      if ([...this.invitations.values()].some((item) => item.tenantId === actor.tenantId && item.emailDigest === request.emailDigest && item.status === "PENDING")) throw new UserManagementError("DUPLICATE", "an active invitation already exists");
      if ([...this.memberships.values()].some((item) => item.tenantId === actor.tenantId && item.emailDigest === request.emailDigest && item.status !== "DEACTIVATED")) throw new UserManagementError("DUPLICATE", "this staff account already exists");
      const timestamp = nowIso(now);
      const membershipId = randomUUID();
      const accountId = randomUUID();
      const token = randomBytes(32).toString("base64url");
      const tokenDigest = hashToken(token);
      const membership: StoredMembership = {
        id: membershipId,
        tenantId: actor.tenantId,
        accountId,
        displayName,
        emailDigest: request.emailDigest,
        emailMasked: maskEmail(email),
        status: "INVITED",
        roleIds: [...roleIds],
        departmentMemberships: departmentIds.map((departmentId, index) => ({ departmentId, roleInDepartment: "STAFF", isPrimary: index === 0 })),
        createdAt: timestamp,
        updatedAt: timestamp,
        rowVersion: 1,
      };
      const invitation: StaffInvitation & { emailDigest: string; tokenDigest: string } = {
        id: randomUUID(),
        tenantId: actor.tenantId,
        membershipId,
        emailMasked: membership.emailMasked,
        emailDigest: request.emailDigest,
        tokenDigest,
        status: "PENDING",
        roleIds: [...roleIds],
        departmentIds: [...departmentIds],
        expiresAt: new Date(now.getTime() + expiresInHours * 60 * 60 * 1000).toISOString(),
        createdByAccountId: actor.accountId,
        createdAt: timestamp,
        updatedAt: timestamp,
        rowVersion: 1,
      };
      this.accounts.set(accountId, { id: accountId, authSubject: `pending:${tokenDigest}`, status: "SUSPENDED" });
      this.memberships.set(membership.id, membership);
      this.invitations.set(invitation.id, invitation);
      this.recordAudit(actor, "INVITATION_CREATED", "INVITATION", invitation.id, undefined, { emailMasked: invitation.emailMasked, roleCount: roleIds.length, departmentCount: departmentIds.length }, reason, timestamp);
      return { invitation: this.publicInvitation(invitation), staff: this.publicStaff(membership), inviteToken: token };
    });
  }

  acceptInvitation(tenantId: string, token: string, input: AcceptInvitationInput, now = new Date()): StaffMember {
    assertUuid(tenantId, "tenantId");
    if (typeof token !== "string" || token.length < 32 || token.length > 512) throw new UserManagementError("VALIDATION_ERROR", "invitation token is invalid");
    const displayName = assertText(input.displayName, "displayName", 200);
    const authSubject = assertText(input.authSubject, "authSubject", 255);
    if (!AUTH_SUBJECT_PATTERN.test(authSubject)) throw new UserManagementError("VALIDATION_ERROR", "authSubject is invalid");
    const tokenDigest = hashToken(token);
    const invitation = [...this.invitations.values()].find((item) => item.tenantId === tenantId && item.tokenDigest === tokenDigest);
    if (!invitation) throw new UserManagementError("NOT_FOUND", "invitation is not available");
    if (invitation.status !== "PENDING") throw new UserManagementError("INVITATION_REPLAYED", "invitation was already consumed");
    if (Date.parse(invitation.expiresAt) <= now.getTime()) {
      invitation.status = "EXPIRED";
      invitation.updatedAt = nowIso(now);
      invitation.rowVersion += 1;
      throw new UserManagementError("INVITATION_EXPIRED", "invitation has expired");
    }
    if ([...this.accounts.values()].some((account) => account.authSubject === authSubject && account.id !== this.memberships.get(invitation.membershipId)?.accountId)) throw new UserManagementError("DUPLICATE", "auth subject is already linked");
    const membership = this.memberships.get(invitation.membershipId);
    if (!membership) throw new UserManagementError("NOT_FOUND", "membership is not available");
    const account = this.accounts.get(membership.accountId);
    if (!account) throw new UserManagementError("NOT_FOUND", "account is not available");
    const timestamp = nowIso(now);
    account.authSubject = authSubject;
    account.status = "ACTIVE";
    membership.status = "ACTIVE";
    membership.displayName = displayName;
    membership.updatedAt = timestamp;
    membership.rowVersion += 1;
    invitation.status = "ACCEPTED";
    invitation.acceptedAt = timestamp;
    invitation.updatedAt = timestamp;
    invitation.rowVersion += 1;
    return this.publicStaff(membership);
  }

  getInvitationByToken(tenantId: string, token: string): StaffInvitation {
    assertUuid(tenantId, "tenantId");
    if (typeof token !== "string" || token.length < 32 || token.length > 512) throw new UserManagementError("VALIDATION_ERROR", "invitation token is invalid");
    const invitation = [...this.invitations.values()].find((item) => item.tenantId === tenantId && item.tokenDigest === hashToken(token));
    if (!invitation) throw new UserManagementError("NOT_FOUND", "invitation is not available");
    return this.publicInvitation(invitation);
  }

  expireInvitations(now = new Date()): number {
    let changed = 0;
    for (const invitation of this.invitations.values()) {
      if (invitation.status === "PENDING" && Date.parse(invitation.expiresAt) <= now.getTime()) {
        invitation.status = "EXPIRED";
        invitation.updatedAt = nowIso(now);
        invitation.rowVersion += 1;
        changed += 1;
      }
    }
    return changed;
  }

  revokeInvitation(actor: UserManagementActor, invitationId: string, expectedVersion: number, reasonInput: string, idempotencyKey: string, now = new Date()): StaffInvitation {
    this.assertManage(actor, now);
    const invitation = this.getInvitation(actor, invitationId);
    const reason = assertReason(reasonInput);
    const key = assertIdempotencyKey(idempotencyKey);
    if (invitation.rowVersion !== expectedVersion) throw new UserManagementError("VERSION_CONFLICT", "invitation version is stale");
    if (invitation.status !== "PENDING") throw new UserManagementError("INVALID_STATE", "only a pending invitation can be revoked");
    return this.idempotent(actor, `revoke-invitation:${invitation.id}`, key, { expectedVersion, reason }, () => {
      const stored = this.invitations.get(invitation.id)!;
      const timestamp = nowIso(now);
      stored.status = "REVOKED";
      stored.revokedAt = timestamp;
      stored.updatedAt = timestamp;
      stored.rowVersion += 1;
      const membership = this.memberships.get(stored.membershipId);
      if (membership) {
        membership.status = "DEACTIVATED";
        membership.updatedAt = timestamp;
        membership.sessionRevokedAt = timestamp;
        membership.rowVersion += 1;
      }
      this.recordAudit(actor, "INVITATION_REVOKED", "INVITATION", stored.id, { status: "PENDING" }, { status: stored.status }, reason, timestamp);
      return this.publicInvitation(stored);
    });
  }

  updateStaff(actor: UserManagementActor, membershipId: string, input: UpdateStaffInput, now = new Date()): StaffMember {
    this.assertManage(actor, now);
    const current = this.getMembership(actor, membershipId);
    if (current.rowVersion !== input.expectedVersion) throw new UserManagementError("VERSION_CONFLICT", "staff version is stale");
    const reason = assertReason(input.reason);
    const key = assertIdempotencyKey(input.idempotencyKey);
    const nextStatus = input.status ?? current.status;
    if (nextStatus === "INVITED") throw new UserManagementError("VALIDATION_ERROR", "invited status is managed by invitation lifecycle");
    const nextName = input.displayName === undefined ? current.displayName : assertText(input.displayName, "displayName", 200);
    const nextDepartments = input.departmentIds === undefined ? current.departmentMemberships.map((item) => item.departmentId) : this.validateDepartmentIds(actor, input.departmentIds);
    return this.idempotent(actor, `update-staff:${current.id}`, key, { status: nextStatus, displayName: nextName, departmentIds: nextDepartments, expectedVersion: input.expectedVersion, reason }, () => {
      this.assertLastAdminGuard(current, nextStatus, current.roleIds);
      const timestamp = nowIso(now);
      const next: StoredMembership = { ...current, displayName: nextName, status: nextStatus, departmentMemberships: nextDepartments.map((departmentId, index) => ({ departmentId, roleInDepartment: "STAFF", isPrimary: index === 0 })), updatedAt: timestamp, rowVersion: current.rowVersion + 1, ...(nextStatus !== current.status || nextDepartments.join(",") !== current.departmentMemberships.map((item) => item.departmentId).join(",") ? { sessionRevokedAt: timestamp } : {}) };
      this.memberships.set(current.id, next);
      const account = this.accounts.get(current.accountId);
      if (account) account.status = nextStatus === "ACTIVE" ? "ACTIVE" : nextStatus === "SUSPENDED" || nextStatus === "DEACTIVATED" ? nextStatus : account.status;
      this.recordAudit(actor, "STAFF_UPDATED", "STAFF", current.id, this.redactedMembership(current), this.redactedMembership(next), reason, timestamp);
      return this.publicStaff(next);
    });
  }

  assignRole(actor: UserManagementActor, membershipId: string, input: AssignRoleInput, now = new Date()): StaffMember {
    this.assertManage(actor, now);
    const current = this.getMembership(actor, membershipId);
    if (current.rowVersion !== input.expectedVersion) throw new UserManagementError("VERSION_CONFLICT", "staff version is stale");
    const role = this.getRole(actor, input.roleId);
    if (role.status !== "ACTIVE") throw new UserManagementError("INVALID_STATE", "role is inactive");
    const reason = assertReason(input.reason);
    const key = assertIdempotencyKey(input.idempotencyKey);
    return this.idempotent(actor, `assign-role:${current.id}`, key, { roleId: role.id, expectedVersion: input.expectedVersion, reason }, () => {
      if (current.roleIds.includes(role.id)) return this.publicStaff(current);
      if (current.roleIds.length >= MAX_ASSIGNED_ROLES) throw new UserManagementError("VALIDATION_ERROR", "too many role assignments");
      const next: StoredMembership = { ...current, roleIds: [...current.roleIds, role.id], rowVersion: current.rowVersion + 1, updatedAt: nowIso(now), sessionRevokedAt: nowIso(now) };
      this.memberships.set(current.id, next);
      this.recordAudit(actor, "ROLE_ASSIGNED", "STAFF", current.id, this.redactedMembership(current), this.redactedMembership(next), reason, next.updatedAt);
      return this.publicStaff(next);
    });
  }

  removeRole(actor: UserManagementActor, membershipId: string, roleId: string, expectedVersion: number, reasonInput: string, idempotencyKey: string, now = new Date()): StaffMember {
    this.assertManage(actor, now);
    const current = this.getMembership(actor, membershipId);
    const role = this.getRole(actor, roleId);
    if (current.rowVersion !== expectedVersion) throw new UserManagementError("VERSION_CONFLICT", "staff version is stale");
    if (!current.roleIds.includes(role.id)) throw new UserManagementError("NOT_FOUND", "role assignment is not present");
    if (current.roleIds.length <= 1) throw new UserManagementError("VALIDATION_ERROR", "a staff account must keep at least one role");
    const reason = assertReason(reasonInput);
    const key = assertIdempotencyKey(idempotencyKey);
    return this.idempotent(actor, `remove-role:${current.id}:${role.id}`, key, { roleId: role.id, expectedVersion, reason }, () => {
      this.assertLastAdminGuard(current, current.status, current.roleIds.filter((id) => id !== role.id));
      const timestamp = nowIso(now);
      const next: StoredMembership = { ...current, roleIds: current.roleIds.filter((id) => id !== role.id), rowVersion: current.rowVersion + 1, updatedAt: timestamp, sessionRevokedAt: timestamp };
      this.memberships.set(current.id, next);
      this.recordAudit(actor, "ROLE_REMOVED", "STAFF", current.id, this.redactedMembership(current), this.redactedMembership(next), reason, timestamp);
      return this.publicStaff(next);
    });
  }

  createRole(actor: UserManagementActor, input: CreateRoleInput, now = new Date()): RoleDefinition {
    this.assertManage(actor, now);
    const code = assertText(input.code, "code", 64).toUpperCase();
    if (!ROLE_CODE_PATTERN.test(code) || STAFF_ROLE_CODES.includes(code as StaffRoleCode)) throw new UserManagementError("VALIDATION_ERROR", "custom role code is invalid or reserved");
    const displayName = assertText(input.displayName, "displayName", 160);
    const permissions = this.validatePermissions(input.permissions);
    const reason = assertReason(input.reason);
    const key = assertIdempotencyKey(input.idempotencyKey);
    return this.idempotent(actor, "create-role", key, { code, displayName, permissions, reason }, () => {
      if ([...this.roles.values()].some((role) => role.tenantId === actor.tenantId && role.code === code)) throw new UserManagementError("DUPLICATE", "role code already exists");
      const timestamp = nowIso(now);
      const role: RoleDefinition = { id: randomUUID(), tenantId: actor.tenantId, code, displayName, status: "ACTIVE", kind: "CUSTOM", permissions, createdAt: timestamp, updatedAt: timestamp, rowVersion: 1 };
      this.roles.set(role.id, role);
      this.recordAudit(actor, "ROLE_CREATED", "ROLE", role.id, undefined, { code: role.code, permissionCount: permissions.length }, reason, timestamp);
      return clone(role);
    });
  }

  updateRole(actor: UserManagementActor, roleId: string, input: UpdateRoleInput, now = new Date()): RoleDefinition {
    this.assertManage(actor, now);
    const current = this.getRole(actor, roleId);
    if (current.kind !== "CUSTOM") throw new UserManagementError("FORBIDDEN", "built-in roles are policy-locked");
    if (current.rowVersion !== input.expectedVersion) throw new UserManagementError("VERSION_CONFLICT", "role version is stale");
    const nextName = input.displayName === undefined ? current.displayName : assertText(input.displayName, "displayName", 160);
    const nextStatus = input.status ?? current.status;
    const nextPermissions = input.permissions === undefined ? current.permissions : this.validatePermissions(input.permissions);
    const reason = assertReason(input.reason);
    const key = assertIdempotencyKey(input.idempotencyKey);
    return this.idempotent(actor, `update-role:${current.id}`, key, { nextName, nextStatus, nextPermissions, expectedVersion: input.expectedVersion, reason }, () => {
      const next: RoleDefinition = { ...current, displayName: nextName, status: nextStatus, permissions: nextPermissions, rowVersion: current.rowVersion + 1, updatedAt: nowIso(now) };
      this.roles.set(current.id, next);
      this.recordAudit(actor, "ROLE_UPDATED", "ROLE", current.id, { code: current.code, status: current.status, permissionCount: current.permissions.length }, { code: next.code, status: next.status, permissionCount: next.permissions.length }, reason, next.updatedAt);
      return clone(next);
    });
  }

  private publicStaff(membership: StoredMembership): StaffMember {
    const roles = membership.roleIds.map((id) => this.roles.get(id)).filter((role): role is RoleDefinition => Boolean(role)).map((role) => ({ id: role.id, code: role.code, displayName: role.displayName, kind: role.kind }));
    return {
      id: membership.id,
      tenantId: membership.tenantId,
      accountId: membership.accountId,
      displayName: membership.displayName,
      emailMasked: membership.emailMasked,
      status: membership.status,
      roleIds: [...membership.roleIds],
      roles,
      departmentMemberships: membership.departmentMemberships.map(clone),
      ...(membership.sessionRevokedAt ? { sessionRevokedAt: membership.sessionRevokedAt } : {}),
      createdAt: membership.createdAt,
      updatedAt: membership.updatedAt,
      rowVersion: membership.rowVersion,
    };
  }

  private publicInvitation(invitation: StaffInvitation): StaffInvitation {
    const { ...publicValue } = invitation as StaffInvitation & { emailDigest?: string; tokenDigest?: string };
    delete (publicValue as Partial<StaffInvitation> & { emailDigest?: string; tokenDigest?: string }).emailDigest;
    delete (publicValue as Partial<StaffInvitation> & { emailDigest?: string; tokenDigest?: string }).tokenDigest;
    return clone(publicValue as StaffInvitation);
  }

  private getMembership(actor: UserManagementActor, membershipId: string): StoredMembership {
    const id = assertUuid(membershipId, "membershipId");
    const membership = this.memberships.get(id);
    if (!membership || membership.tenantId !== actor.tenantId || (actor.role !== "TENANT_ADMIN" && !membership.departmentMemberships.some((item) => actor.departmentIds.includes(item.departmentId)))) throw new UserManagementError("NOT_FOUND", "staff is not in the permitted tenant scope");
    return membership;
  }

  private getInvitation(actor: UserManagementActor, invitationId: string): StaffInvitation & { emailDigest: string; tokenDigest: string } {
    const id = assertUuid(invitationId, "invitationId");
    const invitation = this.invitations.get(id);
    if (!invitation || invitation.tenantId !== actor.tenantId || (actor.role !== "TENANT_ADMIN" && !invitation.departmentIds.some((item) => actor.departmentIds.includes(item)))) throw new UserManagementError("NOT_FOUND", "invitation is not in the permitted tenant scope");
    return invitation;
  }

  private getRole(actor: UserManagementActor, roleId: string): RoleDefinition {
    const id = assertUuid(roleId, "roleId");
    const role = this.roles.get(id);
    if (!role || role.tenantId !== actor.tenantId) throw new UserManagementError("NOT_FOUND", "role is not in the permitted tenant scope");
    return role;
  }

  private validateRoleIds(actor: UserManagementActor, roleIds: readonly string[]): string[] {
    if (!Array.isArray(roleIds) || roleIds.length < 1 || roleIds.length > MAX_ASSIGNED_ROLES) throw new UserManagementError("VALIDATION_ERROR", "roleIds must contain 1 to 4 roles");
    const ids = unique(roleIds).map((id) => assertUuid(id, "roleId"));
    if (ids.length !== roleIds.length) throw new UserManagementError("VALIDATION_ERROR", "roleIds must be unique");
    for (const id of ids) {
      const role = this.getRole(actor, id);
      if (role.status !== "ACTIVE") throw new UserManagementError("INVALID_STATE", "role is inactive");
      if (role.permissions.some((permission) => permission.action === "SUPPORT_ACCESS" || permission.scope === "SYSTEM")) throw new UserManagementError("FORBIDDEN", "system support access cannot be assigned through tenant staff management");
    }
    return ids;
  }

  private validateDepartmentIds(actor: UserManagementActor, departmentIds: readonly string[]): string[] {
    if (!Array.isArray(departmentIds) || departmentIds.length > MAX_DEPARTMENTS) throw new UserManagementError("VALIDATION_ERROR", "departmentIds is invalid");
    const ids = unique(departmentIds).map((id) => assertUuid(id, "departmentId"));
    if (actor.role !== "TENANT_ADMIN" && ids.some((id) => !actor.departmentIds.includes(id))) throw new UserManagementError("FORBIDDEN", "department is outside the actor scope");
    if (ids.some((id) => !this.departmentIds.has(id))) throw new UserManagementError("NOT_FOUND", "department is not available");
    return ids;
  }

  private validatePermissions(permissions: readonly Permission[]): readonly Permission[] {
    if (!Array.isArray(permissions) || permissions.length > 40) throw new UserManagementError("VALIDATION_ERROR", "permissions is invalid");
    const output = permissions.map((permission) => {
      if (!permission || !PERMISSION_RESOURCES.includes(permission.resource) || !PERMISSION_ACTIONS.includes(permission.action) || !PERMISSION_SCOPES.includes(permission.scope)) throw new UserManagementError("VALIDATION_ERROR", "permission is invalid");
      if (permission.action === "SUPPORT_ACCESS" || permission.scope === "SYSTEM") throw new UserManagementError("FORBIDDEN", "system support access is not tenant configurable");
      return { resource: permission.resource, action: permission.action, scope: permission.scope };
    });
    const keys = output.map((permission) => `${permission.resource}:${permission.action}:${permission.scope}`);
    if (new Set(keys).size !== keys.length) throw new UserManagementError("VALIDATION_ERROR", "permissions must be unique");
    return output;
  }

  private assertLastAdminGuard(membership: StoredMembership, nextStatus: MembershipStatus, nextRoleIds: readonly string[]): void {
    const adminRoleId = BUILT_IN_ROLE_IDS.TENANT_ADMIN;
    if (membership.status === "ACTIVE" && membership.roleIds.includes(adminRoleId) && (nextStatus !== "ACTIVE" || !nextRoleIds.includes(adminRoleId))) {
      const remaining = [...this.memberships.values()].filter((candidate) => candidate.tenantId === membership.tenantId && candidate.id !== membership.id && candidate.status === "ACTIVE" && candidate.roleIds.includes(adminRoleId));
      if (remaining.length === 0) throw new UserManagementError("LAST_ADMIN_GUARD", "tenant must keep at least one active tenant admin");
    }
  }

  private assertTenant(actor: UserManagementActor): void {
    assertUuid(actor.tenantId, "tenantId");
    assertUuid(actor.accountId, "accountId");
    if (actor.tenantId !== USER_MANAGEMENT_TENANT_ID) throw new UserManagementError("NOT_FOUND", "tenant is not available");
  }

  private assertManage(actor: UserManagementActor, now: Date): void {
    this.assertTenant(actor);
    if (actor.role !== "TENANT_ADMIN") throw new UserManagementError("FORBIDDEN", "only tenant admin can manage staff");
    if (!actor.mfaVerified || !actor.reauthenticatedAt || now.getTime() - Date.parse(actor.reauthenticatedAt) > STEP_UP_WINDOW_MS || Date.parse(actor.reauthenticatedAt) > now.getTime()) throw new UserManagementError("FORBIDDEN", "recent MFA step-up is required");
  }

  private idempotent<T>(actor: UserManagementActor, operation: string, key: string, input: unknown, execute: () => T): T {
    const composite = `${actor.tenantId}:${actor.accountId}:${operation}:${key}`;
    const hash = requestHash(input);
    const previous = this.idempotency.get(composite);
    if (previous) {
      if (previous.requestHash !== hash) throw new UserManagementError("IDEMPOTENCY_CONFLICT", "idempotency key was reused with different input");
      return clone(previous.value) as T;
    }
    const value = execute();
    this.idempotency.set(composite, { requestHash: hash, value: clone(value) });
    return clone(value);
  }

  private recordAudit(actor: UserManagementActor, action: string, resourceType: UserAuditEntry["resourceType"], resourceId: string, beforeRedacted: Record<string, unknown> | undefined, afterRedacted: Record<string, unknown> | undefined, reason: string, occurredAt = nowIso()): void {
    this.audits.push({ id: randomUUID(), tenantId: actor.tenantId, actorAccountId: actor.accountId, action, resourceType, resourceId, ...(beforeRedacted ? { beforeRedacted: clone(beforeRedacted) } : {}), ...(afterRedacted ? { afterRedacted: clone(afterRedacted) } : {}), reason, occurredAt });
  }

  private redactedMembership(membership: StoredMembership): Record<string, unknown> {
    return { status: membership.status, roleCount: membership.roleIds.length, departmentCount: membership.departmentMemberships.length, emailMasked: membership.emailMasked };
  }
}

export const createSyntheticUserManagementSnapshot = (): UserManagementSnapshot => {
  const timestamp = "2026-08-11T00:00:00.000Z";
  const roles: RoleDefinition[] = STAFF_ROLE_CODES.map((code) => ({ id: BUILT_IN_ROLE_IDS[code], tenantId: USER_MANAGEMENT_TENANT_ID, code, displayName: BUILT_IN_ROLE_LABELS[code], status: "ACTIVE", kind: code, permissions: [...BUILT_IN_ROLE_PERMISSIONS[code]], createdAt: timestamp, updatedAt: timestamp, rowVersion: 1 }));
  const members: StaffMember[] = [
    { id: "20000000-0000-4000-8000-000000000001", tenantId: USER_MANAGEMENT_TENANT_ID, accountId: "10000000-0000-4000-8000-000000000003", displayName: "ผู้ดูแลเทศบาล", emailMasked: "a***@synthetic.invalid", status: "ACTIVE", roleIds: [BUILT_IN_ROLE_IDS.TENANT_ADMIN], roles: [{ id: BUILT_IN_ROLE_IDS.TENANT_ADMIN, code: "TENANT_ADMIN", displayName: BUILT_IN_ROLE_LABELS.TENANT_ADMIN, kind: "TENANT_ADMIN" }], departmentMemberships: [], createdAt: timestamp, updatedAt: timestamp, rowVersion: 1 },
    { id: "20000000-0000-4000-8000-000000000002", tenantId: USER_MANAGEMENT_TENANT_ID, accountId: "10000000-0000-4000-8000-000000000001", displayName: "เจ้าหน้าที่ตัวอย่าง", emailMasked: "s***@synthetic.invalid", status: "ACTIVE", roleIds: [BUILT_IN_ROLE_IDS.STAFF], roles: [{ id: BUILT_IN_ROLE_IDS.STAFF, code: "STAFF", displayName: BUILT_IN_ROLE_LABELS.STAFF, kind: "STAFF" }], departmentMemberships: [{ departmentId: USER_MANAGEMENT_DEPARTMENT_ID, roleInDepartment: "STAFF", isPrimary: true }], createdAt: timestamp, updatedAt: timestamp, rowVersion: 1 },
    { id: "20000000-0000-4000-8000-000000000003", tenantId: USER_MANAGEMENT_TENANT_ID, accountId: "10000000-0000-4000-8000-000000000004", displayName: "หัวหน้ากองช่าง", emailMasked: "h***@synthetic.invalid", status: "ACTIVE", roleIds: [BUILT_IN_ROLE_IDS.DEPARTMENT_HEAD], roles: [{ id: BUILT_IN_ROLE_IDS.DEPARTMENT_HEAD, code: "DEPARTMENT_HEAD", displayName: BUILT_IN_ROLE_LABELS.DEPARTMENT_HEAD, kind: "DEPARTMENT_HEAD" }], departmentMemberships: [{ departmentId: USER_MANAGEMENT_DEPARTMENT_ID, roleInDepartment: "HEAD", isPrimary: true }], createdAt: timestamp, updatedAt: timestamp, rowVersion: 1 },
  ];
  return { staff: members, invitations: [], roles, audit: [] };
};

export const createSyntheticUserManagementRepository = (): InMemoryUserManagementRepository => new InMemoryUserManagementRepository();
