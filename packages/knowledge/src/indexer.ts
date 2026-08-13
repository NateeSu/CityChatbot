import { createHash } from "node:crypto";
import type { IngestionState } from "@citychatbot/storage";
import { normalizeSearchText, type KnowledgeBlock, type ParseResult, type SourceLocator } from "./parsers";
import type { KnowledgeActivationStatus, KnowledgeApprovalStatus, KnowledgeUnitGateReceipt, KnowledgeVisibility, RetrievalAudience } from "./documents";

export const INDEX_CHUNK_TYPES = [
  "DOCUMENT_SUMMARY",
  "SECTION_PARENT",
  "ATOMIC_FAQ",
  "ATOMIC_FACT_GROUP",
  "TABLE_ROW",
  "PROCEDURE_BLOCK",
  "CONTACT_BLOCK",
] as const;

export type IndexChunkType = (typeof INDEX_CHUNK_TYPES)[number];
export type IndexLanguage = "th" | "en" | "mixed";
export type FactExtractionMethod = "RULE" | "MODEL" | "HUMAN";
export type FactReviewStatus = "PENDING" | "APPROVED" | "REJECTED";
export type IndexGenerationState = "BUILDING" | "READY" | "ACTIVE" | "RETIRED" | "FAILED";

export type IndexFactType =
  | "DEPARTMENT_NAME"
  | "SERVICE_NAME"
  | "PERSON_NAME_ROLE"
  | "PHONE"
  | "ADDRESS"
  | "BUSINESS_HOURS"
  | "FEE"
  | "ELIGIBILITY"
  | "AGE_LIMIT"
  | "REQUIRED_DOCUMENT"
  | "PROCESS_STEP"
  | "DURATION"
  | "DATE"
  | "URL"
  | "BRANCH"
  | "DISCLAIMER";

export const CRITICAL_FACT_TYPES: readonly IndexFactType[] = [
  "PERSON_NAME_ROLE",
  "PHONE",
  "ADDRESS",
  "BUSINESS_HOURS",
  "FEE",
  "DATE",
  "ELIGIBILITY",
  "AGE_LIMIT",
  "REQUIRED_DOCUMENT",
];

export type IndexConfig = {
  chunkerVersion: "semantic-v1";
  tokenizerVersion: "heuristic-th-v1";
  targetTokens: number;
  hardMaxTokens: number;
  proseOverlapTokens: number;
  parentMaxTokens: number;
  embeddingModelId?: string;
  embeddingDimension?: number;
};

export const DEFAULT_INDEX_CONFIG: Readonly<IndexConfig> = {
  chunkerVersion: "semantic-v1",
  tokenizerVersion: "heuristic-th-v1",
  targetTokens: 450,
  hardMaxTokens: 700,
  proseOverlapTokens: 60,
  parentMaxTokens: 1_500,
};

export type IndexChunk = {
  id: string;
  tenantId: string;
  documentVersionId: string;
  parentChunkId?: string;
  chunkType: IndexChunkType;
  chunkIndex: number;
  displayText: string;
  searchText: string;
  entityKeys: string[];
  topicKeys: string[];
  factTypes: IndexFactType[];
  visibility: KnowledgeVisibility;
  ownerDepartmentId: string;
  authorityLevel: number;
  validFrom?: string;
  validUntil?: string;
  sourceLocator: SourceLocator;
  sourceHash: string;
  tokenCount: number;
  language: IndexLanguage;
  previousChunkId?: string;
  nextChunkId?: string;
  embeddingModelId?: string;
  embeddingDimension?: number;
  embedding?: number[];
  createdAt: string;
};

export type IndexFact = {
  id: string;
  tenantId: string;
  documentVersionId: string;
  entityType: string;
  entityKey: string;
  entityDisplayName: string;
  factType: IndexFactType;
  factKey: string;
  valueJson: Record<string, unknown>;
  normalizedValue: string;
  unit?: string;
  validFrom?: string;
  validUntil?: string;
  authorityLevel: number;
  visibility: KnowledgeVisibility;
  sourceChunkId: string;
  sourceLocator: SourceLocator;
  sourceQuote: string;
  extractionMethod: FactExtractionMethod;
  reviewStatus: FactReviewStatus;
  reviewedBy?: string;
  reviewedAt?: string;
};

