import type {
  IndexFact,
  IndexFactType,
  RetrievalResult,
  QueryPlan,
} from "@citychatbot/knowledge";
import {
  type AiGateway,
  type AiMessage,
  type AiGatewayResult,
  strictJsonObjectSchema,
} from "@citychatbot/ai-gateway";

export type AnswerOutcome = "ANSWER" | "CLARIFY" | "HANDOFF";
export type ClarifyReasonCode = "AMBIGUOUS_ENTITY" | "MISSING_TIME" | "AMBIGUOUS_INTENT";
export type HandoffReasonCode = "NO_EVIDENCE" | "CONFLICTING_EVIDENCE" | "LOW_EVIDENCE" | "SENSITIVE" | "PERSON_SPECIFIC" | "POLICY_REFUSAL" | "SECURITY" | "STAFF_REQUESTED" | "SYSTEM_ERROR";
export type CanonicalReasonCode = "ANSWERABLE" | ClarifyReasonCode | HandoffReasonCode;

export type GroundedClaim = {
  claimId: string;
  text: string;
  material: boolean;
  evidenceIds: string[];
};

export type GroundedCitation = {
  evidenceId: string;
  documentVersionId: string;
  locator: string;
  title: string;
};

export type GroundedContact = {
  departmentId: string;
  label: string;
  phone: string;
};

export type AnswerIntentResult = {
  intentId: string;
  outcome: "ANSWER";
  reasonCode: "ANSWERABLE";
  answerText: string;
  clarificationQuestion: null;
  clarificationOptions: [];
  claims: GroundedClaim[];
  citations: GroundedCitation[];
  contacts: GroundedContact[];
};

export type ClarifyIntentResult = {
  intentId: string;
  outcome: "CLARIFY";
  reasonCode: ClarifyReasonCode;
  answerText: "";
  clarificationQuestion: string;
  clarificationOptions: string[];
  claims: [];
  citations: [];
  contacts: [];
};

export type HandoffIntentResult = {
  intentId: string;
  outcome: "HANDOFF";
  reasonCode: HandoffReasonCode;
  answerText: string;
  clarificationQuestion: null;
  clarificationOptions: [];
  claims: [];
  citations: GroundedCitation[];
  contacts: GroundedContact[];
};

export type IntentResult = AnswerIntentResult | ClarifyIntentResult | HandoffIntentResult;

export type GroundedTurn = {
  overallOutcome: AnswerOutcome;
  intentResults: IntentResult[];
};

export type GroundingEvidence = {
  evidenceId: string;
  documentVersionId: string;
  title: string;
  locator: string;
  text: string;
  exactValues: string[];
  public: boolean;
};

export type Contact = GroundedContact;

export type AnswerabilityContext = {
  intentId?: string;
  sensitive?: boolean;
  policyRefusal?: boolean;
  securityRisk?: boolean;
  staffRequested?: boolean;
  contacts?: Contact[];
  documentTitles?: Record<string, string>;
};

export type GroundingDecision = {
  result: IntentResult;
  evidence: GroundingEvidence[];
  reason: CanonicalReasonCode;
};

export type GroundingVerificationResult = {
  valid: boolean;
  checkedClaims: number;
  checkedCitations: number;
  unsupportedValues: string[];
  errors: string[];
};

export type GroundedGenerationInput = {
  requestId: string;
  tenantId: string;
  feature: string;
  messages: readonly AiMessage[];
  maxOutputTokens?: number;
};

export type GroundedGenerationResult = {
  turn: GroundedTurn;
  trace: AiGatewayResult<GroundedTurn>["trace"];
  providerOutputVerified: boolean;
};

export class GroundingError extends Error {
  constructor(
    public readonly code: "INVALID_DECISION" | "UNSUPPORTED_CLAIM" | "MISSING_CITATION" | "OUTCOME_MISMATCH",
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "GroundingError";
  }
}

