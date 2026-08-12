import { NextResponse } from "next/server";

import { auditActorHasStepUp, isAuditLocalEnvironment, localAuditContext } from "../audit-operations/context";
import { auditDomainErrorResponse, auditExpectedVersion, auditIdempotencyKey, auditJsonError, auditObject, auditRequestId, auditSuccess, readAuditObjectBody, requiredAuditString } from "../audit-operations/errors";
import { auditOperationsRepository } from "../audit-operations/repository";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = auditRequestId(request);
  if (!isAuditLocalEnvironment()) return auditJsonError(503, "CONFIGURATION_UNAVAILABLE", undefined, requestId);
  const actor = localAuditContext(new URL(request.url));
  if (!actor) return auditJsonError(403, "FORBIDDEN", undefined, requestId);
  if (!auditActorHasStepUp(actor)) return auditJsonError(403, "FORBIDDEN", undefined, requestId);
  try {
    const body = await readAuditObjectBody(request);
    const exportType = body.exportType === "AUDIT_LOG" || body.exportType === "REPORT" ? body.exportType : "REPORT";
    const exportRecord = auditOperationsRepository.requestExport(actor, {
      exportType,
      format: body.format === undefined ? "CSV" : body.format as "CSV",
      filters: auditObject(body, "filters"),
      reason: requiredAuditString(body, "reason"),
      idempotencyKey: auditIdempotencyKey(request, body),
      expectedVersion: auditExpectedVersion(request, body),
      estimatedRows: typeof body.estimatedRows === "number" ? body.estimatedRows : undefined,
    });
    return auditSuccess(exportRecord, 201, requestId);
  } catch (error) { return auditDomainErrorResponse(error, requestId); }
}
