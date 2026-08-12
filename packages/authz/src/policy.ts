import { z } from "zod";

export const AUTH_ACTIONS = [
  "VIEW",
  "CREATE",
  "UPDATE",
  "ASSIGN",
  "FORWARD",
  "REPLY",
  "RESOLVE",
  "CLOSE",
  "PUBLISH",
  "EXPORT",
  "MANAGE",
  "SUPPORT_ACCESS",
] as const;

export const AUTH_SCOPES = ["OWN", "ASSIGNED", "DEPARTMENT", "TENANT", "SYSTEM"] as const;

export const AUTH_RESOURCES = [
  "COMPLAINT",
  "SUPPORT_TICKET",
  "KNOWLEDGE",
  "NEWS",
  "SERVICE",
  "KPI",
  "SETTINGS",
  "STAFF",
  "AUDIT",
  "JOB",
] as const;

export const AUTH_ERROR_CODES = ["UNAUTHENTICATED", "FORBIDDEN"] as const;

export type AuthAction = (typeof AUTH_ACTIONS)[number];
export type AuthScope = (typeof AUTH_SCOPES)[number];
export type AuthResource = (typeof AUTH_RESOURCES)[number];
export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export type StaffRole =
  | "STAFF"
  | "DEPARTMENT_HEAD"
  | "PR_STAFF"
  | "KNOWLEDGE_STAFF"
  | "TENANT_ADMIN"
  | "EXECUTIVE";

export type MembershipStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
export type AccountStatus = "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

export type DepartmentMembershipSnapshot = {
  departmentId: string;
  roleInDepartment: "STAFF" | "HEAD" | "KNOWLEDGE" | "PR";
  isPrimary: boolean;
};

export type SupportAccessGrantSnapshot = {
  grantId: string;
  tenantId: string;
  resource: "TENANT" | AuthResource;
  resourceId?: string;
  status: "REQUESTED" | "APPROVED" | "REVOKED" | "EXPIRED";
  expiresAt: Date;
  revokedAt?: Date | null;
};

export type SessionMembershipSnapshot = {
  accountId: string;
  accountStatus: AccountStatus;
  tenantId: string;
  membershipId?: string;
  membershipStatus?: MembershipStatus;
  tenantStatus: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  tenantRoles: readonly StaffRole[];
  departmentMemberships: readonly DepartmentMembershipSnapshot[];
  isSuperAdmin: boolean;
  mfaVerified: boolean;
  reauthenticatedAt?: Date | null;
  revokedAt?: Date | null;
  supportAccessGrants: readonly SupportAccessGrantSnapshot[];
};

export type TrustedSessionContext = {
  accountId: string;
  accountStatus: AccountStatus;
  sessionId: string;
  tenantId: string;
  membershipId?: string;
  expiresAt: Date;
  tenantRoles: readonly StaffRole[];
  departmentMemberships: readonly DepartmentMembershipSnapshot[];
  isSuperAdmin: boolean;
  mfaVerified: boolean;
  reauthenticatedAt?: Date | null;
  revokedAt?: Date | null;
  supportAccessGrants: readonly SupportAccessGrantSnapshot[];
};

export type SessionResolution =
  | { ok: true; context: TrustedSessionContext }
  | { ok: false; errorCode: "UNAUTHENTICATED" };

export type AuthorizationRequest = {
  tenantId: string;
  resource: AuthResource;
  action: AuthAction;
  scope: AuthScope;
  resourceId?: string;
  ownerAccountId?: string;
  assignedAccountId?: string;
  departmentId?: string;
  requiresReauth?: boolean;
  aggregateOnly?: boolean;
};

export type AuthorizationDecision =
  | { allowed: true }
  | {
      allowed: false;
      errorCode: AuthErrorCode;
      mfaRequired?: boolean;
      reauthRequired?: boolean;
      supportAccessRequired?: boolean;
    };

export type AuthorizationAuditRecord = {
  tenantId: string;
  actorAccountId: string | null;
  eventType: "AUTHORIZATION_DECISION";
  outcome: "ALLOWED" | "DENIED";
  errorCode?: AuthErrorCode;
  resourceType: AuthResource;
  resourceId?: string;
  action: AuthAction;
  createdAt: Date;
};

