import { createHash, createHmac, randomUUID } from "node:crypto";

import {
  redactSensitiveText,
  scanPromptInjection,
} from "@citychatbot/security/ai-safety";

export const SUPPORT_TICKET_STATUSES = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_FOR_CITIZEN",
  "ANSWERED",
  "CLOSED",
  "CANCELLED",
] as const;

export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];
export type SupportTicketPriority = "NORMAL" | "URGENT";
export type SupportTicketChannel = "LINE" | "WEB" | "SYSTEM";
export type SupportTicketActorType = "CITIZEN" | "BOT" | "STAFF" | "SYSTEM";
export type SupportMessageVisibility = "PUBLIC" | "INTERNAL";
export type SupportSlaState = "ACTIVE" | "PAUSED" | "COMPLETED";
export type SupportConfirmationState = "CONFIRMED" | "URGENT_AUTOMATIC";

export type SupportHandoffReasonCode =
  | "NO_EVIDENCE"
  | "CONFLICTING_EVIDENCE"
  | "LOW_EVIDENCE"
  | "SENSITIVE"
  | "PERSON_SPECIFIC"
  | "POLICY_REFUSAL"
  | "SECURITY"
  | "STAFF_REQUESTED"
  | "SYSTEM_ERROR";

export const SUPPORT_HANDOFF_REASON_CODES: readonly SupportHandoffReasonCode[] = [
  "NO_EVIDENCE",
  "CONFLICTING_EVIDENCE",
  "LOW_EVIDENCE",
  "SENSITIVE",
  "PERSON_SPECIFIC",
  "POLICY_REFUSAL",
  "SECURITY",
  "STAFF_REQUESTED",
  "SYSTEM_ERROR",
];

export type SupportSourceTrace = {
  sourceEventId: string;
  sessionId?: string;
  messageId?: string;
  retrievalTraceId?: string;
  providerRunId?: string;
};

export type SupportDepartmentCandidate = {
  tenantId: string;
  departmentId: string;
};

export type SupportIntakePolicy = {
  policyVersion: string;
  urgentAutomaticIntake: boolean;
  dedupeWindowSeconds: number;
  responseTargetSeconds: number;
  resolutionTargetSeconds: number;
  timezone: string;
};

export type SupportHandoffRequest = {
  tenantId: string;
  citizenIdentity: string;
  channel: SupportTicketChannel;
  source: SupportSourceTrace;
  reasonCode: SupportHandoffReasonCode;
  reasonDetail?: string;
  citizenMessage?: string;
  topic: string;
  defaultIntakeQueueId: string;
  candidateDepartments?: readonly SupportDepartmentCandidate[];
  suggestedDepartmentId?: string;
  priority: SupportTicketPriority;
  citizenConfirmed: boolean;
  policy: SupportIntakePolicy;
  idempotencyKey: string;
  occurredAt?: Date;
};

export type SupportSlaSnapshot = {
  policyVersion: string;
  timezone: string;
  warningRatio: number;
  responseTargetSeconds: number;
  resolutionTargetSeconds: number;
  responseDueAt: string;
  resolutionDueAt: string;
  state: SupportSlaState;
  pausedAt?: string;
  pausedSeconds: number;
};

