import { createHash, createHmac, randomUUID } from "node:crypto";

import {
  ChatConversationService,
  DurableLineChatWorker,
  DurableLineDeliveryWorker,
  createDurableLineIdempotencyKey,
  InMemoryChatConversationStore,
  type DurableLineChatInboxStore,
  type DurableLineDeliveryClaim,
  type DurableLineDeliveryStore,
  type DurableLineInboxClaim,
  type DurableLineInboxEvent,
  type DurableLineChatErrorCode,
  type DurableLineDeliveryErrorCode,
  type DurableLineResponseEnqueue,
  decideAnswerability,
} from "@citychatbot/chat";
import {
  parseDurableLineChatEvent,
  sanitizeLineText,
  type LineProviderClient,
  type LineProviderResult,
} from "@citychatbot/line";
import {
  retrieve,
  type IndexChunk,
  type IndexFact,
  type RetrievalSource,
} from "@citychatbot/knowledge";
import { decryptSecret, encryptSecret, type EncryptedSecret } from "@citychatbot/security/secret-vault";

import { databasePool } from "../../../../../src/server/runtime-database";

type WebhookClaimRow = {
  job_id: string;
  inbox_id: string;
  tenant_id: string;
  channel_record_id: string;
  destination: string;
  event_timestamp: string;
  webhook_event_id: string;
  event_type: string;
  redelivery: boolean;
  payload_ciphertext: string;
  payload_key_version: string;
  payload_sha256: string;
  request_id: string | null;
  correlation_id: string | null;
  attempt_count: number;
  max_attempts: number;
  lease_expires_at: string;
};

type DeliveryClaimRow = {
  job_id: string;
  delivery_id: string;
  tenant_id: string;
  channel_record_id: string;
  route: "reply" | "push";
  recipient_id: string;
  reply_token_ciphertext: string | null;
  reply_token_key_version: string | null;
  content_ciphertext: string;
  content_key_version: string;
  idempotency_key: string;
  correlation_id: string;
  encrypted_access_token: string;
  credential_key_version: string;
  attempt_count: number;
  max_attempts: number;
  lease_expires_at: string;
};

type KnowledgeChunkRow = {
  id: string;
  tenant_id: string;
  document_version_id: string;
  parent_chunk_id: string | null;
  chunk_type: string;
  chunk_index: number;
  display_text: string;
  search_text: string;
  entity_keys: unknown;
  topic_keys: unknown;
  fact_types: unknown;
  visibility: "PUBLIC";
  owner_department_id: string;
  authority_level: number;
  valid_from: string | null;
  valid_until: string | null;
  source_locator_json: unknown;
  source_hash: string;
  token_count: number;
  language: "th" | "en" | "mixed";
  previous_chunk_id: string | null;
  next_chunk_id: string | null;
  created_at: string;
};

type KnowledgeFactRow = {
  id: string;
  tenant_id: string;
  document_version_id: string;
  entity_type: string;
  entity_key: string;
  entity_display_name: string;
  fact_type: string;
  fact_key: string;
  value_json: unknown;
  normalized_value: string;
  unit: string | null;
  valid_from: string | null;
  valid_until: string | null;
  authority_level: number;
  visibility: "PUBLIC";
  source_chunk_id: string;
  source_locator_json: unknown;
  source_quote: string;
  extraction_method: "RULE" | "MODEL" | "HUMAN";
  review_status: "APPROVED";
  reviewed_at: string | null;
};

const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;
const MAX_BATCH = 10;

const credentialKey = (): Uint8Array => {
  const value = process.env.TENANT_CREDENTIAL_KEY;
  if (!value) throw new Error("credential key is not configured");
  const decoded = Buffer.from(value, "base64url");
  if (decoded.byteLength !== 32) throw new Error("credential key must decode to 32 bytes");
  return decoded;
};

const currentCredentialKeyVersion = (): string => {
  const value = process.env.TENANT_CREDENTIAL_KEY_VERSION;
  if (!value || CONTROL_PATTERN.test(value) || value.length > 128) throw new Error("credential key version is not configured");
  return value;
};

const lineUserHashSecret = (): string => {
  const value = process.env.LINE_USER_HASH_SECRET ?? process.env.LINE_WEBHOOK_HASH_SECRET;
  if (!value || Buffer.byteLength(value, "utf8") < 32 || CONTROL_PATTERN.test(value)) throw new Error("LINE user hash secret is not configured");
  return value;
};

