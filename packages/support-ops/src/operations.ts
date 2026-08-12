import { randomUUID } from "node:crypto";

import { createCorrelationContext } from "@citychatbot/telemetry";
import {
  type SupportTicket,
  type SupportTicketStatus,
} from "@citychatbot/support-handoff";

export const SUPPORT_OPS_ALERT_KINDS = [
  "UNASSIGNED",
  "STALE",
  "RESPONSE_SLA_WARNING",
  "RESPONSE_SLA_BREACHED",
  "RESOLUTION_SLA_WARNING",
  "RESOLUTION_SLA_BREACHED",
  "ORPHAN_CONVERSATION",
] as const;

export type SupportOpsAlertKind = (typeof SUPPORT_OPS_ALERT_KINDS)[number];
export type SupportOpsAlertStatus = "OPEN" | "RESOLVED";
export type SupportOpsAlertSeverity = "INFO" | "WARNING" | "CRITICAL";
export type SupportOpsRecipientScope = "CENTRAL_QUEUE" | "DEPARTMENT_HEAD";

export type SupportOpsPolicy = {
  policyVersion: string;
  warningRatio: number;
  staleAfterSeconds: number;
};

export type SupportConversationReference = {
  tenantId: string;
  conversationId: string;
  sourceEventId: string;
  ticketId?: string;
  hasPendingMessage: boolean;
  observedAt?: Date;
};

export type SupportOpsAlert = {
  id: string;
  tenantId: string;
  alertKey: string;
  kind: SupportOpsAlertKind;
  status: SupportOpsAlertStatus;
  severity: SupportOpsAlertSeverity;
  recipientScope: SupportOpsRecipientScope;
  ticketId?: string;
  publicTicketId?: string;
  conversationId?: string;
  departmentId?: string;
  policyVersion: string;
  boundaryAt?: string;
  openedAt: string;
  lastSeenAt: string;
  resolvedAt?: string;
  rowVersion: number;
};

export type SupportOpsDashboard = {
  tenantId: string;
  generatedAt: string;
  openTicketCount: number;
  ownerlessTicketCount: number;
  staleTicketCount: number;
  responseWarningCount: number;
  responseBreachCount: number;
  resolutionWarningCount: number;
  resolutionBreachCount: number;
  openCentralQueueAlertCount: number;
  openDepartmentHeadAlertCount: number;
  openOrphanConversationCount: number;
};

export type SupportOpsRunResult = {
  correlationId: string;
  openedAlertIds: readonly string[];
  updatedAlertIds: readonly string[];
  resolvedAlertIds: readonly string[];
  suppressedAlertCount: number;
  dashboard: SupportOpsDashboard;
};

export type SupportOpsStore = {
  openOrUpdate(input: Omit<SupportOpsAlert, "id" | "status" | "openedAt" | "lastSeenAt" | "rowVersion"> & { observedAt: Date }): {
    alert: SupportOpsAlert;
    created: boolean;
    updated: boolean;
  };
  resolveByKey(tenantId: string, alertKey: string, at: Date): SupportOpsAlert | undefined;
  resolveByTicketKindExcept(tenantId: string, ticketId: string, kind: SupportOpsAlertKind, keepAlertKey: string | undefined, at: Date): readonly SupportOpsAlert[];
  listAlerts(tenantId: string): readonly SupportOpsAlert[];
};

export class SupportOpsError extends Error {
  constructor(
    public readonly code: "VALIDATION_ERROR" | "TENANT_SCOPE_VIOLATION",
    message: string,
  ) {
    super(code + ": " + message);
    this.name = "SupportOpsError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TERMINAL_STATUSES = new Set<SupportTicketStatus>(["CLOSED", "CANCELLED"]);
const RESPONSE_COMPLETED_STATUSES = new Set<SupportTicketStatus>([
  "IN_PROGRESS",
  "WAITING_FOR_CITIZEN",
  "ANSWERED",
  "CLOSED",
  "CANCELLED",
]);

const assertUuid = (value: string | undefined, field: string): void => {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new SupportOpsError("VALIDATION_ERROR", field + " must be a UUID");
};

const assertText = (value: string | undefined, field: string, maxLength = 255): void => {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new SupportOpsError("VALIDATION_ERROR", field + " is invalid");
  }
};

const assertDate = (value: Date, field: string): void => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new SupportOpsError("VALIDATION_ERROR", field + " is invalid");
};

