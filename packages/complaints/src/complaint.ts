import { createHash, randomUUID } from "node:crypto";

export const COMPLAINT_STATES = [
  "RECEIVED",
  "UNDER_REVIEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "WAITING_FOR_CITIZEN",
  "RESOLVED",
  "CLOSED",
  "OUT_OF_JURISDICTION",
  "CANCELLED",
] as const;

export type ComplaintState = (typeof COMPLAINT_STATES)[number];
export type ComplaintPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type ComplaintRiskLevel = "STANDARD" | "SENSITIVE" | "HIGH";
export type ComplaintCommentVisibility = "PUBLIC" | "INTERNAL";
export type ComplaintActorType = "CITIZEN" | "STAFF" | "SYSTEM" | "SUPER_ADMIN";
export type ComplaintActorRole = "CITIZEN" | "STAFF" | "DEPARTMENT_HEAD" | "TENANT_ADMIN" | "SYSTEM" | "SUPER_ADMIN";

export type ComplaintErrorCode =
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "INVALID_STATE_TRANSITION"
  | "VERSION_CONFLICT"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "PROCESSING_FAILED";

export class ComplaintDomainError extends Error {
  constructor(public readonly code: ComplaintErrorCode, message: string, public readonly details?: Record<string, unknown>) {
    super(`${code}: ${message}`);
    this.name = "ComplaintDomainError";
  }
}

export type ComplaintLocation = {
  text?: string;
  latitude?: number;
  longitude?: number;
};

export type ComplaintAttachmentInput = {
  fileName: string;
  contentType: string;
  byteLength: number;
  state: "QUARANTINED" | "READY";
  caption?: string;
  publicUrl?: string;
};

export type ComplaintPublicAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  caption?: string;
  publicUrl?: string;
};

export type ComplaintInternalAttachment = ComplaintPublicAttachment & {
  state: "QUARANTINED" | "READY";
};

type ComplaintStoredAttachment = ComplaintPublicAttachment & {
  state: "QUARANTINED" | "READY";
};

export type ComplaintCreateInput = {
  tenantId: string;
  lineUserId: string;
  categoryId?: string;
  categoryUncertain?: boolean;
  citizenName?: string;
  citizenPhoneEncrypted?: string;
  title: string;
  description: string;
  location?: ComplaintLocation;
  intakeQueueId: string;
  assignedDepartmentId?: string;
  assignedMembershipId?: string;
  attachments?: readonly ComplaintAttachmentInput[];
  priority?: ComplaintPriority;
  riskLevel?: ComplaintRiskLevel;
  idempotencyKey: string;
  occurredAt?: Date;
};

