import { NextResponse } from "next/server";

import { isStaffLocalEnvironment, localStaffContext } from "../context";
import { readStaffObjectBody, requiredStaffString, staffDomainErrorResponse, staffIdempotencyKey, staffJsonError, staffStringArray } from "../errors";
import { userManagementRepository } from "../repository";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  if (!isStaffLocalEnvironment()) return staffJsonError(503, "CONFIGURATION_UNAVAILABLE", "การจัดการคำเชิญยังไม่พร้อมใช้งาน");
  const actor = localStaffContext(new URL(request.url));
  if (!actor) return staffJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try {
    const body = await readStaffObjectBody(request);
    const result = userManagementRepository.createInvitation(actor, {
      email: requiredStaffString(body, "email"),
      displayName: requiredStaffString(body, "displayName"),
      roleIds: staffStringArray(body, "roleIds", true),
      departmentIds: staffStringArray(body, "departmentIds"),
      expiresInHours: typeof body.expiresInHours === "number" ? body.expiresInHours : undefined,
      reason: requiredStaffString(body, "reason"),
      idempotencyKey: staffIdempotencyKey(request, body),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return staffDomainErrorResponse(error); }
}
