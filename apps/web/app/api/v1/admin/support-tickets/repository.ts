import {
  InMemorySupportHandoffStore,
  SUPPORT_HANDOFF_REASON_CODES,
  SUPPORT_TICKET_STATUS_LABELS,
  SUPPORT_TICKET_STATUSES,
  SupportHandoffError,
  SupportHandoffService,
  isAllowedSupportTransition,
  type SupportHandoffRequest,
  type SupportMessageVisibility,
  type SupportTicket,
  type SupportTicketStatus,
} from "@citychatbot/support-handoff";
import { createDefaultLineTemplates, LineMessagingDispatcher, type LineProviderClient } from "@citychatbot/line";
import { FaqCandidateService, InMemoryFaqCandidateStore, type FaqCandidate } from "@citychatbot/knowledge";
import { SupportLineDeliveryService, type SupportLineDeliveryView } from "@citychatbot/support-delivery";

import { isLocalSyntheticEnvironment, LOCAL_QUEUE_ID, LOCAL_TENANT_ID } from "../../citizen/complaints/repository";
import {
  LOCAL_ADMIN_ACCOUNT_ID,
  LOCAL_DEPARTMENT_A_ID,
  LOCAL_DEPARTMENT_B_ID,
  LOCAL_DEPARTMENT_HEAD_ACCOUNT_ID,
  LOCAL_OTHER_ACCOUNT_ID,
  LOCAL_STAFF_ACCOUNT_ID,
} from "../complaints/repository";

export type SupportAdminRole = "STAFF" | "DEPARTMENT_HEAD" | "TENANT_ADMIN";

export type LocalSupportAdminContext = {
  tenantId: string;
  accountId: string;
  role: SupportAdminRole;
  departmentIds: readonly string[];
};

export const LOCAL_SUPPORT_QUEUE_ID = LOCAL_QUEUE_ID;
export const LOCAL_SUPPORT_IDENTITY_SECRET = "local-support-handoff-secret-at-least-32-bytes";

export const supportStore = new InMemorySupportHandoffStore();
export const supportService = new SupportHandoffService({
  store: supportStore,
  identitySecret: LOCAL_SUPPORT_IDENTITY_SECRET,
  ticketPrefix: "SUP",
  clock: () => new Date("2026-08-11T03:00:00.000Z"),
});

export const faqService = new FaqCandidateService({
  store: new InMemoryFaqCandidateStore(),
  clock: () => new Date("2026-08-11T03:00:00.000Z"),
  sourceReader: (tenantId, ticketId, messageId) => {
    const ticket = supportStore.get(tenantId, ticketId);
    const message = supportStore.listMessages(tenantId, ticketId).find((item) => item.id === messageId);
    if (!ticket || !message) return undefined;
    return {
      tenantId: ticket.tenantId,
      ticketId: ticket.id,
      messageId: message.id,
      eventId: message.eventId,
      authorType: message.authorType,
      visibility: message.visibility,
      isAiDraft: message.isAiDraft,
      body: message.body,
    };
  },
});

const localLineDispatcher = new LineMessagingDispatcher({
  templates: createDefaultLineTemplates(),
  recipientHashSecret: "local-support-delivery-recipient-secret-32b",
  clock: () => new Date("2026-08-11T03:00:00.000Z"),
});

export const supportLineDelivery = new SupportLineDeliveryService({
  supportStore,
  dispatcher: localLineDispatcher,
  recipientForTicket: ({ ticketId }) => `Ulocal-support-recipient-${ticketId}`,
  deepLinkForTicket: (ticket) => `https://citychatbot.local/liff/support/${encodeURIComponent(ticket.publicTicketId)}`,
  clock: () => new Date("2026-08-11T03:00:00.000Z"),
});

export const localSupportLineProvider: LineProviderClient = {
  reply: async () => ({ status: 202, providerMessageId: "local-line-reply-accepted" }),
  push: async () => ({ status: 202, providerMessageId: "local-line-push-accepted" }),
};

