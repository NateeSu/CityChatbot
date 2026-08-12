import { NextResponse } from "next/server";
import { UserManagementError } from "@citychatbot/user-management";

import { isStaffLocalEnvironment, localStaffContext } from "../staff/context";
import { readStaffObjectBody, requiredStaffString, staffDomainErrorResponse, staffIdempotencyKey, staffJsonError } from "../staff/errors";
import { userManagementRepository } from "../staff/repository";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isStaffLocalEnvironment()) return staffJsonError(503, "CONFIGURATION_UNAVAILABLE", "การจัดการ role ยังไม่พร้อมใช้งาน");
  const actor = localStaffContext(new URL(request.url));
  if (!actor) return staffJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try { return NextResponse.json({ roles: userManagementRepository.listRoles(actor) }); } catch (error) { return staffDomainErrorResponse(error); }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isStaffLocalEnvironment()) return staffJsonError(503, "CONFIGURATION_UNAVAILABLE", "การจัดการ role ยังไม่พร้อมใช้งาน");
  const actor = localStaffContext(new URL(request.url));
  if (!actor) return staffJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try {
    const body = await readStaffObjectBody(request);
    const permissions = body.permissions;
    if (!Array.isArray(permissions)) throw new UserManagementError("VALIDATION_ERROR", "permissions must be an array");
    const role = userManagementRepository.createRole(actor, { code: requiredStaffString(body, "code"), displayName: requiredStaffString(body, "displayName"), permissions: permissions as never, reason: requiredStaffString(body, "reason"), idempotencyKey: staffIdempotencyKey(request, body) });
    return NextResponse.json({ role }, { status: 201 });
  } catch (error) { return staffDomainErrorResponse(error); }
}