export type IndexGeneration = {
  id: string;
  tenantId: string;
  documentVersionId: string;
  generation: number;
  namespace: string;
  configHash: string;
  config: IndexConfig;
  state: IndexGenerationState;
  versionStateAtBuild: IngestionState;
  approvalStatusAtBuild: KnowledgeApprovalStatus;
  unitGateManifestVersion?: string;
  unitGateReportHash?: string;
  unitGatePassedTestIds?: string[];
  activatedBy?: "SYSTEM_UNIT_GATE";
  visibility: KnowledgeVisibility;
  ownerDepartmentId: string;
  authorityLevel: number;
  effectiveFrom?: string;
  effectiveUntil?: string;
  chunks: IndexChunk[];
  facts: IndexFact[];
  embeddingStatus: "LEXICAL_EXACT" | "READY" | "PENDING_MODEL_REGISTRY";
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type BuildIndexInput = {
  tenantId: string;
  documentVersionId: string;
  versionState: IngestionState;
  approvalStatus: KnowledgeApprovalStatus;
  visibility: KnowledgeVisibility;
  ownerDepartmentId: string;
  authorityLevel: number;
  effectiveFrom?: Date | string | null;
  effectiveUntil?: Date | string | null;
  parsed: ParseResult;
  /**
   * Optional deterministic policy applied after structure-aware parsing and
   * before facts are materialised.  It is used by the authorised municipal
   * corpus activation path to exclude unsafe source segments without altering
   * the immutable parser result.
   */
  screenChunk?: (input: { text: string; locator: SourceLocator; type: IndexChunkType; chunkIndex: number }) => boolean;
  scopeFact?: (input: { fact: IndexFact; chunk: IndexChunk }) => Partial<Pick<IndexFact, "entityType" | "entityKey" | "entityDisplayName" | "reviewStatus" | "reviewedBy" | "reviewedAt" | "factKey">> | null;
  config?: Partial<IndexConfig>;
  now?: Date | string;
};

export type IndexRetrievalOptions = {
  at?: Date | string;
  audience?: RetrievalAudience;
  departmentId?: string;
};

export class IndexDomainError extends Error {
  constructor(
    public readonly code:
      | "VALIDATION_ERROR"
      | "TENANT_BOUNDARY"
      | "PARSE_NOT_READY"
      | "INDEX_NOT_FOUND"
      | "INDEX_NOT_READY"
      | "FACT_REVIEW_REQUIRED"
      | "VERSION_NOT_ACTIVE"
      | "INDEX_CONFLICT",
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "IndexDomainError";
  }
}

const iso = (value: Date | string | null | undefined, field: string): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const result = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(result.getTime())) throw new IndexDomainError("VALIDATION_ERROR", `${field} must be a valid timestamp`);
  return result.toISOString();
};

const hash = (value: string): string => createHash("sha256").update(value).digest("hex");
const cloneLocator = (value: SourceLocator): SourceLocator => ({ ...value, sectionPath: [...value.sectionPath] });
const tokenCount = (value: string): number => Math.max(1, Math.ceil(Array.from(value).length / 4));
const languageOf = (value: string): IndexLanguage => {
  const hasThai = /[\u0e00-\u0e7f]/.test(value);
  const hasLatin = /[A-Za-z]/.test(value);
  return hasThai && hasLatin ? "mixed" : hasThai ? "th" : "en";
};

