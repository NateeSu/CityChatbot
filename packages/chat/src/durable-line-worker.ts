import { createHash, randomUUID } from "node:crypto";

import type { LineProviderClient, LineProviderResult } from "@citychatbot/line";

import type {
  ChatConversationResponse,
  ChatInboundEvent,
  ChatConversationService,
} from "./conversation";

export type DurableLineInboxEvent = ChatInboundEvent & {
  inboxId: string;
  jobId: string;
  channelRecordId: string;
  eventType: "message";
};

export type DurableLineUnsupportedEvent = {
  inboxId: string;
  jobId: string;
  tenantId: string;
  channelRecordId: string;
  eventType: string;
  invalid?: boolean;
};

export type DurableLineInboxClaim = {
  claimId: string;
  attemptCount: number;
  maxAttempts: number;
  leaseOwner: string;
  leaseExpiresAt: string;
  event: DurableLineInboxEvent | DurableLineUnsupportedEvent;
};

export type DurableLineResponseEnqueue = {
  deliveryId: string;
  idempotencyKey: string;
  status: "QUEUED" | "DUPLICATE";
};

export type DurableLineChatInboxStore = {
  claimNext(input: {
    workerId: string;
    now: Date;
    leaseMs: number;
  }): Promise<DurableLineInboxClaim | undefined>;
  enqueueResponse(input: {
    claim: DurableLineInboxClaim;
    response: ChatConversationResponse;
  }): Promise<DurableLineResponseEnqueue>;
  markProcessed(input: {
    claim: DurableLineInboxClaim;
    now: Date;
    deliveryId?: string;
  }): Promise<void>;
  markRetry(input: {
    claim: DurableLineInboxClaim;
    now: Date;
    errorCode: DurableLineChatErrorCode;
    retryable: boolean;
  }): Promise<"RETRY_WAIT" | "DLQ">;
};

export type DurableLineDeliveryClaim = {
  deliveryId: string;
  jobId?: string;
  tenantId: string;
  channelRecordId: string;
  route: "reply" | "push";
  recipientId: string;
  replyToken?: string;
  text: string;
  idempotencyKey: string;
  attemptCount: number;
  maxAttempts: number;
  leaseOwner: string;
  leaseExpiresAt: string;
};

export type DurableLineDeliveryStore = {
  claimNextDelivery(input: {
    workerId: string;
    now: Date;
    leaseMs: number;
  }): Promise<DurableLineDeliveryClaim | undefined>;
  markDeliveryAccepted(input: {
    claim: DurableLineDeliveryClaim;
    now: Date;
    providerStatus: number;
    providerMessageId?: string;
  }): Promise<void>;
  markDeliveryRetry(input: {
    claim: DurableLineDeliveryClaim;
    now: Date;
    providerStatus?: number;
    errorCode: DurableLineDeliveryErrorCode;
    retryable: boolean;
  }): Promise<"RETRY_WAIT" | "DLQ" | "FAILED">;
};

export type DurableLineChatErrorCode =
  | "CHAT_PROCESSING_FAILED"
  | "CHAT_TIMEOUT"
  | "CHAT_INVALID_OUTPUT"
  | "OUTBOUND_ENQUEUE_FAILED";

export type DurableLineDeliveryErrorCode =
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_429"
  | "PROVIDER_5XX"
  | "PROVIDER_MALFORMED_RESPONSE"
  | "PROVIDER_4XX"
  | "OUTBOUND_DEPENDENCY_FAILED";

export type DurableLineChatWorkerResult =
  | { status: "IDLE" }
  | { status: "PROCESSED"; inboxId: string; deliveryId?: string; duplicate: boolean }
  | { status: "RETRY_WAIT" | "DLQ"; inboxId: string; errorCode: DurableLineChatErrorCode };

export type DurableLineDeliveryWorkerResult =
  | { status: "IDLE" }
  | { status: "API_ACCEPTED"; deliveryId: string; providerStatus: number }
  | { status: "RETRY_WAIT" | "DLQ" | "FAILED"; deliveryId: string; errorCode: DurableLineDeliveryErrorCode };

const DEFAULT_LEASE_MS = 30_000;
const MAX_LEASE_MS = 300_000;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/;

const assertWorker = (workerId: string): void => {
  if (!workerId || workerId.length > 128 || CONTROL_PATTERN.test(workerId)) throw new Error("workerId is invalid");
};

const assertLease = (leaseMs: number): void => {
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1_000 || leaseMs > MAX_LEASE_MS) throw new Error("leaseMs is invalid");
};

const isMessageEvent = (event: DurableLineInboxClaim["event"]): event is DurableLineInboxEvent => event.eventType === "message" && "text" in event;

