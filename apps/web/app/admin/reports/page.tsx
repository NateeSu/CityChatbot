import Link from "next/link";

import { FeatureDisabledState, PermissionDeniedState } from "../../ui/states";
import { AdminShell } from "../AdminShell";
import { isSyntheticEnvironment, localIdentityForRole, parseAdminRole } from "../admin-access";
import { DEFAULT_REPORT_FROM, DEFAULT_REPORT_TO, getLocalKpiReport, LOCAL_REPORT_DEPARTMENTS, LOCAL_REPORT_TENANT_ID } from "../../api/v1/admin/reports/kpi/repository";
import { KpiReportConsole } from "./KpiReportConsole";
import "./reports.css";

export const dynamic = "force-dynamic";

export default async function KpiReportsPage({ searchParams }: { searchParams?: Promise<{ role?: string }> }) {
  const query = searchParams ? await searchParams : {};
  const role = parseAdminRole(query.role ?? "TENANT_ADMIN");
  const identity = role ? localIdentityForRole(role) : undefined;
  if (!identity || !["DEPARTMENT_HEAD", "TENANT_ADMIN", "EXECUTIVE"].includes(identity.role)) {
    return <main className="shell"><PermissionDeniedState action={<Link href="/admin">กลับหน้าหลัก</Link>} /></main>;
  }
  if (!isSyntheticEnvironment()) {
    return <AdminShell activeId="reports" breadcrumbs={["รายงาน KPI และ SLA"]} identity={identity}><FeatureDisabledState /></AdminShell>;
  }
  const departmentId = identity.role === "DEPARTMENT_HEAD" ? identity.departmentIds[0] : undefined;
  const initialReport = getLocalKpiReport({
    filter: { tenantId: LOCAL_REPORT_TENANT_ID, from: DEFAULT_REPORT_FROM, to: DEFAULT_REPORT_TO, ...(departmentId ? { departmentId } : {}) },
    allowedDepartmentIds: identity.role === "DEPARTMENT_HEAD" ? identity.departmentIds : LOCAL_REPORT_DEPARTMENTS.filter((item) => item.id !== "ALL").map((item) => item.id),
  });
  return <KpiReportConsole departments={LOCAL_REPORT_DEPARTMENTS} identity={identity} initialReport={initialReport} />;
}