export type SupportTicket = {
  id: string;
  tenantId: string;
  publicTicketId: string;
  requestKey: string;
  requestFingerprint: string;
  citizenIdentityHash: string;
  topicKey: string;
  channel: SupportTicketChannel;
  source: SupportSourceTrace;
  reasonCode: SupportHandoffReasonCode;
  reasonDetail: string;
  defaultIntakeQueueId: string;
  suggestedDepartmentId?: string;
  assignedDepartmentId?: string;
  assignedMembershipId?: string;
  priority: SupportTicketPriority;
  confirmationState: SupportConfirmationState;
  status: SupportTicketStatus;
  sla: SupportSlaSnapshot;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type SupportTicketMessage = {
  id: string;
  tenantId: string;
  ticketId: string;
  eventId: string;
  sequence: number;
  authorType: SupportTicketActorType;
  visibility: SupportMessageVisibility;
  body: string;
  isAiDraft: boolean;
  createdAt: string;
};

export type SupportTicketAssignment = {
  id: string;
  tenantId: string;
  ticketId: string;
  departmentId: string;
  membershipId?: string;
  actorAccountId: string;
  reason: string;
  createdAt: string;
};

export type SupportTicketStatusLog = {
  id: string;
  tenantId: string;
  ticketId: string;
  fromStatus: SupportTicketStatus | null;
  toStatus: SupportTicketStatus;
  actorType: SupportTicketActorType;
  actorAccountId?: string;
  reason: string;
  occurredAt: string;
};

export type SupportTicketAudit = {
  id: string;
  tenantId: string;
  ticketId: string;
  action:
    | "SUPPORT_TICKET_CREATED"
    | "SUPPORT_TICKET_DEDUPLICATED"
    | "SUPPORT_TICKET_ASSIGNED"
    | "SUPPORT_TICKET_STATUS_CHANGED"
    | "SUPPORT_TICKET_MESSAGE_ADDED";
  actorType: SupportTicketActorType;
  actorAccountId?: string;
  beforeVersion: number;
  afterVersion: number;
  reason: string;
  occurredAt: string;
};

export type SupportOutboxEvent = {
  id: string;
  tenantId: string;
  eventType: "support.created" | "support.assigned";
  eventVersion: 1;
  aggregateId: string;
  idempotencyKey: string;
  payload: Record<string, string>;
  occurredAt: string;
};

export type SupportHandoffResult = {
  outcome: "CONFIRMATION_REQUIRED" | "TICKET_CREATED" | "DEDUPLICATED";
  idempotentReplay: boolean;
  ticket?: SupportTicket;
  confirmationMessage?: string;
};

export type SupportMutationResult = {
  idempotentReplay: boolean;
  ticket: SupportTicket;
};

export type SupportStaffMessageVisibility = SupportMessageVisibility;

export type SupportMutationRecord = {
  requestFingerprint: string;
  ticketId: string;
};

export interface SupportHandoffStore {
  allocateTicketSequence(tenantId: string, year: number): number;
  get(tenantId: string, ticketId: string): SupportTicket | undefined;
  getByRequestKey(tenantId: string, requestKey: string): SupportTicket | undefined;
  getBySourceEvent(tenantId: string, sourceEventId: string): SupportTicket | undefined;
  findActiveByTopic(tenantId: string, citizenIdentityHash: string, topicKey: string, at: Date, windowSeconds: number): SupportTicket | undefined;
  appendTicket(ticket: SupportTicket): void;
  updateTicket(ticket: SupportTicket): void;
  recordRequest(tenantId: string, requestKey: string, record: SupportMutationRecord): void;
  recordSourceEvent(tenantId: string, sourceEventId: string, ticketId: string): void;
  getMutation(tenantId: string, mutationKey: string): SupportMutationRecord | undefined;
  recordMutation(tenantId: string, mutationKey: string, record: SupportMutationRecord): void;
  appendMessage(message: SupportTicketMessage): boolean;
  hasMessageEvent(tenantId: string, ticketId: string, eventId: string): boolean;
  appendAssignment(assignment: SupportTicketAssignment): void;
  appendStatusLog(log: SupportTicketStatusLog): void;
  appendAudit(audit: SupportTicketAudit): void;
  appendOutbox(event: SupportOutboxEvent): void;
  list(tenantId: string): readonly SupportTicket[];
  listMessages(tenantId: string, ticketId: string): readonly SupportTicketMessage[];
  listAssignments(tenantId: string, ticketId: string): readonly SupportTicketAssignment[];
  listStatusLogs(tenantId: string, ticketId: string): readonly SupportTicketStatusLog[];
  listAudits(tenantId: string, ticketId?: string): readonly SupportTicketAudit[];
  listOutbox(tenantId: string): readonly SupportOutboxEvent[];
}

export class SupportHandoffError extends Error {
  constructor(
    public readonly code:
      | "VALIDATION_ERROR"
      | "CONFLICT"
      | "IDEMPOTENCY_CONFLICT"
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "VERSION_CONFLICT"
      | "INVALID_STATE_TRANSITION",
    message: string,
  ) {
    super(code + ": " + message);
    this.name = "SupportHandoffError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,255}$/;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const SUPPORT_STATUS_SET = new Set<SupportTicketStatus>(SUPPORT_TICKET_STATUSES);
const TERMINAL_STATUSES = new Set<SupportTicketStatus>(["CLOSED", "CANCELLED"]);

export const SUPPORT_TICKET_STATUS_LABELS: Readonly<Record<SupportTicketStatus, string>> = {
  NEW: "รอเจ้าหน้าที่รับเรื่อง",
  ASSIGNED: "มอบหมายแล้ว",
  IN_PROGRESS: "กำลังดำเนินการ",
  WAITING_FOR_CITIZEN: "รอข้อมูลเพิ่มเติม",
  ANSWERED: "ตอบกลับแล้ว",
  CLOSED: "ปิดเรื่อง",
  CANCELLED: "ยกเลิกแล้ว",
};

const assertUuid = (value: string, field: string): void => {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new SupportHandoffError("VALIDATION_ERROR", field + " must be a UUID");
};

const assertIdentifier = (value: string, field: string): void => {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value) || CONTROL_PATTERN.test(value)) {
    throw new SupportHandoffError("VALIDATION_ERROR", field + " is invalid");
  }
};

const assertText = (value: string, field: string, maxLength: number): void => {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || CONTROL_PATTERN.test(value)) {
    throw new SupportHandoffError("VALIDATION_ERROR", field + " is invalid");
  }
};

const assertPositiveInteger = (value: number, field: string): void => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new SupportHandoffError("VALIDATION_ERROR", field + " must be a positive integer");
};

const assertPolicy = (policy: SupportIntakePolicy): void => {
  assertText(policy.policyVersion, "policyVersion", 128);
  if (typeof policy.urgentAutomaticIntake !== "boolean") throw new SupportHandoffError("VALIDATION_ERROR", "urgentAutomaticIntake is invalid");
  if (!Number.isSafeInteger(policy.dedupeWindowSeconds) || policy.dedupeWindowSeconds < 60 || policy.dedupeWindowSeconds > 30 * 24 * 60 * 60) {
    throw new SupportHandoffError("VALIDATION_ERROR", "dedupeWindowSeconds is invalid");
  }
  assertPositiveInteger(policy.responseTargetSeconds, "responseTargetSeconds");
  assertPositiveInteger(policy.resolutionTargetSeconds, "resolutionTargetSeconds");
  if (policy.resolutionTargetSeconds < policy.responseTargetSeconds) throw new SupportHandoffError("VALIDATION_ERROR", "resolution target must not precede response target");
  assertText(policy.timezone, "timezone", 64);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: policy.timezone }).format();
  } catch {
    throw new SupportHandoffError("VALIDATION_ERROR", "timezone is invalid");
  }
};

const assertDate = (value: Date | undefined, field: string): void => {
  if (value !== undefined && (!(value instanceof Date) || !Number.isFinite(value.getTime()))) {
    throw new SupportHandoffError("VALIDATION_ERROR", field + " is invalid");
  }
};

const cloneSource = (source: SupportSourceTrace): SupportSourceTrace => ({ ...source });

const cloneSla = (sla: SupportSlaSnapshot): SupportSlaSnapshot => ({ ...sla });

const cloneTicket = (ticket: SupportTicket): SupportTicket => ({
  ...ticket,
  source: cloneSource(ticket.source),
  sla: cloneSla(ticket.sla),
});

const cloneMessage = (message: SupportTicketMessage): SupportTicketMessage => ({ ...message });
const cloneAssignment = (assignment: SupportTicketAssignment): SupportTicketAssignment => ({ ...assignment });
const cloneStatusLog = (log: SupportTicketStatusLog): SupportTicketStatusLog => ({ ...log });
const cloneAudit = (audit: SupportTicketAudit): SupportTicketAudit => ({ ...audit });
const cloneOutbox = (event: SupportOutboxEvent): SupportOutboxEvent => ({ ...event, payload: { ...event.payload } });

const stableHash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export const hashCitizenIdentity = (secret: string, citizenIdentity: string): string => {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) throw new SupportHandoffError("VALIDATION_ERROR", "identity secret must be at least 32 bytes");
  assertText(citizenIdentity, "citizenIdentity", 255);
  return createHmac("sha256", secret).update(citizenIdentity, "utf8").digest("hex");
};

