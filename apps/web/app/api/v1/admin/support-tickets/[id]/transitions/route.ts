import { SUPPORT_TICKET_STATUSES, SupportHandoffError } from "@citychatbot/support-handoff";
import { NextResponse } from "next/server";

import { localSupportAdminContext } from "../../context";
import { readSupportExpectedVersion, readSupportIdempotencyKey, readSupportObjectBody, readSupportRequiredString, supportDomainErrorResponse, supportJsonError } from "../../errors";
import { assertLocalSupportTicketAccess, ensureLocalSupportFixtures, getAdminSupportDetail, isSupportLocalEnvironment, supportService } from "../../repository";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isSupportLocalEnvironment()) return supportJsonError(503, "CONFIGURATION_UNAVAILABLE", "การเปลี่ยนสถานะ support ticket ยังไม่พร้อมใช้งาน");
  const url = new URL(request.url);
  const adminContext = localSupportAdminContext(url);
  if (!adminContext) return supportJsonError(404, "NOT_FOUND", "ไม่พบ ticket ในขอบเขตที่คุณมีสิทธิ์ดู");
  ensureLocalSupportFixtures();
  try {
    const { id } = await context.params;
    assertLocalSupportTicketAccess(adminContext, id);
    const body = await readSupportObjectBody(request);
    const toStatus = readSupportRequiredString(body, "toStatus");
    if (!SUPPORT_TICKET_STATUSES.includes(toStatus as (typeof SUPPORT_TICKET_STATUSES)[number])) throw new SupportHandoffError("VALIDATION_ERROR", "toStatus is invalid");
    supportService.transitionTicket({
      tenantId: adminContext.tenantId,
      ticketId: id,
      expectedVersion: readSupportExpectedVersion(request, body),
      toStatus: toStatus as (typeof SUPPORT_TICKET_STATUSES)[number],
      actor: { type: "STAFF", accountId: adminContext.accountId, canTransition: true, canReopen: adminContext.role !== "STAFF" },
      reason: readSupportRequiredString(body, "reason"),
      idempotencyKey: readSupportIdempotencyKey(request, body),
    });
    return NextResponse.json(getAdminSupportDetail(adminContext, id));
  } catch (error) {
    return supportDomainErrorResponse(error);
  }
}
