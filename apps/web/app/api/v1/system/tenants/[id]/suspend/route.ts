import { NextResponse } from "next/server";

import { isTenantSystemLocalEnvironment, localSystemContext } from "../../context";
import { readTenantSystemBody, requiredTenantString, tenantExpectedVersion, tenantSystemErrorResponse, tenantSystemIdempotencyKey, tenantSystemJsonError } from "../../errors";
import { tenantProvisioningRepository } from "../../repository";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isTenantSystemLocalEnvironment()) return tenantSystemJsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบ provisioning tenant ยังไม่พร้อมใช้งาน");
  const actor = localSystemContext(new URL(request.url));
  if (!actor) return tenantSystemJsonError(404, "NOT_FOUND", "ไม่พบ system session");
  try { const body = await readTenantSystemBody(request); const result = tenantProvisioningRepository.suspendTenant(actor, (await params).id, tenantExpectedVersion(request, body), requiredTenantString(body, "reason"), tenantSystemIdempotencyKey(request, body)); return NextResponse.json({ tenant: result }); } catch (error) { return tenantSystemErrorResponse(error); }
}
