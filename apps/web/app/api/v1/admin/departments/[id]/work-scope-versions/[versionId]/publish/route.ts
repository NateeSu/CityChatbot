import { NextResponse } from "next/server";

import { organizationDomainErrorResponse, organizationJsonError, readOrganizationExpectedVersion, readOrganizationIdempotencyKey, readOrganizationObjectBody, requiredString } from "../../../../../organization/errors";
import { isOrganizationLocalEnvironment, localOrganizationContext } from "../../../../../organization/context";
import { organizationConfigRepository } from "../../../../../organization/repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string; versionId: string }> }): Promise<NextResponse> {
  if (!isOrganizationLocalEnvironment()) return organizationJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่าองค์กรยังไม่พร้อมใช้งาน");
  const actor = localOrganizationContext(new URL(request.url));
  if (!actor) return organizationJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try {
    const { id, versionId } = await params;
    const body = await readOrganizationObjectBody(request);
    const workScope = organizationConfigRepository.publishWorkScopeVersion(actor, id, versionId, readOrganizationExpectedVersion(request, body), requiredString(body, "reason"), readOrganizationIdempotencyKey(request, body));
    return NextResponse.json({ workScope });
  } catch (error) { return organizationDomainErrorResponse(error); }
}
