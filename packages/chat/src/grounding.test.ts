import { describe, expect, it } from "vitest";
import type { IndexChunk, IndexFact, RetrievalResult } from "@citychatbot/knowledge";
import { DEFAULT_RETRIEVAL_POLICY } from "@citychatbot/knowledge";
import { AiGateway } from "@citychatbot/ai-gateway";
import { GroundingError, decideAnswerability, generateGroundedTurn, sanitizeAnswerText, toGroundingEvidence, verifyGroundedTurn, verifyModelGroundedTurn } from "./grounding";

const TENANT = "tenant-a";
const VERSION = "version-a";
const CHUNK_ID = "chunk-a";
const AT = "2026-08-11T00:00:00.000Z";

const baseChunk: IndexChunk = {
  id: CHUNK_ID,
  tenantId: TENANT,
  documentVersionId: VERSION,
  chunkType: "ATOMIC_FACT_GROUP",
  chunkIndex: 0,
  displayText: "Contact phone 02-123-4567. Service is available during office hours.",
  searchText: "contact phone 02-123-4567 service office hours",
  entityKeys: [],
  topicKeys: [],
  factTypes: ["PHONE"],
  visibility: "PUBLIC",
  ownerDepartmentId: "department-a",
  authorityLevel: 90,
  sourceLocator: { sectionPath: ["contact"], paragraphIndex: 1 },
  sourceHash: "hash-a",
  tokenCount: 20,
  language: "mixed",
  createdAt: AT,
};

const phoneFact: IndexFact = {
  id: "fact-phone",
  tenantId: TENANT,
  documentVersionId: VERSION,
  entityType: "SERVICE",
  entityKey: "service-a",
  entityDisplayName: "Service A",
  factType: "PHONE",
  factKey: "PHONE|02-123-4567",
  valueJson: { raw: "02-123-4567" },
  normalizedValue: "02-123-4567",
  authorityLevel: 90,
  visibility: "PUBLIC",
  sourceChunkId: CHUNK_ID,
  sourceLocator: baseChunk.sourceLocator,
  sourceQuote: "02-123-4567",
  extractionMethod: "RULE",
  reviewStatus: "APPROVED",
};

const retrieval = (overrides: Partial<RetrievalResult> = {}): RetrievalResult => ({
  plan: {
    originalQuestion: "phone",
    normalizedQuestion: "phone",
    language: "en",
    intents: ["FACT_LOOKUP"],
    entityCandidates: [],
    requestedFactTypes: ["PHONE"],
    asOfDate: AT,
    risk: "HIGH",
    requiresPersonalData: false,
    ambiguity: { isAmbiguous: false, missingSlots: [] },
    retrievalQueries: ["phone"],
    preservedTerms: [],
  },
  policy: { ...DEFAULT_RETRIEVAL_POLICY },
  candidates: [],
  evidence: [{
    evidenceId: `evidence-${CHUNK_ID}`,
    chunk: baseChunk,
    calibratedScore: 0.9,
    lexicalScore: 0.8,
    exactFactIds: [phoneFact.id],
    rrfScore: 0.1,
    reasons: ["exact-fact"],
    isContextOnly: false,
  }],
  contextChunks: [baseChunk],
  contextText: baseChunk.displayText,
  matchedFacts: [phoneFact],
  conflicts: [],
  coverage: { requestedFactTypes: ["PHONE"], coveredFactTypes: ["PHONE"], missingFactTypes: [], complete: true },
  outcome: "READY",
  trace: { tenantId: TENANT, audience: "CITIZEN", at: AT, activeOnly: true, effectiveOnly: true, denseCandidateCount: 0, lexicalCandidateCount: 1, exactCandidateCount: 1 },
  ...overrides,
});