const mergeConfig = (input: Partial<IndexConfig> | undefined): IndexConfig => {
  const config: IndexConfig = { ...DEFAULT_INDEX_CONFIG, ...input };
  if (!Number.isInteger(config.targetTokens) || config.targetTokens < 180 || config.targetTokens > 450) {
    throw new IndexDomainError("VALIDATION_ERROR", "targetTokens must be between 180 and 450");
  }
  if (!Number.isInteger(config.hardMaxTokens) || config.hardMaxTokens < config.targetTokens || config.hardMaxTokens > 700) {
    throw new IndexDomainError("VALIDATION_ERROR", "hardMaxTokens must be between targetTokens and 700");
  }
  if (!Number.isInteger(config.proseOverlapTokens) || config.proseOverlapTokens < 40 || config.proseOverlapTokens > 80) {
    throw new IndexDomainError("VALIDATION_ERROR", "proseOverlapTokens must be between 40 and 80");
  }
  if (!Number.isInteger(config.parentMaxTokens) || config.parentMaxTokens < config.hardMaxTokens || config.parentMaxTokens > 1_500) {
    throw new IndexDomainError("VALIDATION_ERROR", "parentMaxTokens is invalid");
  }
  if (config.embeddingDimension !== undefined && (!Number.isInteger(config.embeddingDimension) || config.embeddingDimension <= 0)) {
    throw new IndexDomainError("VALIDATION_ERROR", "embeddingDimension is invalid");
  }
  if (config.embeddingDimension !== undefined && !config.embeddingModelId) {
    throw new IndexDomainError("VALIDATION_ERROR", "embeddingModelId is required with embeddingDimension");
  }
  return config;
};

const configHash = (config: IndexConfig): string => hash(JSON.stringify({
  chunkerVersion: config.chunkerVersion,
  tokenizerVersion: config.tokenizerVersion,
  targetTokens: config.targetTokens,
  hardMaxTokens: config.hardMaxTokens,
  proseOverlapTokens: config.proseOverlapTokens,
  parentMaxTokens: config.parentMaxTokens,
  embeddingModelId: config.embeddingModelId ?? null,
  embeddingDimension: config.embeddingDimension ?? null,
}));

const splitProse = (text: string, hardMaxTokens: number, overlapTokens: number): string[] => {
  if (tokenCount(text) <= hardMaxTokens) return [text];
  const charactersPerToken = 4;
  const hardCharacters = hardMaxTokens * charactersPerToken;
  const overlapCharacters = overlapTokens * charactersPerToken;
  const characters = Array.from(text);
  const pieces: string[] = [];
  let start = 0;
  while (start < characters.length) {
    const end = Math.min(characters.length, start + hardCharacters);
    const piece = characters.slice(start, end).join("").trim();
    if (piece) pieces.push(piece);
    if (end >= characters.length) break;
    const nextStart = Math.max(start + 1, end - overlapCharacters);
    start = nextStart;
  }
  return pieces;
};

const isQuestion = (text: string): boolean => /^(?:ถาม|คำถาม|question)\s*[:：]?/i.test(text.trim());
const isAnswer = (text: string): boolean => /^(?:ตอบ|คำตอบ|answer)\s*[:：]?/i.test(text.trim());
const containsFaqAnswer = (text: string): boolean => /(?:^|\n)\s*(?:ตอบ|คำตอบ|answer)\s*[:：]?/im.test(text);
const isContact = (text: string): boolean => /(?:โทร|เบอร์|ติดต่อ|อีเมล|email|https?:\/\/)/i.test(text);
const isProcedure = (text: string): boolean => /^(?:ข้อ\s*\d+|ขั้นตอน|วิธี|\d+[.)])/.test(text.trim());

type ChunkSpec = {
  type: IndexChunkType;
  text: string;
  locator: SourceLocator;
  parentSpecIndex?: number;
  overlapAllowed: boolean;
  sourceHash?: string;
};

const tableRowText = (headers: string[][], row: string[]): string => {
  const headerPath = headers.flat();
  return row.map((value, index) => `${headerPath[index] ?? `column_${index + 1}`}: ${value}`).join("\n");
};

