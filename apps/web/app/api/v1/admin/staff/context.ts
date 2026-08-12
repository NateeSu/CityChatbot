import type { UserManagementActor } from "@citychatbot/user-management";

import { LOCAL_ADMIN_ACCOUNT_ID, LOCAL_DEPARTMENT_A_ID, LOCAL_DEPARTMENT_HEAD_ACCOUNT_ID, LOCAL_STAFF_ACCOUNT_ID } from "../complaints/repository";

export const LOCAL_STAFF_TENANT_ID = "00000000-0000-4000-8000-000000000001";

export const isStaffLocalEnvironment = (): boolean => {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  return environment === "local" || environment === "test";
};

export const localStaffContext = (url: URL): UserManagementActor | undefined => {
  if (url.searchParams.get("tenantId") !== LOCAL_STAFF_TENANT_ID) return undefined;
  const role = url.searchParams.get("role");
  const accountId = url.searchParams.get("accountId");
  if (role === "TENANT_ADMIN" && accountId === LOCAL_ADMIN_ACCOUNT_ID) {
    const steppedUp = url.searchParams.get("stepUp") !== "0";
    return { tenantId: LOCAL_STAFF_TENANT_ID, accountId, role, departmentIds: [], mfaVerified: steppedUp, reauthenticatedAt: steppedUp ? new Date().toISOString() : null };
  }
  if (role === "STAFF" && accountId === LOCAL_STAFF_ACCOUNT_ID) return { tenantId: LOCAL_STAFF_TENANT_ID, accountId, role, departmentIds: [LOCAL_DEPARTMENT_A_ID], mfaVerified: false, reauthenticatedAt: null };
  if (role === "DEPARTMENT_HEAD" && accountId === LOCAL_DEPARTMENT_HEAD_ACCOUNT_ID) return { tenantId: LOCAL_STAFF_TENANT_ID, accountId, role, departmentIds: [LOCAL_DEPARTMENT_A_ID], mfaVerified: false, reauthenticatedAt: null };
  return undefined;
};