export const normalizeSupportTopic = (topic: string): string => {
  assertText(topic, "topic", 500);
  const redacted = redactSensitiveText(topic);
  const normalized = redacted.normalize("NFKC").toLocaleLowerCase("th-TH")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || "unknown-topic";
};

const topicKey = (topic: string): string => stableHash(normalizeSupportTopic(topic));

const safeStoredText = (value: string | undefined, fallback: string, maxLength: number): string => {
  if (value === undefined || !value.trim()) return fallback;
  assertText(value, "ticket text", maxLength);
  const redacted = redactSensitiveText(value).trim();
  if (!redacted) return fallback;
  if (scanPromptInjection(redacted).blocked) return "ข้อความถูกซ่อนเพื่อความปลอดภัย";
  return redacted.slice(0, maxLength);
};

const safeReasonDetail = (value: string | undefined): string => safeStoredText(value, "ส่งต่อให้เจ้าหน้าที่ตรวจสอบ", 2_000);

const validateSource = (source: SupportSourceTrace): void => {
  assertIdentifier(source.sourceEventId, "source.sourceEventId");
  for (const [field, value] of [
    ["source.sessionId", source.sessionId],
    ["source.messageId", source.messageId],
    ["source.retrievalTraceId", source.retrievalTraceId],
    ["source.providerRunId", source.providerRunId],
  ] as const) {
    if (value !== undefined) assertIdentifier(value, field);
  }
};

const normalizeCandidates = (
  tenantId: string,
  candidates: readonly SupportDepartmentCandidate[],
  suggestedDepartmentId: string | undefined,
): { candidates: SupportDepartmentCandidate[]; suggestedDepartmentId?: string } => {
  const accepted: SupportDepartmentCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.tenantId !== tenantId) continue;
    assertUuid(candidate.departmentId, "candidate.departmentId");
    if (!seen.has(candidate.departmentId)) {
      seen.add(candidate.departmentId);
      accepted.push({ tenantId, departmentId: candidate.departmentId });
    }
  }
  if (suggestedDepartmentId === undefined) return { candidates: accepted };
  assertUuid(suggestedDepartmentId, "suggestedDepartmentId");
  if (!accepted.some((candidate) => candidate.departmentId === suggestedDepartmentId)) {
    throw new SupportHandoffError("FORBIDDEN", "suggested department is outside the tenant candidate scope");
  }
  return { candidates: accepted, suggestedDepartmentId };
};

export const isAllowedSupportTransition = (
  from: SupportTicketStatus,
  to: SupportTicketStatus,
  canReopen = false,
): boolean => {
  if (!SUPPORT_STATUS_SET.has(from) || !SUPPORT_STATUS_SET.has(to) || from === to) return false;
  if (to === "CANCELLED" && !TERMINAL_STATUSES.has(from)) return true;
  if (from === "NEW" && to === "ASSIGNED") return true;
  if (from === "ASSIGNED" && to === "IN_PROGRESS") return true;
  if (from === "IN_PROGRESS" && (to === "WAITING_FOR_CITIZEN" || to === "ANSWERED")) return true;
  if (from === "WAITING_FOR_CITIZEN" && to === "IN_PROGRESS") return true;
  if (from === "ANSWERED" && to === "CLOSED") return true;
  if (from === "CLOSED" && to === "IN_PROGRESS" && canReopen) return true;
  return false;
};

const isWaiting = (status: SupportTicketStatus): boolean => status === "WAITING_FOR_CITIZEN";

const updateSlaForStatus = (ticket: SupportTicket, nextStatus: SupportTicketStatus, at: Date): SupportSlaSnapshot => {
  const current = ticket.sla;
  if (nextStatus === "WAITING_FOR_CITIZEN" && !isWaiting(ticket.status)) {
    return { ...current, state: "PAUSED", pausedAt: at.toISOString() };
  }
  if (!isWaiting(nextStatus) && isWaiting(ticket.status) && current.pausedAt) {
    const pausedSeconds = Math.max(0, Math.floor((at.getTime() - Date.parse(current.pausedAt)) / 1_000));
    const responseDueAt = new Date(Date.parse(current.responseDueAt) + pausedSeconds * 1_000).toISOString();
    const resolutionDueAt = new Date(Date.parse(current.resolutionDueAt) + pausedSeconds * 1_000).toISOString();
    return {
      ...current,
      responseDueAt,
      resolutionDueAt,
      state: TERMINAL_STATUSES.has(nextStatus) || nextStatus === "ANSWERED" ? "COMPLETED" : "ACTIVE",
      pausedAt: undefined,
      pausedSeconds: current.pausedSeconds + pausedSeconds,
    };
  }
  if (TERMINAL_STATUSES.has(nextStatus) || nextStatus === "ANSWERED") return { ...current, state: "COMPLETED" };
  if (nextStatus !== "WAITING_FOR_CITIZEN") return { ...current, state: "ACTIVE" };
  return { ...current };
};

export class InMemorySupportHandoffStore implements SupportHandoffStore {
  private readonly tickets = new Map<string, SupportTicket>();
  private readonly requestIndex = new Map<string, string>();
  private readonly sourceIndex = new Map<string, string>();
  private readonly sequences = new Map<string, number>();
  private readonly mutations = new Map<string, SupportMutationRecord>();
  private readonly messages: SupportTicketMessage[] = [];
  private readonly assignments: SupportTicketAssignment[] = [];
  private readonly statusLogs: SupportTicketStatusLog[] = [];
  private readonly audits: SupportTicketAudit[] = [];
  private readonly outbox: SupportOutboxEvent[] = [];

  private scopedKey(tenantId: string, value: string): string {
    return tenantId + ":" + value;
  }