const HANDOFF_COPY: Record<HandoffReasonCode, string> = {
  NO_EVIDENCE: "ยังไม่พบหลักฐานที่ยืนยันคำตอบนี้ได้ จึงขอส่งต่อให้เจ้าหน้าที่ตรวจสอบ",
  CONFLICTING_EVIDENCE: "พบข้อมูลจากแหล่งอ้างอิงที่ขัดกัน จึงขอส่งต่อให้เจ้าหน้าที่ตรวจสอบ",
  LOW_EVIDENCE: "หลักฐานที่พบยังไม่เพียงพอสำหรับคำตอบที่แน่ชัด จึงขอส่งต่อให้เจ้าหน้าที่ตรวจสอบ",
  SENSITIVE: "คำถามนี้เกี่ยวข้องกับข้อมูลหรือการตัดสินใจที่มีความละเอียดอ่อน จึงขอส่งต่อให้เจ้าหน้าที่",
  PERSON_SPECIFIC: "คำถามนี้เกี่ยวข้องกับข้อมูลเฉพาะบุคคล จึงขอส่งต่อให้เจ้าหน้าที่ตรวจสอบ",
  POLICY_REFUSAL: "ไม่สามารถดำเนินการตามคำขอนี้ได้ แต่เจ้าหน้าที่สามารถช่วยตรวจสอบแนวทางที่เหมาะสมได้",
  SECURITY: "ไม่สามารถยืนยันคำขอนี้อย่างปลอดภัยได้ จึงขอส่งต่อให้เจ้าหน้าที่",
  STAFF_REQUESTED: "กำลังส่งต่อคำขอนี้ให้เจ้าหน้าที่ตามที่ร้องขอ",
  SYSTEM_ERROR: "ระบบไม่พร้อมตอบคำถามนี้ในขณะนี้ จึงขอส่งต่อให้เจ้าหน้าที่",
};

const CLARIFY_COPY: Record<ClarifyReasonCode, string> = {
  AMBIGUOUS_ENTITY: "กรุณาระบุหน่วยงาน บริการ หรือสาขาที่ต้องการให้ชัดเจน",
  MISSING_TIME: "กรุณาระบุวันที่หรือช่วงเวลาที่ต้องการตรวจสอบ",
  AMBIGUOUS_INTENT: "กรุณาระบุว่าต้องการสอบถามข้อมูล ขั้นตอน หรือเอกสาร",
};

const factLabel = (factType: IndexFactType): string => ({
  DEPARTMENT_NAME: "หน่วยงาน",
  SERVICE_NAME: "บริการ",
  PERSON_NAME_ROLE: "ผู้รับผิดชอบ",
  PHONE: "โทรศัพท์",
  ADDRESS: "ที่อยู่",
  BUSINESS_HOURS: "เวลาทำการ",
  FEE: "ค่าธรรมเนียม",
  ELIGIBILITY: "คุณสมบัติ",
  AGE_LIMIT: "ช่วงอายุ",
  REQUIRED_DOCUMENT: "เอกสารที่ต้องใช้",
  PROCESS_STEP: "ขั้นตอน",
  DURATION: "ระยะเวลา",
  DATE: "วันที่",
  URL: "เว็บไซต์",
  BRANCH: "สาขา",
  DISCLAIMER: "หมายเหตุ",
}[factType] ?? factType);

const stableLocator = (locator: Record<string, unknown>): string => JSON.stringify(locator, Object.keys(locator).sort());
const normalizeValue = (value: string): string => value.normalize("NFC").toLocaleLowerCase("th-TH").replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - "๐".charCodeAt(0))).replace(/[^\p{L}\p{N}]+/gu, "");
const digits = (value: string): string => value.replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - "๐".charCodeAt(0))).replace(/\D/g, "");

const outcomeOf = (result: IntentResult): AnswerOutcome => result.outcome;
const expectedOverallOutcome = (results: readonly IntentResult[]): AnswerOutcome => results.some((result) => result.outcome === "HANDOFF")
  ? "HANDOFF"
  : results.some((result) => result.outcome === "CLARIFY") ? "CLARIFY" : "ANSWER";

const evidenceFromRetrieval = (retrieval: RetrievalResult, titles: Record<string, string> = {}): GroundingEvidence[] => retrieval.evidence.map((item) => ({
  evidenceId: item.evidenceId,
  documentVersionId: item.chunk.documentVersionId,
  title: titles[item.chunk.documentVersionId] ?? "เอกสารอ้างอิง",
  locator: stableLocator(item.chunk.sourceLocator),
  text: item.chunk.displayText,
  exactValues: retrieval.matchedFacts.filter((fact) => fact.sourceChunkId === item.chunk.id).map((fact) => fact.normalizedValue),
  public: item.chunk.visibility === "PUBLIC",
}));

