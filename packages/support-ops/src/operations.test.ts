import { describe, expect, it } from "vitest";

import {
  InMemorySupportOpsStore,
  SupportOperationsService,
  SupportOpsError,
  type SupportOpsPolicy,
} from "./operations";
import {
  InMemorySupportHandoffStore,
  SupportHandoffService,
  type SupportHandoffRequest,
} from "@citychatbot/support-handoff";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const QUEUE_A = "33333333-3333-4333-8333-333333333333";
const DEPARTMENT_A = "55555555-5555-4555-8555-555555555555";
const DEPARTMENT_B = "66666666-6666-4666-8666-666666666666";
const MEMBERSHIP_A = "77777777-7777-4777-8777-777777777777";
const ACCOUNT_A = "88888888-8888-4888-8888-888888888888";
const NOW = new Date("2026-08-11T03:00:00.000Z");
const IDENTITY_SECRET = "local-test-secret-with-at-least-32-bytes";

const policy: SupportOpsPolicy = {
  policyVersion: "support-policy-v1",
  warningRatio: 0.8,
  staleAfterSeconds: 300,
};

const handoffRequest = (overrides: Partial<SupportHandoffRequest> = {}): SupportHandoffRequest => ({
  tenantId: TENANT_A,
  citizenIdentity: "line-user-ops",
  channel: "LINE",
  source: { sourceEventId: "ops-event-001" },
  reasonCode: "NO_EVIDENCE",
  reasonDetail: "No approved evidence is available.",
  citizenMessage: "Please ask staff to check this.",
  topic: "ops test street light",
  defaultIntakeQueueId: QUEUE_A,
  candidateDepartments: [{ tenantId: TENANT_A, departmentId: DEPARTMENT_A }],
  suggestedDepartmentId: DEPARTMENT_A,
  priority: "NORMAL",
  citizenConfirmed: true,
  policy: {
    policyVersion: "support-policy-v1",
    urgentAutomaticIntake: false,
    dedupeWindowSeconds: 900,
    responseTargetSeconds: 3_600,
    resolutionTargetSeconds: 86_400,
    timezone: "Asia/Bangkok",
  },
  idempotencyKey: "ops-request-001",
  occurredAt: NOW,
  ...overrides,
});

const fixture = () => {
  const handoffStore = new InMemorySupportHandoffStore();
  const handoff = new SupportHandoffService({ store: handoffStore, identitySecret: IDENTITY_SECRET, clock: () => NOW });
  const opsStore = new InMemorySupportOpsStore();
  const ops = new SupportOperationsService({ store: opsStore, clock: () => NOW });
  return { handoff, ops, opsStore };
};

const createTicket = (handoff: SupportHandoffService, overrides: Partial<SupportHandoffRequest> = {}) => {
  const result = handoff.createHandoff(handoffRequest(overrides));
  if (!result.ticket) throw new Error("fixture did not create a ticket");
  return result.ticket;
};

const expectErrorCode = (operation: () => unknown, code: SupportOpsError["code"]) => {
  try {
    operation();
    throw new Error("expected SupportOpsError");
  } catch (error) {
    expect(error).toBeInstanceOf(SupportOpsError);
    expect((error as SupportOpsError).code).toBe(code);
  }
};

