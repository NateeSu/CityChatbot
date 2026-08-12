import { createHash } from "node:crypto";

import {
  InMemoryKnowledgeRepository,
  KnowledgeDomainError,
  type KnowledgeDocumentVersion,
  type KnowledgeVisibility,
} from "./documents";
import { buildIndexGeneration, type IndexChunk, type IndexGeneration } from "./indexer";
import { normalizeSearchText, parseDocument, type SourceLocator } from "./parsers";

export const FAQ_CANDIDATE_STATUSES = [
  "DRAFT",
  "PENDING_OWNER_REVIEW",
  "PENDING_COORDINATOR_APPROVAL",
  "APPROVED",
  "PUBLISHED",
  "CONFLICT",
  "REJECTED",
  "REVOKED",
] as const;
export type FaqCandidateStatus = (typeof FAQ_CANDIDATE_STATUSES)[number];

export const FAQ_DUPLICATE_RESULTS = ["CLEAR", "DUPLICATE", "CONFLICT"] as const;
export type FaqDuplicateResult = (typeof FAQ_DUPLICATE_RESULTS)[number];
export type FaqSourceType = "TICKET_MESSAGE" | "KNOWLEDGE_DOCUMENT" | "MANUAL";

export type FaqSourceLineage = {
  sourceType: FaqSourceType;
  ticketId?: string;
  messageId?: string;
  sourceEventId?: string;
  retrievalTraceId?: string;
  evidenceIds: string[];
  sourceHash: string;
  capturedAt: string;
};

export type FaqDuplicateCheck = {
  status: FaqDuplicateResult;
  checkedAt: string;
  matches: Array<{ candidateId: string; departmentId: string; reason: "SAME_ANSWER" | "DIFFERENT_ANSWER" | "CROSS_DEPARTMENT" }>;
};

export type FaqCandidate = {
  id: string;
  tenantId: string;
  ticketId?: string;
  sourceMessageId?: string;
  source: FaqSourceLineage;
  question: string;
  answer: string;
  departmentId: string;
  knowledgeCategoryId: string;
  visibility: KnowledgeVisibility;
  effectiveFrom?: string;
  effectiveUntil?: string;
  effectiveDateUnknown: boolean;
  privacyReviewed: boolean;
  duplicateCheck: FaqDuplicateCheck;
  status: FaqCandidateStatus;
  createdBy: string;
  ownerReviewedBy?: string;
  ownerReviewedAt?: string;
  ownerReviewReason?: string;
  coordinatorApprovedBy?: string;
  coordinatorApprovedAt?: string;
  documentId?: string;
  documentVersionId?: string;
  indexGenerationId?: string;
  revokedBy?: string;
  revokedAt?: string;
  revokedReason?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectedReason?: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type FaqSourceRecord = {
  tenantId: string;
  ticketId: string;
  messageId: string;
  eventId: string;
  authorType: "CITIZEN" | "BOT" | "STAFF" | "SYSTEM";
  visibility: "PUBLIC" | "INTERNAL";
  isAiDraft: boolean;
  body: string;
};

export type FaqSourceReader = (tenantId: string, ticketId: string, messageId: string) => FaqSourceRecord | undefined;

export type FaqCandidateStore = {
  get(tenantId: string, candidateId: string): FaqCandidate | undefined;
  list(tenantId: string): readonly FaqCandidate[];
  append(candidate: FaqCandidate): void;
  update(candidate: FaqCandidate): void;
  getIdempotency(tenantId: string, action: string, key: string): { fingerprint: string; candidateId: string } | undefined;
  setIdempotency(tenantId: string, action: string, key: string, value: { fingerprint: string; candidateId: string }): void;
};

type FaqIdempotencyRecord = { fingerprint: string; candidateId: string };

const cloneSource = (source: FaqSourceLineage): FaqSourceLineage => ({ ...source, evidenceIds: [...source.evidenceIds] });
const cloneDuplicateCheck = (check: FaqDuplicateCheck): FaqDuplicateCheck => ({
  ...check,
  matches: check.matches.map((match) => ({ ...match })),
});
const cloneCandidate = (candidate: FaqCandidate): FaqCandidate => ({
  ...candidate,
  source: cloneSource(candidate.source),
  duplicateCheck: cloneDuplicateCheck(candidate.duplicateCheck),
});

export class InMemoryFaqCandidateStore implements FaqCandidateStore {
  private readonly candidates = new Map<string, FaqCandidate>();
  private readonly idempotency = new Map<string, FaqIdempotencyRecord>();

  get(tenantId: string, candidateId: string): FaqCandidate | undefined {
    const candidate = this.candidates.get(candidateId);
    if (!candidate || candidate.tenantId !== tenantId) return undefined;
    return cloneCandidate(candidate);
  }

  list(tenantId: string): readonly FaqCandidate[] {
    return [...this.candidates.values()]
      .filter((candidate) => candidate.tenantId === tenantId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id))
      .map(cloneCandidate);
  }

  append(candidate: FaqCandidate): void {
    if (this.candidates.has(candidate.id)) throw new FaqCandidateError("CONFLICT", "candidate id already exists");
    this.candidates.set(candidate.id, cloneCandidate(candidate));
  }

  update(candidate: FaqCandidate): void {
    if (!this.candidates.has(candidate.id)) throw new FaqCandidateError("NOT_FOUND", "FAQ candidate was not found");
    this.candidates.set(candidate.id, cloneCandidate(candidate));
  }

  getIdempotency(tenantId: string, action: string, key: string): FaqIdempotencyRecord | undefined {
    const record = this.idempotency.get(`${tenantId}|${action}|${key}`);
    return record ? { ...record } : undefined;
  }

  setIdempotency(tenantId: string, action: string, key: string, value: FaqIdempotencyRecord): void {
    this.idempotency.set(`${tenantId}|${action}|${key}`, { ...value });
  }
}

