import {
  IncidentOpsRepository,
  type IncidentActorRole,
  type IncidentSnapshot,
  type IncidentStatus,
  type KillSwitchScope,
} from "@citychatbot/incident-ops";

import { LOCAL_ADMIN_TENANT_ID } from "../../../../admin/admin-access";

export const LOCAL_INCIDENT_TENANT_ID = LOCAL_ADMIN_TENANT_ID;
export const LOCAL_INCIDENT_NOW = new Date("2026-08-11T04:00:00.000Z");
const CORRELATION_ID = "77777777-7777-4777-8777-777777777777";

const repository = new IncidentOpsRepository();
const lineIncident = repository.declare({
  tenantId: LOCAL_INCIDENT_TENANT_ID,
  category: "LINE_PROVIDER_OUTAGE",
  title: "LINE provider outage fixture",
  summary: "Synthetic provider failure; core complaint path remains available.",
  correlationId: CORRELATION_ID,
  actorRole: "TENANT_ADMIN",
  idempotencyKey: "fixture:line:outage",
  now: LOCAL_INCIDENT_NOW,
});
repository.transition({ tenantId: LOCAL_INCIDENT_TENANT_ID, incidentId: lineIncident.id, status: "CONTAINING", reason: "Pause noncritical broadcast and keep complaint outbox durable", actorRole: "TENANT_ADMIN", now: LOCAL_INCIDENT_NOW });
repository.activateKillSwitch({ tenantId: LOCAL_INCIDENT_TENANT_ID, incidentId: lineIncident.id, scope: "FEATURE", target: "line-notification", reason: "Provider outage containment fixture", actorRole: "TENANT_ADMIN", idempotencyKey: "fixture:line:kill", now: LOCAL_INCIDENT_NOW });
repository.recordBudget({ evaluation: { tenantId: LOCAL_INCIDENT_TENANT_ID, resource: "AI_TOKENS", used: 92, limit: 100, utilization: 0.92, level: "RESTRICT_NONCRITICAL_AI", nonCriticalAiAllowed: false, coreComplaintAllowed: true, recommendedAction: "Restrict noncritical AI and alert budget owner", measuredAt: LOCAL_INCIDENT_NOW.toISOString() } });
repository.recordBudget({ evaluation: { tenantId: LOCAL_INCIDENT_TENANT_ID, resource: "LINE_API", used: 68, limit: 100, utilization: 0.68, level: "OK", nonCriticalAiAllowed: true, coreComplaintAllowed: true, recommendedAction: "Continue monitoring", measuredAt: LOCAL_INCIDENT_NOW.toISOString() } });

export const getLocalIncidentSnapshot = (): IncidentSnapshot => repository.snapshot(LOCAL_INCIDENT_TENANT_ID, LOCAL_INCIDENT_NOW);

export type LocalIncidentAction =
  | { action: "ADVANCE"; incidentId: string; status: IncidentStatus; reason: string; accountId: string; role: IncidentActorRole }
  | { action: "ACTIVATE_KILL_SWITCH"; incidentId: string; scope: KillSwitchScope; target: string; reason: string; idempotencyKey: string; accountId: string; role: IncidentActorRole }
  | { action: "RELEASE_KILL_SWITCH"; killSwitchId: string; reason: string; accountId: string; role: IncidentActorRole }
  | { action: "PRESERVE_EVIDENCE"; incidentId: string; evidenceDigest: string; artifactRef: string; accountId: string; role: IncidentActorRole }
  | { action: "PUBLISH_STATUS"; incidentId: string; audience: "INTERNAL" | "TENANT" | "PUBLIC"; message: string; idempotencyKey: string; accountId: string; role: IncidentActorRole };

export const executeLocalIncidentAction = (input: LocalIncidentAction) => {
  if (input.action === "ADVANCE") return repository.transition({ tenantId: LOCAL_INCIDENT_TENANT_ID, incidentId: input.incidentId, status: input.status, reason: input.reason, actorRole: input.role, now: LOCAL_INCIDENT_NOW });
  if (input.action === "ACTIVATE_KILL_SWITCH") return repository.activateKillSwitch({ tenantId: LOCAL_INCIDENT_TENANT_ID, incidentId: input.incidentId, scope: input.scope, target: input.target, reason: input.reason, idempotencyKey: input.idempotencyKey, actorRole: input.role, now: LOCAL_INCIDENT_NOW });
  if (input.action === "RELEASE_KILL_SWITCH") return repository.releaseKillSwitch({ tenantId: LOCAL_INCIDENT_TENANT_ID, killSwitchId: input.killSwitchId, reason: input.reason, actorRole: input.role, now: LOCAL_INCIDENT_NOW });
  if (input.action === "PRESERVE_EVIDENCE") return repository.preserveEvidence({ tenantId: LOCAL_INCIDENT_TENANT_ID, incidentId: input.incidentId, evidenceDigest: input.evidenceDigest, artifactRef: input.artifactRef, actorRole: input.role, now: LOCAL_INCIDENT_NOW });
  return repository.publishStatus({ tenantId: LOCAL_INCIDENT_TENANT_ID, incidentId: input.incidentId, audience: input.audience, message: input.message, idempotencyKey: input.idempotencyKey, actorRole: input.role, now: LOCAL_INCIDENT_NOW });
};

export const localIncidentRepository = repository;
