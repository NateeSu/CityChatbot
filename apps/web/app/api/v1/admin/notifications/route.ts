import { NextResponse } from "next/server";

import { auditActorHasStepUp, isAuditLocalEnvironment, localAuditContext } from "../audit-operations/context";
import { auditDomainErrorResponse, auditJsonError, auditRequestId, auditSuccess } from "../audit-operations/errors";
import { auditOperationsRepository } from "../audit-operations/repository";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = auditRequestId(request);
  if (!isAuditLocalEnvironment()) return auditJsonError(503, "CONFIGURATION_UNAVAILABLE", undefined, requestId);
  const actor = localAuditContext(new URL(request.url));
  if (!actor) return auditJsonError(404, "NOT_FOUND", undefined, requestId);
  if (!auditActorHasStepUp(actor)) return auditJsonError(403, "FORBIDDEN", undefined, requestId);
  const unreadOnly = new URL(request.url).searchParams.get("unreadOnly") === "1";
  return auditSuccess(auditOperationsRepository.listNotifications(actor, unreadOnly), 200, requestId);
}
