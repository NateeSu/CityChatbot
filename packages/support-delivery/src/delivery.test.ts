import { describe, expect, it } from "vitest";

import { createDefaultLineTemplates, InMemoryTenantQuotaGuard, LineMessagingDispatcher, type LineProviderClient } from "@citychatbot/line";
import { InMemorySupportHandoffStore, SupportHandoffService, type SupportHandoffRequest } from "@citychatbot/support-handoff";

import { InMemorySupportLineDeliveryStore, SupportLineDeliveryError, SupportLineDeliveryService } from "./delivery";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const QUEUE_A = "33333333-3333-4333-8333-333333333333";
const DEPARTMENT_A = "55555555-5555-4555-8555-555555555555";
const ACCOUNT_A = "88888888-8888-4888-8888-888888888888";
const NOW = new Date("2026-08-11T03:00:00.000Z");
const RECIPIENT = "Uverified-recipient-a";

const request = (overrides: Partial<SupportHandoffRequest> = {}): SupportHandoffRequest => ({
  tenantId: TENANT_A,
  citizenIdentity: "citizen-line-a",
  channel: "LINE",
  source: { sourceEventId: "delivery-source-001" },
  reasonCode: "STAFF_REQUESTED",
  reasonDetail: "ประชาชนขอให้เจ้าหน้าที่ตรวจสอบต่อ",
  citizenMessage: "ขอให้ช่วยตรวจสอบต่อค่ะ",
  topic: "delivery test topic",
  defaultIntakeQueueId: QUEUE_A,
  candidateDepartments: [{ tenantId: TENANT_A, departmentId: DEPARTMENT_A }],
  suggestedDepartmentId: DEPARTMENT_A,
  priority: "NORMAL",
  citizenConfirmed: true,
  policy: {
    policyVersion: "support-policy-v1",
    urgentAutomaticIntake: false,
    dedupeWindowSeconds: 900,
    responseTargetSeconds: 3_600,
    resolutionTargetSeconds: 86_400,
    timezone: "Asia/Bangkok",
  },
  idempotencyKey: "delivery-handoff-001",
  occurredAt: NOW,
  ...overrides,
});

const fixture = () => {
  const supportStore = new InMemorySupportHandoffStore();
  const handoff = new SupportHandoffService({ store: supportStore, identitySecret: "delivery-test-secret-with-at-least-32-bytes", clock: () => NOW });
  const ticket = handoff.createHandoff(request()).ticket!;
  const message = handoff.addStaffMessage({
    tenantId: TENANT_A,
    ticketId: ticket.id,
    expectedVersion: ticket.rowVersion,
    actor: { accountId: ACCOUNT_A, canReply: true },
    body: "เจ้าหน้าที่รับเรื่องแล้ว กำลังประสานงานค่ะ",
    visibility: "PUBLIC",
    idempotencyKey: "delivery-staff-message-001",
    occurredAt: NOW,
  });
  const dispatcher = new LineMessagingDispatcher({
    templates: createDefaultLineTemplates(),
    recipientHashSecret: "delivery-recipient-secret-with-at-least-32-bytes",
    quota: new InMemoryTenantQuotaGuard(),
    clock: () => NOW,
  });
  const delivery = new SupportLineDeliveryService({
    supportStore,
    dispatcher,
    store: new InMemorySupportLineDeliveryStore(),
    recipientForTicket: () => RECIPIENT,
    deepLinkForTicket: (item) => `https://citychatbot.local/liff/support/${item.publicTicketId}`,
    clock: () => NOW,
  });
  return { supportStore, ticket: supportStore.get(TENANT_A, ticket.id)!, messageId: supportStore.listMessages(TENANT_A, ticket.id).find((item) => item.authorType === "STAFF")!.id, delivery, dispatcher };
};

