import { describe, expect, it } from "vitest";
import { InMemoryKnowledgeRepository, KnowledgeDomainError, type CreateKnowledgeDocumentVersionInput, type KnowledgeUnitGateReceipt } from "./documents";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const DEPARTMENT_A = "department-a";
const DEPARTMENT_B = "department-b";
const CATEGORY = "category-civic";
const NOW = new Date("2026-08-10T00:00:00.000Z");
const SHA = "a".repeat(64);
const UNIT_GATE_RECEIPT: KnowledgeUnitGateReceipt = {
  manifestVersion: "task-unit-gates.v1",
  reportHash: `sha256:${"b".repeat(64)}`,
  requiredTestIds: ["P6-KB-DOCUMENT-LIFECYCLE", "P6-KB-UNIT-GATED-ACTIVATION"],
  passedTestIds: ["P6-KB-DOCUMENT-LIFECYCLE", "P6-KB-UNIT-GATED-ACTIVATION"],
  actor: "SYSTEM_UNIT_GATE",
  passedAt: NOW.toISOString(),
};

const input = (overrides: Partial<CreateKnowledgeDocumentVersionInput> = {}): CreateKnowledgeDocumentVersionInput => ({
  tenantId: TENANT_A,
  sourceKey: "road-service-manual",
  title: "คู่มือบริการถนน",
  originalFilename: "road-manual.md",
  mimeType: "text/markdown",
  checksumSha256: SHA,
  sourceObjectKey: "tenant-a/knowledge/road-manual.md",
  ownerDepartmentId: DEPARTMENT_A,
  knowledgeCategoryId: CATEGORY,
  visibility: "PUBLIC",
  authorityLevel: 90,
  effectiveFrom: NOW,
  effectiveUntil: new Date("2027-01-01T00:00:00.000Z"),
  reviewDueAt: new Date("2026-12-01T00:00:00.000Z"),
  idempotencyKey: "document-upload-001",
  now: NOW,
  ...overrides,
});

const processToEvaluation = (repository: InMemoryKnowledgeRepository, tenantId: string, versionId: string): void => {
  repository.transitionVersion(tenantId, versionId, "VALIDATING", NOW);
  repository.transitionVersion(tenantId, versionId, "MALWARE_SCANNING", NOW);
  repository.transitionVersion(tenantId, versionId, "PARSING", NOW);
  repository.transitionVersion(tenantId, versionId, "NORMALIZING", NOW);
  repository.transitionVersion(tenantId, versionId, "EXTRACTING_FACTS", NOW);
  repository.setExtractionResult(tenantId, versionId, { qualityScore: 0.99, parserName: "markdown", parserVersion: "1" }, NOW);
  repository.transitionVersion(tenantId, versionId, "NEEDS_REVIEW", NOW);
  repository.transitionVersion(tenantId, versionId, "CONFLICT_CHECK", NOW);
  repository.transitionVersion(tenantId, versionId, "INDEXING", NOW);
  repository.transitionVersion(tenantId, versionId, "EVALUATING", NOW);
};

const approveAndActivate = (repository: InMemoryKnowledgeRepository, tenantId: string, versionId: string): void => {
  processToEvaluation(repository, tenantId, versionId);
  repository.approveVersion(tenantId, versionId, { approvedBy: "staff-approver", now: NOW });
  repository.activateApprovedVersion(tenantId, versionId, NOW);
};