export const VerifiedSessionClaimsSchema = z
  .object({
    sub: z.string().uuid(),
    session_id: z.string().uuid(),
    exp: z.number().int().positive(),
    tenant_id: z.string().uuid(),
    membership_id: z.string().uuid().optional(),
    aal: z.enum(["aal1", "aal2"]).optional(),
    amr: z.array(z.string().min(1)).optional(),
  })
  .strict();

type PermissionRule = {
  resource: AuthResource;
  action: AuthAction;
  scope: AuthScope;
};

const rule = (resource: AuthResource, action: AuthAction, scope: AuthScope): PermissionRule => ({
  resource,
  action,
  scope,
});

const rules = (resource: AuthResource, actions: readonly AuthAction[], scope: AuthScope): PermissionRule[] =>
  actions.map((action) => rule(resource, action, scope));

const OPERATIONAL_ACTIONS: readonly AuthAction[] = [
  "VIEW",
  "CREATE",
  "UPDATE",
  "ASSIGN",
  "FORWARD",
  "REPLY",
  "RESOLVE",
  "CLOSE",
];

const CONTENT_MANAGEMENT_ACTIONS: readonly AuthAction[] = [
  "VIEW",
  "CREATE",
  "UPDATE",
  "PUBLISH",
  "MANAGE",
];

const ROLE_POLICY: Readonly<Record<StaffRole, readonly PermissionRule[]>> = {
  STAFF: [
    rule("COMPLAINT", "VIEW", "DEPARTMENT"),
    rule("COMPLAINT", "UPDATE", "ASSIGNED"),
    rule("COMPLAINT", "REPLY", "ASSIGNED"),
    rule("SUPPORT_TICKET", "VIEW", "DEPARTMENT"),
    rule("SUPPORT_TICKET", "REPLY", "ASSIGNED"),
    rule("KPI", "VIEW", "DEPARTMENT"),
    rule("SETTINGS", "VIEW", "OWN"),
    rule("NEWS", "VIEW", "TENANT"),
    rule("SERVICE", "VIEW", "TENANT"),
  ],
  DEPARTMENT_HEAD: [
    ...rules("COMPLAINT", OPERATIONAL_ACTIONS, "DEPARTMENT"),
    ...rules("SUPPORT_TICKET", OPERATIONAL_ACTIONS, "DEPARTMENT"),
    rule("KPI", "VIEW", "DEPARTMENT"),
    rule("KPI", "EXPORT", "DEPARTMENT"),
    rule("KNOWLEDGE", "VIEW", "DEPARTMENT"),
    rule("NEWS", "VIEW", "TENANT"),
    rule("SERVICE", "VIEW", "TENANT"),
    rule("SETTINGS", "VIEW", "DEPARTMENT"),
  ],
  KNOWLEDGE_STAFF: [
    ...rules("KNOWLEDGE", CONTENT_MANAGEMENT_ACTIONS, "TENANT"),
    rule("NEWS", "VIEW", "TENANT"),
    rule("SERVICE", "VIEW", "TENANT"),
    rule("SETTINGS", "VIEW", "OWN"),
  ],
  PR_STAFF: [
    ...rules("NEWS", CONTENT_MANAGEMENT_ACTIONS, "TENANT"),
    ...rules("SERVICE", CONTENT_MANAGEMENT_ACTIONS, "TENANT"),
    rule("KNOWLEDGE", "VIEW", "TENANT"),
    rule("SETTINGS", "VIEW", "OWN"),
  ],
  TENANT_ADMIN: [
    ...rules("COMPLAINT", OPERATIONAL_ACTIONS, "TENANT"),
    ...rules("SUPPORT_TICKET", OPERATIONAL_ACTIONS, "TENANT"),
    ...rules("KNOWLEDGE", CONTENT_MANAGEMENT_ACTIONS, "TENANT"),
    ...rules("NEWS", CONTENT_MANAGEMENT_ACTIONS, "TENANT"),
    ...rules("SERVICE", CONTENT_MANAGEMENT_ACTIONS, "TENANT"),
    rule("KPI", "VIEW", "TENANT"),
    rule("KPI", "EXPORT", "TENANT"),
    rule("SETTINGS", "VIEW", "TENANT"),
    rule("SETTINGS", "MANAGE", "TENANT"),
    rule("STAFF", "VIEW", "TENANT"),
    rule("STAFF", "MANAGE", "TENANT"),
    rule("AUDIT", "VIEW", "TENANT"),
    rule("AUDIT", "EXPORT", "TENANT"),
    rule("JOB", "VIEW", "TENANT"),
    rule("JOB", "MANAGE", "TENANT"),
  ],
  EXECUTIVE: [
    rule("KPI", "VIEW", "TENANT"),
    rule("KPI", "EXPORT", "TENANT"),
    rule("COMPLAINT", "VIEW", "TENANT"),
    rule("SUPPORT_TICKET", "VIEW", "TENANT"),
    rule("NEWS", "VIEW", "TENANT"),
    rule("SERVICE", "VIEW", "TENANT"),
  ],
};

