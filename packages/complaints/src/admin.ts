import { ComplaintDomainError, COMPLAINT_STATES, COMPLAINT_STATUS_LABELS, InMemoryComplaintRepository, isAllowedComplaintTransition, type ComplaintActorRole, type ComplaintAssignmentInput, type ComplaintAuditEntry, type ComplaintComment, type ComplaintCommentInput, type ComplaintInternalView, type ComplaintPriority, type ComplaintRecord, type ComplaintState, type ComplaintTransitionInput } from "./complaint";

export type ComplaintAdminRole = "STAFF" | "DEPARTMENT_HEAD" | "TENANT_ADMIN";
export type ComplaintAdminQueue = "MINE" | "DEPARTMENT" | "TENANT";
export type ComplaintAdminSort = "UPDATED_DESC" | "CREATED_DESC" | "PRIORITY_DESC";

export type ComplaintAdminContext = {
  tenantId: string;
  accountId: string;
  role: ComplaintAdminRole;
  departmentIds: readonly string[];
};

export type ComplaintAdminListQuery = {
  limit?: number;
  cursor?: string;
  search?: string;
  status?: ComplaintState | "ALL";
  priority?: ComplaintPriority | "ALL";
  departmentId?: string;
  queue?: ComplaintAdminQueue;
  sort?: ComplaintAdminSort;
};

export type ComplaintAdminView = {
  id: string;
  complaintNo: string;
  title: string;
  categoryId?: string;
  canonicalStatus: ComplaintState;
  statusLabel: string;
  priority: ComplaintPriority;
  departmentId?: string;
  departmentName?: string;
  assignedToCurrentUser: boolean;
  hasAssignee: boolean;
  createdAt: string;
  updatedAt: string;
  sla: { state: "NOT_CONFIGURED" };
};

export type ComplaintAdminPage = {
  items: readonly ComplaintAdminView[];
  nextCursor?: string;
  hasMore: boolean;
  facets: {
    total: number;
    active: number;
    closed: number;
    urgent: number;
  };
};

type AdminListOptions = {
  departmentNameForId?: (departmentId: string) => string | undefined;
};

export type ComplaintAdminDetail = ComplaintAdminView & {
  description: string;
  riskLevel: "STANDARD" | "SENSITIVE" | "HIGH";
  location?: { text?: string; latitude?: number; longitude?: number };
  rowVersion: number;
  attachments: readonly {
    id: string;
    fileName: string;
    contentType: string;
    state: "QUARANTINED" | "READY";
    caption?: string;
    publicUrl?: string;
  }[];
  timeline: readonly {
    id: string;
    fromStatus: ComplaintState | null;
    toStatus: ComplaintState;
    statusLabel: string;
    reason: string;
    publicVisible: boolean;
    actorType: string;
    occurredAt: string;
  }[];
  comments: readonly {
    id: string;
    body: string;
    visibility: "PUBLIC" | "INTERNAL";
    authorType: string;
    createdAt: string;
    updatedAt: string;
  }[];
  auditTrail: readonly {
    id: string;
    action: ComplaintAuditEntry["action"];
    actorType: string;
    actorRole: string;
    beforeVersion: number;
    afterVersion: number;
    fromStatus?: ComplaintState;
    toStatus?: ComplaintState;
    summary: string;
    occurredAt: string;
  }[];
  allowedTransitions: readonly ComplaintState[];
  permissions: {
    canAssign: boolean;
    canTransition: boolean;
    canAddInternalNote: boolean;
    canAddPublicUpdate: boolean;
  };
};

const PRIORITY_RANK: Readonly<Record<ComplaintPriority, number>> = { URGENT: 4, HIGH: 3, NORMAL: 2, LOW: 1 };
const CLOSED_STATES: readonly ComplaintState[] = ["CLOSED", "CANCELLED", "OUT_OF_JURISDICTION"];

const cloneView = (view: ComplaintAdminView): ComplaintAdminView => ({ ...view, sla: { ...view.sla } });

const isClosed = (status: ComplaintState): boolean => CLOSED_STATES.includes(status);

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) return 0;
  const offset = Number(cursor);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000) throw new ComplaintDomainError("VALIDATION_ERROR", "cursor is invalid");
  return offset;
};

const project = (view: ComplaintInternalView, context: ComplaintAdminContext, options: AdminListOptions): ComplaintAdminView => ({
  id: view.record.id,
  complaintNo: view.record.complaintNo,
  title: view.record.title,
  ...(view.record.categoryId ? { categoryId: view.record.categoryId } : {}),
  canonicalStatus: view.record.canonicalStatus,
  statusLabel: COMPLAINT_STATUS_LABELS[view.record.canonicalStatus],
  priority: view.record.priority,
  ...(view.record.assignedDepartmentId ? { departmentId: view.record.assignedDepartmentId } : {}),
  ...(view.record.assignedDepartmentId && options.departmentNameForId?.(view.record.assignedDepartmentId) ? { departmentName: options.departmentNameForId(view.record.assignedDepartmentId) } : {}),
  assignedToCurrentUser: view.record.assignedMembershipId === context.accountId,
  hasAssignee: Boolean(view.record.assignedMembershipId),
  createdAt: view.record.createdAt,
  updatedAt: view.record.updatedAt,
  sla: { state: "NOT_CONFIGURED" },
});