const LOCAL_SUPPORT_NOW = new Date("2026-08-11T03:00:00.000Z");
export const ALL_LOCAL_DEPARTMENTS = [{ tenantId: LOCAL_TENANT_ID, departmentId: LOCAL_DEPARTMENT_A_ID }, { tenantId: LOCAL_TENANT_ID, departmentId: LOCAL_DEPARTMENT_B_ID }] as const;
export const ALL_LOCAL_MEMBERSHIPS = [
  { tenantId: LOCAL_TENANT_ID, membershipId: LOCAL_STAFF_ACCOUNT_ID, departmentId: LOCAL_DEPARTMENT_A_ID },
  { tenantId: LOCAL_TENANT_ID, membershipId: LOCAL_DEPARTMENT_HEAD_ACCOUNT_ID, departmentId: LOCAL_DEPARTMENT_A_ID },
  { tenantId: LOCAL_TENANT_ID, membershipId: LOCAL_OTHER_ACCOUNT_ID, departmentId: LOCAL_DEPARTMENT_B_ID },
] as const;

const supportPolicy = {
  policyVersion: "support-policy-local-v1",
  urgentAutomaticIntake: true,
  dedupeWindowSeconds: 900,
  responseTargetSeconds: 3_600,
  resolutionTargetSeconds: 86_400,
  timezone: "Asia/Bangkok",
} as const;

const departmentNames: Readonly<Record<string, string>> = {
  [LOCAL_DEPARTMENT_A_ID]: "กองช่าง",
  [LOCAL_DEPARTMENT_B_ID]: "กองสาธารณสุข",
};

const reasonLabels: Readonly<Record<(typeof SUPPORT_HANDOFF_REASON_CODES)[number], string>> = {
  NO_EVIDENCE: "ไม่พบหลักฐานที่ยืนยันได้",
  CONFLICTING_EVIDENCE: "หลักฐานขัดแย้งกัน",
  LOW_EVIDENCE: "หลักฐานยังไม่เพียงพอ",
  SENSITIVE: "เรื่องละเอียดอ่อน",
  PERSON_SPECIFIC: "ข้อมูลเฉพาะบุคคล",
  POLICY_REFUSAL: "ต้องตรวจสอบตามนโยบาย",
  SECURITY: "ประเด็นความปลอดภัย",
  STAFF_REQUESTED: "ประชาชนขอคุยกับเจ้าหน้าที่",
  SYSTEM_ERROR: "ระบบไม่สามารถตอบได้อย่างปลอดภัย",
};

const fixtureRequest = (input: {
  sourceEventId: string;
  idempotencyKey: string;
  citizenIdentity: string;
  topic: string;
  reasonCode: SupportHandoffRequest["reasonCode"];
  reasonDetail: string;
  citizenMessage: string;
  priority: SupportHandoffRequest["priority"];
  occurredAt: string;
  departmentId?: string;
}): SupportHandoffRequest => ({
  tenantId: LOCAL_TENANT_ID,
  citizenIdentity: input.citizenIdentity,
  channel: "LINE",
  source: {
    sourceEventId: input.sourceEventId,
    sessionId: "local-session-" + input.sourceEventId,
    messageId: "local-message-" + input.sourceEventId,
    retrievalTraceId: "local-retrieval-" + input.sourceEventId,
    providerRunId: "local-provider-" + input.sourceEventId,
  },
  reasonCode: input.reasonCode,
  reasonDetail: input.reasonDetail,
  citizenMessage: input.citizenMessage,
  topic: input.topic,
  defaultIntakeQueueId: LOCAL_SUPPORT_QUEUE_ID,
  candidateDepartments: ALL_LOCAL_DEPARTMENTS,
  ...(input.departmentId ? { suggestedDepartmentId: input.departmentId } : {}),
  priority: input.priority,
  citizenConfirmed: true,
  policy: supportPolicy,
  idempotencyKey: input.idempotencyKey,
  occurredAt: new Date(input.occurredAt),
});

const assignFixture = (ticket: SupportTicket, departmentId: string, membershipId: string | undefined, key: string): SupportTicket => supportService.assignTicket({
  tenantId: LOCAL_TENANT_ID,
  ticketId: ticket.id,
  expectedVersion: ticket.rowVersion,
  departmentId,
  ...(membershipId ? { membershipId } : {}),
  authorizedDepartments: ALL_LOCAL_DEPARTMENTS,
  authorizedMemberships: ALL_LOCAL_MEMBERSHIPS,
  actor: { accountId: LOCAL_ADMIN_ACCOUNT_ID, canAssign: true },
  reason: "ข้อมูลสังเคราะห์สำหรับทดสอบการมอบหมายงาน",
  idempotencyKey: key,
  occurredAt: new Date("2026-08-11T03:00:00.000Z"),
}).ticket;

