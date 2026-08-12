import { createHash } from "node:crypto";

export type SloSeverity = "SEV1" | "SEV2";
export type SloKind = "RATIO" | "THRESHOLD";
export type SloUnit = "RATIO" | "MILLISECONDS";
export type SloWindow = "MONTHLY" | "ROLLING_24H";
export type SloStatus = "HEALTHY" | "AT_RISK" | "BREACHED" | "NO_DATA";
export type SloAlertAction = "OPEN" | "UPDATE" | "RECOVERY" | "NO_DATA";

export class SloContractError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "SloContractError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const RUNBOOK_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;

const assertUuid = (value: string, code: string): void => {
  if (!UUID_PATTERN.test(value)) throw new SloContractError(code, "Identifier must be a UUID");
};

const assertIso = (value: string, code: string): void => {
  if (!ISO_PATTERN.test(value) || Number.isNaN(Date.parse(value))) throw new SloContractError(code, "Timestamp must be canonical UTC ISO");
};

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

const stableId = (value: string): string => createHash("sha256").update(value).digest("hex").slice(0, 24);

export type SloDefinition = {
  sloId: string;
  requirementId: string;
  name: string;
  description: string;
  kind: SloKind;
  unit: SloUnit;
  targetValue: number;
  successObjective: number;
  percentile?: number;
  window: SloWindow;
  owner: string;
  severity: SloSeverity;
  runbookId: string;
  source: string;
};

const ratioDefinition = (input: Omit<SloDefinition, "kind" | "unit" | "successObjective"> & { targetValue: number }): SloDefinition => ({
  ...input,
  kind: "RATIO",
  unit: "RATIO",
  successObjective: input.targetValue,
});

const thresholdDefinition = (input: Omit<SloDefinition, "kind" | "unit" | "successObjective"> & { targetValue: number; percentile: number }): SloDefinition => ({
  ...input,
  kind: "THRESHOLD",
  unit: "MILLISECONDS",
  successObjective: input.percentile,
});

