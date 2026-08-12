import { NextResponse } from "next/server";

import { organizationDomainErrorResponse, organizationJsonError, readOrganizationIdempotencyKey, readOrganizationObjectBody, requiredString } from "../organization/errors";
import { isOrganizationLocalEnvironment, localOrganizationContext } from "../organization/context";
import { organizationConfigRepository } from "../organization/repository";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isOrganizationLocalEnvironment()) return organizationJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่าองค์กรยังไม่พร้อมใช้งาน");
  const actor = localOrganizationContext(new URL(request.url));
  if (!actor) return organizationJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  return NextResponse.json({ departments: organizationConfigRepository.listDepartments(actor), categories: organizationConfigRepository.listCategories(actor), audit: organizationConfigRepository.listAudit(actor) });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isOrganizationLocalEnvironment()) return organizationJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่าองค์กรยังไม่พร้อมใช้งาน");
  const actor = localOrganizationContext(new URL(request.url));
  if (!actor) return organizationJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try {
    const body = await readOrganizationObjectBody(request);
    const department = organizationConfigRepository.createDepartment(actor, { code: requiredString(body, "code"), name: requiredString(body, "name"), reason: requiredString(body, "reason"), idempotencyKey: readOrganizationIdempotencyKey(request, body) });
    return NextResponse.json({ department }, { status: 201 });
  } catch (error) { return organizationDomainErrorResponse(error); }
}
