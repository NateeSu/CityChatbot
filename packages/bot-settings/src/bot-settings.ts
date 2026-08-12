import { randomUUID } from "node:crypto";

export const BOT_SETTINGS_KEY = "citizen-default";
export const SYNTHETIC_BOT_TENANT_ID = "00000000-0000-4000-8000-000000000001";
export const SYNTHETIC_BOT_ADMIN_ACCOUNT_ID = "10000000-0000-4000-8000-000000000003";
export const SYNTHETIC_BOT_KNOWLEDGE_ACCOUNT_ID = "10000000-0000-4000-8000-000000000005";
export const SYNTHETIC_BOT_STAFF_ACCOUNT_ID = "10000000-0000-4000-8000-000000000001";

export const BOT_OUTCOMES = ["ANSWER", "CLARIFY", "HANDOFF"] as const;
export type BotOutcome = (typeof BOT_OUTCOMES)[number];
export const BOT_REASON_CODES = [
  "ANSWERABLE",
  "AMBIGUOUS_ENTITY",
  "MISSING_TIME",
  "AMBIGUOUS_INTENT",
  "NO_EVIDENCE",
  "CONFLICTING_EVIDENCE",
  "LOW_EVIDENCE",
  "SENSITIVE",
  "PERSON_SPECIFIC",
  "POLICY_REFUSAL",
  "SECURITY",
  "STAFF_REQUESTED",
  "SYSTEM_ERROR",
] as const;
export type BotReasonCode = (typeof BOT_REASON_CODES)[number];

export const MANDATORY_BOT_POLICY = Object.freeze({
  aiDisclosureEnabled: true,
  groundingRequired: true,
  handoffEnabled: true,
  tenantIsolationRequired: true,
  safeAbstentionRequired: true,
  allowedOutcomes: BOT_OUTCOMES,
  allowedReasonCodes: BOT_REASON_CODES,
} as const);

export const AI_DISCLOSURE_COPY = "คำตอบนี้จัดทำโดยผู้ช่วย AI ของเทศบาล";

export type BotTone = "WARM" | "FORMAL" | "NEUTRAL";
export type BotResponseStyle = "CONCISE" | "GUIDED";
export type BotLocale = "th-TH" | "en-US";
export type BotSettingsState = "DRAFT" | "UNIT_APPROVED" | "CERTIFIED" | "PUBLISHED" | "SUPERSEDED" | "ROLLED_BACK";
export type BotCertificationStatus = "UNIT_APPROVED" | "CERTIFIED";

export type BotSettingsConfig = {
  tone: BotTone;
  responseStyle: BotResponseStyle;
  locale: BotLocale;
  welcomeMessage: string;
  disclaimerMessage: string;
  fallbackMessage: string;
  handoffMessage: string;
  afterHoursMessage: string;
};

export type BotSettingsActor = {
  tenantId: string;
  accountId: string;
  role: "STAFF" | "KNOWLEDGE_STAFF" | "TENANT_ADMIN";
};

export type BotSettingsVersion = {
  id: string;
  tenantId: string;
  settingsKey: typeof BOT_SETTINGS_KEY;
  version: number;
  state: BotSettingsState;
  certificationStatus?: BotCertificationStatus;
  config: BotSettingsConfig;
  createdBy: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
};

export type BotSettingsAuditEntry = {
  id: string;
  tenantId: string;
  actorAccountId: string;
  action: "DRAFT_CREATED" | "DRAFT_UPDATED" | "PREVIEWED" | "UNIT_AUTO_APPROVED" | "PUBLISHED" | "ROLLED_BACK";
  resourceId: string;
  reason: string;
  occurredAt: string;
};

export type BotSettingsSnapshot = {
  versions: readonly BotSettingsVersion[];
  published?: BotSettingsVersion;
  audit: readonly BotSettingsAuditEntry[];
};

export type BotSettingsInput = Partial<BotSettingsConfig> & {
  reason: string;
  idempotencyKey: string;
};

export type BotSettingsPreviewInput = {
  question: string;
  sourceLabels: readonly string[];
};

export type BotSettingsPreview = {
  versionId: string;
  version: number;
  previewOnly: true;
  policy: typeof MANDATORY_BOT_POLICY;
  outcome: BotOutcome;
  reasonCode: BotReasonCode;
  renderedMessage: string;
  sourceLabels: readonly string[];
  sourceBoundary: "SUPPLIED_FOR_PREVIEW_ONLY" | "NO_SOURCE_SUPPLIED";
};