export const buildAdminComplaintPage = (
  records: readonly ComplaintInternalView[],
  context: ComplaintAdminContext,
  query: ComplaintAdminListQuery = {},
  options: AdminListOptions = {},
): ComplaintAdminPage => {
  const limit = query.limit ?? 25;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new ComplaintDomainError("VALIDATION_ERROR", "limit must be between 1 and 100");
  const offset = parseCursor(query.cursor);
  const queue = query.queue ?? "DEPARTMENT";
  const sort = query.sort ?? "UPDATED_DESC";
  if (!["MINE", "DEPARTMENT", "TENANT"].includes(queue)) throw new ComplaintDomainError("VALIDATION_ERROR", "queue is invalid");
  if (!["UPDATED_DESC", "CREATED_DESC", "PRIORITY_DESC"].includes(sort)) throw new ComplaintDomainError("VALIDATION_ERROR", "sort is invalid");
  if (context.role !== "TENANT_ADMIN" && queue === "TENANT") throw new ComplaintDomainError("FORBIDDEN", "tenant queue is not available for this role");
  if (query.status !== undefined && query.status !== "ALL" && !Object.keys(COMPLAINT_STATUS_LABELS).includes(query.status)) throw new ComplaintDomainError("VALIDATION_ERROR", "status is invalid");
  if (query.priority !== undefined && query.priority !== "ALL" && !Object.keys(PRIORITY_RANK).includes(query.priority)) throw new ComplaintDomainError("VALIDATION_ERROR", "priority is invalid");
  if (query.search !== undefined && query.search.length > 200) throw new ComplaintDomainError("VALIDATION_ERROR", "search is too long");

  const allowedDepartments = new Set(context.departmentIds);
  const scopedRecords = records.filter((view) => {
    if (view.record.tenantId !== context.tenantId) return false;
    if (context.role === "TENANT_ADMIN") return true;
    return Boolean(view.record.assignedDepartmentId && allowedDepartments.has(view.record.assignedDepartmentId));
  });
  const baseFacets = {
    total: scopedRecords.length,
    active: scopedRecords.filter((view) => !isClosed(view.record.canonicalStatus)).length,
    closed: scopedRecords.filter((view) => isClosed(view.record.canonicalStatus)).length,
    urgent: scopedRecords.filter((view) => view.record.priority === "URGENT").length,
  };
  const filtered = scopedRecords.filter((view) => {
    if (queue === "MINE" && view.record.assignedMembershipId !== context.accountId) return false;
    if (queue === "DEPARTMENT" && context.role !== "TENANT_ADMIN" && !allowedDepartments.has(view.record.assignedDepartmentId ?? "")) return false;
    if (queue === "TENANT" && context.role !== "TENANT_ADMIN") return false;
    if (query.departmentId !== undefined && view.record.assignedDepartmentId !== query.departmentId) return false;
    if (query.status && query.status !== "ALL" && view.record.canonicalStatus !== query.status) return false;
    if (query.priority && query.priority !== "ALL" && view.record.priority !== query.priority) return false;
    if (query.search?.trim()) {
      const needle = query.search.trim().toLocaleLowerCase();
      if (!`${view.record.complaintNo} ${view.record.title}`.toLocaleLowerCase().includes(needle)) return false;
    }
    return true;
  });
  const sorted = [...filtered].sort((left, right) => {
    if (sort === "PRIORITY_DESC") return PRIORITY_RANK[right.record.priority] - PRIORITY_RANK[left.record.priority] || right.record.updatedAt.localeCompare(left.record.updatedAt) || right.record.id.localeCompare(left.record.id);
    const field = sort === "CREATED_DESC" ? "createdAt" : "updatedAt";
    return right.record[field].localeCompare(left.record[field]) || right.record.id.localeCompare(left.record.id);
  });
  const page = sorted.slice(offset, offset + limit).map((view) => project(view, context, options));
  return {
    items: page.map(cloneView),
    ...(offset + page.length < sorted.length ? { nextCursor: String(offset + page.length) } : {}),
    hasMore: offset + page.length < sorted.length,
    facets: baseFacets,
  };
};

const adminActorRole = (context: ComplaintAdminContext): ComplaintActorRole => context.role;

const canSeeRecord = (record: ComplaintInternalView["record"], context: ComplaintAdminContext): boolean =>
  record.tenantId === context.tenantId && (context.role === "TENANT_ADMIN" || Boolean(record.assignedDepartmentId && context.departmentIds.includes(record.assignedDepartmentId)));

