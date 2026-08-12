import { NextResponse } from "next/server";

import { isStaffLocalEnvironment } from "../../../context";
import { readStaffObjectBody, requiredStaffString, staffDomainErrorResponse, staffJsonError } from "../../../errors";
import { userManagementRepository } from "../../../repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isStaffLocalEnvironment()) return staffJsonError(503, "CONFIGURATION_UNAVAILABLE", "การรับคำเชิญยังไม่พร้อมใช้งาน");
  try {
    const body = await readStaffObjectBody(request);
    const tenantId = requiredStaffString(body, "tenantId");
    const token = requiredStaffString(body, "inviteToken");
    const invitation = userManagementRepository.getInvitationByToken(tenantId, token);
    const { id } = await params;
    if (invitation.id !== id) return staffJsonError(404, "NOT_FOUND", "ไม่พบคำเชิญในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
    const staff = userManagementRepository.acceptInvitation(tenantId, token, { displayName: requiredStaffString(body, "displayName"), authSubject: requiredStaffString(body, "authSubject") });
    return NextResponse.json({ staff });
  } catch (error) { return staffDomainErrorResponse(error); }
}
