import { SupportHandoffError } from "@citychatbot/support-handoff";
import { NextResponse } from "next/server";

import { localSupportAdminContext } from "../../context";
import { readSupportExpectedVersion, readSupportIdempotencyKey, readSupportObjectBody, readSupportRequiredString, supportDomainErrorResponse, supportJsonError } from "../../errors";
import { assertLocalSupportTicketAccess, ensureLocalSupportFixtures, getAdminSupportDetail, isSupportLocalEnvironment, localSupportLineProvider, supportLineDelivery, supportService } from "../../repository";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isSupportLocalEnvironment()) return supportJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตอบกลับ support ticket ยังไม่พร้อมใช้งาน");
  const url = new URL(request.url);
  const adminContext = localSupportAdminContext(url);
  if (!adminContext) return supportJsonError(404, "NOT_FOUND", "ไม่พบ ticket ในขอบเขตที่คุณมีสิทธิ์ดู");
  ensureLocalSupportFixtures();
  try {
    const { id } = await context.params;
    assertLocalSupportTicketAccess(adminContext, id);
    const body = await readSupportObjectBody(request);
    const visibility = readSupportRequiredString(body, "visibility");
    if (visibility !== "PUBLIC" && visibility !== "INTERNAL") throw new SupportHandoffError("VALIDATION_ERROR", "visibility is invalid");
    const isAiDraft = body.isAiDraft === true;
    if (visibility === "PUBLIC" && body.previewConfirmed !== true) throw new SupportHandoffError("VALIDATION_ERROR", "public reply preview confirmation is required");
    if (body.sendToLine !== undefined && typeof body.sendToLine !== "boolean") throw new SupportHandoffError("VALIDATION_ERROR", "sendToLine is invalid");
    if (body.outOfHours !== undefined && typeof body.outOfHours !== "boolean") throw new SupportHandoffError("VALIDATION_ERROR", "outOfHours is invalid");
    if (body.sendToLine === true && visibility !== "PUBLIC") throw new SupportHandoffError("VALIDATION_ERROR", "only a public reply can be sent to LINE");
    const idempotencyKey = readSupportIdempotencyKey(request, body);
    supportService.addStaffMessage({
      tenantId: adminContext.tenantId,
      ticketId: id,
      expectedVersion: readSupportExpectedVersion(request, body),
      actor: { accountId: adminContext.accountId, canReply: adminContext.role === "STAFF" || adminContext.role === "DEPARTMENT_HEAD" || adminContext.role === "TENANT_ADMIN" },
      body: readSupportRequiredString(body, "body"),
      visibility,
      isAiDraft,
      idempotencyKey,
    });
    const detail = getAdminSupportDetail(adminContext, id);
    if (body.sendToLine === true) {
      const message = detail.messages.find((item) => item.eventId === "staff-message:" + idempotencyKey);
      if (!message) throw new SupportHandoffError("NOT_FOUND", "new public staff message was not found");
      const delivery = await supportLineDelivery.sendNow({
        tenantId: adminContext.tenantId,
        ticketId: id,
        messageId: message.id,
        idempotencyKey: "line-" + idempotencyKey,
        correlationId: id,
        ...(body.outOfHours === true ? { outOfHours: true } : {}),
      }, localSupportLineProvider);
      return NextResponse.json({ ...detail, delivery }, { status: 201 });
    }
    return NextResponse.json(detail, { status: 201 });
  } catch (error) {
    return supportDomainErrorResponse(error);
  }
}
