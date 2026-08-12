import { describe, expect, it } from "vitest";

import {
  AuthorizationError,
  VerifiedSessionClaimsSchema,
  assertAuthorized,
  authorize,
  buildTrustedSessionContext,
  policyMatrix,
  toAuthorizationAuditRecord,
  type AuthorizationRequest,
  type SessionMembershipSnapshot,
  type StaffRole,
  type TrustedSessionContext,
} from "./policy";

const NOW = new Date("2026-08-10T04:00:00.000Z");
const TENANT_A = "00000000-0000-4000-8000-000000000001";
const TENANT_B = "00000000-0000-4000-8000-000000000002";
const ACCOUNT_A = "10000000-0000-4000-8000-000000000001";
const ACCOUNT_B = "10000000-0000-4000-8000-000000000002";
const DEPARTMENT_A1 = "30000000-0000-4000-8000-000000000001";
const DEPARTMENT_A2 = "30000000-0000-4000-8000-000000000002";

const baseSnapshot = (overrides: Partial<SessionMembershipSnapshot> = {}): SessionMembershipSnapshot => ({
  accountId: ACCOUNT_A,
  accountStatus: "ACTIVE",
  tenantId: TENANT_A,
  membershipId: "20000000-0000-4000-8000-000000000001",
  membershipStatus: "ACTIVE",
  tenantStatus: "ACTIVE",
  tenantRoles: ["STAFF"],
  departmentMemberships: [{ departmentId: DEPARTMENT_A1, roleInDepartment: "STAFF", isPrimary: true }],
  isSuperAdmin: false,
  mfaVerified: false,
  reauthenticatedAt: null,
  revokedAt: null,
  supportAccessGrants: [],
  ...overrides,
});

const baseContext = (overrides: Partial<TrustedSessionContext> = {}): TrustedSessionContext => ({
  accountId: ACCOUNT_A,
  accountStatus: "ACTIVE",
  sessionId: "90000000-0000-4000-8000-000000000001",
  tenantId: TENANT_A,
  membershipId: "20000000-0000-4000-8000-000000000001",
  expiresAt: new Date("2026-08-10T05:00:00.000Z"),
  tenantRoles: ["STAFF"],
  departmentMemberships: [{ departmentId: DEPARTMENT_A1, roleInDepartment: "STAFF", isPrimary: true }],
  isSuperAdmin: false,
  mfaVerified: false,
  reauthenticatedAt: null,
  revokedAt: null,
  supportAccessGrants: [],
  ...overrides,
});

const request = (overrides: Partial<AuthorizationRequest> = {}): AuthorizationRequest => ({
  tenantId: TENANT_A,
  resource: "COMPLAINT",
  action: "VIEW",
  scope: "DEPARTMENT",
  departmentId: DEPARTMENT_A1,
  ...overrides,
});

describe("verified session resolution", () => {
  it("rejects malformed, expired, revoked, and cross-tenant claims", () => {
    expect(VerifiedSessionClaimsSchema.safeParse({}).success).toBe(false);
    const claims = {
      sub: ACCOUNT_A,
      session_id: "90000000-0000-4000-8000-000000000001",
      exp: Math.floor(NOW.getTime() / 1000) + 3600,
      tenant_id: TENANT_A,
      membership_id: "20000000-0000-4000-8000-000000000001",
    };
    expect(buildTrustedSessionContext({ ...claims, tenant_id: TENANT_B }, baseSnapshot(), NOW).ok).toBe(false);
    expect(buildTrustedSessionContext({ ...claims, exp: Math.floor(NOW.getTime() / 1000) - 1 }, baseSnapshot(), NOW).ok).toBe(false);
    expect(buildTrustedSessionContext(claims, baseSnapshot({ revokedAt: new Date("2026-08-10T03:00:00.000Z") }), NOW).ok).toBe(false);
    expect(buildTrustedSessionContext(claims, baseSnapshot({ accountStatus: "DEACTIVATED" }), NOW).ok).toBe(false);
  });

  it("builds a trusted context from verified claims and current membership snapshot", () => {
    const result = buildTrustedSessionContext(
      {
        sub: ACCOUNT_A,
        session_id: "90000000-0000-4000-8000-000000000001",
        exp: Math.floor(NOW.getTime() / 1000) + 3600,
        tenant_id: TENANT_A,
        membership_id: "20000000-0000-4000-8000-000000000001",
        aal: "aal2",
        amr: ["password", "mfa"],
      },
      baseSnapshot({ mfaVerified: true }),
      NOW,
    );
    expect(result).toMatchObject({ ok: true, context: { accountId: ACCOUNT_A, tenantId: TENANT_A, mfaVerified: true } });
  });
});

