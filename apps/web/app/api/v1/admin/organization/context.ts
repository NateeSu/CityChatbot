import type { OrganizationActor } from "@citychatbot/org-config";

import {
  LOCAL_ADMIN_ACCOUNT_ID,
  LOCAL_DEPARTMENT_A_ID,
  LOCAL_DEPARTMENT_HEAD_ACCOUNT_ID,
  LOCAL_STAFF_ACCOUNT_ID,
} from "../complaints/repository";

export const LOCAL_ORGANIZATION_TENANT_ID = "00000000-0000-4000-8000-000000000001";

export const isOrganizationLocalEnvironment = (): boolean => {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  return environment === "local" || environment === "test";
};

export const localOrganizationContext = (url: URL): OrganizationActor | undefined => {
  if (url.searchParams.get("tenantId") !== LOCAL_ORGANIZATION_TENANT_ID) return undefined;
  const role = url.searchParams.get("role");
  const accountId = url.searchParams.get("accountId");
  if (role === "TENANT_ADMIN" && accountId === LOCAL_ADMIN_ACCOUNT_ID) return { tenantId: LOCAL_ORGANIZATION_TENANT_ID, accountId, role, departmentIds: [] };
  if (role === "STAFF" && accountId === LOCAL_STAFF_ACCOUNT_ID) return { tenantId: LOCAL_ORGANIZATION_TENANT_ID, accountId, role, departmentIds: [LOCAL_DEPARTMENT_A_ID] };
  if (role === "DEPARTMENT_HEAD" && accountId === LOCAL_DEPARTMENT_HEAD_ACCOUNT_ID) return { tenantId: LOCAL_ORGANIZATION_TENANT_ID, accountId, role, departmentIds: [LOCAL_DEPARTMENT_A_ID] };
  return undefined;
};