const SCOPE_RANK: Record<Exclude<AuthScope, "SYSTEM">, number> = {
  OWN: 1,
  ASSIGNED: 2,
  DEPARTMENT: 3,
  TENANT: 4,
};

const ACTIVE_SESSION_WINDOW_MS = 5 * 60 * 1000;

const unauthenticated = (): AuthorizationDecision => ({
  allowed: false,
  errorCode: "UNAUTHENTICATED",
});

const forbidden = (details: Omit<Extract<AuthorizationDecision, { allowed: false }>, "allowed" | "errorCode"> = {}): AuthorizationDecision => ({
  allowed: false,
  errorCode: "FORBIDDEN",
  ...details,
});

const isDate = (value: Date | null | undefined): value is Date => value instanceof Date && !Number.isNaN(value.getTime());

const isActiveSession = (context: TrustedSessionContext, now: Date): boolean =>
  context.accountStatus === "ACTIVE" &&
  context.expiresAt.getTime() > now.getTime() &&
  (!context.revokedAt || context.revokedAt.getTime() > now.getTime());

const isMfaRequired = (context: TrustedSessionContext): boolean => context.isSuperAdmin || context.tenantRoles.includes("TENANT_ADMIN");

const hasRecentReauthentication = (context: TrustedSessionContext, now: Date): boolean => {
  if (!isDate(context.reauthenticatedAt)) return false;
  const age = now.getTime() - context.reauthenticatedAt.getTime();
  return age >= 0 && age <= ACTIVE_SESSION_WINDOW_MS;
};

const scopeCoveredByRule = (ruleScope: AuthScope, requestedScope: AuthScope): boolean => {
  if (ruleScope === "SYSTEM" || requestedScope === "SYSTEM") return ruleScope === requestedScope;
  return SCOPE_RANK[ruleScope] >= SCOPE_RANK[requestedScope];
};

const subjectMatchesScope = (context: TrustedSessionContext, request: AuthorizationRequest): boolean => {
  switch (request.scope) {
    case "OWN":
      return request.ownerAccountId === context.accountId;
    case "ASSIGNED":
      return request.assignedAccountId === context.accountId;
    case "DEPARTMENT":
      return Boolean(request.departmentId && context.departmentMemberships.some((item) => item.departmentId === request.departmentId));
    case "TENANT":
      return true;
    case "SYSTEM":
      return context.isSuperAdmin;
  }
};

const grantMatchesRequest = (context: TrustedSessionContext, request: AuthorizationRequest, now: Date): boolean =>
  context.supportAccessGrants.some(
    (grant) =>
      grant.status === "APPROVED" &&
      grant.tenantId === context.tenantId &&
      grant.expiresAt.getTime() > now.getTime() &&
      (!grant.revokedAt || grant.revokedAt.getTime() > now.getTime()) &&
      (grant.resource === "TENANT" || grant.resource === request.resource) &&
      (!grant.resourceId || grant.resourceId === request.resourceId),
  );

