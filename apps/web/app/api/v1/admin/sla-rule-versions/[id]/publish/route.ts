import { NextResponse } from "next/server";

import { organizationDomainErrorResponse, organizationJsonError, readOrganizationExpectedVersion, readOrganizationIdempotencyKey, readOrganizationObjectBody, requiredString } from "../../../organization/errors";
import { isOrganizationLocalEnvironment, localOrganizationContext } from "../../../organization/context";
import { organizationConfigRepository } from "../../../organization/repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isOrganizationLocalEnvironment()) return organizationJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่าองค์กรยังไม่พร้อมใช้งาน");
  const actor = localOrganizationContext(new URL(request.url));
  if (!actor) return organizationJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try {
    const { id } = await params;
    const body = await readOrganizationObjectBody(request);
    const slaRule = organizationConfigRepository.publishSlaRule(actor, id, readOrganizationExpectedVersion(request, body), requiredString(body, "reason"), readOrganizationIdempotencyKey(request, body));
    return NextResponse.json({ slaRule });
  } catch (error) { return organizationDomainErrorResponse(error); }
}
