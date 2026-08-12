import { describe, expect, it } from "vitest";
import type { IndexChunk, IndexFact } from "./indexer";
import { DEFAULT_RETRIEVAL_POLICY, RetrievalDomainError, normalizeRetrievalText, retrieve, retrievalPolicyFromRow, understandQuery } from "./retriever";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const DEPARTMENT_A = "department-a";
const AT = "2026-08-11T00:00:00.000Z";

const chunk = (input: Partial<IndexChunk> & Pick<IndexChunk, "id" | "tenantId" | "displayText" | "sourceHash">): IndexChunk => ({
  documentVersionId: "version-a",
  chunkType: "ATOMIC_FACT_GROUP",
  chunkIndex: 0,
  searchText: input.displayText,
  entityKeys: [],
  topicKeys: [],
  factTypes: [],
  visibility: "PUBLIC",
  ownerDepartmentId: DEPARTMENT_A,
  authorityLevel: 90,
  sourceLocator: { sectionPath: ["service"], paragraphIndex: 1 },
  tokenCount: 20,
  language: "mixed",
  createdAt: AT,
  ...input,
});

const fact = (input: Partial<IndexFact> & Pick<IndexFact, "id" | "sourceChunkId" | "factType" | "normalizedValue">): IndexFact => ({
  tenantId: TENANT_A,
  documentVersionId: "version-a",
  entityType: "SERVICE",
  entityKey: "service-a",
  entityDisplayName: "Service A",
  factKey: `${input.factType}|${input.normalizedValue}`,
  valueJson: { raw: input.normalizedValue },
  unit: undefined,
  validFrom: AT,
  validUntil: "2027-01-01T00:00:00.000Z",
  authorityLevel: 90,
  visibility: "PUBLIC",
  sourceLocator: { sectionPath: ["service"], paragraphIndex: 1 },
  sourceQuote: input.normalizedValue,
  extractionMethod: "RULE",
  reviewStatus: "APPROVED",
  ...input,
});

const source = (chunks: IndexChunk[], facts: IndexFact[]) => ({
  listSearchableChunks: (_tenantId: string) => chunks,
  listSearchableFacts: (_tenantId: string) => facts,
});

