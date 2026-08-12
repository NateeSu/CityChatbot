import type { ServiceActor } from "@citychatbot/services";

import { LOCAL_ADMIN_ACCOUNT_ID, LOCAL_DEPARTMENT_HEAD_ACCOUNT_ID, LOCAL_STAFF_ACCOUNT_ID } from "../complaints/repository";

export const LOCAL_SERVICES_TENANT_ID = "00000000-0000-4000-8000-000000000001";

export const isServicesLocalEnvironment = (): boolean => {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  return environment === "local" || environment === "test";
};

export const localServicesContext = (url: URL): ServiceActor | undefined => {
  if (url.searchParams.get("tenantId") !== LOCAL_SERVICES_TENANT_ID) return undefined;
  const role = url.searchParams.get("role");
  const accountId = url.searchParams.get("accountId");
  if (role === "TENANT_ADMIN" && accountId === LOCAL_ADMIN_ACCOUNT_ID) return { tenantId: LOCAL_SERVICES_TENANT_ID, accountId, role };
  if (role === "PR_STAFF" && accountId === LOCAL_STAFF_ACCOUNT_ID) return { tenantId: LOCAL_SERVICES_TENANT_ID, accountId, role };
  if (role === "STAFF" && accountId === LOCAL_STAFF_ACCOUNT_ID) return { tenantId: LOCAL_SERVICES_TENANT_ID, accountId, role };
  if (role === "DEPARTMENT_HEAD" && accountId === LOCAL_DEPARTMENT_HEAD_ACCOUNT_ID) return { tenantId: LOCAL_SERVICES_TENANT_ID, accountId, role, departmentIds: ["department-a-001"] };
  return undefined;
};

export const localCitizenServicesContext = (url: URL): ServiceActor | undefined => {
  if (url.searchParams.get("tenantId") !== LOCAL_SERVICES_TENANT_ID || url.searchParams.get("lineUserId") !== "U11111111111111111111111111111111") return undefined;
  return { tenantId: LOCAL_SERVICES_TENANT_ID, accountId: "10000000-0000-4000-8000-000000000002", role: "STAFF" };
};