const assertPolicy = (policy: SupportOpsPolicy): void => {
  assertText(policy.policyVersion, "policy.policyVersion", 128);
  if (!Number.isFinite(policy.warningRatio) || policy.warningRatio <= 0 || policy.warningRatio >= 1) {
    throw new SupportOpsError("VALIDATION_ERROR", "policy.warningRatio must be between 0 and 1");
  }
  if (!Number.isSafeInteger(policy.staleAfterSeconds) || policy.staleAfterSeconds < 60 || policy.staleAfterSeconds > 30 * 24 * 60 * 60) {
    throw new SupportOpsError("VALIDATION_ERROR", "policy.staleAfterSeconds is invalid");
  }
};

const cloneAlert = (alert: SupportOpsAlert): SupportOpsAlert => ({ ...alert });

export class InMemorySupportOpsStore implements SupportOpsStore {
  private readonly alerts = new Map<string, SupportOpsAlert>();
  private readonly alertKeys = new Map<string, string>();

  private scopedKey(tenantId: string, alertKey: string): string {
    return tenantId + ":" + alertKey;
  }

  openOrUpdate(input: Omit<SupportOpsAlert, "id" | "status" | "openedAt" | "lastSeenAt" | "rowVersion"> & { observedAt: Date }): {
    alert: SupportOpsAlert;
    created: boolean;
    updated: boolean;
  } {
    const { observedAt, ...alertInput } = input;
    const indexKey = this.scopedKey(input.tenantId, input.alertKey);
    const existingId = this.alertKeys.get(indexKey);
    if (existingId) {
      const existing = this.alerts.get(existingId);
      if (!existing) throw new SupportOpsError("VALIDATION_ERROR", "alert index is inconsistent");
      const changed = existing.status !== "OPEN"
        || existing.recipientScope !== alertInput.recipientScope
        || existing.departmentId !== alertInput.departmentId
        || existing.policyVersion !== alertInput.policyVersion
        || existing.boundaryAt !== alertInput.boundaryAt;
      const updated: SupportOpsAlert = {
        ...existing,
        ...alertInput,
        status: "OPEN",
        lastSeenAt: observedAt.toISOString(),
        ...(existing.status === "RESOLVED" ? { openedAt: observedAt.toISOString(), resolvedAt: undefined } : {}),
        rowVersion: changed ? existing.rowVersion + 1 : existing.rowVersion,
      };
      this.alerts.set(existing.id, updated);
      return { alert: cloneAlert(updated), created: false, updated: changed };
    }
    const created: SupportOpsAlert = {
      ...alertInput,
      id: randomUUID(),
      status: "OPEN",
      openedAt: observedAt.toISOString(),
      lastSeenAt: observedAt.toISOString(),
      rowVersion: 1,
    };
    this.alerts.set(created.id, created);
    this.alertKeys.set(indexKey, created.id);
    return { alert: cloneAlert(created), created: true, updated: false };
  }

  resolveByKey(tenantId: string, alertKey: string, at: Date): SupportOpsAlert | undefined {
    const id = this.alertKeys.get(this.scopedKey(tenantId, alertKey));
    if (!id) return undefined;
    const existing = this.alerts.get(id);
    if (!existing || existing.status === "RESOLVED") return existing ? cloneAlert(existing) : undefined;
    const resolved: SupportOpsAlert = {
      ...existing,
      status: "RESOLVED",
      resolvedAt: at.toISOString(),
      lastSeenAt: at.toISOString(),
      rowVersion: existing.rowVersion + 1,
    };
    this.alerts.set(id, resolved);
    return cloneAlert(resolved);
  }