describe("server-side authorization policy", () => {
  it("covers the explicit role/resource/action matrix without wildcard permissions", () => {
    const matrix = policyMatrix();
    expect(Object.keys(matrix)).toEqual([
      "STAFF",
      "DEPARTMENT_HEAD",
      "KNOWLEDGE_STAFF",
      "PR_STAFF",
      "TENANT_ADMIN",
      "EXECUTIVE",
    ]);
    for (const rules of Object.values(matrix)) {
      expect(rules.length).toBeGreaterThan(0);
      for (const permission of rules) {
        expect(permission.resource).not.toBe("*");
        expect(permission.action).not.toBe("*");
      }
    }

    for (const [role, roleRules] of Object.entries(matrix)) {
      const mfaVerified = role === "TENANT_ADMIN";
      for (const permission of roleRules) {
        const scopeDetails: Partial<AuthorizationRequest> =
          permission.scope === "OWN"
            ? { ownerAccountId: ACCOUNT_A }
            : permission.scope === "ASSIGNED"
              ? { assignedAccountId: ACCOUNT_A }
              : permission.scope === "DEPARTMENT"
                ? { departmentId: DEPARTMENT_A1 }
                : {};
        const aggregateOnly = role === "EXECUTIVE" && (permission.resource === "COMPLAINT" || permission.resource === "SUPPORT_TICKET");
        expect(
          authorize(
            baseContext({ tenantRoles: [role as StaffRole], mfaVerified }),
            request({
              resource: permission.resource,
              action: permission.action,
              scope: permission.scope,
              aggregateOnly,
              ...scopeDetails,
            }),
            NOW,
          ),
        ).toEqual({ allowed: true });
      }
    }
  });

  it("allows staff department read but limits mutation to assigned work", () => {
    expect(authorize(baseContext(), request(), NOW)).toEqual({ allowed: true });
    expect(
      authorize(
        baseContext(),
        request({ action: "REPLY", scope: "ASSIGNED", assignedAccountId: ACCOUNT_A }),
        NOW,
      ),
    ).toEqual({ allowed: true });
    expect(
      authorize(
        baseContext(),
        request({ action: "REPLY", scope: "ASSIGNED", assignedAccountId: ACCOUNT_B }),
        NOW,
      ),
    ).toMatchObject({ allowed: false, errorCode: "FORBIDDEN" });
    expect(
      authorize(baseContext(), request({ action: "CLOSE", scope: "DEPARTMENT" }), NOW),
    ).toMatchObject({ allowed: false, errorCode: "FORBIDDEN" });
  });

  it("enforces tenant boundary, expired/revoked session, and department scope", () => {
    expect(authorize(baseContext(), request({ tenantId: TENANT_B }), NOW)).toMatchObject({ allowed: false, errorCode: "FORBIDDEN" });
    expect(authorize(baseContext({ expiresAt: new Date("2026-08-10T03:59:00.000Z") }), request(), NOW)).toEqual({
      allowed: false,
      errorCode: "UNAUTHENTICATED",
    });
    expect(authorize(baseContext({ revokedAt: new Date("2026-08-10T03:00:00.000Z") }), request(), NOW)).toEqual({
      allowed: false,
      errorCode: "UNAUTHENTICATED",
    });
    expect(
      authorize(baseContext(), request({ departmentId: DEPARTMENT_A2 }), NOW),
    ).toMatchObject({ allowed: false, errorCode: "FORBIDDEN" });
  });

  it("requires MFA for Tenant Admin and recent re-authentication for sensitive reads", () => {
    const admin = baseContext({ tenantRoles: ["TENANT_ADMIN"] });
    expect(authorize(admin, request({ resource: "SETTINGS", action: "MANAGE", scope: "TENANT" }), NOW)).toEqual({
      allowed: false,
      errorCode: "FORBIDDEN",
      mfaRequired: true,
    });
    const verifiedAdmin = baseContext({ tenantRoles: ["TENANT_ADMIN"], mfaVerified: true });
    expect(authorize(verifiedAdmin, request({ resource: "SETTINGS", action: "MANAGE", scope: "TENANT" }), NOW)).toEqual({ allowed: true });
    expect(
      authorize(verifiedAdmin, request({ requiresReauth: true }), NOW),
    ).toMatchObject({ allowed: false, errorCode: "FORBIDDEN", reauthRequired: true });
    expect(
      authorize(
        { ...verifiedAdmin, reauthenticatedAt: new Date("2026-08-10T03:58:00.000Z") },
        request({ requiresReauth: true }),
        NOW,
      ),
    ).toEqual({ allowed: true });
  });

  it("requires a live JIT grant for Super Admin and does not allow silent impersonation", () => {
    const superAdmin = baseContext({
      membershipId: undefined,
      isSuperAdmin: true,
      mfaVerified: true,
      supportAccessGrants: [],
    });
    expect(authorize(superAdmin, request({ resource: "COMPLAINT", action: "VIEW", scope: "TENANT" }), NOW)).toEqual({
      allowed: false,
      errorCode: "FORBIDDEN",
      supportAccessRequired: true,
    });
    expect(
      authorize(
        {
          ...superAdmin,
          supportAccessGrants: [
            {
              grantId: "91000000-0000-4000-8000-000000000001",
              tenantId: TENANT_A,
              resource: "COMPLAINT",
              resourceId: "80000000-0000-4000-8000-000000000001",
              status: "APPROVED",
              expiresAt: new Date("2026-08-10T04:30:00.000Z"),
            },
          ],
        },
        request({ resourceId: "80000000-0000-4000-8000-000000000001" }),
        NOW,
      ),
    ).toEqual({ allowed: true });
    expect(authorize(superAdmin, request({ scope: "SYSTEM", action: "SUPPORT_ACCESS", resource: "AUDIT" }), NOW)).toEqual({ allowed: true });
  });

  it("takes role changes immediately and never returns resource existence details", () => {
    const staff = baseContext();
    expect(authorize(staff, request(), NOW)).toEqual({ allowed: true });
    expect(authorize({ ...staff, tenantRoles: [] }, request(), NOW)).toEqual({ allowed: false, errorCode: "FORBIDDEN" });
    expect(authorize(staff, request({ action: "MANAGE", resource: "STAFF", scope: "TENANT" }), NOW)).toEqual({ allowed: false, errorCode: "FORBIDDEN" });
    expect(() => assertAuthorized(staff, request({ action: "CLOSE", scope: "DEPARTMENT" }), NOW)).toThrowError(AuthorizationError);
    expect(
      toAuthorizationAuditRecord(staff, request({ action: "CLOSE", scope: "DEPARTMENT" }), { allowed: false, errorCode: "FORBIDDEN" }, NOW),
    ).toEqual({
      tenantId: TENANT_A,
      actorAccountId: ACCOUNT_A,
      eventType: "AUTHORIZATION_DECISION",
      outcome: "DENIED",
      errorCode: "FORBIDDEN",
      resourceType: "COMPLAINT",
      action: "CLOSE",
      createdAt: NOW,
    });
  });
});
