import { describe, expect, it } from "vitest";

import type { IndexChunk, IndexFact } from "./indexer";
import { documentTitlesFromChunks, retrievalEntitiesFromFacts } from "./runtime-context";

const fact = (overrides: Partial<IndexFact> = {}): IndexFact => ({
  id: "fact-1",
  tenantId: "tenant-a",
  documentVersionId: "version-fitness",
  entityType: "MUNICIPAL_SOURCE",
  entityKey: "fitness-center:single-visit-fee",
  entityDisplayName: "ศูนย์ส่งเสริมสุขภาพเทศบาลเมืองฉะเชิงเทรา (Fitness Center)",
  factType: "FEE",
  factKey: "fee",
  valueJson: { raw: "ค่าบริการรายครั้ง 30 บาท" },
  normalizedValue: "ค่าบริการรายครั้ง 30 บาท",
  authorityLevel: 70,
  visibility: "PUBLIC",
  sourceChunkId: "chunk-fitness",
  sourceLocator: { sectionPath: ["ฟิตเนส.docx", "table-1"] },
  sourceQuote: "ค่าบริการรายครั้ง 30 บาท",
  extractionMethod: "RULE",
  reviewStatus: "APPROVED",
  ...overrides,
});

describe("runtime knowledge context", () => {
  it("groups facts by service entity and uses the source title as a Thai alias", () => {
    const entities = retrievalEntitiesFromFacts([
      fact(),
      fact({ id: "fact-2", factType: "BUSINESS_HOURS", entityKey: "fitness-center:hours" }),
    ]);

    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({ key: "fitness-center", label: expect.stringContaining("Fitness Center") });
    expect(entities[0]?.aliases).toContain("ฟิตเนส");
  });

  it("builds citizen citation titles from document source locators", () => {
    const chunk = {
      id: "chunk-fitness",
      documentVersionId: "version-fitness",
      sourceLocator: { sectionPath: ["ฟิตเนส.docx", "table-1"] },
    } as IndexChunk;

    expect(documentTitlesFromChunks([chunk])).toEqual({ "version-fitness": "ฟิตเนส" });
  });
});