export class FaqCandidateError extends Error {
  constructor(
    public readonly code:
      | "VALIDATION_ERROR"
      | "TENANT_BOUNDARY"
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "CONFLICT"
      | "VERSION_CONFLICT"
      | "IDEMPOTENCY_CONFLICT"
      | "INVALID_STATE"
      | "DUPLICATE"
      | "EFFECTIVE_DATE_REQUIRED"
      | "SOURCE_NOT_VERIFIED"
      | "PII_REVIEW_REQUIRED"
      | "INDEX_NOT_FOUND",
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "FaqCandidateError";
  }
}

export type FaqIndexEntry = {
  candidateId: string;
  tenantId: string;
  documentVersionId: string;
  indexGenerationId: string;
  question: string;
  answer: string;
  searchText: string;
  visibility: KnowledgeVisibility;
  ownerDepartmentId: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  sourceLocator: SourceLocator;
  sourceHash: string;
  indexedAt: string;
};

export type FaqIndexSnapshot = {
  id: string;
  tenantId: string;
  generation: number;
  state: "ACTIVE" | "RETIRED";
  reason: "PUBLISH" | "REVOKE" | "ROLLBACK";
  entries: FaqIndexEntry[];
  createdAt: string;
};

const cloneIndexEntry = (entry: FaqIndexEntry): FaqIndexEntry => ({ ...entry, sourceLocator: { ...entry.sourceLocator, sectionPath: [...entry.sourceLocator.sectionPath] } });
const cloneIndexSnapshot = (snapshot: FaqIndexSnapshot): FaqIndexSnapshot => ({ ...snapshot, entries: snapshot.entries.map(cloneIndexEntry) });

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

export class InMemoryFaqActiveIndex {
  private readonly snapshots = new Map<string, FaqIndexSnapshot>();
  private readonly activeByTenant = new Map<string, string>();
  private readonly generationByTenant = new Map<string, number>();

  activate(tenantId: string, entry: FaqIndexEntry, now: Date | string): FaqIndexSnapshot {
    if (entry.tenantId !== tenantId) throw new FaqCandidateError("TENANT_BOUNDARY", "index entry belongs to another tenant");
    const previous = this.activeSnapshot(tenantId);
    const entries = previous?.entries.filter((item) => item.candidateId !== entry.candidateId) ?? [];
    entries.push(cloneIndexEntry(entry));
    return this.commit(tenantId, entries, "PUBLISH", now);
  }

  deactivate(tenantId: string, candidateId: string, reason: "REVOKE" | "ROLLBACK", now: Date | string): FaqIndexSnapshot {
    const previous = this.activeSnapshot(tenantId);
    const entries = previous?.entries.filter((item) => item.candidateId !== candidateId) ?? [];
    return this.commit(tenantId, entries, reason, now);
  }

  activeSnapshot(tenantId: string): FaqIndexSnapshot | undefined {
    const activeId = this.activeByTenant.get(tenantId);
    if (!activeId) return undefined;
    const snapshot = this.snapshots.get(activeId);
    return snapshot ? cloneIndexSnapshot(snapshot) : undefined;
  }

  listSnapshots(tenantId: string): readonly FaqIndexSnapshot[] {
    return [...this.snapshots.values()]
      .filter((snapshot) => snapshot.tenantId === tenantId)
      .sort((left, right) => right.generation - left.generation || right.id.localeCompare(left.id))
      .map(cloneIndexSnapshot);
  }

  listSearchable(tenantId: string, query: string, options: { at?: Date | string; audience?: "CITIZEN" | "STAFF"; departmentId?: string } = {}): FaqIndexEntry[] {
    const snapshot = this.activeSnapshot(tenantId);
    if (!snapshot) return [];
    const at = toIso(options.at ?? new Date(), "at");
    const normalizedQuery = normalizeSearchText(query).toLocaleLowerCase("th-TH");
    return snapshot.entries
      .filter((entry) => (entry.effectiveFrom === undefined || entry.effectiveFrom <= at) && (entry.effectiveUntil === undefined || entry.effectiveUntil > at))
      .filter((entry) => options.audience === "STAFF" || entry.visibility === "PUBLIC")
      .filter((entry) => options.audience !== "STAFF" || entry.visibility === "PUBLIC" || entry.ownerDepartmentId === options.departmentId)
      .filter((entry) => normalizedQuery.length === 0 || entry.searchText.includes(normalizedQuery))
      .sort((left, right) => {
        const leftExact = left.question.toLocaleLowerCase("th-TH") === normalizedQuery ? 1 : 0;
        const rightExact = right.question.toLocaleLowerCase("th-TH") === normalizedQuery ? 1 : 0;
        return rightExact - leftExact || left.candidateId.localeCompare(right.candidateId);
      })
      .map(cloneIndexEntry);
  }