const moveFixture = (ticket: SupportTicket, toStatus: SupportTicketStatus, key: string): SupportTicket => supportService.transitionTicket({
  tenantId: LOCAL_TENANT_ID,
  ticketId: ticket.id,
  expectedVersion: ticket.rowVersion,
  toStatus,
  actor: { type: "STAFF", accountId: LOCAL_ADMIN_ACCOUNT_ID, canTransition: true, canReopen: true },
  reason: "ข้อมูลสังเคราะห์สำหรับทดสอบ workflow เจ้าหน้าที่",
  idempotencyKey: key,
  occurredAt: new Date("2026-08-11T03:00:00.000Z"),
}).ticket;

const seedFixture = (input: Parameters<typeof fixtureRequest>[0], target: SupportTicketStatus, departmentId?: string): void => {
  let ticket = supportService.createHandoff(fixtureRequest({ ...input, ...(departmentId ? { departmentId } : {}) })).ticket;
  if (!ticket || target === "NEW") return;
  ticket = assignFixture(ticket, departmentId ?? LOCAL_DEPARTMENT_A_ID, departmentId === LOCAL_DEPARTMENT_B_ID ? LOCAL_OTHER_ACCOUNT_ID : LOCAL_STAFF_ACCOUNT_ID, "local-assign-" + input.idempotencyKey);
  if (target === "ASSIGNED") return;
  ticket = moveFixture(ticket, "IN_PROGRESS", "local-progress-" + input.idempotencyKey);
  if (target === "IN_PROGRESS") return;
  if (target === "WAITING_FOR_CITIZEN") {
    moveFixture(ticket, target, "local-waiting-" + input.idempotencyKey);
    return;
  }
  ticket = supportService.addStaffMessage({
    tenantId: LOCAL_TENANT_ID,
    ticketId: ticket.id,
    expectedVersion: ticket.rowVersion,
    actor: { accountId: LOCAL_ADMIN_ACCOUNT_ID, canReply: true },
    body: "เจ้าหน้าที่รับเรื่องและกำลังประสานงานกับหน่วยงานที่เกี่ยวข้อง",
    visibility: "PUBLIC",
    idempotencyKey: "local-reply-" + input.idempotencyKey,
    occurredAt: new Date("2026-08-11T03:00:00.000Z"),
  }).ticket;
  ticket = moveFixture(ticket, "ANSWERED", "local-answered-" + input.idempotencyKey);
  if (target === "ANSWERED") return;
  moveFixture(ticket, "CLOSED", "local-closed-" + input.idempotencyKey);
};

let fixturesSeeded = false;

