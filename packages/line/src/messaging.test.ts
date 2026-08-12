import { describe, expect, it } from "vitest";

import { LineMessagingDispatcher, InMemoryTenantQuotaGuard, LineMessagingError, LineTemplateRegistry, createDefaultLineTemplates, type LineProviderClient } from "./messaging";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const EVENT_A = "77777777-7777-4777-8777-777777777777";
const CORRELATION_A = "66666666-6666-4666-8666-666666666666";
const RECIPIENT_A = "Uline-recipient-a";
const RECIPIENT_B = "Uline-recipient-b";
const REPLY_TOKEN = "reply-token-synthetic-value";
const HASH_SECRET = "recipient-hash-secret-with-at-least-32-bytes";
const NOW = new Date("2026-08-10T00:00:00.000Z");

const makeDispatcher = (quota?: InMemoryTenantQuotaGuard) => new LineMessagingDispatcher({
  templates: createDefaultLineTemplates(),
  recipientHashSecret: HASH_SECRET,
  quota,
  clock: () => NOW,
});

describe("LINE message templates and delivery", () => {
  it("renders versioned Thai templates through an explicit variable allowlist", () => {
    const registry = createDefaultLineTemplates();
    expect(registry.render("complaint.received", 1, { complaintNo: "CMP-001" })).toMatchObject({ text: "รับเรื่องแล้ว เลขที่ CMP-001", version: 1 });
    expect(() => registry.render("complaint.received", 1, {})).toThrowError(/allowlist/);
    expect(() => registry.render("complaint.received", 1, { complaintNo: "CMP-001", secret: "x" })).toThrowError(/allowlist/);
  });

  it("rejects unsafe/oversized template definitions and duplicate versions", () => {
    const registry = new LineTemplateRegistry();
    registry.register({ key: "test.message", version: 1, locale: "th-TH", text: "สวัสดี", variables: [] });
    expect(() => registry.register({ key: "test.message", version: 1, locale: "th-TH", text: "ซ้ำ", variables: [] })).toThrowError(/CONFLICT/);
    expect(() => registry.register({ key: "test.bad", version: 1, locale: "th-TH", text: "{{unknown}}", variables: [] })).toThrowError(/placeholder/);
    expect(() => registry.register({ key: "test.long", version: 1, locale: "th-TH", text: "x".repeat(5001), variables: [] })).toThrowError(/length/);
  });

  it("enqueues a reply with template metadata and never returns content/token/recipient", () => {
    const dispatcher = makeDispatcher();
    const view = dispatcher.enqueue({
      tenantId: TENANT_A,
      route: "reply",
      recipientId: RECIPIENT_A,
      replyToken: REPLY_TOKEN,
      idempotencyKey: "reply-1",
      correlationId: CORRELATION_A,
      template: { key: "complaint.received", version: 1, variables: { complaintNo: "CMP-001" } },
    });
    expect(view).toMatchObject({ tenantId: TENANT_A, route: "reply", status: "QUEUED", templateKey: "complaint.received", templateVersion: 1 });
    expect(JSON.stringify(view)).not.toContain(RECIPIENT_A);
    expect(JSON.stringify(view)).not.toContain(REPLY_TOKEN);
    expect(JSON.stringify(view)).not.toContain("CMP-001");
  });

  it("enforces idempotency for same data and conflicts on changed delivery", () => {
    const dispatcher = makeDispatcher();
    const input = { tenantId: TENANT_A, route: "push" as const, recipientId: RECIPIENT_A, idempotencyKey: "push-1", correlationId: CORRELATION_A, text: "hello" };
    const first = dispatcher.enqueue(input);
    expect(dispatcher.enqueue(input).id).toBe(first.id);
    expect(() => dispatcher.enqueue({ ...input, text: "changed" })).toThrowError(/CONFLICT/);
  });

  it("sends reply/push through provider and records API_ACCEPTED without duplicate content logs", async () => {
    const calls: unknown[] = [];
    const provider: LineProviderClient = {
      reply: async (input) => { calls.push(input); return { status: 200, providerMessageId: "provider-message-1" }; },
      push: async (input) => { calls.push(input); return { status: 201 }; },
    };
    const dispatcher = makeDispatcher();
    const reply = dispatcher.enqueue({ eventId: EVENT_A, tenantId: TENANT_A, route: "reply", recipientId: RECIPIENT_A, replyToken: REPLY_TOKEN, idempotencyKey: "reply-2", correlationId: CORRELATION_A, text: "สวัสดี" });
    const push = dispatcher.enqueue({ tenantId: TENANT_A, route: "push", recipientId: RECIPIENT_B, idempotencyKey: "push-2", correlationId: CORRELATION_A, text: "แจ้งเตือน" });
    expect(await dispatcher.dispatch(reply.id, provider)).toMatchObject({ status: "API_ACCEPTED", eventId: EVENT_A, providerMessageId: "provider-message-1" });
    expect((await dispatcher.dispatch(push.id, provider)).status).toBe("API_ACCEPTED");
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(dispatcher.list(TENANT_A))).not.toContain("สวัสดี");
    expect(JSON.stringify(dispatcher.list(TENANT_A))).not.toContain(REPLY_TOKEN);
  });

  it("classifies 429/5xx as retryable, honors Retry-After and sends to DLQ after max attempts", async () => {
    const quota = new InMemoryTenantQuotaGuard();
    const dispatcher = makeDispatcher(quota);
    const provider: LineProviderClient = { push: async () => ({ status: 429, retryAfterSeconds: 10 }), reply: async () => ({ status: 500 }) };
    const delivery = dispatcher.enqueue({ tenantId: TENANT_A, route: "push", recipientId: RECIPIENT_A, idempotencyKey: "retry-1", correlationId: CORRELATION_A, text: "retry", maxAttempts: 2 });
    const first = await dispatcher.dispatch(delivery.id, provider, NOW);
    expect(first).toMatchObject({ status: "RETRY_WAIT", attemptCount: 1, providerStatus: 429 });
    expect(first.nextAttemptAt).toBe(new Date(NOW.getTime() + 10_000).toISOString());
    const second = await dispatcher.dispatch(delivery.id, provider, new Date(NOW.getTime() + 10_000));
    expect(second.status).toBe("DLQ");
  });

  it("marks permanent provider failures as FAILED and catches timeout as retryable", async () => {
    const dispatcher = makeDispatcher();
    const permanent: LineProviderClient = { push: async () => ({ status: 400 }), reply: async () => ({ status: 400 }) };
    const timeout: LineProviderClient = { push: async () => { throw new Error("provider timeout secret=hidden"); }, reply: async () => ({ status: 503 }) };
    const failed = dispatcher.enqueue({ tenantId: TENANT_A, route: "push", recipientId: RECIPIENT_A, idempotencyKey: "failed-1", correlationId: CORRELATION_A, text: "bad" });
    expect((await dispatcher.dispatch(failed.id, permanent)).status).toBe("FAILED");
    const retried = dispatcher.enqueue({ tenantId: TENANT_A, route: "push", recipientId: RECIPIENT_B, idempotencyKey: "timeout-1", correlationId: CORRELATION_A, text: "later" });
    expect((await dispatcher.dispatch(retried.id, timeout, NOW, 0)).status).toBe("RETRY_WAIT");
    expect(JSON.stringify(dispatcher.list(TENANT_A))).not.toContain("hidden");
  });

  it("isolates quota per tenant and never spends tenant B quota for tenant A", async () => {
    const quota = new InMemoryTenantQuotaGuard();
    quota.set(TENANT_A, 0);
    quota.set(TENANT_B, 1);
    const dispatcher = makeDispatcher(quota);
    const provider: LineProviderClient = { push: async () => ({ status: 200 }), reply: async () => ({ status: 200 }) };
    const a = dispatcher.enqueue({ tenantId: TENANT_A, route: "push", recipientId: RECIPIENT_A, idempotencyKey: "quota-a", correlationId: CORRELATION_A, text: "a" });
    const b = dispatcher.enqueue({ tenantId: TENANT_B, route: "push", recipientId: RECIPIENT_B, idempotencyKey: "quota-b", correlationId: CORRELATION_A, text: "b" });
    expect((await dispatcher.dispatch(a.id, provider)).errorCode).toBe("LINE_QUOTA_EXCEEDED");
    expect((await dispatcher.dispatch(b.id, provider)).status).toBe("API_ACCEPTED");
  });

  it("rejects invalid route/token and preserves bounded text semantics", () => {
    const dispatcher = makeDispatcher();
    expect(() => dispatcher.enqueue({ eventId: "not-a-uuid", tenantId: TENANT_A, route: "push", recipientId: RECIPIENT_A, idempotencyKey: "bad-event", correlationId: CORRELATION_A, text: "hello" })).toThrowError(/eventId/);
    expect(() => dispatcher.enqueue({ tenantId: TENANT_A, route: "reply", recipientId: RECIPIENT_A, idempotencyKey: "bad-reply", correlationId: CORRELATION_A, text: "hello" })).toThrowError(/reply token/);
    expect(() => dispatcher.enqueue({ tenantId: TENANT_A, route: "push", recipientId: RECIPIENT_A, replyToken: REPLY_TOKEN, idempotencyKey: "bad-push", correlationId: CORRELATION_A, text: "hello" })).toThrowError(/push route/);
    expect(() => dispatcher.enqueue({ tenantId: TENANT_A, route: "push", recipientId: RECIPIENT_A, idempotencyKey: "too-long", correlationId: CORRELATION_A, text: "x".repeat(5001) })).toThrowError(/length/);
  });

  it("keeps delivery views tenant-scoped and recipient/content minimized", () => {
    const dispatcher = makeDispatcher();
    dispatcher.enqueue({ tenantId: TENANT_A, route: "push", recipientId: RECIPIENT_A, idempotencyKey: "scope-a", correlationId: CORRELATION_A, text: "private A" });
    dispatcher.enqueue({ tenantId: TENANT_B, route: "push", recipientId: RECIPIENT_B, idempotencyKey: "scope-b", correlationId: CORRELATION_A, text: "private B" });
    const a = dispatcher.list(TENANT_A);
    expect(a).toHaveLength(1);
    expect(JSON.stringify(a)).not.toContain(RECIPIENT_A);
    expect(JSON.stringify(a)).not.toContain("private A");
    expect(JSON.stringify(a)).not.toContain("private B");
  });

  it("supports provider success after a retry without creating a second delivery record", async () => {
    const dispatcher = makeDispatcher();
    let attempts = 0;
    const provider: LineProviderClient = { push: async () => { attempts += 1; return attempts === 1 ? { status: 503 } : { status: 200 }; }, reply: async () => ({ status: 200 }) };
    const delivery = dispatcher.enqueue({ tenantId: TENANT_A, route: "push", recipientId: RECIPIENT_A, idempotencyKey: "retry-success", correlationId: CORRELATION_A, text: "retry success" });
    const retry = await dispatcher.dispatch(delivery.id, provider, NOW, 0);
    expect(retry.status).toBe("RETRY_WAIT");
    const accepted = await dispatcher.dispatch(delivery.id, provider, new Date(NOW.getTime() + 5_000), 0);
    expect(accepted.status).toBe("API_ACCEPTED");
    expect(dispatcher.list(TENANT_A)).toHaveLength(1);
    expect(accepted.attemptCount).toBe(2);
  });
});