export type BotSettingsErrorCode =
  | "VALIDATION_ERROR"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INVALID_STATE"
  | "POLICY_LOCKED"
  | "IDEMPOTENCY_CONFLICT";

export class BotSettingsError extends Error {
  constructor(public readonly code: BotSettingsErrorCode, message: string) {
    super(`${code}: ${message}`);
    this.name = "BotSettingsError";
  }
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const INSTRUCTION_INJECTION_PATTERN = /(?:ignore|disregard|override)\s+(?:all\s+)?(?:previous|system|developer|safety|security|policy|instructions?)|(?:ไม่ต้องสนใจ|ข้าม|ยกเลิก)\s*(?:คำสั่ง|นโยบาย|ระบบ|ความปลอดภัย)|(?:system\s*prompt|chain[- ]of[- ]thought|api\s*key|secret)/iu;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const nowIso = (): string => new Date().toISOString();

const assertText = (value: unknown, field: string, maxLength: number): string => {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new BotSettingsError("VALIDATION_ERROR", `${field} is invalid`);
  }
  return value.trim();
};

const sanitizeMessage = (value: unknown, field: string): string => {
  const input = assertText(value, field, 500);
  const withoutHtml = input.replace(/<[^>]*>/gu, " ").replace(/[<>]/gu, "").replace(/[ \t]{2,}/gu, " ").trim();
  if (!withoutHtml || INSTRUCTION_INJECTION_PATTERN.test(withoutHtml)) {
    throw new BotSettingsError("VALIDATION_ERROR", `${field} contains an unsafe instruction or empty content`);
  }
  return withoutHtml;
};

const assertReason = (value: string): string => assertText(value, "reason", 2000);
const assertIdempotencyKey = (value: string): string => {
  if (typeof value !== "string" || value.length < 8 || value.length > 255 || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new BotSettingsError("VALIDATION_ERROR", "idempotencyKey is invalid");
  }
  return value;
};

const assertDate = (value: string | undefined, field: string): string | undefined => {
  if (value === undefined || (ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value)))) return value;
  throw new BotSettingsError("VALIDATION_ERROR", `${field} must be an ISO UTC timestamp`);
};

const assertEnum = <T extends string>(value: unknown, field: string, values: readonly T[]): T => {
  if (typeof value !== "string" || !values.includes(value as T)) throw new BotSettingsError("VALIDATION_ERROR", `${field} is invalid`);
  return value as T;
};

const hasLockedInput = (input: Record<string, unknown>): boolean => [
  "policy",
  "aiDisclosureEnabled",
  "groundingRequired",
  "handoffEnabled",
  "tenantIsolationRequired",
  "safeAbstentionRequired",
  "allowedOutcomes",
  "allowedReasonCodes",
].some((key) => Object.prototype.hasOwnProperty.call(input, key));

const defaultConfig: BotSettingsConfig = {
  tone: "WARM",
  responseStyle: "GUIDED",
  locale: "th-TH",
  welcomeMessage: "สวัสดีค่ะ ฉันช่วยค้นข้อมูลบริการของเทศบาลให้ได้",
  disclaimerMessage: "โปรดตรวจสอบแหล่งอ้างอิงและวันที่มีผลก่อนตัดสินใจ",
  fallbackMessage: "ยังไม่พบหลักฐานที่ยืนยันคำตอบได้ จึงขอส่งต่อให้เจ้าหน้าที่ตรวจสอบ",
  handoffMessage: "กำลังส่งต่อคำขอให้เจ้าหน้าที่ช่วยตรวจสอบ",
  afterHoursMessage: "ขณะนี้อยู่นอกเวลาทำการ ระบบจะรับเรื่องไว้และส่งต่อเมื่อเจ้าหน้าที่พร้อม",
};

export const safeDefaultBotSettings = (): BotSettingsConfig => clone(defaultConfig);

