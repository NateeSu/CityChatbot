import type { IngestionState } from "@citychatbot/storage";
import {
  INDEX_CHUNK_TYPES,
  type IndexChunk,
  type IndexFact,
  type IndexFactType,
  type IndexRetrievalOptions,
} from "./indexer";
import type { RetrievalAudience } from "./documents";

export type QueryLanguage = "th" | "en" | "mixed";
export type QueryRisk = "CRITICAL" | "HIGH" | "NORMAL";
export type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

export type QueryEntityCandidate = {
  type: string;
  key: string;
  label: string;
  confidenceBand: ConfidenceBand;
};

export type QueryPlan = {
  originalQuestion: string;
  normalizedQuestion: string;
  language: QueryLanguage;
  intents: string[];
  entityCandidates: QueryEntityCandidate[];
  requestedFactTypes: IndexFactType[];
  asOfDate: string;
  risk: QueryRisk;
  requiresPersonalData: boolean;
  ambiguity: { isAmbiguous: boolean; missingSlots: string[] };
  retrievalQueries: string[];
  preservedTerms: string[];
};

export type RetrievalEntityOption = {
  type: string;
  key: string;
  label: string;
  aliases?: string[];
};

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type QueryUnderstandingOptions = {
  now?: Date | string;
  asOfDate?: Date | string;
  requireAsOfDate?: boolean;
  entities?: RetrievalEntityOption[];
  priorTurns?: ConversationTurn[];
};

export type RetrievalPolicy = {
  version: string;
  rrfK: number;
  denseCandidateK: number;
  lexicalCandidateK: number;
  rerankK: number;
  evidenceK: number;
  contextBudgetTokens: number;
  maxPerSourceHash: number;
  maxPerSection: number;
  maxPerVersion: number;
  minCalibratedScore: number;
  lexicalWeight: number;
  denseWeight: number;
  exactBoost: number;
  authorityWeight: number;
  entityBoost: number;
  freshnessWeight: number;
};

export type RetrievalPolicyRow = {
  version: number | string;
  rrf_k: number;
  dense_candidate_k: number;
  lexical_candidate_k: number;
  rerank_k: number;
  evidence_k: number;
  context_budget_tokens: number;
  max_per_source_hash: number;
  max_per_section: number;
  max_per_version: number;
  min_calibrated_score: number | string;
  lexical_weight: number | string;
  dense_weight: number | string;
  exact_boost: number | string;
  authority_weight: number | string;
  entity_boost: number | string;
  freshness_weight: number | string;
};

export const DEFAULT_RETRIEVAL_POLICY: Readonly<RetrievalPolicy> = Object.freeze({
  version: "retrieval-policy-v1",
  rrfK: 50,
  denseCandidateK: 30,
  lexicalCandidateK: 30,
  rerankK: 20,
  evidenceK: 8,
  contextBudgetTokens: 6_000,
  maxPerSourceHash: 1,
  maxPerSection: 2,
  maxPerVersion: 8,
  minCalibratedScore: 0.05,
  lexicalWeight: 0.42,
  denseWeight: 0.30,
  exactBoost: 0.45,
  authorityWeight: 0.10,
  entityBoost: 0.20,
  freshnessWeight: 0.08,
});

export type DenseCandidate = {
  chunkId: string;
  score: number;
};

export type DenseRetriever = (input: {
  tenantId: string;
  query: string;
  chunks: readonly IndexChunk[];
  topK: number;
  at: string;
}) => readonly DenseCandidate[];

export interface RetrievalSource {
  listSearchableChunks(tenantId: string, options?: IndexRetrievalOptions): IndexChunk[];
  listSearchableFacts(tenantId: string, options?: IndexRetrievalOptions): IndexFact[];
}

export type RetrievalOptions = {
  at?: Date | string;
  audience?: RetrievalAudience;
  departmentId?: string;
  policy?: Partial<RetrievalPolicy>;
  entities?: RetrievalEntityOption[];
  priorTurns?: ConversationTurn[];
  requireAsOfDate?: boolean;
  denseRetriever?: DenseRetriever;
};

