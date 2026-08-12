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
  try {
    const id = (await params).id;
    const url = new URL(request.url);
    const token = url.searchParams.get("token");
    if (token) {
      const download = auditOperationsRepository.downloadExport(actor, id, token);
      return new NextResponse(download.body, { headers: { "Content-Disposition": `attachment; filename="${download.fileName}"`, "Content-Type": download.contentType, "X-CityChatbot-Watermark": download.watermark, "X-Request-Id": requestId } });
    }
    return auditSuccess(auditOperationsRepository.getExport(actor, id), 200, requestId);
  } catch (error) { return auditDomainErrorResponse(error, requestId); }
}
