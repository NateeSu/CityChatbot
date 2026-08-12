import type { AuditOperationsActor } from "@citychatbot/audit-observability";

import {
  SYNTHETIC_AUDIT_ADMIN_ACCOUNT_ID,
  SYNTHETIC_AUDIT_EXECUTIVE_ACCOUNT_ID,
  SYNTHETIC_AUDIT_HEAD_ACCOUNT_ID,
  SYNTHETIC_AUDIT_MEMBERSHIP_ID,
  SYNTHETIC_AUDIT_STAFF_ACCOUNT_ID,
  SYNTHETIC_AUDIT_TENANT_ID,
} from "@citychatbot/audit-observability";

export const LOCAL_AUDIT_TENANT_ID = SYNTHETIC_AUDIT_TENANT_ID;

export const isAuditLocalEnvironment = (): boolean => {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  return environment === "local" || environment === "test";
};

export const localAuditContext = (url: URL): AuditOperationsActor | undefined => {
  if (url.searchParams.get("tenantId") !== LOCAL_AUDIT_TENANT_ID) return undefined;
  const role = url.searchParams.get("role");
  const accountId = url.searchParams.get("accountId");
  if (role === "TENANT_ADMIN" && accountId === SYNTHETIC_AUDIT_ADMIN_ACCOUNT_ID) {
    return {
      tenantId: LOCAL_AUDIT_TENANT_ID,
      accountId,
      role,
      membershipId: SYNTHETIC_AUDIT_MEMBERSHIP_ID,
      mfaVerified: url.searchParams.get("stepUp") !== "0",
    };
  }
  if (role === "EXECUTIVE" && accountId === SYNTHETIC_AUDIT_EXECUTIVE_ACCOUNT_ID) return { tenantId: LOCAL_AUDIT_TENANT_ID, accountId, role };
  if (role === "STAFF" && accountId === SYNTHETIC_AUDIT_STAFF_ACCOUNT_ID) return { tenantId: LOCAL_AUDIT_TENANT_ID, accountId, role };
  if (role === "DEPARTMENT_HEAD" && accountId === SYNTHETIC_AUDIT_HEAD_ACCOUNT_ID) return { tenantId: LOCAL_AUDIT_TENANT_ID, accountId, role };
  return undefined;
};

export const auditActorHasStepUp = (actor: AuditOperationsActor): boolean => actor.role !== "TENANT_ADMIN" || actor.mfaVerified === true;
