import { createHmac, timingSafeEqual } from "node:crypto";

import type { ServerCredential } from "./channel";
import { StructuredLogger, createCorrelationContext, type RuntimeEnvironment, type StructuredLogInput } from "@citychatbot/telemetry";

export type LineWebhookReasonCode = "FORBIDDEN" | "VALIDATION_ERROR" | "CONFLICT" | "DEPENDENCY_NOT_READY";

export class LineWebhookError extends Error {
  constructor(public readonly reasonCode: LineWebhookReasonCode, message: string) {
    super(`${reasonCode}: ${message}`);
    this.name = "LineWebhookError";
  }
}

export type LineWebhookResolution = {
  tenantId: string;
  channelRecordId: string;
  lineChannelId: string;
  destination: string;
  activeCredentialVersion: number;
  state: "ACTIVE" | "DEGRADED";
};

export type LineWebhookChannelResolver = {
  resolveByWebhookKey(webhookKey: string): LineWebhookResolution | undefined;
  getServerCredentials(channelRecordId: string, principal: "SERVER", version?: number): ServerCredential;
};

export type NormalizedLineEvent = {
  webhookEventId: string;
  eventType: string;
  timestamp: number;
  redelivery: boolean;
  supported: boolean;
};

export type LineInboxRecord = NormalizedLineEvent & {
  tenantId: string;
  channelRecordId: string;
  receivedAt: string;
};

export type QueuedLineEvent = {
  tenantId: string;
  channelRecordId: string;
  webhookEventId: string;
  eventType: string;
  correlationId: string;
  receivedAt: string;
};

export type LineWebhookInbox = {
  insert(record: LineInboxRecord): { duplicate: boolean };
  list(tenantId?: string): LineInboxRecord[];
};

export type LineWebhookQueue = {
  enqueue(event: QueuedLineEvent): void;
  list(tenantId?: string): QueuedLineEvent[];
};

export class InMemoryLineWebhookInbox implements LineWebhookInbox {
  private readonly records = new Map<string, LineInboxRecord>();

  insert(record: LineInboxRecord): { duplicate: boolean } {
    const key = `${record.channelRecordId}:${record.webhookEventId}`;
    if (this.records.has(key)) return { duplicate: true };
    this.records.set(key, { ...record });
    return { duplicate: false };
  }

  list(tenantId?: string): LineInboxRecord[] {
    return [...this.records.values()]
      .filter((record) => tenantId === undefined || record.tenantId === tenantId)
      .map((record) => ({ ...record }));
  }
}

export class InMemoryLineWebhookQueue implements LineWebhookQueue {
  private readonly events = new Map<string, QueuedLineEvent>();

  enqueue(event: QueuedLineEvent): void {
    const key = `${event.channelRecordId}:${event.webhookEventId}`;
    if (!this.events.has(key)) this.events.set(key, { ...event });
  }

  list(tenantId?: string): QueuedLineEvent[] {
    return [...this.events.values()]
      .filter((event) => tenantId === undefined || event.tenantId === tenantId)
      .map((event) => ({ ...event }));
  }
}

const SUPPORTED_EVENT_TYPES = new Set(["follow", "unfollow", "postback"]);
const SUPPORTED_MESSAGE_TYPES = new Set(["text", "image", "location"]);
const BASE64_SIGNATURE_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

const rawBytes = (body: Uint8Array | string): Uint8Array => typeof body === "string" ? new TextEncoder().encode(body) : body;

export const verifyLineSignature = (body: Uint8Array | string, signature: string, channelSecret: string): boolean => {
  if (!signature || signature.length % 4 !== 0 || !BASE64_SIGNATURE_PATTERN.test(signature)) return false;
  const expected = createHmac("sha256", channelSecret).update(rawBytes(body)).digest();
  const received = Buffer.from(signature, "base64");
  return received.length === expected.length && timingSafeEqual(received, expected);
};

const invalid = (message: string): never => {
  throw new LineWebhookError("VALIDATION_ERROR", message);
};

