import type { ComplaintActorRole, ComplaintAdminContext, ComplaintAdminRole } from "@citychatbot/complaints";

import { LOCAL_ADMIN_ACCOUNT_ID, LOCAL_DEPARTMENT_HEAD_ACCOUNT_ID, LOCAL_STAFF_ACCOUNT_ID, LOCAL_DEPARTMENT_A_ID } from "./repository";

const allowedRoles: readonly ComplaintAdminRole[] = ["STAFF", "DEPARTMENT_HEAD", "TENANT_ADMIN"];

export const localAdminContext = (url: URL): ComplaintAdminContext | undefined => {
  const role = url.searchParams.get("role");
  const accountId = url.searchParams.get("accountId");
  if (!role || !accountId || !allowedRoles.includes(role as ComplaintAdminRole)) return undefined;
  if (role === "TENANT_ADMIN" && accountId !== LOCAL_ADMIN_ACCOUNT_ID) return undefined;
  if (role === "STAFF" && accountId !== LOCAL_STAFF_ACCOUNT_ID) return undefined;
  if (role === "DEPARTMENT_HEAD" && accountId !== LOCAL_DEPARTMENT_HEAD_ACCOUNT_ID) return undefined;
  return {
    tenantId: "00000000-0000-4000-8000-000000000001",
    accountId,
    role: role as ComplaintAdminRole,
    departmentIds: role === "TENANT_ADMIN" ? [] : [LOCAL_DEPARTMENT_A_ID],
  };
};

export const actorForAdminContext = (context: ComplaintAdminContext): { type: "STAFF"; role: ComplaintActorRole; id: string } => ({
  type: "STAFF",
  role: context.role,
  id: context.accountId,
});