  allocateTicketSequence(tenantId: string, year: number): number {
    const key = tenantId + ":" + year;
    const next = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, next);
    return next;
  }

  get(tenantId: string, ticketId: string): SupportTicket | undefined {
    const ticket = this.tickets.get(ticketId);
    return ticket && ticket.tenantId === tenantId ? cloneTicket(ticket) : undefined;
  }

  getByRequestKey(tenantId: string, requestKey: string): SupportTicket | undefined {
    const ticketId = this.requestIndex.get(this.scopedKey(tenantId, requestKey));
    return ticketId ? this.get(tenantId, ticketId) : undefined;
  }

  getBySourceEvent(tenantId: string, sourceEventId: string): SupportTicket | undefined {
    const ticketId = this.sourceIndex.get(this.scopedKey(tenantId, sourceEventId));
    return ticketId ? this.get(tenantId, ticketId) : undefined;
  }

  findActiveByTopic(tenantId: string, citizenIdentityHash: string, ticketTopicKey: string, at: Date, windowSeconds: number): SupportTicket | undefined {
    const threshold = at.getTime() - windowSeconds * 1_000;
    return [...this.tickets.values()]
      .filter((ticket) => ticket.tenantId === tenantId)
      .filter((ticket) => !TERMINAL_STATUSES.has(ticket.status))
      .filter((ticket) => ticket.citizenIdentityHash === citizenIdentityHash && ticket.topicKey === ticketTopicKey)
      .filter((ticket) => Date.parse(ticket.createdAt) >= threshold && Date.parse(ticket.createdAt) <= at.getTime())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
      .map(cloneTicket)[0];
  }

  appendTicket(ticket: SupportTicket): void {
    const requestKey = this.scopedKey(ticket.tenantId, ticket.requestKey);
    const sourceKey = this.scopedKey(ticket.tenantId, ticket.source.sourceEventId);
    if (this.tickets.has(ticket.id) || this.requestIndex.has(requestKey) || this.sourceIndex.has(sourceKey)) {
      throw new SupportHandoffError("CONFLICT", "support ticket already exists");
    }
    this.tickets.set(ticket.id, cloneTicket(ticket));
    this.requestIndex.set(requestKey, ticket.id);
    this.sourceIndex.set(sourceKey, ticket.id);
  }

  updateTicket(ticket: SupportTicket): void {
    const existing = this.tickets.get(ticket.id);
    if (!existing || existing.tenantId !== ticket.tenantId) throw new SupportHandoffError("NOT_FOUND", "support ticket was not found");
    this.tickets.set(ticket.id, cloneTicket(ticket));
  }

  recordRequest(tenantId: string, requestKey: string, record: SupportMutationRecord): void {
    const key = this.scopedKey(tenantId, requestKey);
    const existing = this.requestIndex.get(key);
    if (existing && existing !== record.ticketId) throw new SupportHandoffError("CONFLICT", "request key is already linked");
    this.requestIndex.set(key, record.ticketId);
  }

  recordSourceEvent(tenantId: string, sourceEventId: string, ticketId: string): void {
    const key = this.scopedKey(tenantId, sourceEventId);
    const existing = this.sourceIndex.get(key);
    if (existing && existing !== ticketId) throw new SupportHandoffError("CONFLICT", "source event is already linked");
    this.sourceIndex.set(key, ticketId);
  }

  getMutation(tenantId: string, mutationKey: string): SupportMutationRecord | undefined {
    const record = this.mutations.get(this.scopedKey(tenantId, mutationKey));
    return record ? { ...record } : undefined;
  }

  recordMutation(tenantId: string, mutationKey: string, record: SupportMutationRecord): void {
    const key = this.scopedKey(tenantId, mutationKey);
    const existing = this.mutations.get(key);
    if (existing && existing.ticketId !== record.ticketId) throw new SupportHandoffError("CONFLICT", "mutation key is already linked");
    this.mutations.set(key, { ...record });
  }

  appendMessage(message: SupportTicketMessage): boolean {
    if (this.messages.some((item) => item.tenantId === message.tenantId && item.ticketId === message.ticketId && item.eventId === message.eventId)) return false;
    this.messages.push(cloneMessage(message));
    return true;
  }

  hasMessageEvent(tenantId: string, ticketId: string, eventId: string): boolean {
    return this.messages.some((message) => message.tenantId === tenantId && message.ticketId === ticketId && message.eventId === eventId);
  }

  appendAssignment(assignment: SupportTicketAssignment): void { this.assignments.push(cloneAssignment(assignment)); }
  appendStatusLog(log: SupportTicketStatusLog): void { this.statusLogs.push(cloneStatusLog(log)); }
  appendAudit(audit: SupportTicketAudit): void { this.audits.push(cloneAudit(audit)); }
  appendOutbox(event: SupportOutboxEvent): void { this.outbox.push(cloneOutbox(event)); }

  list(tenantId: string): readonly SupportTicket[] {
    return [...this.tickets.values()].filter((ticket) => ticket.tenantId === tenantId).map(cloneTicket);
  }

  listMessages(tenantId: string, ticketId: string): readonly SupportTicketMessage[] {
    return this.messages.filter((message) => message.tenantId === tenantId && message.ticketId === ticketId).map(cloneMessage);
  }

  listAssignments(tenantId: string, ticketId: string): readonly SupportTicketAssignment[] {
    return this.assignments.filter((assignment) => assignment.tenantId === tenantId && assignment.ticketId === ticketId).map(cloneAssignment);
  }

  listStatusLogs(tenantId: string, ticketId: string): readonly SupportTicketStatusLog[] {
    return this.statusLogs.filter((log) => log.tenantId === tenantId && log.ticketId === ticketId).map(cloneStatusLog);
  }

  listAudits(tenantId: string, ticketId?: string): readonly SupportTicketAudit[] {
    return this.audits.filter((audit) => audit.tenantId === tenantId && (ticketId === undefined || audit.ticketId === ticketId)).map(cloneAudit);
  }

  listOutbox(tenantId: string): readonly SupportOutboxEvent[] {
    return this.outbox.filter((event) => event.tenantId === tenantId).map(cloneOutbox);
  }
}

