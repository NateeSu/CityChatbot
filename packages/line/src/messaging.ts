import { createHash, createHmac, randomUUID } from "node:crypto";

import { calculateRetryDelayMs } from "@citychatbot/telemetry";

export type LineDeliveryRoute = "reply" | "push";
export type LineDeliveryStatus = "QUEUED" | "SENDING" | "API_ACCEPTED" | "RETRY_WAIT" | "FAILED" | "DLQ";

export class LineMessagingError extends Error {
  constructor(public readonly code: "VALIDATION_ERROR" | "CONFLICT" | "LINE_QUOTA_EXCEEDED" | "NOT_FOUND", message: string) {
    super(`${code}: ${message}`);
    this.name = "LineMessagingError";
  }
}

export type LineTemplateDefinition = {
  key: string;
  version: number;
  locale: "th-TH" | "en-US";
  text: string;
  variables: readonly string[];
};

export type RenderedLineTemplate = {
  key: string;
  version: number;
  locale: LineTemplateDefinition["locale"];
  text: string;
};

const TEMPLATE_KEY_PATTERN = /^[a-z][a-z0-9_.-]{1,63}$/;
const VARIABLE_PATTERN = /\{\{([a-z][a-zA-Z0-9_]*)\}\}/g;
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const MAX_LINE_TEXT_LENGTH = 5000;

export const sanitizeLineText = (text: string): string => {
  const sanitized = text.replace(CONTROL_PATTERN, "").trim();
  if (!sanitized || sanitized.length > MAX_LINE_TEXT_LENGTH) throw new LineMessagingError("VALIDATION_ERROR", "LINE text length is invalid");
  return sanitized;
};

export class LineTemplateRegistry {
  private readonly templates = new Map<string, LineTemplateDefinition>();

  register(definition: LineTemplateDefinition): void {
    if (!TEMPLATE_KEY_PATTERN.test(definition.key) || !Number.isSafeInteger(definition.version) || definition.version <= 0) {
      throw new LineMessagingError("VALIDATION_ERROR", "LINE template key/version is invalid");
    }
    if (definition.variables.some((variable) => !/^[a-z][a-zA-Z0-9_]*$/.test(variable)) || new Set(definition.variables).size !== definition.variables.length) {
      throw new LineMessagingError("VALIDATION_ERROR", "LINE template variables are invalid");
    }
    const placeholders = [...definition.text.matchAll(VARIABLE_PATTERN)].map((match) => match[1]!);
    if (new Set(placeholders).size !== new Set(definition.variables).size || placeholders.some((placeholder) => !definition.variables.includes(placeholder))) {
      throw new LineMessagingError("VALIDATION_ERROR", "LINE template placeholder is not allowlisted");
    }
    sanitizeLineText(definition.text.replace(VARIABLE_PATTERN, "x"));
    const templateKey = `${definition.key}@${definition.version}`;
    if (this.templates.has(templateKey)) throw new LineMessagingError("CONFLICT", "LINE template version already exists");
    this.templates.set(templateKey, { ...definition, variables: [...definition.variables] });
  }

  render(key: string, version: number, variables: Record<string, string>): RenderedLineTemplate {
    const definition = this.templates.get(`${key}@${version}`);
    if (!definition) throw new LineMessagingError("NOT_FOUND", "LINE template version was not found");
    const variableKeys = Object.keys(variables);
    if (variableKeys.some((variable) => !definition.variables.includes(variable)) || definition.variables.some((variable) => !(variable in variables))) {
      throw new LineMessagingError("VALIDATION_ERROR", "LINE template variables do not match the allowlist");
    }
    const text = sanitizeLineText(definition.text.replace(VARIABLE_PATTERN, (_, variable: string) => sanitizeLineText(variables[variable]!)));
    return { key: definition.key, version: definition.version, locale: definition.locale, text };
  }
}

export const createDefaultLineTemplates = (): LineTemplateRegistry => {
  const registry = new LineTemplateRegistry();
  registry.register({ key: "system.handoff", version: 1, locale: "th-TH", text: "ระบบกำลังส่งต่อเรื่องให้เจ้าหน้าที่ กรุณารอสักครู่", variables: [] });
  registry.register({ key: "system.unavailable", version: 1, locale: "th-TH", text: "ขณะนี้ระบบยังไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง", variables: [] });
  registry.register({ key: "complaint.received", version: 1, locale: "th-TH", text: "รับเรื่องแล้ว เลขที่ {{complaintNo}}", variables: ["complaintNo"] });
  return registry;
};

export type LineProviderResult = {
  status: number;
  retryAfterSeconds?: number;
  providerMessageId?: string;
};

export type LineProviderClient = {
  reply(input: { replyToken: string; messages: readonly [{ type: "text"; text: string }] }): Promise<LineProviderResult>;
  push(input: { recipientId: string; messages: readonly [{ type: "text"; text: string }] }): Promise<LineProviderResult>;
};