const mapHandoffReason = (reason: RetrievalResult["reasonCode"]): HandoffReasonCode => {
  if (reason === "CONFLICTING_EVIDENCE") return "CONFLICTING_EVIDENCE";
  if (reason === "NO_EVIDENCE") return "NO_EVIDENCE";
  return "LOW_EVIDENCE";
};

export const toGroundingEvidence = evidenceFromRetrieval;

export const decideAnswerability = (
  plan: QueryPlan,
  retrieval: RetrievalResult,
  context: AnswerabilityContext = {},
): GroundingDecision => {
  const intentId = context.intentId ?? "intent-1";
  const evidence = evidenceFromRetrieval(retrieval, context.documentTitles);
  const contacts = context.contacts ?? [];
  if (context.securityRisk) return { result: handoff(intentId, "SECURITY", contacts), evidence, reason: "SECURITY" };
  if (context.policyRefusal) return { result: handoff(intentId, "POLICY_REFUSAL", contacts), evidence, reason: "POLICY_REFUSAL" };
  if (context.staffRequested) return { result: handoff(intentId, "STAFF_REQUESTED", contacts), evidence, reason: "STAFF_REQUESTED" };
  if (plan.requiresPersonalData) return { result: handoff(intentId, "PERSON_SPECIFIC", contacts), evidence, reason: "PERSON_SPECIFIC" };
  if (context.sensitive || plan.risk === "CRITICAL") return { result: handoff(intentId, "SENSITIVE", contacts), evidence, reason: "SENSITIVE" };
  if (plan.ambiguity.isAmbiguous) {
    const reason: ClarifyReasonCode = plan.ambiguity.missingSlots.includes("asOfDate") ? "MISSING_TIME" : plan.ambiguity.missingSlots.includes("entity") ? "AMBIGUOUS_ENTITY" : "AMBIGUOUS_INTENT";
    const options = plan.entityCandidates.slice(0, 4).map((entity) => entity.label);
    return { result: clarify(intentId, reason, options), evidence, reason };
  }
  if (retrieval.conflicts.length > 0 || retrieval.reasonCode === "CONFLICTING_EVIDENCE") return { result: handoff(intentId, "CONFLICTING_EVIDENCE", contacts, evidence), evidence, reason: "CONFLICTING_EVIDENCE" };
  if (retrieval.outcome === "HANDOFF") {
    const reason = mapHandoffReason(retrieval.reasonCode);
    return { result: handoff(intentId, reason, contacts, evidence), evidence, reason };
  }
  // A screened public chunk is useful as retrieval context but must never be
  // promoted verbatim into a citizen answer.  An ANSWER requires an explicit,
  // approved structured fact linked to one of the selected evidence chunks.
  if (!retrieval.coverage.complete || evidence.length === 0 || retrieval.matchedFacts.length === 0) {
    return { result: handoff(intentId, "LOW_EVIDENCE", contacts, evidence), evidence, reason: "LOW_EVIDENCE" };
  }
  const result = answer(intentId, retrieval.matchedFacts, evidence, contacts);
  const verification = verifyGroundedTurn({ overallOutcome: "ANSWER", intentResults: [result] }, evidence);
  if (!verification.valid) return { result: handoff(intentId, "SYSTEM_ERROR", contacts), evidence, reason: "SYSTEM_ERROR" };
  return { result, evidence, reason: "ANSWERABLE" };
};

const answer = (intentId: string, facts: readonly IndexFact[], evidence: readonly GroundingEvidence[], contacts: readonly GroundedContact[]): AnswerIntentResult => {
  const materialFacts = facts.filter((fact) => evidence.some((item) => item.evidenceId === `evidence-${fact.sourceChunkId}`));
  const claims = materialFacts.length > 0
    ? materialFacts.map((fact, index) => ({
      claimId: `claim-${index + 1}`,
      text: `${factLabel(fact.factType)}: ${fact.valueJson.raw as string ?? fact.normalizedValue}`,
      material: true,
      evidenceIds: [`evidence-${fact.sourceChunkId}`],
    }))
    : [{ claimId: "claim-1", text: evidence[0]!.text, material: true, evidenceIds: [evidence[0]!.evidenceId] }];
  const citations = evidence.map((item) => ({ evidenceId: item.evidenceId, documentVersionId: item.documentVersionId, locator: item.locator, title: item.title }));
  const answerText = claims.map((claim) => claim.text).join("\n");
  return {
    intentId,
    outcome: "ANSWER",
    reasonCode: "ANSWERABLE",
    answerText,
    clarificationQuestion: null,
    clarificationOptions: [],
    claims,
    citations,
    contacts: [...contacts],
  };
};

