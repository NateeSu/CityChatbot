import { NextResponse } from "next/server";

import { isStaffLocalEnvironment, localStaffContext } from "../../../context";
import { readStaffObjectBody, requiredStaffString, staffDomainErrorResponse, staffExpectedVersion, staffIdempotencyKey, staffJsonError } from "../../../errors";
import { userManagementRepository } from "../../../repository";

export const runtime = "nodejs";

export async function DELETE(request: Request, { params }: { params: Promise<{ membershipId: string; roleId: string }> }): Promise<NextResponse> {
  if (!isStaffLocalEnvironment()) return staffJsonError(503, "CONFIGURATION_UNAVAILABLE", "การจัดการสิทธิ์ยังไม่พร้อมใช้งาน");
  const actor = localStaffContext(new URL(request.url));
  if (!actor) return staffJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try {
    const body = await readStaffObjectBody(request);
    const { membershipId, roleId } = await params;
    const staff = userManagementRepository.removeRole(actor, membershipId, roleId, staffExpectedVersion(request, body), requiredStaffString(body, "reason"), staffIdempotencyKey(request, body));
    return NextResponse.json({ staff });
  } catch (error) { return staffDomainErrorResponse(error); }
}
