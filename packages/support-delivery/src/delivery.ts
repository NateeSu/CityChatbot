import { createHash } from "node:crypto";

import {
  LineMessagingDispatcher,
  type LineDeliveryView,
  type LineProviderClient,
} from "@citychatbot/line";
import type {
  SupportHandoffStore,
  SupportTicket,
  SupportTicketMessage,
} from "@citychatbot/support-handoff";

export class SupportLineDeliveryError extends Error {
  constructor(
    public readonly code: "VALIDATION_ERROR" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "IDEMPOTENCY_CONFLICT",
    message: string,
  ) {
    super(`${code}: ${message}`);
    this.name = "SupportLineDeliveryError";
  }
}

export type SupportLineDeliveryView = {
  deliveryId: string;
  tenantId: string;
  ticketId: string;
  messageId: string;
  publicTicketId: string;
  status: LineDeliveryView["status"];
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  providerStatus?: number;
  providerMessageId?: string;
  correlationId: string;
  deepLink: string;
  outOfHours: boolean;
  createdAt: string;
  completedAt?: string;
};

export type SupportLineDeliveryInput = {
  tenantId: string;
  ticketId: string;
  messageId: string;
  idempotencyKey: string;
  correlationId?: string;
  deepLink?: string;
  outOfHours?: boolean;
  maxAttempts?: number;
};

type DeliveryRecord = {
  fingerprint: string;
  idempotencyKey: string;
  ticket: SupportTicket;
  message: SupportTicketMessage;
  deepLink: string;
  outOfHours: boolean;
  delivery: LineDeliveryView;
};

export type SupportLineDeliveryStore = {
  get(tenantId: string, deliveryId: string): DeliveryRecord | undefined;
  getByIdempotency(tenantId: string, idempotencyKey: string): DeliveryRecord | undefined;
  getByMessage(tenantId: string, messageId: string): DeliveryRecord | undefined;
  put(tenantId: string, idempotencyKey: string, record: DeliveryRecord): void;
  list(tenantId: string): readonly DeliveryRecord[];
};

export class InMemorySupportLineDeliveryStore implements SupportLineDeliveryStore {
  private readonly records = new Map<string, DeliveryRecord>();
  private readonly idempotency = new Map<string, string>();

  get(tenantId: string, deliveryId: string): DeliveryRecord | undefined {
    const record = this.records.get(deliveryId);
    return record && record.ticket.tenantId === tenantId ? cloneRecord(record) : undefined;
  }

  getByIdempotency(tenantId: string, idempotencyKey: string): DeliveryRecord | undefined {
    const deliveryId = this.idempotency.get(scopedKey(tenantId, idempotencyKey));
    return deliveryId ? this.get(tenantId, deliveryId) : undefined;
  }

  getByMessage(tenantId: string, messageId: string): DeliveryRecord | undefined {
    const record = [...this.records.values()].find((item) => item.ticket.tenantId === tenantId && item.message.id === messageId);
    return record ? cloneRecord(record) : undefined;
  }

  put(tenantId: string, idempotencyKey: string, record: DeliveryRecord): void {
    const key = scopedKey(tenantId, idempotencyKey);
    const existing = this.idempotency.get(key);
    if (existing && existing !== record.delivery.id) throw new SupportLineDeliveryError("CONFLICT", "delivery idempotency key is already linked");
    this.records.set(record.delivery.id, cloneRecord(record));
    this.idempotency.set(key, record.delivery.id);
  }

  list(tenantId: string): readonly DeliveryRecord[] {
    return [...this.records.values()].filter((record) => record.ticket.tenantId === tenantId).map(cloneRecord);
  }
}

export type SupportLineDeliveryOptions = {
  supportStore: SupportHandoffStore;
  dispatcher: LineMessagingDispatcher;
  recipientForTicket: (input: { tenantId: string; ticketId: string; citizenIdentityHash: string }) => string | undefined;
  deepLinkForTicket?: (ticket: SupportTicket) => string;
  allowedDeepLinkHosts?: readonly string[];
  clock?: () => Date;
  store?: SupportLineDeliveryStore;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{8,255}$/;

const assertUuid = (value: string, field: string): void => {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) throw new SupportLineDeliveryError("VALIDATION_ERROR", `${field} must be a UUID`);
};