  private commit(tenantId: string, entries: FaqIndexEntry[], reason: FaqIndexSnapshot["reason"], now: Date | string): FaqIndexSnapshot {
    const timestamp = toIso(now, "now");
    const previousId = this.activeByTenant.get(tenantId);
    if (previousId) {
      const previous = this.snapshots.get(previousId);
      if (previous) previous.state = "RETIRED";
    }
    const generation = (this.generationByTenant.get(tenantId) ?? 0) + 1;
    this.generationByTenant.set(tenantId, generation);
    const id = `faq-index-${hash(`${tenantId}|${generation}|${JSON.stringify(entries.map((entry) => [entry.candidateId, entry.documentVersionId]))}`).slice(0, 32)}`;
    const snapshot: FaqIndexSnapshot = {
      id,
      tenantId,
      generation,
      state: "ACTIVE",
      reason,
      entries: entries.map(cloneIndexEntry),
      createdAt: timestamp,
    };
    this.snapshots.set(id, snapshot);
    this.activeByTenant.set(tenantId, id);
    return cloneIndexSnapshot(snapshot);
  }
}

export type FaqMutationResult = {
  candidate: FaqCandidate;
  documentVersion?: KnowledgeDocumentVersion;
  indexSnapshot?: FaqIndexSnapshot;
  idempotentReplay: boolean;
};

export type ProposeFaqInput = {
  tenantId: string;
  ticketId?: string;
  sourceMessageId?: string;
  sourceType?: FaqSourceType;
  sourceEventId?: string;
  retrievalTraceId?: string;
  evidenceIds: readonly string[];
  question: string;
  answer: string;
  departmentId: string;
  knowledgeCategoryId: string;
  visibility: KnowledgeVisibility;
  effectiveFrom?: Date | string | null;
  effectiveUntil?: Date | string | null;
  effectiveDateUnknown?: boolean;
  privacyReviewed: boolean;
  createdBy: string;
  idempotencyKey: string;
  now?: Date | string;
};

export type EditFaqInput = {
  tenantId: string;
  candidateId: string;
  expectedVersion: number;
  question?: string;
  answer?: string;
  departmentId?: string;
  knowledgeCategoryId?: string;
  visibility?: KnowledgeVisibility;
  effectiveFrom?: Date | string | null;
  effectiveUntil?: Date | string | null;
  effectiveDateUnknown?: boolean;
  privacyReviewed?: boolean;
  actorId: string;
  idempotencyKey: string;
  now?: Date | string;
};

export type ReviewFaqInput = {
  tenantId: string;
  candidateId: string;
  expectedVersion: number;
  reviewerId: string;
  reviewerDepartmentIds: readonly string[];
  decision: "APPROVE" | "REJECT";
  reason: string;
  idempotencyKey: string;
  now?: Date | string;
};

export type ApproveFaqInput = {
  tenantId: string;
  candidateId: string;
  expectedVersion: number;
  coordinatorId: string;
  confirmUnknownEffectiveDate?: boolean;
  idempotencyKey: string;
  now?: Date | string;
};

export type PublishFaqInput = {
  tenantId: string;
  candidateId: string;
  expectedVersion: number;
  actorId: string;
  idempotencyKey: string;
  now?: Date | string;
};

export type RevokeFaqInput = {
  tenantId: string;
  candidateId: string;
  expectedVersion: number;
  actorId: string;
  reason: string;
  rollback?: boolean;
  idempotencyKey: string;
  now?: Date | string;
};

const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const PII_PATTERN = /(?:line[_ -]?user[_ -]?id|system[_ -]?prompt|api[_ -]?key|sk-[a-z0-9_-]{12,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:^|\D)0\d{8,9}(?:\D|$))/i;

const toIso = (value: Date | string, field: string): string => {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new FaqCandidateError("VALIDATION_ERROR", `${field} must be a valid timestamp`);
  return parsed.toISOString();
};

const requireText = (value: unknown, field: string, max: number): string => {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > max || CONTROL_PATTERN.test(value)) {
    throw new FaqCandidateError("VALIDATION_ERROR", `${field} is invalid`);
  }
  return value.trim();
};

const requireKey = (value: unknown, field: string): string => requireText(value, field, 255);

const validateVisibility = (value: KnowledgeVisibility): KnowledgeVisibility => {
  if (value !== "PUBLIC" && value !== "INTERNAL" && value !== "RESTRICTED") throw new FaqCandidateError("VALIDATION_ERROR", "visibility is invalid");
  return value;
};

const normalizeQuestion = (value: string): string => normalizeSearchText(value).toLocaleLowerCase("th-TH").replace(/[^\p{L}\p{N}]+/gu, "");
const normalizeAnswer = (value: string): string => normalizeSearchText(value).toLocaleLowerCase("th-TH");
const fingerprint = (tenantId: string, question: string, answer: string): string => hash(`${tenantId}|${normalizeQuestion(question)}|${normalizeAnswer(answer)}`);

const validateEffectiveWindow = (input: { effectiveFrom?: Date | string | null; effectiveUntil?: Date | string | null; effectiveDateUnknown?: boolean }): { effectiveFrom?: string; effectiveUntil?: string; effectiveDateUnknown: boolean } => {
  const effectiveFrom = input.effectiveFrom === null || input.effectiveFrom === undefined ? undefined : toIso(input.effectiveFrom, "effectiveFrom");
  const effectiveUntil = input.effectiveUntil === null || input.effectiveUntil === undefined ? undefined : toIso(input.effectiveUntil, "effectiveUntil");
  const effectiveDateUnknown = input.effectiveDateUnknown === true;
  if (effectiveDateUnknown && (effectiveFrom !== undefined || effectiveUntil !== undefined)) throw new FaqCandidateError("VALIDATION_ERROR", "unknown effective date cannot include timestamps");
  if (!effectiveDateUnknown && effectiveFrom === undefined && effectiveUntil === undefined) throw new FaqCandidateError("EFFECTIVE_DATE_REQUIRED", "effective date or explicit unknown confirmation is required");
  if (effectiveFrom && effectiveUntil && effectiveUntil <= effectiveFrom) throw new FaqCandidateError("VALIDATION_ERROR", "effectiveUntil must be after effectiveFrom");
  return { ...(effectiveFrom ? { effectiveFrom } : {}), ...(effectiveUntil ? { effectiveUntil } : {}), effectiveDateUnknown };
};