export type TenantQuotaGuard = {
  consume(tenantId: string): { allowed: boolean; remaining: number; resetAt?: string };
};

export class InMemoryTenantQuotaGuard implements TenantQuotaGuard {
  private readonly quotas = new Map<string, { remaining: number; resetAt?: string }>();

  set(tenantId: string, remaining: number, resetAt?: string): void {
    if (!Number.isSafeInteger(remaining) || remaining < 0) throw new LineMessagingError("VALIDATION_ERROR", "Tenant quota is invalid");
    this.quotas.set(tenantId, { remaining, ...(resetAt ? { resetAt } : {}) });
  }

  consume(tenantId: string): { allowed: boolean; remaining: number; resetAt?: string } {
    const quota = this.quotas.get(tenantId) ?? { remaining: Number.MAX_SAFE_INTEGER };
    if (quota.remaining <= 0) return { allowed: false, remaining: 0, ...(quota.resetAt ? { resetAt: quota.resetAt } : {}) };
    quota.remaining -= 1;
    this.quotas.set(tenantId, quota);
    return { allowed: true, remaining: quota.remaining, ...(quota.resetAt ? { resetAt: quota.resetAt } : {}) };
  }
}

type DeliveryRecord = {
  id: string;
  eventId: string;
  tenantId: string;
  route: LineDeliveryRoute;
  recipientId: string;
  recipientHash: string;
  replyToken?: string;
  text: string;
  contentHash: string;
  templateKey?: string;
  templateVersion?: number;
  status: LineDeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  errorCode?: "LINE_QUOTA_EXCEEDED" | "EXTERNAL_DEPENDENCY_FAILED";
  providerStatus?: number;
  providerMessageId?: string;
  correlationId: string;
  idempotencyKey: string;
  createdAt: string;
  completedAt?: string;
};

export type LineDeliveryView = Omit<DeliveryRecord, "recipientId" | "replyToken" | "text" | "contentHash" | "idempotencyKey">;

export type EnqueueLineDeliveryInput = {
  eventId?: string;
  tenantId: string;
  route: LineDeliveryRoute;
  recipientId: string;
  replyToken?: string;
  idempotencyKey: string;
  correlationId: string;
  template?: { key: string; version: number; variables: Record<string, string> };
  text?: string;
  maxAttempts?: number;
};