const isRetryableStatus = (status: number): boolean => status === 408 || status === 429 || status >= 500;

const providerErrorCode = (status: number): DurableLineDeliveryErrorCode => {
  if (status === 429) return "PROVIDER_429";
  if (status >= 500) return "PROVIDER_5XX";
  return "PROVIDER_4XX";
};

const validateProviderResult = (result: LineProviderResult): number => {
  if (!result || !Number.isInteger(result.status) || result.status < 100 || result.status > 599) {
    throw new Error("provider response status is invalid");
  }
  return result.status;
};

export class DurableLineChatWorker {
  constructor(
    private readonly options: {
      store: DurableLineChatInboxStore;
      workerId: string;
      createChatService: (event: DurableLineInboxEvent) => ChatConversationService | Promise<ChatConversationService>;
      clock?: () => Date;
      leaseMs?: number;
    },
  ) {
    assertWorker(options.workerId);
    assertLease(options.leaseMs ?? DEFAULT_LEASE_MS);
  }

  async runOnce(): Promise<DurableLineChatWorkerResult> {
    const now = this.options.clock?.() ?? new Date();
    const claim = await this.options.store.claimNext({
      workerId: this.options.workerId,
      now,
      leaseMs: this.options.leaseMs ?? DEFAULT_LEASE_MS,
    });
    if (!claim) return { status: "IDLE" };
    if (!isMessageEvent(claim.event)) {
      if (claim.event.invalid) {
        const status = await this.options.store.markRetry({ claim, now, errorCode: "CHAT_INVALID_OUTPUT", retryable: false });
        return { status, inboxId: claim.event.inboxId, errorCode: "CHAT_INVALID_OUTPUT" };
      }
      await this.options.store.markProcessed({ claim, now });
      return { status: "PROCESSED", inboxId: claim.event.inboxId, duplicate: false };
    }

    try {
      const service = await this.options.createChatService(claim.event);
      const response = await service.process(claim.event);
      const queued = await this.options.store.enqueueResponse({ claim, response });
      await this.options.store.markProcessed({ claim, now, deliveryId: queued.deliveryId });
      return {
        status: "PROCESSED",
        inboxId: claim.event.inboxId,
        deliveryId: queued.deliveryId,
        duplicate: queued.status === "DUPLICATE" || response.duplicate,
      };
    } catch (error) {
      const errorCode: DurableLineChatErrorCode = error instanceof Error && /timeout/i.test(error.message)
        ? "CHAT_TIMEOUT"
        : error instanceof Error && /enqueue/i.test(error.message)
          ? "OUTBOUND_ENQUEUE_FAILED"
          : "CHAT_PROCESSING_FAILED";
      const status = await this.options.store.markRetry({ claim, now, errorCode, retryable: true });
      return { status, inboxId: claim.event.inboxId, errorCode };
    }
  }
}

export class DurableLineDeliveryWorker {
  constructor(
    private readonly options: {
      store: DurableLineDeliveryStore;
      provider: LineProviderClient;
      providerForClaim?: (claim: DurableLineDeliveryClaim) => LineProviderClient;
      workerId: string;
      clock?: () => Date;
      leaseMs?: number;
    },
  ) {
    assertWorker(options.workerId);
    assertLease(options.leaseMs ?? DEFAULT_LEASE_MS);
  }

  async runOnce(): Promise<DurableLineDeliveryWorkerResult> {
    const now = this.options.clock?.() ?? new Date();
    const claim = await this.options.store.claimNextDelivery({
      workerId: this.options.workerId,
      now,
      leaseMs: this.options.leaseMs ?? DEFAULT_LEASE_MS,
    });
    if (!claim) return { status: "IDLE" };

    try {
      const provider = this.options.providerForClaim?.(claim) ?? this.options.provider;
      const result = claim.route === "reply"
        ? await provider.reply({ replyToken: claim.replyToken!, messages: [{ type: "text", text: claim.text }] })
        : await provider.push({ recipientId: claim.recipientId, messages: [{ type: "text", text: claim.text }] });
      const status = validateProviderResult(result);
      if (status >= 200 && status < 300) {
        await this.options.store.markDeliveryAccepted({
          claim,
          now,
          providerStatus: status,
          ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
        });
        return { status: "API_ACCEPTED", deliveryId: claim.deliveryId, providerStatus: status };
      }
      const errorCode = providerErrorCode(status);
      const deliveryStatus = await this.options.store.markDeliveryRetry({
        claim,
        now,
        providerStatus: status,
        errorCode,
        retryable: isRetryableStatus(status),
      });
      return { status: deliveryStatus, deliveryId: claim.deliveryId, errorCode };
    } catch (error) {
      const errorCode: DurableLineDeliveryErrorCode = error instanceof Error && (error.name === "AbortError" || /timeout/i.test(error.message))
        ? "PROVIDER_TIMEOUT"
        : error instanceof Error && /invalid|malformed|status/i.test(error.message)
          ? "PROVIDER_MALFORMED_RESPONSE"
          : "OUTBOUND_DEPENDENCY_FAILED";
      const status = await this.options.store.markDeliveryRetry({ claim, now, errorCode, retryable: errorCode !== "PROVIDER_MALFORMED_RESPONSE" });
      return { status, deliveryId: claim.deliveryId, errorCode };
    }
  }
}