export const ensureLocalSupportFixtures = (): void => {
  if (fixturesSeeded) return;
  fixturesSeeded = true;
  seedFixture({
    sourceEventId: "local-support-event-001",
    idempotencyKey: "local-support-request-001",
    citizenIdentity: "local-citizen-001",
    topic: "ไฟฟ้าส่องสว่างดับหน้าตลาด",
    reasonCode: "NO_EVIDENCE",
    reasonDetail: "ข้อมูลในคลังความรู้ไม่พอสำหรับยืนยันการแก้ไขรายจุด",
    citizenMessage: "ขอให้เจ้าหน้าที่ช่วยตรวจสอบไฟฟ้าหน้าตลาดด้วยค่ะ",
    priority: "URGENT",
    occurredAt: "2026-08-11T01:00:00.000Z",
  }, "NEW");
  seedFixture({
    sourceEventId: "local-support-event-002",
    idempotencyKey: "local-support-request-002",
    citizenIdentity: "local-citizen-002",
    topic: "ถนนชำรุดในซอยเทศบาล 5",
    reasonCode: "STAFF_REQUESTED",
    reasonDetail: "ประชาชนขอให้เจ้าหน้าที่ตรวจสอบพื้นที่จริง",
    citizenMessage: "รบกวนเจ้าหน้าที่ช่วยตรวจสอบถนนที่ชำรุดด้วยค่ะ",
    priority: "URGENT",
    occurredAt: "2026-08-11T02:20:00.000Z",
    departmentId: LOCAL_DEPARTMENT_A_ID,
  }, "ASSIGNED", LOCAL_DEPARTMENT_A_ID);
  seedFixture({
    sourceEventId: "local-support-event-003",
    idempotencyKey: "local-support-request-003",
    citizenIdentity: "local-citizen-003",
    topic: "ท่อระบายน้ำอุดตันและน้ำท่วมขัง",
    reasonCode: "LOW_EVIDENCE",
    reasonDetail: "ต้องให้หน่วยงานตรวจสอบสภาพหน้างานก่อนยืนยันแนวทาง",
    citizenMessage: "มีน้ำท่วมขังหน้าบ้าน ขอคำแนะนำจากเจ้าหน้าที่ค่ะ",
    priority: "NORMAL",
    occurredAt: "2026-08-11T02:00:00.000Z",
    departmentId: LOCAL_DEPARTMENT_A_ID,
  }, "IN_PROGRESS", LOCAL_DEPARTMENT_A_ID);
  seedFixture({
    sourceEventId: "local-support-event-004",
    idempotencyKey: "local-support-request-004",
    citizenIdentity: "local-citizen-004",
    topic: "ขอเอกสารยืนยันสิทธิ์เฉพาะบุคคล",
    reasonCode: "PERSON_SPECIFIC",
    reasonDetail: "ต้องตรวจสอบข้อมูลเฉพาะบุคคลโดยเจ้าหน้าที่ที่มีสิทธิ์",
    citizenMessage: "ขอให้ช่วยตรวจสอบเอกสารของฉันค่ะ",
    priority: "NORMAL",
    occurredAt: "2026-08-11T00:00:00.000Z",
    departmentId: LOCAL_DEPARTMENT_A_ID,
  }, "WAITING_FOR_CITIZEN", LOCAL_DEPARTMENT_A_ID);
  seedFixture({
    sourceEventId: "local-support-event-005",
    idempotencyKey: "local-support-request-005",
    citizenIdentity: "local-citizen-005",
    topic: "ขยะตกค้างบริเวณชุมชน",
    reasonCode: "SYSTEM_ERROR",
    reasonDetail: "ระบบไม่สามารถตอบคำถามนี้ได้อย่างปลอดภัย จึงส่งต่อให้เจ้าหน้าที่",
    citizenMessage: "ช่วยแจ้งความคืบหน้าการเก็บขยะด้วยค่ะ",
    priority: "NORMAL",
    occurredAt: "2026-08-10T22:00:00.000Z",
    departmentId: LOCAL_DEPARTMENT_B_ID,
  }, "ANSWERED", LOCAL_DEPARTMENT_B_ID);
  seedFixture({
    sourceEventId: "local-support-event-006",
    idempotencyKey: "local-support-request-006",
    citizenIdentity: "local-citizen-006",
    topic: "ข้อมูลเวลาทำการศูนย์บริการ",
    reasonCode: "CONFLICTING_EVIDENCE",
    reasonDetail: "แหล่งข้อมูลสาธารณะสองฉบับระบุเวลาไม่ตรงกัน",
    citizenMessage: "ช่วยตรวจสอบเวลาทำการที่ถูกต้องให้หน่อยค่ะ",
    priority: "NORMAL",
    occurredAt: "2026-08-10T20:00:00.000Z",
    departmentId: LOCAL_DEPARTMENT_A_ID,
  }, "CLOSED", LOCAL_DEPARTMENT_A_ID);
};

export const localDepartmentName = (departmentId: string | undefined): string | undefined => departmentId ? departmentNames[departmentId] : undefined;
export const localReasonLabel = (reasonCode: SupportTicket["reasonCode"]): string => reasonLabels[reasonCode];

const canSeeTicket = (ticket: SupportTicket, context: LocalSupportAdminContext): boolean => {
  if (ticket.tenantId !== context.tenantId) return false;
  if (context.role === "TENANT_ADMIN") return true;
  return !ticket.assignedDepartmentId || context.departmentIds.includes(ticket.assignedDepartmentId);
};