const makeSpecs = (blocks: KnowledgeBlock[], config: IndexConfig): ChunkSpec[] => {
  const specs: ChunkSpec[] = [];
  const firstTextBlocks = blocks.filter((block) => block.type !== "image").slice(0, 3).map(blockTextForChunk).join("\n");
  if (firstTextBlocks.trim()) {
    specs.push({
      type: "DOCUMENT_SUMMARY",
      text: splitProse(firstTextBlocks, config.parentMaxTokens, 0)[0]!,
      locator: blocks[0]!.locator,
      overlapAllowed: false,
    });
  }
  let currentParentSpecIndex: number | undefined;
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    if (block.type === "image") continue;
    if (block.type === "heading") {
      const parentIndex = specs.length;
      specs.push({ type: "SECTION_PARENT", text: block.text, locator: block.locator, overlapAllowed: false });
      currentParentSpecIndex = parentIndex;
      continue;
    }
    if (block.type === "table") {
      for (let rowIndex = 0; rowIndex < block.rows.length; rowIndex += 1) {
        const row = block.rows[rowIndex]!;
        specs.push({
          type: "TABLE_ROW",
          text: tableRowText(block.headers, row),
          locator: block.rowLocators[rowIndex] ?? block.locator,
          parentSpecIndex: currentParentSpecIndex,
          overlapAllowed: false,
        });
      }
      continue;
    }
    const next = blocks[index + 1];
    if ((block.type === "paragraph" || block.type === "list_item") && isQuestion(block.text) && next && next.type === "paragraph" && isAnswer(next.text)) {
      specs.push({
        type: "ATOMIC_FAQ",
        text: `${block.text}\n${next.text}`,
        locator: block.locator,
        parentSpecIndex: currentParentSpecIndex,
        overlapAllowed: false,
      });
      index += 1;
      continue;
    }
    const text = blockTextForChunk(block);
    if (!text.trim()) continue;
    const type: IndexChunkType = (isQuestion(text) && containsFaqAnswer(text)) ? "ATOMIC_FAQ" : isContact(text) ? "CONTACT_BLOCK" : isProcedure(text) || block.type === "list_item" ? "PROCEDURE_BLOCK" : "ATOMIC_FACT_GROUP";
    for (const piece of splitProse(text, config.hardMaxTokens, config.proseOverlapTokens)) {
      specs.push({ type, text: piece, locator: block.locator, parentSpecIndex: currentParentSpecIndex, overlapAllowed: true });
    }
  }
  return specs;
};

const blockTextForChunk = (block: KnowledgeBlock): string => {
  if (block.type === "table") return [...block.headers, ...block.rows].map((row) => row.join("\t")).join("\n");
  if (block.type === "list_item") return `${block.marker} ${block.text}`;
  if (block.type === "image") return block.altText ?? "";
  return block.text;
};

type FactPattern = {
  type: IndexFactType;
  pattern: RegExp;
  unit?: string;
  valueGroup?: number;
};

const FACT_PATTERNS: readonly FactPattern[] = [
  { type: "URL", pattern: /https?:\/\/[^\s)<>]+/gi },
  { type: "PHONE", pattern: /(?<!\d)(?:\+66|0)[0-9๐-๙][0-9๐-๙\s().-]{7,}[0-9๐-๙](?!\d)/g },
  { type: "BUSINESS_HOURS", pattern: /\b\d{1,2}\s*[:.]\s*\d{2}\s*(?:-|–|—|ถึง)\s*\d{1,2}\s*[:.]\s*\d{2}\b/g },
  { type: "DATE", pattern: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{1,2}\s+(?:ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s+\d{4}\b/g },
  { type: "FEE", pattern: /(?:ค่าธรรมเนียม|ค่าบริการ|ราคา|ค่าใช้จ่าย)[^\n]{0,80}?([0-9๐-๙][0-9๐-๙,]*(?:\.\d+)?)\s*(บาท(?:\/[\w²^]+)?|บ\.)/gi, unit: "บาท", valueGroup: 1 },
  { type: "AGE_LIMIT", pattern: /(?:อายุ|ช่วงอายุ)[^\n]{0,50}?([0-9๐-๙]+(?:[.]\d+)?\s*(?:ปี|เดือน))/gi, valueGroup: 1 },
  { type: "REQUIRED_DOCUMENT", pattern: /(?:เอกสาร|หลักฐาน)[^\n]{0,120}/gi },
  { type: "ELIGIBILITY", pattern: /(?:คุณสมบัติ|ผู้มีสิทธิ|เงื่อนไข)[^\n]{0,120}/gi },
  { type: "ADDRESS", pattern: /(?:ที่อยู่|สถานที่ตั้ง|ตั้งอยู่|ถนน)[^\n]{0,120}/gi },
  { type: "DEPARTMENT_NAME", pattern: /(?:ชื่อแผนก|หน่วยงาน|กอง|สำนัก)[\s:：-]*[^\n]{2,100}/gi },
  { type: "SERVICE_NAME", pattern: /(?:ชื่อบริการ|บริการ|งานบริการ)[\s:：-]*[^\n]{2,100}/gi },
  { type: "BRANCH", pattern: /(?:สาขา|โรงเรียนเทศบาล|สถานธนานุบาล)[^\n]{1,100}/gi },
];

