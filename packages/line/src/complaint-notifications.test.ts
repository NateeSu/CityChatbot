import { describe, expect, it } from "vitest";

import { ComplaintNotificationError, ComplaintNotificationService, createComplaintNotificationTemplates, type ComplaintNotificationEvent, type ComplaintNotificationTenantConfig } from "./complaint-notifications";
import { LineMessagingDispatcher, type LineProviderClient } from "./messaging";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const COMPLAINT_A = "33333333-3333-4333-8333-333333333333";
const COMPLAINT_B = "44444444-4444-4444-8444-444444444444";
const EVENT_A = "55555555-5555-4555-8555-555555555555";
const EVENT_B = "66666666-6666-4666-8666-666666666666";
const CORRELATION = "77777777-7777-4777-8777-777777777777";
const NOW = new Date("2026-08-10T00:00:00.000Z");
const HASH_SECRET = "notification-recipient-hash-secret-32-bytes";

const config = (overrides: Partial<ComplaintNotificationTenantConfig> = {}): ComplaintNotificationTenantConfig => ({ tenantId: TENANT_A, enabled: true, locale: "th-TH", themeVersion: 3, trackingBaseUrl: "https://citychatbot.example.test", publicContact: "เทศบาลตัวอย่าง", ...overrides });
const event = (overrides: Partial<ComplaintNotificationEvent> = {}): ComplaintNotificationEvent => ({ eventId: EVENT_A, eventType: "complaint.created", eventVersion: 1, tenantId: TENANT_A, aggregateId: COMPLAINT_A, correlationId: CORRELATION, occurredAt: NOW.toISOString(), payload: { complaintNo: "CCM-2569-000001" }, ...overrides });

const makeService = (tenantConfig: ComplaintNotificationTenantConfig = config(), optedIn = true) => {
  const templates = createComplaintNotificationTemplates();
  const dispatcher = new LineMessagingDispatcher({ templates, recipientHashSecret: HASH_SECRET, clock: () => NOW });
  const service = new ComplaintNotificationService({
    dispatcher,
    templates,
    clock: () => NOW,
    context: {
      getTenantConfig: (tenantId) => tenantId === tenantConfig.tenantId ? tenantConfig : undefined,
      getRecipient: (tenantId, complaintId) => tenantId === TENANT_A && complaintId === COMPLAINT_A ? { tenantId, complaintId, lineUserId: "Usynthetic-citizen-a", optedIn } : undefined,
    },
  });
  return { service, dispatcher };
};

