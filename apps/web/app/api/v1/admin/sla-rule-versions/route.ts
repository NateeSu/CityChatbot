import { NextResponse } from "next/server";

import { organizationDomainErrorResponse, organizationJsonError, readOrganizationIdempotencyKey, readOrganizationObjectBody, requiredString } from "../organization/errors";
import { isOrganizationLocalEnvironment, localOrganizationContext } from "../organization/context";
import { organizationConfigRepository } from "../organization/repository";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isOrganizationLocalEnvironment()) return organizationJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่าองค์กรยังไม่พร้อมใช้งาน");
  const actor = localOrganizationContext(new URL(request.url));
  if (!actor) return organizationJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  return NextResponse.json({ slaRules: organizationConfigRepository.listSlaRules(actor) });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isOrganizationLocalEnvironment()) return organizationJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่าองค์กรยังไม่พร้อมใช้งาน");
  const actor = localOrganizationContext(new URL(request.url));
  if (!actor) return organizationJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try {
    const body = await readOrganizationObjectBody(request);
    const slaRule = organizationConfigRepository.createSlaRule(actor, { ...(typeof body.departmentId === "string" ? { departmentId: body.departmentId } : {}), ...(body.priority === "LOW" || body.priority === "NORMAL" || body.priority === "HIGH" || body.priority === "URGENT" ? { priority: body.priority } : {}), calendarId: requiredString(body, "calendarId"), responseTargetSeconds: Number(body.responseTargetSeconds), resolutionTargetSeconds: Number(body.resolutionTargetSeconds), warningRatio: Number(body.warningRatio), pauseStatuses: Array.isArray(body.pauseStatuses) ? body.pauseStatuses.filter((item): item is string => typeof item === "string") : [], ...(typeof body.effectiveFrom === "string" ? { effectiveFrom: body.effectiveFrom } : {}), ...(typeof body.effectiveUntil === "string" ? { effectiveUntil: body.effectiveUntil } : {}), reason: requiredString(body, "reason"), idempotencyKey: readOrganizationIdempotencyKey(request, body) });
    return NextResponse.json({ slaRule }, { status: 201 });
  } catch (error) { return organizationDomainErrorResponse(error); }
}