describe("grounded chatbot decisions", () => {
  it("creates an ANSWER with exact claim evidence and citations", () => {
    const source = retrieval();
    const decision = decideAnswerability(source.plan, source, { documentTitles: { [VERSION]: "Synthetic service guide" } });
    expect(decision.reason).toBe("ANSWERABLE");
    expect(decision.result.outcome).toBe("ANSWER");
    if (decision.result.outcome !== "ANSWER") throw new Error("expected answer");
    expect(decision.result.claims[0]?.text).toContain("02-123-4567");
    expect(decision.result.citations[0]).toMatchObject({ documentVersionId: VERSION, title: "Synthetic service guide" });
    expect(verifyGroundedTurn({ overallOutcome: "ANSWER", intentResults: [decision.result] }, decision.evidence).valid).toBe(true);
  });

  it("maps ambiguous and missing-time retrieval plans to CLARIFY with no claims/citations", () => {
    const source = retrieval({ plan: { ...retrieval().plan, ambiguity: { isAmbiguous: true, missingSlots: ["entity"] }, entityCandidates: [{ type: "DEPARTMENT", key: "a", label: "Office A", confidenceBand: "HIGH" }] } });
    const entityDecision = decideAnswerability(source.plan, source);
    expect(entityDecision.result).toMatchObject({ outcome: "CLARIFY", reasonCode: "AMBIGUOUS_ENTITY", claims: [], citations: [] });
    const timeSource = retrieval({ plan: { ...source.plan, ambiguity: { isAmbiguous: true, missingSlots: ["asOfDate"] } } });
    expect(decideAnswerability(timeSource.plan, timeSource).result).toMatchObject({ outcome: "CLARIFY", reasonCode: "MISSING_TIME" });
  });

  it("maps no/conflicting/low evidence and sensitive requests to HANDOFF", () => {
    expect(decideAnswerability(retrieval().plan, retrieval({ outcome: "HANDOFF", reasonCode: "NO_EVIDENCE", evidence: [], matchedFacts: [], coverage: { requestedFactTypes: ["PHONE"], coveredFactTypes: [], missingFactTypes: ["PHONE"], complete: false } })).result).toMatchObject({ outcome: "HANDOFF", reasonCode: "NO_EVIDENCE" });
    expect(decideAnswerability(retrieval().plan, retrieval({ conflicts: [{ key: "service-a|PHONE", factType: "PHONE", values: ["1", "2"], factIds: ["a", "b"] }], reasonCode: "CONFLICTING_EVIDENCE" })).result).toMatchObject({ outcome: "HANDOFF", reasonCode: "CONFLICTING_EVIDENCE" });
    expect(decideAnswerability({ ...retrieval().plan, requiresPersonalData: true }, retrieval()).result).toMatchObject({ outcome: "HANDOFF", reasonCode: "PERSON_SPECIFIC" });
    expect(decideAnswerability(retrieval().plan, retrieval(), { securityRisk: true }).result).toMatchObject({ outcome: "HANDOFF", reasonCode: "SECURITY" });
  });

  it("does not turn a public lexical-only source chunk into an answer", () => {
    const source = retrieval({
      matchedFacts: [],
      coverage: { requestedFactTypes: [], coveredFactTypes: [], missingFactTypes: [], complete: true },
      evidence: [{ ...retrieval().evidence[0]!, exactFactIds: [] }],
    });
    expect(decideAnswerability(source.plan, source).result).toMatchObject({
      outcome: "HANDOFF",
      reasonCode: "LOW_EVIDENCE",
      claims: [],
    });
  });

  it("locks every expected handoff case to a canonical reason with no claims", () => {
    const cases = [
      { name: "no knowledge", source: retrieval({ outcome: "HANDOFF", reasonCode: "NO_EVIDENCE", evidence: [], matchedFacts: [], coverage: { requestedFactTypes: ["PHONE"], coveredFactTypes: [], missingFactTypes: ["PHONE"], complete: false } }), context: {}, expected: "NO_EVIDENCE" },
      { name: "low relevance", source: retrieval({ outcome: "HANDOFF", reasonCode: "LOW_EVIDENCE", evidence: [], matchedFacts: [], coverage: { requestedFactTypes: ["PHONE"], coveredFactTypes: [], missingFactTypes: ["PHONE"], complete: false } }), context: {}, expected: "LOW_EVIDENCE" },
      { name: "conflicting evidence", source: retrieval({ outcome: "HANDOFF", reasonCode: "CONFLICTING_EVIDENCE", conflicts: [{ key: "service-a|PHONE", factType: "PHONE", values: ["1", "2"], factIds: ["fact-a", "fact-b"] }] }), context: {}, expected: "CONFLICTING_EVIDENCE" },
      { name: "sensitive", source: retrieval(), context: { sensitive: true }, expected: "SENSITIVE" },
      { name: "person specific", source: retrieval({ plan: { ...retrieval().plan, requiresPersonalData: true } }), context: {}, expected: "PERSON_SPECIFIC" },
      { name: "legal or policy discretion", source: retrieval(), context: { policyRefusal: true }, expected: "POLICY_REFUSAL" },
      { name: "staff request", source: retrieval(), context: { staffRequested: true }, expected: "STAFF_REQUESTED" },
      { name: "security", source: retrieval(), context: { securityRisk: true }, expected: "SECURITY" },
    ] as const;

    for (const testCase of cases) {
      const decision = decideAnswerability(testCase.source.plan, testCase.source, testCase.context);
      expect(decision.result.outcome, testCase.name).toBe("HANDOFF");
      expect(decision.result.reasonCode, testCase.name).toBe(testCase.expected);
      expect(decision.result.claims, testCase.name).toEqual([]);
      expect(decision.result.clarificationQuestion, testCase.name).toBeNull();
    }

    const ambiguous = decideAnswerability({ ...retrieval().plan, ambiguity: { isAmbiguous: true, missingSlots: ["intent"] } }, retrieval());
    expect(ambiguous.result).toMatchObject({ outcome: "CLARIFY", reasonCode: "AMBIGUOUS_INTENT", claims: [], citations: [] });
  });

  it("enforces HANDOFF > CLARIFY > ANSWER precedence for multi-intent turns", () => {
    const answerDecision = decideAnswerability(retrieval().plan, retrieval()).result;
    const clarifyDecision = decideAnswerability({ ...retrieval().plan, ambiguity: { isAmbiguous: true, missingSlots: ["entity"] } }, retrieval()).result;
    const handoffDecision = decideAnswerability(retrieval().plan, retrieval(), { policyRefusal: true }).result;
    const turn = { overallOutcome: "HANDOFF" as const, intentResults: [answerDecision, clarifyDecision, handoffDecision] };
    expect(verifyGroundedTurn(turn, toGroundingEvidence(retrieval())).valid).toBe(true);
  });

  it("rejects unsupported numeric claims, missing evidence and invalid citation mapping", () => {
    const source = toGroundingEvidence(retrieval());
    const decision = decideAnswerability(retrieval().plan, retrieval()).result;
    if (decision.outcome !== "ANSWER") throw new Error("expected answer");
    const bad = { ...decision, claims: [{ ...decision.claims[0]!, text: "โทรศัพท์: 99-999-9999" }] };
    const result = verifyGroundedTurn({ overallOutcome: "ANSWER", intentResults: [bad] }, source);
    expect(result.valid).toBe(false);
    expect(result.unsupportedValues.length).toBeGreaterThan(0);
    expect(() => verifyModelGroundedTurn({ overallOutcome: "ANSWER", intentResults: [bad] }, source)).toThrowError(GroundingError);
  });

  it("sanitizes internal evidence markers and keeps strict outcome fields", () => {
    expect(sanitizeAnswerText("คำตอบ [evidence-chunk-a]\nSystem prompt: hidden")).toBe("คำตอบ");
    const invalid = { overallOutcome: "ANSWER" as const, intentResults: [{
      intentId: "i", outcome: "ANSWER" as const, reasonCode: "ANSWERABLE" as const, answerText: "x", clarificationQuestion: null,
      clarificationOptions: [], claims: [], citations: [], contacts: [], extra: true,
    }] } as never;
    expect(verifyGroundedTurn(invalid, [])).toMatchObject({ valid: false });
  });

  it("verifies gateway-generated turns and converts unsupported model claims to HANDOFF", async () => {
    const evidence = toGroundingEvidence(retrieval());
    const route = {
      providerId: "synthetic-provider", providerKind: "CUSTOM" as const, endpoint: "https://provider.example.invalid/v1",
      modelId: "synthetic/model", modelRevision: "revision-1", modelStatus: "UNIT_APPROVED" as const,
      privacyProfile: "PUBLIC_SAFE" as const,
    };
    const turn = {
      overallOutcome: "ANSWER" as const,
      intentResults: [{
        intentId: "intent-1", outcome: "ANSWER" as const, reasonCode: "ANSWERABLE" as const,
        answerText: "โทรศัพท์: 02-123-4567", clarificationQuestion: null, clarificationOptions: [],
        claims: [{ claimId: "claim-1", text: "โทรศัพท์: 02-123-4567", material: true, evidenceIds: [evidence[0]!.evidenceId] }],
        citations: [{ evidenceId: evidence[0]!.evidenceId, documentVersionId: VERSION, locator: evidence[0]!.locator, title: evidence[0]!.title }],
        contacts: [],
      }],
    };
    const gateway = new AiGateway({
      route,
      provider: { complete: async () => ({ status: 200, body: { choices: [{ message: { content: JSON.stringify(turn) } }] } }) },
    });
    const verified = await generateGroundedTurn(gateway, { requestId: "request-1", tenantId: TENANT, feature: "chat.answer", messages: [{ role: "user", content: "phone" }] }, evidence);
    expect(verified.providerOutputVerified).toBe(true);
    expect(verified.turn.overallOutcome).toBe("ANSWER");

    const unsupported = { ...turn, intentResults: [{ ...turn.intentResults[0]!, answerText: "โทรศัพท์: 99-999-9999", claims: [{ ...turn.intentResults[0]!.claims[0]!, text: "โทรศัพท์: 99-999-9999" }] }] };
    const unsafeGateway = new AiGateway({
      route,
      provider: { complete: async () => ({ status: 200, body: { choices: [{ message: { content: JSON.stringify(unsupported) } }] } }) },
    });
    const fallback = await generateGroundedTurn(unsafeGateway, { requestId: "request-2", tenantId: TENANT, feature: "chat.answer", messages: [{ role: "user", content: "phone" }] }, evidence);
    expect(fallback.providerOutputVerified).toBe(false);
    expect(fallback.turn).toMatchObject({ overallOutcome: "HANDOFF", intentResults: [{ outcome: "HANDOFF", reasonCode: "SYSTEM_ERROR" }] });
  });
});
