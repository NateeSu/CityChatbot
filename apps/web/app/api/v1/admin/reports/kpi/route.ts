import { NextResponse } from "next/server";

import { kpiReportToCsv, KpiReportError, type KpiReportFilter } from "@citychatbot/reports-kpi";

import { isSyntheticEnvironment, localIdentityForRole, parseAdminRole } from "../../../../../admin/admin-access";
import { DEFAULT_REPORT_FROM, DEFAULT_REPORT_TO, getLocalKpiReport, LOCAL_REPORT_DEPARTMENTS, LOCAL_REPORT_TENANT_ID } from "./repository";

export const runtime = "nodejs";

const allowedFilters = new Set(["tenantId", "role", "accountId", "from", "to", "departmentId", "categoryId", "timezone", "granularity", "format"]);
const reportRoles = new Set(["DEPARTMENT_HEAD", "TENANT_ADMIN", "EXECUTIVE"]);

const requestIdFor = (request: Request): string => request.headers.get("x-request-id") ?? crypto.randomUUID();
const errorResponse = (status: number, code: string, message: string, requestId: string): NextResponse => NextResponse.json({ error: { code, message }, meta: { requestId, serverTime: new Date().toISOString() } }, { status });

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = requestIdFor(request);
  if (!isSyntheticEnvironment()) return errorResponse(503, "CONFIGURATION_UNAVAILABLE", "รายงาน KPI รอการผูก server session และฐานข้อมูลจริง", requestId);
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => !allowedFilters.has(key))) return errorResponse(400, "VALIDATION_ERROR", "ตัวกรองรายงานไม่อยู่ใน allowlist", requestId);
  const role = parseAdminRole(url.searchParams.get("role"));
  const identity = role ? localIdentityForRole(role) : undefined;
  if (!identity || identity.tenantId !== LOCAL_REPORT_TENANT_ID || identity.accountId !== url.searchParams.get("accountId") || url.searchParams.get("tenantId") !== LOCAL_REPORT_TENANT_ID) {
    return errorResponse(404, "NOT_FOUND", "ไม่พบ session ในขอบเขต tenant นี้", requestId);
  }
  if (!reportRoles.has(identity.role)) return errorResponse(403, "FORBIDDEN", "บัญชีนี้ไม่มีสิทธิ์ดูรายงาน KPI", requestId);
  const format = url.searchParams.get("format") ?? "json";
  if (format !== "json" && format !== "csv") return errorResponse(400, "VALIDATION_ERROR", "รูปแบบ export ไม่ถูกต้อง", requestId);
  const requestedDepartment = url.searchParams.get("departmentId") ?? undefined;
  const departmentId = requestedDepartment === "ALL" ? undefined : requestedDepartment ?? (identity.role === "DEPARTMENT_HEAD" ? identity.departmentIds[0] : undefined);
  const allowedDepartmentIds = identity.role === "DEPARTMENT_HEAD" ? identity.departmentIds : LOCAL_REPORT_DEPARTMENTS.filter((item) => item.id !== "ALL").map((item) => item.id);
  const filter: KpiReportFilter = {
    tenantId: LOCAL_REPORT_TENANT_ID,
    from: url.searchParams.get("from") ?? DEFAULT_REPORT_FROM,
    to: url.searchParams.get("to") ?? DEFAULT_REPORT_TO,
    ...(departmentId ? { departmentId } : {}),
    ...(url.searchParams.get("categoryId") ? { categoryId: url.searchParams.get("categoryId")! } : {}),
    ...(url.searchParams.get("timezone") ? { timezone: url.searchParams.get("timezone")! } : {}),
    ...(url.searchParams.get("granularity") ? { granularity: url.searchParams.get("granularity") as KpiReportFilter["granularity"] } : {}),
  };
  try {
    const report = getLocalKpiReport({ filter, allowedDepartmentIds });
    if (format === "csv") {
      return new NextResponse(kpiReportToCsv(report), {
        status: 200,
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="citychatbot-kpi-${report.filter.from.slice(0, 10)}-${report.filter.to.slice(0, 10)}.csv"`,
          "x-request-id": requestId,
        },
      });
    }
    return NextResponse.json({ data: report, meta: { requestId, serverTime: new Date().toISOString() } });
  } catch (error) {
    if (error instanceof KpiReportError) return errorResponse(error.code === "FORBIDDEN" ? 403 : 400, error.code, error.message, requestId);
    return errorResponse(500, "PROCESSING_FAILED", "ระบบอ่านรายงาน KPI ไม่สำเร็จ", requestId);
  }
}
