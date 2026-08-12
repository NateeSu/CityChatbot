import { NextResponse } from "next/server";

import { auditActorHasStepUp, isAuditLocalEnvironment, localAuditContext } from "../../audit-operations/context";
import { auditDomainErrorResponse, auditJsonError, auditRequestId, auditSuccess } from "../../audit-operations/errors";
import { auditOperationsRepository } from "../../audit-operations/repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const requestId = auditRequestId(request);
  if (!isAuditLocalEnvironment()) return auditJsonError(503, "CONFIGURATION_UNAVAILABLE", undefined, requestId);
  const actor = localAuditContext(new URL(request.url));
  if (!actor) return auditJsonError(404, "NOT_FOUND", undefined, requestId);
  if (!auditActorHasStepUp(actor)) return auditJsonError(403, "FORBIDDEN", undefined, requestId);
  try { return auditSuccess(auditOperationsRepository.getJob(actor, (await params).id), 200, requestId); } catch (error) { return auditDomainErrorResponse(error, requestId); }
}