export type RetrievalCandidate = {
  evidenceId: string;
  chunk: IndexChunk;
  calibratedScore: number;
  lexicalScore: number;
  denseScore?: number;
  exactFactIds: string[];
  rrfScore: number;
  reasons: string[];
  isContextOnly: boolean;
};

export type RetrievalConflict = {
  key: string;
  factType: IndexFactType;
  values: string[];
  factIds: string[];
};

export type RetrievalResult = {
  plan: QueryPlan;
  policy: RetrievalPolicy;
  candidates: RetrievalCandidate[];
  evidence: RetrievalCandidate[];
  contextChunks: IndexChunk[];
  contextText: string;
  matchedFacts: IndexFact[];
  conflicts: RetrievalConflict[];
  coverage: {
    requestedFactTypes: IndexFactType[];
    coveredFactTypes: IndexFactType[];
    missingFactTypes: IndexFactType[];
    complete: boolean;
  };
  outcome: "READY" | "CLARIFY" | "HANDOFF";
  reasonCode?: "AMBIGUOUS_ENTITY" | "MISSING_TIME" | "NO_EVIDENCE" | "CONFLICTING_EVIDENCE" | "LOW_EVIDENCE";
  trace: {
    tenantId: string;
    audience: RetrievalAudience;
    at: string;
    activeOnly: true;
    effectiveOnly: true;
    departmentId?: string;
    denseCandidateCount: number;
    lexicalCandidateCount: number;
    exactCandidateCount: number;
  };
};

export class RetrievalDomainError extends Error {
  constructor(
    public readonly code: "VALIDATION_ERROR" | "EMPTY_QUERY" | "POLICY_INVALID" | "TENANT_BOUNDARY",
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "RetrievalDomainError";
  }
}

const FACT_KEYWORDS: Readonly<Record<IndexFactType, readonly string[]>> = {
  DEPARTMENT_NAME: ["department", "หน่วยงาน", "แผนก"],
  SERVICE_NAME: ["service", "บริการ", "งานบริการ"],
  PERSON_NAME_ROLE: ["person", "เจ้าหน้าที่", "ผู้รับผิดชอบ"],
  PHONE: ["phone", "telephone", "tel", "โทร", "เบอร์"],
  ADDRESS: ["address", "location", "ที่อยู่", "สถานที่", "ตั้งอยู่"],
  BUSINESS_HOURS: ["hours", "opening", "เปิด", "เวลาทำการ", "เวลา"],
  FEE: ["fee", "price", "cost", "ค่าธรรมเนียม", "ค่าใช้จ่าย", "ราคา"],
  ELIGIBILITY: ["eligibility", "eligible", "qualify", "คุณสมบัติ", "ผู้มีสิทธิ"],
  AGE_LIMIT: ["age", "อายุ", "ปี"],
  REQUIRED_DOCUMENT: ["document", "documents", "หลักฐาน", "เอกสาร"],
  PROCESS_STEP: ["process", "ขั้นตอน", "วิธี", "step"],
  DURATION: ["duration", "ระยะเวลา", "กี่วัน", "ใช้เวลา"],
  DATE: ["date", "when", "วันที่", "กำหนด", "วัน"],
  URL: ["url", "website", "เว็บ", "เว็บไซต์", "ลิงก์"],
  BRANCH: ["branch", "สาขา"],
  DISCLAIMER: ["หมายเหตุ", "ข้อจำกัด", "disclaimer"],
};

const CRITICAL_FACTS = new Set<IndexFactType>([
  "PERSON_NAME_ROLE", "PHONE", "ADDRESS", "BUSINESS_HOURS", "FEE", "DATE",
  "ELIGIBILITY", "AGE_LIMIT", "REQUIRED_DOCUMENT",
]);

const PERSONAL_MARKERS = [
  "personal", "private", "citizen", "citizen id", "เลขบัตร", "บัตรประชาชน", "ข้อมูลส่วนบุคคล", "บุคคล",
];
const SENSITIVE_MARKERS = ["legal", "lawsuit", "dispute", "สิทธิ", "ร้องเรียนเฉพาะบุคคล", "การดำเนินคดี"];
const NEGATION_MARKERS = ["not", "no", "without", "ไม่", "ไม่มี", "ห้าม", "ยังไม่", "ยกเว้น"];