const cloneKnowledgeError = (error: unknown): never => {
  if (error instanceof KnowledgeDomainError) throw new FaqCandidateError(error.code === "TENANT_BOUNDARY" ? "TENANT_BOUNDARY" : error.code === "NOT_FOUND" ? "NOT_FOUND" : "CONFLICT", error.message);
  throw error;
};

const faqMarkdown = (candidate: Pick<FaqCandidate, "question" | "answer">): string => `# FAQ\n\nquestion: ${candidate.question}\n\nanswer: ${candidate.answer}\n`;

const faqSourceLocator = (chunk: IndexChunk): SourceLocator => ({ ...chunk.sourceLocator, sectionPath: [...chunk.sourceLocator.sectionPath] });

export class FaqCandidateService {
  readonly store: FaqCandidateStore;
  readonly knowledgeRepository: InMemoryKnowledgeRepository;
  readonly index: InMemoryFaqActiveIndex;
  private readonly clock: () => Date;
  private readonly sourceReader?: FaqSourceReader;

  constructor(input: {
    store?: FaqCandidateStore;
    knowledgeRepository?: InMemoryKnowledgeRepository;
    index?: InMemoryFaqActiveIndex;
    sourceReader?: FaqSourceReader;
    clock?: () => Date;
  } = {}) {
    this.store = input.store ?? new InMemoryFaqCandidateStore();
    this.knowledgeRepository = input.knowledgeRepository ?? new InMemoryKnowledgeRepository(input.clock);
    this.index = input.index ?? new InMemoryFaqActiveIndex();
    this.clock = input.clock ?? (() => new Date());
    this.sourceReader = input.sourceReader;
  }

  propose(input: ProposeFaqInput): FaqMutationResult {
    const now = toIso(input.now ?? this.clock(), "now");
    const tenantId = requireKey(input.tenantId, "tenantId");
    const idempotencyKey = requireKey(input.idempotencyKey, "idempotencyKey");
    const question = requireText(input.question, "question", 4_000);
    const answer = requireText(input.answer, "answer", 4_000);
    const departmentId = requireKey(input.departmentId, "departmentId");
    const knowledgeCategoryId = requireKey(input.knowledgeCategoryId, "knowledgeCategoryId");
    const createdBy = requireKey(input.createdBy, "createdBy");
    const sourceType = input.sourceType ?? "TICKET_MESSAGE";
    const effective = validateEffectiveWindow(input);
    validateVisibility(input.visibility);
    if (!Array.isArray(input.evidenceIds) || input.evidenceIds.length === 0 || input.evidenceIds.some((value) => typeof value !== "string" || value.trim().length === 0)) {
      throw new FaqCandidateError("SOURCE_NOT_VERIFIED", "at least one source evidence id is required");
    }
    if (PII_PATTERN.test(`${question}\n${answer}`) && input.privacyReviewed !== true) throw new FaqCandidateError("PII_REVIEW_REQUIRED", "candidate contains data that requires privacy review");
    if (sourceType === "TICKET_MESSAGE" && (!input.ticketId || !input.sourceMessageId)) throw new FaqCandidateError("VALIDATION_ERROR", "ticketId and sourceMessageId are required for a ticket source");
    const requestFingerprint = fingerprint(tenantId, question, answer) + `|${departmentId}|${knowledgeCategoryId}|${input.visibility}|${effective.effectiveFrom ?? ""}|${effective.effectiveUntil ?? ""}|${effective.effectiveDateUnknown}`;
    const replay = this.replay(tenantId, "PROPOSE", idempotencyKey, requestFingerprint);
    if (replay) return replay;

    let sourceEventId = input.sourceEventId;
    let sourceHash = hash(`${sourceType}|${input.ticketId ?? ""}|${input.sourceMessageId ?? ""}|${input.retrievalTraceId ?? ""}|${input.evidenceIds.join("|")}`);
    if (sourceType === "TICKET_MESSAGE") {
      const source = this.sourceReader?.(tenantId, input.ticketId!, input.sourceMessageId!);
      if (!source || source.tenantId !== tenantId || source.ticketId !== input.ticketId || source.messageId !== input.sourceMessageId || source.authorType !== "STAFF" || source.visibility !== "PUBLIC" || source.isAiDraft) {
        throw new FaqCandidateError("SOURCE_NOT_VERIFIED", "only an explicitly selected public staff message can be FAQ source");
      }
      sourceEventId = sourceEventId ?? source.eventId;
      sourceHash = hash(`${sourceHash}|${source.eventId}|${source.body}`);
    }
    if (!sourceEventId && sourceType !== "MANUAL") throw new FaqCandidateError("SOURCE_NOT_VERIFIED", "source event lineage is missing");
    const duplicateCheck = this.checkDuplicates(tenantId, question, answer, departmentId, now);
    const candidate: FaqCandidate = {
      id: crypto.randomUUID(),
      tenantId,
      ...(input.ticketId ? { ticketId: requireKey(input.ticketId, "ticketId") } : {}),
      ...(input.sourceMessageId ? { sourceMessageId: requireKey(input.sourceMessageId, "sourceMessageId") } : {}),
      source: {
        sourceType,
        ...(input.ticketId ? { ticketId: input.ticketId } : {}),
        ...(input.sourceMessageId ? { messageId: input.sourceMessageId } : {}),
        ...(sourceEventId ? { sourceEventId: requireKey(sourceEventId, "sourceEventId") } : {}),
        ...(input.retrievalTraceId ? { retrievalTraceId: requireKey(input.retrievalTraceId, "retrievalTraceId") } : {}),
        evidenceIds: [...input.evidenceIds].map((value) => requireKey(value, "evidenceId")),
        sourceHash,
        capturedAt: now,
      },
      question,
      answer,
      departmentId,
      knowledgeCategoryId,
      visibility: input.visibility,
      ...effective,
      privacyReviewed: input.privacyReviewed === true,
      duplicateCheck,
      status: duplicateCheck.status === "CONFLICT" ? "CONFLICT" : "PENDING_OWNER_REVIEW",
      createdBy,
      createdAt: now,
      updatedAt: now,
      rowVersion: 1,
    };
    this.store.append(candidate);
    this.store.setIdempotency(tenantId, "PROPOSE", idempotencyKey, { fingerprint: requestFingerprint, candidateId: candidate.id });
    return { candidate: cloneCandidate(candidate), idempotentReplay: false };
  }

