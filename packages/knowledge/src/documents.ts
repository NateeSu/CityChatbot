import { canTransitionIngestionState, type IngestionState } from "@citychatbot/storage";

export type KnowledgeDocumentStatus = "ACTIVE" | "RETIRED";
export type KnowledgeVisibility = "PUBLIC" | "INTERNAL" | "RESTRICTED";
export type KnowledgeApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type KnowledgeActivationStatus = "UNIT_GATE_PENDING" | "UNIT_GATED" | "ACTIVE" | "RETIRED";
export type KnowledgeUnitGateReceipt = {
  manifestVersion: string;
  reportHash: string;
  requiredTestIds: string[];
  passedTestIds: string[];
  actor: "SYSTEM_UNIT_GATE";
  passedAt: string;
};
export type IngestionJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "RETRY_WAIT" | "DEAD" | "CANCELLED";
export type RetrievalAudience = "CITIZEN" | "STAFF";

export type KnowledgeChunkType =
  | "DOCUMENT_SUMMARY"
  | "SECTION_PARENT"
  | "ATOMIC_FAQ"
  | "ATOMIC_FACT_GROUP"
  | "TABLE_ROW"
  | "PROCEDURE_BLOCK"
  | "CONTACT_BLOCK";

export type KnowledgeDocument = {
  id: string;
  tenantId: string;
  sourceKey: string;
  title: string;
  ownerDepartmentId: string;
  knowledgeCategoryId: string;
  status: KnowledgeDocumentStatus;
  currentActiveVersionId?: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type KnowledgeDocumentVersion = {
  id: string;
  tenantId: string;
  documentId: string;
  version: number;
  title: string;
  originalFilename: string;
  mimeType: string;
  checksumSha256: string;
  sourceObjectKey: string;
  ownerDepartmentId: string;
  knowledgeCategoryId: string;
  visibility: KnowledgeVisibility;
  authorityLevel: number;
  documentNumber?: string;
  issuedAt?: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  effectiveDateUnknown: boolean;
  supersedesVersionId?: string;
  state: IngestionState;
  approvalStatus: KnowledgeApprovalStatus;
  activationStatus: KnowledgeActivationStatus;
  activatedBy?: "SYSTEM_UNIT_GATE";
  activatedAt?: string;
  unitGateManifestVersion?: string;
  unitGateReportHash?: string;
  unitGatePassedTestIds: string[];
  approvedBy?: string;
  approvedAt?: string;
  reviewDueAt: string;
  parserName?: string;
  parserVersion?: string;
  extractionQualityScore?: number;
  extractionWarnings: string[];
  failureCode?: string;
  failureDetailRedacted?: string;
  activeAt?: string;
  retiredAt?: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type IngestionJob = {
  id: string;
  tenantId: string;
  documentVersionId: string;
  jobType: "knowledge.ingest";
  jobVersion: number;
  dedupeKey: string;
  status: IngestionJobStatus;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  heartbeatAt?: string;
  errorCode?: string;
  errorDetailRedacted?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  updatedAt: string;
  rowVersion: number;
};

export type KnowledgeChunk = {
  id: string;
  tenantId: string;
  documentVersionId: string;
  parentChunkId?: string;
  chunkType: KnowledgeChunkType;
  chunkIndex: number;
  displayText: string;
  searchText: string;
  visibility: KnowledgeVisibility;
  authorityLevel: number;
  validFrom?: string;
  validUntil?: string;
  sourceLocator: Record<string, unknown>;
  sourceHash: string;
  tokenCount: number;
  language: "th" | "en" | "mixed";
  createdAt: string;
};

export type KnowledgeApproval = {
  id: string;
  tenantId: string;
  documentVersionId: string;
  decision: "APPROVED" | "REJECTED" | "NEEDS_CHANGES";
  reviewerAccountId: string;
  reason: string;
  effectiveDateConfirmed: boolean;
  createdAt: string;
};

export type CreateKnowledgeDocumentVersionInput = {
  tenantId: string;
  id?: string;
  documentId?: string;
  sourceKey: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  checksumSha256: string;
  sourceObjectKey: string;
  ownerDepartmentId: string;
  knowledgeCategoryId: string;
  visibility: KnowledgeVisibility;
  authorityLevel: number;
  documentNumber?: string;
  issuedAt?: Date | string | null;
  effectiveFrom?: Date | string | null;
  effectiveUntil?: Date | string | null;
  effectiveDateUnknown?: boolean;
  supersedesVersionId?: string;
  reviewDueAt?: Date | string | null;
  parserName?: string;
  parserVersion?: string;
  extractionQualityScore?: number;
  extractionWarnings?: string[];
  idempotencyKey: string;
  documentIdOverride?: string;
  now?: Date | string;
};

export type CreateKnowledgeDocumentVersionResult = {
  document: KnowledgeDocument;
  version: KnowledgeDocumentVersion;
  job: IngestionJob;
  deduplicated: boolean;
};

export type KnowledgeRetrievalOptions = {
  at?: Date | string;
  audience?: RetrievalAudience;
  departmentId?: string;
};

export type RetryIngestionResult = {
  version: KnowledgeDocumentVersion;
  job: IngestionJob;
  idempotentReplay: boolean;
};

export class KnowledgeDomainError extends Error {
  constructor(
    public readonly code:
      | "VALIDATION_ERROR"
      | "TENANT_BOUNDARY"
      | "NOT_FOUND"
      | "DUPLICATE_SOURCE"
      | "IDEMPOTENCY_CONFLICT"
      | "INVALID_TRANSITION"
      | "DIRECT_PUBLISH_FORBIDDEN"
      | "APPROVAL_REQUIRED"
      | "UNIT_GATE_REQUIRED"
      | "EFFECTIVE_DATE_REQUIRED"
      | "EXPIRED"
      | "IMMUTABLE_VERSION"
      | "JOB_STATE_INVALID"
      | "CHUNK_CONFLICT",
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "KnowledgeDomainError";
  }
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const SAFE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,254}$/;
const PROCESSING_STATES = new Set<IngestionState>([
  "QUARANTINED",
  "VALIDATING",
  "MALWARE_SCANNING",
  "PARSING",
  "NORMALIZING",
  "EXTRACTING_FACTS",
  "NEEDS_REVIEW",
  "CONFLICT_CHECK",
  "INDEXING",
  "EVALUATING",
]);

const iso = (value: Date | string | null | undefined, field: string): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new KnowledgeDomainError("VALIDATION_ERROR", `${field} must be a valid timestamp`);
  return parsed.toISOString();
};

const requireText = (value: string, field: string, max = 500): string => {
  if (typeof value !== "string" || value.trim().length === 0 || value.trim().length > max) {
    throw new KnowledgeDomainError("VALIDATION_ERROR", `${field} is invalid`);
  }
  return value.trim();
};

const cloneDocument = (document: KnowledgeDocument): KnowledgeDocument => ({ ...document });

const cloneVersion = (version: KnowledgeDocumentVersion): KnowledgeDocumentVersion => ({
  ...version,
  extractionWarnings: [...version.extractionWarnings],
});

const cloneJob = (job: IngestionJob): IngestionJob => ({ ...job });

const cloneChunk = (chunk: KnowledgeChunk): KnowledgeChunk => ({
  ...chunk,
  sourceLocator: { ...chunk.sourceLocator },
});

const cloneApproval = (approval: KnowledgeApproval): KnowledgeApproval => ({ ...approval });

const createId = (): string => crypto.randomUUID();

const assertTenant = (expectedTenantId: string, actualTenantId: string): void => {
  if (expectedTenantId !== actualTenantId) throw new KnowledgeDomainError("TENANT_BOUNDARY", "resource belongs to another tenant");
};

const assertVersionTransition = (from: IngestionState, to: IngestionState, unitGate = false): void => {
  if (to === "ACTIVE" && !unitGate) throw new KnowledgeDomainError("DIRECT_PUBLISH_FORBIDDEN", "ACTIVE can only be reached by atomic publish");
  if (!unitGate && !canTransitionIngestionState(from, to)) {
    throw new KnowledgeDomainError("INVALID_TRANSITION", `${from} cannot transition to ${to}`);
  }
};

const isRetrievableAt = (version: KnowledgeDocumentVersion, at: string): boolean =>
  version.state === "ACTIVE" &&
  (version.effectiveFrom === undefined || version.effectiveFrom <= at) &&
  (version.effectiveUntil === undefined || version.effectiveUntil > at);

export class InMemoryKnowledgeRepository {
  private readonly clock: () => Date;
  private readonly documents = new Map<string, KnowledgeDocument>();
  private readonly versions = new Map<string, KnowledgeDocumentVersion>();
  private readonly jobs = new Map<string, IngestionJob>();
  private readonly chunks = new Map<string, KnowledgeChunk>();
  private readonly approvals = new Map<string, KnowledgeApproval>();
  private readonly versionByChecksum = new Map<string, string>();
  private readonly idempotency = new Map<string, { fingerprint: string; versionId: string }>();

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock;
  }

  createVersion(input: CreateKnowledgeDocumentVersionInput): CreateKnowledgeDocumentVersionResult {
    const now = iso(input.now ?? this.clock(), "now")!;
    const tenantId = requireText(input.tenantId, "tenantId", 128);
    const sourceKey = requireText(input.sourceKey, "sourceKey", 255);
    const title = requireText(input.title, "title", 500);
    const originalFilename = requireText(input.originalFilename, "originalFilename", 255);
    const mimeType = requireText(input.mimeType, "mimeType", 255).toLowerCase();
    const sourceObjectKey = requireText(input.sourceObjectKey, "sourceObjectKey", 500);
    const ownerDepartmentId = requireText(input.ownerDepartmentId, "ownerDepartmentId", 128);
    const knowledgeCategoryId = requireText(input.knowledgeCategoryId, "knowledgeCategoryId", 128);
    const idempotencyKey = requireText(input.idempotencyKey, "idempotencyKey", 255);
    if (!SAFE_KEY_PATTERN.test(sourceKey) || sourceKey.includes("/")) {
      throw new KnowledgeDomainError("VALIDATION_ERROR", "sourceKey must be a tenant-local safe key");
    }
    const checksumSha256 = requireText(input.checksumSha256, "checksumSha256", 64).toLowerCase();
    if (!SHA256_PATTERN.test(checksumSha256)) throw new KnowledgeDomainError("VALIDATION_ERROR", "checksumSha256 must be SHA-256");
    if (!Number.isInteger(input.authorityLevel) || input.authorityLevel < 0 || input.authorityLevel > 100) {
      throw new KnowledgeDomainError("VALIDATION_ERROR", "authorityLevel must be between 0 and 100");
    }
    if (!["PUBLIC", "INTERNAL", "RESTRICTED"].includes(input.visibility)) {
      throw new KnowledgeDomainError("VALIDATION_ERROR", "visibility is invalid");
    }
    const effectiveFrom = iso(input.effectiveFrom, "effectiveFrom");
    const effectiveUntil = iso(input.effectiveUntil, "effectiveUntil");
    const effectiveDateUnknown = input.effectiveDateUnknown ?? (effectiveFrom === undefined && effectiveUntil === undefined);
    if (effectiveDateUnknown && (effectiveFrom !== undefined || effectiveUntil !== undefined)) {
      throw new KnowledgeDomainError("VALIDATION_ERROR", "unknown effective date cannot include effective timestamps");
    }
    if (!effectiveDateUnknown && effectiveFrom === undefined && effectiveUntil === undefined) {
      throw new KnowledgeDomainError("EFFECTIVE_DATE_REQUIRED", "effective date or explicit unknown confirmation is required");
    }
    if (effectiveFrom !== undefined && effectiveUntil !== undefined && effectiveUntil <= effectiveFrom) {
      throw new KnowledgeDomainError("VALIDATION_ERROR", "effectiveUntil must be after effectiveFrom");
    }
    const fingerprint = [tenantId, sourceKey, checksumSha256, sourceObjectKey].join("|");
    const idempotencyMapKey = `${tenantId}|${idempotencyKey}`;
    const previousIdempotency = this.idempotency.get(idempotencyMapKey);
    if (previousIdempotency) {
      if (previousIdempotency.fingerprint !== fingerprint) {
        throw new KnowledgeDomainError("IDEMPOTENCY_CONFLICT", "idempotency key was reused for a different document");
      }
      const existingVersion = this.requireVersion(tenantId, previousIdempotency.versionId);
      return {
        document: cloneDocument(this.requireDocument(tenantId, existingVersion.documentId)),
        version: cloneVersion(existingVersion),
        job: cloneJob(this.requireJob(tenantId, existingVersion.id)),
        deduplicated: true,
      };
    }
    const duplicateId = this.versionByChecksum.get(`${tenantId}|${checksumSha256}`);
    if (duplicateId) {
      const existingVersion = this.requireVersion(tenantId, duplicateId);
      this.idempotency.set(idempotencyMapKey, { fingerprint, versionId: duplicateId });
      return {
        document: cloneDocument(this.requireDocument(tenantId, existingVersion.documentId)),
        version: cloneVersion(existingVersion),
        job: cloneJob(this.requireJob(tenantId, existingVersion.id)),
        deduplicated: true,
      };
    }

    let document = input.documentId ? this.requireDocument(tenantId, input.documentId) : undefined;
    if (!document) {
      document = [...this.documents.values()].find((candidate) => candidate.tenantId === tenantId && candidate.sourceKey === sourceKey);
    }
    if (!document) {
      document = {
        id: input.documentIdOverride ?? createId(),
        tenantId,
        sourceKey,
        title,
        ownerDepartmentId,
        knowledgeCategoryId,
        status: "ACTIVE",
        createdAt: now,
        updatedAt: now,
        rowVersion: 1,
      };
      if (this.documents.has(document.id)) throw new KnowledgeDomainError("DUPLICATE_SOURCE", "document id already exists");
      this.documents.set(document.id, document);
    } else {
      if (document.sourceKey !== sourceKey) throw new KnowledgeDomainError("DUPLICATE_SOURCE", "source key does not match document");
      if (document.ownerDepartmentId !== ownerDepartmentId || document.knowledgeCategoryId !== knowledgeCategoryId) {
        throw new KnowledgeDomainError("VALIDATION_ERROR", "document ownership metadata cannot cross department/category boundary");
      }
    }

    const documentVersions = [...this.versions.values()].filter((candidate) => candidate.tenantId === tenantId && candidate.documentId === document!.id);
    const previousVersion = documentVersions.sort((left, right) => right.version - left.version)[0];
    const version: KnowledgeDocumentVersion = {
      id: input.id ?? createId(),
      tenantId,
      documentId: document.id,
      version: (previousVersion?.version ?? 0) + 1,
      title,
      originalFilename,
      mimeType,
      checksumSha256,
      sourceObjectKey,
      ownerDepartmentId,
      knowledgeCategoryId,
      visibility: input.visibility,
      authorityLevel: input.authorityLevel,
      documentNumber: input.documentNumber ? requireText(input.documentNumber, "documentNumber", 255) : undefined,
      issuedAt: iso(input.issuedAt, "issuedAt"),
      effectiveFrom,
      effectiveUntil,
      effectiveDateUnknown,
      supersedesVersionId: input.supersedesVersionId ?? document.currentActiveVersionId,
      state: "QUARANTINED",
      approvalStatus: "PENDING",
      activationStatus: "UNIT_GATE_PENDING",
      unitGatePassedTestIds: [],
      reviewDueAt: iso(input.reviewDueAt, "reviewDueAt") ?? new Date(new Date(now).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      parserName: input.parserName ? requireText(input.parserName, "parserName", 128) : undefined,
      parserVersion: input.parserVersion ? requireText(input.parserVersion, "parserVersion", 128) : undefined,
      extractionQualityScore: input.extractionQualityScore,
      extractionWarnings: [...(input.extractionWarnings ?? [])].map((warning) => requireText(warning, "extractionWarning", 1000)),
      createdAt: now,
      updatedAt: now,
      rowVersion: 1,
    };
    if (this.versions.has(version.id)) throw new KnowledgeDomainError("DUPLICATE_SOURCE", "document version id already exists");
    if (version.supersedesVersionId) {
      const superseded = this.requireVersion(tenantId, version.supersedesVersionId);
      if (superseded.documentId !== document.id) throw new KnowledgeDomainError("TENANT_BOUNDARY", "superseded version belongs to another document");
    }
    const job: IngestionJob = {
      id: createId(),
      tenantId,
      documentVersionId: version.id,
      jobType: "knowledge.ingest",
      jobVersion: 1,
      dedupeKey: `knowledge-version:${version.id}`,
      status: "QUEUED",
      priority: 100,
      attemptCount: 0,
      maxAttempts: 5,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
      rowVersion: 1,
    };
    this.versions.set(version.id, version);
    this.jobs.set(job.id, job);
    this.versionByChecksum.set(`${tenantId}|${checksumSha256}`, version.id);
    this.idempotency.set(idempotencyMapKey, { fingerprint, versionId: version.id });
    return { document: cloneDocument(document), version: cloneVersion(version), job: cloneJob(job), deduplicated: false };
  }

  transitionVersion(tenantId: string, versionId: string, nextState: IngestionState, now: Date | string = this.clock()): KnowledgeDocumentVersion {
    const version = this.requireVersion(tenantId, versionId);
    assertVersionTransition(version.state, nextState);
    if (nextState === "APPROVED") throw new KnowledgeDomainError("APPROVAL_REQUIRED", "APPROVED requires an approval record");
    if (version.state === "FAILED" && nextState !== "QUARANTINED") throw new KnowledgeDomainError("INVALID_TRANSITION", "failed versions must be quarantined before retry");
    version.state = nextState;
    if (nextState !== "ACTIVE" && nextState !== "RETIRED") version.activationStatus = "UNIT_GATE_PENDING";
    if (nextState === "QUARANTINED") {
      version.failureCode = undefined;
      version.failureDetailRedacted = undefined;
    }
    this.touch(version, now);
    return cloneVersion(version);
  }

  setExtractionResult(
    tenantId: string,
    versionId: string,
    result: { qualityScore: number; warnings?: string[]; parserName?: string; parserVersion?: string },
    now: Date | string = this.clock(),
  ): KnowledgeDocumentVersion {
    const version = this.requireVersion(tenantId, versionId);
    if (!PROCESSING_STATES.has(version.state) || version.state === "QUARANTINED") {
      throw new KnowledgeDomainError("IMMUTABLE_VERSION", "extraction result is only writable during processing");
    }
    if (!Number.isFinite(result.qualityScore) || result.qualityScore < 0 || result.qualityScore > 1) {
      throw new KnowledgeDomainError("VALIDATION_ERROR", "qualityScore must be between 0 and 1");
    }
    version.extractionQualityScore = result.qualityScore;
    version.extractionWarnings = [...(result.warnings ?? [])].map((warning) => requireText(warning, "extractionWarning", 1000));
    version.parserName = result.parserName ? requireText(result.parserName, "parserName", 128) : version.parserName;
    version.parserVersion = result.parserVersion ? requireText(result.parserVersion, "parserVersion", 128) : version.parserVersion;
    this.touch(version, now);
    return cloneVersion(version);
  }

  approveVersion(
    tenantId: string,
    versionId: string,
    input: { approvedBy: string; reason?: string; confirmUnknownEffectiveDate?: boolean; now?: Date | string },
  ): KnowledgeDocumentVersion {
    const now = iso(input.now ?? this.clock(), "now")!;
    const version = this.requireVersion(tenantId, versionId);
    if (version.state !== "EVALUATING") throw new KnowledgeDomainError("APPROVAL_REQUIRED", "only an evaluated version can be approved");
    const approvedBy = requireText(input.approvedBy, "approvedBy", 128);
    if (version.effectiveDateUnknown && input.confirmUnknownEffectiveDate !== true) {
      throw new KnowledgeDomainError("EFFECTIVE_DATE_REQUIRED", "an administrator must confirm the unknown effective date");
    }
    if (version.extractionQualityScore === undefined) throw new KnowledgeDomainError("APPROVAL_REQUIRED", "extraction quality is missing");
    if (new Date(version.reviewDueAt).getTime() <= new Date(now).getTime()) throw new KnowledgeDomainError("EXPIRED", "review due date has passed");
    version.state = "APPROVED";
    version.approvalStatus = "APPROVED";
    version.approvedBy = approvedBy;
    version.approvedAt = now;
    const approval: KnowledgeApproval = {
      id: createId(),
      tenantId,
      documentVersionId: version.id,
      decision: "APPROVED",
      reviewerAccountId: approvedBy,
      reason: requireText(input.reason ?? "Approved after deterministic evaluation", "approvalReason", 2000),
      effectiveDateConfirmed: input.confirmUnknownEffectiveDate === true,
      createdAt: now,
    };
    this.approvals.set(approval.id, approval);
    this.touch(version, now);
    return cloneVersion(version);
  }

  activateApprovedVersion(tenantId: string, versionId: string, now: Date | string = this.clock()): KnowledgeDocumentVersion {
    const nowIso = iso(now, "now")!;
    const target = this.requireVersion(tenantId, versionId);
    if (target.state === "ACTIVE") return cloneVersion(target);
    if (target.state !== "APPROVED" || target.approvalStatus !== "APPROVED") {
      throw new KnowledgeDomainError("APPROVAL_REQUIRED", "only an approved version can be activated");
    }
    if (target.effectiveFrom && target.effectiveFrom > nowIso) throw new KnowledgeDomainError("EXPIRED", "version is not effective yet");
    if (target.effectiveUntil && target.effectiveUntil <= nowIso) throw new KnowledgeDomainError("EXPIRED", "version effective period has ended");
    const document = this.requireDocument(tenantId, target.documentId);
    const previous = document.currentActiveVersionId ? this.requireVersion(tenantId, document.currentActiveVersionId) : undefined;
    if (previous && previous.id !== target.id) {
      previous.state = "RETIRED";
      previous.retiredAt = nowIso;
      this.touch(previous, nowIso);
    }
    target.state = "ACTIVE";
    target.activationStatus = "ACTIVE";
    target.activeAt = target.activeAt ?? nowIso;
    target.retiredAt = undefined;
    this.touch(target, nowIso);
    document.currentActiveVersionId = target.id;
    document.status = "ACTIVE";
    this.touch(document, nowIso);
    return cloneVersion(target);
  }

  unitGateAndActivate(
    tenantId: string,
    versionId: string,
    receipt: KnowledgeUnitGateReceipt,
    now: Date | string = this.clock(),
  ): KnowledgeDocumentVersion {
    const nowIso = iso(now, "now")!;
    const target = this.requireVersion(tenantId, versionId);
    if (target.state !== "EVALUATING") throw new KnowledgeDomainError("UNIT_GATE_REQUIRED", "only an evaluated version can pass the unit gate");
    if (receipt.actor !== "SYSTEM_UNIT_GATE" || !receipt.manifestVersion.trim() || !/^sha256:[a-f0-9]{64}$/i.test(receipt.reportHash)) {
      throw new KnowledgeDomainError("UNIT_GATE_REQUIRED", "unit gate receipt is invalid");
    }
    if (!receipt.requiredTestIds.length || receipt.requiredTestIds.some((testId) => !testId.trim())) {
      throw new KnowledgeDomainError("UNIT_GATE_REQUIRED", "unit gate test IDs are required");
    }
    if (receipt.requiredTestIds.length !== receipt.passedTestIds.length || receipt.requiredTestIds.some((testId) => !receipt.passedTestIds.includes(testId))) {
      throw new KnowledgeDomainError("UNIT_GATE_REQUIRED", "unit gate did not pass every required test");
    }
    if (target.extractionQualityScore === undefined) throw new KnowledgeDomainError("UNIT_GATE_REQUIRED", "extraction quality is missing");
    if (new Date(target.reviewDueAt).getTime() <= new Date(nowIso).getTime()) throw new KnowledgeDomainError("EXPIRED", "review due date has passed");
    if (target.effectiveFrom && target.effectiveFrom > nowIso) throw new KnowledgeDomainError("EXPIRED", "version is not effective yet");
    if (target.effectiveUntil && target.effectiveUntil <= nowIso) throw new KnowledgeDomainError("EXPIRED", "version effective period has ended");
    assertVersionTransition(target.state, "ACTIVE", true);
    const document = this.requireDocument(tenantId, target.documentId);
    const previous = document.currentActiveVersionId ? this.requireVersion(tenantId, document.currentActiveVersionId) : undefined;
    if (previous && previous.id !== target.id) {
      previous.state = "RETIRED";
      previous.activationStatus = "RETIRED";
      previous.retiredAt = nowIso;
      this.touch(previous, nowIso);
    }
    target.state = "ACTIVE";
    target.approvalStatus = "PENDING";
    target.activationStatus = "UNIT_GATED";
    target.activatedBy = "SYSTEM_UNIT_GATE";
    target.activatedAt = nowIso;
    target.unitGateManifestVersion = receipt.manifestVersion;
    target.unitGateReportHash = receipt.reportHash;
    target.unitGatePassedTestIds = [...receipt.passedTestIds];
    target.activeAt = target.activeAt ?? nowIso;
    target.retiredAt = undefined;
    this.touch(target, nowIso);
    document.currentActiveVersionId = target.id;
    document.status = "ACTIVE";
    this.touch(document, nowIso);
    return cloneVersion(target);
  }

  rollbackToApprovedVersion(tenantId: string, versionId: string, now: Date | string = this.clock()): KnowledgeDocumentVersion {
    const nowIso = iso(now, "now")!;
    const target = this.requireVersion(tenantId, versionId);
    if (target.state !== "RETIRED" || target.approvalStatus !== "APPROVED" || !target.approvedBy) {
      throw new KnowledgeDomainError("APPROVAL_REQUIRED", "rollback requires a retained approved version");
    }
    if (target.effectiveFrom && target.effectiveFrom > nowIso) throw new KnowledgeDomainError("EXPIRED", "version is not effective yet");
    if (target.effectiveUntil && target.effectiveUntil <= nowIso) throw new KnowledgeDomainError("EXPIRED", "version effective period has ended");
    const document = this.requireDocument(tenantId, target.documentId);
    const previous = document.currentActiveVersionId ? this.requireVersion(tenantId, document.currentActiveVersionId) : undefined;
    if (previous && previous.id !== target.id) {
      previous.state = "RETIRED";
      previous.retiredAt = nowIso;
      this.touch(previous, nowIso);
    }
    target.state = "ACTIVE";
    target.activeAt = nowIso;
    target.retiredAt = undefined;
    this.touch(target, nowIso);
    document.currentActiveVersionId = target.id;
    document.status = "ACTIVE";
    this.touch(document, nowIso);
    return cloneVersion(target);
  }

  retireActiveVersion(tenantId: string, versionId: string, now: Date | string = this.clock()): KnowledgeDocumentVersion {
    const nowIso = iso(now, "now")!;
    const version = this.requireVersion(tenantId, versionId);
    if (version.state !== "ACTIVE") throw new KnowledgeDomainError("INVALID_TRANSITION", "only an active version can be retired");
    const document = this.requireDocument(tenantId, version.documentId);
    version.state = "RETIRED";
    version.activationStatus = "RETIRED";
    version.retiredAt = nowIso;
    this.touch(version, nowIso);
    if (document.currentActiveVersionId === version.id) {
      document.currentActiveVersionId = undefined;
      document.status = "RETIRED";
      this.touch(document, nowIso);
    }
    return cloneVersion(version);
  }

  failIngestion(
    tenantId: string,
    versionId: string,
    input: { errorCode: string; retryable: boolean; redactedDetail?: string; now?: Date | string },
  ): { version: KnowledgeDocumentVersion; job: IngestionJob } {
    const nowIso = iso(input.now ?? this.clock(), "now")!;
    const version = this.requireVersion(tenantId, versionId);
    if (!PROCESSING_STATES.has(version.state)) throw new KnowledgeDomainError("INVALID_TRANSITION", "only processing versions can fail");
    assertVersionTransition(version.state, "FAILED");
    version.state = "FAILED";
    version.failureCode = requireText(input.errorCode, "errorCode", 128);
    version.failureDetailRedacted = input.redactedDetail ? requireText(input.redactedDetail, "redactedDetail", 1000) : undefined;
    this.touch(version, nowIso);
    const job = this.requireJob(tenantId, versionId);
    job.errorCode = version.failureCode;
    job.errorDetailRedacted = version.failureDetailRedacted;
    job.status = input.retryable && job.attemptCount < job.maxAttempts ? "RETRY_WAIT" : "DEAD";
    job.nextAttemptAt = nowIso;
    this.touch(job, nowIso);
    return { version: cloneVersion(version), job: cloneJob(job) };
  }

  retryIngestion(tenantId: string, versionId: string, idempotencyKey: string, now: Date | string = this.clock()): RetryIngestionResult {
    const nowIso = iso(now, "now")!;
    const normalizedKey = requireText(idempotencyKey, "idempotencyKey", 255);
    const version = this.requireVersion(tenantId, versionId);
    const idempotencyMapKey = `${tenantId}|retry|${normalizedKey}`;
    const existing = this.idempotency.get(idempotencyMapKey);
    if (existing) {
      if (existing.versionId !== versionId) throw new KnowledgeDomainError("IDEMPOTENCY_CONFLICT", "retry key was reused for another version");
      return { version: cloneVersion(version), job: cloneJob(this.requireJob(tenantId, versionId)), idempotentReplay: true };
    }
    if (version.state !== "FAILED") throw new KnowledgeDomainError("JOB_STATE_INVALID", "only failed ingestion can be retried");
    version.state = "QUARANTINED";
    version.failureCode = undefined;
    version.failureDetailRedacted = undefined;
    this.touch(version, nowIso);
    const job = this.requireJob(tenantId, versionId);
    if (job.status === "SUCCEEDED" || job.status === "CANCELLED") throw new KnowledgeDomainError("JOB_STATE_INVALID", "completed ingestion cannot be retried");
    job.status = "QUEUED";
    job.nextAttemptAt = nowIso;
    job.errorCode = undefined;
    job.errorDetailRedacted = undefined;
    this.touch(job, nowIso);
    this.idempotency.set(idempotencyMapKey, { fingerprint: versionId, versionId });
    return { version: cloneVersion(version), job: cloneJob(job), idempotentReplay: false };
  }

  claimIngestionJob(tenantId: string, workerId: string, now: Date | string = this.clock(), leaseMs = 30_000): IngestionJob | undefined {
    const nowIso = iso(now, "now")!;
    const normalizedWorker = requireText(workerId, "workerId", 128);
    const candidate = [...this.jobs.values()]
      .filter((job) => job.tenantId === tenantId && job.status === "QUEUED" && job.nextAttemptAt <= nowIso)
      .sort((left, right) => right.priority - left.priority || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))[0];
    if (!candidate) return undefined;
    candidate.status = "RUNNING";
    candidate.attemptCount += 1;
    candidate.leaseOwner = normalizedWorker;
    candidate.leaseExpiresAt = new Date(new Date(nowIso).getTime() + leaseMs).toISOString();
    candidate.heartbeatAt = nowIso;
    candidate.startedAt = candidate.startedAt ?? nowIso;
    this.touch(candidate, nowIso);
    return cloneJob(candidate);
  }

  completeIngestionJob(tenantId: string, jobId: string, workerId: string, now: Date | string = this.clock()): IngestionJob {
    const nowIso = iso(now, "now")!;
    const job = this.requireJobById(tenantId, jobId);
    if (job.status !== "RUNNING" || job.leaseOwner !== requireText(workerId, "workerId", 128)) {
      throw new KnowledgeDomainError("JOB_STATE_INVALID", "job lease is not owned by worker");
    }
    job.status = "SUCCEEDED";
    job.completedAt = nowIso;
    job.leaseOwner = undefined;
    job.leaseExpiresAt = undefined;
    job.heartbeatAt = nowIso;
    this.touch(job, nowIso);
    return cloneJob(job);
  }

  addChunk(
    tenantId: string,
    input: Omit<KnowledgeChunk, "id" | "tenantId" | "createdAt"> & { id?: string; now?: Date | string },
  ): KnowledgeChunk {
    const now = iso(input.now ?? this.clock(), "now")!;
    const version = this.requireVersion(tenantId, input.documentVersionId);
    if (version.state === "FAILED" || version.state === "RETIRED") throw new KnowledgeDomainError("IMMUTABLE_VERSION", "failed or retired versions cannot receive chunks");
    if (!Number.isInteger(input.chunkIndex) || input.chunkIndex < 0) throw new KnowledgeDomainError("VALIDATION_ERROR", "chunkIndex is invalid");
    if (!Number.isInteger(input.tokenCount) || input.tokenCount < 0 || input.tokenCount > 700) throw new KnowledgeDomainError("VALIDATION_ERROR", "tokenCount is invalid");
    const existing = [...this.chunks.values()].find((chunk) => chunk.tenantId === tenantId && chunk.documentVersionId === version.id && chunk.chunkIndex === input.chunkIndex);
    if (existing) {
      if (existing.sourceHash !== input.sourceHash) throw new KnowledgeDomainError("CHUNK_CONFLICT", "chunk index already has a different source hash");
      return cloneChunk(existing);
    }
    const chunk: KnowledgeChunk = {
      id: input.id ?? createId(),
      tenantId,
      documentVersionId: version.id,
      parentChunkId: input.parentChunkId,
      chunkType: input.chunkType,
      chunkIndex: input.chunkIndex,
      displayText: requireText(input.displayText, "displayText", 100_000),
      searchText: requireText(input.searchText, "searchText", 100_000),
      visibility: input.visibility,
      authorityLevel: input.authorityLevel,
      validFrom: iso(input.validFrom, "validFrom"),
      validUntil: iso(input.validUntil, "validUntil"),
      sourceLocator: { ...input.sourceLocator },
      sourceHash: requireText(input.sourceHash, "sourceHash", 255),
      tokenCount: input.tokenCount,
      language: input.language,
      createdAt: now,
    };
    if (this.chunks.has(chunk.id)) throw new KnowledgeDomainError("CHUNK_CONFLICT", "chunk id already exists");
    this.chunks.set(chunk.id, chunk);
    return cloneChunk(chunk);
  }

  getDocument(tenantId: string, documentId: string): KnowledgeDocument {
    return cloneDocument(this.requireDocument(tenantId, documentId));
  }

  getVersion(tenantId: string, versionId: string): KnowledgeDocumentVersion {
    return cloneVersion(this.requireVersion(tenantId, versionId));
  }

  getIngestionJob(tenantId: string, versionId: string): IngestionJob {
    return cloneJob(this.requireJob(tenantId, versionId));
  }

  listApprovals(tenantId: string, versionId: string): KnowledgeApproval[] {
    this.requireVersion(tenantId, versionId);
    return [...this.approvals.values()]
      .filter((approval) => approval.tenantId === tenantId && approval.documentVersionId === versionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
      .map(cloneApproval);
  }

  listRetrievableVersions(tenantId: string, options: KnowledgeRetrievalOptions = {}): KnowledgeDocumentVersion[] {
    const at = iso(options.at ?? this.clock(), "at")!;
    const audience = options.audience ?? "CITIZEN";
    return [...this.versions.values()]
      .filter((version) => version.tenantId === tenantId)
      .filter((version) => isRetrievableAt(version, at))
      .filter((version) => audience === "STAFF" || version.visibility === "PUBLIC")
      .filter((version) => audience !== "STAFF" || version.visibility === "PUBLIC" || options.departmentId === version.ownerDepartmentId)
      .sort((left, right) => right.version - left.version || right.updatedAt.localeCompare(left.updatedAt))
      .map(cloneVersion);
  }

  listSearchableChunks(tenantId: string, options: KnowledgeRetrievalOptions = {}): KnowledgeChunk[] {
    const searchableIds = new Set(this.listRetrievableVersions(tenantId, options).map((version) => version.id));
    return [...this.chunks.values()]
      .filter((chunk) => chunk.tenantId === tenantId && searchableIds.has(chunk.documentVersionId))
      .filter((chunk) => options.audience === "STAFF" || chunk.visibility === "PUBLIC")
      .sort((left, right) => left.chunkIndex - right.chunkIndex || left.id.localeCompare(right.id))
      .map(cloneChunk);
  }

  private requireDocument(tenantId: string, documentId: string): KnowledgeDocument {
    const document = this.documents.get(documentId);
    if (!document) throw new KnowledgeDomainError("NOT_FOUND", "document was not found");
    assertTenant(tenantId, document.tenantId);
    return document;
  }

  private requireVersion(tenantId: string, versionId: string): KnowledgeDocumentVersion {
    const version = this.versions.get(versionId);
    if (!version) throw new KnowledgeDomainError("NOT_FOUND", "document version was not found");
    assertTenant(tenantId, version.tenantId);
    return version;
  }

  private requireJob(tenantId: string, versionId: string): IngestionJob {
    const job = [...this.jobs.values()].find((candidate) => candidate.tenantId === tenantId && candidate.documentVersionId === versionId);
    if (!job) throw new KnowledgeDomainError("NOT_FOUND", "ingestion job was not found");
    return job;
  }

  private requireJobById(tenantId: string, jobId: string): IngestionJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new KnowledgeDomainError("NOT_FOUND", "ingestion job was not found");
    assertTenant(tenantId, job.tenantId);
    return job;
  }

  private touch(record: { updatedAt: string; rowVersion: number }, now: Date | string): void {
    record.updatedAt = iso(now, "now")!;
    record.rowVersion += 1;
  }
}