const normalizeConfig = (input: Partial<BotSettingsConfig>, current: BotSettingsConfig = defaultConfig): BotSettingsConfig => {
  const tone = assertEnum(input.tone ?? current.tone, "tone", ["WARM", "FORMAL", "NEUTRAL"] as const);
  const responseStyle = assertEnum(input.responseStyle ?? current.responseStyle, "responseStyle", ["CONCISE", "GUIDED"] as const);
  const locale = assertEnum(input.locale ?? current.locale, "locale", ["th-TH", "en-US"] as const);
  return {
    tone,
    responseStyle,
    locale,
    welcomeMessage: sanitizeMessage(input.welcomeMessage ?? current.welcomeMessage, "welcomeMessage"),
    disclaimerMessage: sanitizeMessage(input.disclaimerMessage ?? current.disclaimerMessage, "disclaimerMessage"),
    fallbackMessage: sanitizeMessage(input.fallbackMessage ?? current.fallbackMessage, "fallbackMessage"),
    handoffMessage: sanitizeMessage(input.handoffMessage ?? current.handoffMessage, "handoffMessage"),
    afterHoursMessage: sanitizeMessage(input.afterHoursMessage ?? current.afterHoursMessage, "afterHoursMessage"),
  };
};

export type BotUnitGateResult = { passed: true; checks: readonly string[] };

export const verifyBotSettingsUnitGate = (config: BotSettingsConfig): BotUnitGateResult => {
  const normalized = normalizeConfig(config, defaultConfig);
  if (JSON.stringify(MANDATORY_BOT_POLICY) !== JSON.stringify({
    aiDisclosureEnabled: true,
    groundingRequired: true,
    handoffEnabled: true,
    tenantIsolationRequired: true,
    safeAbstentionRequired: true,
    allowedOutcomes: BOT_OUTCOMES,
    allowedReasonCodes: BOT_REASON_CODES,
  })) throw new BotSettingsError("POLICY_LOCKED", "mandatory policy is not canonical");
  if (!normalized.fallbackMessage || !normalized.handoffMessage) throw new BotSettingsError("VALIDATION_ERROR", "safe fallback and handoff messages are required");
  return { passed: true, checks: ["policy-lock", "message-safety", "canonical-outcomes", "safe-fallback"] };
};

const renderPreviewMessage = (config: BotSettingsConfig, outcome: BotOutcome, reasonCode: BotReasonCode): string => {
  const body = outcome === "HANDOFF" ? `${config.fallbackMessage}\n${config.handoffMessage}` : outcome === "CLARIFY" ? "กรุณาระบุคำถามหรือหน่วยงานที่ต้องการให้ชัดเจน" : config.welcomeMessage;
  return `${AI_DISCLOSURE_COPY}\n${config.disclaimerMessage}\n${body}\n[โหมดทดสอบ: ${outcome}/${reasonCode} — ไม่ใช่คำตอบ production]`;
};

const previewQuestion = (value: string): string => sanitizeMessage(value || "คำถามตัวอย่าง", "question");
const previewSources = (values: readonly string[]): readonly string[] => {
  if (!Array.isArray(values) || values.length > 8) throw new BotSettingsError("VALIDATION_ERROR", "sourceLabels is invalid");
  return values.map((value) => sanitizeMessage(value, "sourceLabel"));
};

export const previewBotSettings = (version: BotSettingsVersion, input: BotSettingsPreviewInput): BotSettingsPreview => {
  const question = previewQuestion(input.question);
  const sourceLabels = previewSources(input.sourceLabels);
  const outcome: BotOutcome = !input.question.trim() ? "CLARIFY" : sourceLabels.length === 0 ? "HANDOFF" : "HANDOFF";
  const reasonCode: BotReasonCode = outcome === "CLARIFY" ? "AMBIGUOUS_INTENT" : sourceLabels.length === 0 ? "NO_EVIDENCE" : "LOW_EVIDENCE";
  void question;
  return {
    versionId: version.id,
    version: version.version,
    previewOnly: true,
    policy: MANDATORY_BOT_POLICY,
    outcome,
    reasonCode,
    renderedMessage: renderPreviewMessage(version.config, outcome, reasonCode),
    sourceLabels,
    sourceBoundary: sourceLabels.length > 0 ? "SUPPLIED_FOR_PREVIEW_ONLY" : "NO_SOURCE_SUPPLIED",
  };
};

type IdempotencyValue = { requestHash: string; value: unknown };

export class InMemoryBotSettingsRepository {
  private readonly versions = new Map<string, BotSettingsVersion>();
  private readonly audits: BotSettingsAuditEntry[] = [];
  private readonly idempotency = new Map<string, IdempotencyValue>();

  constructor(seed: readonly BotSettingsVersion[] = createSyntheticBotSettingsSeed()) {
    for (const version of seed) this.versions.set(version.id, clone(version));
  }

  snapshot(actor: BotSettingsActor): BotSettingsSnapshot {
    const versions = this.listVersions(actor);
    return { versions, published: versions.find((version) => version.state === "PUBLISHED"), audit: this.listAudit(actor) };
  }

