import { describe, expect, it } from "vitest";

import {
  INCIDENT_PLAYBOOKS,
  POSTMORTEM_TEMPLATE,
  TABLETOP_CASES,
  IncidentOpsError,
  IncidentOpsRepository,
  evaluateBudget,
  incidentPlaybook,
  runTabletop,
} from "./incident-ops";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const ACCOUNT = "33333333-3333-4333-8333-333333333333";
const CORRELATION = "44444444-4444-4444-8444-444444444444";
const BASE = new Date("2026-08-11T00:00:00.000Z");

describe("incident response, kill switches and cost controls", () => {
  it("pins every required playbook, severity and postmortem field", () => {
    expect(INCIDENT_PLAYBOOKS).toHaveLength(6);
    expect(INCIDENT_PLAYBOOKS.map((playbook) => playbook.category)).toEqual(["TENANT_ISOLATION_BREACH", "WRONG_ANSWER", "SECRET_LEAK", "LINE_PROVIDER_OUTAGE", "QUEUE_BACKLOG", "COST_SPIKE"]);
    expect(incidentPlaybook("TENANT_ISOLATION_BREACH").defaultSeverity).toBe("S0");
    expect(incidentPlaybook("WRONG_ANSWER").defaultSeverity).toBe("S1");
    expect(INCIDENT_PLAYBOOKS.every((playbook) => playbook.owner && playbook.commander && playbook.escalation && playbook.runbookId && playbook.containmentSteps.length >= 2 && playbook.recoverySteps.length >= 2)).toBe(true);
    expect(POSTMORTEM_TEMPLATE.requiredFields).toContain("evidenceDigests");
  });

  it("declares incidents idempotently and rejects changed input or unsafe content", () => {
    const repo = new IncidentOpsRepository();
    const input = { tenantId: TENANT_A, category: "LINE_PROVIDER_OUTAGE" as const, title: "LINE provider outage", summary: "Synthetic provider failure; core complaint path remains available.", correlationId: CORRELATION, actorRole: "SRE" as const, idempotencyKey: "incident:line:001", now: BASE };
    const first = repo.declare(input);
    expect(repo.declare(input).id).toBe(first.id);
    expect(() => repo.declare({ ...input, summary: "different" })).toThrowError(/IDEMPOTENCY_CONFLICT/);
    expect(() => repo.declare({ ...input, idempotencyKey: "incident:unsafe", summary: "Bearer leaked-secret" })).toThrowError(/UNSAFE_TEXT/);
  });

  it("enforces incident lifecycle and role-aware global kill switches", () => {
    const repo = new IncidentOpsRepository();
    const incident = repo.declare({ tenantId: TENANT_A, category: "WRONG_ANSWER", title: "Certified answer blocked", summary: "Verifier failure requires safe handoff.", correlationId: CORRELATION, actorRole: "SRE", idempotencyKey: "incident:answer:001", now: BASE });
    expect(repo.transition({ tenantId: TENANT_A, incidentId: incident.id, status: "CONTAINING", reason: "Force affected route to handoff", actorRole: "SRE", now: BASE }).status).toBe("CONTAINING");
    expect(() => repo.transition({ tenantId: TENANT_A, incidentId: incident.id, status: "ACCEPTED", reason: "too early", actorRole: "SRE", now: BASE })).toThrowError(/INVALID_STATE/);
    expect(() => repo.activateKillSwitch({ tenantId: TENANT_A, incidentId: incident.id, scope: "GLOBAL", target: "global", reason: "global not approved for admin", actorRole: "TENANT_ADMIN", idempotencyKey: "kill:global:001", now: BASE })).toThrowError(/FORBIDDEN/);
    const switchRecord = repo.activateKillSwitch({ tenantId: TENANT_A, incidentId: incident.id, scope: "PROMPT", target: "prompt:v1", reason: "Freeze affected prompt version", actorRole: "TENANT_ADMIN", idempotencyKey: "kill:prompt:001", now: BASE });
    expect(switchRecord.status).toBe("ACTIVE");
    expect(repo.releaseKillSwitch({ tenantId: TENANT_A, killSwitchId: switchRecord.id, reason: "Corrected prompt certified", actorRole: "SRE", now: BASE }).status).toBe("RELEASED");
  });

  it("keeps kill-switch and evidence operations tenant isolated", () => {
    const repo = new IncidentOpsRepository();
    const incident = repo.declare({ tenantId: TENANT_A, category: "TENANT_ISOLATION_BREACH", title: "Tenant boundary alert", summary: "Synthetic RLS sentinel alert.", correlationId: CORRELATION, actorRole: "SECURITY", idempotencyKey: "incident:tenant:001", now: BASE });
    expect(() => repo.transition({ tenantId: TENANT_B, incidentId: incident.id, status: "CONTAINING", reason: "wrong tenant", actorRole: "SECURITY", now: BASE })).toThrowError(/NOT_FOUND/);
    expect(() => repo.preserveEvidence({ tenantId: TENANT_B, incidentId: incident.id, evidenceDigest: "a".repeat(64), artifactRef: "trace-redacted-001", actorRole: "SECURITY", now: BASE })).toThrowError(/NOT_FOUND/);
    expect(repo.snapshot(TENANT_B).incidents).toHaveLength(0);
  });

  it("preserves only evidence digests and records status communication in the audit chain", () => {
    const repo = new IncidentOpsRepository();
    const incident = repo.declare({ tenantId: TENANT_A, category: "SECRET_LEAK", title: "Credential rotation required", summary: "Synthetic secret-scan alert without the secret value.", correlationId: CORRELATION, actorRole: "SECURITY", idempotencyKey: "incident:secret:001", now: BASE });
    const updated = repo.preserveEvidence({ tenantId: TENANT_A, incidentId: incident.id, evidenceDigest: "b".repeat(64), artifactRef: "redacted-log-sha256", actorRole: "SECURITY", now: BASE });
    expect(updated.evidenceDigests).toEqual(["b".repeat(64)]);
    const status = repo.publishStatus({ tenantId: TENANT_A, incidentId: incident.id, audience: "INTERNAL", message: "Credential rotation is in progress; affected feature is disabled.", actorRole: "SECURITY", idempotencyKey: "status:secret:001", now: BASE });
    expect(status.audience).toBe("INTERNAL");
    expect(repo.auditForTenant(TENANT_A).map((event) => event.action)).toEqual(["DECLARED", "EVIDENCE_PRESERVED", "STATUS_PUBLISHED"]);
  });

  it("applies 70/90/100 percent budget actions without stopping core complaint intake", () => {
    expect(evaluateBudget({ tenantId: TENANT_A, resource: "AI_TOKENS", used: 69, limit: 100, measuredAt: "2026-08-11T00:00:00.000Z" }).level).toBe("OK");
    expect(evaluateBudget({ tenantId: TENANT_A, resource: "AI_TOKENS", used: 70, limit: 100, measuredAt: "2026-08-11T00:00:00.000Z" }).level).toBe("WARN");
    const restrict = evaluateBudget({ tenantId: TENANT_A, resource: "AI_TOKENS", used: 90, limit: 100, measuredAt: "2026-08-11T00:00:00.000Z" });
    expect(restrict.level).toBe("RESTRICT_NONCRITICAL_AI");
    expect(restrict.nonCriticalAiAllowed).toBe(false);
    const handoff = evaluateBudget({ tenantId: TENANT_A, resource: "AI_TOKENS", used: 100, limit: 100, measuredAt: "2026-08-11T00:00:00.000Z" });
    expect(handoff.level).toBe("SAFE_HANDOFF");
    expect(handoff.coreComplaintAllowed).toBe(true);
  });

  it("keeps budget projections tenant scoped and idempotent action records stable", () => {
    const repo = new IncidentOpsRepository();
    const incident = repo.declare({ tenantId: TENANT_A, category: "COST_SPIKE", title: "AI budget threshold", summary: "Synthetic budget threshold fixture.", correlationId: CORRELATION, actorRole: "SRE", idempotencyKey: "incident:cost:001", now: BASE });
    const first = repo.activateKillSwitch({ tenantId: TENANT_A, incidentId: incident.id, scope: "FEATURE", target: "noncritical-ai", reason: "Restrict noncritical AI", actorRole: "SRE", idempotencyKey: "kill:cost:001", now: BASE });
    expect(repo.activateKillSwitch({ tenantId: TENANT_A, incidentId: incident.id, scope: "FEATURE", target: "noncritical-ai", reason: "Restrict noncritical AI", actorRole: "SRE", idempotencyKey: "kill:cost:001", now: BASE }).id).toBe(first.id);
    expect(() => repo.activateKillSwitch({ tenantId: TENANT_A, incidentId: incident.id, scope: "FEATURE", target: "different", reason: "changed", actorRole: "SRE", idempotencyKey: "kill:cost:001", now: BASE })).toThrowError(IncidentOpsError);
    repo.recordBudget({ evaluation: evaluateBudget({ tenantId: TENANT_A, resource: "AI_TOKENS", used: 95, limit: 100, measuredAt: "2026-08-11T00:00:00.000Z" }) });
    expect(repo.snapshot(TENANT_A).budgets[0]?.level).toBe("RESTRICT_NONCRITICAL_AI");
    expect(repo.snapshot(TENANT_B).budgets).toHaveLength(0);
  });

  it("covers six tabletop cases with detect/contain/recover outcomes", () => {
    expect(TABLETOP_CASES.length).toBeGreaterThanOrEqual(5);
    const results = runTabletop();
    expect(results).toHaveLength(TABLETOP_CASES.length);
    expect(results.every((result) => result.detected && result.contained && result.recovered && result.passed)).toBe(true);
  });
});