const requireAccessibleRecord = (repository: InMemoryComplaintRepository, context: ComplaintAdminContext, complaintId: string): ComplaintInternalView => {
  const view = repository.getInternalView(context.tenantId, complaintId);
  if (!view || !canSeeRecord(view.record, context)) throw new ComplaintDomainError("NOT_FOUND", "complaint was not found");
  return view;
};

const projectDetail = (view: ComplaintInternalView, context: ComplaintAdminContext, options: AdminListOptions): ComplaintAdminDetail => {
  const base = project(view, context, options);
  const actorRole = adminActorRole(context);
  const allowedTransitions = COMPLAINT_STATES.filter((status) => isAllowedComplaintTransition(view.record.canonicalStatus, status, actorRole));
  return {
    ...base,
    description: view.record.description,
    riskLevel: view.record.riskLevel,
    ...(view.record.location ? { location: { ...view.record.location } } : {}),
    rowVersion: view.record.rowVersion,
    attachments: view.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.fileName,
      contentType: attachment.contentType,
      state: attachment.state,
      ...(attachment.caption ? { caption: attachment.caption } : {}),
      ...(attachment.state === "READY" && attachment.publicUrl ? { publicUrl: attachment.publicUrl } : {}),
    })),
    timeline: view.timeline.map((entry) => ({
      id: entry.id,
      fromStatus: entry.fromStatus,
      toStatus: entry.toStatus,
      statusLabel: COMPLAINT_STATUS_LABELS[entry.toStatus],
      reason: entry.reason,
      publicVisible: entry.publicVisible,
      actorType: entry.actorType,
      occurredAt: entry.occurredAt,
    })),
    comments: view.comments.map((comment) => ({
      id: comment.id,
      body: comment.body,
      visibility: comment.visibility,
      authorType: comment.authorType,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
    })),
    auditTrail: view.auditTrail.map((entry) => ({
      id: entry.id,
      action: entry.action,
      actorType: entry.actorType,
      actorRole: entry.actorRole,
      beforeVersion: entry.beforeVersion,
      afterVersion: entry.afterVersion,
      ...(entry.fromStatus ? { fromStatus: entry.fromStatus } : {}),
      ...(entry.toStatus ? { toStatus: entry.toStatus } : {}),
      summary: entry.summary,
      occurredAt: entry.occurredAt,
    })),
    allowedTransitions,
    permissions: {
      canAssign: context.role === "DEPARTMENT_HEAD" || context.role === "TENANT_ADMIN",
      canTransition: allowedTransitions.length > 0,
      canAddInternalNote: true,
      canAddPublicUpdate: true,
    },
  };
};

export const getAdminComplaintDetail = (
  repository: InMemoryComplaintRepository,
  context: ComplaintAdminContext,
  complaintId: string,
  options: AdminListOptions = {},
): ComplaintAdminDetail => projectDetail(requireAccessibleRecord(repository, context, complaintId), context, options);

const assertMutationScope = (view: ComplaintInternalView, context: ComplaintAdminContext): void => {
  if (!canSeeRecord(view.record, context)) throw new ComplaintDomainError("NOT_FOUND", "complaint was not found");
};

export const assignAdminComplaint = (repository: InMemoryComplaintRepository, context: ComplaintAdminContext, input: ComplaintAssignmentInput): ComplaintRecord => {
  const view = requireAccessibleRecord(repository, context, input.complaintId);
  if (context.role !== "DEPARTMENT_HEAD" && context.role !== "TENANT_ADMIN") throw new ComplaintDomainError("FORBIDDEN", "role cannot assign complaints");
  if (context.role !== "TENANT_ADMIN" && !context.departmentIds.includes(input.departmentId)) throw new ComplaintDomainError("FORBIDDEN", "department is outside the actor scope");
  assertMutationScope(view, context);
  return repository.assign(input);
};

export const forwardAdminComplaint = (repository: InMemoryComplaintRepository, context: ComplaintAdminContext, input: ComplaintAssignmentInput): ComplaintRecord => {
  if (input.membershipId) throw new ComplaintDomainError("VALIDATION_ERROR", "forward cannot include a membership assignment");
  return assignAdminComplaint(repository, context, input);
};

export const transitionAdminComplaint = (repository: InMemoryComplaintRepository, context: ComplaintAdminContext, input: ComplaintTransitionInput): ComplaintRecord => {
  const view = requireAccessibleRecord(repository, context, input.complaintId);
  assertMutationScope(view, context);
  if (input.actor.role !== context.role) throw new ComplaintDomainError("FORBIDDEN", "actor role does not match the session");
  return repository.transition(input);
};

export const addAdminComplaintComment = (repository: InMemoryComplaintRepository, context: ComplaintAdminContext, input: ComplaintCommentInput): ComplaintComment => {
  const view = requireAccessibleRecord(repository, context, input.complaintId);
  assertMutationScope(view, context);
  if (input.author.type === "CITIZEN" || input.author.role !== context.role) throw new ComplaintDomainError("FORBIDDEN", "citizen or mismatched actor cannot use the admin composer");
  return repository.addComment(input);
};