export type LineMessagingOptions = {
  templates: LineTemplateRegistry;
  recipientHashSecret: string;
  quota?: TenantQuotaGuard;
  clock?: () => Date;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const assertUuid = (value: string, field: string): void => {
  if (!UUID_PATTERN.test(value)) throw new LineMessagingError("VALIDATION_ERROR", `${field} must be a UUID`);
};

const hashRecipient = (recipientId: string, secret: string): string => {
  if (Buffer.from(secret, "utf8").byteLength < 32) throw new LineMessagingError("VALIDATION_ERROR", "Recipient hash secret is too short");
  return createHmac("sha256", secret).update(recipientId).digest("hex").slice(0, 24);
};

const providerError = (record: DeliveryRecord, result: LineProviderResult, now: Date, jitterMs?: number): void => {
  record.providerStatus = result.status;
  const retryable = result.status === 408 || result.status === 429 || result.status >= 500;
  if (!retryable) {
    record.status = "FAILED";
    record.errorCode = "EXTERNAL_DEPENDENCY_FAILED";
    record.completedAt = now.toISOString();
    return;
  }
  record.errorCode = "EXTERNAL_DEPENDENCY_FAILED";
  if (record.attemptCount >= record.maxAttempts) {
    record.status = "DLQ";
    record.completedAt = now.toISOString();
    return;
  }
  const delay = result.retryAfterSeconds === undefined ? calculateRetryDelayMs(record.attemptCount, jitterMs) : Math.max(0, result.retryAfterSeconds) * 1000;
  record.status = "RETRY_WAIT";
  record.nextAttemptAt = new Date(now.getTime() + delay).toISOString();
};

export class LineMessagingDispatcher {
  private readonly records = new Map<string, DeliveryRecord>();
  private readonly idempotency = new Map<string, string>();
  private readonly options: LineMessagingOptions;
  private readonly quota: TenantQuotaGuard;

  constructor(options: LineMessagingOptions) {
    this.options = options;
    this.quota = options.quota ?? new InMemoryTenantQuotaGuard();
    if (Buffer.from(options.recipientHashSecret, "utf8").byteLength < 32) throw new LineMessagingError("VALIDATION_ERROR", "Recipient hash secret is too short");
  }

  enqueue(input: EnqueueLineDeliveryInput): LineDeliveryView {
    if (input.eventId !== undefined) assertUuid(input.eventId, "eventId");
    assertUuid(input.tenantId, "tenantId");
    assertUuid(input.correlationId, "correlationId");
    if (!input.recipientId || input.recipientId.length > 128 || /[\u0000-\u001f\u007f]/.test(input.recipientId)) throw new LineMessagingError("VALIDATION_ERROR", "recipientId is invalid");
    if (!input.idempotencyKey || input.idempotencyKey.length > 200) throw new LineMessagingError("VALIDATION_ERROR", "idempotency key is invalid");
    if (input.route === "reply" && (!input.replyToken || input.replyToken.length > 512)) throw new LineMessagingError("VALIDATION_ERROR", "reply route requires a reply token");
    if (input.route === "push" && input.replyToken !== undefined) throw new LineMessagingError("VALIDATION_ERROR", "push route cannot contain a reply token");
    if ((input.template === undefined) === (input.text === undefined)) throw new LineMessagingError("VALIDATION_ERROR", "exactly one message source is required");
    const rendered = input.template ? this.options.templates.render(input.template.key, input.template.version, input.template.variables) : undefined;
    const text = rendered?.text ?? sanitizeLineText(input.text!);
    const idempotencyKey = `${input.tenantId}:${input.route}:${input.idempotencyKey}`;
    const existingId = this.idempotency.get(idempotencyKey);
    const contentHash = createHash("sha256").update(text).digest("hex");
    if (existingId) {
      const existing = this.records.get(existingId)!;
      if (existing.contentHash !== contentHash || existing.recipientHash !== hashRecipient(input.recipientId, this.options.recipientHashSecret) || (input.eventId !== undefined && existing.eventId !== input.eventId)) {
        throw new LineMessagingError("CONFLICT", "Idempotency key was reused with different delivery data");
      }
      return this.view(existing);
    }
    const now = this.now();
    const record: DeliveryRecord = {
      id: randomUUID(),
      eventId: input.eventId ?? randomUUID(),
      tenantId: input.tenantId,
      route: input.route,
      recipientId: input.recipientId,
      recipientHash: hashRecipient(input.recipientId, this.options.recipientHashSecret),
      ...(input.replyToken ? { replyToken: input.replyToken } : {}),
      text,
      contentHash,
      ...(rendered ? { templateKey: rendered.key, templateVersion: rendered.version } : {}),
      status: "QUEUED",
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 3,
      nextAttemptAt: now.toISOString(),
      correlationId: input.correlationId,
      idempotencyKey: input.idempotencyKey,
      createdAt: now.toISOString(),
    };
    if (!Number.isSafeInteger(record.maxAttempts) || record.maxAttempts <= 0) throw new LineMessagingError("VALIDATION_ERROR", "maxAttempts is invalid");
    this.records.set(record.id, record);
    this.idempotency.set(idempotencyKey, record.id);
    return this.view(record);
  }

  async dispatch(deliveryId: string, provider: LineProviderClient, now = this.now(), jitterMs?: number): Promise<LineDeliveryView> {
    const record = this.records.get(deliveryId);
    if (!record) throw new LineMessagingError("NOT_FOUND", "Delivery was not found");
    if (!["QUEUED", "RETRY_WAIT"].includes(record.status) || record.nextAttemptAt > now.toISOString()) return this.view(record);
    const quota = this.quota.consume(record.tenantId);
    if (!quota.allowed) {
      record.status = "FAILED";
      record.errorCode = "LINE_QUOTA_EXCEEDED";
      record.completedAt = now.toISOString();
      return this.view(record);
    }
    record.status = "SENDING";
    record.attemptCount += 1;
    try {
      const result = record.route === "reply"
        ? await provider.reply({ replyToken: record.replyToken!, messages: [{ type: "text", text: record.text }] })
        : await provider.push({ recipientId: record.recipientId, messages: [{ type: "text", text: record.text }] });
      if (result.status >= 200 && result.status < 300) {
        record.status = "API_ACCEPTED";
        record.providerStatus = result.status;
        if (result.providerMessageId) record.providerMessageId = result.providerMessageId;
        record.completedAt = now.toISOString();
      } else {
        providerError(record, result, now, jitterMs);
      }
    } catch {
      providerError(record, { status: 503 }, now, jitterMs);
    }
    return this.view(record);
  }

  get(deliveryId: string): LineDeliveryView | undefined {
    const record = this.records.get(deliveryId);
    return record ? this.view(record) : undefined;
  }

  list(tenantId: string): LineDeliveryView[] {
    return [...this.records.values()].filter((record) => record.tenantId === tenantId).map((record) => this.view(record));
  }

  private view(record: DeliveryRecord): LineDeliveryView {
    const { recipientId: _recipientId, replyToken: _replyToken, text: _text, contentHash: _contentHash, idempotencyKey: _idempotencyKey, ...view } = record;
    return { ...view };
  }

  private now(): Date {
    return this.options.clock?.() ?? new Date();
  }
}