export type ComplaintRecord = {
  id: string;
  tenantId: string;
  complaintNo: string;
  complaintYear: number;
  complaintSequence: number;
  lineUserId: string;
  citizenName?: string;
  citizenPhoneEncrypted?: string;
  categoryId?: string;
  categoryUncertain: boolean;
  title: string;
  description: string;
  location?: ComplaintLocation;
  canonicalStatus: ComplaintState;
  priority: ComplaintPriority;
  riskLevel: ComplaintRiskLevel;
  intakeQueueId: string;
  assignedDepartmentId?: string;
  assignedMembershipId?: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type ComplaintTimelineEntry = {
  id: string;
  tenantId: string;
  complaintId: string;
  fromStatus: ComplaintState | null;
  toStatus: ComplaintState;
  actorType: ComplaintActorType;
  actorId?: string;
  reason: string;
  publicVisible: boolean;
  occurredAt: string;
};

export type ComplaintPublicTimelineEntry = {
  id: string;
  fromStatus: ComplaintState | null;
  toStatus: ComplaintState;
  statusLabel: string;
  occurredAt: string;
};

export type ComplaintComment = {
  id: string;
  tenantId: string;
  complaintId: string;
  authorType: ComplaintActorType;
  authorId?: string;
  body: string;
  visibility: ComplaintCommentVisibility;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type ComplaintPublicComment = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ComplaintSurveyState = {
  eligible: boolean;
  submitted: boolean;
};

export type ComplaintSurveyRecord = {
  id: string;
  complaintId: string;
  rating: number;
  comment?: string;
  submittedAt: string;
};

export type ComplaintOutboxEvent = {
  id: string;
  tenantId: string;
  eventType: "complaint.created" | "complaint.status_changed" | "complaint.assigned" | "complaint.public_update_added";
  eventVersion: 1;
  aggregateId: string;
  idempotencyKey: string;
  payload: Record<string, string>;
  occurredAt: string;
};

export type ComplaintPublicView = {
  id: string;
  complaintNo: string;
  title: string;
  categoryId?: string;
  canonicalStatus: ComplaintState;
  statusLabel: string;
  priority: ComplaintPriority;
  submittedAt: string;
  location?: ComplaintLocation;
  departmentPublicName?: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  publicTimeline: readonly ComplaintPublicTimelineEntry[];
  publicAttachments: readonly ComplaintPublicAttachment[];
  nextExpectedStep: string;
  requestForInformation?: string;
  survey: ComplaintSurveyState;
  publicComments: readonly ComplaintPublicComment[];
};

export type ComplaintInternalView = {
  record: ComplaintRecord;
  timeline: readonly ComplaintTimelineEntry[];
  comments: readonly ComplaintComment[];
  attachments: readonly ComplaintInternalAttachment[];
  auditTrail: readonly ComplaintAuditEntry[];
};

export type ComplaintAuditEntry = {
  id: string;
  tenantId: string;
  complaintId: string;
  action: "COMPLAINT_CREATED" | "ASSIGNMENT_CHANGED" | "STATUS_CHANGED" | "INTERNAL_NOTE_ADDED" | "PUBLIC_UPDATE_ADDED";
  actorType: ComplaintActorType;
  actorRole: ComplaintActorRole;
  beforeVersion: number;
  afterVersion: number;
  fromStatus?: ComplaintState;
  toStatus?: ComplaintState;
  summary: string;
  occurredAt: string;
};

export type ComplaintCreateResult = {
  record: ComplaintRecord;
  idempotentReplay: boolean;
};

export type ComplaintTransitionInput = {
  tenantId: string;
  complaintId: string;
  toStatus: ComplaintState;
  expectedVersion: number;
  actor: { type: ComplaintActorType; role: ComplaintActorRole; id?: string };
  reason?: string;
  publicRequest?: string;
  resolutionSummary?: string;
  assignedDepartmentId?: string;
  assignedMembershipId?: string;
  idempotencyKey?: string;
  occurredAt?: Date;
};

export type ComplaintAssignmentInput = {
  tenantId: string;
  complaintId: string;
  expectedVersion: number;
  departmentId: string;
  membershipId?: string;
  actor: { type: ComplaintActorType; role: ComplaintActorRole; id?: string };
  reason: string;
  idempotencyKey?: string;
  occurredAt?: Date;
};

export type ComplaintCommentInput = {
  tenantId: string;
  complaintId: string;
  expectedVersion: number;
  author: { type: ComplaintActorType; role: ComplaintActorRole; id?: string };
  body: string;
  visibility: ComplaintCommentVisibility;
  idempotencyKey?: string;
  occurredAt?: Date;
};

export type ComplaintAdditionalInfoInput = {
  tenantId: string;
  lineUserId: string;
  complaintId: string;
  expectedVersion: number;
  body: string;
  idempotencyKey: string;
  occurredAt?: Date;
};

export type ComplaintAdditionalInfoResult = {
  messageId: string;
  view: ComplaintPublicView;
  idempotentReplay: boolean;
};

export type ComplaintSurveyInput = {
  tenantId: string;
  lineUserId: string;
  complaintId: string;
  rating: number;
  comment?: string;
  idempotencyKey: string;
  occurredAt?: Date;
};

export type ComplaintSurveyResult = {
  survey: ComplaintSurveyRecord;
  idempotentReplay: boolean;
};

export type ComplaintPublicListStatus = "ALL" | "ACTIVE" | "CLOSED";

export type ComplaintPublicListOptions = {
  limit?: number;
  cursor?: string;
  status?: ComplaintPublicListStatus;
};

export type ComplaintPublicPage = {
  items: readonly ComplaintPublicView[];
  nextCursor?: string;
};

type StoredComplaint = ComplaintRecord & {
  timeline: ComplaintTimelineEntry[];
  comments: ComplaintComment[];
  attachments: ComplaintStoredAttachment[];
  auditTrail: ComplaintAuditEntry[];
};

type ComplaintRepositoryOptions = {
  clock?: () => Date;
  prefixForTenant?: (tenantId: string) => string;
  departmentPublicNameForId?: (departmentId: string) => string | undefined;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const PREFIX_PATTERN = /^[A-Z0-9]{2,12}$/;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const COMPLAINT_STATUS_LABELS: Readonly<Record<ComplaintState, string>> = {
  RECEIVED: "รับเรื่องแล้ว",
  UNDER_REVIEW: "กำลังตรวจสอบข้อมูล",
  ASSIGNED: "ส่งต่อหน่วยงานแล้ว",
  IN_PROGRESS: "กำลังดำเนินการ",
  WAITING_FOR_CITIZEN: "รอข้อมูลเพิ่มเติม",
  RESOLVED: "แก้ไขแล้ว",
  CLOSED: "เสร็จสิ้น",
  OUT_OF_JURISDICTION: "อยู่นอกขอบเขตหน่วยงาน",
  CANCELLED: "ยกเลิกแล้ว",
};

const COMPLAINT_NEXT_STEPS: Readonly<Record<ComplaintState, string>> = {
  RECEIVED: "เจ้าหน้าที่จะตรวจสอบข้อมูลและส่งต่อหน่วยงานที่เกี่ยวข้อง",
  UNDER_REVIEW: "กำลังตรวจสอบรายละเอียดและจัดหน่วยงานผู้รับผิดชอบ",
  ASSIGNED: "หน่วยงานที่รับผิดชอบจะเริ่มดำเนินการ",
  IN_PROGRESS: "เจ้าหน้าที่กำลังดำเนินการแก้ไขปัญหา",
  WAITING_FOR_CITIZEN: "กรุณาส่งข้อมูลเพิ่มเติมเพื่อให้เจ้าหน้าที่ดำเนินการต่อ",
  RESOLVED: "โปรดตรวจสอบผลการดำเนินการ หากยังไม่เรียบร้อยให้แจ้งเจ้าหน้าที่",
  CLOSED: "เรื่องนี้ปิดการดำเนินการแล้ว ขอบคุณสำหรับความคิดเห็นของคุณ",
  OUT_OF_JURISDICTION: "โปรดติดต่อหน่วยงานตามคำแนะนำในรายละเอียดเรื่อง",
  CANCELLED: "เรื่องนี้ถูกยกเลิกแล้ว หากต้องการแจ้งใหม่ให้สร้างเรื่องใหม่",
};

const transitionRules: ReadonlyArray<{ from: ComplaintState; to: ComplaintState; roles: readonly ComplaintActorRole[] }> = [
  { from: "RECEIVED", to: "UNDER_REVIEW", roles: ["STAFF", "DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN"] },
  { from: "RECEIVED", to: "ASSIGNED", roles: ["DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN"] },
  { from: "RECEIVED", to: "OUT_OF_JURISDICTION", roles: ["DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN"] },
  { from: "RECEIVED", to: "CANCELLED", roles: ["CITIZEN", "TENANT_ADMIN", "SUPER_ADMIN"] },
  { from: "UNDER_REVIEW", to: "ASSIGNED", roles: ["DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN"] },
  { from: "UNDER_REVIEW", to: "OUT_OF_JURISDICTION", roles: ["DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN"] },
  { from: "UNDER_REVIEW", to: "CANCELLED", roles: ["TENANT_ADMIN", "SUPER_ADMIN"] },
  { from: "ASSIGNED", to: "IN_PROGRESS", roles: ["STAFF", "DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN"] },
  { from: "ASSIGNED", to: "OUT_OF_JURISDICTION", roles: ["DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN"] },
  { from: "IN_PROGRESS", to: "WAITING_FOR_CITIZEN", roles: ["STAFF", "DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN"] },
  { from: "IN_PROGRESS", to: "RESOLVED", roles: ["STAFF", "DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN"] },
  { from: "IN_PROGRESS", to: "OUT_OF_JURISDICTION", roles: ["DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN"] },
  { from: "WAITING_FOR_CITIZEN", to: "IN_PROGRESS", roles: ["CITIZEN", "STAFF", "DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN", "SYSTEM"] },
  { from: "RESOLVED", to: "CLOSED", roles: ["DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN", "SYSTEM"] },
  { from: "RESOLVED", to: "IN_PROGRESS", roles: ["DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN"] },
  { from: "CLOSED", to: "IN_PROGRESS", roles: ["DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN"] },
];

export const isAllowedComplaintTransition = (from: ComplaintState, to: ComplaintState, role: ComplaintActorRole): boolean =>
  transitionRules.some((rule) => rule.from === from && rule.to === to && rule.roles.includes(role));

const assertUuid = (value: string, field: string): void => {
  if (!UUID_PATTERN.test(value)) throw new ComplaintDomainError("VALIDATION_ERROR", `${field} must be a UUID`);
};

const assertIdentifier = (value: string, field: string): void => {
  if (!IDENTIFIER_PATTERN.test(value) || CONTROL_PATTERN.test(value)) throw new ComplaintDomainError("VALIDATION_ERROR", `${field} is invalid`);
};

const assertText = (value: string, field: string, maxLength: number): void => {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || CONTROL_PATTERN.test(value)) {
    throw new ComplaintDomainError("VALIDATION_ERROR", `${field} is invalid`);
  }
};

const assertReason = (value: string | undefined, field = "reason"): void => {
  if (value === undefined || value.trim().length < 3 || value.length > 2000 || CONTROL_PATTERN.test(value)) {
    throw new ComplaintDomainError("VALIDATION_ERROR", `${field} is required`);
  }
};

const assertIdempotencyKey = (value: string): void => {
  if (value.length < 8 || value.length > 255 || CONTROL_PATTERN.test(value)) throw new ComplaintDomainError("VALIDATION_ERROR", "idempotencyKey is invalid");
};

const cloneLocation = (location: ComplaintLocation | undefined): ComplaintLocation | undefined => location ? { ...location } : undefined;

const cloneRecord = (record: ComplaintRecord): ComplaintRecord => ({ ...record, ...(record.location ? { location: cloneLocation(record.location) } : {}) });

const cloneTimeline = (timeline: readonly ComplaintTimelineEntry[]): ComplaintTimelineEntry[] => timeline.map((entry) => ({ ...entry }));

const cloneComment = (comment: ComplaintComment): ComplaintComment => ({ ...comment });

const clonePublicAttachment = (attachment: ComplaintPublicAttachment): ComplaintPublicAttachment => ({ ...attachment });
const cloneStoredAttachment = (attachment: ComplaintStoredAttachment): ComplaintStoredAttachment => ({ ...attachment });
const cloneAudit = (entry: ComplaintAuditEntry): ComplaintAuditEntry => ({ ...entry });

const bangkokBuddhistYear = (date: Date): number => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", year: "numeric" }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  if (!Number.isSafeInteger(year)) throw new ComplaintDomainError("VALIDATION_ERROR", "complaint date is invalid");
  return year + 543;
};

const hashCreateRequest = (input: ComplaintCreateInput, occurredAt: Date): string => createHash("sha256").update(JSON.stringify({
  tenantId: input.tenantId,
  lineUserId: input.lineUserId,
  categoryId: input.categoryId ?? null,
  categoryUncertain: input.categoryUncertain ?? false,
  title: input.title,
  description: input.description,
  location: input.location ?? null,
  intakeQueueId: input.intakeQueueId,
  assignedDepartmentId: input.assignedDepartmentId ?? null,
  assignedMembershipId: input.assignedMembershipId ?? null,
  attachments: input.attachments ?? [],
  priority: input.priority ?? "NORMAL",
  riskLevel: input.riskLevel ?? "STANDARD",
  // A server-generated timestamp is not part of the caller's idempotency
  // identity. Retries without an explicit occurredAt must replay safely.
  occurredAt: input.occurredAt ? occurredAt.toISOString() : null,
})).digest("hex");

const cloneStored = (record: StoredComplaint): StoredComplaint => ({
  ...cloneRecord(record),
  timeline: cloneTimeline(record.timeline),
  comments: record.comments.map(cloneComment),
  attachments: record.attachments.map(cloneStoredAttachment),
  auditTrail: record.auditTrail.map(cloneAudit),
});

const cloneInternalView = (record: StoredComplaint): ComplaintInternalView => ({
  record: cloneRecord(record),
  timeline: cloneTimeline(record.timeline),
  comments: record.comments.map(cloneComment),
  attachments: record.attachments.map((attachment) => ({ ...attachment })),
  auditTrail: record.auditTrail.map(cloneAudit),
});

const clonePublicView = (view: ComplaintPublicView): ComplaintPublicView => ({
  ...view,
  ...(view.location ? { location: { ...view.location } } : {}),
  publicTimeline: view.publicTimeline.map((entry) => ({ ...entry })),
  publicAttachments: view.publicAttachments.map((attachment) => ({ ...attachment })),
  publicComments: view.publicComments.map((comment) => ({ ...comment })),
  survey: { ...view.survey },
});

export class InMemoryComplaintRepository {
  private readonly records = new Map<string, StoredComplaint>();
  private readonly idempotency = new Map<string, { requestHash: string; complaintId: string }>();
  private readonly transitionIdempotency = new Map<string, { requestHash: string; result: ComplaintRecord }>();
  private readonly assignmentIdempotency = new Map<string, { requestHash: string; result: ComplaintRecord }>();
  private readonly commentIdempotency = new Map<string, { requestHash: string; result: ComplaintComment }>();
  private readonly additionalInfoIdempotency = new Map<string, { requestHash: string; result: ComplaintAdditionalInfoResult }>();
  private readonly surveyIdempotency = new Map<string, { requestHash: string; result: ComplaintSurveyResult }>();
  private readonly surveys = new Map<string, ComplaintSurveyRecord>();
  // The display year is stored separately from the allocation sequence. Keeping
  // one tenant-scoped allocation stream means a failed transaction or a
  // Bangkok Buddhist-year boundary can never reuse a number.
  private readonly sequences = new Map<string, number>();
  private readonly outbox: ComplaintOutboxEvent[] = [];
  private readonly clock: () => Date;
  private readonly prefixForTenant: (tenantId: string) => string;
  private readonly departmentPublicNameForId: (departmentId: string) => string | undefined;
  private failNextCommit = false;

  constructor(options: ComplaintRepositoryOptions = {}) {
    this.clock = options.clock ?? (() => new Date());
    this.prefixForTenant = options.prefixForTenant ?? (() => "CCM");
    this.departmentPublicNameForId = options.departmentPublicNameForId ?? (() => undefined);
  }

  failNextTransaction(): void {
    this.failNextCommit = true;
  }

  create(input: ComplaintCreateInput): ComplaintCreateResult {
    const occurredAt = input.occurredAt ?? this.clock();
    this.validateCreateInput(input);
    if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) {
      throw new ComplaintDomainError("VALIDATION_ERROR", "occurredAt is invalid");
    }
    const idempotencyKey = `${input.tenantId}:${input.idempotencyKey}`;
    const requestHash = hashCreateRequest(input, occurredAt);
    const existing = this.idempotency.get(idempotencyKey);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ComplaintDomainError("IDEMPOTENCY_CONFLICT", "idempotency key was reused with different request data");
      const record = this.records.get(existing.complaintId);
      if (!record) throw new ComplaintDomainError("PROCESSING_FAILED", "idempotency record points to a missing complaint");
      return { record: cloneRecord(record), idempotentReplay: true };
    }

    const year = bangkokBuddhistYear(occurredAt);
    const sequence = this.reserveSequence(input.tenantId, year);
    const prefix = this.prefix(input.tenantId);
    const now = occurredAt.toISOString();
    const id = randomUUID();
    const complaintNo = `${prefix}-${year}-${sequence.toString().padStart(6, "0")}`;
    const record: StoredComplaint = {
      id,
      tenantId: input.tenantId,
      complaintNo,
      complaintYear: year,
      complaintSequence: sequence,
      lineUserId: input.lineUserId,
      ...(input.citizenName ? { citizenName: input.citizenName } : {}),
      ...(input.citizenPhoneEncrypted ? { citizenPhoneEncrypted: input.citizenPhoneEncrypted } : {}),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
      categoryUncertain: input.categoryUncertain ?? false,
      title: input.title.trim(),
      description: input.description.trim(),
      ...(input.location ? { location: cloneLocation(input.location) } : {}),
      canonicalStatus: "RECEIVED",
      priority: input.priority ?? "NORMAL",
      riskLevel: input.riskLevel ?? "STANDARD",
      intakeQueueId: input.intakeQueueId,
      ...(input.assignedDepartmentId ? { assignedDepartmentId: input.assignedDepartmentId } : {}),
      ...(input.assignedMembershipId ? { assignedMembershipId: input.assignedMembershipId } : {}),
      createdAt: now,
      updatedAt: now,
      rowVersion: 1,
      timeline: [{
        id: randomUUID(),
        tenantId: input.tenantId,
        complaintId: id,
        fromStatus: null,
        toStatus: "RECEIVED",
        actorType: "SYSTEM",
        reason: "Complaint created",
        publicVisible: true,
        occurredAt: now,
      }],
      comments: [],
      attachments: (input.attachments ?? []).map((attachment) => ({
        id: randomUUID(),
        fileName: attachment.fileName.trim(),
        contentType: attachment.contentType,
        state: attachment.state,
        ...(attachment.caption ? { caption: attachment.caption.trim() } : {}),
        ...(attachment.publicUrl ? { publicUrl: attachment.publicUrl } : {}),
      })),
      auditTrail: [{
        id: randomUUID(),
        tenantId: input.tenantId,
        complaintId: id,
        action: "COMPLAINT_CREATED",
        actorType: "SYSTEM",
        actorRole: "SYSTEM",
        beforeVersion: 0,
        afterVersion: 1,
        summary: "Complaint created",
        occurredAt: now,
      }],
    };
    const event: ComplaintOutboxEvent = {
      id: randomUUID(),
      tenantId: input.tenantId,
      eventType: "complaint.created",
      eventVersion: 1,
      aggregateId: id,
      idempotencyKey: `complaint.created:${id}`,
      payload: { tenantId: input.tenantId, complaintId: id, complaintNo },
      occurredAt: now,
    };
    if (this.failNextCommit) {
      this.failNextCommit = false;
      throw new ComplaintDomainError("PROCESSING_FAILED", "complaint transaction was rolled back");
    }
    this.records.set(id, record);
    this.idempotency.set(idempotencyKey, { requestHash, complaintId: id });
    this.outbox.push(event);
    return { record: cloneRecord(record), idempotentReplay: false };
  }

  transition(input: ComplaintTransitionInput): ComplaintRecord {
    const record = this.requireRecord(input.tenantId, input.complaintId);
    const mutationKey = input.idempotencyKey ? `${input.tenantId}:${input.complaintId}:transition:${input.idempotencyKey}` : undefined;
    if (input.idempotencyKey) assertIdempotencyKey(input.idempotencyKey);
    const requestHash = mutationKey ? createHash("sha256").update(JSON.stringify({
      tenantId: input.tenantId,
      complaintId: input.complaintId,
      toStatus: input.toStatus,
      expectedVersion: input.expectedVersion,
      actor: input.actor,
      reason: input.reason ?? null,
      publicRequest: input.publicRequest ?? null,
      resolutionSummary: input.resolutionSummary ?? null,
      assignedDepartmentId: input.assignedDepartmentId ?? null,
      assignedMembershipId: input.assignedMembershipId ?? null,
      occurredAt: input.occurredAt ? input.occurredAt.toISOString() : null,
    })).digest("hex") : undefined;
    const existing = mutationKey ? this.transitionIdempotency.get(mutationKey) : undefined;
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ComplaintDomainError("IDEMPOTENCY_CONFLICT", "transition idempotency key was reused with different request data");
      return cloneRecord(existing.result);
    }
    if (record.rowVersion !== input.expectedVersion) throw new ComplaintDomainError("VERSION_CONFLICT", "complaint version is stale", { currentVersion: record.rowVersion });
    if (!isAllowedComplaintTransition(record.canonicalStatus, input.toStatus, input.actor.role)) {
      throw new ComplaintDomainError("INVALID_STATE_TRANSITION", `${record.canonicalStatus} cannot transition to ${input.toStatus}`);
    }
    if (input.actor.role === "CITIZEN" && input.actor.id !== record.lineUserId) throw new ComplaintDomainError("FORBIDDEN", "citizen does not own this complaint");
    this.validateTransitionRequirements(record, input);
    const now = (input.occurredAt ?? this.clock()).toISOString();
    const fromStatus = record.canonicalStatus;
    const beforeVersion = record.rowVersion;
    record.canonicalStatus = input.toStatus;
    record.updatedAt = now;
    record.rowVersion += 1;
    if ((input.toStatus === "UNDER_REVIEW" || fromStatus !== "RECEIVED") && record.firstResponseAt === undefined && input.toStatus !== "CANCELLED") record.firstResponseAt = now;
    if (input.toStatus === "RESOLVED") record.resolvedAt = now;
    if (input.toStatus === "CLOSED") record.closedAt = now;
    if (input.assignedDepartmentId) record.assignedDepartmentId = input.assignedDepartmentId;
    if (input.assignedMembershipId) record.assignedMembershipId = input.assignedMembershipId;
    const timelineEntry: ComplaintTimelineEntry = {
      id: randomUUID(),
      tenantId: record.tenantId,
      complaintId: record.id,
      fromStatus,
      toStatus: input.toStatus,
      actorType: input.actor.type,
      ...(input.actor.id ? { actorId: input.actor.id } : {}),
      reason: input.reason ?? input.resolutionSummary ?? input.publicRequest ?? "Status changed",
      publicVisible: input.toStatus !== "IN_PROGRESS" || input.actor.role !== "STAFF",
      occurredAt: now,
    };
    record.timeline.push(timelineEntry);
    this.outbox.push({
      id: randomUUID(),
      tenantId: record.tenantId,
      eventType: "complaint.status_changed",
      eventVersion: 1,
      aggregateId: record.id,
      idempotencyKey: `complaint.status_changed:${record.id}:${record.rowVersion}`,
      payload: { tenantId: record.tenantId, complaintId: record.id, fromStatus, toStatus: input.toStatus },
      occurredAt: now,
    });
    record.auditTrail.push({
      id: randomUUID(),
      tenantId: record.tenantId,
      complaintId: record.id,
      action: "STATUS_CHANGED",
      actorType: input.actor.type,
      actorRole: input.actor.role,
      beforeVersion,
      afterVersion: record.rowVersion,
      fromStatus,
      toStatus: input.toStatus,
      summary: input.reason ?? input.resolutionSummary ?? input.publicRequest ?? "Status changed",
      occurredAt: now,
    });
    const result = cloneRecord(record);
    if (mutationKey && requestHash) this.transitionIdempotency.set(mutationKey, { requestHash, result });
    return result;
  }

  assign(input: ComplaintAssignmentInput): ComplaintRecord {
    const record = this.requireRecord(input.tenantId, input.complaintId);
    const mutationKey = input.idempotencyKey ? `${input.tenantId}:${input.complaintId}:assignment:${input.idempotencyKey}` : undefined;
    if (input.idempotencyKey) assertIdempotencyKey(input.idempotencyKey);
    const requestHash = mutationKey ? createHash("sha256").update(JSON.stringify({
      tenantId: input.tenantId,
      complaintId: input.complaintId,
      expectedVersion: input.expectedVersion,
      departmentId: input.departmentId,
      membershipId: input.membershipId ?? null,
      actor: input.actor,
      reason: input.reason,
      occurredAt: input.occurredAt ? input.occurredAt.toISOString() : null,
    })).digest("hex") : undefined;
    const existing = mutationKey ? this.assignmentIdempotency.get(mutationKey) : undefined;
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ComplaintDomainError("IDEMPOTENCY_CONFLICT", "assignment idempotency key was reused with different request data");
      return cloneRecord(existing.result);
    }
    if (!["DEPARTMENT_HEAD", "TENANT_ADMIN", "SUPER_ADMIN"].includes(input.actor.role)) throw new ComplaintDomainError("FORBIDDEN", "staff role cannot assign complaints");
    if (record.rowVersion !== input.expectedVersion) throw new ComplaintDomainError("VERSION_CONFLICT", "complaint version is stale", { currentVersion: record.rowVersion });
    assertUuid(input.departmentId, "departmentId");
    if (input.membershipId) assertUuid(input.membershipId, "membershipId");
    assertReason(input.reason);
    const now = (input.occurredAt ?? this.clock()).toISOString();
    const beforeVersion = record.rowVersion;
    const beforeDepartmentId = record.assignedDepartmentId;
    const beforeMembershipId = record.assignedMembershipId;
    record.assignedDepartmentId = input.departmentId;
    if (input.membershipId) record.assignedMembershipId = input.membershipId;
    else delete record.assignedMembershipId;
    record.updatedAt = now;
    record.rowVersion += 1;
    this.outbox.push({
      id: randomUUID(),
      tenantId: record.tenantId,
      eventType: "complaint.assigned",
      eventVersion: 1,
      aggregateId: record.id,
        idempotencyKey: `complaint.assigned:${record.id}:${record.rowVersion}`,
      payload: {
        tenantId: record.tenantId,
        complaintId: record.id,
        departmentId: record.assignedDepartmentId,
        ...(record.assignedMembershipId ? { membershipId: record.assignedMembershipId } : {}),
      },
      occurredAt: now,
    });
    record.auditTrail.push({
      id: randomUUID(),
      tenantId: record.tenantId,
      complaintId: record.id,
      action: "ASSIGNMENT_CHANGED",
      actorType: input.actor.type,
      actorRole: input.actor.role,
      beforeVersion,
      afterVersion: record.rowVersion,
      summary: `${input.reason.trim()} (${beforeDepartmentId ?? "unassigned"}/${beforeMembershipId ?? "unassigned"} → ${record.assignedDepartmentId}/${record.assignedMembershipId ?? "unassigned"})`,
      occurredAt: now,
    });
    const result = cloneRecord(record);
    if (mutationKey && requestHash) this.assignmentIdempotency.set(mutationKey, { requestHash, result });
    return result;
  }

  addComment(input: ComplaintCommentInput): ComplaintComment {
    const record = this.requireRecord(input.tenantId, input.complaintId);
    const mutationKey = input.idempotencyKey ? `${input.tenantId}:${input.complaintId}:comment:${input.idempotencyKey}` : undefined;
    if (input.idempotencyKey) assertIdempotencyKey(input.idempotencyKey);
    const requestHash = mutationKey ? createHash("sha256").update(JSON.stringify({
      tenantId: input.tenantId,
      complaintId: input.complaintId,
      expectedVersion: input.expectedVersion,
      author: input.author,
      body: input.body,
      visibility: input.visibility,
      occurredAt: input.occurredAt ? input.occurredAt.toISOString() : null,
    })).digest("hex") : undefined;
    const existing = mutationKey ? this.commentIdempotency.get(mutationKey) : undefined;
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ComplaintDomainError("IDEMPOTENCY_CONFLICT", "comment idempotency key was reused with different request data");
      return cloneComment(existing.result);
    }
    if (record.rowVersion !== input.expectedVersion) throw new ComplaintDomainError("VERSION_CONFLICT", "complaint version is stale", { currentVersion: record.rowVersion });
    if (input.author.role === "CITIZEN" && (input.author.id !== record.lineUserId || input.visibility !== "PUBLIC")) throw new ComplaintDomainError("FORBIDDEN", "citizen comments must be public and own the complaint");
    assertText(input.body, "comment", 20_000);
    const now = (input.occurredAt ?? this.clock()).toISOString();
    const beforeVersion = record.rowVersion;
    const comment: ComplaintComment = {
      id: randomUUID(),
      tenantId: record.tenantId,
      complaintId: record.id,
      authorType: input.author.type,
      ...(input.author.id ? { authorId: input.author.id } : {}),
      body: input.body.trim(),
      visibility: input.visibility,
      createdAt: now,
      updatedAt: now,
      rowVersion: 1,
    };
    record.comments.push(comment);
    record.updatedAt = now;
    record.rowVersion += 1;
    const isStaffPublicUpdate = input.visibility === "PUBLIC" && input.author.type !== "CITIZEN";
    if (isStaffPublicUpdate) {
      this.outbox.push({
        id: randomUUID(),
        tenantId: record.tenantId,
        eventType: "complaint.public_update_added",
        eventVersion: 1,
        aggregateId: record.id,
        idempotencyKey: `complaint.public_update_added:${record.id}:${comment.id}`,
        payload: { tenantId: record.tenantId, complaintId: record.id, commentId: comment.id, complaintNo: record.complaintNo },
        occurredAt: now,
      });
    }
    record.auditTrail.push({
      id: randomUUID(),
      tenantId: record.tenantId,
      complaintId: record.id,
      action: isStaffPublicUpdate ? "PUBLIC_UPDATE_ADDED" : "INTERNAL_NOTE_ADDED",
      actorType: input.author.type,
      actorRole: input.author.role,
      beforeVersion,
      afterVersion: record.rowVersion,
      summary: isStaffPublicUpdate ? "Public update added" : "Internal note added",
      occurredAt: now,
    });
    const result = cloneComment(comment);
    if (mutationKey && requestHash) this.commentIdempotency.set(mutationKey, { requestHash, result });
    return result;
  }

  get(tenantId: string, complaintId: string): ComplaintRecord | undefined {
    const record = this.records.get(complaintId);
    return record && record.tenantId === tenantId ? cloneRecord(record) : undefined;
  }

  getInternalView(tenantId: string, complaintId: string): ComplaintInternalView | undefined {
    const record = this.records.get(complaintId);
    if (!record || record.tenantId !== tenantId) return undefined;
    return cloneInternalView(record);
  }

  getPublicView(tenantId: string, lineUserId: string, complaintId: string): ComplaintPublicView | undefined {
    const record = this.records.get(complaintId);
    if (!record || record.tenantId !== tenantId || record.lineUserId !== lineUserId) return undefined;
    return clonePublicView(this.publicView(record));
  }

  listPublic(tenantId: string, lineUserId: string): ComplaintPublicView[] {
    return [...this.records.values()]
      .filter((record) => record.tenantId === tenantId && record.lineUserId === lineUserId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((record) => this.publicView(record));
  }

  listPublicPage(tenantId: string, lineUserId: string, options: ComplaintPublicListOptions = {}): ComplaintPublicPage {
    const limit = options.limit ?? 20;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw new ComplaintDomainError("VALIDATION_ERROR", "limit must be between 1 and 50");
    if (options.status !== undefined && !["ALL", "ACTIVE", "CLOSED"].includes(options.status)) throw new ComplaintDomainError("VALIDATION_ERROR", "status filter is invalid");
    const offset = options.cursor === undefined ? 0 : Number(options.cursor);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) throw new ComplaintDomainError("VALIDATION_ERROR", "cursor is invalid");
    const filtered = this.listPublic(tenantId, lineUserId).filter((view) => {
      if (!options.status || options.status === "ALL") return true;
      const closed = ["CLOSED", "CANCELLED", "OUT_OF_JURISDICTION"].includes(view.canonicalStatus);
      return options.status === "CLOSED" ? closed : !closed;
    });
    const items = filtered.slice(offset, offset + limit).map(clonePublicView);
    return {
      items,
      ...(offset + items.length < filtered.length ? { nextCursor: String(offset + items.length) } : {}),
    };
  }

  addCitizenInformation(input: ComplaintAdditionalInfoInput): ComplaintAdditionalInfoResult {
    const record = this.requireRecord(input.tenantId, input.complaintId);
    if (record.lineUserId !== input.lineUserId) throw new ComplaintDomainError("FORBIDDEN", "citizen does not own this complaint");
    if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 255 || CONTROL_PATTERN.test(input.idempotencyKey)) throw new ComplaintDomainError("VALIDATION_ERROR", "idempotencyKey is invalid");
    assertText(input.body, "body", 20_000);
    if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1) throw new ComplaintDomainError("VALIDATION_ERROR", "expectedVersion is invalid");
    const occurredAt = input.occurredAt ?? this.clock();
    if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) throw new ComplaintDomainError("VALIDATION_ERROR", "occurredAt is invalid");
    const scopeKey = `${input.tenantId}:${input.lineUserId}:${input.complaintId}:${input.idempotencyKey}`;
    const requestHash = createHash("sha256").update(JSON.stringify({
      tenantId: input.tenantId,
      lineUserId: input.lineUserId,
      complaintId: input.complaintId,
      body: input.body,
      occurredAt: input.occurredAt ? occurredAt.toISOString() : null,
    })).digest("hex");
    const existing = this.additionalInfoIdempotency.get(scopeKey);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new ComplaintDomainError("IDEMPOTENCY_CONFLICT", "idempotency key was reused with different request data");
      return { ...existing.result, view: clonePublicView(existing.result.view), idempotentReplay: true };
    }
    if (record.canonicalStatus !== "WAITING_FOR_CITIZEN") throw new ComplaintDomainError("CONFLICT", "additional information is not currently requested");
    const comment = this.addComment({
      tenantId: input.tenantId,
      complaintId: input.complaintId,
      expectedVersion: input.expectedVersion,
      author: { type: "CITIZEN", role: "CITIZEN", id: input.lineUserId },
      body: input.body,
      visibility: "PUBLIC",
      occurredAt,
    });
    const afterComment = this.requireRecord(input.tenantId, input.complaintId);
    this.transition({
      tenantId: input.tenantId,
      complaintId: input.complaintId,
      toStatus: "IN_PROGRESS",
      expectedVersion: afterComment.rowVersion,
      actor: { type: "CITIZEN", role: "CITIZEN", id: input.lineUserId },
      reason: "Citizen provided additional information",
      occurredAt,
    });
    const result: ComplaintAdditionalInfoResult = {
      messageId: comment.id,
      view: this.getPublicView(input.tenantId, input.lineUserId, input.complaintId)!,
      idempotentReplay: false,
    };
    this.additionalInfoIdempotency.set(scopeKey, { requestHash, result });
    return { ...result, view: clonePublicView(result.view) };
  }

  submitSurvey(input: ComplaintSurveyInput): ComplaintSurveyResult {
    const record = this.requireRecord(input.tenantId, input.complaintId);
    if (record.lineUserId !== input.lineUserId) throw new ComplaintDomainError("FORBIDDEN", "citizen does not own this complaint");
    if (!Number.isSafeInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new ComplaintDomainError("VALIDATION_ERROR", "rating must be between 1 and 5");
    if (input.comment !== undefined) assertText(input.comment, "comment", 4_000);
    if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 255 || CONTROL_PATTERN.test(input.idempotencyKey)) throw new ComplaintDomainError("VALIDATION_ERROR", "idempotencyKey is invalid");
    const occurredAt = input.occurredAt ?? this.clock();
    if (!(occurredAt instanceof Date) || !Number.isFinite(occurredAt.getTime())) throw new ComplaintDomainError("VALIDATION_ERROR", "occurredAt is invalid");
    const scopeKey = `${input.tenantId}:${input.lineUserId}:${input.complaintId}:${input.idempotencyKey}`;
    const requestHash = createHash("sha256").update(JSON.stringify({
      tenantId: input.tenantId,
      lineUserId: input.lineUserId,
      complaintId: input.complaintId,
      rating: input.rating,
      comment: input.comment ?? null,
      occurredAt: input.occurredAt ? occurredAt.toISOString() : null,
    })).digest("hex");
    const existingRequest = this.surveyIdempotency.get(scopeKey);
    if (existingRequest) {
      if (existingRequest.requestHash !== requestHash) throw new ComplaintDomainError("IDEMPOTENCY_CONFLICT", "idempotency key was reused with different survey data");
      return { ...existingRequest.result, survey: { ...existingRequest.result.survey }, idempotentReplay: true };
    }
    if (!["RESOLVED", "CLOSED"].includes(record.canonicalStatus)) throw new ComplaintDomainError("CONFLICT", "survey is not eligible until the complaint is resolved");
    const surveyKey = `${input.tenantId}:${input.complaintId}:${input.lineUserId}`;
    if (this.surveys.has(surveyKey)) throw new ComplaintDomainError("CONFLICT", "survey has already been submitted");
    const survey: ComplaintSurveyRecord = {
      id: randomUUID(),
      complaintId: input.complaintId,
      rating: input.rating,
      ...(input.comment ? { comment: input.comment.trim() } : {}),
      submittedAt: occurredAt.toISOString(),
    };
    const result: ComplaintSurveyResult = { survey, idempotentReplay: false };
    this.surveys.set(surveyKey, survey);
    this.surveyIdempotency.set(scopeKey, { requestHash, result });
    return { survey: { ...survey }, idempotentReplay: false };
  }

  listInternal(tenantId: string): ComplaintInternalView[] {
    return [...this.records.values()]
      .filter((record) => record.tenantId === tenantId)
      .map(cloneInternalView);
  }

  listOutbox(tenantId: string): ComplaintOutboxEvent[] {
    return this.outbox.filter((event) => event.tenantId === tenantId).map((event) => ({ ...event, payload: { ...event.payload } }));
  }

  private validateCreateInput(input: ComplaintCreateInput): void {
    assertUuid(input.tenantId, "tenantId");
    assertIdentifier(input.lineUserId, "lineUserId");
    assertUuid(input.intakeQueueId, "intakeQueueId");
    if (input.categoryId !== undefined) assertUuid(input.categoryId, "categoryId");
    if (input.assignedDepartmentId !== undefined) assertUuid(input.assignedDepartmentId, "assignedDepartmentId");
    if (input.assignedMembershipId !== undefined) assertUuid(input.assignedMembershipId, "assignedMembershipId");
    if ((input.categoryId === undefined) !== (input.categoryUncertain === true)) throw new ComplaintDomainError("VALIDATION_ERROR", "categoryId and categoryUncertain must be XOR");
    assertText(input.title, "title", 240);
    assertText(input.description, "description", 20_000);
    if (input.citizenName !== undefined) assertText(input.citizenName, "citizenName", 200);
    if (input.citizenPhoneEncrypted !== undefined && (input.citizenPhoneEncrypted.length < 16 || input.citizenPhoneEncrypted.length > 2048)) throw new ComplaintDomainError("VALIDATION_ERROR", "citizenPhoneEncrypted is invalid");
    if (input.location) this.validateLocation(input.location);
    if ((input.attachments?.length ?? 0) > 5) throw new ComplaintDomainError("VALIDATION_ERROR", "attachments exceed the maximum of five files");
    for (const attachment of input.attachments ?? []) {
      assertText(attachment.fileName, "attachment.fileName", 255);
      if (!IMAGE_TYPES.has(attachment.contentType) || !Number.isSafeInteger(attachment.byteLength) || attachment.byteLength <= 0 || attachment.byteLength > MAX_ATTACHMENT_BYTES) {
        throw new ComplaintDomainError("VALIDATION_ERROR", "attachment is invalid");
      }
      if (attachment.state !== "QUARANTINED" && attachment.state !== "READY") throw new ComplaintDomainError("VALIDATION_ERROR", "attachment state is invalid");
      if (attachment.caption !== undefined) assertText(attachment.caption, "attachment.caption", 1000);
      if (attachment.publicUrl !== undefined && !/^https:\/\//i.test(attachment.publicUrl)) throw new ComplaintDomainError("VALIDATION_ERROR", "attachment publicUrl is invalid");
      if (attachment.state === "QUARANTINED" && attachment.publicUrl !== undefined) throw new ComplaintDomainError("VALIDATION_ERROR", "quarantined attachment cannot have a public URL");
    }
    if (input.priority !== undefined && !["LOW", "NORMAL", "HIGH", "URGENT"].includes(input.priority)) throw new ComplaintDomainError("VALIDATION_ERROR", "priority is invalid");
    if (input.riskLevel !== undefined && !["STANDARD", "SENSITIVE", "HIGH"].includes(input.riskLevel)) throw new ComplaintDomainError("VALIDATION_ERROR", "riskLevel is invalid");
    if (input.idempotencyKey.length < 8 || input.idempotencyKey.length > 255 || CONTROL_PATTERN.test(input.idempotencyKey)) throw new ComplaintDomainError("VALIDATION_ERROR", "idempotencyKey is invalid");
  }

  private validateLocation(location: ComplaintLocation): void {
    if (location.text !== undefined) assertText(location.text, "location.text", 1000);
    const hasLatitude = location.latitude !== undefined;
    const hasLongitude = location.longitude !== undefined;
    if (hasLatitude !== hasLongitude) throw new ComplaintDomainError("VALIDATION_ERROR", "latitude and longitude must be supplied together");
    if (hasLatitude && (!Number.isFinite(location.latitude) || location.latitude! < -90 || location.latitude! > 90)) throw new ComplaintDomainError("VALIDATION_ERROR", "latitude is invalid");
    if (hasLongitude && (!Number.isFinite(location.longitude) || location.longitude! < -180 || location.longitude! > 180)) throw new ComplaintDomainError("VALIDATION_ERROR", "longitude is invalid");
  }

  private validateTransitionRequirements(record: ComplaintRecord, input: ComplaintTransitionInput): void {
    if (input.toStatus === "ASSIGNED") {
      if (!input.assignedDepartmentId && !record.assignedDepartmentId) throw new ComplaintDomainError("VALIDATION_ERROR", "assigned department is required");
      if (input.assignedDepartmentId) assertUuid(input.assignedDepartmentId, "assignedDepartmentId");
      if (input.assignedMembershipId) assertUuid(input.assignedMembershipId, "assignedMembershipId");
    }
    if (input.toStatus === "WAITING_FOR_CITIZEN") assertReason(input.publicRequest, "publicRequest");
    if (input.toStatus === "RESOLVED") assertReason(input.resolutionSummary, "resolutionSummary");
    if (input.toStatus === "OUT_OF_JURISDICTION" || input.toStatus === "CANCELLED" || (input.toStatus === "IN_PROGRESS" && ["RESOLVED", "CLOSED"].includes(record.canonicalStatus))) assertReason(input.reason);
  }

  private requireRecord(tenantId: string, complaintId: string): StoredComplaint {
    assertUuid(tenantId, "tenantId");
    assertUuid(complaintId, "complaintId");
    const record = this.records.get(complaintId);
    if (!record || record.tenantId !== tenantId) throw new ComplaintDomainError("NOT_FOUND", "complaint was not found");
    return record;
  }

  private reserveSequence(tenantId: string, year: number): number {
    void year;
    const key = tenantId;
    const next = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, next);
    return next;
  }

  private prefix(tenantId: string): string {
    const prefix = this.prefixForTenant(tenantId);
    if (!PREFIX_PATTERN.test(prefix)) throw new ComplaintDomainError("VALIDATION_ERROR", "tenant complaint prefix is invalid");
    return prefix;
  }

  private publicView(record: StoredComplaint): ComplaintPublicView {
    const waitingEntry = [...record.timeline].reverse().find((entry) => entry.toStatus === "WAITING_FOR_CITIZEN" && entry.publicVisible);
    const departmentPublicName = record.assignedDepartmentId ? this.departmentPublicNameForId(record.assignedDepartmentId) : undefined;
    const surveyKey = `${record.tenantId}:${record.id}:${record.lineUserId}`;
    return {
      id: record.id,
      complaintNo: record.complaintNo,
      title: record.title,
      ...(record.categoryId ? { categoryId: record.categoryId } : {}),
      canonicalStatus: record.canonicalStatus,
      statusLabel: COMPLAINT_STATUS_LABELS[record.canonicalStatus],
      priority: record.priority,
      submittedAt: record.createdAt,
      ...(record.location ? { location: { ...record.location } } : {}),
      ...(departmentPublicName ? { departmentPublicName } : {}),
      ...(record.firstResponseAt ? { firstResponseAt: record.firstResponseAt } : {}),
      ...(record.resolvedAt ? { resolvedAt: record.resolvedAt } : {}),
      ...(record.closedAt ? { closedAt: record.closedAt } : {}),
      publicTimeline: record.timeline.filter((entry) => entry.publicVisible).map((entry) => ({
        id: entry.id,
        fromStatus: entry.fromStatus,
        toStatus: entry.toStatus,
        statusLabel: COMPLAINT_STATUS_LABELS[entry.toStatus],
        occurredAt: entry.occurredAt,
      })),
      publicAttachments: record.attachments.filter((attachment) => attachment.state === "READY").map(({ state: _state, ...attachment }) => ({ ...attachment })),
      nextExpectedStep: COMPLAINT_NEXT_STEPS[record.canonicalStatus],
      ...(record.canonicalStatus === "WAITING_FOR_CITIZEN" && waitingEntry?.reason ? { requestForInformation: waitingEntry.reason } : {}),
      survey: { eligible: ["RESOLVED", "CLOSED"].includes(record.canonicalStatus), submitted: this.surveys.has(surveyKey) },
      publicComments: record.comments.filter((comment) => comment.visibility === "PUBLIC").map(({ tenantId: _tenantId, complaintId: _complaintId, authorType: _authorType, authorId: _authorId, visibility: _visibility, rowVersion: _rowVersion, ...comment }) => ({ ...comment })),
    };
  }
}