const parseEnvelope = (value: string, expectedKeyVersion: string): EncryptedSecret => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("encrypted envelope is malformed");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("encrypted envelope is malformed");
  const envelope = parsed as Partial<EncryptedSecret>;
  if (envelope.algorithm !== "aes-256-gcm" || envelope.keyVersion !== expectedKeyVersion ||
      typeof envelope.iv !== "string" || typeof envelope.ciphertext !== "string" || typeof envelope.authTag !== "string") {
    throw new Error("encrypted envelope is invalid");
  }
  return envelope as EncryptedSecret;
};

const decryptEnvelope = (value: string, keyVersion: string): string => decryptSecret(parseEnvelope(value, keyVersion), credentialKey());

const encryptEnvelope = (value: string, keyVersion: string): string => JSON.stringify(encryptSecret(value, credentialKey(), keyVersion));

const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

const recipientHash = (lineUserId: string): string => createHmac("sha256", lineUserHashSecret()).update(lineUserId, "utf8").digest("hex");

const uuidOrUndefined = (value: string | null): string | undefined => value ?? undefined;

const safeIso = (value: string, fallback: Date): Date => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const stringArray = (value: unknown): string[] => Array.isArray(value) && value.every((item) => typeof item === "string") ? [...value] : [];

const sourceLocator = (value: unknown): IndexChunk["sourceLocator"] => {
  const record = isRecord(value) ? value : {};
  const optionalNumber = (key: string): number | undefined => typeof record[key] === "number" && Number.isSafeInteger(record[key]) ? record[key] as number : undefined;
  const optionalString = (key: string): string | undefined => typeof record[key] === "string" ? record[key] as string : undefined;
  return {
    sectionPath: stringArray(record.sectionPath),
    ...(optionalNumber("page") === undefined ? {} : { page: optionalNumber("page") }),
    ...(optionalNumber("paragraphIndex") === undefined ? {} : { paragraphIndex: optionalNumber("paragraphIndex") }),
    ...(optionalNumber("tableIndex") === undefined ? {} : { tableIndex: optionalNumber("tableIndex") }),
    ...(optionalNumber("rowIndex") === undefined ? {} : { rowIndex: optionalNumber("rowIndex") }),
    ...(optionalNumber("columnIndex") === undefined ? {} : { columnIndex: optionalNumber("columnIndex") }),
    ...(optionalString("sheetName") === undefined ? {} : { sheetName: optionalString("sheetName") }),
    ...(optionalString("cellRange") === undefined ? {} : { cellRange: optionalString("cellRange") }),
    ...(optionalNumber("charStart") === undefined ? {} : { charStart: optionalNumber("charStart") }),
    ...(optionalNumber("charEnd") === undefined ? {} : { charEnd: optionalNumber("charEnd") }),
  };
};

const mapChunk = (row: KnowledgeChunkRow): IndexChunk => ({
  id: row.id,
  tenantId: row.tenant_id,
  documentVersionId: row.document_version_id,
  ...(row.parent_chunk_id ? { parentChunkId: row.parent_chunk_id } : {}),
  chunkType: row.chunk_type as IndexChunk["chunkType"],
  chunkIndex: row.chunk_index,
  displayText: row.display_text,
  searchText: row.search_text,
  entityKeys: stringArray(row.entity_keys),
  topicKeys: stringArray(row.topic_keys),
  factTypes: stringArray(row.fact_types) as IndexChunk["factTypes"],
  visibility: row.visibility,
  ownerDepartmentId: row.owner_department_id,
  authorityLevel: row.authority_level,
  ...(row.valid_from ? { validFrom: row.valid_from } : {}),
  ...(row.valid_until ? { validUntil: row.valid_until } : {}),
  sourceLocator: sourceLocator(row.source_locator_json),
  sourceHash: row.source_hash,
  tokenCount: row.token_count,
  language: row.language,
  ...(row.previous_chunk_id ? { previousChunkId: row.previous_chunk_id } : {}),
  ...(row.next_chunk_id ? { nextChunkId: row.next_chunk_id } : {}),
  createdAt: row.created_at,
});