export const SLO_DEFINITIONS = [
  ratioDefinition({
    sloId: "NFR-AVAIL-001",
    requirementId: "NFR-AVAIL-001",
    name: "Core monthly availability",
    description: "Core citizen, admin and webhook paths remain available during the monthly window.",
    targetValue: 0.999,
    window: "MONTHLY",
    owner: "SRE",
    severity: "SEV1",
    runbookId: "core-availability",
    source: "trusted_http_health_and_request_metrics",
  }),
  thresholdDefinition({
    sloId: "NFR-LINE-001-P95",
    requirementId: "NFR-LINE-001",
    name: "LINE webhook persist acknowledgement p95",
    description: "Webhook persistence acknowledgement stays within the p95 target.",
    targetValue: 1000,
    percentile: 0.95,
    window: "ROLLING_24H",
    owner: "LINE Platform",
    severity: "SEV1",
    runbookId: "webhook-ack",
    source: "trusted_webhook_ack_metrics",
  }),
  thresholdDefinition({
    sloId: "NFR-LINE-001-P99",
    requirementId: "NFR-LINE-001",
    name: "LINE webhook persist acknowledgement p99",
    description: "Webhook persistence acknowledgement stays within the p99 hard ceiling.",
    targetValue: 2000,
    percentile: 0.99,
    window: "ROLLING_24H",
    owner: "LINE Platform",
    severity: "SEV1",
    runbookId: "webhook-ack",
    source: "trusted_webhook_ack_metrics",
  }),
  thresholdDefinition({
    sloId: "NFR-API-001-P95",
    requirementId: "NFR-API-001",
    name: "Citizen non-AI API p95",
    description: "Citizen non-AI API latency stays within the baseline target.",
    targetValue: 500,
    percentile: 0.95,
    window: "ROLLING_24H",
    owner: "Backend",
    severity: "SEV1",
    runbookId: "citizen-api-latency",
    source: "trusted_http_latency_metrics",
  }),
  thresholdDefinition({
    sloId: "NFR-ADMIN-001-P95",
    requirementId: "NFR-ADMIN-001",
    name: "Admin list/detail p95",
    description: "Admin list and detail requests stay within the baseline target.",
    targetValue: 1000,
    percentile: 0.95,
    window: "ROLLING_24H",
    owner: "Backend",
    severity: "SEV2",
    runbookId: "admin-latency",
    source: "trusted_http_latency_metrics",
  }),
  thresholdDefinition({
    sloId: "NFR-RAG-001-P95",
    requirementId: "NFR-RAG-001",
    name: "RAG result or fallback p95",
    description: "Grounded result or safe fallback reaches the user within the AI budget.",
    targetValue: 12000,
    percentile: 0.95,
    window: "ROLLING_24H",
    owner: "AI Platform",
    severity: "SEV2",
    runbookId: "rag-latency",
    source: "trusted_ai_route_latency_metrics",
  }),
  thresholdDefinition({
    sloId: "NFR-LIFF-001-P75",
    requirementId: "NFR-LIFF-001",
    name: "LIFF mobile LCP p75",
    description: "LIFF contentful paint stays within the mobile 4G target.",
    targetValue: 2500,
    percentile: 0.75,
    window: "ROLLING_24H",
    owner: "Frontend",
    severity: "SEV2",
    runbookId: "liff-web-vitals",
    source: "trusted_web_vitals_metrics",
  }),
  thresholdDefinition({
    sloId: "NFR-NOTIFY-001-ENQUEUE-P95",
    requirementId: "NFR-NOTIFY-001",
    name: "Notification enqueue p95",
    description: "Notification enqueue completes within the queueing target.",
    targetValue: 5000,
    percentile: 0.95,
    window: "ROLLING_24H",
    owner: "Messaging",
    severity: "SEV1",
    runbookId: "notification-queue",
    source: "trusted_notification_enqueue_metrics",
  }),
  thresholdDefinition({
    sloId: "NFR-NOTIFY-001-DISPATCH-P95",
    requirementId: "NFR-NOTIFY-001",
    name: "Notification dispatch attempt p95",
    description: "Notification dispatch attempts complete within the provider budget.",
    targetValue: 60000,
    percentile: 0.95,
    window: "ROLLING_24H",
    owner: "Messaging",
    severity: "SEV1",
    runbookId: "notification-dispatch",
    source: "trusted_notification_dispatch_metrics",
  }),
  thresholdDefinition({
    sloId: "NFR-DR-001-RPO",
    requirementId: "NFR-DR-001",
    name: "Recovery point objective",
    description: "The latest recoverable point remains within the approved RPO.",
    targetValue: 15 * 60 * 1000,
    percentile: 0.95,
    window: "ROLLING_24H",
    owner: "Database",
    severity: "SEV1",
    runbookId: "backup-pitr",
    source: "trusted_backup_restore_metrics",
  }),
  thresholdDefinition({
    sloId: "NFR-DR-001-RTO",
    requirementId: "NFR-DR-001",
    name: "Recovery time objective",
    description: "The latest restore rehearsal or incident recovery remains within the approved RTO.",
    targetValue: 4 * 60 * 60 * 1000,
    percentile: 0.95,
    window: "ROLLING_24H",
    owner: "SRE",
    severity: "SEV1",
    runbookId: "restore-rehearsal",
    source: "trusted_backup_restore_metrics",
  }),
] as const satisfies readonly SloDefinition[];

export type SloObservation = {
  tenantId: string;
  sloId: string;
  observedAt: string;
  value: number;
  good?: boolean;
  requestId?: string;
  correlationId?: string;
};

export type SloWindowRange = { from: string; to: string };

export type ErrorBudget = {
  allowedFailureRatio: number;
  observedFailureRatio: number;
  consumedFraction: number;
  remainingFraction: number;
};

export type SloEvaluation = {
  tenantId: string;
  definition: SloDefinition;
  window: SloWindowRange;
  sampleCount: number;
  goodSampleCount: number;
  goodRatio: number;
  measuredValue?: number;
  targetMet: boolean;
  status: SloStatus;
  errorBudget: ErrorBudget;
  requestIds: readonly string[];
  correlationIds: readonly string[];
  evaluatedAt: string;
};

