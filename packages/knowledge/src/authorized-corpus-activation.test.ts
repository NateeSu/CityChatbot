import { describe, expect, it } from "vitest";
import { buildIndexGeneration } from "./indexer";
import { parseDocument } from "./parsers";

const parsed = parseDocument(new TextEncoder().encode(
  "ค่าธรรมเนียม: ค่าบริการรายครั้ง 30 บาท\n\nโทร 081-6823355\n\nADL ≤ 6",
), { filename: "authorized-fixture.txt" });

describe("authorised corpus screening", () => {
  it("keeps exact symbols but excludes PII chunks before public index materialisation", () => {
    const generation = buildIndexGeneration({
      tenantId: "tenant-a",
      documentVersionId: "version-a",
      versionState: "INDEXING",
      approvalStatus: "PENDING",
      visibility: "PUBLIC",
      ownerDepartmentId: "department-a",
      authorityLevel: 70,
      effectiveFrom: "2026-08-13T00:00:00.000Z",
      parsed,
      now: "2026-08-13T00:00:00.000Z",
      screenChunk: ({ text }) => !text.includes("081-6823355"),
      scopeFact: ({ fact }) => fact.factType === "FEE"
        ? {
            entityType: "MUNICIPAL_SOURCE",
            entityKey: "fitness-center:single-visit-fee",
            entityDisplayName: "Fitness Center",
            reviewStatus: "APPROVED",
            reviewedBy: "SYSTEM_UNIT_GATE",
            reviewedAt: "2026-08-13T00:00:00.000Z",
          }
        : null,
    });

    expect(generation.chunks.some((chunk) => chunk.displayText.includes("081-6823355"))).toBe(false);
    expect(generation.chunks.some((chunk) => chunk.displayText.includes("≤ 6"))).toBe(true);
    expect(generation.facts).toHaveLength(1);
    expect(generation.facts[0]).toMatchObject({
      factType: "FEE",
      entityKey: "fitness-center:single-visit-fee",
      reviewStatus: "APPROVED",
      reviewedBy: "SYSTEM_UNIT_GATE",
    });
  });

  it("keeps stable output when a screening policy is rerun", () => {
    const options = {
      tenantId: "tenant-a",
      documentVersionId: "version-a",
      versionState: "INDEXING" as const,
      approvalStatus: "PENDING" as const,
      visibility: "PUBLIC" as const,
      ownerDepartmentId: "department-a",
      authorityLevel: 70,
      effectiveFrom: "2026-08-13T00:00:00.000Z",
      parsed,
      now: "2026-08-13T00:00:00.000Z",
      screenChunk: ({ text }: { text: string }) => !text.includes("081-6823355"),
      scopeFact: () => null,
    };
    expect(buildIndexGeneration(options)).toEqual(buildIndexGeneration(options));
  });
});
