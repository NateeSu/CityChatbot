import { NextResponse } from "next/server";

import { auditActorHasStepUp, isAuditLocalEnvironment, localAuditContext } from "../audit-operations/context";
import { auditDomainErrorResponse, auditJsonError, auditRequestId, auditSuccess } from "../audit-operations/errors";
import { auditOperationsRepository } from "../audit-operations/repository";

export const runtime = "nodejs";

const allowedFilters = new Set(["tenantId", "role", "accountId", "stepUp", "action", "resourceType", "resourceId", "actorAccountId", "from", "to", "cursor", "limit"]);

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = auditRequestId(request);
  if (!isAuditLocalEnvironment()) return auditJsonError(503, "CONFIGURATION_UNAVAILABLE", undefined, requestId);
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => !allowedFilters.has(key))) return auditJsonError(400, "VALIDATION_ERROR", "ตัวกรอง audit ไม่อยู่ใน allowlist", requestId);
  const actor = localAuditContext(url);
  if (!actor) return auditJsonError(404, "NOT_FOUND", undefined, requestId);
  if (!auditActorHasStepUp(actor)) return auditJsonError(403, "FORBIDDEN", undefined, requestId);
  try {
    const limitValue = url.searchParams.get("limit");
    const limit = limitValue ? Number(limitValue) : undefined;
    const page = auditOperationsRepository.listAudit(actor, {
      action: url.searchParams.get("action") ?? undefined,
      resourceType: url.searchParams.get("resourceType") ?? undefined,
      resourceId: url.searchParams.get("resourceId") ?? undefined,
      actorAccountId: url.searchParams.get("actorAccountId") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit,
    });
    return auditSuccess(page, 200, requestId);
  } catch (error) { return auditDomainErrorResponse(error, requestId); }
}
