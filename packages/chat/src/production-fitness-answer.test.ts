import { describe, expect, it } from "vitest";

import {
  documentTitlesFromChunks,
  retrievalEntitiesFromFacts,
  retrieve,
  type IndexChunk,
  type IndexFact,
  type RetrievalSource,
} from "@citychatbot/knowledge";

import { renderTurnForLine } from "./conversation";
import { decideAnswerability } from "./grounding";

const TENANT = "tenant-production-safe";
const AT = "2026-08-14T03:30:00.000Z";

const chunk = (input: {
  id: string;
  versionId: string;
  text: string;
  filename: string;
}): IndexChunk => ({
  id: input.id,
  tenantId: TENANT,
  documentVersionId: input.versionId,
  chunkType: "ATOMIC_FACT_GROUP",
  chunkIndex: 0,
  displayText: input.text,
  searchText: input.text,
  entityKeys: [],
  topicKeys: [],
  factTypes: ["FEE"],
  visibility: "PUBLIC",
  ownerDepartmentId: "municipal-owner",
  authorityLevel: 70,
  sourceLocator: { sectionPath: [input.filename] },
  sourceHash: `hash-${input.id}`,
  tokenCount: 12,
  language: "th",
  createdAt: AT,
});

const fact = (input: {
  id: string;
  versionId: string;
  chunkId: string;
  entityKey: string;
  entityName: string;
  value: string;
  filename: string;
}): IndexFact => ({
  id: input.id,
  tenantId: TENANT,
  documentVersionId: input.versionId,
  entityType: "MUNICIPAL_SOURCE",
  entityKey: input.entityKey,
  entityDisplayName: input.entityName,
  factType: "FEE",
  factKey: `FEE|${input.id}`,
  valueJson: { raw: input.value, policy: "AUTHORIZED_CORPUS_SAFE_FACT" },
  normalizedValue: input.value,
  authorityLevel: 70,
  visibility: "PUBLIC",
  sourceChunkId: input.chunkId,
  sourceLocator: { sectionPath: [input.filename] },
  sourceQuote: input.value,
  extractionMethod: "RULE",
  reviewStatus: "APPROVED",
});

describe("production-safe fitness answer", () => {
  it("renders one relevant fee in plain Thai with the actual source title", () => {
    const chunks = [
      chunk({ id: "fitness-chunk", versionId: "fitness-version", text: "ค่าบริการรายครั้ง 30 บาท", filename: "ฟิตเนส.docx" }),
      chunk({ id: "kcc-chunk", versionId: "kcc-version", text: "ไม่เสียค่าใช้จ่ายในการใช้บริการ", filename: "ศูนย์การเรียนรู้เมืองฉะเชิงเทรา KCC.docx" }),
    ];
    const facts = [
      fact({
        id: "fitness-fee",
        versionId: "fitness-version",
        chunkId: "fitness-chunk",
        entityKey: "fitness-center:single-visit-fee",
        entityName: "ศูนย์ส่งเสริมสุขภาพเทศบาลเมืองฉะเชิงเทรา (Fitness Center)",
        value: "ค่าบริการรายครั้ง 30 บาท",
        filename: "ฟิตเนส.docx",
      }),
      fact({
        id: "kcc-fee",
        versionId: "kcc-version",
        chunkId: "kcc-chunk",
        entityKey: "kcc-center:service-fee",
        entityName: "ศูนย์การเรียนรู้เมืองฉะเชิงเทรา (KCC)",
        value: "ไม่เสียค่าใช้จ่ายในการใช้บริการ",
        filename: "ศูนย์การเรียนรู้เมืองฉะเชิงเทรา KCC.docx",
      }),
    ];
    const source: RetrievalSource = {
      listSearchableChunks: (tenantId) => tenantId === TENANT ? chunks : [],
      listSearchableFacts: (tenantId) => tenantId === TENANT ? facts : [],
    };

    const retrieval = retrieve(source, TENANT, "ฟิตเนส ค่าธรรมเนียมรายครั้งเท่าไร", {
      at: AT,
      entities: retrievalEntitiesFromFacts(facts),
    });
    const decision = decideAnswerability(retrieval.plan, retrieval, {
      documentTitles: documentTitlesFromChunks(chunks),
    });
    const turn = { overallOutcome: decision.result.outcome, intentResults: [decision.result] };
    const rendered = renderTurnForLine(turn);

    expect(retrieval.matchedFacts.map((item) => item.id)).toEqual(["fitness-fee"]);
    expect(decision.result).toMatchObject({
      outcome: "ANSWER",
      reasonCode: "ANSWERABLE",
      answerText: "ค่าบริการรายครั้ง 30 บาท",
      claims: [{ text: "ค่าบริการรายครั้ง 30 บาท" }],
      citations: [{ title: "ฟิตเนส" }],
    });
    expect(rendered).toEqual({
      safe: true,
      text: "ค่าบริการรายครั้ง 30 บาท\nแหล่งข้อมูล: ฟิตเนส",
      sourceLabels: ["ฟิตเนส"],
    });
    expect(rendered.text).not.toContain("ไม่เสียค่าใช้จ่าย");
    expect(rendered.text).not.toContain("KCC");
  });
});