const valueFromMatch = (match: RegExpExecArray, pattern: FactPattern): string => {
  const selected = pattern.valueGroup ? match[pattern.valueGroup] : match[0];
  return (selected ?? match[0] ?? "").trim();
};

const buildFacts = (chunks: IndexChunk[], input: BuildIndexInput): IndexFact[] => {
  const facts: IndexFact[] = [];
  for (const chunk of chunks) {
    for (const factPattern of FACT_PATTERNS) {
      factPattern.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      let matchIndex = 0;
      while ((match = factPattern.pattern.exec(chunk.displayText)) !== null) {
        const value = valueFromMatch(match, factPattern);
        if (!value) continue;
        const normalizedValue = normalizeSearchText(value);
        const factKey = `${factPattern.type}|${normalizedValue}|${chunk.sourceHash}|${matchIndex}`;
        const factId = `fact-${hash(`${input.tenantId}|${input.documentVersionId}|${factKey}`).slice(0, 32)}`;
        const baseFact: IndexFact = {
          id: factId,
          tenantId: input.tenantId,
          documentVersionId: input.documentVersionId,
          entityType: "UNKNOWN",
          entityKey: "UNRESOLVED",
          entityDisplayName: "",
          factType: factPattern.type,
          factKey,
          valueJson: { raw: value, normalized: normalizedValue },
          normalizedValue,
          unit: factPattern.unit,
          validFrom: iso(input.effectiveFrom, "effectiveFrom"),
          validUntil: iso(input.effectiveUntil, "effectiveUntil"),
          authorityLevel: input.authorityLevel,
          visibility: input.visibility,
          sourceChunkId: chunk.id,
          sourceLocator: cloneLocator(chunk.sourceLocator),
          sourceQuote: chunk.displayText.slice(Math.max(0, match.index - 80), Math.min(chunk.displayText.length, match.index + value.length + 80)),
          extractionMethod: "RULE",
          reviewStatus: "PENDING",
        };
        const scoped = input.scopeFact ? input.scopeFact({ fact: baseFact, chunk }) : {};
        if (scoped === null) continue;
        facts.push({ ...baseFact, ...scoped });
        matchIndex += 1;
        if (match[0]!.length === 0) factPattern.pattern.lastIndex += 1;
      }
    }
  }
  const unique = new Map<string, IndexFact>();
  for (const fact of facts) unique.set(fact.id, fact);
  return [...unique.values()].sort((left, right) => left.id.localeCompare(right.id));
};

const cloneChunk = (chunk: IndexChunk): IndexChunk => ({
  ...chunk,
  entityKeys: [...chunk.entityKeys],
  topicKeys: [...chunk.topicKeys],
  factTypes: [...chunk.factTypes],
  sourceLocator: cloneLocator(chunk.sourceLocator),
  embedding: chunk.embedding ? [...chunk.embedding] : undefined,
});

const cloneFact = (fact: IndexFact): IndexFact => ({ ...fact, valueJson: { ...fact.valueJson }, sourceLocator: cloneLocator(fact.sourceLocator) });

const cloneGeneration = (generation: IndexGeneration): IndexGeneration => ({
  ...generation,
  config: { ...generation.config },
  chunks: generation.chunks.map(cloneChunk),
  facts: generation.facts.map(cloneFact),
});

