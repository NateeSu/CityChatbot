import {
  LOCAL_ADMIN_ACCOUNT_ID,
  LOCAL_DEPARTMENT_A_ID,
  LOCAL_DEPARTMENT_HEAD_ACCOUNT_ID,
  LOCAL_STAFF_ACCOUNT_ID,
} from "../api/v1/admin/complaints/repository";

import { ADMIN_ROLES, type AdminIdentity, type AdminRole } from "./admin-navigation";

export const LOCAL_ADMIN_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const LOCAL_DEPARTMENT_LABEL = "กองช่าง";

export function parseAdminRole(value: unknown): AdminRole | undefined {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value) ? value as AdminRole : undefined;
}

export function isSyntheticEnvironment(): boolean {
  const environment = process.env.CITYCHATBOT_ENV ?? "local";
  return environment === "local" || environment === "test";
}

export function localIdentityForRole(role: AdminRole): AdminIdentity | undefined {
  if (role === "STAFF") return { tenantId: LOCAL_ADMIN_TENANT_ID, accountId: LOCAL_STAFF_ACCOUNT_ID, role, departmentIds: [LOCAL_DEPARTMENT_A_ID], departmentLabel: LOCAL_DEPARTMENT_LABEL, synthetic: true };
  if (role === "PR_STAFF") return { tenantId: LOCAL_ADMIN_TENANT_ID, accountId: LOCAL_STAFF_ACCOUNT_ID, role, departmentIds: [], departmentLabel: "งานประชาสัมพันธ์", synthetic: true };
  if (role === "DEPARTMENT_HEAD") return { tenantId: LOCAL_ADMIN_TENANT_ID, accountId: LOCAL_DEPARTMENT_HEAD_ACCOUNT_ID, role, departmentIds: [LOCAL_DEPARTMENT_A_ID], departmentLabel: LOCAL_DEPARTMENT_LABEL, synthetic: true };
  if (role === "TENANT_ADMIN") return { tenantId: LOCAL_ADMIN_TENANT_ID, accountId: LOCAL_ADMIN_ACCOUNT_ID, role, departmentIds: [], departmentLabel: "ทุกหน่วยงาน", synthetic: true };
  if (role === "EXECUTIVE") return { tenantId: LOCAL_ADMIN_TENANT_ID, accountId: "10000000-0000-4000-8000-000000000005", role, departmentIds: [], departmentLabel: "ภาพรวมทุกหน่วยงาน", synthetic: true };
  return undefined;
}

export type OperationalAdminRole = "STAFF" | "DEPARTMENT_HEAD" | "TENANT_ADMIN";

export function parseOperationalAdminRole(value: unknown): OperationalAdminRole | undefined {
  const role = parseAdminRole(value);
  return role === "STAFF" || role === "DEPARTMENT_HEAD" || role === "TENANT_ADMIN" ? role : undefined;
}

export function localOperationalIdentity(value: unknown): AdminIdentity | undefined {
  const role = parseOperationalAdminRole(value);
  return role ? localIdentityForRole(role) : undefined;
}

export function dashboardIdentity(requestedRole: unknown): AdminIdentity {
  const role = parseAdminRole(requestedRole) ?? "TENANT_ADMIN";
  if (isSyntheticEnvironment()) return localIdentityForRole(role) ?? { tenantId: "", accountId: "", role, departmentIds: [], departmentLabel: "ยังไม่ผูก session", synthetic: false };
  return { tenantId: "", accountId: "", role, departmentIds: [], departmentLabel: "ยังไม่ผูก session", synthetic: false };
}
