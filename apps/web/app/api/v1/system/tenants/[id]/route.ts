import { NextResponse } from "next/server";

import { isTenantSystemLocalEnvironment, localSystemContext } from "../context";
import { tenantSystemErrorResponse, tenantSystemJsonError } from "../errors";
import { tenantProvisioningRepository } from "../repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isTenantSystemLocalEnvironment()) return tenantSystemJsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบ provisioning tenant ยังไม่พร้อมใช้งาน");
  const actor = localSystemContext(new URL(request.url));
  if (!actor) return tenantSystemJsonError(404, "NOT_FOUND", "ไม่พบ system session");
  try { return NextResponse.json({ tenant: tenantProvisioningRepository.getTenant(actor, (await params).id) }); } catch (error) { return tenantSystemErrorResponse(error); }
}