export type SloAlert = {
  alertId: string;
  dedupeKey: string;
  tenantId: string;
  sloId: string;
  action: SloAlertAction;
  status: "OPEN" | "RECOVERED";
  severity: SloSeverity;
  title: string;
  summary: string;
  owner: string;
  escalation: string;
  runbookId: string;
  runbookUrl: string;
  requestIds: readonly string[];
  correlationIds: readonly string[];
  observedAt: string;
};

export type SyntheticProbeDefinition = {
  probeId: string;
  name: string;
  route: string;
  expectedStatus: number;
  owner: string;
  runbookId: string;
};

export const SYNTHETIC_PROBES = [
  { probeId: "probe-health", name: "Core health", route: "/api/health", expectedStatus: 200, owner: "SRE", runbookId: "core-availability" },
  { probeId: "probe-citizen-read", name: "Citizen read path", route: "/api/v1/citizen/news", expectedStatus: 200, owner: "Backend", runbookId: "citizen-api-latency" },
  { probeId: "probe-admin-shell", name: "Admin shell", route: "/admin", expectedStatus: 200, owner: "Frontend", runbookId: "admin-latency" },
] as const satisfies readonly SyntheticProbeDefinition[];

export type SyntheticProbeResult = SyntheticProbeDefinition & {
  tenantId: string;
  observedAt: string;
  status: "PASS" | "FAIL";
  statusCode: number;
  latencyMs: number;
  failureCode?: string;
  correlationId: string;
};

export type SloDashboard = {
  tenantId: string;
  window: SloWindowRange;
  generatedAt: string;
  source: "TRUSTED_SLI_STORE" | "SYNTHETIC_FIXTURE";
  evaluations: readonly SloEvaluation[];
  alerts: readonly SloAlert[];
  probes: readonly SyntheticProbeResult[];
  summary: {
    healthy: number;
    atRisk: number;
    breached: number;
    noData: number;
    activeAlerts: number;
    recoveredAlerts: number;
    failedProbes: number;
  };
};

const quantile = (values: readonly number[], percentile: number): number | undefined => {
  if (!values.length) return undefined;
  const ordered = [...values].sort((left, right) => left - right);
  const rank = Math.max(0, Math.ceil(percentile * ordered.length) - 1);
  return ordered[rank];
};

const validateWindow = (window: SloWindowRange): void => {
  assertIso(window.from, "INVALID_WINDOW");
  assertIso(window.to, "INVALID_WINDOW");
  if (window.from >= window.to) throw new SloContractError("INVALID_WINDOW", "Window must be positive");
};

const validateObservation = (observation: SloObservation): void => {
  assertUuid(observation.tenantId, "INVALID_TENANT_ID");
  assertIso(observation.observedAt, "INVALID_OBSERVATION_TIME");
  if (!Number.isFinite(observation.value) || observation.value < 0) throw new SloContractError("INVALID_OBSERVATION_VALUE", "Observation value must be non-negative");
  if (observation.requestId) assertUuid(observation.requestId, "INVALID_REQUEST_ID");
  if (observation.correlationId) assertUuid(observation.correlationId, "INVALID_CORRELATION_ID");
};

const definitionFor = (sloId: string): SloDefinition => {
  const definition = SLO_DEFINITIONS.find((candidate) => candidate.sloId === sloId);
  if (!definition) throw new SloContractError("UNKNOWN_SLO", `Unknown SLO ${sloId}`);
  return definition;
};

