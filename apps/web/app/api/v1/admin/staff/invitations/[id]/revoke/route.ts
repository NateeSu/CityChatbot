import { NextResponse } from "next/server";

import { isStaffLocalEnvironment, localStaffContext } from "../../../context";
import { readStaffObjectBody, requiredStaffString, staffDomainErrorResponse, staffExpectedVersion, staffIdempotencyKey, staffJsonError } from "../../../errors";
import { userManagementRepository } from "../../../repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isStaffLocalEnvironment()) return staffJsonError(503, "CONFIGURATION_UNAVAILABLE", "การจัดการคำเชิญยังไม่พร้อมใช้งาน");
  const actor = localStaffContext(new URL(request.url));
  if (!actor) return staffJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try {
    const body = await readStaffObjectBody(request);
    const { id } = await params;
    const invitation = userManagementRepository.revokeInvitation(actor, id, staffExpectedVersion(request, body), requiredStaffString(body, "reason"), staffIdempotencyKey(request, body));
    return NextResponse.json({ invitation });
  } catch (error) { return staffDomainErrorResponse(error); }
}
