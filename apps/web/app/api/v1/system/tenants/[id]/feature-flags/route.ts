import { NextResponse } from "next/server";

import { TenantProvisioningError } from "@citychatbot/tenant-provisioning";
import type { FeatureFlagKey } from "@citychatbot/tenant-provisioning";

import { isTenantSystemLocalEnvironment, localSystemContext } from "../../context";
import { readTenantSystemBody, requiredTenantString, tenantSystemErrorResponse, tenantSystemIdempotencyKey, tenantSystemJsonError } from "../../errors";
import { tenantProvisioningRepository } from "../../repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isTenantSystemLocalEnvironment()) return tenantSystemJsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบ feature flag ยังไม่พร้อมใช้งาน");
  const actor = localSystemContext(new URL(request.url));
  if (!actor) return tenantSystemJsonError(404, "NOT_FOUND", "ไม่พบ system session");
  try { const snapshot = tenantProvisioningRepository.snapshot(actor); const id = (await params).id; return NextResponse.json({ flags: snapshot.flags.filter((flag) => flag.tenantId === id) }); } catch (error) { return tenantSystemErrorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isTenantSystemLocalEnvironment()) return tenantSystemJsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบ feature flag ยังไม่พร้อมใช้งาน");
  const actor = localSystemContext(new URL(request.url));
  if (!actor) return tenantSystemJsonError(404, "NOT_FOUND", "ไม่พบ system session");
  try {
    const body = await readTenantSystemBody(request);
    const key = body.key;
    if (typeof key !== "string" || typeof body.enabled !== "boolean") throw new TenantProvisioningError("VALIDATION_ERROR", "key and enabled are required");
    const result = tenantProvisioningRepository.setFeatureFlag(actor, (await params).id, { key: key as FeatureFlagKey, enabled: body.enabled, ...(typeof body.effectiveFrom === "string" ? { effectiveFrom: body.effectiveFrom } : {}), reason: requiredTenantString(body, "reason"), idempotencyKey: tenantSystemIdempotencyKey(request, body) });
    return NextResponse.json({ flag: result });
  } catch (error) { return tenantSystemErrorResponse(error); }
}