  edit(input: EditFaqInput): FaqMutationResult {
    const now = toIso(input.now ?? this.clock(), "now");
    const actorId = requireKey(input.actorId, "actorId");
    const idempotencyKey = requireKey(input.idempotencyKey, "idempotencyKey");
    const candidate = this.require(input.tenantId, input.candidateId);
    const requestFingerprint = hash(JSON.stringify({ candidateId: candidate.id, expectedVersion: input.expectedVersion, question: input.question, answer: input.answer, departmentId: input.departmentId, knowledgeCategoryId: input.knowledgeCategoryId, visibility: input.visibility, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil, effectiveDateUnknown: input.effectiveDateUnknown, privacyReviewed: input.privacyReviewed }));
    const replay = this.replay(input.tenantId, "EDIT", idempotencyKey, requestFingerprint);
    if (replay) return replay;
    this.assertVersion(candidate, input.expectedVersion);
    if (candidate.status !== "DRAFT" && candidate.status !== "PENDING_OWNER_REVIEW" && candidate.status !== "CONFLICT") throw new FaqCandidateError("INVALID_STATE", "only an unreviewed FAQ can be edited");
    const question = input.question === undefined ? candidate.question : requireText(input.question, "question", 4_000);
    const answer = input.answer === undefined ? candidate.answer : requireText(input.answer, "answer", 4_000);
    const effective = validateEffectiveWindow({
      effectiveFrom: input.effectiveFrom === undefined ? candidate.effectiveFrom : input.effectiveFrom,
      effectiveUntil: input.effectiveUntil === undefined ? candidate.effectiveUntil : input.effectiveUntil,
      effectiveDateUnknown: input.effectiveDateUnknown === undefined ? candidate.effectiveDateUnknown : input.effectiveDateUnknown,
    });
    if (PII_PATTERN.test(`${question}\n${answer}`) && input.privacyReviewed !== true && !candidate.privacyReviewed) throw new FaqCandidateError("PII_REVIEW_REQUIRED", "candidate contains data that requires privacy review");
    candidate.question = question;
    candidate.answer = answer;
    candidate.departmentId = input.departmentId === undefined ? candidate.departmentId : requireKey(input.departmentId, "departmentId");
    candidate.knowledgeCategoryId = input.knowledgeCategoryId === undefined ? candidate.knowledgeCategoryId : requireKey(input.knowledgeCategoryId, "knowledgeCategoryId");
    candidate.visibility = input.visibility === undefined ? candidate.visibility : validateVisibility(input.visibility);
    candidate.effectiveFrom = effective.effectiveFrom;
    candidate.effectiveUntil = effective.effectiveUntil;
    candidate.effectiveDateUnknown = effective.effectiveDateUnknown;
    candidate.privacyReviewed = input.privacyReviewed === true || candidate.privacyReviewed;
    candidate.duplicateCheck = this.checkDuplicates(input.tenantId, question, answer, candidate.departmentId, now, candidate.id);
    candidate.status = candidate.duplicateCheck.status === "CONFLICT" ? "CONFLICT" : "PENDING_OWNER_REVIEW";
    candidate.ownerReviewedBy = undefined;
    candidate.ownerReviewedAt = undefined;
    candidate.ownerReviewReason = undefined;
    candidate.updatedAt = now;
    candidate.rowVersion += 1;
    this.store.update(candidate);
    this.store.setIdempotency(input.tenantId, "EDIT", idempotencyKey, { fingerprint: requestFingerprint, candidateId: candidate.id });
    return { candidate: cloneCandidate(candidate), idempotentReplay: false };
  }