const validateRequest = (input: SupportHandoffRequest): void => {
  assertUuid(input.tenantId, "tenantId");
  assertText(input.citizenIdentity, "citizenIdentity", 255);
  if (!["LINE", "WEB", "SYSTEM"].includes(input.channel)) throw new SupportHandoffError("VALIDATION_ERROR", "channel is invalid");
  if (!SUPPORT_HANDOFF_REASON_CODES.includes(input.reasonCode)) throw new SupportHandoffError("VALIDATION_ERROR", "reasonCode is invalid");
  validateSource(input.source);
  assertText(input.topic, "topic", 500);
  assertUuid(input.defaultIntakeQueueId, "defaultIntakeQueueId");
  assertText(input.idempotencyKey, "idempotencyKey", 255);
  if (input.idempotencyKey.length < 8) throw new SupportHandoffError("VALIDATION_ERROR", "idempotencyKey is invalid");
  if (!["NORMAL", "URGENT"].includes(input.priority)) throw new SupportHandoffError("VALIDATION_ERROR", "priority is invalid");
  if (typeof input.citizenConfirmed !== "boolean") throw new SupportHandoffError("VALIDATION_ERROR", "citizenConfirmed is invalid");
  assertPolicy(input.policy);
  assertDate(input.occurredAt, "occurredAt");
  if (input.candidateDepartments && input.candidateDepartments.length > 100) throw new SupportHandoffError("VALIDATION_ERROR", "candidateDepartments is too large");
};

const requestFingerprint = (
  input: SupportHandoffRequest,
  citizenIdentityHash: string,
  normalizedTopicKey: string,
  candidates: readonly SupportDepartmentCandidate[],
  suggestedDepartmentId: string | undefined,
): string => stableHash({
  tenantId: input.tenantId,
  citizenIdentityHash,
  channel: input.channel,
  source: input.source,
  reasonCode: input.reasonCode,
  reasonDetail: safeReasonDetail(input.reasonDetail),
  citizenMessage: safeStoredText(input.citizenMessage, "", 4_000),
  topicKey: normalizedTopicKey,
  defaultIntakeQueueId: input.defaultIntakeQueueId,
  candidateDepartments: candidates,
  suggestedDepartmentId: suggestedDepartmentId ?? null,
  priority: input.priority,
  citizenConfirmed: input.citizenConfirmed,
  policyVersion: input.policy.policyVersion,
});

const buildSla = (policy: SupportIntakePolicy, at: Date): SupportSlaSnapshot => ({
  policyVersion: policy.policyVersion,
  timezone: policy.timezone,
  warningRatio: 0.8,
  responseTargetSeconds: policy.responseTargetSeconds,
  resolutionTargetSeconds: policy.resolutionTargetSeconds,
  responseDueAt: new Date(at.getTime() + policy.responseTargetSeconds * 1_000).toISOString(),
  resolutionDueAt: new Date(at.getTime() + policy.resolutionTargetSeconds * 1_000).toISOString(),
  state: "ACTIVE",
  pausedSeconds: 0,
});

const publicTicketId = (prefix: string, year: number, sequence: number): string =>
  prefix + "-" + String(year) + "-" + String(sequence).padStart(6, "0");

const defaultHandoffMessage = "รับเรื่องส่งต่อให้เจ้าหน้าที่แล้ว";
const confirmationMessage = "หากต้องการให้เจ้าหน้าที่ช่วยตรวจสอบต่อ กรุณากดยืนยันการส่งต่อ";

export class SupportHandoffService {
  private readonly store: SupportHandoffStore;
  private readonly identitySecret: string;
  private readonly clock: () => Date;
  private readonly ticketPrefix: string;

  constructor(options: {
    store?: SupportHandoffStore;
    identitySecret: string;
    clock?: () => Date;
    ticketPrefix?: string;
  }) {
    this.store = options.store ?? new InMemorySupportHandoffStore();
    this.identitySecret = options.identitySecret;
    this.clock = options.clock ?? (() => new Date());
    this.ticketPrefix = options.ticketPrefix ?? "SUP";
    if (!/^[A-Z][A-Z0-9_-]{1,11}$/.test(this.ticketPrefix)) throw new SupportHandoffError("VALIDATION_ERROR", "ticketPrefix is invalid");
    if (Buffer.byteLength(this.identitySecret, "utf8") < 32) throw new SupportHandoffError("VALIDATION_ERROR", "identity secret must be at least 32 bytes");
  }