const mapFact = (row: KnowledgeFactRow): IndexFact => ({
  id: row.id,
  tenantId: row.tenant_id,
  documentVersionId: row.document_version_id,
  entityType: row.entity_type,
  entityKey: row.entity_key,
  entityDisplayName: row.entity_display_name,
  factType: row.fact_type as IndexFact["factType"],
  factKey: row.fact_key,
  valueJson: isRecord(row.value_json) ? row.value_json : { value: row.value_json },
  normalizedValue: row.normalized_value,
  ...(row.unit ? { unit: row.unit } : {}),
  ...(row.valid_from ? { validFrom: row.valid_from } : {}),
  ...(row.valid_until ? { validUntil: row.valid_until } : {}),
  authorityLevel: row.authority_level,
  visibility: row.visibility,
  sourceChunkId: row.source_chunk_id,
  sourceLocator: sourceLocator(row.source_locator_json),
  sourceQuote: row.source_quote,
  extractionMethod: row.extraction_method,
  reviewStatus: row.review_status,
  ...(row.reviewed_at ? { reviewedAt: row.reviewed_at } : {}),
});

class RuntimeKnowledgeSource implements RetrievalSource {
  constructor(private readonly chunks: IndexChunk[], private readonly facts: IndexFact[]) {}

  listSearchableChunks(tenantId: string): IndexChunk[] {
    return this.chunks.filter((chunk) => chunk.tenantId === tenantId && chunk.visibility === "PUBLIC").map((chunk) => ({ ...chunk, sourceLocator: { ...chunk.sourceLocator, sectionPath: [...chunk.sourceLocator.sectionPath] } }));
  }

  listSearchableFacts(tenantId: string): IndexFact[] {
    const chunkIds = new Set(this.listSearchableChunks(tenantId).map((chunk) => chunk.id));
    return this.facts.filter((fact) => fact.tenantId === tenantId && fact.visibility === "PUBLIC" && fact.reviewStatus === "APPROVED" && chunkIds.has(fact.sourceChunkId)).map((fact) => ({ ...fact, valueJson: { ...fact.valueJson }, sourceLocator: { ...fact.sourceLocator, sectionPath: [...fact.sourceLocator.sectionPath] } }));
  }
}

const loadKnowledge = async (tenantId: string, at: Date): Promise<RuntimeKnowledgeSource> => {
  const pool = databasePool();
  const [chunkResult, factResult] = await Promise.all([
    pool.query<KnowledgeChunkRow>("select * from private.list_public_active_knowledge_chunks($1::uuid, $2::timestamptz)", [tenantId, at.toISOString()]),
    pool.query<KnowledgeFactRow>("select * from private.list_public_active_knowledge_facts($1::uuid, $2::timestamptz)", [tenantId, at.toISOString()]),
  ]);
  return new RuntimeKnowledgeSource(chunkResult.rows.map(mapChunk), factResult.rows.map(mapFact));
};

const createProvider = (accessToken: string): LineProviderClient => {
  if (!accessToken || CONTROL_PATTERN.test(accessToken)) throw new Error("LINE provider credential is invalid");
  const call = async (path: "reply" | "push", body: unknown): Promise<LineProviderResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(`https://api.line.me/v2/bot/message/${path}`, {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return { status: response.status };
    } finally {
      clearTimeout(timeout);
    }
  };
  return {
    reply: (input) => call("reply", { replyToken: input.replyToken, messages: input.messages }),
    push: (input) => call("push", { to: input.recipientId, messages: input.messages }),
  };
};

const unavailableProvider: LineProviderClient = {
  reply: async () => { throw new Error("LINE provider credential is unavailable"); },
  push: async () => { throw new Error("LINE provider credential is unavailable"); },
};

export class PostgresLineRuntimeStore implements DurableLineChatInboxStore, DurableLineDeliveryStore {
  private readonly providerTokens = new Map<string, string>();

