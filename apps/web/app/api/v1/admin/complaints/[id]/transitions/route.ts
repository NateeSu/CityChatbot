import { COMPLAINT_STATES, transitionAdminComplaint, getAdminComplaintDetail, type ComplaintState, type ComplaintTransitionInput } from "@citychatbot/complaints";
import { NextResponse } from "next/server";

import { complaintRepository, isLocalSyntheticEnvironment } from "../../../../citizen/complaints/repository";
import { actorForAdminContext, localAdminContext } from "../../context";
import { domainErrorResponse, jsonError, readExpectedVersion, readIdempotencyKey, readObjectBody, readOptionalString } from "../../errors";
import { ensureLocalAdminFixtures, localDepartmentName } from "../../repository";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isLocalSyntheticEnvironment()) return jsonError(503, "CONFIGURATION_UNAVAILABLE", "การเปลี่ยนสถานะเรื่องร้องเรียนยังไม่พร้อมใช้งาน");
  const url = new URL(request.url);
  const adminContext = localAdminContext(url);
  if (!adminContext) return jsonError(404, "NOT_FOUND", "ไม่พบเรื่องร้องเรียนในขอบเขตที่คุณมีสิทธิ์ดู");
  ensureLocalAdminFixtures();
  const { id } = await context.params;
  try {
    const body = await readObjectBody(request);
    const toStatus = body.toStatus;
    if (typeof toStatus !== "string" || !COMPLAINT_STATES.includes(toStatus as ComplaintState)) throw new Error("toStatus is invalid");
    const input: ComplaintTransitionInput = {
      tenantId: adminContext.tenantId,
      complaintId: id,
      toStatus: toStatus as ComplaintState,
      expectedVersion: readExpectedVersion(request, body),
      actor: actorForAdminContext(adminContext),
      ...(readOptionalString(body, "reason") ? { reason: readOptionalString(body, "reason") } : {}),
      ...(readOptionalString(body, "publicRequest") ? { publicRequest: readOptionalString(body, "publicRequest") } : {}),
      ...(readOptionalString(body, "resolutionSummary") ? { resolutionSummary: readOptionalString(body, "resolutionSummary") } : {}),
      ...(readOptionalString(body, "assignedDepartmentId") ? { assignedDepartmentId: readOptionalString(body, "assignedDepartmentId") } : {}),
      ...(readOptionalString(body, "assignedMembershipId") ? { assignedMembershipId: readOptionalString(body, "assignedMembershipId") } : {}),
      idempotencyKey: readIdempotencyKey(request, body),
    };
    transitionAdminComplaint(complaintRepository, adminContext, input);
    return NextResponse.json({ item: getAdminComplaintDetail(complaintRepository, adminContext, id, { departmentNameForId: localDepartmentName }) });
  } catch (error) {
    return domainErrorResponse(error, complaintRepository, adminContext, id);
  }
}