  createHandoff(input: SupportHandoffRequest): SupportHandoffResult {
    validateRequest(input);
    const occurredAt = input.occurredAt ?? this.clock();
    const identityHash = hashCitizenIdentity(this.identitySecret, input.citizenIdentity);
    const normalizedTopicKey = topicKey(input.topic);
    const candidateResult = normalizeCandidates(input.tenantId, input.candidateDepartments ?? [], input.suggestedDepartmentId);
    const fingerprint = requestFingerprint(input, identityHash, normalizedTopicKey, candidateResult.candidates, candidateResult.suggestedDepartmentId);
    const existingByRequest = this.store.getByRequestKey(input.tenantId, input.idempotencyKey);
    if (existingByRequest) {
      if (existingByRequest.requestFingerprint !== fingerprint) throw new SupportHandoffError("IDEMPOTENCY_CONFLICT", "handoff idempotency key was reused with different data");
      return { outcome: "TICKET_CREATED", idempotentReplay: true, ticket: existingByRequest };
    }
    const existingBySource = this.store.getBySourceEvent(input.tenantId, input.source.sourceEventId);
    if (existingBySource) {
      if (existingBySource.requestFingerprint !== fingerprint) throw new SupportHandoffError("CONFLICT", "source event was reused with different data");
      this.store.recordRequest(input.tenantId, input.idempotencyKey, { requestFingerprint: fingerprint, ticketId: existingBySource.id });
      return { outcome: "TICKET_CREATED", idempotentReplay: true, ticket: existingBySource };
    }

    const urgentAutomatic = input.priority === "URGENT" && input.policy.urgentAutomaticIntake;
    if (!urgentAutomatic && !input.citizenConfirmed) {
      return { outcome: "CONFIRMATION_REQUIRED", idempotentReplay: false, confirmationMessage };
    }

    const active = this.store.findActiveByTopic(
      input.tenantId,
      identityHash,
      normalizedTopicKey,
      occurredAt,
      input.policy.dedupeWindowSeconds,
    );
    if (active) {
      const messageBody = safeStoredText(input.citizenMessage, defaultHandoffMessage, 4_000);
      if (!this.store.hasMessageEvent(input.tenantId, active.id, input.source.sourceEventId)) {
        const messages = this.store.listMessages(input.tenantId, active.id);
        this.store.appendMessage({
          id: randomUUID(),
          tenantId: input.tenantId,
          ticketId: active.id,
          eventId: input.source.sourceEventId,
          sequence: messages.length + 1,
          authorType: "CITIZEN",
          visibility: "PUBLIC",
          body: messageBody,
          isAiDraft: false,
          createdAt: occurredAt.toISOString(),
        });
        this.store.appendAudit({
          id: randomUUID(),
          tenantId: input.tenantId,
          ticketId: active.id,
          action: "SUPPORT_TICKET_MESSAGE_ADDED",
          actorType: "CITIZEN",
          beforeVersion: active.rowVersion,
          afterVersion: active.rowVersion,
          reason: "duplicate handoff information appended",
          occurredAt: occurredAt.toISOString(),
        });
      }
      this.store.recordSourceEvent(input.tenantId, input.source.sourceEventId, active.id);
      this.store.recordRequest(input.tenantId, input.idempotencyKey, { requestFingerprint: fingerprint, ticketId: active.id });
      this.store.appendAudit({
        id: randomUUID(),
        tenantId: input.tenantId,
        ticketId: active.id,
        action: "SUPPORT_TICKET_DEDUPLICATED",
        actorType: "SYSTEM",
        beforeVersion: active.rowVersion,
        afterVersion: active.rowVersion,
        reason: "same citizen/topic active ticket",
        occurredAt: occurredAt.toISOString(),
      });
      return { outcome: "DEDUPLICATED", idempotentReplay: false, ticket: active };
    }

    const year = occurredAt.getUTCFullYear();
    const sequence = this.store.allocateTicketSequence(input.tenantId, year);
    const ticket: SupportTicket = {
      id: randomUUID(),
      tenantId: input.tenantId,
      publicTicketId: publicTicketId(this.ticketPrefix, year, sequence),
      requestKey: input.idempotencyKey,
      requestFingerprint: fingerprint,
      citizenIdentityHash: identityHash,
      topicKey: normalizedTopicKey,
      channel: input.channel,
      source: cloneSource(input.source),
      reasonCode: input.reasonCode,
      reasonDetail: safeReasonDetail(input.reasonDetail),
      defaultIntakeQueueId: input.defaultIntakeQueueId,
      ...(candidateResult.suggestedDepartmentId ? { suggestedDepartmentId: candidateResult.suggestedDepartmentId } : {}),
      priority: input.priority,
      confirmationState: urgentAutomatic ? "URGENT_AUTOMATIC" : "CONFIRMED",
      status: "NEW",
      sla: buildSla(input.policy, occurredAt),
      createdAt: occurredAt.toISOString(),
      updatedAt: occurredAt.toISOString(),
      rowVersion: 1,
    };
    this.store.appendTicket(ticket);
    this.store.appendMessage({
      id: randomUUID(),
      tenantId: input.tenantId,
      ticketId: ticket.id,
      eventId: input.source.sourceEventId,
      sequence: 1,
      authorType: input.citizenMessage ? "CITIZEN" : "SYSTEM",
      visibility: "PUBLIC",
      body: safeStoredText(input.citizenMessage, defaultHandoffMessage, 4_000),
      isAiDraft: false,
      createdAt: ticket.createdAt,
    });
    this.store.appendStatusLog({
      id: randomUUID(),
      tenantId: input.tenantId,
      ticketId: ticket.id,
      fromStatus: null,
      toStatus: "NEW",
      actorType: "SYSTEM",
      reason: "support handoff created",
      occurredAt: ticket.createdAt,
    });
    this.store.appendAudit({
      id: randomUUID(),
      tenantId: input.tenantId,
      ticketId: ticket.id,
      action: "SUPPORT_TICKET_CREATED",
      actorType: "SYSTEM",
      beforeVersion: 0,
      afterVersion: 1,
      reason: input.reasonCode,
      occurredAt: ticket.createdAt,
    });
    this.store.appendOutbox({
      id: randomUUID(),
      tenantId: input.tenantId,
      eventType: "support.created",
      eventVersion: 1,
      aggregateId: ticket.id,
      idempotencyKey: "support.created:" + ticket.id,
      payload: {
        publicTicketId: ticket.publicTicketId,
        reasonCode: ticket.reasonCode,
        channel: ticket.channel,
        recipientScope: "CITIZEN_AND_SUPPORT_QUEUE",
      },
      occurredAt: ticket.createdAt,
    });
    this.store.recordRequest(input.tenantId, input.idempotencyKey, { requestFingerprint: fingerprint, ticketId: ticket.id });
    this.store.recordSourceEvent(input.tenantId, input.source.sourceEventId, ticket.id);
    return { outcome: "TICKET_CREATED", idempotentReplay: false, ticket: cloneTicket(ticket) };
  }

