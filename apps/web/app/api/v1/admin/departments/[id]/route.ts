import { NextResponse } from "next/server";

import { organizationDomainErrorResponse, organizationJsonError, readOrganizationExpectedVersion, readOrganizationIdempotencyKey, readOrganizationObjectBody } from "../../organization/errors";
import { isOrganizationLocalEnvironment, localOrganizationContext } from "../../organization/context";
import { organizationConfigRepository } from "../../organization/repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isOrganizationLocalEnvironment()) return organizationJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่าองค์กรยังไม่พร้อมใช้งาน");
  const actor = localOrganizationContext(new URL(request.url));
  if (!actor) return organizationJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try { const { id } = await params; return NextResponse.json({ department: organizationConfigRepository.getDepartment(actor, id), categories: organizationConfigRepository.listCategories(actor), audit: organizationConfigRepository.listAudit(actor) }); } catch (error) { return organizationDomainErrorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isOrganizationLocalEnvironment()) return organizationJsonError(503, "CONFIGURATION_UNAVAILABLE", "การตั้งค่าองค์กรยังไม่พร้อมใช้งาน");
  const actor = localOrganizationContext(new URL(request.url));
  if (!actor) return organizationJsonError(404, "NOT_FOUND", "ไม่พบข้อมูลในขอบเขต tenant ที่คุณมีสิทธิ์ดู");
  try {
    const { id } = await params;
    const body = await readOrganizationObjectBody(request);
    if (body.contact && typeof body.contact === "object" && !Array.isArray(body.contact)) {
      const contact = body.contact as Record<string, unknown>;
      const department = organizationConfigRepository.getDepartment(actor, id);
      const created = organizationConfigRepository.addContact(actor, id, { contactType: contact.contactType as "PHONE" | "EMAIL" | "URL" | "LOCATION" | "LINE", label: String(contact.label ?? ""), value: String(contact.value ?? ""), isPublic: contact.isPublic === true, ...(typeof contact.reviewedAt === "string" ? { reviewedAt: contact.reviewedAt } : {}), reason: String(body.reason ?? ""), idempotencyKey: readOrganizationIdempotencyKey(request, body) });
      return NextResponse.json({ department: organizationConfigRepository.getDepartment(actor, department.id), contact: created }, { status: 201 });
    }
    const department = organizationConfigRepository.updateDepartment(actor, id, { ...(typeof body.code === "string" ? { code: body.code } : {}), ...(typeof body.name === "string" ? { name: body.name } : {}), ...(body.status === "ACTIVE" || body.status === "INACTIVE" ? { status: body.status } : {}), expectedVersion: readOrganizationExpectedVersion(request, body), reason: String(body.reason ?? ""), idempotencyKey: readOrganizationIdempotencyKey(request, body) });
    return NextResponse.json({ department });
  } catch (error) { return organizationDomainErrorResponse(error); }
}