export const evaluateSlo = (input: {
  tenantId: string;
  definition: SloDefinition;
  window: SloWindowRange;
  observations: readonly SloObservation[];
  evaluatedAt: string;
}): SloEvaluation => {
  assertUuid(input.tenantId, "INVALID_TENANT_ID");
  validateWindow(input.window);
  assertIso(input.evaluatedAt, "INVALID_EVALUATED_AT");
  input.observations.forEach(validateObservation);
  if (input.observations.some((observation) => observation.tenantId !== input.tenantId)) {
    throw new SloContractError("CROSS_TENANT_OBSERVATION", "Observation tenant does not match dashboard tenant");
  }
  const windowObservations = input.observations.filter((observation) => observation.sloId === input.definition.sloId && observation.observedAt >= input.window.from && observation.observedAt < input.window.to);
  const goodSampleCount = windowObservations.filter((observation) => input.definition.kind === "RATIO" ? (observation.good ?? observation.value >= 1) : observation.value <= input.definition.targetValue).length;
  const goodRatio = windowObservations.length ? goodSampleCount / windowObservations.length : 0;
  const measuredValue = input.definition.kind === "RATIO"
    ? (windowObservations.length ? goodRatio : undefined)
    : quantile(windowObservations.map((observation) => observation.value), input.definition.percentile ?? 0.95);
  const targetMet = measuredValue !== undefined && (input.definition.kind === "RATIO" ? measuredValue >= input.definition.targetValue : measuredValue <= input.definition.targetValue);
  const allowedFailureRatio = input.definition.kind === "RATIO" ? 1 - input.definition.targetValue : 1 - input.definition.successObjective;
  const observedFailureRatio = windowObservations.length ? 1 - goodRatio : 1;
  const consumedFraction = allowedFailureRatio > 0 ? clamp(observedFailureRatio / allowedFailureRatio) : observedFailureRatio > 0 ? 1 : 0;
  const remainingFraction = clamp(1 - consumedFraction);
  const status: SloStatus = !windowObservations.length ? "NO_DATA" : !targetMet ? "BREACHED" : remainingFraction <= 0.25 ? "AT_RISK" : "HEALTHY";
  return {
    tenantId: input.tenantId,
    definition: input.definition,
    window: input.window,
    sampleCount: windowObservations.length,
    goodSampleCount,
    goodRatio,
    ...(measuredValue !== undefined ? { measuredValue } : {}),
    targetMet,
    status,
    errorBudget: { allowedFailureRatio, observedFailureRatio, consumedFraction, remainingFraction },
    requestIds: [...new Set(windowObservations.flatMap((observation) => observation.requestId ? [observation.requestId] : []))].slice(0, 5),
    correlationIds: [...new Set(windowObservations.flatMap((observation) => observation.correlationId ? [observation.correlationId] : []))].slice(0, 5),
    evaluatedAt: input.evaluatedAt,
  };
};

const alertFor = (evaluation: SloEvaluation, action: SloAlertAction): SloAlert => {
  const active = evaluation.status !== "HEALTHY";
  const dedupeKey = `${evaluation.tenantId}:${evaluation.definition.sloId}:${evaluation.window.from}:${evaluation.window.to}`;
  const status = action === "RECOVERY" ? "RECOVERED" : "OPEN";
  const statusText = evaluation.status === "NO_DATA" ? "ไม่มีข้อมูล SLI ใน window" : evaluation.status === "BREACHED" ? "เกินเป้าหมาย SLO" : "ใช้ error budget ใกล้หมด";
  return {
    alertId: stableId(`${dedupeKey}:${status}`),
    dedupeKey,
    tenantId: evaluation.tenantId,
    sloId: evaluation.definition.sloId,
    action,
    status,
    severity: evaluation.definition.severity,
    title: `${evaluation.definition.name}: ${action === "RECOVERY" ? "recovered" : "action required"}`,
    summary: active ? statusText : "SLO กลับมาอยู่ในเป้าหมายแล้ว",
    owner: evaluation.definition.owner,
    escalation: evaluation.definition.severity === "SEV1" ? "on-call → incident commander" : "service owner → SRE review",
    runbookId: evaluation.definition.runbookId,
    runbookUrl: `/runbooks/${evaluation.definition.runbookId}`,
    requestIds: evaluation.requestIds,
    correlationIds: evaluation.correlationIds,
    observedAt: evaluation.evaluatedAt,
  };
};