  listVersions(actor: BotSettingsActor): readonly BotSettingsVersion[] {
    return [...this.versions.values()].filter((version) => version.tenantId === actor.tenantId && version.settingsKey === BOT_SETTINGS_KEY).sort((a, b) => b.version - a.version).map(clone);
  }

  getVersion(actor: BotSettingsActor, versionId: string): BotSettingsVersion {
    const version = this.versions.get(versionId);
    if (!version || version.tenantId !== actor.tenantId || version.settingsKey !== BOT_SETTINGS_KEY) throw new BotSettingsError("NOT_FOUND", "bot settings version is outside tenant scope");
    return clone(version);
  }

  createDraft(actor: BotSettingsActor, input: BotSettingsInput): BotSettingsVersion {
    this.assertManage(actor);
    const config = this.normalizeInput(input);
    const reason = assertReason(input.reason);
    const idempotencyKey = assertIdempotencyKey(input.idempotencyKey);
    return this.idempotent(actor, "create", idempotencyKey, { config, reason }, () => {
      const current = this.listVersions(actor);
      const timestamp = nowIso();
      const version: BotSettingsVersion = { id: randomUUID(), tenantId: actor.tenantId, settingsKey: BOT_SETTINGS_KEY, version: Math.max(0, ...current.map((item) => item.version)) + 1, state: "DRAFT", config, createdBy: actor.accountId, createdAt: timestamp, updatedAt: timestamp, rowVersion: 1 };
      this.versions.set(version.id, version);
      this.recordAudit(actor, "DRAFT_CREATED", version.id, reason);
      return version;
    });
  }

  updateDraft(actor: BotSettingsActor, versionId: string, input: BotSettingsInput & { expectedVersion: number }): BotSettingsVersion {
    this.assertManage(actor);
    const current = this.getVersion(actor, versionId);
    if (current.rowVersion !== input.expectedVersion) throw new BotSettingsError("VERSION_CONFLICT", "bot settings draft is stale");
    if (current.state !== "DRAFT") throw new BotSettingsError("INVALID_STATE", "only a draft bot settings version can be edited");
    const config = this.normalizeInput(input, current.config);
    const reason = assertReason(input.reason);
    const idempotencyKey = assertIdempotencyKey(input.idempotencyKey);
    return this.idempotent(actor, `update:${versionId}`, idempotencyKey, { config, reason, expectedVersion: input.expectedVersion }, () => {
      const next: BotSettingsVersion = { ...current, config, rowVersion: current.rowVersion + 1, updatedAt: nowIso() };
      this.versions.set(next.id, next);
      this.recordAudit(actor, "DRAFT_UPDATED", next.id, reason);
      return next;
    });
  }

  preview(actor: BotSettingsActor, versionId: string, input: BotSettingsPreviewInput): BotSettingsPreview {
    const version = this.getVersion(actor, versionId);
    const result = previewBotSettings(version, input);
    this.recordAudit(actor, "PREVIEWED", version.id, "preview bot settings in test console");
    return result;
  }

  publish(actor: BotSettingsActor, versionId: string, expectedVersion: number, reasonInput: string, idempotencyKeyInput: string): BotSettingsVersion {
    this.assertManage(actor);
    const current = this.getVersion(actor, versionId);
    if (current.rowVersion !== expectedVersion) throw new BotSettingsError("VERSION_CONFLICT", "bot settings draft is stale");
    if (current.state !== "DRAFT") throw new BotSettingsError("INVALID_STATE", "only a draft bot settings version can be published");
    const reason = assertReason(reasonInput);
    const idempotencyKey = assertIdempotencyKey(idempotencyKeyInput);
    return this.idempotent(actor, `publish:${versionId}`, idempotencyKey, { expectedVersion, reason }, () => {
      const gate = verifyBotSettingsUnitGate(current.config);
      const timestamp = nowIso();
      const oldPublished = [...this.versions.values()].find((version) => version.tenantId === actor.tenantId && version.state === "PUBLISHED");
      if (oldPublished) this.versions.set(oldPublished.id, { ...oldPublished, state: "SUPERSEDED", rowVersion: oldPublished.rowVersion + 1, updatedAt: timestamp });
      const published: BotSettingsVersion = { ...current, state: "PUBLISHED", certificationStatus: "UNIT_APPROVED", publishedAt: timestamp, rowVersion: current.rowVersion + 1, updatedAt: timestamp };
      this.versions.set(published.id, published);
      this.recordAudit(actor, "UNIT_AUTO_APPROVED", published.id, `L1 unit gate passed: ${gate.checks.join(", ")}`);
      this.recordAudit(actor, "PUBLISHED", published.id, reason);
      return published;
    });
  }

