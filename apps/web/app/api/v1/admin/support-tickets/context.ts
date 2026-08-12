import { LOCAL_ADMIN_ACCOUNT_ID, LOCAL_DEPARTMENT_A_ID, LOCAL_DEPARTMENT_HEAD_ACCOUNT_ID, LOCAL_STAFF_ACCOUNT_ID } from "../complaints/repository";
import type { LocalSupportAdminContext, SupportAdminRole } from "./repository";

const allowedRoles: readonly SupportAdminRole[] = ["STAFF", "DEPARTMENT_HEAD", "TENANT_ADMIN"];

export const localSupportAdminContext = (url: URL): LocalSupportAdminContext | undefined => {
  const tenantId = url.searchParams.get("tenantId");
  const role = url.searchParams.get("role") as SupportAdminRole | null;
  const accountId = url.searchParams.get("accountId");
  if (tenantId !== "00000000-0000-4000-8000-000000000001" || !role || !accountId || !allowedRoles.includes(role)) return undefined;
  if (role === "TENANT_ADMIN" && accountId !== LOCAL_ADMIN_ACCOUNT_ID) return undefined;
  if (role === "STAFF" && accountId !== LOCAL_STAFF_ACCOUNT_ID) return undefined;
  if (role === "DEPARTMENT_HEAD" && accountId !== LOCAL_DEPARTMENT_HEAD_ACCOUNT_ID) return undefined;
  return {
    tenantId,
    accountId,
    role,
    departmentIds: role === "TENANT_ADMIN" ? [] : [LOCAL_DEPARTMENT_A_ID],
  };
};
