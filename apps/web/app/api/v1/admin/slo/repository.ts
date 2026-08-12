import {
  SLO_DEFINITIONS,
  SYNTHETIC_PROBES,
  buildSloDashboard,
  buildSyntheticProbeResult,
  type SloDashboard,
  type SloObservation,
  type SloWindowRange,
} from "@citychatbot/slo";

import { LOCAL_ADMIN_TENANT_ID } from "../../../../admin/admin-access";

export const LOCAL_SLO_TENANT_ID = LOCAL_ADMIN_TENANT_ID;
export const LOCAL_SLO_NOW = "2026-08-11T04:00:00.000Z";
export const DEFAULT_SLO_FROM = "2026-08-10T04:00:00.000Z";
export const DEFAULT_SLO_TO = LOCAL_SLO_NOW;

const sampleTimes = [
  "2026-08-10T05:00:00.000Z",
  "2026-08-10T12:00:00.000Z",
  "2026-08-10T20:00:00.000Z",
] as const;

const requestIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
] as const;

const correlationIds = [
  "44444444-4444-4444-8444-444444444444",
  "55555555-5555-4555-8555-555555555555",
  "66666666-6666-4666-8666-666666666666",
] as const;

const localObservations: readonly SloObservation[] = SLO_DEFINITIONS.flatMap((definition) => sampleTimes.map((observedAt, index) => ({
  tenantId: LOCAL_SLO_TENANT_ID,
  sloId: definition.sloId,
  observedAt,
  value: definition.kind === "RATIO" ? 1 : Math.max(1, Math.floor(definition.targetValue * 0.6)),
  ...(definition.kind === "RATIO" ? { good: true } : {}),
  requestId: requestIds[index],
  correlationId: correlationIds[index],
})));

const localProbes = SYNTHETIC_PROBES.map((probe, index) => buildSyntheticProbeResult({
  probeId: probe.probeId,
  tenantId: LOCAL_SLO_TENANT_ID,
  observedAt: LOCAL_SLO_NOW,
  statusCode: probe.expectedStatus,
  latencyMs: 80 + index * 20,
  correlationId: correlationIds[index]!,
}));

const windowFor = (input?: SloWindowRange): SloWindowRange => ({
  from: input?.from ?? DEFAULT_SLO_FROM,
  to: input?.to ?? DEFAULT_SLO_TO,
});

export const getLocalSloDashboard = (input?: { window?: SloWindowRange }): SloDashboard => buildSloDashboard({
  tenantId: LOCAL_SLO_TENANT_ID,
  window: windowFor(input?.window),
  observations: localObservations,
  probes: localProbes,
  generatedAt: LOCAL_SLO_NOW,
  source: "SYNTHETIC_FIXTURE",
});

export const localSloSource = {
  tenantId: LOCAL_SLO_TENANT_ID,
  observationCount: localObservations.length,
  probeCount: localProbes.length,
};
