import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { constantTimeWebhookHash, processDurableLineWebhook, type DurableLineWebhookStore } from "./durable-webhook";

const WEBHOOK_KEY = "production-like-webhook-key-with-safe-length";
const HASH_SECRET = "hash-secret-with-at-least-thirty-two-bytes";
const CHANNEL_SECRET = "synthetic-channel-secret";
const NOW = new Date("2026-08-12T05:00:00.000Z");
const body = new TextEncoder().encode(JSON.stringify({ destination: "U123456789abcdef", events: [{ type: "follow", timestamp: NOW.getTime(), webhookEventId: "evt-1", source: { type: "user", userId: "Uabcdef123456789" } }] }));
const signature = createHmac("sha256", CHANNEL_SECRET).update(body).digest("base64");

const makeStore = (): DurableLineWebhookStore & { writes: number } => ({
  writes: 0,
  async resolve(hash) {
    if (hash !== constantTimeWebhookHash(WEBHOOK_KEY, HASH_SECRET)) return undefined;
    return { tenantId: "11111111-1111-4111-8111-111111111111", channelRecordId: "22222222-2222-4222-8222-222222222222", destination: "U123456789abcdef", channelSecret: CHANNEL_SECRET, state: "ACTIVE" };
  },
  async persist(input) {
    this.writes += 1;
    expect(input.payloadSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(input.events).toHaveLength(1);
    return { acceptedEventIds: ["evt-1"], duplicateEventIds: [] };
  },
});

describe("durable LINE webhook orchestration", () => {
  it("resolves by hash, verifies signature, then persists once", async () => {
    const store = makeStore();
    await expect(processDurableLineWebhook({ webhookKey: WEBHOOK_KEY, webhookHashSecret: HASH_SECRET, signature, rawBody: body, requestId: "req", correlationId: "corr", store, now: NOW })).resolves.toMatchObject({ accepted: true, acceptedEventIds: ["evt-1"] });
    expect(store.writes).toBe(1);
  });

  it("accepts a signed LINE verification probe without persisting an inbox event", async () => {
    const store = makeStore();
    const probeBody = new TextEncoder().encode(JSON.stringify({ destination: "U123456789abcdef", events: [] }));
    const probeSignature = createHmac("sha256", CHANNEL_SECRET).update(probeBody).digest("base64");
    await expect(processDurableLineWebhook({ webhookKey: WEBHOOK_KEY, webhookHashSecret: HASH_SECRET, signature: probeSignature, rawBody: probeBody, requestId: "req", correlationId: "corr", store, now: NOW })).resolves.toEqual({
      accepted: true,
      status: 200,
      requestId: "req",
      correlationId: "corr",
      acceptedEventIds: [],
      duplicateEventIds: [],
    });
    expect(store.writes).toBe(0);
  });

  it("fails closed before persistence for unknown key and altered signature", async () => {
    const store = makeStore();
    await expect(processDurableLineWebhook({ webhookKey: `${WEBHOOK_KEY}x`, webhookHashSecret: HASH_SECRET, signature, rawBody: body, requestId: "req", correlationId: "corr", store, now: NOW })).resolves.toMatchObject({ status: 403, reasonCode: "FORBIDDEN" });
    await expect(processDurableLineWebhook({ webhookKey: WEBHOOK_KEY, webhookHashSecret: HASH_SECRET, signature: "bad", rawBody: body, requestId: "req", correlationId: "corr", store, now: NOW })).resolves.toMatchObject({ status: 403, reasonCode: "FORBIDDEN" });
    expect(store.writes).toBe(0);
  });

  it("maps database failure to a non-secret dependency error", async () => {
    const store = makeStore();
    store.persist = async () => { throw new Error("database detail must not escape"); };
    await expect(processDurableLineWebhook({ webhookKey: WEBHOOK_KEY, webhookHashSecret: HASH_SECRET, signature, rawBody: body, requestId: "req", correlationId: "corr", store, now: NOW })).resolves.toEqual({ accepted: false, status: 503, reasonCode: "DEPENDENCY_NOT_READY", requestId: "req" });
  });
});
