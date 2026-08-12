import { NextResponse } from "next/server";

import { organizationDomainErrorResponse, organizationJsonError, readOrganizationIdempotencyKey, readOrganizationObjectBody, requiredString } from "../../../organization/errors";
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
    if (!body.rules || typeof body.rules !== "object" || Array.isArray(body.rules)) throw new Error("rules is required");
    const workScope = organizationConfigRepository.createWorkScopeVersion(actor, id, { rules: body.rules as never, ...(typeof body.effectiveFrom === "string" ? { effectiveFrom: body.effectiveFrom } : {}), ...(typeof body.effectiveUntil === "string" ? { effectiveUntil: body.effectiveUntil } : {}), reason: requiredString(body, "reason"), idempotencyKey: readOrganizationIdempotencyKey(request, body) });
    return NextResponse.json({ workScope }, { status: 201 });
  } catch (error) { return organizationDomainErrorResponse(error); }
}