const assertIdentifier = (value: string, field: string): void => {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value) || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new SupportLineDeliveryError("VALIDATION_ERROR", `${field} is invalid`);
  }
};

const scopedKey = (tenantId: string, value: string): string => `${tenantId}:${value}`;
const cloneRecord = (record: DeliveryRecord): DeliveryRecord => ({
  ...record,
  ticket: { ...record.ticket, source: { ...record.ticket.source }, sla: { ...record.ticket.sla } },
  message: { ...record.message },
  delivery: { ...record.delivery },
});

const defaultDeepLink = (ticket: SupportTicket): string => `https://citychatbot.local/liff/support/${encodeURIComponent(ticket.publicTicketId)}`;

const validateDeepLink = (value: string, allowedHosts: ReadonlySet<string>): string => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !allowedHosts.has(url.host)) throw new Error("unsafe");
    return url.toString();
  } catch {
    throw new SupportLineDeliveryError("VALIDATION_ERROR", "deepLink must be an allowlisted HTTPS URL");
  }
};

const messageText = (ticket: SupportTicket, message: SupportTicketMessage, deepLink: string, outOfHours: boolean): string => {
  const hoursNotice = outOfHours ? "ขณะนี้อยู่นอกเวลาทำการ เจ้าหน้าที่จะติดตามต่อในเวลาทำการถัดไป\n\n" : "";
  return `${hoursNotice}${message.body}\n\nเลขที่ติดตาม: ${ticket.publicTicketId}\nดูสถานะ: ${deepLink}`;
};

const viewRecord = (record: DeliveryRecord): SupportLineDeliveryView => ({
  deliveryId: record.delivery.id,
  tenantId: record.ticket.tenantId,
  ticketId: record.ticket.id,
  messageId: record.message.id,
  publicTicketId: record.ticket.publicTicketId,
  status: record.delivery.status,
  attemptCount: record.delivery.attemptCount,
  maxAttempts: record.delivery.maxAttempts,
  nextAttemptAt: record.delivery.nextAttemptAt,
  ...(record.delivery.providerStatus !== undefined ? { providerStatus: record.delivery.providerStatus } : {}),
  ...(record.delivery.providerMessageId ? { providerMessageId: record.delivery.providerMessageId } : {}),
  correlationId: record.delivery.correlationId,
  deepLink: record.deepLink,
  outOfHours: record.outOfHours,
  createdAt: record.delivery.createdAt,
  ...(record.delivery.completedAt ? { completedAt: record.delivery.completedAt } : {}),
});

export class SupportLineDeliveryService {
  private readonly supportStore: SupportHandoffStore;
  private readonly dispatcher: LineMessagingDispatcher;
  private readonly recipientForTicket: SupportLineDeliveryOptions["recipientForTicket"];
  private readonly deepLinkForTicket: (ticket: SupportTicket) => string;
  private readonly allowedDeepLinkHosts: ReadonlySet<string>;
  private readonly clock: () => Date;
  private readonly store: SupportLineDeliveryStore;

  constructor(options: SupportLineDeliveryOptions) {
    this.supportStore = options.supportStore;
    this.dispatcher = options.dispatcher;
    this.recipientForTicket = options.recipientForTicket;
    this.deepLinkForTicket = options.deepLinkForTicket ?? defaultDeepLink;
    const allowedHosts = options.allowedDeepLinkHosts ?? ["citychatbot.local"];
    if (allowedHosts.length === 0 || allowedHosts.some((host) => !/^[A-Za-z0-9.-]+(?::\d+)?$/.test(host))) throw new SupportLineDeliveryError("VALIDATION_ERROR", "allowedDeepLinkHosts is invalid");
    this.allowedDeepLinkHosts = new Set(allowedHosts);
    this.clock = options.clock ?? (() => new Date());
    this.store = options.store ?? new InMemorySupportLineDeliveryStore();
  }

