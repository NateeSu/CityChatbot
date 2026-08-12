import { NextResponse } from "next/server";

import { SloContractError } from "@citychatbot/slo";

import { isSyntheticEnvironment, localIdentityForRole, parseAdminRole } from "../../../../admin/admin-access";
import { DEFAULT_SLO_FROM, DEFAULT_SLO_TO, getLocalSloDashboard, LOCAL_SLO_TENANT_ID } from "./repository";

export const runtime = "nodejs";

const allowedFilters = new Set(["tenantId", "role", "accountId", "from", "to"]);
const allowedRoles = new Set(["TENANT_ADMIN", "EXECUTIVE"]);

const requestIdFor = (request: Request): string => request.headers.get("x-request-id") ?? crypto.randomUUID();

const errorResponse = (status: number, code: string, message: string, requestId: string): NextResponse => NextResponse.json({ error: { code, message }, meta: { requestId, serverTime: new Date().toISOString() } }, { status });

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = requestIdFor(request);
  if (!isSyntheticEnvironment()) return errorResponse(503, "CONFIGURATION_UNAVAILABLE", "SLO dashboard requires a trusted server session and durable SLI store", requestId);
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => !allowedFilters.has(key))) return errorResponse(400, "VALIDATION_ERROR", "Unknown SLO filter", requestId);
  const role = parseAdminRole(url.searchParams.get("role"));
  const identity = role ? localIdentityForRole(role) : undefined;
  if (!identity || !allowedRoles.has(identity.role) || identity.tenantId !== LOCAL_SLO_TENANT_ID || identity.accountId !== url.searchParams.get("accountId") || url.searchParams.get("tenantId") !== LOCAL_SLO_TENANT_ID) {
    return errorResponse(403, "FORBIDDEN", "SLO dashboard is not available for this tenant or role", requestId);
  }
  try {
    const dashboard = getLocalSloDashboard({ window: { from: url.searchParams.get("from") ?? DEFAULT_SLO_FROM, to: url.searchParams.get("to") ?? DEFAULT_SLO_TO } });
    return NextResponse.json({ data: dashboard, meta: { requestId, serverTime: new Date().toISOString() } });
  } catch (error) {
    if (error instanceof SloContractError) return errorResponse(400, error.code, error.message, requestId);
    return errorResponse(500, "PROCESSING_FAILED", "Unable to read SLO dashboard", requestId);
  }
}