  reviewOwner(input: ReviewFaqInput): FaqMutationResult {
    const now = toIso(input.now ?? this.clock(), "now");
    const reviewerId = requireKey(input.reviewerId, "reviewerId");
    const reason = requireText(input.reason, "reason", 2_000);
    const idempotencyKey = requireKey(input.idempotencyKey, "idempotencyKey");
    const candidate = this.require(input.tenantId, input.candidateId);
    const requestFingerprint = hash(JSON.stringify({ candidateId: candidate.id, expectedVersion: input.expectedVersion, reviewerId, decision: input.decision, reason }));
    const replay = this.replay(input.tenantId, "REVIEW", idempotencyKey, requestFingerprint);
    if (replay) return replay;
    this.assertVersion(candidate, input.expectedVersion);
    if (candidate.status !== "PENDING_OWNER_REVIEW") throw new FaqCandidateError("INVALID_STATE", "FAQ is not waiting for owner review");
    if (!input.reviewerDepartmentIds.includes(candidate.departmentId)) throw new FaqCandidateError("FORBIDDEN", "reviewer is outside the FAQ department scope");
    if (reviewerId === candidate.createdBy) throw new FaqCandidateError("FORBIDDEN", "proposal and owner review require separate actors");
    if (input.decision !== "APPROVE" && input.decision !== "REJECT") throw new FaqCandidateError("VALIDATION_ERROR", "owner decision is invalid");
    if (input.decision === "APPROVE") {
      this.assertDuplicateClear(candidate);
      candidate.status = "PENDING_COORDINATOR_APPROVAL";
      candidate.ownerReviewedBy = reviewerId;
      candidate.ownerReviewedAt = now;
      candidate.ownerReviewReason = reason;
    } else {
      candidate.status = "REJECTED";
      candidate.rejectedBy = reviewerId;
      candidate.rejectedAt = now;
      candidate.rejectedReason = reason;
    }
    candidate.updatedAt = now;
    candidate.rowVersion += 1;
    this.store.update(candidate);
    this.store.setIdempotency(input.tenantId, "REVIEW", idempotencyKey, { fingerprint: requestFingerprint, candidateId: candidate.id });
    return { candidate: cloneCandidate(candidate), idempotentReplay: false };
  }