type MemoryInboxRecord = {
  claim: DurableLineInboxClaim;
  status: "QUEUED" | "PROCESSING" | "PROCESSED" | "RETRY_WAIT" | "DLQ";
  nextAttemptAt: number;
  deliveryId?: string;
};

type MemoryDeliveryRecord = DurableLineDeliveryClaim & {
  status: "QUEUED" | "SENDING" | "API_ACCEPTED" | "RETRY_WAIT" | "FAILED" | "DLQ";
  nextAttemptAt: number;
};

/** Deterministic local adapter used by unit tests and the worker contract harness. */
export class InMemoryDurableLineStore implements DurableLineChatInboxStore, DurableLineDeliveryStore {
  private readonly inboxes = new Map<string, MemoryInboxRecord>();
  private readonly deliveries = new Map<string, MemoryDeliveryRecord>();
  private readonly deliveryByIdempotency = new Map<string, string>();
  private readonly retryDelayMs: number;

  constructor(options: { retryDelayMs?: number } = {}) {
    this.retryDelayMs = options.retryDelayMs ?? 1_000;
  }

  addInbox(event: DurableLineInboxEvent | DurableLineUnsupportedEvent, options: { maxAttempts?: number } = {}): void {
    if (this.inboxes.has(event.inboxId)) throw new Error("inbox already exists");
    const now = new Date();
    const claim: DurableLineInboxClaim = {
      claimId: event.jobId,
      attemptCount: 0,
      maxAttempts: options.maxAttempts ?? 3,
      leaseOwner: "",
      leaseExpiresAt: now.toISOString(),
      event,
    };
    this.inboxes.set(event.inboxId, { claim, status: "QUEUED", nextAttemptAt: 0 });
  }

  addDelivery(input: Omit<DurableLineDeliveryClaim, "leaseOwner" | "leaseExpiresAt" | "attemptCount"> & { maxAttempts?: number }): string {
    const existing = this.deliveryByIdempotency.get(input.idempotencyKey);
    if (existing) return existing;
    const deliveryId = input.deliveryId || randomUUID();
    const record: MemoryDeliveryRecord = {
      ...input,
      deliveryId,
      attemptCount: 0,
      maxAttempts: input.maxAttempts ?? 3,
      leaseOwner: "",
      leaseExpiresAt: new Date(0).toISOString(),
      status: "QUEUED",
      nextAttemptAt: 0,
    };
    this.deliveries.set(deliveryId, record);
    this.deliveryByIdempotency.set(input.idempotencyKey, deliveryId);
    return deliveryId;
  }

  async claimNext(input: { workerId: string; now: Date; leaseMs: number }): Promise<DurableLineInboxClaim | undefined> {
    const record = [...this.inboxes.values()]
      .filter((candidate) => (candidate.status === "QUEUED" || candidate.status === "RETRY_WAIT" || (candidate.status === "PROCESSING" && Date.parse(candidate.claim.leaseExpiresAt) <= input.now.getTime())) && candidate.nextAttemptAt <= input.now.getTime())
      .sort((left, right) => left.claim.event.inboxId.localeCompare(right.claim.event.inboxId))[0];
    if (!record) return undefined;
    record.status = "PROCESSING";
    record.claim.attemptCount += 1;
    record.claim.leaseOwner = input.workerId;
    record.claim.leaseExpiresAt = new Date(input.now.getTime() + input.leaseMs).toISOString();
    return structuredClone(record.claim);
  }

  async enqueueResponse(input: { claim: DurableLineInboxClaim; response: ChatConversationResponse }): Promise<DurableLineResponseEnqueue> {
    const event = input.claim.event;
    if (!isMessageEvent(event)) throw new Error("enqueue requires a message event");
    const idempotencyKey = createDurableLineIdempotencyKey(event.eventId);
    const existing = this.deliveryByIdempotency.get(idempotencyKey);
    if (existing) return { deliveryId: existing, idempotencyKey, status: "DUPLICATE" };
    const deliveryId = this.addDelivery({
      deliveryId: randomUUID(),
      tenantId: event.tenantId,
      channelRecordId: event.channelRecordId,
      route: event.replyToken ? "reply" : "push",
      recipientId: event.lineUserId,
      ...(event.replyToken ? { replyToken: event.replyToken } : {}),
      text: input.response.text,
      idempotencyKey,
      maxAttempts: 3,
    });
    return { deliveryId, idempotencyKey, status: "QUEUED" };
  }