export const buildIndexGeneration = (input: BuildIndexInput): IndexGeneration => {
  if (input.parsed.report.errors.length > 0 || input.parsed.report.disposition !== "READY_FOR_REVIEW") {
    throw new IndexDomainError("PARSE_NOT_READY", "only a parse result without errors can be indexed");
  }
  if (!["INDEXING", "EVALUATING", "APPROVED", "ACTIVE"].includes(input.versionState)) {
    throw new IndexDomainError("VALIDATION_ERROR", "version is outside the indexable processing boundary");
  }
  if (!Number.isInteger(input.authorityLevel) || input.authorityLevel < 0 || input.authorityLevel > 100) {
    throw new IndexDomainError("VALIDATION_ERROR", "authorityLevel is invalid");
  }
  const config = mergeConfig(input.config);
  const now = iso(input.now ?? new Date(), "now")!;
  const effectiveFrom = iso(input.effectiveFrom, "effectiveFrom");
  const effectiveUntil = iso(input.effectiveUntil, "effectiveUntil");
  if (effectiveFrom && effectiveUntil && effectiveUntil <= effectiveFrom) throw new IndexDomainError("VALIDATION_ERROR", "effective window is invalid");
  const hashOfConfig = configHash(config);
  const specs = makeSpecs(input.parsed.blocks, config);
  const chunks: IndexChunk[] = [];
  const specToChunkId = new Map<number, string>();
  for (let specIndex = 0; specIndex < specs.length; specIndex += 1) {
    const spec = specs[specIndex]!;
    if (input.screenChunk && !input.screenChunk({ text: spec.text, locator: cloneLocator(spec.locator), type: spec.type, chunkIndex: specIndex })) continue;
    const sourceHash = spec.sourceHash ?? hash(`${input.documentVersionId}|${JSON.stringify(spec.locator)}|${spec.text}`);
    const id = `chunk-${hash(`${input.tenantId}|${input.documentVersionId}|${hashOfConfig}|${specIndex}|${sourceHash}`).slice(0, 32)}`;
    const parentChunkId = spec.parentSpecIndex === undefined ? undefined : specToChunkId.get(spec.parentSpecIndex);
    const embedding = config.embeddingModelId && config.embeddingDimension ? undefined : undefined;
    const chunk: IndexChunk = {
      id,
      tenantId: input.tenantId,
      documentVersionId: input.documentVersionId,
      parentChunkId,
      chunkType: spec.type,
      chunkIndex: specIndex,
      displayText: spec.text,
      searchText: normalizeSearchText(spec.text),
      entityKeys: [],
      topicKeys: [],
      factTypes: [],
      visibility: input.visibility,
      ownerDepartmentId: input.ownerDepartmentId,
      authorityLevel: input.authorityLevel,
      validFrom: effectiveFrom,
      validUntil: effectiveUntil,
      sourceLocator: cloneLocator(spec.locator),
      sourceHash,
      tokenCount: tokenCount(spec.text),
      language: languageOf(spec.text),
      embeddingModelId: config.embeddingModelId,
      embeddingDimension: config.embeddingDimension,
      embedding,
      createdAt: now,
    };
    chunks.push(chunk);
    specToChunkId.set(specIndex, id);
  }
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]!;
    if (index > 0) chunk.previousChunkId = chunks[index - 1]!.id;
    if (index + 1 < chunks.length) chunk.nextChunkId = chunks[index + 1]!.id;
  }
  const facts = buildFacts(chunks, input);
  const factsByChunk = new Map<string, Set<IndexFactType>>();
  for (const fact of facts) {
    const set = factsByChunk.get(fact.sourceChunkId) ?? new Set<IndexFactType>();
    set.add(fact.factType);
    factsByChunk.set(fact.sourceChunkId, set);
  }
  for (const chunk of chunks) chunk.factTypes = [...(factsByChunk.get(chunk.id) ?? [])].sort();
  const id = `generation-${hash(`${input.tenantId}|${input.documentVersionId}|${hashOfConfig}`).slice(0, 32)}`;
  const generation: IndexGeneration = {
    id,
    tenantId: input.tenantId,
    documentVersionId: input.documentVersionId,
    generation: 1,
    namespace: `knowledge/${input.tenantId}/${input.documentVersionId}/${hashOfConfig.slice(0, 16)}`,
    configHash: hashOfConfig,
    config,
    state: "READY",
    versionStateAtBuild: input.versionState,
    approvalStatusAtBuild: input.approvalStatus,
    visibility: input.visibility,
    ownerDepartmentId: input.ownerDepartmentId,
    authorityLevel: input.authorityLevel,
    effectiveFrom,
    effectiveUntil,
    chunks,
    facts,
    embeddingStatus: config.embeddingModelId ? "PENDING_MODEL_REGISTRY" : "LEXICAL_EXACT",
    createdAt: now,
    updatedAt: now,
    rowVersion: 1,
  };
  return generation;
};

