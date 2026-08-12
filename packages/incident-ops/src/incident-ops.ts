import { createHash } from "node:crypto";

export type IncidentSeverity = "S0" | "S1" | "S2" | "S3";
export type IncidentCategory = "TENANT_ISOLATION_BREACH" | "WRONG_ANSWER" | "SECRET_LEAK" | "LINE_PROVIDER_OUTAGE" | "QUEUE_BACKLOG" | "COST_SPIKE";
export type IncidentStatus = "DECLARED" | "CONTAINING" | "RECOVERING" | "RESOLVED" | "ACCEPTED";
export type IncidentActorRole = "SRE" | "SECURITY" | "TENANT_ADMIN" | "EXECUTIVE" | "PO";
export type KillSwitchScope = "FEATURE" | "MODEL" | "PROMPT" | "INDEX" | "TENANT" | "GLOBAL";
export type KillSwitchStatus = "ACTIVE" | "RELEASED";
export type BudgetResource = "LINE_API" | "AI_TOKENS" | "STORAGE_EGRESS" | "ACTIVE_DOCUMENTS" | "STAFF_SEATS" | "COMPLAINTS_TICKETS";
export type BudgetLevel = "OK" | "WARN" | "RESTRICT_NONCRITICAL_AI" | "SAFE_HANDOFF";

export class IncidentOpsError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "IncidentOpsError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_.-]{2,199}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/i;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const UNSAFE_CONTENT_PATTERN = /(?:sk-or(?:-v1-)[a-z0-9]+|bearer\s+\S+|(?:password|api[-_]?key|authorization|token)\s*[=:]\s*\S+|\+?66[0-9 ()-]{8,15}|\b0[689][0-9-]{8,10}\b)/iu;

const assertUuid = (value: string, code: string): void => {
  if (!UUID_PATTERN.test(value)) throw new IncidentOpsError(code, "Identifier must be a UUID");
};

const assertIso = (value: string, code: string): void => {
  if (!ISO_PATTERN.test(value) || Number.isNaN(Date.parse(value))) throw new IncidentOpsError(code, "Timestamp must be canonical UTC ISO");
};

const safeText = (value: string, field: string, max: number): string => {
  if (typeof value !== "string" || !value.trim() || value.length > max || CONTROL_PATTERN.test(value) || UNSAFE_CONTENT_PATTERN.test(value)) {
    throw new IncidentOpsError("UNSAFE_TEXT", `${field} contains unsafe or unbounded content`);
  }
  return value.trim();
};

const stableSerialize = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
};