describe("complaint notification outbox contract", () => {
  it("maps canonical events to versioned allowlisted templates and a tenant-safe deep link", async () => {
    const { service } = makeService();
    const result = service.enqueue(event({ eventType: "complaint.assigned", payload: { complaintNo: "CCM-2569-000001", departmentName: "กองช่าง" } }));
    expect(result).toMatchObject({ outcome: "ENQUEUED", outbox: { eventType: "complaint.assigned", templateKey: "complaint.assigned", templateVersion: 1, locale: "th-TH", themeVersion: 3, recipientScope: "CITIZEN", status: "QUEUED" } });
    if (result.outcome !== "ENQUEUED") throw new Error("expected enqueue");
    const calls: unknown[] = [];
    const provider: LineProviderClient = { reply: async () => ({ status: 200 }), push: async (input) => { calls.push(input); return { status: 200, providerMessageId: "provider-1" }; } };
    const delivered = await service.dispatch(result.outbox.id, provider);
    expect(delivered.status).toBe("API_ACCEPTED");
    expect(calls[0]).toMatchObject({ recipientId: "Usynthetic-citizen-a", messages: [{ type: "text" }] });
    expect(JSON.stringify(calls[0])).toContain("https://citychatbot.example.test/liff/complaints/33333333-3333-4333-8333-333333333333");
  });

  it("keeps one intended message per event and silently skips opted-out citizens", () => {
    const { service } = makeService();
    const first = service.enqueue(event());
    const replay = service.enqueue(event());
    expect(first.outcome).toBe("ENQUEUED");
    expect(replay).toMatchObject({ outcome: "ENQUEUED" });
    if (first.outcome === "ENQUEUED" && replay.outcome === "ENQUEUED") expect(replay.outbox.id).toBe(first.outbox.id);
    const optedOut = makeService(config({ tenantId: TENANT_A }), false).service.enqueue(event({ eventId: EVENT_B }));
    expect(optedOut).toEqual({ outcome: "SKIPPED", eventId: EVENT_B, reasonCode: "OPTED_OUT" });
  });

  it("retains outbox on provider outage, honors retry and never creates a duplicate delivery", async () => {
    const { service } = makeService();
    const result = service.enqueue(event());
    if (result.outcome !== "ENQUEUED") throw new Error("expected enqueue");
    let attempts = 0;
    const provider: LineProviderClient = { reply: async () => ({ status: 200 }), push: async () => { attempts += 1; return attempts === 1 ? { status: 503 } : { status: 200, providerMessageId: "provider-2" }; } };
    const retry = await service.dispatch(result.outbox.id, provider, NOW, 0);
    expect(retry).toMatchObject({ status: "RETRY_WAIT", attemptCount: 1, providerStatus: 503 });
    expect(service.list(TENANT_A)).toHaveLength(1);
    const accepted = await service.dispatch(result.outbox.id, provider, new Date(NOW.getTime() + 5_000), 0);
    expect(accepted).toMatchObject({ status: "API_ACCEPTED", attemptCount: 2, providerMessageId: "provider-2" });
    expect(service.list(TENANT_A)).toHaveLength(1);
  });

  it("covers status, public update and SLA template matrix without private-event leakage", () => {
    const { service } = makeService();
    const cases: Array<{ eventType: ComplaintNotificationEvent["eventType"]; payload: ComplaintNotificationEvent["payload"] }> = [
      { eventType: "complaint.status_changed", payload: { complaintNo: "CCM-1", fromStatus: "IN_PROGRESS", toStatus: "WAITING_FOR_CITIZEN", publicMessage: "ขอรูปเพิ่มเติม" } },
      { eventType: "complaint.status_changed", payload: { complaintNo: "CCM-2", fromStatus: "IN_PROGRESS", toStatus: "RESOLVED", publicMessage: "แก้ไขแล้ว" } },
      { eventType: "complaint.status_changed", payload: { complaintNo: "CCM-3", fromStatus: "RESOLVED", toStatus: "CLOSED" } },
      { eventType: "complaint.public_update_added", payload: { complaintNo: "CCM-4", publicMessage: "กำลังตรวจสอบ" } },
      { eventType: "complaint.sla_warning", payload: { complaintNo: "CCM-5", milestone: "response" } },
      { eventType: "complaint.sla_breached", payload: { complaintNo: "CCM-6", milestone: "resolution" } },
    ];
    for (const [index, candidate] of cases.entries()) {
      const result = service.enqueue(event({ eventId: `88888888-8888-4888-8888-${String(index + 1).padStart(12, "0")}`, aggregateId: COMPLAINT_A, ...candidate }));
      expect(result.outcome).toBe("ENQUEUED");
    }
    expect(service.list(TENANT_A)).toHaveLength(cases.length);
  });

  it("fails closed on disabled tenants, invalid public event payloads and cross-tenant recipient context", () => {
    const disabled = makeService(config({ enabled: false })).service.enqueue(event());
    expect(disabled).toEqual({ outcome: "SKIPPED", eventId: EVENT_A, reasonCode: "DISABLED" });
    const { service } = makeService();
    expect(() => service.enqueue(event({ eventType: "complaint.public_update_added", payload: { complaintNo: "CCM-1" } }))).toThrowError(ComplaintNotificationError);
    expect(() => service.enqueue(event({ eventType: "complaint.status_changed", payload: { complaintNo: "CCM-1", fromStatus: "IN_PROGRESS" } }))).toThrowError(ComplaintNotificationError);
    const crossTenant = makeService(config({ tenantId: TENANT_B })).service;
    expect(() => crossTenant.enqueue(event({ eventId: EVENT_B, tenantId: TENANT_B, aggregateId: COMPLAINT_B }))).toThrowError(/recipient/);
  });
});