  approveCoordinator(input: ApproveFaqInput): FaqMutationResult {
    const now = toIso(input.now ?? this.clock(), "now");
    const coordinatorId = requireKey(input.coordinatorId, "coordinatorId");
    const idempotencyKey = requireKey(input.idempotencyKey, "idempotencyKey");
    const candidate = this.require(input.tenantId, input.candidateId);
    const requestFingerprint = hash(JSON.stringify({ candidateId: candidate.id, expectedVersion: input.expectedVersion, coordinatorId, confirmUnknownEffectiveDate: input.confirmUnknownEffectiveDate }));
    const replay = this.replay(input.tenantId, "APPROVE", idempotencyKey, requestFingerprint);
    if (replay) return replay;
    this.assertVersion(candidate, input.expectedVersion);
    if (candidate.status !== "PENDING_COORDINATOR_APPROVAL") throw new FaqCandidateError("INVALID_STATE", "FAQ is not waiting for coordinator approval");
    if (candidate.ownerReviewedBy === coordinatorId || candidate.createdBy === coordinatorId) throw new FaqCandidateError("FORBIDDEN", "coordinator approval requires a third independent actor");
    this.assertDuplicateClear(candidate);
    if (!candidate.privacyReviewed) throw new FaqCandidateError("PII_REVIEW_REQUIRED", "privacy review is required before approval");
    if (candidate.effectiveDateUnknown && input.confirmUnknownEffectiveDate !== true) throw new FaqCandidateError("EFFECTIVE_DATE_REQUIRED", "unknown effective date requires coordinator confirmation");
    if (candidate.source.evidenceIds.length === 0 || (!candidate.source.sourceEventId && candidate.source.sourceType !== "MANUAL")) throw new FaqCandidateError("SOURCE_NOT_VERIFIED", "source lineage is incomplete");

    const sourceText = faqMarkdown(candidate);
    const sourceChecksum = hash(sourceText);
    let created: ReturnType<InMemoryKnowledgeRepository["createVersion"]>;
    try {
      created = this.knowledgeRepository.createVersion({
        tenantId: candidate.tenantId,
        sourceKey: `faq-${candidate.id}`,
        title: `FAQ: ${candidate.question.slice(0, 160)}`,
        originalFilename: `faq-${candidate.id}.md`,
        mimeType: "text/markdown",
        checksumSha256: sourceChecksum,
        sourceObjectKey: `tenant/${candidate.tenantId}/faq/${candidate.id}/v1.md`,
        ownerDepartmentId: candidate.departmentId,
        knowledgeCategoryId: candidate.knowledgeCategoryId,
        visibility: candidate.visibility,
        authorityLevel: 70,
        effectiveFrom: candidate.effectiveFrom,
        effectiveUntil: candidate.effectiveUntil,
        effectiveDateUnknown: candidate.effectiveDateUnknown,
        reviewDueAt: candidate.effectiveUntil ?? new Date(new Date(now).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        parserName: "citychatbot-faq-parser",
        parserVersion: "1.0.0",
        idempotencyKey: `faq-version-${candidate.id}`,
        now,
      });
      this.processKnowledgeVersion(candidate.tenantId, created.version.id, now);
      const approvedVersion = this.knowledgeRepository.approveVersion(candidate.tenantId, created.version.id, {
        approvedBy: coordinatorId,
        reason: `FAQ coordinator approval for ${candidate.id}`,
        ...(candidate.effectiveDateUnknown ? { confirmUnknownEffectiveDate: true } : {}),
        now,
      });
      candidate.documentId = created.document.id;
      candidate.documentVersionId = approvedVersion.id;
    } catch (error) {
      cloneKnowledgeError(error);
    }
    candidate.coordinatorApprovedBy = coordinatorId;
    candidate.coordinatorApprovedAt = now;
    candidate.status = "APPROVED";
    candidate.updatedAt = now;
    candidate.rowVersion += 1;
    this.store.update(candidate);
    this.store.setIdempotency(input.tenantId, "APPROVE", idempotencyKey, { fingerprint: requestFingerprint, candidateId: candidate.id });
    return { candidate: cloneCandidate(candidate), documentVersion: this.knowledgeRepository.getVersion(candidate.tenantId, candidate.documentVersionId!), idempotentReplay: false };
  }

  publish(input: PublishFaqInput): FaqMutationResult {
    const now = toIso(input.now ?? this.clock(), "now");
    const actorId = requireKey(input.actorId, "actorId");
    const idempotencyKey = requireKey(input.idempotencyKey, "idempotencyKey");
    const candidate = this.require(input.tenantId, input.candidateId);
    const requestFingerprint = hash(JSON.stringify({ candidateId: candidate.id, expectedVersion: input.expectedVersion, actorId }));
    const replay = this.replay(input.tenantId, "PUBLISH", idempotencyKey, requestFingerprint);
    if (replay) return replay;
    this.assertVersion(candidate, input.expectedVersion);
    if (candidate.status !== "APPROVED") {
      if (candidate.duplicateCheck.status !== "CLEAR") this.assertDuplicateClear(candidate);
      throw new FaqCandidateError("INVALID_STATE", "only an approved FAQ can be published");
    }
    this.assertDuplicateClear(candidate);
    if (!candidate.documentVersionId || !candidate.coordinatorApprovedBy || !candidate.coordinatorApprovedAt) throw new FaqCandidateError("SOURCE_NOT_VERIFIED", "approved FAQ has no document lineage");
    let version: KnowledgeDocumentVersion | undefined;
    let generation: IndexGeneration | undefined;
    try {
      version = this.knowledgeRepository.activateApprovedVersion(candidate.tenantId, candidate.documentVersionId, now);
      const parsed = parseDocument(new TextEncoder().encode(faqMarkdown(candidate)), { filename: `faq-${candidate.id}.md`, mimeType: "text/markdown" });
      generation = buildIndexGeneration({
        tenantId: candidate.tenantId,
        documentVersionId: version.id,
        versionState: version.state,
        approvalStatus: version.approvalStatus,
        visibility: candidate.visibility,
        ownerDepartmentId: candidate.departmentId,
        authorityLevel: 70,
        effectiveFrom: candidate.effectiveFrom,
        effectiveUntil: candidate.effectiveUntil,
        parsed,
        now,
      });
    } catch (error) {
      try {
        if (candidate.documentVersionId) this.knowledgeRepository.retireActiveVersion(candidate.tenantId, candidate.documentVersionId, now);
      } catch {
        // Keep the original error; the safe boundary is that the FAQ candidate is not marked published.
      }
      cloneKnowledgeError(error);
    }
    if (!version || !generation) throw new FaqCandidateError("CONFLICT", "FAQ publish transaction did not produce an active version and index generation");
    const faqChunk = generation.chunks.find((chunk) => chunk.chunkType === "ATOMIC_FAQ") ?? generation.chunks[0];
    if (!faqChunk) throw new FaqCandidateError("VALIDATION_ERROR", "FAQ produced no searchable chunk");
    const snapshot = this.index.activate(candidate.tenantId, {
      candidateId: candidate.id,
      tenantId: candidate.tenantId,
      documentVersionId: version.id,
      indexGenerationId: generation.id,
      question: candidate.question,
      answer: candidate.answer,
      searchText: normalizeSearchText(`${candidate.question}\n${candidate.answer}`).toLocaleLowerCase("th-TH"),
      visibility: candidate.visibility,
      ownerDepartmentId: candidate.departmentId,
      ...(candidate.effectiveFrom ? { effectiveFrom: candidate.effectiveFrom } : {}),
      ...(candidate.effectiveUntil ? { effectiveUntil: candidate.effectiveUntil } : {}),
      sourceLocator: faqSourceLocator(faqChunk),
      sourceHash: faqChunk.sourceHash,
      indexedAt: now,
    }, now);
    candidate.indexGenerationId = generation.id;
    candidate.status = "PUBLISHED";
    candidate.updatedAt = now;
    candidate.rowVersion += 1;
    this.store.update(candidate);
    this.store.setIdempotency(input.tenantId, "PUBLISH", idempotencyKey, { fingerprint: requestFingerprint, candidateId: candidate.id });
    return { candidate: cloneCandidate(candidate), documentVersion: this.knowledgeRepository.getVersion(candidate.tenantId, version.id), indexSnapshot: snapshot, idempotentReplay: false };
  }

  revoke(input: RevokeFaqInput): FaqMutationResult {
    const now = toIso(input.now ?? this.clock(), "now");
    const actorId = requireKey(input.actorId, "actorId");
    const reason = requireText(input.reason, "reason", 2_000);
    const idempotencyKey = requireKey(input.idempotencyKey, "idempotencyKey");
    const candidate = this.require(input.tenantId, input.candidateId);
    const requestFingerprint = hash(JSON.stringify({ candidateId: candidate.id, expectedVersion: input.expectedVersion, actorId, reason, rollback: input.rollback === true }));
    const replay = this.replay(input.tenantId, "REVOKE", idempotencyKey, requestFingerprint);
    if (replay) return replay;
    this.assertVersion(candidate, input.expectedVersion);
    if (candidate.status !== "PUBLISHED" && candidate.status !== "APPROVED") throw new FaqCandidateError("INVALID_STATE", "only an approved or published FAQ can be revoked");
    let snapshot: FaqIndexSnapshot | undefined;
    if (candidate.status === "PUBLISHED") {
      snapshot = this.index.deactivate(candidate.tenantId, candidate.id, input.rollback === true ? "ROLLBACK" : "REVOKE", now);
      if (candidate.documentVersionId) this.knowledgeRepository.retireActiveVersion(candidate.tenantId, candidate.documentVersionId, now);
    }
    candidate.status = "REVOKED";
    candidate.revokedBy = actorId;
    candidate.revokedAt = now;
    candidate.revokedReason = reason;
    candidate.updatedAt = now;
    candidate.rowVersion += 1;
    this.store.update(candidate);
    this.store.setIdempotency(input.tenantId, "REVOKE", idempotencyKey, { fingerprint: requestFingerprint, candidateId: candidate.id });
    return { candidate: cloneCandidate(candidate), ...(candidate.documentVersionId ? { documentVersion: this.knowledgeRepository.getVersion(candidate.tenantId, candidate.documentVersionId) } : {}), ...(snapshot ? { indexSnapshot: snapshot } : {}), idempotentReplay: false };
  }

  get(tenantId: string, candidateId: string): FaqCandidate {
    return cloneCandidate(this.require(tenantId, candidateId));
  }

  list(tenantId: string, options: { departmentIds?: readonly string[]; statuses?: readonly FaqCandidateStatus[] } = {}): FaqCandidate[] {
    const departments = options.departmentIds ? new Set(options.departmentIds) : undefined;
    const statuses = options.statuses ? new Set(options.statuses) : undefined;
    return this.store.list(tenantId).filter((candidate) => (!departments || departments.has(candidate.departmentId)) && (!statuses || statuses.has(candidate.status))).map(cloneCandidate);
  }

  private require(tenantId: string, candidateId: string): FaqCandidate {
    const normalizedTenant = requireKey(tenantId, "tenantId");
    const normalizedCandidate = requireKey(candidateId, "candidateId");
    const candidate = this.store.get(normalizedTenant, normalizedCandidate);
    if (!candidate) {
      const foreign = this.store.list(normalizedTenant).find((item) => item.id === normalizedCandidate);
      if (foreign && foreign.tenantId !== normalizedTenant) throw new FaqCandidateError("TENANT_BOUNDARY", "FAQ candidate belongs to another tenant");
      throw new FaqCandidateError("NOT_FOUND", "FAQ candidate was not found");
    }
    if (candidate.tenantId !== normalizedTenant) throw new FaqCandidateError("TENANT_BOUNDARY", "FAQ candidate belongs to another tenant");
    return candidate;
  }

  private assertVersion(candidate: FaqCandidate, expectedVersion: number): void {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) throw new FaqCandidateError("VALIDATION_ERROR", "expectedVersion is invalid");
    if (candidate.rowVersion !== expectedVersion) throw new FaqCandidateError("VERSION_CONFLICT", "FAQ candidate was changed; reload before retrying");
  }