  rollback(actor: BotSettingsActor, versionId: string, expectedVersion: number, reasonInput: string, idempotencyKeyInput: string): BotSettingsVersion {
    this.assertManage(actor);
    const target = this.getVersion(actor, versionId);
    if (target.rowVersion !== expectedVersion) throw new BotSettingsError("VERSION_CONFLICT", "rollback target is stale");
    if (target.state !== "SUPERSEDED" && target.state !== "ROLLED_BACK") throw new BotSettingsError("INVALID_STATE", "rollback requires a retained previous version");
    const reason = assertReason(reasonInput);
    const idempotencyKey = assertIdempotencyKey(idempotencyKeyInput);
    return this.idempotent(actor, `rollback:${versionId}`, idempotencyKey, { expectedVersion, reason }, () => {
      const timestamp = nowIso();
      const currentPublished = [...this.versions.values()].find((version) => version.tenantId === actor.tenantId && version.state === "PUBLISHED");
      if (currentPublished) this.versions.set(currentPublished.id, { ...currentPublished, state: "ROLLED_BACK", rowVersion: currentPublished.rowVersion + 1, updatedAt: timestamp });
      const restored: BotSettingsVersion = { ...target, state: "PUBLISHED", publishedAt: timestamp, rowVersion: target.rowVersion + 1, updatedAt: timestamp };
      this.versions.set(restored.id, restored);
      this.recordAudit(actor, "ROLLED_BACK", restored.id, reason);
      return restored;
    });
  }

  listAudit(actor: BotSettingsActor): readonly BotSettingsAuditEntry[] {
    return this.audits.filter((entry) => entry.tenantId === actor.tenantId).map(clone);
  }

  private normalizeInput(input: BotSettingsInput, current: BotSettingsConfig = defaultConfig): BotSettingsConfig {
    if (hasLockedInput(input as Record<string, unknown>)) throw new BotSettingsError("POLICY_LOCKED", "mandatory safety policy cannot be changed");
    return normalizeConfig(input, current);
  }

  private assertManage(actor: BotSettingsActor): void {
    if (actor.role !== "TENANT_ADMIN") throw new BotSettingsError("FORBIDDEN", "bot settings mutation requires TENANT_ADMIN");
  }

  private recordAudit(actor: BotSettingsActor, action: BotSettingsAuditEntry["action"], resourceId: string, reason: string): void {
    this.audits.push({ id: randomUUID(), tenantId: actor.tenantId, actorAccountId: actor.accountId, action, resourceId, reason, occurredAt: nowIso() });
  }

  private idempotent<T>(actor: BotSettingsActor, route: string, key: string, input: unknown, operation: () => T): T {
    const requestHash = JSON.stringify(input);
    const idempotencyKey = `${actor.tenantId}:${actor.accountId}:${route}:${key}`;
    const previous = this.idempotency.get(idempotencyKey);
    if (previous && previous.requestHash !== requestHash) throw new BotSettingsError("IDEMPOTENCY_CONFLICT", "idempotency key was reused with different input");
    if (previous) return clone(previous.value as T);
    const value = operation();
    this.idempotency.set(idempotencyKey, { requestHash, value: clone(value) });
    return clone(value);
  }
}

const timestamp = "2026-08-11T00:00:00.000Z";
const syntheticConfig = safeDefaultBotSettings();

export const createSyntheticBotSettingsSeed = (): readonly BotSettingsVersion[] => [{
  id: "b0100000-0000-4000-8000-000000000001",
  tenantId: SYNTHETIC_BOT_TENANT_ID,
  settingsKey: BOT_SETTINGS_KEY,
  version: 1,
  state: "PUBLISHED",
  certificationStatus: "CERTIFIED",
  config: syntheticConfig,
  createdBy: SYNTHETIC_BOT_ADMIN_ACCOUNT_ID,
  publishedAt: timestamp,
  createdAt: timestamp,
  updatedAt: timestamp,
  rowVersion: 1,
}];

export const createSyntheticBotSettingsRepository = (): InMemoryBotSettingsRepository => new InMemoryBotSettingsRepository();