const clarify = (intentId: string, reasonCode: ClarifyReasonCode, options: string[]): ClarifyIntentResult => ({
  intentId,
  outcome: "CLARIFY",
  reasonCode,
  answerText: "",
  clarificationQuestion: CLARIFY_COPY[reasonCode],
  clarificationOptions: options,
  claims: [],
  citations: [],
  contacts: [],
});

const handoff = (intentId: string, reasonCode: HandoffReasonCode, contacts: readonly GroundedContact[], evidence: readonly GroundingEvidence[] = []): HandoffIntentResult => ({
  intentId,
  outcome: "HANDOFF",
  reasonCode,
  answerText: HANDOFF_COPY[reasonCode],
  clarificationQuestion: null,
  clarificationOptions: [],
  claims: [],
  citations: evidence.slice(0, 8).map((item) => ({ evidenceId: item.evidenceId, documentVersionId: item.documentVersionId, locator: item.locator, title: item.title })),
  contacts: [...contacts],
});

const allowedKeys: Record<IntentResult["outcome"], string[]> = {
  ANSWER: ["intentId", "outcome", "reasonCode", "answerText", "clarificationQuestion", "clarificationOptions", "claims", "citations", "contacts"],
  CLARIFY: ["intentId", "outcome", "reasonCode", "answerText", "clarificationQuestion", "clarificationOptions", "claims", "citations", "contacts"],
  HANDOFF: ["intentId", "outcome", "reasonCode", "answerText", "clarificationQuestion", "clarificationOptions", "claims", "citations", "contacts"],
};

const hasExactKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).sort().join("|") === [...keys].sort().join("|");

export const verifyGroundedTurn = (turn: GroundedTurn, evidence: readonly GroundingEvidence[]): GroundingVerificationResult => {
  const errors: string[] = [];
  const unsupportedValues: string[] = [];
  const evidenceById = new Map(evidence.map((item) => [item.evidenceId, item]));
  if (!Array.isArray(turn.intentResults) || turn.intentResults.length === 0) errors.push("intentResults must be non-empty");
  if (turn.overallOutcome !== expectedOverallOutcome(turn.intentResults ?? [])) errors.push("overall outcome precedence is invalid");
  let checkedClaims = 0;
  let checkedCitations = 0;
  for (const result of turn.intentResults ?? []) {
    const record = result as unknown as Record<string, unknown>;
    if (!hasExactKeys(record, allowedKeys[result.outcome])) errors.push(`${result.intentId}: strict field set is invalid`);
    if (!result.intentId || typeof result.intentId !== "string") errors.push("intentId is required");
    if (result.outcome === "ANSWER") {
      if (result.reasonCode !== "ANSWERABLE" || !result.answerText || result.clarificationQuestion !== null || result.clarificationOptions.length !== 0 || result.claims.length === 0 || result.citations.length === 0) errors.push(`${result.intentId}: ANSWER shape/policy is invalid`);
      for (const claim of result.claims) {
        checkedClaims += 1;
        if (claim.material && claim.evidenceIds.length === 0) errors.push(`${claim.claimId}: material claim lacks evidence`);
        for (const evidenceId of claim.evidenceIds) {
          const source = evidenceById.get(evidenceId);
          if (!source || !source.public) errors.push(`${claim.claimId}: evidence is not public/final-context scoped`);
          if (source) {
            const claimDigits = digits(claim.text);
            const sourceDigits = digits(source.text);
            if (claimDigits && !sourceDigits.includes(claimDigits)) unsupportedValues.push(claimDigits);
            const normalizedClaim = normalizeValue(claim.text);
            if (source.exactValues.length > 0 && !source.exactValues.some((value) => normalizedClaim.includes(normalizeValue(value)))) unsupportedValues.push(claim.text);
          }
        }
      }
      for (const citation of result.citations) {
        checkedCitations += 1;
        const source = evidenceById.get(citation.evidenceId);
        if (!source || source.documentVersionId !== citation.documentVersionId || source.locator !== citation.locator || !source.public) errors.push(`${result.intentId}: citation does not resolve to allowed evidence`);
      }
    } else if (result.outcome === "CLARIFY") {
      if (!(["AMBIGUOUS_ENTITY", "MISSING_TIME", "AMBIGUOUS_INTENT"] as string[]).includes(result.reasonCode) || result.answerText !== "" || !result.clarificationQuestion || result.claims.length !== 0 || result.citations.length !== 0 || result.contacts.length !== 0 || result.clarificationOptions.length > 4) errors.push(`${result.intentId}: CLARIFY shape/policy is invalid`);
    } else if (result.outcome === "HANDOFF") {
      if (!HandoffReasonCodeSet.has(result.reasonCode) || !result.answerText || result.clarificationQuestion !== null || result.clarificationOptions.length !== 0 || result.claims.length !== 0) errors.push(`${result.intentId}: HANDOFF shape/policy is invalid`);
      for (const citation of result.citations) {
        checkedCitations += 1;
        const source = evidenceById.get(citation.evidenceId);
        if (!source || source.documentVersionId !== citation.documentVersionId || !source.public) errors.push(`${result.intentId}: HANDOFF citation does not resolve`);
      }
    }
  }
  return { valid: errors.length === 0 && unsupportedValues.length === 0, checkedClaims, checkedCitations, unsupportedValues: [...new Set(unsupportedValues)], errors };
};