export const assertLocalSupportTicketAccess = (context: LocalSupportAdminContext, ticketId: string): SupportTicket => {
  const ticket = supportStore.get(context.tenantId, ticketId);
  if (!ticket || !canSeeTicket(ticket, context)) throw new SupportHandoffError("NOT_FOUND", "support ticket was not found in the authorized scope");
  return ticket;
};

export const authorizedDepartmentsFor = (context: LocalSupportAdminContext): readonly { tenantId: string; departmentId: string }[] =>
  context.role === "TENANT_ADMIN" ? ALL_LOCAL_DEPARTMENTS : ALL_LOCAL_DEPARTMENTS.filter((item) => context.departmentIds.includes(item.departmentId));

export const authorizedMembershipsFor = (context: LocalSupportAdminContext): readonly { tenantId: string; membershipId: string; departmentId: string }[] =>
  context.role === "TENANT_ADMIN" ? ALL_LOCAL_MEMBERSHIPS : ALL_LOCAL_MEMBERSHIPS.filter((item) => context.departmentIds.includes(item.departmentId));

const slaView = (ticket: SupportTicket) => {
  if (ticket.sla.state === "PAUSED") return { state: ticket.sla.state, label: "หยุดนับ SLA — รอข้อมูลประชาชน", dueAt: ticket.sla.resolutionDueAt, isNearDue: false, isOverdue: false };
  if (ticket.sla.state === "COMPLETED") return { state: ticket.sla.state, label: "SLA เสร็จสิ้น", dueAt: ticket.sla.resolutionDueAt, isNearDue: false, isOverdue: false };
  const responsePhase = ticket.status === "NEW" || ticket.status === "ASSIGNED";
  const dueAt = responsePhase ? ticket.sla.responseDueAt : ticket.sla.resolutionDueAt;
  const targetSeconds = responsePhase ? ticket.sla.responseTargetSeconds : ticket.sla.resolutionTargetSeconds;
  const remainingSeconds = Math.floor((Date.parse(dueAt) - LOCAL_SUPPORT_NOW.getTime()) / 1_000);
  const isOverdue = remainingSeconds < 0;
  const isNearDue = !isOverdue && remainingSeconds <= targetSeconds * (1 - ticket.sla.warningRatio);
  return { state: ticket.sla.state, label: isOverdue ? "เกิน SLA" : isNearDue ? "ใกล้ครบ SLA" : "อยู่ใน SLA", dueAt, isNearDue, isOverdue };
};

export type SupportAdminTicketView = {
  id: string;
  publicTicketId: string;
  reasonCode: SupportTicket["reasonCode"];
  reasonLabel: string;
  reasonDetail: string;
  channel: SupportTicket["channel"];
  priority: SupportTicket["priority"];
  status: SupportTicketStatus;
  statusLabel: string;
  departmentId?: string;
  departmentName?: string;
  membershipId?: string;
  ownerLabel: string;
  confirmationState: SupportTicket["confirmationState"];
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
  sla: ReturnType<typeof slaView> & { responseDueAt: string; resolutionDueAt: string; pausedSeconds: number };
};

const toView = (ticket: SupportTicket): SupportAdminTicketView => ({
  id: ticket.id,
  publicTicketId: ticket.publicTicketId,
  reasonCode: ticket.reasonCode,
  reasonLabel: localReasonLabel(ticket.reasonCode),
  reasonDetail: ticket.reasonDetail,
  channel: ticket.channel,
  priority: ticket.priority,
  status: ticket.status,
  statusLabel: SUPPORT_TICKET_STATUS_LABELS[ticket.status],
  ...(ticket.assignedDepartmentId ? { departmentId: ticket.assignedDepartmentId, departmentName: localDepartmentName(ticket.assignedDepartmentId) } : {}),
  ...(ticket.assignedMembershipId ? { membershipId: ticket.assignedMembershipId } : {}),
  ownerLabel: ticket.assignedMembershipId ? "มีผู้รับผิดชอบ" : ticket.assignedDepartmentId ? "คิวหน่วยงาน" : "คิวกลาง — ยังไม่มอบหมาย",
  confirmationState: ticket.confirmationState,
  createdAt: ticket.createdAt,
  updatedAt: ticket.updatedAt,
  rowVersion: ticket.rowVersion,
  sla: { ...slaView(ticket), responseDueAt: ticket.sla.responseDueAt, resolutionDueAt: ticket.sla.resolutionDueAt, pausedSeconds: ticket.sla.pausedSeconds },
});

