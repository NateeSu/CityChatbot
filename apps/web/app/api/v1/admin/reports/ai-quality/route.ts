import { NextResponse } from "next/server";

import { buildAiQualityReport, type AiQualityFilter, type AiQualityRun } from "@citychatbot/reports-kpi";

import { isSyntheticEnvironment, localIdentityForRole, parseAdminRole } from "../../../../../admin/admin-access";
import { LOCAL_REPORT_TENANT_ID } from "../kpi/repository";

export const runtime = "nodejs";

const allowedFilters = new Set(["tenantId", "role", "accountId", "from", "to"]);
const reportRoles = new Set(["DEPARTMENT_HEAD", "TENANT_ADMIN", "EXECUTIVE"]);
const requestIdFor = (request: Request): string => request.headers.get("x-request-id") ?? crypto.randomUUID();
const errorResponse = (status: number, code: string, message: string, requestId: string): NextResponse => NextResponse.json({ error: { code, message }, meta: { requestId, serverTime: new Date().toISOString() } }, { status });

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = requestIdFor(request);
  if (!isSyntheticEnvironment()) return errorResponse(503, "CONFIGURATION_UNAVAILABLE", "AI quality report requires server-side SQL telemetry", requestId);
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => !allowedFilters.has(key))) return errorResponse(400, "VALIDATION_ERROR", "report filter is not allowlisted", requestId);
  const role = parseAdminRole(url.searchParams.get("role"));
  const identity = role ? localIdentityForRole(role) : undefined;
  if (!identity || identity.tenantId !== LOCAL_REPORT_TENANT_ID || identity.accountId !== url.searchParams.get("accountId") || url.searchParams.get("tenantId") !== LOCAL_REPORT_TENANT_ID) {
    return errorResponse(404, "NOT_FOUND", "report session is outside the tenant scope", requestId);
  }
  if (!reportRoles.has(identity.role)) return errorResponse(403, "FORBIDDEN", "this role cannot read AI quality reports", requestId);
  // The production path intentionally has no local AI-run fixture.  Returning
  // 503 keeps synthetic data out of production and leaves numeric reports
  // usable when the optional narrative/telemetry dependency is unavailable.
  const filter: AiQualityFilter = {
    tenantId: LOCAL_REPORT_TENANT_ID,
    from: url.searchParams.get("from") ?? "2026-07-01T00:00:00.000Z",
    to: url.searchParams.get("to") ?? "2026-09-01T00:00:00.000Z",
  };
  const runs: readonly AiQualityRun[] = [];
  const report = buildAiQualityReport({ filter, runs });
  return NextResponse.json({ data: report, meta: { requestId, serverTime: new Date().toISOString(), narrative: "disabled_until_server_telemetry" } });
}