describe("knowledge hybrid retrieval", () => {
  it("normalizes Thai digits, preserves original/negation and resolves fact intent", () => {
    const plan = understandQuery("ค่าธรรมเนียม ๙๐๐ บาท ไม่รวมอะไร", { now: AT });
    expect(plan.originalQuestion).toContain("๙๐๐");
    expect(plan.normalizedQuestion).toContain("900");
    expect(plan.requestedFactTypes).toContain("FEE");
    expect(plan.preservedTerms).toContain("ไม่");
    expect(plan.language).toBe("th");
  });

  it("uses exact facts plus lexical ranking and never accepts dense IDs outside tenant scope", () => {
    const publicChunk = chunk({ id: "chunk-a", tenantId: TENANT_A, displayText: "Service A phone 02-123-4567 and fee 900 baht", sourceHash: "hash-a" });
    const tenantBChunk = chunk({ id: "chunk-b", tenantId: TENANT_B, displayText: "Service A phone 02-999-9999", sourceHash: "hash-b" });
    const approvedPhone = fact({ id: "fact-phone", sourceChunkId: publicChunk.id, factType: "PHONE", normalizedValue: "02-123-4567" });
    const pendingPhone = fact({ id: "fact-pending", sourceChunkId: publicChunk.id, factType: "PHONE", normalizedValue: "02-000-0000", reviewStatus: "PENDING" });
    const result = retrieve(source([publicChunk, tenantBChunk], [approvedPhone, pendingPhone]), TENANT_A, "phone 02-123-4567", {
      at: AT,
      denseRetriever: () => [{ chunkId: tenantBChunk.id, score: 1 }, { chunkId: publicChunk.id, score: 0.8 }],
    });
    expect(result.outcome).toBe("READY");
    expect(result.evidence[0]?.chunk.id).toBe(publicChunk.id);
    expect(result.matchedFacts.map((item) => item.id)).toEqual([approvedPhone.id]);
    expect(result.candidates.every((item) => item.chunk.tenantId === TENANT_A)).toBe(true);
    expect(result.trace.denseCandidateCount).toBe(1);
    expect(result.coverage.complete).toBe(true);
  });

  it("applies RRF deterministically, source/section diversity and context budget", () => {
    const chunks = [
      chunk({ id: "chunk-1", tenantId: TENANT_A, displayText: "service permit application process", sourceHash: "same-source", chunkIndex: 0 }),
      chunk({ id: "chunk-2", tenantId: TENANT_A, displayText: "service permit application fee", sourceHash: "same-source", chunkIndex: 1 }),
      chunk({ id: "chunk-3", tenantId: TENANT_A, displayText: "service permit office hours", sourceHash: "different-source", sourceLocator: { sectionPath: ["contact"], paragraphIndex: 2 } }),
    ];
    const options = {
      at: AT,
      policy: { contextBudgetTokens: 35 },
      denseRetriever: ({ chunks: allowed }: { chunks: readonly IndexChunk[] }) => allowed.map((item, index) => ({ chunkId: item.id, score: 1 - index / 10 })),
    };
    const first = retrieve(source(chunks, []), TENANT_A, "service permit", options);
    const second = retrieve(source(chunks, []), TENANT_A, "service permit", options);
    expect(first.evidence.map((item) => item.chunk.id)).toEqual(second.evidence.map((item) => item.chunk.id));
    expect(first.evidence.filter((item) => item.chunk.sourceHash === "same-source")).toHaveLength(1);
    expect(first.contextChunks.reduce((sum, item) => sum + item.tokenCount, 0)).toBeLessThanOrEqual(35);
  });

  it("clarifies ambiguous entities or missing as-of time before retrieval", () => {
    const entities = [
      { type: "DEPARTMENT", key: "dept-a", label: "district office", aliases: ["office"] },
      { type: "DEPARTMENT", key: "dept-b", label: "regional office", aliases: ["office"] },
    ];
    const plan = understandQuery("opening hours for office", { entities, now: AT });
    expect(plan.ambiguity.isAmbiguous).toBe(true);
    const ambiguous = retrieve(source([], []), TENANT_A, "opening hours for office", { entities, at: AT });
    expect(ambiguous.outcome).toBe("CLARIFY");
    expect(ambiguous.reasonCode).toBe("AMBIGUOUS_ENTITY");
    const missingTime = retrieve(source([], []), TENANT_A, "opening hours", { at: AT, requireAsOfDate: true });
    expect(missingTime.outcome).toBe("CLARIFY");
    expect(missingTime.reasonCode).toBe("MISSING_TIME");
  });

  it("resolves a bounded catalog typo and loads all policy thresholds from a versioned row", () => {
    const plan = understandQuery("opening hours for district ofice", {
      now: AT,
      entities: [{ type: "DEPARTMENT", key: "dept-a", label: "district office" }],
    });
    expect(plan.entityCandidates[0]?.confidenceBand).toBe("LOW");
    const policy = retrievalPolicyFromRow({
      version: 2, rrf_k: 60, dense_candidate_k: 20, lexical_candidate_k: 25, rerank_k: 10,
      evidence_k: 6, context_budget_tokens: 4000, max_per_source_hash: 1, max_per_section: 2,
      max_per_version: 6, min_calibrated_score: "0.2", lexical_weight: "0.5", dense_weight: "0.3",
      exact_boost: "0.4", authority_weight: "0.1", entity_boost: "0.2", freshness_weight: "0.1",
    });
    expect(policy.version).toBe("retrieval-policy-v2");
    expect(policy.rrfK).toBe(60);
    expect(policy.contextBudgetTokens).toBe(4000);
  });

  it("fails safe on conflicting approved facts and invalid policy", () => {
    const publicChunk = chunk({ id: "chunk-a", tenantId: TENANT_A, displayText: "phone 02-123-4567", sourceHash: "hash-a" });
    const result = retrieve(source([publicChunk], [
      fact({ id: "fact-one", sourceChunkId: publicChunk.id, factType: "PHONE", normalizedValue: "02-123-4567" }),
      fact({ id: "fact-two", sourceChunkId: publicChunk.id, factType: "PHONE", normalizedValue: "02-765-4321" }),
    ]), TENANT_A, "phone", { at: AT });
    expect(result.outcome).toBe("HANDOFF");
    expect(result.reasonCode).toBe("CONFLICTING_EVIDENCE");
    expect(result.conflicts).toHaveLength(1);
    expect(() => retrieve(source([], []), TENANT_A, "test", { policy: { rrfK: 0 } })).toThrowError(RetrievalDomainError);
    expect(DEFAULT_RETRIEVAL_POLICY.rrfK).toBe(50);
  });

  it("rejects an empty query and exposes stable normalization", () => {
    expect(normalizeRetrievalText("  SERVICE\u200b  ๙๐๐ ")).toBe("service 900");
    expect(() => understandQuery("  ")).toThrowError(/EMPTY_QUERY/);
  });
});