export type SupportAdminPage = {
  items: readonly SupportAdminTicketView[];
  facets: { total: number; byStatus: Readonly<Record<SupportTicketStatus, number>>; urgent: number; overdue: number; nearDue: number };
  hasMore: false;
  synthetic: true;
};

export const listAdminSupportTickets = (context: LocalSupportAdminContext, filters: {
  search?: string;
  status?: SupportTicketStatus | "ALL";
  priority?: SupportTicket["priority"] | "ALL";
  queue?: "ALL" | "UNASSIGNED" | "MINE" | "DEPARTMENT" | "TENANT";
  sla?: "ALL" | "NEAR_DUE" | "OVERDUE";
  sort?: "UPDATED_DESC" | "CREATED_DESC" | "PRIORITY_DESC";
  limit?: number;
} = {}): SupportAdminPage => {
  const requestedLimit = filters.limit ?? 25;
  if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) throw new SupportHandoffError("VALIDATION_ERROR", "limit is invalid");
  const search = filters.search?.trim().toLocaleLowerCase("th-TH") ?? "";
  const visible = supportStore.list(context.tenantId).filter((ticket) => canSeeTicket(ticket, context));
  const filtered = visible.filter((ticket) => {
    const view = toView(ticket);
    if (filters.status && filters.status !== "ALL" && ticket.status !== filters.status) return false;
    if (filters.priority && filters.priority !== "ALL" && ticket.priority !== filters.priority) return false;
    if (filters.queue === "UNASSIGNED" && ticket.assignedDepartmentId) return false;
    if (filters.queue === "MINE" && ticket.assignedMembershipId !== context.accountId) return false;
    if (filters.queue === "DEPARTMENT" && ticket.assignedDepartmentId && !context.departmentIds.includes(ticket.assignedDepartmentId)) return false;
    if (filters.queue === "TENANT" && context.role !== "TENANT_ADMIN") return false;
    if (filters.sla === "NEAR_DUE" && !view.sla.isNearDue) return false;
    if (filters.sla === "OVERDUE" && !view.sla.isOverdue) return false;
    if (search && ![ticket.publicTicketId, ticket.reasonCode, ticket.reasonDetail, view.departmentName ?? ""].some((value) => value.toLocaleLowerCase("th-TH").includes(search))) return false;
    return true;
  });
  const sorted = [...filtered].sort((left, right) => {
    if (filters.sort === "PRIORITY_DESC") return (right.priority === "URGENT" ? 1 : 0) - (left.priority === "URGENT" ? 1 : 0) || right.updatedAt.localeCompare(left.updatedAt);
    if (filters.sort === "CREATED_DESC") return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
    return right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id);
  });
  const visibleViews = sorted.map(toView);
  const byStatus = Object.fromEntries(SUPPORT_TICKET_STATUSES.map((status) => [status, visibleViews.filter((item) => item.status === status).length])) as Record<SupportTicketStatus, number>;
  return {
    items: visibleViews.slice(0, requestedLimit),
    facets: {
      total: visibleViews.length,
      byStatus,
      urgent: visibleViews.filter((item) => item.priority === "URGENT").length,
      overdue: visibleViews.filter((item) => item.sla.isOverdue).length,
      nearDue: visibleViews.filter((item) => item.sla.isNearDue).length,
    },
    hasMore: false,
    synthetic: true,
  };
};

