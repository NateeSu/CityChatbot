import { NextResponse } from "next/server";
import { UserManagementError } from "@citychatbot/user-management";

import { isStaffLocalEnvironment, localStaffContext } from "../../staff/context";
import { readStaffObjectBody, requiredStaffString, staffDomainErrorResponse, staffExpectedVersion, staffIdempotencyKey, staffJsonError } from "../../staff/errors";
import { userManagementRepository } from "../../staff/repository";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isStaffLocalEnvironment()) return staffJsonError(503, "CONFIGURATION_UNAVAILABLE", "การจัดการ role ยังไม่พร้อมใช้งาน");
  const actor = localStaffContext(new URL(request.url));
  if (!actor) return staffJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try {
    const body = await readStaffObjectBody(request);
    const permissions = body.permissions;
    if (permissions !== undefined && !Array.isArray(permissions)) throw new UserManagementError("VALIDATION_ERROR", "permissions must be an array");
    const role = userManagementRepository.updateRole(actor, (await params).id, {
      ...(body.displayName !== undefined ? { displayName: requiredStaffString(body, "displayName") } : {}),
      ...(body.status !== undefined ? { status: body.status as "ACTIVE" | "INACTIVE" } : {}),
      ...(permissions !== undefined ? { permissions: permissions as never } : {}),
      expectedVersion: staffExpectedVersion(request, body),
      reason: requiredStaffString(body, "reason"),
      idempotencyKey: staffIdempotencyKey(request, body),
    });
    return NextResponse.json({ role });
  } catch (error) { return staffDomainErrorResponse(error); }
}