const iso = (value: Date | string | undefined, field: string): string => {
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  if (Number.isNaN(parsed.getTime())) throw new RetrievalDomainError("VALIDATION_ERROR", `${field} must be a valid timestamp`);
  return parsed.toISOString();
};

const normalizeThaiDigits = (value: string): string => value.replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - "๐".charCodeAt(0)));

export const normalizeRetrievalText = (value: string): string => normalizeThaiDigits(value.normalize("NFC"))
  .toLocaleLowerCase("th-TH")
  .replace(/[\u200b\u200c\u200d]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const detectLanguage = (value: string): QueryLanguage => {
  const hasThai = /[\u0e00-\u0e7f]/u.test(value);
  const hasLatin = /[a-z]/iu.test(value);
  return hasThai && hasLatin ? "mixed" : hasThai ? "th" : "en";
};

const terms = (value: string): string[] => {
  const normalized = normalizeRetrievalText(value);
  const result = new Set<string>();
  for (const match of normalized.matchAll(/[\p{L}\p{N}]+/gu)) result.add(match[0]!);
  const thaiRuns = normalized.match(/[\u0e00-\u0e7f]+/gu) ?? [];
  for (const run of thaiRuns) {
    const characters = Array.from(run);
    for (let width = 2; width <= 3; width += 1) {
      for (let index = 0; index + width <= characters.length; index += 1) result.add(characters.slice(index, index + width).join(""));
    }
  }
  return [...result].filter((term) => term.length > 0);
};

const exactValue = (value: string): string => normalizeRetrievalText(value).replace(/[^\p{L}\p{N}]+/gu, "");
const containsAny = (value: string, values: readonly string[]): boolean => values.some((candidate) => value.includes(normalizeRetrievalText(candidate)));

const editDistance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0]!;
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = previous[rightIndex]!;
      previous[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + 1,
        diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length]!;
};

const fuzzyAliasMatch = (question: string, alias: string): boolean => {
  if (alias.length < 4 || question.includes(alias)) return question.includes(alias);
  const maximumDistance = Math.max(1, Math.floor(alias.length * 0.2));
  const windowWidths = [alias.length - 1, alias.length, alias.length + 1].filter((width) => width > 0 && width <= question.length);
  for (const width of windowWidths) {
    for (let index = 0; index + width <= question.length; index += 1) {
      if (editDistance(question.slice(index, index + width), alias) <= maximumDistance) return true;
    }
  }
  return false;
};

const requestedFacts = (question: string): IndexFactType[] => {
  const normalized = normalizeRetrievalText(question);
  return (Object.keys(FACT_KEYWORDS) as IndexFactType[]).filter((factType) => containsAny(normalized, FACT_KEYWORDS[factType]));
};

