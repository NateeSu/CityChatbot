import { assignAdminComplaint, getAdminComplaintDetail, type ComplaintAssignmentInput } from "@citychatbot/complaints";
import { NextResponse } from "next/server";

import { complaintRepository, isLocalSyntheticEnvironment } from "../../../../citizen/complaints/repository";
import { actorForAdminContext, localAdminContext } from "../../context";
import { domainErrorResponse, jsonError, readExpectedVersion, readIdempotencyKey, readObjectBody, readOptionalString, readRequiredString } from "../../errors";
import { ensureLocalAdminFixtures, localDepartmentName } from "../../repository";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isLocalSyntheticEnvironment()) return jsonError(503, "CONFIGURATION_UNAVAILABLE", "การมอบหมายเรื่องร้องเรียนยังไม่พร้อมใช้งาน");
  const url = new URL(request.url);
  const adminContext = localAdminContext(url);
  if (!adminContext) return jsonError(404, "NOT_FOUND", "ไม่พบเรื่องร้องเรียนในขอบเขตที่คุณมีสิทธิ์ดู");
  ensureLocalAdminFixtures();
  const { id } = await context.params;
  try {
    const body = await readObjectBody(request);
    const departmentId = readRequiredString(body, "departmentId");
    const membershipId = readOptionalString(body, "membershipId");
    const input: ComplaintAssignmentInput = {
      tenantId: adminContext.tenantId,
      complaintId: id,
      expectedVersion: readExpectedVersion(request, body),
      departmentId,
      ...(membershipId ? { membershipId } : {}),
      actor: actorForAdminContext(adminContext),
      reason: readRequiredString(body, "reason"),
      idempotencyKey: readIdempotencyKey(request, body),
    };
    assignAdminComplaint(complaintRepository, adminContext, input);
    return NextResponse.json({ item: getAdminComplaintDetail(complaintRepository, adminContext, id, { departmentNameForId: localDepartmentName }) });
  } catch (error) {
    return domainErrorResponse(error, complaintRepository, adminContext, id);
  }
}