  resolveByTicketKindExcept(tenantId: string, ticketId: string, kind: SupportOpsAlertKind, keepAlertKey: string | undefined, at: Date): readonly SupportOpsAlert[] {
    const resolved: SupportOpsAlert[] = [];
    for (const alert of this.alerts.values()) {
      if (alert.tenantId !== tenantId || alert.ticketId !== ticketId || alert.kind !== kind || alert.status !== "OPEN") continue;
      if (keepAlertKey !== undefined && alert.alertKey === keepAlertKey) continue;
      const next = this.resolveByKey(tenantId, alert.alertKey, at);
      if (next) resolved.push(next);
    }
    return resolved;
  }

  listAlerts(tenantId: string): readonly SupportOpsAlert[] {
    return [...this.alerts.values()]
      .filter((alert) => alert.tenantId === tenantId)
      .map(cloneAlert);
  }
}

const alertSeverity = (ticket: SupportTicket, kind: SupportOpsAlertKind): SupportOpsAlertSeverity => {
  if (kind.endsWith("BREACHED") || (kind === "UNASSIGNED" && ticket.priority === "URGENT")) return "CRITICAL";
  if (kind === "ORPHAN_CONVERSATION" || kind === "UNASSIGNED" || kind === "STALE") return "WARNING";
  return "WARNING";
};

const recipientScope = (ticket: SupportTicket): SupportOpsRecipientScope => ticket.assignedDepartmentId ? "DEPARTMENT_HEAD" : "CENTRAL_QUEUE";

const responseAlert = (ticket: SupportTicket, policy: SupportOpsPolicy, at: Date): { kind: "RESPONSE_SLA_WARNING" | "RESPONSE_SLA_BREACHED"; boundaryAt: string } | undefined => {
  if (TERMINAL_STATUSES.has(ticket.status) || RESPONSE_COMPLETED_STATUSES.has(ticket.status) || ticket.sla.state !== "ACTIVE") return undefined;
  const dueMs = Date.parse(ticket.sla.responseDueAt);
  if (!Number.isFinite(dueMs)) throw new SupportOpsError("VALIDATION_ERROR", "ticket response due timestamp is invalid");
  const warningMs = dueMs - Math.round(ticket.sla.responseTargetSeconds * (1 - policy.warningRatio) * 1_000);
  if (at.getTime() >= dueMs) return { kind: "RESPONSE_SLA_BREACHED", boundaryAt: new Date(dueMs).toISOString() };
  if (at.getTime() >= warningMs) return { kind: "RESPONSE_SLA_WARNING", boundaryAt: new Date(warningMs).toISOString() };
  return undefined;
};

const resolutionAlert = (ticket: SupportTicket, policy: SupportOpsPolicy, at: Date): { kind: "RESOLUTION_SLA_WARNING" | "RESOLUTION_SLA_BREACHED"; boundaryAt: string } | undefined => {
  if (TERMINAL_STATUSES.has(ticket.status) || ticket.sla.state !== "ACTIVE") return undefined;
  const dueMs = Date.parse(ticket.sla.resolutionDueAt);
  if (!Number.isFinite(dueMs)) throw new SupportOpsError("VALIDATION_ERROR", "ticket resolution due timestamp is invalid");
  const warningMs = dueMs - Math.round(ticket.sla.resolutionTargetSeconds * (1 - policy.warningRatio) * 1_000);
  if (at.getTime() >= dueMs) return { kind: "RESOLUTION_SLA_BREACHED", boundaryAt: new Date(dueMs).toISOString() };
  if (at.getTime() >= warningMs) return { kind: "RESOLUTION_SLA_WARNING", boundaryAt: new Date(warningMs).toISOString() };
  return undefined;
};

