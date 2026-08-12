import { NextResponse } from "next/server";

import { IncidentOpsError, type IncidentActorRole, type IncidentStatus, type KillSwitchScope } from "@citychatbot/incident-ops";

import { isSyntheticEnvironment, localIdentityForRole, parseAdminRole } from "../../../../admin/admin-access";
import { executeLocalIncidentAction, getLocalIncidentSnapshot, LOCAL_INCIDENT_TENANT_ID } from "./repository";

export const runtime = "nodejs";

const allowedQueryKeys = new Set(["tenantId", "role", "accountId"]);
const allowedBodyKeys = new Set(["action", "incidentId", "killSwitchId", "status", "scope", "target", "reason", "evidenceDigest", "artifactRef", "audience", "message", "idempotencyKey"]);
const readRoles = new Set(["TENANT_ADMIN", "EXECUTIVE"]);
const requestIdFor = (request: Request): string => request.headers.get("x-request-id") ?? crypto.randomUUID();
const errorResponse = (status: number, code: string, message: string, requestId: string): NextResponse => NextResponse.json({ error: { code, message }, meta: { requestId, serverTime: new Date().toISOString() } }, { status });

const localActor = (url: URL) => {
  const role = parseAdminRole(url.searchParams.get("role"));
  const identity = role ? localIdentityForRole(role) : undefined;
  if (!identity || !readRoles.has(identity.role) || identity.tenantId !== LOCAL_INCIDENT_TENANT_ID || identity.accountId !== url.searchParams.get("accountId") || url.searchParams.get("tenantId") !== LOCAL_INCIDENT_TENANT_ID) return undefined;
  return identity;
};

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = requestIdFor(request);
  if (!isSyntheticEnvironment()) return errorResponse(503, "CONFIGURATION_UNAVAILABLE", "Incident operations requires a trusted server session and durable incident store", requestId);
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => !allowedQueryKeys.has(key))) return errorResponse(400, "VALIDATION_ERROR", "Unknown incident operations filter", requestId);
  if (!localActor(url)) return errorResponse(403, "FORBIDDEN", "Incident operations is not available for this tenant or role", requestId);
  try { return NextResponse.json({ data: getLocalIncidentSnapshot(), meta: { requestId, serverTime: new Date().toISOString() } }); }
  catch (error) { return errorResponse(error instanceof IncidentOpsError ? 400 : 500, error instanceof IncidentOpsError ? error.code : "PROCESSING_FAILED", error instanceof Error ? error.message : "Unable to read incident operations", requestId); }
}

export async function POST(request: Request): Promise<NextResponse> {
  const requestId = requestIdFor(request);
  if (!isSyntheticEnvironment()) return errorResponse(503, "CONFIGURATION_UNAVAILABLE", "Incident operations requires a trusted server session and durable incident store", requestId);
  const url = new URL(request.url);
  if ([...url.searchParams.keys()].some((key) => !allowedQueryKeys.has(key))) return errorResponse(400, "VALIDATION_ERROR", "Unknown incident operations filter", requestId);
  const identity = localActor(url);
  if (!identity || identity.role !== "TENANT_ADMIN") return errorResponse(403, "FORBIDDEN", "Only tenant admin can operate incident controls", requestId);
  try {
    const body = await request.json() as Record<string, unknown>;
    if (Object.keys(body).some((key) => !allowedBodyKeys.has(key))) return errorResponse(400, "VALIDATION_ERROR", "Unknown incident operation field", requestId);
    const action = body.action as "ADVANCE" | "ACTIVATE_KILL_SWITCH" | "RELEASE_KILL_SWITCH" | "PRESERVE_EVIDENCE" | "PUBLISH_STATUS";
    if (typeof action !== "string" || !["ADVANCE", "ACTIVATE_KILL_SWITCH", "RELEASE_KILL_SWITCH", "PRESERVE_EVIDENCE", "PUBLISH_STATUS"].includes(action)) return errorResponse(400, "VALIDATION_ERROR", "action is invalid", requestId);
    const idempotencyKey = body.idempotencyKey;
    if ((action === "ACTIVATE_KILL_SWITCH" || action === "PUBLISH_STATUS") && (typeof idempotencyKey !== "string" || request.headers.get("idempotency-key") !== idempotencyKey)) return errorResponse(400, "VALIDATION_ERROR", "idempotency-key header must match the body", requestId);
    if (action === "ADVANCE" && (typeof body.incidentId !== "string" || typeof body.status !== "string" || typeof body.reason !== "string")) return errorResponse(400, "VALIDATION_ERROR", "incidentId, status and reason are required", requestId);
    if (action === "ACTIVATE_KILL_SWITCH" && (typeof body.incidentId !== "string" || typeof body.scope !== "string" || typeof body.target !== "string" || typeof body.reason !== "string" || typeof idempotencyKey !== "string")) return errorResponse(400, "VALIDATION_ERROR", "incidentId, scope, target, reason and idempotencyKey are required", requestId);
    if (action === "RELEASE_KILL_SWITCH" && (typeof body.killSwitchId !== "string" || typeof body.reason !== "string")) return errorResponse(400, "VALIDATION_ERROR", "killSwitchId and reason are required", requestId);
    if (action === "PRESERVE_EVIDENCE" && (typeof body.incidentId !== "string" || typeof body.evidenceDigest !== "string" || typeof body.artifactRef !== "string")) return errorResponse(400, "VALIDATION_ERROR", "incidentId, evidenceDigest and artifactRef are required", requestId);
    if (action === "PUBLISH_STATUS" && (typeof body.incidentId !== "string" || typeof body.audience !== "string" || typeof body.message !== "string" || typeof idempotencyKey !== "string")) return errorResponse(400, "VALIDATION_ERROR", "incidentId, audience, message and idempotencyKey are required", requestId);
    const input = action === "ADVANCE"
      ? { action, incidentId: body.incidentId as string, status: body.status as IncidentStatus, reason: body.reason as string, accountId: identity.accountId, role: identity.role as IncidentActorRole }
      : action === "ACTIVATE_KILL_SWITCH"
        ? { action, incidentId: body.incidentId as string, scope: body.scope as KillSwitchScope, target: body.target as string, reason: body.reason as string, idempotencyKey: idempotencyKey as string, accountId: identity.accountId, role: identity.role as IncidentActorRole }
        : action === "RELEASE_KILL_SWITCH"
          ? { action, killSwitchId: body.killSwitchId as string, reason: body.reason as string, accountId: identity.accountId, role: identity.role as IncidentActorRole }
          : action === "PRESERVE_EVIDENCE"
            ? { action, incidentId: body.incidentId as string, evidenceDigest: body.evidenceDigest as string, artifactRef: body.artifactRef as string, accountId: identity.accountId, role: identity.role as IncidentActorRole }
            : { action, incidentId: body.incidentId as string, audience: body.audience as "INTERNAL" | "TENANT" | "PUBLIC", message: body.message as string, idempotencyKey: idempotencyKey as string, accountId: identity.accountId, role: identity.role as IncidentActorRole };
    return NextResponse.json({ data: executeLocalIncidentAction(input), meta: { requestId, serverTime: new Date().toISOString() } });
  } catch (error) {
    if (error instanceof IncidentOpsError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : error.code === "IDEMPOTENCY_CONFLICT" ? 409 : error.code === "INVALID_STATE" ? 409 : 400;
      return errorResponse(status, error.code, error.message, requestId);
    }
    return errorResponse(500, "PROCESSING_FAILED", "Unable to operate incident control", requestId);
  }
}