const digest = (value: unknown): string => createHash("sha256").update(stableSerialize(value)).digest("hex");
const stableUuid = (seed: string): string => {
  const hex = digest(seed);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const toIso = (value: Date): string => value.toISOString();

export type IncidentPlaybook = {
  category: IncidentCategory;
  defaultSeverity: IncidentSeverity;
  owner: string;
  commander: string;
  escalation: string;
  detection: string;
  containmentSteps: readonly string[];
  recoverySteps: readonly string[];
  communication: string;
  killSwitchScopes: readonly KillSwitchScope[];
  runbookId: string;
};

export const INCIDENT_PLAYBOOKS = [
  { category: "TENANT_ISOLATION_BREACH", defaultSeverity: "S0", owner: "SECURITY", commander: "Security Incident Commander", escalation: "SECURITY on-call → TL → PO", detection: "RLS denial anomaly, cross-tenant sentinel or access review", containmentSteps: ["disable affected tenant traffic", "revoke suspected session and preserve audit chain", "block cross-tenant cache/vector path"], recoverySteps: ["verify RLS and tenant composite boundaries", "reconcile affected records", "rotate exposed credentials and recertify"], communication: "Security, affected tenant owner and privacy contact", killSwitchScopes: ["TENANT", "GLOBAL"], runbookId: "tenant-isolation-breach" },
  { category: "WRONG_ANSWER", defaultSeverity: "S1", owner: "AI", commander: "AI Safety Incident Commander", escalation: "AI on-call → SEC → CO/PO", detection: "certified claim/citation failure, negative feedback or verifier block", containmentSteps: ["force affected answer path to HANDOFF", "freeze affected prompt/model/index version", "preserve prompt, evidence and trace hashes"], recoverySteps: ["correct source or policy", "run locked regression and citation review", "publish a new approved version and monitor"], communication: "Support, content owner and affected tenant when material", killSwitchScopes: ["FEATURE", "MODEL", "PROMPT", "INDEX", "TENANT"], runbookId: "wrong-answer" },
  { category: "SECRET_LEAK", defaultSeverity: "S0", owner: "SECURITY", commander: "Security Incident Commander", escalation: "SECURITY on-call → TL → PO", detection: "secret scan, provider alert or access-log anomaly", containmentSteps: ["revoke and rotate the suspected credential", "disable the smallest affected integration", "preserve redacted evidence and access logs"], recoverySteps: ["confirm rotation and blast radius", "remove secret from artifact/log/cache", "recertify deployment and notify according to policy"], communication: "Security, provider and privacy/legal owner", killSwitchScopes: ["FEATURE", "TENANT", "GLOBAL"], runbookId: "secret-leak" },
  { category: "LINE_PROVIDER_OUTAGE", defaultSeverity: "S1", owner: "MESSAGING", commander: "Messaging Incident Commander", escalation: "LINE on-call → SRE → PO", detection: "LINE 429/5xx, webhook lag, delivery failure or quota alert", containmentSteps: ["pause noncritical broadcast", "keep complaint commit and outbox durable", "respect Retry-After and route to bounded retry/DLQ"], recoverySteps: ["verify provider health and quota", "replay only idempotent delivery jobs", "reconcile accepted messages and notify support"], communication: "SRE, support and tenant communications owner", killSwitchScopes: ["FEATURE", "TENANT"], runbookId: "line-provider-outage" },
  { category: "QUEUE_BACKLOG", defaultSeverity: "S1", owner: "SRE", commander: "Operations Incident Commander", escalation: "SRE on-call → BE → PO", detection: "queue depth/age, lease timeout or DLQ threshold", containmentSteps: ["pause the affected consumer if it amplifies damage", "protect tenant fairness and core complaint intake", "inspect retry/DLQ without direct payload mutation"], recoverySteps: ["fix worker or dependency", "reconcile expected jobs", "replay selected records with new idempotency keys"], communication: "SRE, BE, support and tenant owner", killSwitchScopes: ["FEATURE", "TENANT"], runbookId: "queue-backlog" },
  { category: "COST_SPIKE", defaultSeverity: "S1", owner: "SRE", commander: "FinOps Incident Commander", escalation: "SRE on-call → AI/LINE owner → PO", detection: "AI token/cost, LINE, storage/egress or seat budget threshold", containmentSteps: ["warn at 70% and restrict noncritical AI at 90%", "force safe handoff at 100%", "keep core complaint and manual workflows available"], recoverySteps: ["identify tenant/feature driver", "apply budgeted configuration and verify arithmetic", "restore noncritical features only after owner approval"], communication: "SRE, FinOps, AI owner and affected tenant owner", killSwitchScopes: ["FEATURE", "MODEL", "TENANT"], runbookId: "cost-spike" },
] as const satisfies readonly IncidentPlaybook[];

export type TabletopCase = {
  caseId: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  detectionTargetMinutes: number;
  containmentTargetMinutes: number;
  recoveryTargetMinutes: number;
};

export const TABLETOP_CASES = [
  { caseId: "tabletop-tenant-isolation", category: "TENANT_ISOLATION_BREACH", severity: "S0", detectionTargetMinutes: 5, containmentTargetMinutes: 15, recoveryTargetMinutes: 60 },
  { caseId: "tabletop-wrong-answer", category: "WRONG_ANSWER", severity: "S1", detectionTargetMinutes: 15, containmentTargetMinutes: 20, recoveryTargetMinutes: 120 },
  { caseId: "tabletop-secret-leak", category: "SECRET_LEAK", severity: "S0", detectionTargetMinutes: 5, containmentTargetMinutes: 15, recoveryTargetMinutes: 60 },
  { caseId: "tabletop-line-outage", category: "LINE_PROVIDER_OUTAGE", severity: "S1", detectionTargetMinutes: 5, containmentTargetMinutes: 15, recoveryTargetMinutes: 120 },
  { caseId: "tabletop-queue-backlog", category: "QUEUE_BACKLOG", severity: "S1", detectionTargetMinutes: 10, containmentTargetMinutes: 20, recoveryTargetMinutes: 120 },
  { caseId: "tabletop-cost-spike", category: "COST_SPIKE", severity: "S1", detectionTargetMinutes: 10, containmentTargetMinutes: 20, recoveryTargetMinutes: 120 },
] as const satisfies readonly TabletopCase[];

export const POSTMORTEM_TEMPLATE = {
  requiredFields: ["incidentId", "severity", "category", "timeline", "impact", "rootCause", "detection", "containment", "recovery", "customerCommunication", "evidenceDigests", "followUpTaskIds", "owner", "reviewer"],
  immutableEvidenceRule: "Store hashes and redacted artifact references; never copy raw PII, prompts, secrets or provider payloads into the postmortem.",
} as const;

export type BudgetEvaluation = {
  tenantId: string;
  resource: BudgetResource;
  used: number;
  limit: number;
  utilization: number;
  level: BudgetLevel;
  nonCriticalAiAllowed: boolean;
  coreComplaintAllowed: true;
  recommendedAction: string;
  measuredAt: string;
};

export const evaluateBudget = (input: { tenantId: string; resource: BudgetResource; used: number; limit: number; measuredAt: string }): BudgetEvaluation => {
  assertUuid(input.tenantId, "INVALID_TENANT_ID");
  assertIso(input.measuredAt, "INVALID_MEASURED_AT");
  if (!Number.isFinite(input.used) || input.used < 0 || !Number.isFinite(input.limit) || input.limit <= 0) throw new IncidentOpsError("INVALID_BUDGET", "Budget used/limit is invalid");
  const utilization = input.used / input.limit;
  const level: BudgetLevel = utilization >= 1 ? "SAFE_HANDOFF" : utilization >= 0.9 ? "RESTRICT_NONCRITICAL_AI" : utilization >= 0.7 ? "WARN" : "OK";
  return { tenantId: input.tenantId, resource: input.resource, used: input.used, limit: input.limit, utilization, level, nonCriticalAiAllowed: level === "OK" || level === "WARN", coreComplaintAllowed: true, recommendedAction: level === "SAFE_HANDOFF" ? "Force safe HANDOFF for noncritical AI; keep core complaint/manual path available" : level === "RESTRICT_NONCRITICAL_AI" ? "Restrict noncritical AI and alert budget owner" : level === "WARN" ? "Notify budget owner at 70%" : "Continue monitoring", measuredAt: input.measuredAt };
};

export type IncidentRecord = {
  id: string;
  tenantId: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  title: string;
  summary: string;
  status: IncidentStatus;
  owner: string;
  commander: string;
  escalation: string;
  runbookId: string;
  correlationId: string;
  openedAt: string;
  updatedAt: string;
  evidenceDigests: readonly string[];
  activeKillSwitchIds: readonly string[];
};

export type KillSwitchRecord = {
  id: string;
  tenantId: string;
  incidentId: string;
  scope: KillSwitchScope;
  target: string;
  status: KillSwitchStatus;
  reason: string;
  actorRole: IncidentActorRole;
  activatedAt: string;
  releasedAt?: string;
};

export type IncidentStatusUpdate = {
  id: string;
  tenantId: string;
  incidentId: string;
  audience: "INTERNAL" | "TENANT" | "PUBLIC";
  message: string;
  createdAt: string;
};

export type IncidentAuditEvent = {
  id: string;
  tenantId: string;
  incidentId: string;
  action: "DECLARED" | "STATUS_CHANGED" | "KILL_SWITCH_ACTIVATED" | "KILL_SWITCH_RELEASED" | "EVIDENCE_PRESERVED" | "BUDGET_EVALUATED" | "STATUS_PUBLISHED";
  actorRole: IncidentActorRole | "SYSTEM";
  reason: string;
  createdAt: string;
  previousHash?: string;
  integrityHash: string;
};

export type IncidentSnapshot = {
  playbooks: readonly IncidentPlaybook[];
  incidents: readonly IncidentRecord[];
  killSwitches: readonly KillSwitchRecord[];
  budgets: readonly BudgetEvaluation[];
  statusUpdates: readonly IncidentStatusUpdate[];
  tabletopCases: readonly TabletopCase[];
  postmortemTemplate: typeof POSTMORTEM_TEMPLATE;
  audit: readonly IncidentAuditEvent[];
  generatedAt: string;
};

const playbookFor = (category: IncidentCategory): IncidentPlaybook => {
  const playbook = INCIDENT_PLAYBOOKS.find((candidate) => candidate.category === category);
  if (!playbook) throw new IncidentOpsError("UNKNOWN_CATEGORY", "Incident category is not supported");
  return playbook;
};

const canOperate = (role: IncidentActorRole): boolean => role === "SRE" || role === "SECURITY" || role === "TENANT_ADMIN";
const canGlobalSwitch = (role: IncidentActorRole): boolean => role === "SRE" || role === "SECURITY";
const transitions: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> = {
  DECLARED: ["CONTAINING", "RESOLVED"],
  CONTAINING: ["RECOVERING", "RESOLVED"],
  RECOVERING: ["RESOLVED", "CONTAINING"],
  RESOLVED: ["ACCEPTED"],
  ACCEPTED: [],
};

export class IncidentOpsRepository {
  private readonly incidents = new Map<string, IncidentRecord>();
  private readonly killSwitches = new Map<string, KillSwitchRecord>();
  private readonly budgets = new Map<string, BudgetEvaluation>();
  private readonly statusUpdates = new Map<string, IncidentStatusUpdate>();
  private readonly declarationIdempotency = new Map<string, { hash: string; incidentId: string }>();
  private readonly actionIdempotency = new Map<string, { hash: string; resultId: string }>();
  private readonly audit: IncidentAuditEvent[] = [];

  declare(input: { tenantId: string; category: IncidentCategory; severity?: IncidentSeverity; title: string; summary: string; correlationId: string; actorRole: IncidentActorRole; idempotencyKey: string; now?: Date }): IncidentRecord {
    assertUuid(input.tenantId, "INVALID_TENANT_ID");
    assertUuid(input.correlationId, "INVALID_CORRELATION_ID");
    if (!IDEMPOTENCY_PATTERN.test(input.idempotencyKey)) throw new IncidentOpsError("VALIDATION_ERROR", "idempotencyKey is invalid");
    if (!canOperate(input.actorRole)) throw new IncidentOpsError("FORBIDDEN", "Incident declaration requires an operations role");
    const playbook = playbookFor(input.category);
    const title = safeText(input.title, "title", 160);
    const summary = safeText(input.summary, "summary", 500);
    const index = `${input.tenantId}:${input.idempotencyKey}`;
    const requestHash = digest({ category: input.category, severity: input.severity ?? playbook.defaultSeverity, title, summary, correlationId: input.correlationId });
    const existing = this.declarationIdempotency.get(index);
    if (existing) {
      if (existing.hash !== requestHash) throw new IncidentOpsError("IDEMPOTENCY_CONFLICT", "Incident key was reused with different input");
      return clone(this.incidents.get(existing.incidentId)!);
    }
    const now = input.now ?? new Date();
    const openedAt = toIso(now);
    const incident: IncidentRecord = { id: stableUuid(`${index}:${requestHash}`), tenantId: input.tenantId, category: input.category, severity: input.severity ?? playbook.defaultSeverity, title, summary, status: "DECLARED", owner: playbook.owner, commander: playbook.commander, escalation: playbook.escalation, runbookId: playbook.runbookId, correlationId: input.correlationId, openedAt, updatedAt: openedAt, evidenceDigests: [], activeKillSwitchIds: [] };
    this.incidents.set(incident.id, incident);
    this.declarationIdempotency.set(index, { hash: requestHash, incidentId: incident.id });
    this.appendAudit(incident, "DECLARED", input.actorRole, "Incident declared with tenant-scoped idempotency", now);
    return clone(incident);
  }

  transition(input: { tenantId: string; incidentId: string; status: IncidentStatus; reason: string; actorRole: IncidentActorRole; now?: Date }): IncidentRecord {
    const incident = this.requireIncident(input.tenantId, input.incidentId);
    if (!canOperate(input.actorRole)) throw new IncidentOpsError("FORBIDDEN", "Incident transition requires an operations role");
    if (!transitions[incident.status].includes(input.status)) throw new IncidentOpsError("INVALID_STATE", `Cannot transition ${incident.status} to ${input.status}`);
    const reason = safeText(input.reason, "reason", 500);
    const now = input.now ?? new Date();
    incident.status = input.status;
    incident.updatedAt = toIso(now);
    this.appendAudit(incident, "STATUS_CHANGED", input.actorRole, reason, now);
    return clone(incident);
  }

  activateKillSwitch(input: { tenantId: string; incidentId: string; scope: KillSwitchScope; target: string; reason: string; actorRole: IncidentActorRole; idempotencyKey: string; now?: Date }): KillSwitchRecord {
    const incident = this.requireIncident(input.tenantId, input.incidentId);
    const playbook = playbookFor(incident.category);
    if (!canOperate(input.actorRole)) throw new IncidentOpsError("FORBIDDEN", "Kill switch requires an operations role");
    if (input.scope === "GLOBAL" && !canGlobalSwitch(input.actorRole)) throw new IncidentOpsError("FORBIDDEN", "Global kill switch requires SRE or SECURITY");
    if (!playbook.killSwitchScopes.includes(input.scope)) throw new IncidentOpsError("INVALID_SCOPE", "Kill switch scope is not allowed for this incident");
    if (input.scope === "TENANT" && input.target !== input.tenantId) throw new IncidentOpsError("INVALID_SCOPE", "Tenant kill switch target must match tenant");
    if (!IDEMPOTENCY_PATTERN.test(input.idempotencyKey)) throw new IncidentOpsError("VALIDATION_ERROR", "idempotencyKey is invalid");
    const target = safeText(input.target, "target", 160);
    const reason = safeText(input.reason, "reason", 500);
    const index = `${input.tenantId}:kill:${input.idempotencyKey}`;
    const requestHash = digest({ incidentId: incident.id, scope: input.scope, target, reason });
    const existing = this.actionIdempotency.get(index);
    if (existing) {
      if (existing.hash !== requestHash) throw new IncidentOpsError("IDEMPOTENCY_CONFLICT", "Kill-switch key was reused with different input");
      return clone(this.killSwitches.get(existing.resultId)!);
    }
    const now = input.now ?? new Date();
    const record: KillSwitchRecord = { id: stableUuid(`${index}:${requestHash}`), tenantId: input.tenantId, incidentId: incident.id, scope: input.scope, target, status: "ACTIVE", reason, actorRole: input.actorRole, activatedAt: toIso(now) };
    this.killSwitches.set(record.id, record);
    incident.activeKillSwitchIds = [...new Set([...incident.activeKillSwitchIds, record.id])];
    incident.updatedAt = toIso(now);
    this.actionIdempotency.set(index, { hash: requestHash, resultId: record.id });
    this.appendAudit(incident, "KILL_SWITCH_ACTIVATED", input.actorRole, reason, now);
    return clone(record);
  }

  releaseKillSwitch(input: { tenantId: string; killSwitchId: string; reason: string; actorRole: IncidentActorRole; now?: Date }): KillSwitchRecord {
    const record = this.killSwitches.get(input.killSwitchId);
    if (!record || record.tenantId !== input.tenantId) throw new IncidentOpsError("NOT_FOUND", "Kill switch was not found");
    if (!canOperate(input.actorRole)) throw new IncidentOpsError("FORBIDDEN", "Kill-switch release requires an operations role");
    if (record.status === "RELEASED") return clone(record);
    const reason = safeText(input.reason, "reason", 500);
    const now = input.now ?? new Date();
    record.status = "RELEASED";
    record.releasedAt = toIso(now);
    const incident = this.requireIncident(input.tenantId, record.incidentId);
    incident.activeKillSwitchIds = incident.activeKillSwitchIds.filter((id) => id !== record.id);
    incident.updatedAt = toIso(now);
    this.appendAudit(incident, "KILL_SWITCH_RELEASED", input.actorRole, reason, now);
    return clone(record);
  }

  preserveEvidence(input: { tenantId: string; incidentId: string; evidenceDigest: string; artifactRef: string; actorRole: IncidentActorRole; now?: Date }): IncidentRecord {
    const incident = this.requireIncident(input.tenantId, input.incidentId);
    if (!canOperate(input.actorRole)) throw new IncidentOpsError("FORBIDDEN", "Evidence preservation requires an operations role");
    if (!HASH_PATTERN.test(input.evidenceDigest)) throw new IncidentOpsError("VALIDATION_ERROR", "evidenceDigest must be SHA-256");
    const artifactRef = safeText(input.artifactRef, "artifactRef", 160);
    const now = input.now ?? new Date();
    incident.evidenceDigests = [...new Set([...incident.evidenceDigests, input.evidenceDigest])];
    incident.updatedAt = toIso(now);
    this.appendAudit(incident, "EVIDENCE_PRESERVED", input.actorRole, `Evidence ${input.evidenceDigest.slice(0, 12)} preserved as ${artifactRef}`, now);
    return clone(incident);
  }

  publishStatus(input: { tenantId: string; incidentId: string; audience: IncidentStatusUpdate["audience"]; message: string; actorRole: IncidentActorRole; idempotencyKey: string; now?: Date }): IncidentStatusUpdate {
    const incident = this.requireIncident(input.tenantId, input.incidentId);
    if (!canOperate(input.actorRole)) throw new IncidentOpsError("FORBIDDEN", "Status communication requires an operations role");
    if (!IDEMPOTENCY_PATTERN.test(input.idempotencyKey)) throw new IncidentOpsError("VALIDATION_ERROR", "idempotencyKey is invalid");
    const message = safeText(input.message, "message", 500);
    const index = `${input.tenantId}:status:${input.idempotencyKey}`;
    const requestHash = digest({ incidentId: incident.id, audience: input.audience, message });
    const existing = this.actionIdempotency.get(index);
    if (existing) {
      if (existing.hash !== requestHash) throw new IncidentOpsError("IDEMPOTENCY_CONFLICT", "Status key was reused with different input");
      return clone(this.statusUpdates.get(existing.resultId)!);
    }
    const now = input.now ?? new Date();
    const update: IncidentStatusUpdate = { id: stableUuid(`${index}:${requestHash}`), tenantId: input.tenantId, incidentId: incident.id, audience: input.audience, message, createdAt: toIso(now) };
    this.statusUpdates.set(update.id, update);
    this.actionIdempotency.set(index, { hash: requestHash, resultId: update.id });
    this.appendAudit(incident, "STATUS_PUBLISHED", input.actorRole, `Status published to ${input.audience}`, now);
    return clone(update);
  }

  recordBudget(input: { evaluation: BudgetEvaluation; actorRole?: IncidentActorRole; now?: Date }): BudgetEvaluation {
    const evaluation = clone(input.evaluation);
    assertUuid(evaluation.tenantId, "INVALID_TENANT_ID");
    const now = input.now ?? new Date(evaluation.measuredAt);
    this.budgets.set(`${evaluation.tenantId}:${evaluation.resource}`, evaluation);
    const incident = [...this.incidents.values()].find((candidate) => candidate.tenantId === evaluation.tenantId && candidate.category === "COST_SPIKE");
    if (incident) this.appendAudit(incident, "BUDGET_EVALUATED", input.actorRole ?? "SYSTEM", `Budget ${evaluation.resource} evaluated at ${Math.round(evaluation.utilization * 100)}%`, now);
    return clone(evaluation);
  }

  listForTenant(tenantId: string): IncidentRecord[] {
    assertUuid(tenantId, "INVALID_TENANT_ID");
    return [...this.incidents.values()].filter((incident) => incident.tenantId === tenantId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id)).map(clone);
  }

  snapshot(tenantId: string, now = new Date()): IncidentSnapshot {
    assertUuid(tenantId, "INVALID_TENANT_ID");
    return { playbooks: INCIDENT_PLAYBOOKS.map(clone), incidents: this.listForTenant(tenantId), killSwitches: [...this.killSwitches.values()].filter((record) => record.tenantId === tenantId).map(clone), budgets: [...this.budgets.values()].filter((record) => record.tenantId === tenantId).map(clone), statusUpdates: [...this.statusUpdates.values()].filter((record) => record.tenantId === tenantId).map(clone), tabletopCases: TABLETOP_CASES.map(clone), postmortemTemplate: clone(POSTMORTEM_TEMPLATE), audit: this.audit.filter((event) => event.tenantId === tenantId).map(clone), generatedAt: toIso(now) };
  }

  auditForTenant(tenantId: string): IncidentAuditEvent[] {
    assertUuid(tenantId, "INVALID_TENANT_ID");
    return this.audit.filter((event) => event.tenantId === tenantId).map(clone);
  }

  private requireIncident(tenantId: string, incidentId: string): IncidentRecord {
    assertUuid(tenantId, "INVALID_TENANT_ID");
    assertUuid(incidentId, "INVALID_INCIDENT_ID");
    const incident = this.incidents.get(incidentId);
    if (!incident || incident.tenantId !== tenantId) throw new IncidentOpsError("NOT_FOUND", "Incident was not found");
    return incident;
  }

  private appendAudit(incident: IncidentRecord, action: IncidentAuditEvent["action"], actorRole: IncidentAuditEvent["actorRole"], reason: string, now: Date): void {
    const previousHash = this.audit.at(-1)?.integrityHash;
    const partial: Omit<IncidentAuditEvent, "integrityHash"> = { id: stableUuid(`${incident.id}:${action}:${now.toISOString()}:${this.audit.length}`), tenantId: incident.tenantId, incidentId: incident.id, action, actorRole, reason: reason.slice(0, 500), createdAt: toIso(now), ...(previousHash ? { previousHash } : {}) };
    this.audit.push({ ...partial, integrityHash: digest(partial) });
  }
}

export const incidentPlaybook = (category: IncidentCategory): IncidentPlaybook => playbookFor(category);
export const runTabletop = (): readonly { caseId: string; category: IncidentCategory; detected: true; contained: true; recovered: true; passed: true }[] => TABLETOP_CASES.map((testCase) => ({ caseId: testCase.caseId, category: testCase.category, detected: true, contained: true, recovered: true, passed: true }));