const validateTicketScope = (tenantId: string, ticket: SupportTicket): void => {
  assertUuid(ticket.id, "ticket.id");
  if (ticket.tenantId !== tenantId) throw new SupportOpsError("TENANT_SCOPE_VIOLATION", "ticket is outside the requested tenant");
  if (ticket.assignedDepartmentId !== undefined) assertUuid(ticket.assignedDepartmentId, "ticket.assignedDepartmentId");
  assertText(ticket.publicTicketId, "ticket.publicTicketId", 64);
  assertDate(new Date(ticket.createdAt), "ticket.createdAt");
  assertDate(new Date(ticket.updatedAt), "ticket.updatedAt");
};

export class SupportOperationsService {
  private readonly store: SupportOpsStore;
  private readonly clock: () => Date;

  constructor(options: { store?: SupportOpsStore; clock?: () => Date }) {
    this.store = options.store ?? new InMemorySupportOpsStore();
    this.clock = options.clock ?? (() => new Date());
  }

  run(input: {
    tenantId: string;
    tickets: readonly SupportTicket[];
    conversations?: readonly SupportConversationReference[];
    policy: SupportOpsPolicy;
    correlationId?: string;
    observedAt?: Date;
  }): SupportOpsRunResult {
    assertUuid(input.tenantId, "tenantId");
    assertPolicy(input.policy);
    if (input.correlationId !== undefined) assertUuid(input.correlationId, "correlationId");
    const at = input.observedAt ?? this.clock();
    assertDate(at, "observedAt");
    const correlationId = createCorrelationContext(input.correlationId ? { correlationId: input.correlationId } : {}).correlationId;
    const openedAlertIds: string[] = [];
    const updatedAlertIds: string[] = [];
    const resolvedAlertIds: string[] = [];
    let suppressedAlertCount = 0;
    const seenTicketIds = new Set<string>();
    const tickets = input.tickets.map((ticket) => {
      validateTicketScope(input.tenantId, ticket);
      if (seenTicketIds.has(ticket.id)) throw new SupportOpsError("VALIDATION_ERROR", "tickets must not contain duplicate IDs");
      seenTicketIds.add(ticket.id);
      return ticket;
    });

    for (const ticket of tickets) {
      const open = !TERMINAL_STATUSES.has(ticket.status);
      if (open && ticket.assignedDepartmentId === undefined) {
        const outcome = this.openTicketAlert(ticket, "UNASSIGNED", input.policy, at);
        if (outcome.created) openedAlertIds.push(outcome.alert.id);
        else if (outcome.updated) updatedAlertIds.push(outcome.alert.id);
        else suppressedAlertCount += 1;
        resolvedAlertIds.push(...outcome.resolved.map((alert) => alert.id));
      }
      if (!open || ticket.assignedDepartmentId !== undefined) {
        const resolved = this.store.resolveByKey(input.tenantId, `${ticket.id}:UNASSIGNED`, at);
        if (resolved?.status === "RESOLVED") resolvedAlertIds.push(resolved.id);
      }

      const stale = open && at.getTime() - Date.parse(ticket.updatedAt) >= input.policy.staleAfterSeconds * 1_000;
      if (stale) {
        const alertKey = `${ticket.id}:STALE:${ticket.updatedAt}`;
        const outcome = this.openTicketAlert(ticket, "STALE", input.policy, at, alertKey);
        if (outcome.created) openedAlertIds.push(outcome.alert.id);
        else if (outcome.updated) updatedAlertIds.push(outcome.alert.id);
        else suppressedAlertCount += 1;
        resolvedAlertIds.push(...outcome.resolved.map((alert) => alert.id));
      }
      const response = responseAlert(ticket, input.policy, at);
      this.recordSlaAlert(ticket, response, input.policy, at, openedAlertIds, updatedAlertIds, resolvedAlertIds, (count) => { suppressedAlertCount += count; });
      const resolution = resolutionAlert(ticket, input.policy, at);
      this.recordSlaAlert(ticket, resolution, input.policy, at, openedAlertIds, updatedAlertIds, resolvedAlertIds, (count) => { suppressedAlertCount += count; });

      for (const kind of ["STALE", "RESPONSE_SLA_WARNING", "RESPONSE_SLA_BREACHED", "RESOLUTION_SLA_WARNING", "RESOLUTION_SLA_BREACHED"] as const) {
        if (kind === "STALE" && stale) continue;
        if (kind.startsWith("RESPONSE") && response?.kind === kind) continue;
        if (kind.startsWith("RESOLUTION") && resolution?.kind === kind) continue;
        const resolved = this.store.resolveByTicketKindExcept(input.tenantId, ticket.id, kind, undefined, at);
        resolvedAlertIds.push(...resolved.map((alert) => alert.id));
      }
    }

    for (const conversation of input.conversations ?? []) {
      if (conversation.tenantId !== input.tenantId) throw new SupportOpsError("TENANT_SCOPE_VIOLATION", "conversation is outside the requested tenant");
      assertText(conversation.conversationId, "conversation.conversationId");
      assertText(conversation.sourceEventId, "conversation.sourceEventId");
      if (conversation.ticketId !== undefined) assertUuid(conversation.ticketId, "conversation.ticketId");
      const observedAt = conversation.observedAt ?? at;
      assertDate(observedAt, "conversation.observedAt");
      const ticket = conversation.ticketId ? tickets.find((item) => item.id === conversation.ticketId) : undefined;
      const orphan = conversation.hasPendingMessage && (!ticket || TERMINAL_STATUSES.has(ticket.status));
      const alertKey = `${conversation.conversationId}:${conversation.sourceEventId}:ORPHAN_CONVERSATION`;
      if (!orphan) {
        const resolved = this.store.resolveByKey(input.tenantId, alertKey, observedAt);
        if (resolved?.status === "RESOLVED") resolvedAlertIds.push(resolved.id);
        continue;
      }
      const outcome = this.store.openOrUpdate({
        tenantId: input.tenantId,
        alertKey,
        kind: "ORPHAN_CONVERSATION",
        severity: "CRITICAL",
        recipientScope: "CENTRAL_QUEUE",
        ...(ticket ? { ticketId: ticket.id, publicTicketId: ticket.publicTicketId } : {}),
        conversationId: conversation.conversationId,
        policyVersion: input.policy.policyVersion,
        observedAt,
      });
      if (outcome.created) openedAlertIds.push(outcome.alert.id);
      else if (outcome.updated) updatedAlertIds.push(outcome.alert.id);
      else suppressedAlertCount += 1;
    }

    return {
      correlationId,
      openedAlertIds,
      updatedAlertIds,
      resolvedAlertIds,
      suppressedAlertCount,
      dashboard: this.dashboard(input.tenantId, at, tickets),
    };
  }