  assignTicket(input: {
    tenantId: string;
    ticketId: string;
    expectedVersion: number;
    departmentId: string;
    membershipId?: string;
    authorizedDepartments: readonly SupportDepartmentCandidate[];
    authorizedMemberships?: readonly { tenantId: string; membershipId: string; departmentId: string }[];
    actor: { accountId: string; canAssign: boolean };
    reason: string;
    idempotencyKey: string;
    occurredAt?: Date;
  }): SupportMutationResult {
    assertUuid(input.tenantId, "tenantId");
    assertUuid(input.ticketId, "ticketId");
    assertUuid(input.departmentId, "departmentId");
    assertUuid(input.actor.accountId, "actor.accountId");
    assertText(input.reason, "reason", 2_000);
    assertText(input.idempotencyKey, "idempotencyKey", 255);
    if (!input.actor.canAssign) throw new SupportHandoffError("FORBIDDEN", "ticket assignment permission is required");
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new SupportHandoffError("VALIDATION_ERROR", "expectedVersion is invalid");
    const ticket = this.store.get(input.tenantId, input.ticketId);
    if (!ticket) throw new SupportHandoffError("NOT_FOUND", "support ticket was not found");
    const fingerprint = stableHash({
      tenantId: input.tenantId,
      ticketId: input.ticketId,
      expectedVersion: input.expectedVersion,
      departmentId: input.departmentId,
      membershipId: input.membershipId ?? null,
      actorAccountId: input.actor.accountId,
      reason: redactSensitiveText(input.reason.trim()),
    });
    const mutationKey = "assign:" + input.idempotencyKey;
    const existingMutation = this.store.getMutation(input.tenantId, mutationKey);
    if (existingMutation) {
      if (existingMutation.requestFingerprint !== fingerprint) throw new SupportHandoffError("IDEMPOTENCY_CONFLICT", "assignment idempotency key was reused with different data");
      const replay = this.store.get(input.tenantId, existingMutation.ticketId);
      if (!replay) throw new SupportHandoffError("NOT_FOUND", "assignment replay ticket was not found");
      return { idempotentReplay: true, ticket: replay };
    }
    if (TERMINAL_STATUSES.has(ticket.status)) throw new SupportHandoffError("CONFLICT", "closed or cancelled ticket cannot be assigned");
    if (ticket.rowVersion !== input.expectedVersion) throw new SupportHandoffError("VERSION_CONFLICT", "ticket version is stale");
    if (!input.authorizedDepartments.some((candidate) => candidate.tenantId === input.tenantId && candidate.departmentId === input.departmentId)) {
      throw new SupportHandoffError("FORBIDDEN", "department is outside the authorized tenant scope");
    }
    if (input.membershipId !== undefined) {
      assertUuid(input.membershipId, "membershipId");
      if (!input.authorizedMemberships?.some((candidate) => candidate.tenantId === input.tenantId && candidate.membershipId === input.membershipId && candidate.departmentId === input.departmentId)) {
        throw new SupportHandoffError("FORBIDDEN", "membership is outside the authorized department scope");
      }
    }
    const occurredAt = input.occurredAt ?? this.clock();
    assertDate(occurredAt, "occurredAt");
    const nextStatus = ticket.status === "NEW" ? "ASSIGNED" : ticket.status;
    const updated: SupportTicket = {
      ...ticket,
      ...(input.membershipId ? { assignedMembershipId: input.membershipId } : {}),
      assignedDepartmentId: input.departmentId,
      status: nextStatus,
      updatedAt: occurredAt.toISOString(),
      rowVersion: ticket.rowVersion + 1,
    };
    this.store.updateTicket(updated);
    this.store.appendAssignment({
      id: randomUUID(),
      tenantId: input.tenantId,
      ticketId: ticket.id,
      departmentId: input.departmentId,
      ...(input.membershipId ? { membershipId: input.membershipId } : {}),
      actorAccountId: input.actor.accountId,
      reason: redactSensitiveText(input.reason.trim()).slice(0, 2_000),
      createdAt: updated.updatedAt,
    });
    if (nextStatus !== ticket.status) this.store.appendStatusLog({
      id: randomUUID(),
      tenantId: input.tenantId,
      ticketId: ticket.id,
      fromStatus: ticket.status,
      toStatus: nextStatus,
      actorType: "STAFF",
      actorAccountId: input.actor.accountId,
      reason: "assignment created",
      occurredAt: updated.updatedAt,
    });
    this.store.appendAudit({
      id: randomUUID(),
      tenantId: input.tenantId,
      ticketId: ticket.id,
      action: "SUPPORT_TICKET_ASSIGNED",
      actorType: "STAFF",
      actorAccountId: input.actor.accountId,
      beforeVersion: ticket.rowVersion,
      afterVersion: updated.rowVersion,
      reason: redactSensitiveText(input.reason.trim()).slice(0, 2_000),
      occurredAt: updated.updatedAt,
    });
    this.store.appendOutbox({
      id: randomUUID(),
      tenantId: input.tenantId,
      eventType: "support.assigned",
      eventVersion: 1,
      aggregateId: ticket.id,
      idempotencyKey: "support.assigned:" + ticket.id + ":" + String(updated.rowVersion),
      payload: {
        publicTicketId: ticket.publicTicketId,
        departmentId: input.departmentId,
        recipientScope: "SUPPORT_STAFF",
      },
      occurredAt: updated.updatedAt,
    });
    this.store.recordMutation(input.tenantId, mutationKey, { requestFingerprint: fingerprint, ticketId: ticket.id });
    return { idempotentReplay: false, ticket: cloneTicket(updated) };
  }

  transitionTicket(input: {
    tenantId: string;
    ticketId: string;
    expectedVersion: number;
    toStatus: SupportTicketStatus;
    actor: { type: SupportTicketActorType; accountId?: string; canTransition: boolean; canReopen?: boolean };
    reason: string;
    idempotencyKey: string;
    occurredAt?: Date;
  }): SupportMutationResult {
    assertUuid(input.tenantId, "tenantId");
    assertUuid(input.ticketId, "ticketId");
    if (input.actor.accountId !== undefined) assertUuid(input.actor.accountId, "actor.accountId");
    if (!SUPPORT_STATUS_SET.has(input.toStatus)) throw new SupportHandoffError("VALIDATION_ERROR", "toStatus is invalid");
    assertText(input.reason, "reason", 2_000);
    assertText(input.idempotencyKey, "idempotencyKey", 255);
    if (!input.actor.canTransition) throw new SupportHandoffError("FORBIDDEN", "ticket transition permission is required");
    const ticket = this.store.get(input.tenantId, input.ticketId);
    if (!ticket) throw new SupportHandoffError("NOT_FOUND", "support ticket was not found");
    const fingerprint = stableHash({
      tenantId: input.tenantId,
      ticketId: input.ticketId,
      expectedVersion: input.expectedVersion,
      toStatus: input.toStatus,
      actor: input.actor,
      reason: redactSensitiveText(input.reason.trim()),
    });
    const mutationKey = "transition:" + input.idempotencyKey;
    const existingMutation = this.store.getMutation(input.tenantId, mutationKey);
    if (existingMutation) {
      if (existingMutation.requestFingerprint !== fingerprint) throw new SupportHandoffError("IDEMPOTENCY_CONFLICT", "transition idempotency key was reused with different data");
      const replay = this.store.get(input.tenantId, existingMutation.ticketId);
      if (!replay) throw new SupportHandoffError("NOT_FOUND", "transition replay ticket was not found");
      return { idempotentReplay: true, ticket: replay };
    }
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new SupportHandoffError("VALIDATION_ERROR", "expectedVersion is invalid");
    if (ticket.rowVersion !== input.expectedVersion) throw new SupportHandoffError("VERSION_CONFLICT", "ticket version is stale");
    if (!isAllowedSupportTransition(ticket.status, input.toStatus, input.actor.canReopen === true)) {
      throw new SupportHandoffError("INVALID_STATE_TRANSITION", "support ticket transition is not allowed");
    }
    const occurredAt = input.occurredAt ?? this.clock();
    assertDate(occurredAt, "occurredAt");
    const updated: SupportTicket = {
      ...ticket,
      status: input.toStatus,
      sla: updateSlaForStatus(ticket, input.toStatus, occurredAt),
      updatedAt: occurredAt.toISOString(),
      rowVersion: ticket.rowVersion + 1,
    };
    this.store.updateTicket(updated);
    this.store.appendStatusLog({
      id: randomUUID(),
      tenantId: input.tenantId,
      ticketId: ticket.id,
      fromStatus: ticket.status,
      toStatus: input.toStatus,
      actorType: input.actor.type,
      ...(input.actor.accountId ? { actorAccountId: input.actor.accountId } : {}),
      reason: redactSensitiveText(input.reason.trim()).slice(0, 2_000),
      occurredAt: updated.updatedAt,
    });
    this.store.appendAudit({
      id: randomUUID(),
      tenantId: input.tenantId,
      ticketId: ticket.id,
      action: "SUPPORT_TICKET_STATUS_CHANGED",
      actorType: input.actor.type,
      ...(input.actor.accountId ? { actorAccountId: input.actor.accountId } : {}),
      beforeVersion: ticket.rowVersion,
      afterVersion: updated.rowVersion,
      reason: redactSensitiveText(input.reason.trim()).slice(0, 2_000),
      occurredAt: updated.updatedAt,
    });
    this.store.recordMutation(input.tenantId, mutationKey, { requestFingerprint: fingerprint, ticketId: ticket.id });
    return { idempotentReplay: false, ticket: cloneTicket(updated) };
  }

