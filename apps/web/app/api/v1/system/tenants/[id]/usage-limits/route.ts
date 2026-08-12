import { NextResponse } from "next/server";

import { TenantProvisioningError } from "@citychatbot/tenant-provisioning";
import type { UsageLimitKey, UsageWindow } from "@citychatbot/tenant-provisioning";

import { isTenantSystemLocalEnvironment, localSystemContext } from "../../context";
import { readTenantSystemBody, requiredTenantString, tenantSystemErrorResponse, tenantSystemIdempotencyKey, tenantSystemJsonError } from "../../errors";
import { tenantProvisioningRepository } from "../../repository";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isTenantSystemLocalEnvironment()) return tenantSystemJsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบ usage limit ยังไม่พร้อมใช้งาน");
  const actor = localSystemContext(new URL(request.url));
  if (!actor) return tenantSystemJsonError(404, "NOT_FOUND", "ไม่พบ system session");
  try { const snapshot = tenantProvisioningRepository.snapshot(actor); const id = (await params).id; return NextResponse.json({ limits: snapshot.limits.filter((limit) => limit.tenantId === id), usage: snapshot.usage.filter((counter) => counter.tenantId === id) }); } catch (error) { return tenantSystemErrorResponse(error); }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  if (!isTenantSystemLocalEnvironment()) return tenantSystemJsonError(503, "CONFIGURATION_UNAVAILABLE", "ระบบ usage limit ยังไม่พร้อมใช้งาน");
  const actor = localSystemContext(new URL(request.url));
  if (!actor) return tenantSystemJsonError(404, "NOT_FOUND", "ไม่พบ system session");
  try {
    const body = await readTenantSystemBody(request);
    if (typeof body.key !== "string" || (body.window !== "DAY" && body.window !== "MONTH") || typeof body.limit !== "number") throw new TenantProvisioningError("VALIDATION_ERROR", "key/window/limit is invalid");
    const result = tenantProvisioningRepository.setUsageLimit(actor, (await params).id, { key: body.key as UsageLimitKey, window: body.window as UsageWindow, limit: body.limit, reason: requiredTenantString(body, "reason"), idempotencyKey: tenantSystemIdempotencyKey(request, body) });
    return NextResponse.json({ limit: result });
  } catch (error) { return tenantSystemErrorResponse(error); }
}
