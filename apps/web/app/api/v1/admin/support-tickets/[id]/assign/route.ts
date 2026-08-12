import { NextResponse } from "next/server";

import { localSupportAdminContext } from "../../context";
import { readSupportExpectedVersion, readSupportIdempotencyKey, readSupportObjectBody, readSupportOptionalString, readSupportRequiredString, supportDomainErrorResponse, supportJsonError } from "../../errors";
import { assertLocalSupportTicketAccess, authorizedDepartmentsFor, authorizedMembershipsFor, ensureLocalSupportFixtures, getAdminSupportDetail, isSupportLocalEnvironment, supportService } from "../../repository";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isSupportLocalEnvironment()) return supportJsonError(503, "CONFIGURATION_UNAVAILABLE", "การมอบหมาย support ticket ยังไม่พร้อมใช้งาน");
  const url = new URL(request.url);
  const adminContext = localSupportAdminContext(url);
  if (!adminContext) return supportJsonError(404, "NOT_FOUND", "ไม่พบ ticket ในขอบเขตที่คุณมีสิทธิ์ดู");
  ensureLocalSupportFixtures();
  try {
    const { id } = await context.params;
    assertLocalSupportTicketAccess(adminContext, id);
    const body = await readSupportObjectBody(request);
    supportService.assignTicket({
      tenantId: adminContext.tenantId,
      ticketId: id,
      expectedVersion: readSupportExpectedVersion(request, body),
      departmentId: readSupportRequiredString(body, "departmentId"),
      ...(readSupportOptionalString(body, "membershipId") ? { membershipId: readSupportOptionalString(body, "membershipId") } : {}),
      authorizedDepartments: authorizedDepartmentsFor(adminContext),
      authorizedMemberships: authorizedMembershipsFor(adminContext),
      actor: { accountId: adminContext.accountId, canAssign: adminContext.role !== "STAFF" },
      reason: readSupportRequiredString(body, "reason"),
      idempotencyKey: readSupportIdempotencyKey(request, body),
    });
    return NextResponse.json(getAdminSupportDetail(adminContext, id));
  } catch (error) {
    return supportDomainErrorResponse(error);
  }
}

