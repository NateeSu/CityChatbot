import { NextResponse } from "next/server";
import { TenantProvisioningError } from "@citychatbot/tenant-provisioning";

import { isTenantSystemLocalEnvironment, localSystemContext } from "./context";
import { readTenantSystemBody, requiredTenantString, tenantSystemErrorResponse, tenantSystemIdempotencyKey, tenantSystemJsonError } from "./errors";
import { tenantProvisioningRepository } from "./repository";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  if (!isTenantSystemLocalEnvironment()) return tenantSystemJsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบ provisioning tenant ยังไม่พร้อมใช้งาน");
  const actor = localSystemContext(new URL(request.url));
  if (!actor) return tenantSystemJsonError(404, "NOT_FOUND", "ไม่พบ system session");
  try { return NextResponse.json(tenantProvisioningRepository.snapshot(actor)); } catch (error) { return tenantSystemErrorResponse(error); }
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!isTenantSystemLocalEnvironment()) return tenantSystemJsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบ provisioning tenant ยังไม่พร้อมใช้งาน");
  const actor = localSystemContext(new URL(request.url));
  if (!actor) return tenantSystemJsonError(404, "NOT_FOUND", "ไม่พบ system session");
  try {
    const body = await readTenantSystemBody(request);
    if (body.packageCode !== undefined && body.packageCode !== "PILOT" && body.packageCode !== "STANDARD" && body.packageCode !== "ENTERPRISE") throw new TenantProvisioningError("VALIDATION_ERROR", "packageCode is invalid");
    const result = tenantProvisioningRepository.provisionTenant(actor, { slug: requiredTenantString(body, "slug"), displayName: requiredTenantString(body, "displayName"), ...(typeof body.defaultTimezone === "string" ? { defaultTimezone: body.defaultTimezone } : {}), ...(body.packageCode === "PILOT" || body.packageCode === "STANDARD" || body.packageCode === "ENTERPRISE" ? { packageCode: body.packageCode } : {}), ...(typeof body.isTestTenant === "boolean" ? { isTestTenant: body.isTestTenant } : {}), reason: requiredTenantString(body, "reason"), idempotencyKey: tenantSystemIdempotencyKey(request, body) });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return tenantSystemErrorResponse(error); }
}