  addStaffMessage(input: {
    tenantId: string;
    ticketId: string;
    expectedVersion: number;
    actor: { accountId: string; canReply: boolean };
    body: string;
    visibility: SupportStaffMessageVisibility;
    isAiDraft?: boolean;
    idempotencyKey: string;
    occurredAt?: Date;
  }): SupportMutationResult {
    assertUuid(input.tenantId, "tenantId");
    assertUuid(input.ticketId, "ticketId");
    assertUuid(input.actor.accountId, "actor.accountId");
    assertText(input.body, "body", 4_000);
    if (input.visibility !== "PUBLIC" && input.visibility !== "INTERNAL") {
      throw new SupportHandoffError("VALIDATION_ERROR", "visibility is invalid");
    }
    if (typeof input.isAiDraft !== "boolean" && input.isAiDraft !== undefined) {
      throw new SupportHandoffError("VALIDATION_ERROR", "isAiDraft is invalid");
    }
    if (input.visibility === "PUBLIC" && input.isAiDraft === true) {
      throw new SupportHandoffError("VALIDATION_ERROR", "AI draft must remain internal");
    }
    assertText(input.idempotencyKey, "idempotencyKey", 255);
    if (!input.actor.canReply) throw new SupportHandoffError("FORBIDDEN", "ticket reply permission is required");
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) {
      throw new SupportHandoffError("VALIDATION_ERROR", "expectedVersion is invalid");
    }
    const ticket = this.store.get(input.tenantId, input.ticketId);
    if (!ticket) throw new SupportHandoffError("NOT_FOUND", "support ticket was not found");
    if (TERMINAL_STATUSES.has(ticket.status)) {
      throw new SupportHandoffError("CONFLICT", "closed or cancelled ticket cannot receive a reply");
    }
    const body = safeStoredText(input.body, "ข้อความถูกซ่อนเพื่อความปลอดภัย", 4_000);
    const fingerprint = stableHash({
      tenantId: input.tenantId,
      ticketId: input.ticketId,
      expectedVersion: input.expectedVersion,
      actorAccountId: input.actor.accountId,
      body,
      visibility: input.visibility,
      isAiDraft: input.isAiDraft === true,
    });
    const mutationKey = "message:" + input.idempotencyKey;
    const existingMutation = this.store.getMutation(input.tenantId, mutationKey);
    if (existingMutation) {
      if (existingMutation.requestFingerprint !== fingerprint) {
        throw new SupportHandoffError("IDEMPOTENCY_CONFLICT", "message idempotency key was reused with different data");
      }
      const replay = this.store.get(input.tenantId, existingMutation.ticketId);
      if (!replay) throw new SupportHandoffError("NOT_FOUND", "message replay ticket was not found");
      return { idempotentReplay: true, ticket: replay };
    }
    if (ticket.rowVersion !== input.expectedVersion) throw new SupportHandoffError("VERSION_CONFLICT", "ticket version is stale");
    const occurredAt = input.occurredAt ?? this.clock();
    assertDate(occurredAt, "occurredAt");
    const updated: SupportTicket = {
      ...ticket,
      updatedAt: occurredAt.toISOString(),
      rowVersion: ticket.rowVersion + 1,
    };
    this.store.updateTicket(updated);
    const messages = this.store.listMessages(input.tenantId, input.ticketId);
    this.store.appendMessage({
      id: randomUUID(),
      tenantId: input.tenantId,
      ticketId: input.ticketId,
      eventId: "staff-message:" + input.idempotencyKey,
      sequence: messages.length + 1,
      authorType: "STAFF",
      visibility: input.visibility,
      body,
      isAiDraft: input.isAiDraft === true,
      createdAt: updated.updatedAt,
    });
    this.store.appendAudit({
      id: randomUUID(),
      tenantId: input.tenantId,
      ticketId: input.ticketId,
      action: "SUPPORT_TICKET_MESSAGE_ADDED",
      actorType: "STAFF",
      actorAccountId: input.actor.accountId,
      beforeVersion: ticket.rowVersion,
      afterVersion: updated.rowVersion,
      reason: input.visibility === "PUBLIC" ? "staff public reply" : "staff internal note",
      occurredAt: updated.updatedAt,
    });
    this.store.recordMutation(input.tenantId, mutationKey, { requestFingerprint: fingerprint, ticketId: input.ticketId });
    return { idempotentReplay: false, ticket: cloneTicket(updated) };
  }
}