const parseExplicitDate = (question: string, fallback: string): string => {
  const normalized = normalizeThaiDigits(question);
  const isoDate = normalized.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (isoDate) return new Date(`${isoDate[1]}-${isoDate[2]}-${isoDate[3]}T00:00:00.000Z`).toISOString();
  const slashDate = normalized.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (slashDate) {
    const year = slashDate[3]!.length === 2 ? `20${slashDate[3]}` : slashDate[3]!;
    const parsed = new Date(`${year}-${slashDate[2]!.padStart(2, "0")}-${slashDate[1]!.padStart(2, "0")}T00:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return fallback;
};

const extractEntities = (question: string, options: QueryUnderstandingOptions): QueryEntityCandidate[] => {
  const normalized = normalizeRetrievalText(question);
  const matches: QueryEntityCandidate[] = [];
  for (const entity of options.entities ?? []) {
    const label = normalizeRetrievalText(entity.label);
    const aliases = [label, ...(entity.aliases ?? []).map(normalizeRetrievalText)].filter(Boolean);
    const matched = aliases.find((alias) => normalized.includes(alias));
    const fuzzyMatched = matched ?? aliases.find((alias) => fuzzyAliasMatch(normalized, alias));
    if (fuzzyMatched) matches.push({
      type: entity.type,
      key: entity.key,
      label: entity.label,
      confidenceBand: matched === label ? "HIGH" : matched ? "MEDIUM" : "LOW",
    });
  }
  return matches.sort((left, right) => `${left.type}:${left.key}`.localeCompare(`${right.type}:${right.key}`));
};

const dateMarker = (question: string): boolean => /\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/u.test(normalizeThaiDigits(question));

export const understandQuery = (question: string, options: QueryUnderstandingOptions = {}): QueryPlan => {
  if (typeof question !== "string" || question.trim().length === 0) throw new RetrievalDomainError("EMPTY_QUERY", "question is required");
  if (question.length > 4_000) throw new RetrievalDomainError("VALIDATION_ERROR", "question exceeds the retrieval limit");
  const normalizedQuestion = normalizeRetrievalText(question);
  const now = iso(options.now, "now");
  const asOfDate = parseExplicitDate(question, iso(options.asOfDate ?? now, "asOfDate"));
  const entityCandidates = extractEntities(question, options);
  const groupedEntities = new Map<string, Set<string>>();
  for (const entity of entityCandidates) {
    const keys = groupedEntities.get(entity.type) ?? new Set<string>();
    keys.add(entity.key);
    groupedEntities.set(entity.type, keys);
  }
  const ambiguousEntity = [...groupedEntities.values()].some((keys) => keys.size > 1);
  const missingTime = Boolean(options.requireAsOfDate) && !dateMarker(question) && options.asOfDate === undefined;
  const requestedFactTypes = requestedFacts(question);
  const requiresPersonalData = containsAny(normalizedQuestion, PERSONAL_MARKERS);
  const sensitive = containsAny(normalizedQuestion, SENSITIVE_MARKERS);
  const preservedTerms = NEGATION_MARKERS.filter((marker) => normalizedQuestion.includes(normalizeRetrievalText(marker)));
  const intents = [
    requestedFactTypes.length > 0 ? "FACT_LOOKUP" : "KNOWLEDGE_LOOKUP",
    /\d/.test(normalizedQuestion) ? "EXACT_VALUE_LOOKUP" : undefined,
    containsAny(normalizedQuestion, ["procedure", "ขั้นตอน", "วิธี"]) ? "PROCEDURE" : undefined,
  ].filter((intent): intent is string => Boolean(intent));
  const priorUser = [...(options.priorTurns ?? [])].reverse().find((turn) => turn.role === "user" && turn.content.trim());
  const retrievalQueries = priorUser && /^(?:แล้ว|และ|that|those|it|ถ้า|ดังกล่าว)\b/iu.test(normalizedQuestion)
    ? [normalizeRetrievalText(`${priorUser.content} ${question}`), normalizedQuestion]
    : [normalizedQuestion];
  const ambiguity = {
    isAmbiguous: ambiguousEntity || missingTime,
    missingSlots: [
      ...(ambiguousEntity ? ["entity"] : []),
      ...(missingTime ? ["asOfDate"] : []),
    ],
  };
  return {
    originalQuestion: question,
    normalizedQuestion,
    language: detectLanguage(normalizedQuestion),
    intents,
    entityCandidates,
    requestedFactTypes,
    asOfDate,
    risk: requiresPersonalData ? "CRITICAL" : sensitive || requestedFactTypes.some((factType) => CRITICAL_FACTS.has(factType)) ? "HIGH" : "NORMAL",
    requiresPersonalData,
    ambiguity,
    retrievalQueries,
    preservedTerms,
  };
};

const mergePolicy = (input: Partial<RetrievalPolicy> | undefined): RetrievalPolicy => {
  const policy = { ...DEFAULT_RETRIEVAL_POLICY, ...input };
  const positiveIntegers = ["rrfK", "denseCandidateK", "lexicalCandidateK", "rerankK", "evidenceK", "contextBudgetTokens", "maxPerSourceHash", "maxPerSection", "maxPerVersion"] as const;
  for (const field of positiveIntegers) {
    if (!Number.isInteger(policy[field]) || policy[field] <= 0) throw new RetrievalDomainError("POLICY_INVALID", `${field} must be a positive integer`);
  }
  if (policy.evidenceK > policy.rerankK) throw new RetrievalDomainError("POLICY_INVALID", "evidenceK cannot exceed rerankK");
  if (policy.minCalibratedScore < 0 || policy.minCalibratedScore > 1) throw new RetrievalDomainError("POLICY_INVALID", "minCalibratedScore must be between 0 and 1");
  for (const field of ["lexicalWeight", "denseWeight", "exactBoost", "authorityWeight", "entityBoost", "freshnessWeight"] as const) {
    if (!Number.isFinite(policy[field]) || policy[field] < 0) throw new RetrievalDomainError("POLICY_INVALID", `${field} must be non-negative`);
  }
  return policy;
};

export const retrievalPolicyFromRow = (row: RetrievalPolicyRow): RetrievalPolicy => mergePolicy({
  version: `retrieval-policy-v${String(row.version)}`,
  rrfK: Number(row.rrf_k),
  denseCandidateK: Number(row.dense_candidate_k),
  lexicalCandidateK: Number(row.lexical_candidate_k),
  rerankK: Number(row.rerank_k),
  evidenceK: Number(row.evidence_k),
  contextBudgetTokens: Number(row.context_budget_tokens),
  maxPerSourceHash: Number(row.max_per_source_hash),
  maxPerSection: Number(row.max_per_section),
  maxPerVersion: Number(row.max_per_version),
  minCalibratedScore: Number(row.min_calibrated_score),
  lexicalWeight: Number(row.lexical_weight),
  denseWeight: Number(row.dense_weight),
  exactBoost: Number(row.exact_boost),
  authorityWeight: Number(row.authority_weight),
  entityBoost: Number(row.entity_boost),
  freshnessWeight: Number(row.freshness_weight),
});

const lexicalScore = (query: string, chunk: IndexChunk): number => {
  const queryTerms = new Set(terms(query));
  if (queryTerms.size === 0) return 0;
  const chunkTerms = new Set(terms(`${chunk.searchText} ${chunk.displayText}`));
  let overlap = 0;
  for (const term of queryTerms) if (chunkTerms.has(term)) overlap += 1;
  const phrase = normalizeRetrievalText(chunk.displayText).includes(normalizeRetrievalText(query)) ? 1 : 0;
  const queryExact = exactValue(query);
  const chunkExact = exactValue(chunk.displayText);
  const numericExact = /\d/.test(queryExact) && queryExact.length > 1 && chunkExact.includes(queryExact) ? 1 : 0;
  return Math.min(1, (overlap / queryTerms.size) * 0.7 + phrase * 0.2 + numericExact * 0.1);
};

const effectiveAt = (chunk: IndexChunk, at: string): boolean =>
  (chunk.validFrom === undefined || chunk.validFrom <= at) && (chunk.validUntil === undefined || chunk.validUntil > at);

const factMatchesQuery = (fact: IndexFact, plan: QueryPlan): boolean => {
  if (fact.reviewStatus !== "APPROVED") return false;
  if (plan.requestedFactTypes.length > 0 && !plan.requestedFactTypes.includes(fact.factType)) return false;
  const queryValue = exactValue(plan.normalizedQuestion);
  const factValue = exactValue(fact.normalizedValue);
  return factValue.length > 0 && (queryValue.includes(factValue) || factValue.includes(queryValue) || containsAny(plan.normalizedQuestion, FACT_KEYWORDS[fact.factType]));
};

const sourceSection = (chunk: IndexChunk): string => {
  const section = chunk.sourceLocator.sectionPath.join("/");
  return `${chunk.documentVersionId}:${section || "root"}`;
};

const overlap = (left: string | undefined, right: string | undefined): boolean => left === undefined || right === undefined || left < (right ?? left) && (right === undefined || left < right);

const findConflicts = (facts: readonly IndexFact[], at: string): RetrievalConflict[] => {
  const groups = new Map<string, IndexFact[]>();
  for (const fact of facts) {
    if (!effectiveAt({ validFrom: fact.validFrom, validUntil: fact.validUntil } as IndexChunk, at)) continue;
    const key = `${fact.entityKey}|${fact.factType}`;
    const group = groups.get(key) ?? [];
    group.push(fact);
    groups.set(key, group);
  }
  const conflicts: RetrievalConflict[] = [];
  for (const [key, group] of groups) {
    const values = [...new Set(group.map((fact) => fact.normalizedValue))];
    if (values.length > 1) conflicts.push({ key, factType: group[0]!.factType, values, factIds: group.map((fact) => fact.id) });
  }
  return conflicts;
};

type Accumulator = {
  chunk: IndexChunk;
  lexicalScore: number;
  denseScore?: number;
  exactFactIds: string[];
  rrfScore: number;
  entityBoost: number;
  reasons: Set<string>;
};

const addRanked = (map: Map<string, Accumulator>, ranked: readonly string[], policy: RetrievalPolicy): void => {
  ranked.forEach((chunkId, index) => {
    const value = map.get(chunkId);
    if (value) value.rrfScore += 1 / (policy.rrfK + index + 1);
  });
};

const calibrated = (raw: number): number => Math.max(0, Math.min(1, 1 - Math.exp(-Math.max(0, raw))));

export const retrieve = (
  source: RetrievalSource,
  tenantId: string,
  question: string,
  options: RetrievalOptions = {},
): RetrievalResult => {
  if (!tenantId.trim()) throw new RetrievalDomainError("VALIDATION_ERROR", "tenantId is required");
  const policy = mergePolicy(options.policy);
  const audience = options.audience ?? "CITIZEN";
  const at = iso(options.at, "at");
  const plan = understandQuery(question, {
    now: at,
    requireAsOfDate: options.requireAsOfDate,
    entities: options.entities,
    priorTurns: options.priorTurns,
  });
  const trace = {
    tenantId,
    audience,
    at,
    activeOnly: true as const,
    effectiveOnly: true as const,
    ...(options.departmentId ? { departmentId: options.departmentId } : {}),
    denseCandidateCount: 0,
    lexicalCandidateCount: 0,
    exactCandidateCount: 0,
  };
  if (plan.ambiguity.isAmbiguous) {
    return {
      plan,
      policy,
      candidates: [],
      evidence: [],
      contextChunks: [],
      contextText: "",
      matchedFacts: [],
      conflicts: [],
      coverage: { requestedFactTypes: plan.requestedFactTypes, coveredFactTypes: [], missingFactTypes: plan.requestedFactTypes, complete: plan.requestedFactTypes.length === 0 },
      outcome: "CLARIFY",
      reasonCode: plan.ambiguity.missingSlots.includes("asOfDate") ? "MISSING_TIME" : "AMBIGUOUS_ENTITY",
      trace,
    };
  }
  const retrievalOptions: IndexRetrievalOptions = { at, audience, ...(options.departmentId ? { departmentId: options.departmentId } : {}) };
  const chunks = source.listSearchableChunks(tenantId, retrievalOptions)
    .filter((chunk) => chunk.tenantId === tenantId && effectiveAt(chunk, at));
  const allowedChunks = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const facts = source.listSearchableFacts(tenantId, retrievalOptions)
    .filter((fact) => fact.tenantId === tenantId && fact.reviewStatus === "APPROVED" && allowedChunks.has(fact.sourceChunkId));
  const matchedFacts = facts.filter((fact) => factMatchesQuery(fact, plan));
  const exactChunkIds = [...new Set(matchedFacts.map((fact) => fact.sourceChunkId))];
  trace.exactCandidateCount = exactChunkIds.length;
  const lexical = chunks.map((chunk) => ({ chunk, score: Math.max(...plan.retrievalQueries.map((query) => lexicalScore(query, chunk))) }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.chunk.id.localeCompare(right.chunk.id))
    .slice(0, policy.lexicalCandidateK);
  trace.lexicalCandidateCount = lexical.length;
  const denseInput = options.denseRetriever
    ? options.denseRetriever({ tenantId, query: plan.retrievalQueries[0]!, chunks, topK: policy.denseCandidateK, at })
    : [];
  const allowedDense = denseInput.filter((candidate) => allowedChunks.has(candidate.chunkId) && Number.isFinite(candidate.score));
  trace.denseCandidateCount = allowedDense.length;
  const accumulators = new Map<string, Accumulator>();
  for (const candidate of lexical) accumulators.set(candidate.chunk.id, {
    chunk: candidate.chunk,
    lexicalScore: candidate.score,
    exactFactIds: [],
    rrfScore: 0,
    entityBoost: 0,
    reasons: new Set(["lexical"]),
  });
  for (const candidate of allowedDense) {
    const chunk = allowedChunks.get(candidate.chunkId)!;
    const current = accumulators.get(chunk.id) ?? { chunk, lexicalScore: 0, exactFactIds: [], rrfScore: 0, entityBoost: 0, reasons: new Set<string>() };
    current.denseScore = Math.max(0, Math.min(1, candidate.score));
    current.reasons.add("dense");
    accumulators.set(chunk.id, current);
  }
  for (const chunkId of exactChunkIds) {
    const chunk = allowedChunks.get(chunkId);
    if (!chunk) continue;
    const current = accumulators.get(chunkId) ?? { chunk, lexicalScore: 0, exactFactIds: [], rrfScore: 0, entityBoost: 0, reasons: new Set<string>() };
    current.exactFactIds = matchedFacts.filter((fact) => fact.sourceChunkId === chunkId).map((fact) => fact.id).sort();
    current.reasons.add("exact-fact");
    accumulators.set(chunkId, current);
  }
  const lexicalRanked = lexical.map((candidate) => candidate.chunk.id);
  const denseRanked = allowedDense.slice().sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId)).map((candidate) => candidate.chunkId);
  addRanked(accumulators, lexicalRanked, policy);
  addRanked(accumulators, denseRanked, policy);
  addRanked(accumulators, exactChunkIds, policy);
  for (const current of accumulators.values()) {
    const entityMatch = plan.entityCandidates.some((entity) => current.chunk.entityKeys.includes(entity.key) || normalizeRetrievalText(current.chunk.displayText).includes(normalizeRetrievalText(entity.label)));
    current.entityBoost = entityMatch ? 1 : 0;
    if (entityMatch) current.reasons.add("entity");
  }
  const ranked = [...accumulators.values()].map((current) => {
    const raw = current.rrfScore
      + current.lexicalScore * policy.lexicalWeight
      + (current.denseScore ?? 0) * policy.denseWeight
      + (current.exactFactIds.length > 0 ? policy.exactBoost : 0)
      + (current.chunk.authorityLevel / 100) * policy.authorityWeight
      + current.entityBoost * policy.entityBoost
      + (current.chunk.validUntil ? policy.freshnessWeight : 0);
    return { current, calibratedScore: calibrated(raw) };
  }).sort((left, right) => right.calibratedScore - left.calibratedScore || left.current.chunk.id.localeCompare(right.current.chunk.id));
  const rerankWindow = ranked.slice(0, policy.rerankK);
  const selected: typeof rerankWindow = [];
  const sourceHashCounts = new Map<string, number>();
  const sectionCounts = new Map<string, number>();
  const versionCounts = new Map<string, number>();
  for (const candidate of rerankWindow) {
    const sourceCount = sourceHashCounts.get(candidate.current.chunk.sourceHash) ?? 0;
    const sectionCount = sectionCounts.get(sourceSection(candidate.current.chunk)) ?? 0;
    const versionCount = versionCounts.get(candidate.current.chunk.documentVersionId) ?? 0;
    if (sourceCount >= policy.maxPerSourceHash || sectionCount >= policy.maxPerSection || versionCount >= policy.maxPerVersion) continue;
    selected.push(candidate);
    sourceHashCounts.set(candidate.current.chunk.sourceHash, sourceCount + 1);
    sectionCounts.set(sourceSection(candidate.current.chunk), sectionCount + 1);
    versionCounts.set(candidate.current.chunk.documentVersionId, versionCount + 1);
    if (selected.length >= policy.evidenceK) break;
  }
  const evidence = selected.map((candidate) => ({
    evidenceId: `evidence-${candidate.current.chunk.id}`,
    chunk: { ...candidate.current.chunk, sourceLocator: { ...candidate.current.chunk.sourceLocator, sectionPath: [...candidate.current.chunk.sourceLocator.sectionPath] } },
    calibratedScore: candidate.calibratedScore,
    lexicalScore: candidate.current.lexicalScore,
    ...(candidate.current.denseScore === undefined ? {} : { denseScore: candidate.current.denseScore }),
    exactFactIds: [...candidate.current.exactFactIds],
    rrfScore: candidate.current.rrfScore,
    reasons: [...candidate.current.reasons].sort(),
    isContextOnly: false,
  }));
  const candidateOutput = ranked.slice(0, policy.rerankK).map((candidate) => ({
    evidenceId: `evidence-${candidate.current.chunk.id}`,
    chunk: { ...candidate.current.chunk, sourceLocator: { ...candidate.current.chunk.sourceLocator, sectionPath: [...candidate.current.chunk.sourceLocator.sectionPath] } },
    calibratedScore: candidate.calibratedScore,
    lexicalScore: candidate.current.lexicalScore,
    ...(candidate.current.denseScore === undefined ? {} : { denseScore: candidate.current.denseScore }),
    exactFactIds: [...candidate.current.exactFactIds],
    rrfScore: candidate.current.rrfScore,
    reasons: [...candidate.current.reasons].sort(),
    isContextOnly: false,
  }));
  const evidenceIds = new Set(evidence.map((item) => item.chunk.id));
  const context = evidence.reduce<IndexChunk[]>((items, item) => {
    const currentTokens = items.reduce((sum, chunk) => sum + chunk.tokenCount, 0);
    return currentTokens + item.chunk.tokenCount <= policy.contextBudgetTokens ? [...items, item.chunk] : items;
  }, []);
  const contextIds = new Set(context.map((chunk) => chunk.id));
  for (const item of evidence) {
    for (const adjacentId of [item.chunk.parentChunkId, item.chunk.previousChunkId, item.chunk.nextChunkId]) {
      if (!adjacentId || contextIds.has(adjacentId)) continue;
      const adjacent = allowedChunks.get(adjacentId);
      if (!adjacent || context.reduce((sum, chunk) => sum + chunk.tokenCount, 0) + adjacent.tokenCount > policy.contextBudgetTokens) continue;
      context.push(adjacent);
      contextIds.add(adjacent.id);
    }
  }
  const conflicts = findConflicts(matchedFacts, at);
  const coveredFactTypes = [...new Set(matchedFacts.map((fact) => fact.factType))].sort();
  const missingFactTypes = plan.requestedFactTypes.filter((factType) => !coveredFactTypes.includes(factType));
  const coverage = { requestedFactTypes: plan.requestedFactTypes, coveredFactTypes, missingFactTypes, complete: missingFactTypes.length === 0 };
  const bestScore = evidence[0]?.calibratedScore ?? 0;
  let outcome: RetrievalResult["outcome"] = "READY";
  let reasonCode: RetrievalResult["reasonCode"];
  if (conflicts.length > 0) {
    outcome = "HANDOFF";
    reasonCode = "CONFLICTING_EVIDENCE";
  } else if (evidence.length === 0) {
    outcome = "HANDOFF";
    reasonCode = "NO_EVIDENCE";
  } else if (bestScore < policy.minCalibratedScore || !coverage.complete) {
    outcome = "HANDOFF";
    reasonCode = "LOW_EVIDENCE";
  }
  const contextText = context.map((chunk) => `[evidence-${chunk.id}]\n${chunk.displayText}`).join("\n\n");
  return {
    plan,
    policy,
    candidates: candidateOutput,
    evidence,
    contextChunks: context,
    contextText,
    matchedFacts,
    conflicts,
    coverage,
    outcome,
    ...(reasonCode ? { reasonCode } : {}),
    trace,
  };
};

export const retrievalChunkTypes: readonly string[] = INDEX_CHUNK_TYPES;
export type RetrievalIndexState = IngestionState;