export const buildTrustedSessionContext = (
  rawClaims: unknown,
  snapshot: SessionMembershipSnapshot,
  now = new Date(),
): SessionResolution => {
  const claims = VerifiedSessionClaimsSchema.safeParse(rawClaims);
  if (!claims.success) return { ok: false, errorCode: "UNAUTHENTICATED" };
  if (!isDate(now) || claims.data.sub !== snapshot.accountId || claims.data.tenant_id !== snapshot.tenantId) {
    return { ok: false, errorCode: "UNAUTHENTICATED" };
  }
  if (claims.data.membership_id && claims.data.membership_id !== snapshot.membershipId) {
    return { ok: false, errorCode: "UNAUTHENTICATED" };
  }
  if (
    claims.data.exp * 1000 <= now.getTime() ||
    snapshot.accountStatus !== "ACTIVE" ||
    snapshot.tenantStatus !== "ACTIVE" ||
    Boolean(snapshot.revokedAt && snapshot.revokedAt.getTime() <= now.getTime())
  ) {
    return { ok: false, errorCode: "UNAUTHENTICATED" };
  }
  if (!snapshot.isSuperAdmin && (!snapshot.membershipId || snapshot.membershipStatus !== "ACTIVE")) {
    return { ok: false, errorCode: "UNAUTHENTICATED" };
  }

  return {
    ok: true,
    context: {
      accountId: snapshot.accountId,
      accountStatus: snapshot.accountStatus,
      sessionId: claims.data.session_id,
      tenantId: snapshot.tenantId,
      membershipId: snapshot.membershipId,
      expiresAt: new Date(claims.data.exp * 1000),
      tenantRoles: [...snapshot.tenantRoles],
      departmentMemberships: [...snapshot.departmentMemberships],
      isSuperAdmin: snapshot.isSuperAdmin,
      mfaVerified: snapshot.mfaVerified,
      reauthenticatedAt: snapshot.reauthenticatedAt,
      revokedAt: snapshot.revokedAt,
      supportAccessGrants: [...snapshot.supportAccessGrants],
    },
  };
};

export const authorize = (
  context: TrustedSessionContext | null | undefined,
  request: AuthorizationRequest,
  now = new Date(),
): AuthorizationDecision => {
  if (!context || !isDate(now) || !isActiveSession(context, now)) return unauthenticated();
  if (context.tenantId !== request.tenantId) return forbidden();
  if (isMfaRequired(context) && !context.mfaVerified) return forbidden({ mfaRequired: true });
  if (request.requiresReauth && !hasRecentReauthentication(context, now)) return forbidden({ reauthRequired: true });

  if (context.isSuperAdmin) {
    if (request.scope === "SYSTEM" && request.action === "SUPPORT_ACCESS") return { allowed: true };
    if (!grantMatchesRequest(context, request, now)) return forbidden({ supportAccessRequired: true });
    return { allowed: true };
  }

  if (
    (request.resource === "COMPLAINT" || request.resource === "SUPPORT_TICKET") &&
    context.tenantRoles.includes("EXECUTIVE") &&
    !request.aggregateOnly
  ) {
    return forbidden();
  }

  if (!subjectMatchesScope(context, request)) return forbidden();

  const matchingRule = context.tenantRoles
    .flatMap((role) => ROLE_POLICY[role])
    .some(
      (permission) =>
        permission.resource === request.resource &&
        permission.action === request.action &&
        scopeCoveredByRule(permission.scope, request.scope),
    );

  return matchingRule ? { allowed: true } : forbidden();
};

export const toAuthorizationAuditRecord = (
  context: TrustedSessionContext | null | undefined,
  request: AuthorizationRequest,
  decision: AuthorizationDecision,
  now = new Date(),
): AuthorizationAuditRecord => ({
  tenantId: context?.tenantId ?? request.tenantId,
  actorAccountId: context?.accountId ?? null,
  eventType: "AUTHORIZATION_DECISION",
  outcome: decision.allowed ? "ALLOWED" : "DENIED",
  ...(decision.allowed ? {} : { errorCode: decision.errorCode }),
  resourceType: request.resource,
  ...(request.resourceId ? { resourceId: request.resourceId } : {}),
  action: request.action,
  createdAt: now,
});

export class AuthorizationError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode) {
    super(code === "UNAUTHENTICATED" ? "ต้องเข้าสู่ระบบก่อนดำเนินการ" : "ไม่มีสิทธิ์ดำเนินการ");
    this.name = "AuthorizationError";
    this.code = code;
  }
}

export const assertAuthorized = (
  context: TrustedSessionContext | null | undefined,
  request: AuthorizationRequest,
  now = new Date(),
): void => {
  const decision = authorize(context, request, now);
  if (!decision.allowed) throw new AuthorizationError(decision.errorCode);
};

export const policyMatrix = (): Readonly<Record<StaffRole, readonly PermissionRule[]>> => ROLE_POLICY;