export class InMemoryKnowledgeIndexRepository {
  private readonly generations = new Map<string, IndexGeneration>();
  private readonly activeByTenant = new Map<string, string>();

  registerGeneration(generation: IndexGeneration): IndexGeneration {
    const existing = this.generations.get(generation.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(generation)) throw new IndexDomainError("INDEX_CONFLICT", "deterministic generation id has different content");
      return cloneGeneration(existing);
    }
    this.generations.set(generation.id, cloneGeneration(generation));
    return cloneGeneration(generation);
  }

  approveFacts(tenantId: string, generationId: string, factIds: string[], reviewer: string, now: Date | string = new Date()): IndexGeneration {
    const generation = this.requireGeneration(tenantId, generationId);
    const timestamp = iso(now, "now")!;
    const requested = new Set(factIds);
    for (const fact of generation.facts) {
      if (requested.has(fact.id)) {
        fact.reviewStatus = "APPROVED";
        fact.reviewedBy = reviewer;
        fact.reviewedAt = timestamp;
      }
    }
    generation.updatedAt = timestamp;
    generation.rowVersion += 1;
    this.generations.set(generation.id, generation);
    return cloneGeneration(generation);
  }

  unitGateReviewFacts(tenantId: string, generationId: string, factIds: string[], receipt: KnowledgeUnitGateReceipt, now: Date | string = new Date()): IndexGeneration {
    if (receipt.actor !== "SYSTEM_UNIT_GATE" || !receipt.reportHash || receipt.requiredTestIds.length === 0 || receipt.requiredTestIds.length !== receipt.passedTestIds.length || receipt.requiredTestIds.some((testId) => !receipt.passedTestIds.includes(testId))) {
      throw new IndexDomainError("FACT_REVIEW_REQUIRED", "unit gate receipt did not pass every required fact test");
    }
    const generation = this.requireGeneration(tenantId, generationId);
    const timestamp = iso(now, "now")!;
    const requested = new Set(factIds);
    for (const fact of generation.facts) {
      if (requested.has(fact.id)) {
        fact.reviewStatus = "APPROVED";
        fact.reviewedBy = "SYSTEM_UNIT_GATE";
        fact.reviewedAt = timestamp;
      }
    }
    generation.unitGateManifestVersion = receipt.manifestVersion;
    generation.unitGateReportHash = receipt.reportHash;
    generation.unitGatePassedTestIds = [...receipt.passedTestIds];
    generation.updatedAt = timestamp;
    generation.rowVersion += 1;
    this.generations.set(generation.id, generation);
    return cloneGeneration(generation);
  }

  activateGeneration(
    tenantId: string,
    generationId: string,
    context: { versionState: IngestionState; approvalStatus: KnowledgeApprovalStatus; activationStatus?: KnowledgeActivationStatus; at?: Date | string },
  ): IndexGeneration {
    const generation = this.requireGeneration(tenantId, generationId);
    const at = iso(context.at ?? new Date(), "at")!;
    if (generation.state !== "READY") throw new IndexDomainError("INDEX_NOT_READY", "only a READY generation can be activated");
    if (context.versionState !== "ACTIVE" || (context.approvalStatus !== "APPROVED" && context.activationStatus !== "UNIT_GATED")) throw new IndexDomainError("VERSION_NOT_ACTIVE", "index activation requires unit-gated ACTIVE version");
    if (generation.effectiveFrom && generation.effectiveFrom > at) throw new IndexDomainError("VERSION_NOT_ACTIVE", "effective window has not started");
    if (generation.effectiveUntil && generation.effectiveUntil <= at) throw new IndexDomainError("VERSION_NOT_ACTIVE", "effective window has ended");
    if (generation.facts.some((fact) => fact.reviewStatus !== "APPROVED")) throw new IndexDomainError("FACT_REVIEW_REQUIRED", "all extracted facts require review before active indexing");
    const previousId = this.activeByTenant.get(tenantId);
    if (previousId && previousId !== generation.id) {
      const previous = this.requireGeneration(tenantId, previousId);
      previous.state = "RETIRED";
      previous.updatedAt = at;
      previous.rowVersion += 1;
      this.generations.set(previous.id, previous);
    }
    generation.state = "ACTIVE";
    if (context.activationStatus === "UNIT_GATED") generation.activatedBy = "SYSTEM_UNIT_GATE";
    generation.updatedAt = at;
    generation.rowVersion += 1;
    this.generations.set(generation.id, generation);
    this.activeByTenant.set(tenantId, generation.id);
    return cloneGeneration(generation);
  }

  rollbackGeneration(tenantId: string, generationId: string, at: Date | string = new Date()): IndexGeneration {
    const target = this.requireGeneration(tenantId, generationId);
    const timestamp = iso(at, "at")!;
    if (target.state !== "RETIRED") throw new IndexDomainError("INDEX_NOT_READY", "rollback requires a retained generation");
    if (target.facts.some((fact) => fact.reviewStatus !== "APPROVED")) throw new IndexDomainError("FACT_REVIEW_REQUIRED", "rollback target has unreviewed facts");
    const previousId = this.activeByTenant.get(tenantId);
    if (previousId && previousId !== target.id) {
      const previous = this.requireGeneration(tenantId, previousId);
      previous.state = "RETIRED";
      previous.updatedAt = timestamp;
      previous.rowVersion += 1;
      this.generations.set(previous.id, previous);
    }
    target.state = "ACTIVE";
    target.updatedAt = timestamp;
    target.rowVersion += 1;
    this.generations.set(target.id, target);
    this.activeByTenant.set(tenantId, target.id);
    return cloneGeneration(target);
  }

  getGeneration(tenantId: string, generationId: string): IndexGeneration {
    return cloneGeneration(this.requireGeneration(tenantId, generationId));
  }

  listSearchableChunks(tenantId: string, options: IndexRetrievalOptions = {}): IndexChunk[] {
    const generationId = this.activeByTenant.get(tenantId);
    if (!generationId) return [];
    const generation = this.requireGeneration(tenantId, generationId);
    const at = iso(options.at ?? new Date(), "at")!;
    if (!isEffective(generation.effectiveFrom, generation.effectiveUntil, at)) return [];
    if (options.audience !== "STAFF" && generation.visibility !== "PUBLIC") return [];
    if (options.audience === "STAFF" && generation.visibility !== "PUBLIC" && generation.ownerDepartmentId !== options.departmentId) return [];
    return generation.chunks.map(cloneChunk);
  }

  listSearchableFacts(tenantId: string, options: IndexRetrievalOptions = {}): IndexFact[] {
    const searchableChunkIds = new Set(this.listSearchableChunks(tenantId, options).map((chunk) => chunk.id));
    const generationId = this.activeByTenant.get(tenantId);
    if (!generationId) return [];
    return this.requireGeneration(tenantId, generationId).facts
      .filter((fact) => searchableChunkIds.has(fact.sourceChunkId) && fact.reviewStatus === "APPROVED")
      .filter((fact) => options.audience === "STAFF" || fact.visibility === "PUBLIC")
      .map(cloneFact);
  }

  private requireGeneration(tenantId: string, generationId: string): IndexGeneration {
    const generation = this.generations.get(generationId);
    if (!generation) throw new IndexDomainError("INDEX_NOT_FOUND", "index generation was not found");
    if (generation.tenantId !== tenantId) throw new IndexDomainError("TENANT_BOUNDARY", "index generation belongs to another tenant");
    return generation;
  }
}

const isEffective = (from: string | undefined, until: string | undefined, at: string): boolean =>
  (from === undefined || from <= at) && (until === undefined || until > at);