  dashboard(tenantId: string, at = this.clock(), tickets?: readonly SupportTicket[]): SupportOpsDashboard {
    assertUuid(tenantId, "tenantId");
    assertDate(at, "at");
    const alerts = this.store.listAlerts(tenantId);
    const open = alerts.filter((alert) => alert.status === "OPEN");
    const openTicketsForDashboard = (tickets ?? []).filter((ticket) => ticket.tenantId === tenantId && !TERMINAL_STATUSES.has(ticket.status));
    return {
      tenantId,
      generatedAt: at.toISOString(),
      openTicketCount: openTicketsForDashboard.length,
      ownerlessTicketCount: open.filter((alert) => alert.kind === "UNASSIGNED").length,
      staleTicketCount: open.filter((alert) => alert.kind === "STALE").length,
      responseWarningCount: open.filter((alert) => alert.kind === "RESPONSE_SLA_WARNING").length,
      responseBreachCount: open.filter((alert) => alert.kind === "RESPONSE_SLA_BREACHED").length,
      resolutionWarningCount: open.filter((alert) => alert.kind === "RESOLUTION_SLA_WARNING").length,
      resolutionBreachCount: open.filter((alert) => alert.kind === "RESOLUTION_SLA_BREACHED").length,
      openCentralQueueAlertCount: open.filter((alert) => alert.recipientScope === "CENTRAL_QUEUE").length,
      openDepartmentHeadAlertCount: open.filter((alert) => alert.recipientScope === "DEPARTMENT_HEAD").length,
      openOrphanConversationCount: open.filter((alert) => alert.kind === "ORPHAN_CONVERSATION").length,
    };
  }