  enqueue(input: SupportLineDeliveryInput): SupportLineDeliveryView {
    assertUuid(input.tenantId, "tenantId");
    assertUuid(input.ticketId, "ticketId");
    assertUuid(input.messageId, "messageId");
    assertIdentifier(input.idempotencyKey, "idempotencyKey");
    if (input.correlationId !== undefined) assertUuid(input.correlationId, "correlationId");
    if (input.outOfHours !== undefined && typeof input.outOfHours !== "boolean") throw new SupportLineDeliveryError("VALIDATION_ERROR", "outOfHours is invalid");
    const ticket = this.supportStore.get(input.tenantId, input.ticketId);
    if (!ticket) throw new SupportLineDeliveryError("NOT_FOUND", "support ticket was not found");
    if (ticket.status === "CANCELLED" || ticket.status === "CLOSED") throw new SupportLineDeliveryError("CONFLICT", "closed or cancelled ticket cannot receive LINE continuation");
    const message = this.supportStore.listMessages(input.tenantId, input.ticketId).find((item) => item.id === input.messageId);
    if (!message) throw new SupportLineDeliveryError("NOT_FOUND", "public staff message was not found");
    if (message.tenantId !== input.tenantId || message.ticketId !== input.ticketId) throw new SupportLineDeliveryError("FORBIDDEN", "message is outside the ticket tenant scope");
    if (message.authorType !== "STAFF" || message.visibility !== "PUBLIC" || message.isAiDraft) throw new SupportLineDeliveryError("FORBIDDEN", "only a public non-draft staff message can be sent to LINE");
    const deepLink = validateDeepLink(input.deepLink ?? this.deepLinkForTicket(ticket), this.allowedDeepLinkHosts);
    const outOfHours = input.outOfHours === true;
    const fingerprint = createHash("sha256").update(JSON.stringify({ tenantId: input.tenantId, ticketId: input.ticketId, messageId: input.messageId, deepLink, outOfHours, correlationId: input.correlationId ?? ticket.id })).digest("hex");
    const existing = this.store.getByIdempotency(input.tenantId, input.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new SupportLineDeliveryError("IDEMPOTENCY_CONFLICT", "delivery idempotency key was reused with different data");
      return viewRecord(existing);
    }
    const existingMessage = this.store.getByMessage(input.tenantId, input.messageId);
    if (existingMessage) throw new SupportLineDeliveryError("CONFLICT", "this public staff message already has a LINE delivery");
    const recipientId = this.recipientForTicket({ tenantId: input.tenantId, ticketId: ticket.id, citizenIdentityHash: ticket.citizenIdentityHash });
    if (!recipientId) throw new SupportLineDeliveryError("NOT_FOUND", "verified LINE recipient mapping was not found");
    const delivery = this.dispatcher.enqueue({
      eventId: message.id,
      tenantId: input.tenantId,
      route: "push",
      recipientId,
      idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId ?? ticket.id,
      text: messageText(ticket, message, deepLink, outOfHours),
      ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
    });
    this.store.put(input.tenantId, input.idempotencyKey, { fingerprint, idempotencyKey: input.idempotencyKey, ticket, message, deepLink, outOfHours, delivery });
    return viewRecord({ fingerprint, idempotencyKey: input.idempotencyKey, ticket, message, deepLink, outOfHours, delivery });
  }

  async sendNow(input: SupportLineDeliveryInput, provider: LineProviderClient): Promise<SupportLineDeliveryView> {
    const queued = this.enqueue(input);
    return this.dispatch(input.tenantId, queued.deliveryId, provider);
  }

  async dispatch(tenantId: string, deliveryId: string, provider: LineProviderClient, now = this.clock(), jitterMs?: number): Promise<SupportLineDeliveryView> {
    assertUuid(tenantId, "tenantId");
    assertUuid(deliveryId, "deliveryId");
    const record = this.store.get(tenantId, deliveryId);
    if (!record) throw new SupportLineDeliveryError("NOT_FOUND", "delivery was not found");
    const updated = await this.dispatcher.dispatch(deliveryId, provider, now, jitterMs);
    const stored = { ...record, delivery: updated };
    this.store.put(record.ticket.tenantId, record.idempotencyKey, stored);
    return viewRecord(stored);
  }

  get(tenantId: string, deliveryId: string): SupportLineDeliveryView | undefined {
    const record = this.store.get(tenantId, deliveryId);
    return record ? viewRecord(record) : undefined;
  }

  list(tenantId: string): readonly SupportLineDeliveryView[] {
    return this.store.list(tenantId).map(viewRecord);
  }

}