  private assertDuplicateClear(candidate: FaqCandidate): void {
    if (candidate.duplicateCheck.status === "CONFLICT") throw new FaqCandidateError("CONFLICT", "unresolved FAQ conflict blocks publication");
    if (candidate.duplicateCheck.status === "DUPLICATE") throw new FaqCandidateError("DUPLICATE", "duplicate FAQ blocks publication");
  }

  private checkDuplicates(tenantId: string, question: string, answer: string, departmentId: string, now: string, excludeId?: string): FaqDuplicateCheck {
    const normalizedQuestion = normalizeQuestion(question);
    const normalizedAnswer = normalizeAnswer(answer);
    const matches = this.store.list(tenantId)
      .filter((candidate) => candidate.id !== excludeId && !["REJECTED", "REVOKED"].includes(candidate.status) && normalizeQuestion(candidate.question) === normalizedQuestion)
      .map((candidate) => ({ candidate, reason: candidate.departmentId !== departmentId ? "CROSS_DEPARTMENT" as const : normalizeAnswer(candidate.answer) === normalizedAnswer ? "SAME_ANSWER" as const : "DIFFERENT_ANSWER" as const }));
    const status: FaqDuplicateResult = matches.some((item) => item.reason === "DIFFERENT_ANSWER" || item.reason === "CROSS_DEPARTMENT") ? "CONFLICT" : matches.length > 0 ? "DUPLICATE" : "CLEAR";
    return { status, checkedAt: now, matches: matches.map((item) => ({ candidateId: item.candidate.id, departmentId: item.candidate.departmentId, reason: item.reason })) };
  }

  private replay(tenantId: string, action: string, key: string, requestFingerprint: string): FaqMutationResult | undefined {
    const existing = this.store.getIdempotency(tenantId, action, key);
    if (!existing) return undefined;
    if (existing.fingerprint !== requestFingerprint) throw new FaqCandidateError("IDEMPOTENCY_CONFLICT", "idempotency key was reused for a different FAQ mutation");
    return { candidate: this.get(tenantId, existing.candidateId), idempotentReplay: true };
  }

  private processKnowledgeVersion(tenantId: string, versionId: string, now: string): void {
    try {
      const states = ["VALIDATING", "MALWARE_SCANNING", "PARSING", "NORMALIZING", "EXTRACTING_FACTS"] as const;
      for (const state of states) this.knowledgeRepository.transitionVersion(tenantId, versionId, state, now);
      this.knowledgeRepository.setExtractionResult(tenantId, versionId, { qualityScore: 1, parserName: "citychatbot-faq-parser", parserVersion: "1.0.0" }, now);
      for (const state of ["NEEDS_REVIEW", "CONFLICT_CHECK", "INDEXING", "EVALUATING"] as const) this.knowledgeRepository.transitionVersion(tenantId, versionId, state, now);
    } catch (error) {
      cloneKnowledgeError(error);
    }
  }
}