  async markProcessed(input: { claim: DurableLineInboxClaim; now: Date; deliveryId?: string }): Promise<void> {
    const record = this.inboxes.get(input.claim.event.inboxId);
    if (!record || record.claim.leaseOwner !== input.claim.leaseOwner || record.status !== "PROCESSING") throw new Error("inbox lease is not owned");
    record.status = "PROCESSED";
    record.deliveryId = input.deliveryId;
    record.claim.leaseExpiresAt = input.now.toISOString();
  }

  async markRetry(input: { claim: DurableLineInboxClaim; now: Date; errorCode: DurableLineChatErrorCode; retryable: boolean }): Promise<"RETRY_WAIT" | "DLQ"> {
    const record = this.inboxes.get(input.claim.event.inboxId);
    if (!record || record.claim.leaseOwner !== input.claim.leaseOwner || record.status !== "PROCESSING") throw new Error("inbox lease is not owned");
    const retry = input.retryable && record.claim.attemptCount < record.claim.maxAttempts;
    record.status = retry ? "RETRY_WAIT" : "DLQ";
    record.nextAttemptAt = input.now.getTime() + (retry ? this.retryDelayMs : 0);
    record.claim.leaseExpiresAt = input.now.toISOString();
    return record.status;
  }

  async claimNextDelivery(input: { workerId: string; now: Date; leaseMs: number }): Promise<DurableLineDeliveryClaim | undefined> {
    const record = [...this.deliveries.values()]
      .filter((candidate) => (candidate.status === "QUEUED" || candidate.status === "RETRY_WAIT" || (candidate.status === "SENDING" && Date.parse(candidate.leaseExpiresAt) <= input.now.getTime())) && candidate.nextAttemptAt <= input.now.getTime())
      .sort((left, right) => left.deliveryId.localeCompare(right.deliveryId))[0];
    if (!record) return undefined;
    record.status = "SENDING";
    record.attemptCount += 1;
    record.leaseOwner = input.workerId;
    record.leaseExpiresAt = new Date(input.now.getTime() + input.leaseMs).toISOString();
    return structuredClone(record);
  }

  async markDeliveryAccepted(input: { claim: DurableLineDeliveryClaim; now: Date; providerStatus: number; providerMessageId?: string }): Promise<void> {
    const record = this.requireDeliveryLease(input.claim);
    record.status = "API_ACCEPTED";
    record.leaseExpiresAt = input.now.toISOString();
    void input.providerStatus;
    void input.providerMessageId;
  }

  async markDeliveryRetry(input: { claim: DurableLineDeliveryClaim; now: Date; providerStatus?: number; errorCode: DurableLineDeliveryErrorCode; retryable: boolean }): Promise<"RETRY_WAIT" | "DLQ" | "FAILED"> {
    const record = this.requireDeliveryLease(input.claim);
    const retry = input.retryable && record.attemptCount < record.maxAttempts;
    record.status = retry ? "RETRY_WAIT" : input.retryable ? "DLQ" : "FAILED";
    record.nextAttemptAt = input.now.getTime() + (retry ? this.retryDelayMs : 0);
    record.leaseExpiresAt = input.now.toISOString();
    void input.providerStatus;
    void input.errorCode;
    return record.status;
  }

  getInboxStatus(inboxId: string): string | undefined {
    return this.inboxes.get(inboxId)?.status;
  }

  getDeliveryStatus(deliveryId: string): string | undefined {
    return this.deliveries.get(deliveryId)?.status;
  }

  getDelivery(deliveryId: string): Omit<DurableLineDeliveryClaim, "replyToken" | "text" | "recipientId" | "idempotencyKey"> | undefined {
    const record = this.deliveries.get(deliveryId);
    if (!record) return undefined;
    const { replyToken: _replyToken, text: _text, recipientId: _recipientId, idempotencyKey: _idempotencyKey, ...view } = record;
    return structuredClone(view);
  }

  private requireDeliveryLease(claim: DurableLineDeliveryClaim): MemoryDeliveryRecord {
    const record = this.deliveries.get(claim.deliveryId);
    if (!record || record.leaseOwner !== claim.leaseOwner || record.status !== "SENDING") throw new Error("delivery lease is not owned");
    return record;
  }
}

export const createDurableLineIdempotencyKey = (eventId: string): string => `chat:${createHash("sha256").update(eventId).digest("hex").slice(0, 32)}:final`;