export const buildSloAlerts = (evaluations: readonly SloEvaluation[], previousAlerts: readonly SloAlert[] = []): readonly SloAlert[] => {
  const previousActive = new Set(previousAlerts.filter((alert) => alert.status === "OPEN").map((alert) => alert.dedupeKey));
  return evaluations.flatMap((evaluation) => {
    const dedupeKey = `${evaluation.tenantId}:${evaluation.definition.sloId}:${evaluation.window.from}:${evaluation.window.to}`;
    if (evaluation.status === "HEALTHY") return previousActive.has(dedupeKey) ? [alertFor(evaluation, "RECOVERY")] : [];
    const action: SloAlertAction = evaluation.status === "NO_DATA" ? "NO_DATA" : previousActive.has(dedupeKey) ? "UPDATE" : "OPEN";
    return [alertFor(evaluation, action)];
  });
};

export const buildSyntheticProbeResult = (input: {
  probeId: string;
  tenantId: string;
  observedAt: string;
  statusCode: number;
  latencyMs: number;
  correlationId: string;
}): SyntheticProbeResult => {
  assertUuid(input.tenantId, "INVALID_TENANT_ID");
  assertIso(input.observedAt, "INVALID_PROBE_TIME");
  assertUuid(input.correlationId, "INVALID_CORRELATION_ID");
  if (!Number.isFinite(input.latencyMs) || input.latencyMs < 0) throw new SloContractError("INVALID_PROBE_LATENCY", "Probe latency must be non-negative");
  const definition = SYNTHETIC_PROBES.find((candidate) => candidate.probeId === input.probeId);
  if (!definition) throw new SloContractError("UNKNOWN_PROBE", `Unknown probe ${input.probeId}`);
  const passed = input.statusCode === definition.expectedStatus;
  return { ...definition, tenantId: input.tenantId, observedAt: input.observedAt, status: passed ? "PASS" : "FAIL", statusCode: input.statusCode, latencyMs: input.latencyMs, ...(passed ? {} : { failureCode: `HTTP_${input.statusCode}` }), correlationId: input.correlationId };
};

export const buildSloDashboard = (input: {
  tenantId: string;
  window: SloWindowRange;
  observations: readonly SloObservation[];
  probes: readonly SyntheticProbeResult[];
  generatedAt: string;
  previousAlerts?: readonly SloAlert[];
  source?: SloDashboard["source"];
}): SloDashboard => {
  assertUuid(input.tenantId, "INVALID_TENANT_ID");
  validateWindow(input.window);
  assertIso(input.generatedAt, "INVALID_GENERATED_AT");
  input.probes.forEach((probe) => {
    assertUuid(probe.tenantId, "INVALID_TENANT_ID");
    assertIso(probe.observedAt, "INVALID_PROBE_TIME");
    assertUuid(probe.correlationId, "INVALID_CORRELATION_ID");
    if (probe.tenantId !== input.tenantId) throw new SloContractError("CROSS_TENANT_PROBE", "Probe tenant does not match dashboard tenant");
  });
  const evaluations = SLO_DEFINITIONS.map((definition) => evaluateSlo({ tenantId: input.tenantId, definition, window: input.window, observations: input.observations, evaluatedAt: input.generatedAt }));
  const alerts = buildSloAlerts(evaluations, input.previousAlerts);
  const activeAlerts = alerts.filter((alert) => alert.status === "OPEN").length;
  return {
    tenantId: input.tenantId,
    window: input.window,
    generatedAt: input.generatedAt,
    source: input.source ?? "TRUSTED_SLI_STORE",
    evaluations,
    alerts,
    probes: input.probes,
    summary: {
      healthy: evaluations.filter((evaluation) => evaluation.status === "HEALTHY").length,
      atRisk: evaluations.filter((evaluation) => evaluation.status === "AT_RISK").length,
      breached: evaluations.filter((evaluation) => evaluation.status === "BREACHED").length,
      noData: evaluations.filter((evaluation) => evaluation.status === "NO_DATA").length,
      activeAlerts,
      recoveredAlerts: alerts.filter((alert) => alert.status === "RECOVERED").length,
      failedProbes: input.probes.filter((probe) => probe.status === "FAIL").length,
    },
  };
};

export const sloDefinition = (sloId: string): SloDefinition => definitionFor(sloId);