  async claimNext(input: { workerId: string; now: Date; leaseMs: number }): Promise<DurableLineInboxClaim | undefined> {
    const result = await databasePool().query<WebhookClaimRow>(
      "select * from private.claim_line_webhook_job($1::text, $2::timestamptz, $3::integer)",
      [input.workerId, input.now.toISOString(), Math.round(input.leaseMs / 1000)],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const base = {
      claimId: row.job_id,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      leaseOwner: input.workerId,
      leaseExpiresAt: row.lease_expires_at,
    };
    try {
      const rawBody = new TextEncoder().encode(decryptEnvelope(row.payload_ciphertext, row.payload_key_version));
      const event = parseDurableLineChatEvent(rawBody, row.destination, row.webhook_event_id, input.now.getTime());
      if (!event) return { ...base, event: { inboxId: row.inbox_id, jobId: row.job_id, tenantId: row.tenant_id, channelRecordId: row.channel_record_id, eventType: row.event_type } };
      return {
        ...base,
        event: {
          tenantId: row.tenant_id,
          channel: "LINE",
          eventId: event.webhookEventId,
          lineUserId: event.lineUserId,
          text: event.text,
          ...(event.replyToken ? { replyToken: event.replyToken } : {}),
          ...(uuidOrUndefined(row.request_id) ? { requestId: row.request_id! } : {}),
          ...(uuidOrUndefined(row.correlation_id) ? { correlationId: row.correlation_id! } : {}),
          receivedAt: safeIso(row.event_timestamp, input.now),
          inboxId: row.inbox_id,
          jobId: row.job_id,
          channelRecordId: row.channel_record_id,
          eventType: "message",
        },
      };
    } catch {
      return { ...base, event: { inboxId: row.inbox_id, jobId: row.job_id, tenantId: row.tenant_id, channelRecordId: row.channel_record_id, eventType: "invalid", invalid: true } };
    }
  }

  async enqueueResponse(input: { claim: DurableLineInboxClaim; response: Parameters<NonNullable<DurableLineChatInboxStore["enqueueResponse"]>>[0]["response"] }): Promise<DurableLineResponseEnqueue> {
    if (!("text" in input.claim.event)) throw new Error("enqueue requires a message event");
    const event = input.claim.event as DurableLineInboxEvent;
    const text = sanitizeLineText(input.response.text);
    const keyVersion = currentCredentialKeyVersion();
    const replyToken = event.replyToken;
    const route = replyToken ? "REPLY" : "PUSH";
    const contentCiphertext = encryptEnvelope(text, keyVersion);
    const replyTokenCiphertext = replyToken ? encryptEnvelope(replyToken, keyVersion) : null;
    const result = await databasePool().query<{ delivery_id: string; delivery_status: "QUEUED" | "DUPLICATE" }>(
      "select * from private.enqueue_line_chat_response($1::uuid, $2::uuid, $3::text, $4::uuid, $5::uuid, $6::text, $7::text, $8::text, $9::text, $10::text, $11::text, $12::text, $13::text, $14::text, $15::uuid, $16::text)",
      [
        event.jobId,
        event.inboxId,
        input.claim.leaseOwner,
        event.tenantId,
        event.channelRecordId,
        event.lineUserId,
        recipientHash(event.lineUserId),
        route,
        replyTokenCiphertext,
        replyToken ? keyVersion : null,
        replyToken ? sha256(replyToken) : null,
        contentCiphertext,
        keyVersion,
        sha256(text),
        event.correlationId ?? input.response.correlationId,
        createDurableLineIdempotencyKey(event.eventId),
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("outbound response was not enqueued");
    return { deliveryId: row.delivery_id, idempotencyKey: createDurableLineIdempotencyKey(event.eventId), status: row.delivery_status === "DUPLICATE" ? "DUPLICATE" : "QUEUED" };
  }

  async markProcessed(input: { claim: DurableLineInboxClaim; now: Date; deliveryId?: string }): Promise<void> {
    const result = await databasePool().query<{ ok: boolean }>(
      "select private.complete_line_webhook_job($1::uuid, $2::uuid, $3::text, $4::uuid) as ok",
      [input.claim.event.jobId, input.claim.event.inboxId, input.claim.leaseOwner, input.deliveryId ?? null],
    );
    if (result.rows[0]?.ok !== true) throw new Error("LINE inbox completion was not accepted");
  }

  async markRetry(input: { claim: DurableLineInboxClaim; now: Date; errorCode: DurableLineChatErrorCode; retryable: boolean }): Promise<"RETRY_WAIT" | "DLQ"> {
    const result = await databasePool().query<{ status: string }>(
      "select private.fail_line_webhook_job($1::uuid, $2::uuid, $3::text, $4::text, $5::boolean) as status",
      [input.claim.event.jobId, input.claim.event.inboxId, input.claim.leaseOwner, input.errorCode, input.retryable],
    );
    return result.rows[0]?.status === "RETRY_WAIT" ? "RETRY_WAIT" : "DLQ";
  }

  async claimNextDelivery(input: { workerId: string; now: Date; leaseMs: number }): Promise<DurableLineDeliveryClaim | undefined> {
    const result = await databasePool().query<DeliveryClaimRow>(
      "select * from private.claim_line_message_job($1::text, $2::timestamptz, $3::integer)",
      [input.workerId, input.now.toISOString(), Math.round(input.leaseMs / 1000)],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    try {
      const text = sanitizeLineText(decryptEnvelope(row.content_ciphertext, row.content_key_version));
      const replyToken = row.route === "reply"
        ? row.reply_token_ciphertext && row.reply_token_key_version
          ? decryptEnvelope(row.reply_token_ciphertext, row.reply_token_key_version)
          : undefined
        : undefined;
      if (row.route === "reply" && !replyToken) throw new Error("reply token is unavailable");
      this.providerTokens.set(row.delivery_id, decryptEnvelope(row.encrypted_access_token, row.credential_key_version));
      return {
        deliveryId: row.delivery_id,
        jobId: row.job_id,
        tenantId: row.tenant_id,
        channelRecordId: row.channel_record_id,
        route: row.route,
        recipientId: row.recipient_id,
        ...(replyToken ? { replyToken } : {}),
        text,
        idempotencyKey: row.idempotency_key,
        attemptCount: row.attempt_count,
        maxAttempts: row.max_attempts,
        leaseOwner: input.workerId,
        leaseExpiresAt: row.lease_expires_at,
      };
    } catch {
      await this.failDeliveryClaim(row, input.workerId, "OUTBOUND_DEPENDENCY_FAILED", true);
      return undefined;
    }
  }

  providerForClaim(claim: DurableLineDeliveryClaim): LineProviderClient {
    const accessToken = this.providerTokens.get(claim.deliveryId);
    if (!accessToken) throw new Error("LINE provider credential is unavailable");
    return createProvider(accessToken);
  }

  async markDeliveryAccepted(input: { claim: DurableLineDeliveryClaim; now: Date; providerStatus: number; providerMessageId?: string }): Promise<void> {
    this.providerTokens.delete(input.claim.deliveryId);
    const result = await databasePool().query<{ ok: boolean }>(
      "select private.complete_line_message_job($1::uuid, $2::uuid, $3::text, $4::integer, $5::text) as ok",
      [input.claim.jobId ?? input.claim.deliveryId, input.claim.deliveryId, input.claim.leaseOwner, input.providerStatus, input.providerMessageId ?? null],
    );
    if (result.rows[0]?.ok !== true) throw new Error("LINE delivery completion was not accepted");
  }

  async markDeliveryRetry(input: { claim: DurableLineDeliveryClaim; now: Date; providerStatus?: number; errorCode: DurableLineDeliveryErrorCode; retryable: boolean }): Promise<"RETRY_WAIT" | "DLQ" | "FAILED"> {
    this.providerTokens.delete(input.claim.deliveryId);
    return this.failDeliveryClaim(
      { job_id: input.claim.jobId ?? input.claim.deliveryId, delivery_id: input.claim.deliveryId },
      input.claim.leaseOwner,
      input.errorCode,
      input.retryable,
      input.providerStatus,
    );
  }

  private async failDeliveryClaim(row: { job_id: string; delivery_id: string }, workerId: string, errorCode: DurableLineDeliveryErrorCode, retryable: boolean, providerStatus?: number): Promise<"RETRY_WAIT" | "DLQ" | "FAILED"> {
    const result = await databasePool().query<{ status: string }>(
      "select private.fail_line_message_job($1::uuid, $2::uuid, $3::text, $4::integer, $5::text, $6::boolean) as status",
      [row.job_id, row.delivery_id, workerId, providerStatus ?? null, errorCode, retryable],
    );
    const status = result.rows[0]?.status;
    return status === "RETRY_WAIT" ? "RETRY_WAIT" : status === "DEAD" ? "DLQ" : "FAILED";
  }
}

const conversationStore = new InMemoryChatConversationStore();

const runtimeSystemPolicy = "ตอบเฉพาะข้อมูลจากหลักฐาน PUBLIC ที่ยังใช้งานได้และอยู่ในช่วงเวลาที่มีผล ห้ามเดาสถานะ ราคา ค่าธรรมเนียม สิทธิ์ วันที่ หรือข้อมูลส่วนบุคคล หากหลักฐานไม่พอ ขัดกัน หรือคำถามเสี่ยง ให้ CLARIFY หรือ HANDOFF ตาม reasonCode มาตรฐานเท่านั้น";

const createChatService = async (event: DurableLineInboxEvent, knowledgeCache: Map<string, RuntimeKnowledgeSource>): Promise<ChatConversationService> => {
  const source = knowledgeCache.get(event.tenantId) ?? await loadKnowledge(event.tenantId, new Date());
  knowledgeCache.set(event.tenantId, source);
  return new ChatConversationService({
    store: conversationStore,
    lineUserHashSecret: lineUserHashSecret(),
    systemPolicy: runtimeSystemPolicy,
    processor: async (input) => {
      const retrieval = retrieve(source, input.tenantId, input.userText, {
        audience: "CITIZEN",
        at: new Date().toISOString(),
        priorTurns: input.context.map((turn) => ({ role: turn.role === "ASSISTANT" ? "assistant" : "user", content: turn.text })),
      });
      const decision = decideAnswerability(retrieval.plan, retrieval, { intentId: "intent-1" });
      return { overallOutcome: decision.result.outcome, intentResults: [decision.result] };
    },
  });
};

export const isLineChatRuntimeReady = (): boolean => Boolean(
  process.env.DATABASE_URL &&
  process.env.TENANT_CREDENTIAL_KEY &&
  process.env.TENANT_CREDENTIAL_KEY_VERSION &&
  (process.env.LINE_USER_HASH_SECRET || process.env.LINE_WEBHOOK_HASH_SECRET),
);

export type LineWorkerBatchResult = {
  status: "OK" | "PARTIAL" | "DEPENDENCY_NOT_READY" | "DISABLED";
  chatProcessed: number;
  deliveryAccepted: number;
  retryScheduled: number;
  deadLettered: number;
};

export const runLineWorkerBatch = async (options: { maxJobs?: number } = {}): Promise<LineWorkerBatchResult> => {
  if (process.env.LINE_CHAT_RUNTIME_ENABLED !== "true") return { status: "DISABLED", chatProcessed: 0, deliveryAccepted: 0, retryScheduled: 0, deadLettered: 0 };
  if (!isLineChatRuntimeReady()) return { status: "DEPENDENCY_NOT_READY", chatProcessed: 0, deliveryAccepted: 0, retryScheduled: 0, deadLettered: 0 };
  const maxJobs = Math.max(1, Math.min(MAX_BATCH, Math.trunc(options.maxJobs ?? 5)));
  const store = new PostgresLineRuntimeStore();
  const knowledgeCache = new Map<string, RuntimeKnowledgeSource>();
  const workerId = `line-runtime-${randomUUID()}`;
  let chatProcessed = 0;
  let deliveryAccepted = 0;
  let retryScheduled = 0;
  let deadLettered = 0;
  let partial = false;
  const chatWorker = new DurableLineChatWorker({
    store,
    workerId,
    createChatService: (event) => createChatService(event, knowledgeCache),
  });
  for (let index = 0; index < maxJobs; index += 1) {
    try {
      const result = await chatWorker.runOnce();
      if (result.status === "IDLE") break;
      if (result.status === "PROCESSED") chatProcessed += 1;
      if (result.status === "RETRY_WAIT") retryScheduled += 1;
      if (result.status === "DLQ") deadLettered += 1;
    } catch {
      partial = true;
      break;
    }
  }
  const deliveryWorker = new DurableLineDeliveryWorker({
    store,
    provider: unavailableProvider,
    providerForClaim: (claim) => store.providerForClaim(claim),
    workerId: `${workerId}:delivery`,
  });
  for (let index = 0; index < maxJobs; index += 1) {
    try {
      const result = await deliveryWorker.runOnce();
      if (result.status === "IDLE") break;
      if (result.status === "API_ACCEPTED") deliveryAccepted += 1;
      if (result.status === "RETRY_WAIT") retryScheduled += 1;
      if (result.status === "DLQ" || result.status === "FAILED") deadLettered += 1;
    } catch {
      partial = true;
      break;
    }
  }
  return { status: partial ? "PARTIAL" : "OK", chatProcessed, deliveryAccepted, retryScheduled, deadLettered };
};