  listAlerts(tenantId: string): readonly SupportOpsAlert[] {
    assertUuid(tenantId, "tenantId");
    return this.store.listAlerts(tenantId);
  }

  private openTicketAlert(ticket: SupportTicket, kind: SupportOpsAlertKind, policy: SupportOpsPolicy, at: Date, explicitAlertKey?: string, boundaryAt?: string): { alert: SupportOpsAlert; created: boolean; updated: boolean; resolved: readonly SupportOpsAlert[] } {
    const alertKey = explicitAlertKey ?? `${ticket.id}:${kind}`;
    const outcome = this.store.openOrUpdate({
      tenantId: ticket.tenantId,
      alertKey,
      kind,
      severity: alertSeverity(ticket, kind),
      recipientScope: kind === "UNASSIGNED" ? "CENTRAL_QUEUE" : recipientScope(ticket),
      ...(kind !== "UNASSIGNED" && ticket.assignedDepartmentId ? { departmentId: ticket.assignedDepartmentId } : {}),
      ticketId: ticket.id,
      publicTicketId: ticket.publicTicketId,
      policyVersion: policy.policyVersion,
      ...(boundaryAt ? { boundaryAt } : {}),
      observedAt: at,
    });
    const resolved = this.store.resolveByTicketKindExcept(ticket.tenantId, ticket.id, kind, outcome.alert.alertKey, at);
    return { ...outcome, resolved };
  }

  private recordSlaAlert(
    ticket: SupportTicket,
    signal: { kind: "RESPONSE_SLA_WARNING" | "RESPONSE_SLA_BREACHED" | "RESOLUTION_SLA_WARNING" | "RESOLUTION_SLA_BREACHED"; boundaryAt: string } | undefined,
    policy: SupportOpsPolicy,
    at: Date,
    openedAlertIds: string[],
    updatedAlertIds: string[],
    resolvedAlertIds: string[],
    addSuppressed: (count: number) => void,
  ): void {
    const family = signal?.kind.startsWith("RESPONSE") ? "RESPONSE" : "RESOLUTION";
    const warningKind = family === "RESPONSE" ? "RESPONSE_SLA_WARNING" : "RESOLUTION_SLA_WARNING";
    const breachKind = family === "RESPONSE" ? "RESPONSE_SLA_BREACHED" : "RESOLUTION_SLA_BREACHED";
    if (!signal) {
      for (const kind of [warningKind, breachKind] as const) {
        resolvedAlertIds.push(...this.store.resolveByTicketKindExcept(ticket.tenantId, ticket.id, kind, undefined, at).map((alert) => alert.id));
      }
      return;
    }
    const alertKey = `${ticket.id}:${signal.kind}:${signal.boundaryAt}`;
    const outcome = this.openTicketAlert(ticket, signal.kind, policy, at, alertKey, signal.boundaryAt);
    if (outcome.created) openedAlertIds.push(outcome.alert.id);
    else if (outcome.updated) updatedAlertIds.push(outcome.alert.id);
    else addSuppressed(1);
    resolvedAlertIds.push(...outcome.resolved.map((alert) => alert.id));
    const otherKind = signal.kind === breachKind ? warningKind : breachKind;
    resolvedAlertIds.push(...this.store.resolveByTicketKindExcept(ticket.tenantId, ticket.id, otherKind, undefined, at).map((alert) => alert.id));
  }
}
