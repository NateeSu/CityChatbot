import { NextResponse } from "next/server";

import { JobOperationsError } from "@citychatbot/job-ops";

import { isSyntheticEnvironment, localIdentityForRole, parseAdminRole } from "../../../../admin/admin-access";
import { getLocalJobOperationsSnapshot, LOCAL_JOB_OPS_TENANT_ID, replayLocalJob } from "./repository";

export const runtime = "nodejs";

const allowedQueryKeys = new Set(["tenantId", "role", "accountId"]);
const operationsRoles = new Set(["TENANT_ADMIN", "EXECUTIVE"]);

const requestIdFor = (request: Request): string => request.headers.get("x-request-id") ?? crypto.randomUUID();
const errorResponse = (status: number, code: string, message: string, requestId: string): NextResponse => NextResponse.json({ error: { code, message }, meta: { requestId, serverTime: new Date().toISOString() } }, { status });

const localActor = (url: URL) => {
  const role = parseAdminRole(url.searchParams.get("role"));
  const identity = role ? localIdentityForRole(role) : undefined;
  if (!identity || !operationsRoles.has(identity.role) || identity.tenantId !== LOCAL_JOB_OPS_TENANT_ID || identity.accountId !== url.searchParams.get("accountId") || url.searchParams.get("tenantId") !== LOCAL_JOB_OPS_TENANT_ID) return undefined;
  return identity;
};

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = requestIdFor(request);
  if (!isSyntheticEnvironment()) return errorResponse(503, "CONFIGURATION_UNAVAILABLE", "Job operations requires a trusted server session and durable job store", requestId);
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => !allowedQueryKeys.has(key))) return errorResponse(400, "VALIDATION_ERROR", "Unknown job operations filter", requestId);
  if (!localActor(url)) return errorResponse(403, "FORBIDDEN", "Job operations is not available for this tenant or role", requestId);
  try { return NextResponse.json({ data: getLocalJobOperationsSnapshot(), meta: { requestId, serverTime: new Date().toISOString() } }); }
  catch (error) { return errorResponse(error instanceof JobOperationsError ? 400 : 500, error instanceof JobOperationsError ? error.code : "PROCESSING_FAILED", error instanceof Error ? error.message : "Unable to read job operations", requestId); }
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = requestIdFor(request);
  if (!isSyntheticEnvironment()) return errorResponse(503, "CONFIGURATION_UNAVAILABLE", "Job operations requires a trusted server session and durable job store", requestId);
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => !allowedQueryKeys.has(key))) return errorResponse(400, "VALIDATION_ERROR", "Unknown job operations filter", requestId);
  const identity = localActor(url);
  if (!identity || identity.role !== "TENANT_ADMIN") return errorResponse(403, "FORBIDDEN", "Only tenant admin can replay a job", requestId);
  try {
    const body = await request.json() as { jobId?: unknown; reason?: unknown; idempotencyKey?: unknown; quarantineApproved?: unknown };
    if (typeof body.jobId !== "string" || typeof body.reason !== "string" || typeof body.idempotencyKey !== "string" || (body.quarantineApproved !== undefined && typeof body.quarantineApproved !== "boolean")) return errorResponse(400, "VALIDATION_ERROR", "jobId, reason and idempotencyKey are required", requestId);
    if (request.headers.get("idempotency-key") !== body.idempotencyKey) return errorResponse(400, "VALIDATION_ERROR", "idempotency-key header must match the request body", requestId);
    return NextResponse.json({ data: replayLocalJob({ jobId: body.jobId, reason: body.reason, idempotencyKey: body.idempotencyKey, ...(body.quarantineApproved !== undefined ? { quarantineApproved: body.quarantineApproved } : {}), accountId: identity.accountId, role: identity.role }), meta: { requestId, serverTime: new Date().toISOString() } });
  } catch (error) {
    if (error instanceof JobOperationsError) return errorResponse(["FORBIDDEN"].includes(error.code) ? 403 : ["NOT_FOUND"].includes(error.code) ? 404 : error.code === "IDEMPOTENCY_CONFLICT" ? 409 : 400, error.code, error.message, requestId);
    return errorResponse(500, "PROCESSING_FAILED", "Unable to replay job", requestId);
  }
}
