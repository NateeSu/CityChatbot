import { NextResponse } from "next/server";
import { UserManagementError } from "@citychatbot/user-management";

import { isStaffLocalEnvironment, localStaffContext } from "../context";
import { readStaffObjectBody, requiredStaffString, staffDomainErrorResponse, staffExpectedVersion, staffIdempotencyKey, staffJsonError, staffStringArray } from "../errors";
import { userManagementRepository } from "../repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ membershipId: string }> }): Promise<NextResponse> {
  if (!isStaffLocalEnvironment()) return staffJsonError(503, "CONFIGURATION_UNAVAILABLE", "การจัดการผู้ใช้ยังไม่พร้อมใช้งาน");
  const actor = localStaffContext(new URL(request.url));
  if (!actor) return staffJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try { return NextResponse.json({ staff: userManagementRepository.getStaff(actor, (await params).membershipId) }); } catch (error) { return staffDomainErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ membershipId: string }> }): Promise<NextResponse> {
  if (!isStaffLocalEnvironment()) return staffJsonError(503, "CONFIGURATION_UNAVAILABLE", "การจัดการผู้ใช้ยังไม่พร้อมใช้งาน");
  const actor = localStaffContext(new URL(request.url));
  if (!actor) return staffJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try {
    const body = await readStaffObjectBody(request);
    const status = body.status;
    if (status !== undefined && status !== "ACTIVE" && status !== "SUSPENDED" && status !== "DEACTIVATED") throw new UserManagementError("VALIDATION_ERROR", "status is invalid");
    const { membershipId } = await params;
    const staff = userManagementRepository.updateStaff(actor, membershipId, {
      ...(status ? { status } : {}),
      ...(body.displayName !== undefined ? { displayName: requiredStaffString(body, "displayName") } : {}),
      ...(body.departmentIds !== undefined ? { departmentIds: staffStringArray(body, "departmentIds") } : {}),
      expectedVersion: staffExpectedVersion(request, body),
      reason: requiredStaffString(body, "reason"),
      idempotencyKey: staffIdempotencyKey(request, body),
    });
    return NextResponse.json({ staff });
  } catch (error) { return staffDomainErrorResponse(error); }
}
