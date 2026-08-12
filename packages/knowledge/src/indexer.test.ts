import { describe, expect, it } from "vitest";
import { InMemoryKnowledgeIndexRepository, IndexDomainError, buildIndexGeneration } from "./indexer";
import { parseDocument } from "./parsers";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const DEPARTMENT_A = "department-a";
const CATEGORY = "category-civic";
const NOW = new Date("2026-08-10T00:00:00.000Z");

const parsed = parseDocument(new TextEncoder().encode(
  "# บริการต่อเชื่อมท่อ\n\nถาม : ติดต่อที่ไหน\nตอบ : โทร 02-123-4567\n\nค่าธรรมเนียม: 900 บาท/ม²\n\n| รายการ | ค่าธรรมเนียม |\n| --- | --- |\n| ถนน ค.ส.ล. | 900 บาท/ม² |\n| ท่อ | 1,500 บาท/ม² |\n\nขั้นตอน 1: ยื่นเอกสาร\nขั้นตอน 2: รอตรวจสอบ",
), { filename: "fixture.md" });

const build = (overrides: Partial<Parameters<typeof buildIndexGeneration>[0]> = {}) => buildIndexGeneration({
  tenantId: TENANT_A,
  documentVersionId: "version-a",
  versionState: "INDEXING",
  approvalStatus: "APPROVED",
  visibility: "PUBLIC",
  ownerDepartmentId: DEPARTMENT_A,
  authorityLevel: 90,
  effectiveFrom: NOW,
  effectiveUntil: new Date("2027-01-01T00:00:00.000Z"),
  parsed,
  now: NOW,
  ...overrides,
});

describe("knowledge semantic index", () => {
  it("creates deterministic section/table/FAQ chunks with header lineage and exact facts", () => {
    const generation = build();
    expect(generation.state).toBe("READY");
    expect(generation.embeddingStatus).toBe("LEXICAL_EXACT");
    expect(generation.configHash).toMatch(/^[a-f0-9]{64}$/);
    expect(generation.chunks.every((chunk) => chunk.tokenCount <= 700)).toBe(true);
    expect(generation.chunks.some((chunk) => chunk.chunkType === "ATOMIC_FAQ")).toBe(true);
    const tableRows = generation.chunks.filter((chunk) => chunk.chunkType === "TABLE_ROW");
    expect(tableRows).toHaveLength(2);
    expect(tableRows[0]?.displayText).toContain("ค่าธรรมเนียม");
    expect(tableRows[0]?.sourceLocator.rowIndex).toBe(1);
    expect(generation.facts.some((fact) => fact.factType === "PHONE" && fact.normalizedValue.includes("02"))).toBe(true);
    expect(generation.facts.some((fact) => fact.factType === "FEE" && fact.unit === "บาท")).toBe(true);
    expect(generation.facts.every((fact) => fact.sourceChunkId.length > 0 && fact.sourceQuote.length > 0)).toBe(true);
  });

  it("repeating the same source/config produces identical ids and content", () => {
    const first = build();
    const second = build();
    expect(second.id).toBe(first.id);
    expect(second.configHash).toBe(first.configHash);
    expect(JSON.stringify(second.chunks)).toBe(JSON.stringify(first.chunks));
    expect(JSON.stringify(second.facts)).toBe(JSON.stringify(first.facts));
  });

  it("keeps unreviewed facts out of the active alias and applies tenant/effective filters", () => {
    const repository = new InMemoryKnowledgeIndexRepository();
    const generation = repository.registerGeneration(build());
    expect(() => repository.activateGeneration(TENANT_A, generation.id, { versionState: "ACTIVE", approvalStatus: "APPROVED", at: NOW })).toThrowError(/FACT_REVIEW_REQUIRED/);
    repository.approveFacts(TENANT_A, generation.id, generation.facts.map((fact) => fact.id), "knowledge-reviewer", NOW);
    repository.activateGeneration(TENANT_A, generation.id, { versionState: "ACTIVE", approvalStatus: "APPROVED", at: NOW });
    expect(repository.listSearchableChunks(TENANT_A, { at: NOW }).length).toBeGreaterThan(0);
    expect(repository.listSearchableFacts(TENANT_A, { at: NOW }).length).toBe(generation.facts.length);
    expect(repository.listSearchableChunks(TENANT_B, { at: NOW })).toEqual([]);
    expect(repository.listSearchableChunks(TENANT_A, { at: new Date("2028-01-01T00:00:00.000Z") })).toEqual([]);
    expect(() => repository.getGeneration(TENANT_B, generation.id)).toThrowError(new IndexDomainError("TENANT_BOUNDARY", "index generation belongs to another tenant"));
  });

  it("switches and rolls back immutable index generations without changing source chunks", () => {
    const repository = new InMemoryKnowledgeIndexRepository();
    const first = repository.registerGeneration(build());
    repository.approveFacts(TENANT_A, first.id, first.facts.map((fact) => fact.id), "reviewer", NOW);
    repository.activateGeneration(TENANT_A, first.id, { versionState: "ACTIVE", approvalStatus: "APPROVED", at: NOW });
    const second = repository.registerGeneration(build({ documentVersionId: "version-b" }));
    repository.approveFacts(TENANT_A, second.id, second.facts.map((fact) => fact.id), "reviewer", NOW);
    repository.activateGeneration(TENANT_A, second.id, { versionState: "ACTIVE", approvalStatus: "APPROVED", at: NOW });
    expect(repository.listSearchableChunks(TENANT_A, { at: NOW })[0]?.documentVersionId).toBe("version-b");
    const beforeRollback = repository.getGeneration(TENANT_A, first.id).chunks.map((chunk) => ({ id: chunk.id, sourceHash: chunk.sourceHash }));
    repository.rollbackGeneration(TENANT_A, first.id, NOW);
    expect(repository.listSearchableChunks(TENANT_A, { at: NOW })[0]?.documentVersionId).toBe("version-a");
    expect(repository.getGeneration(TENANT_A, first.id).chunks.map((chunk) => ({ id: chunk.id, sourceHash: chunk.sourceHash }))).toEqual(beforeRollback);
  });

  it("does not fabricate embeddings when no approved model registry profile exists", () => {
    const generation = build({ config: { embeddingModelId: "embedding-not-certified", embeddingDimension: 3 } });
    expect(generation.embeddingStatus).toBe("PENDING_MODEL_REGISTRY");
    expect(generation.chunks.every((chunk) => chunk.embedding === undefined)).toBe(true);
  });
});