describe("support staff reply LINE delivery", () => {
  it("sends a public staff reply once with tracking deep link and out-of-hours copy", async () => {
    const { delivery, ticket, messageId } = fixture();
    const calls: { recipientId: string; messages: readonly [{ type: "text"; text: string }] }[] = [];
    const provider: LineProviderClient = {
      reply: async () => ({ status: 500 }),
      push: async (input) => { calls.push(input); return { status: 202, providerMessageId: "line-provider-accepted-001" }; },
    };
    const first = await delivery.sendNow({ tenantId: TENANT_A, ticketId: ticket.id, messageId, idempotencyKey: "delivery-send-001", outOfHours: true }, provider);
    const replay = await delivery.sendNow({ tenantId: TENANT_A, ticketId: ticket.id, messageId, idempotencyKey: "delivery-send-001", outOfHours: true }, provider);

    expect(first.status).toBe("API_ACCEPTED");
    expect(first.publicTicketId).toBe(ticket.publicTicketId);
    expect(first.deepLink).toContain(ticket.publicTicketId);
    expect(first.outOfHours).toBe(true);
    expect(replay.deliveryId).toBe(first.deliveryId);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.recipientId).toBe(RECIPIENT);
    expect(calls[0]?.messages[0]?.text).toContain("นอกเวลาทำการ");
    expect(calls[0]?.messages[0]?.text).toContain(ticket.publicTicketId);
    expect(JSON.stringify(first)).not.toContain(RECIPIENT);
    expect(JSON.stringify(delivery.list(TENANT_A))).not.toContain("เจ้าหน้าที่รับเรื่องแล้ว");
  });

  it("rejects internal/AI-draft or missing recipient messages and preserves tenant scope", () => {
    const { supportStore, ticket, delivery, dispatcher } = fixture();
    const handoff = new SupportHandoffService({ store: supportStore, identitySecret: "delivery-test-secret-with-at-least-32-bytes", clock: () => NOW });
    handoff.addStaffMessage({
      tenantId: TENANT_A,
      ticketId: ticket.id,
      expectedVersion: ticket.rowVersion,
      actor: { accountId: ACCOUNT_A, canReply: true },
      body: "บันทึกภายใน",
      visibility: "INTERNAL",
      isAiDraft: true,
      idempotencyKey: "delivery-internal-001",
      occurredAt: NOW,
    });
    const internalId = supportStore.listMessages(TENANT_A, ticket.id).find((item) => item.visibility === "INTERNAL")?.id;
    expect(internalId).toBeTruthy();
    expect(() => delivery.enqueue({ tenantId: TENANT_A, ticketId: ticket.id, messageId: internalId!, idempotencyKey: "delivery-internal-send-001" })).toThrowError(/FORBIDDEN/);
    const noRecipient = new SupportLineDeliveryService({ supportStore, dispatcher, recipientForTicket: () => undefined });
    const publicMessageId = supportStore.listMessages(TENANT_A, ticket.id).find((item) => item.authorType === "STAFF" && item.visibility === "PUBLIC")!.id;
    expect(() => noRecipient.enqueue({ tenantId: TENANT_A, ticketId: ticket.id, messageId: publicMessageId, idempotencyKey: "delivery-no-recipient-001" })).toThrowError(/NOT_FOUND/);
    expect(delivery.get("22222222-2222-4222-8222-222222222222", "11111111-1111-4111-8111-111111111111")).toBeUndefined();
  });

  it("retains retryable failure and moves to DLQ after max attempts", async () => {
    const { delivery, ticket, messageId } = fixture();
    const provider: LineProviderClient = { reply: async () => ({ status: 500 }), push: async () => ({ status: 429, retryAfterSeconds: 0 }) };
    const first = await delivery.sendNow({ tenantId: TENANT_A, ticketId: ticket.id, messageId, idempotencyKey: "delivery-retry-001", maxAttempts: 2 }, provider);
    const second = await delivery.dispatch(TENANT_A, first.deliveryId, provider, NOW, 0);

    expect(first.status).toBe("RETRY_WAIT");
    expect(first.attemptCount).toBe(1);
    expect(second.status).toBe("DLQ");
    expect(second.attemptCount).toBe(2);
  });
});