export type SupportAdminDetail = {
  item: SupportAdminTicketView;
  delivery?: SupportLineDeliveryView;
  faqCandidates: readonly SupportAdminFaqCandidateView[];
  source: SupportTicket["source"];
  evidence: { reasonCode: SupportTicket["reasonCode"]; reasonDetail: string; retrievedPublicSources: readonly { id: string; label: string }[] };
  messages: ReturnType<typeof supportStore.listMessages>;
  assignments: ReturnType<typeof supportStore.listAssignments>;
  statusLogs: ReturnType<typeof supportStore.listStatusLogs>;
  audits: ReturnType<typeof supportStore.listAudits>;
  allowedTransitions: readonly SupportTicketStatus[];
  permissions: { canAssign: boolean; canReply: boolean; canTransition: boolean; canReopen: boolean };
  departmentOptions: readonly { id: string; name: string }[];
  membershipOptions: readonly { id: string; name: string; departmentId: string }[];
  templates: readonly { id: string; label: string; body: string; visibility: SupportMessageVisibility }[];
  synthetic: true;
};

export type SupportAdminFaqCandidateView = {
  id: string;
  ticketId?: string;
  sourceMessageId?: string;
  source: {
    sourceType: FaqCandidate["source"]["sourceType"];
    sourceEventId?: string;
    retrievalTraceId?: string;
    evidenceIds: readonly string[];
  };
  question: string;
  answer: string;
  departmentId: string;
  knowledgeCategoryId: string;
  visibility: FaqCandidate["visibility"];
  effectiveFrom?: string;
  effectiveUntil?: string;
  effectiveDateUnknown: boolean;
  privacyReviewed: boolean;
  duplicateCheck: FaqCandidate["duplicateCheck"];
  status: FaqCandidate["status"];
  createdBy: string;
  ownerReviewedBy?: string;
  ownerReviewedAt?: string;
  coordinatorApprovedBy?: string;
  coordinatorApprovedAt?: string;
  documentVersionId?: string;
  indexGenerationId?: string;
  revokedBy?: string;
  revokedAt?: string;
  revokedReason?: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

const toFaqView = (candidate: FaqCandidate): SupportAdminFaqCandidateView => ({
  id: candidate.id,
  ...(candidate.ticketId ? { ticketId: candidate.ticketId } : {}),
  ...(candidate.sourceMessageId ? { sourceMessageId: candidate.sourceMessageId } : {}),
  source: {
    sourceType: candidate.source.sourceType,
    ...(candidate.source.sourceEventId ? { sourceEventId: candidate.source.sourceEventId } : {}),
    ...(candidate.source.retrievalTraceId ? { retrievalTraceId: candidate.source.retrievalTraceId } : {}),
    evidenceIds: [...candidate.source.evidenceIds],
  },
  question: candidate.question,
  answer: candidate.answer,
  departmentId: candidate.departmentId,
  knowledgeCategoryId: candidate.knowledgeCategoryId,
  visibility: candidate.visibility,
  ...(candidate.effectiveFrom ? { effectiveFrom: candidate.effectiveFrom } : {}),
  ...(candidate.effectiveUntil ? { effectiveUntil: candidate.effectiveUntil } : {}),
  effectiveDateUnknown: candidate.effectiveDateUnknown,
  privacyReviewed: candidate.privacyReviewed,
  duplicateCheck: candidate.duplicateCheck,
  status: candidate.status,
  createdBy: candidate.createdBy,
  ...(candidate.ownerReviewedBy ? { ownerReviewedBy: candidate.ownerReviewedBy } : {}),
  ...(candidate.ownerReviewedAt ? { ownerReviewedAt: candidate.ownerReviewedAt } : {}),
  ...(candidate.coordinatorApprovedBy ? { coordinatorApprovedBy: candidate.coordinatorApprovedBy } : {}),
  ...(candidate.coordinatorApprovedAt ? { coordinatorApprovedAt: candidate.coordinatorApprovedAt } : {}),
  ...(candidate.documentVersionId ? { documentVersionId: candidate.documentVersionId } : {}),
  ...(candidate.indexGenerationId ? { indexGenerationId: candidate.indexGenerationId } : {}),
  ...(candidate.revokedBy ? { revokedBy: candidate.revokedBy } : {}),
  ...(candidate.revokedAt ? { revokedAt: candidate.revokedAt } : {}),
  ...(candidate.revokedReason ? { revokedReason: candidate.revokedReason } : {}),
  createdAt: candidate.createdAt,
  updatedAt: candidate.updatedAt,
  rowVersion: candidate.rowVersion,
});

export const listAdminFaqCandidates = (context: LocalSupportAdminContext): readonly SupportAdminFaqCandidateView[] =>
  faqService.list(context.tenantId, context.role === "TENANT_ADMIN" ? {} : { departmentIds: context.departmentIds }).map(toFaqView);

export const getAdminFaqCandidate = (context: LocalSupportAdminContext, candidateId: string): SupportAdminFaqCandidateView => {
  const candidate = faqService.get(context.tenantId, candidateId);
  if (candidate.ticketId) assertLocalSupportTicketAccess(context, candidate.ticketId);
  if (context.role !== "TENANT_ADMIN" && !context.departmentIds.includes(candidate.departmentId)) {
    throw new SupportHandoffError("NOT_FOUND", "FAQ candidate was not found in the authorized department scope");
  }
  return toFaqView(candidate);
};

export const getAdminSupportDetail = (context: LocalSupportAdminContext, ticketId: string): SupportAdminDetail => {
  const ticket = assertLocalSupportTicketAccess(context, ticketId);
  const canAssign = context.role === "TENANT_ADMIN" || context.role === "DEPARTMENT_HEAD";
  const canReply = context.role === "STAFF" || canAssign;
  const canTransition = canReply;
  const canReopen = context.role !== "STAFF";
  return {
    item: toView(ticket),
    faqCandidates: faqService.list(context.tenantId, { ...(context.role === "TENANT_ADMIN" ? {} : { departmentIds: context.departmentIds }) }).filter((candidate) => candidate.ticketId === ticket.id).map(toFaqView),
    source: ticket.source,
    evidence: {
      reasonCode: ticket.reasonCode,
      reasonDetail: ticket.reasonDetail,
      retrievedPublicSources: ticket.source.retrievalTraceId ? [{ id: ticket.source.retrievalTraceId, label: "หลักฐานการค้นคืนสาธารณะ (ข้อมูลสังเคราะห์)" }] : [],
    },
    messages: supportStore.listMessages(context.tenantId, ticket.id),
    assignments: supportStore.listAssignments(context.tenantId, ticket.id),
    statusLogs: supportStore.listStatusLogs(context.tenantId, ticket.id),
    audits: supportStore.listAudits(context.tenantId, ticket.id),
    allowedTransitions: SUPPORT_TICKET_STATUSES.filter((status) => isAllowedSupportTransition(ticket.status, status, canReopen)),
    permissions: { canAssign, canReply, canTransition, canReopen },
    departmentOptions: (context.role === "TENANT_ADMIN" ? [LOCAL_DEPARTMENT_A_ID, LOCAL_DEPARTMENT_B_ID] : context.departmentIds).map((id) => ({ id, name: localDepartmentName(id) ?? "หน่วยงาน" })),
    membershipOptions: (context.role === "TENANT_ADMIN" ? ALL_LOCAL_MEMBERSHIPS : ALL_LOCAL_MEMBERSHIPS.filter((item) => context.departmentIds.includes(item.departmentId))).map((item) => ({ id: item.membershipId, name: item.membershipId === LOCAL_STAFF_ACCOUNT_ID ? "เจ้าหน้าที่กองช่าง" : "เจ้าหน้าที่กองสาธารณสุข", departmentId: item.departmentId })),
    templates: [
      { id: "acknowledge", label: "รับเรื่องและกำลังตรวจสอบ", body: "เจ้าหน้าที่รับเรื่องแล้ว และกำลังตรวจสอบกับหน่วยงานที่เกี่ยวข้องค่ะ", visibility: "PUBLIC" },
      { id: "need-more-info", label: "ขอข้อมูลเพิ่มเติม", body: "กรุณาส่งข้อมูลเพิ่มเติมเพื่อให้เจ้าหน้าที่ตรวจสอบต่อได้ค่ะ", visibility: "PUBLIC" },
      { id: "internal-follow-up", label: "ติดตามภายใน", body: "บันทึกเพื่อติดตามงานกับหน่วยงานที่รับผิดชอบ", visibility: "INTERNAL" },
    ],
    synthetic: true,
  };
};

export const isSupportLocalEnvironment = (): boolean => isLocalSyntheticEnvironment();