describe("knowledge document lifecycle", () => {
  it("starts every upload quarantined and requires the canonical processing path before approval", () => {
    const repository = new InMemoryKnowledgeRepository(() => NOW);
    const created = repository.createVersion(input());
    expect(created.version.state).toBe("QUARANTINED");
    expect(created.job.status).toBe("QUEUED");
    expect(() => repository.transitionVersion(TENANT_A, created.version.id, "ACTIVE", NOW)).toThrowError(
      new KnowledgeDomainError("DIRECT_PUBLISH_FORBIDDEN", "ACTIVE can only be reached by atomic publish"),
    );
    processToEvaluation(repository, TENANT_A, created.version.id);
    expect(repository.approveVersion(TENANT_A, created.version.id, { approvedBy: "staff-approver", now: NOW }).state).toBe("APPROVED");
    expect(repository.listApprovals(TENANT_A, created.version.id)).toMatchObject([{ decision: "APPROVED", reviewerAccountId: "staff-approver" }]);
  });

  it("deduplicates the same checksum per tenant and preserves idempotent replay", () => {
    const repository = new InMemoryKnowledgeRepository(() => NOW);
    const first = repository.createVersion(input());
    const replay = repository.createVersion(input());
    const sameHash = repository.createVersion(input({ sourceKey: "road-service-manual-copy", idempotencyKey: "document-upload-002" }));
    expect(replay.deduplicated).toBe(true);
    expect(sameHash.deduplicated).toBe(true);
    expect(replay.version.id).toBe(first.version.id);
    expect(sameHash.version.id).toBe(first.version.id);
  });

  it("creates a new immutable version and switches the active alias atomically", () => {
    const repository = new InMemoryKnowledgeRepository(() => NOW);
    const first = repository.createVersion(input());
    approveAndActivate(repository, TENANT_A, first.version.id);
    const second = repository.createVersion(input({ checksumSha256: "b".repeat(64), idempotencyKey: "document-upload-002" }));
    expect(second.version.version).toBe(2);
    approveAndActivate(repository, TENANT_A, second.version.id);
    expect(repository.getVersion(TENANT_A, first.version.id).state).toBe("RETIRED");
    expect(repository.getDocument(TENANT_A, first.document.id).currentActiveVersionId).toBe(second.version.id);
    expect(repository.listRetrievableVersions(TENANT_A, { at: NOW }).map((version) => version.id)).toEqual([second.version.id]);
    repository.rollbackToApprovedVersion(TENANT_A, first.version.id, NOW);
    expect(repository.getVersion(TENANT_A, first.version.id).state).toBe("ACTIVE");
    expect(repository.getVersion(TENANT_A, second.version.id).state).toBe("RETIRED");
    expect(repository.listRetrievableVersions(TENANT_A, { at: NOW }).map((version) => version.id)).toEqual([first.version.id]);
  });

  it("keeps the previous active version searchable when a candidate fails", () => {
    const repository = new InMemoryKnowledgeRepository(() => NOW);
    const first = repository.createVersion(input());
    approveAndActivate(repository, TENANT_A, first.version.id);
    const candidate = repository.createVersion(input({ checksumSha256: "c".repeat(64), idempotencyKey: "document-upload-003" }));
    repository.transitionVersion(TENANT_A, candidate.version.id, "VALIDATING", NOW);
    const failed = repository.failIngestion(TENANT_A, candidate.version.id, { errorCode: "PARSER_TIMEOUT", retryable: true, redactedDetail: "parser timed out", now: NOW });
    expect(failed.version.state).toBe("FAILED");
    expect(repository.listRetrievableVersions(TENANT_A, { at: NOW }).map((version) => version.id)).toEqual([first.version.id]);
    expect(repository.retryIngestion(TENANT_A, candidate.version.id, "retry-candidate-001", NOW).version.state).toBe("QUARANTINED");
    expect(repository.retryIngestion(TENANT_A, candidate.version.id, "retry-candidate-001", NOW).idempotentReplay).toBe(true);
  });

  it("filters expired, inactive, non-public, department and cross-tenant records before retrieval", () => {
    const repository = new InMemoryKnowledgeRepository(() => NOW);
    const publicVersion = repository.createVersion(input({ checksumSha256: "d".repeat(64), idempotencyKey: "document-upload-004", effectiveUntil: new Date("2026-08-11T00:00:00.000Z") }));
    approveAndActivate(repository, TENANT_A, publicVersion.version.id);
    const internalVersion = repository.createVersion(input({ checksumSha256: "e".repeat(64), idempotencyKey: "document-upload-005", sourceKey: "internal-manual", visibility: "INTERNAL", ownerDepartmentId: DEPARTMENT_B, effectiveUntil: new Date("2026-08-11T00:00:00.000Z") }));
    approveAndActivate(repository, TENANT_A, internalVersion.version.id);
    expect(repository.listRetrievableVersions(TENANT_A, { at: NOW, audience: "CITIZEN" })).toHaveLength(1);
    expect(repository.listRetrievableVersions(TENANT_A, { at: NOW, audience: "STAFF", departmentId: DEPARTMENT_A })).toHaveLength(1);
    expect(repository.listRetrievableVersions(TENANT_A, { at: new Date("2026-08-12T00:00:00.000Z"), audience: "STAFF", departmentId: DEPARTMENT_B })).toHaveLength(0);
    expect(repository.listRetrievableVersions(TENANT_B, { at: NOW, audience: "STAFF", departmentId: DEPARTMENT_B })).toHaveLength(0);
    expect(() => repository.getVersion(TENANT_B, publicVersion.version.id)).toThrowError(/TENANT_BOUNDARY/);
  });

  it("requires explicit approval for unknown dates and only exposes chunks after activation", () => {
    const repository = new InMemoryKnowledgeRepository(() => NOW);
    const created = repository.createVersion(input({ checksumSha256: "f".repeat(64), idempotencyKey: "document-upload-006", effectiveFrom: null, effectiveUntil: null, effectiveDateUnknown: true }));
    processToEvaluation(repository, TENANT_A, created.version.id);
    expect(() => repository.approveVersion(TENANT_A, created.version.id, { approvedBy: "staff-approver", now: NOW })).toThrowError(/EFFECTIVE_DATE_REQUIRED/);
    repository.approveVersion(TENANT_A, created.version.id, { approvedBy: "staff-approver", confirmUnknownEffectiveDate: true, now: NOW });
    const chunk = repository.addChunk(TENANT_A, {
      documentVersionId: created.version.id,
      chunkType: "ATOMIC_FAQ",
      chunkIndex: 0,
      displayText: "คำถาม",
      searchText: "คำถาม",
      visibility: "PUBLIC",
      authorityLevel: 90,
      sourceLocator: { paragraphIndex: 1 },
      sourceHash: "chunk-hash-1",
      tokenCount: 2,
      language: "th",
      now: NOW,
    });
    expect(repository.listSearchableChunks(TENANT_A, { at: NOW })).toHaveLength(0);
    repository.activateApprovedVersion(TENANT_A, created.version.id, NOW);
    expect(repository.listSearchableChunks(TENANT_A, { at: NOW }).map((value) => value.id)).toEqual([chunk.id]);
  });

  it("activates an evaluated version from a complete SYSTEM_UNIT_GATE receipt without human approval", () => {
    const repository = new InMemoryKnowledgeRepository(() => NOW);
    const created = repository.createVersion(input({ checksumSha256: "1".repeat(64), idempotencyKey: "unit-gate-activation-001" }));
    processToEvaluation(repository, TENANT_A, created.version.id);
    const active = repository.unitGateAndActivate(TENANT_A, created.version.id, UNIT_GATE_RECEIPT, NOW);
    expect(active.state).toBe("ACTIVE");
    expect(active.approvalStatus).toBe("PENDING");
    expect(active.activationStatus).toBe("UNIT_GATED");
    expect(active.activatedBy).toBe("SYSTEM_UNIT_GATE");
    expect(active.unitGateReportHash).toBe(UNIT_GATE_RECEIPT.reportHash);
    expect(active.unitGatePassedTestIds).toEqual(UNIT_GATE_RECEIPT.passedTestIds);
    expect(repository.listRetrievableVersions(TENANT_A, { at: NOW }).map((version) => version.id)).toEqual([created.version.id]);
  });

  it("rejects an incomplete unit-gate receipt and cross-tenant activation", () => {
    const repository = new InMemoryKnowledgeRepository(() => NOW);
    const created = repository.createVersion(input({ checksumSha256: "2".repeat(64), idempotencyKey: "unit-gate-activation-002" }));
    processToEvaluation(repository, TENANT_A, created.version.id);
    expect(() => repository.unitGateAndActivate(TENANT_A, created.version.id, { ...UNIT_GATE_RECEIPT, passedTestIds: [] }, NOW)).toThrowError(/UNIT_GATE_REQUIRED/);
    expect(() => repository.unitGateAndActivate(TENANT_B, created.version.id, UNIT_GATE_RECEIPT, NOW)).toThrowError(/TENANT_BOUNDARY/);
  });
});