const parseRawJson = (body: Uint8Array): Record<string, unknown> => {
  try {
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(body);
    const parsed: unknown = JSON.parse(decoded);
    if (!isRecord(parsed)) return invalid("webhook body must be an object");
    return parsed;
  } catch (error) {
    if (error instanceof LineWebhookError) throw error;
    return invalid("webhook body is not valid JSON");
  }
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const parseLineWebhookEvents = (
  body: Uint8Array,
  expectedDestination: string,
  now = Date.now(),
  maxEventAgeMs = 5 * 60 * 1000,
  futureSkewMs = 30 * 1000,
): NormalizedLineEvent[] => {
  const parsed = parseRawJson(body);
  if (parsed.destination !== expectedDestination) throw new LineWebhookError("FORBIDDEN", "webhook destination mismatch");
  if (!Array.isArray(parsed.events) || parsed.events.length === 0 || parsed.events.length > 100) return invalid("webhook events must be a bounded non-empty array");
  const events = parsed.events;
  return events.map((value: unknown) => {
    if (!isRecord(value)) return invalid("webhook event must be an object");
    const webhookEventId = value.webhookEventId;
    const eventType = value.type;
    const timestamp = value.timestamp;
    if (typeof webhookEventId !== "string" || webhookEventId.length < 1 || webhookEventId.length > 128) return invalid("webhook event id is invalid");
    if (typeof eventType !== "string" || eventType.length < 1 || eventType.length > 64) return invalid("webhook event type is invalid");
    if (typeof timestamp !== "number" || !Number.isSafeInteger(timestamp)) return invalid("webhook event timestamp is invalid");
    if (!isRecord(value.source)) return invalid("webhook event source is invalid");
    if (timestamp < now - maxEventAgeMs || timestamp > now + futureSkewMs) {
      throw new LineWebhookError("CONFLICT", "webhook event is outside the replay window");
    }
    let supported = SUPPORTED_EVENT_TYPES.has(eventType);
    if (eventType === "message") {
      const message = value.message;
      if (!isRecord(message) || typeof message.type !== "string") return invalid("message event payload is invalid");
      supported = SUPPORTED_MESSAGE_TYPES.has(message.type);
    }
    const deliveryContext = isRecord(value.deliveryContext) ? value.deliveryContext : undefined;
    return {
      webhookEventId,
      eventType,
      timestamp,
      redelivery: deliveryContext?.isRedelivery === true,
      supported,
    };
  });
};

export type LineWebhookRequest = {
  webhookKey: string;
  signature: string;
  rawBody: Uint8Array | string;
  requestId?: string;
};

export type LineWebhookAccepted = {
  accepted: true;
  status: 200;
  requestId: string;
  correlationId: string;
  tenantId: string;
  channelRecordId: string;
  acceptedEventIds: string[];
  duplicateEventIds: string[];
  unsupportedEventIds: string[];
};

export type LineWebhookRejected = {
  accepted: false;
  status: 400 | 403 | 409 | 503;
  reasonCode: LineWebhookReasonCode;
  requestId: string;
};

export type LineWebhookResult = LineWebhookAccepted | LineWebhookRejected;

export type LineWebhookHandlerOptions = {
  resolver: LineWebhookChannelResolver;
  inbox?: LineWebhookInbox;
  queue?: LineWebhookQueue;
  logger?: StructuredLogger;
  tenantHashSecret?: string;
  environment?: RuntimeEnvironment;
  clock?: () => Date;
  maxBodyBytes?: number;
  maxEventAgeMs?: number;
  futureSkewMs?: number;
};

export class LineWebhookHandler {
  private readonly inbox: LineWebhookInbox;
  private readonly queue: LineWebhookQueue;
  private readonly options: Required<Pick<LineWebhookHandlerOptions, "clock" | "maxBodyBytes" | "maxEventAgeMs" | "futureSkewMs">> & LineWebhookHandlerOptions;

  constructor(options: LineWebhookHandlerOptions) {
    this.options = {
      ...options,
      clock: options.clock ?? (() => new Date()),
      maxBodyBytes: options.maxBodyBytes ?? 1_000_000,
      maxEventAgeMs: options.maxEventAgeMs ?? 5 * 60 * 1000,
      futureSkewMs: options.futureSkewMs ?? 30 * 1000,
    };
    this.inbox = options.inbox ?? new InMemoryLineWebhookInbox();
    this.queue = options.queue ?? new InMemoryLineWebhookQueue();
    if (options.logger && !options.tenantHashSecret) throw new LineWebhookError("DEPENDENCY_NOT_READY", "Structured logger requires tenant hash secret");
  }

  handle(request: LineWebhookRequest): LineWebhookResult {
    const context = createCorrelationContext({ requestId: request.requestId });
    const body = rawBytes(request.rawBody);
    if (body.byteLength > this.options.maxBodyBytes) return { accepted: false, status: 400, reasonCode: "VALIDATION_ERROR", requestId: context.requestId };
    const resolution = this.options.resolver.resolveByWebhookKey(request.webhookKey);
    if (!resolution || resolution.state !== "ACTIVE") return { accepted: false, status: 403, reasonCode: "FORBIDDEN", requestId: context.requestId };
    let credentials: ServerCredential;
    try {
      credentials = this.options.resolver.getServerCredentials(resolution.channelRecordId, "SERVER", resolution.activeCredentialVersion);
    } catch {
      return { accepted: false, status: 503, reasonCode: "DEPENDENCY_NOT_READY", requestId: context.requestId };
    }
    if (!verifyLineSignature(body, request.signature, credentials.channelSecret)) {
      return { accepted: false, status: 403, reasonCode: "FORBIDDEN", requestId: context.requestId };
    }
    let events: NormalizedLineEvent[];
    try {
      events = parseLineWebhookEvents(body, resolution.destination, this.options.clock().getTime(), this.options.maxEventAgeMs, this.options.futureSkewMs);
    } catch (error) {
      if (error instanceof LineWebhookError) {
        return { accepted: false, status: error.reasonCode === "FORBIDDEN" ? 403 : error.reasonCode === "CONFLICT" ? 409 : 400, reasonCode: error.reasonCode, requestId: context.requestId };
      }
      return { accepted: false, status: 400, reasonCode: "VALIDATION_ERROR", requestId: context.requestId };
    }
    const receivedAt = this.options.clock().toISOString();
    const acceptedEventIds: string[] = [];
    const duplicateEventIds: string[] = [];
    const unsupportedEventIds: string[] = [];
    for (const event of events) {
      const inserted = this.inbox.insert({ ...event, tenantId: resolution.tenantId, channelRecordId: resolution.channelRecordId, receivedAt });
      if (inserted.duplicate) {
        duplicateEventIds.push(event.webhookEventId);
        continue;
      }
      acceptedEventIds.push(event.webhookEventId);
      if (!event.supported) unsupportedEventIds.push(event.webhookEventId);
      this.queue.enqueue({
        tenantId: resolution.tenantId,
        channelRecordId: resolution.channelRecordId,
        webhookEventId: event.webhookEventId,
        eventType: event.supported ? event.eventType : "unsupported",
        correlationId: context.correlationId,
        receivedAt,
      });
    }
    if (this.options.logger && this.options.tenantHashSecret) {
      const log: StructuredLogInput = {
        severity: "info",
        service: "line-webhook",
        module: "ingress",
        environment: this.options.environment ?? "local",
        requestId: context.requestId,
        correlationId: context.correlationId,
        tenantId: resolution.tenantId,
        tenantHashSecret: this.options.tenantHashSecret,
        actorType: "SYSTEM",
        routeOrJob: "POST /api/v1/line/webhooks/{webhookKey}",
        status: 200,
      };
      this.options.logger.write(log);
    }
    return {
      accepted: true,
      status: 200,
      requestId: context.requestId,
      correlationId: context.correlationId,
      tenantId: resolution.tenantId,
      channelRecordId: resolution.channelRecordId,
      acceptedEventIds,
      duplicateEventIds,
      unsupportedEventIds,
    };
  }

  getInbox(): LineWebhookInbox {
    return this.inbox;
  }

  getQueue(): LineWebhookQueue {
    return this.queue;
  }
}