describe("support operations contract", () => {
  it("creates one visible central alert for every ownerless open ticket and suppresses repeats", () => {
    const { handoff, ops } = fixture();
    const ticket = createTicket(handoff);

    const first = ops.run({ tenantId: TENANT_A, tickets: [ticket], policy, observedAt: NOW });
    const replay = ops.run({ tenantId: TENANT_A, tickets: [ticket], policy, observedAt: NOW });

    expect(first.openedAlertIds).toHaveLength(1);
    expect(first.dashboard.ownerlessTicketCount).toBe(1);
    expect(first.dashboard.openCentralQueueAlertCount).toBe(1);
    expect(replay.openedAlertIds).toHaveLength(0);
    expect(replay.suppressedAlertCount).toBe(1);
    expect(ops.listAlerts(TENANT_A)).toHaveLength(1);
    expect(ops.listAlerts(TENANT_A)[0]?.recipientScope).toBe("CENTRAL_QUEUE");
  });

  it("opens warning exactly at the threshold, then replaces it with a breach", () => {
    const { handoff, ops } = fixture();
    const ticket = createTicket(handoff);
    const warningAt = new Date(Date.parse(ticket.sla.responseDueAt) - ticket.sla.responseTargetSeconds * 0.2 * 1_000);
    const before = ops.run({ tenantId: TENANT_A, tickets: [ticket], policy, observedAt: new Date(warningAt.getTime() - 1) });
    const warning = ops.run({ tenantId: TENANT_A, tickets: [ticket], policy, observedAt: warningAt });
    const breachAt = new Date(ticket.sla.responseDueAt);
    const breach = ops.run({ tenantId: TENANT_A, tickets: [ticket], policy, observedAt: breachAt });

    expect(before.dashboard.responseWarningCount).toBe(0);
    expect(warning.dashboard.responseWarningCount).toBe(1);
    expect(warning.openedAlertIds.length).toBeGreaterThanOrEqual(1);
    expect(breach.dashboard.responseWarningCount).toBe(0);
    expect(breach.dashboard.responseBreachCount).toBe(1);
    expect(breach.resolvedAlertIds.length).toBeGreaterThanOrEqual(1);
    expect(ops.listAlerts(TENANT_A).filter((alert) => alert.status === "OPEN" && alert.kind === "RESPONSE_SLA_BREACHED")).toHaveLength(1);
  });

  it("escalates resolution SLA alerts to the assigned department head", () => {
    const { handoff, ops } = fixture();
    const created = createTicket(handoff);
    const assigned = handoff.assignTicket({
      tenantId: TENANT_A,
      ticketId: created.id,
      expectedVersion: created.rowVersion,
      departmentId: DEPARTMENT_A,
      membershipId: MEMBERSHIP_A,
      authorizedDepartments: [{ tenantId: TENANT_A, departmentId: DEPARTMENT_A }],
      authorizedMemberships: [{ tenantId: TENANT_A, membershipId: MEMBERSHIP_A, departmentId: DEPARTMENT_A }],
      actor: { accountId: ACCOUNT_A, canAssign: true },
      reason: "assign for SLA test",
      idempotencyKey: "ops-assign-001",
      occurredAt: NOW,
    });
    const started = handoff.transitionTicket({
      tenantId: TENANT_A,
      ticketId: created.id,
      expectedVersion: assigned.ticket.rowVersion,
      toStatus: "IN_PROGRESS",
      actor: { type: "STAFF", accountId: ACCOUNT_A, canTransition: true },
      reason: "start SLA test",
      idempotencyKey: "ops-transition-001",
      occurredAt: NOW,
    });
    const warningAt = new Date(Date.parse(started.ticket.sla.resolutionDueAt) - started.ticket.sla.resolutionTargetSeconds * 0.2 * 1_000);
    const result = ops.run({ tenantId: TENANT_A, tickets: [started.ticket], policy, observedAt: warningAt });

    const resolutionAlert = ops.listAlerts(TENANT_A).find((alert) => alert.kind === "RESOLUTION_SLA_WARNING");
    expect(result.dashboard.resolutionWarningCount).toBe(1);
    expect(resolutionAlert?.recipientScope).toBe("DEPARTMENT_HEAD");
    expect(resolutionAlert?.departmentId).toBe(DEPARTMENT_A);
  });

  it("resolves central ownerless alert when assignment changes the owner", () => {
    const { handoff, ops } = fixture();
    const created = createTicket(handoff);
    const first = ops.run({ tenantId: TENANT_A, tickets: [created], policy, observedAt: NOW });
    const assigned = handoff.assignTicket({
      tenantId: TENANT_A,
      ticketId: created.id,
      expectedVersion: created.rowVersion,
      departmentId: DEPARTMENT_B,
      authorizedDepartments: [{ tenantId: TENANT_A, departmentId: DEPARTMENT_B }],
      actor: { accountId: ACCOUNT_A, canAssign: true },
      reason: "reassign to department B",
      idempotencyKey: "ops-assign-002",
      occurredAt: new Date(NOW.getTime() + 1_000),
    });
    const second = ops.run({
      tenantId: TENANT_A,
      tickets: [assigned.ticket],
      policy,
      observedAt: new Date(NOW.getTime() + 1_000),
    });

    expect(first.dashboard.ownerlessTicketCount).toBe(1);
    expect(second.dashboard.ownerlessTicketCount).toBe(0);
    expect(second.resolvedAlertIds).toContain(first.openedAlertIds[0]);
    expect(ops.listAlerts(TENANT_A).find((alert) => alert.kind === "UNASSIGNED")?.status).toBe("RESOLVED");
  });

  it("opens stale alert at the exact age boundary and suppresses outage replay", () => {
    const { handoff, ops } = fixture();
    const ticket = createTicket(handoff);
    const staleAt = new Date(Date.parse(ticket.updatedAt) + policy.staleAfterSeconds * 1_000);
    const first = ops.run({ tenantId: TENANT_A, tickets: [ticket], policy, observedAt: staleAt });
    const replay = ops.run({ tenantId: TENANT_A, tickets: [ticket], policy, observedAt: staleAt });

    expect(first.dashboard.staleTicketCount).toBe(1);
    expect(replay.dashboard.staleTicketCount).toBe(1);
    expect(replay.suppressedAlertCount).toBe(2);
    expect(ops.listAlerts(TENANT_A).filter((alert) => alert.kind === "STALE")).toHaveLength(1);
  });

  it("reconciles orphan conversations once and rejects cross-tenant input", () => {
    const { handoff, ops } = fixture();
    const closed = createTicket(handoff, { topic: "closed conversation" });
    const assigned = handoff.assignTicket({
      tenantId: TENANT_A,
      ticketId: closed.id,
      expectedVersion: closed.rowVersion,
      departmentId: DEPARTMENT_A,
      authorizedDepartments: [{ tenantId: TENANT_A, departmentId: DEPARTMENT_A }],
      actor: { accountId: ACCOUNT_A, canAssign: true },
      reason: "assign closed fixture",
      idempotencyKey: "ops-assign-closed",
      occurredAt: NOW,
    });
    const started = handoff.transitionTicket({
      tenantId: TENANT_A,
      ticketId: closed.id,
      expectedVersion: assigned.ticket.rowVersion,
      toStatus: "IN_PROGRESS",
      actor: { type: "STAFF", accountId: ACCOUNT_A, canTransition: true },
      reason: "start closed fixture",
      idempotencyKey: "ops-transition-closed-1",
      occurredAt: NOW,
    });
    const answered = handoff.transitionTicket({
      tenantId: TENANT_A,
      ticketId: closed.id,
      expectedVersion: started.ticket.rowVersion,
      toStatus: "ANSWERED",
      actor: { type: "STAFF", accountId: ACCOUNT_A, canTransition: true },
      reason: "answer closed fixture",
      idempotencyKey: "ops-transition-closed-2",
      occurredAt: NOW,
    });
    const terminal = handoff.transitionTicket({
      tenantId: TENANT_A,
      ticketId: closed.id,
      expectedVersion: answered.ticket.rowVersion,
      toStatus: "CLOSED",
      actor: { type: "STAFF", accountId: ACCOUNT_A, canTransition: true },
      reason: "close fixture",
      idempotencyKey: "ops-transition-closed-3",
      occurredAt: NOW,
    });
    const conversation = {
      tenantId: TENANT_A,
      conversationId: "conversation-001",
      sourceEventId: "conversation-event-001",
      ticketId: terminal.ticket.id,
      hasPendingMessage: true,
      observedAt: NOW,
    } as const;
    const first = ops.run({ tenantId: TENANT_A, tickets: [terminal.ticket], conversations: [conversation], policy, observedAt: NOW });
    const replay = ops.run({ tenantId: TENANT_A, tickets: [terminal.ticket], conversations: [conversation], policy, observedAt: NOW });

    expect(first.dashboard.openOrphanConversationCount).toBe(1);
    expect(replay.suppressedAlertCount).toBe(1);
    expect(ops.listAlerts(TENANT_A).find((alert) => alert.kind === "ORPHAN_CONVERSATION")?.publicTicketId).toBe(terminal.ticket.publicTicketId);
    expectErrorCode(() => ops.run({
      tenantId: TENANT_A,
      tickets: [],
      conversations: [{ ...conversation, tenantId: TENANT_B }],
      policy,
      observedAt: NOW,
    }), "TENANT_SCOPE_VIOLATION");
  });

  it("keeps dashboard and alert content tenant-scoped and excludes conversation body", () => {
    const { handoff, ops } = fixture();
    const ticket = createTicket(handoff, { citizenMessage: "private citizen text must not enter ops alerts" });
    const result = ops.run({
      tenantId: TENANT_A,
      tickets: [ticket],
      conversations: [{
        tenantId: TENANT_A,
        conversationId: "conversation-private-001",
        sourceEventId: "conversation-private-event",
        hasPendingMessage: true,
        observedAt: NOW,
      }],
      policy,
      observedAt: NOW,
    });
    const serialized = JSON.stringify(ops.listAlerts(TENANT_A));

    expect(result.dashboard.tenantId).toBe(TENANT_A);
    expect(ops.listAlerts(TENANT_B)).toHaveLength(0);
    expect(serialized).not.toContain("private citizen text");
    expect(serialized).not.toContain("line-user-ops");
  });
});