const HandoffReasonCodeSet = new Set<HandoffReasonCode>([
  "NO_EVIDENCE", "CONFLICTING_EVIDENCE", "LOW_EVIDENCE", "SENSITIVE", "PERSON_SPECIFIC", "POLICY_REFUSAL", "SECURITY", "STAFF_REQUESTED", "SYSTEM_ERROR",
]);

export const verifyModelGroundedTurn = (turn: GroundedTurn, evidence: readonly GroundingEvidence[]): GroundedTurn => {
  const verification = verifyGroundedTurn(turn, evidence);
  if (!verification.valid) throw new GroundingError("UNSUPPORTED_CLAIM", verification.errors.concat(verification.unsupportedValues).join("; "));
  return turn;
};

export const sanitizeAnswerText = (value: string): string => value
  .replace(/\[evidence-[^\]]+\]/gi, "")
  .replace(/(?:system prompt|chain[- ]of[- ]thought|api key|secret)\s*[:：].*$/gim, "")
  .trim();

export const outcomePrecedence = outcomeOf;

const parseGroundedTurnShape = (value: unknown): GroundedTurn => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("grounded turn must be an object");
  const record = value as Record<string, unknown>;
  if (!hasExactKeys(record, ["overallOutcome", "intentResults"]) || !(["ANSWER", "CLARIFY", "HANDOFF"] as unknown[]).includes(record.overallOutcome) || !Array.isArray(record.intentResults) || record.intentResults.length === 0) throw new Error("grounded turn shape is invalid");
  for (const intent of record.intentResults) {
    if (typeof intent !== "object" || intent === null || Array.isArray(intent)) throw new Error("intent result shape is invalid");
    const item = intent as Record<string, unknown>;
    if (!(["ANSWER", "CLARIFY", "HANDOFF"] as unknown[]).includes(item.outcome) || typeof item.intentId !== "string" || typeof item.answerText !== "string" || !Array.isArray(item.claims) || !Array.isArray(item.citations) || !Array.isArray(item.contacts) || !Array.isArray(item.clarificationOptions)) throw new Error("intent result fields are invalid");
    if (!hasExactKeys(item, allowedKeys[item.outcome as IntentResult["outcome"]])) throw new Error("intent result contains an unknown field");
  }
  return value as GroundedTurn;
};

export const groundedTurnSchema = strictJsonObjectSchema<GroundedTurn>("grounded_turn_v1", parseGroundedTurnShape, {
  type: "object",
  additionalProperties: false,
  required: ["overallOutcome", "intentResults"],
  properties: {
    overallOutcome: { enum: ["ANSWER", "CLARIFY", "HANDOFF"] },
    intentResults: { type: "array", minItems: 1 },
  },
});

export const generateGroundedTurn = async (
  gateway: AiGateway,
  input: GroundedGenerationInput,
  evidence: readonly GroundingEvidence[],
): Promise<GroundedGenerationResult> => {
  const generated = await gateway.execute({ ...input, responseSchema: groundedTurnSchema });
  try {
    return { turn: verifyModelGroundedTurn(generated.output, evidence), trace: generated.trace, providerOutputVerified: true };
  } catch {
    const fallback = handoff("intent-1", "SYSTEM_ERROR", []);
    return { turn: { overallOutcome: "HANDOFF", intentResults: [fallback] }, trace: generated.trace, providerOutputVerified: false };
  }
};
