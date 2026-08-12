import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { InMemoryLineWebhookInbox, InMemoryLineWebhookQueue, LineWebhookHandler, parseLineWebhookEvents, verifyLineSignature, type LineWebhookChannelResolver } from "./webhook";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const CHANNEL_RECORD_A = "33333333-3333-4333-8333-333333333333";
const CHANNEL_SECRET = "channel-secret-synthetic-value";
const ACCESS_TOKEN = "access-token-synthetic-value";
const WEBHOOK_KEY = "unguessable-webhook-key-synthetic-value-123456";
const DESTINATION = "line-destination-a";
const NOW = 1_700_000_000_000;

const resolver: LineWebhookChannelResolver = {
  resolveByWebhookKey: (key) => key === WEBHOOK_KEY ? {
    tenantId: TENANT_A,
    channelRecordId: CHANNEL_RECORD_A,
    lineChannelId: "line-channel-a",
    destination: DESTINATION,
    activeCredentialVersion: 1,
    state: "ACTIVE",
  } : undefined,
  getServerCredentials: () => ({ version: 1, keyVersion: "key-v1", channelSecret: CHANNEL_SECRET, accessToken: ACCESS_TOKEN }),
};

const bodyFor = (events: unknown[], destination = DESTINATION): Uint8Array => new TextEncoder().encode(JSON.stringify({ destination, events }));
const signatureFor = (body: Uint8Array): string => createHmac("sha256", CHANNEL_SECRET).update(body).digest("base64");
const eventFor = (overrides: Record<string, unknown> = {}) => ({
  type: "message",
  mode: "active",
  timestamp: NOW,
  webhookEventId: "event-1",
  source: { type: "user", userId: "line-user-a" },
  message: { id: "message-1", type: "text", text: "hello" },
  ...overrides,
});

const makeHandler = (clock = () => new Date(NOW), inbox = new InMemoryLineWebhookInbox(), queue = new InMemoryLineWebhookQueue()) => ({
  handler: new LineWebhookHandler({ resolver, inbox, queue, clock, maxEventAgeMs: 300_000, futureSkewMs: 30_000 }),
  inbox,
  queue,
});

describe("LINE webhook verification and replay defense", () => {
  it("verifies the raw body signature before parsing and accepts valid events", () => {
    const body = bodyFor([eventFor()]);
    expect(verifyLineSignature(body, signatureFor(body), CHANNEL_SECRET)).toBe(true);
    const { handler, inbox, queue } = makeHandler();
    const result = handler.handle({ webhookKey: WEBHOOK_KEY, signature: signatureFor(body), rawBody: body });
    expect(result).toMatchObject({ accepted: true, status: 200, tenantId: TENANT_A, channelRecordId: CHANNEL_RECORD_A, acceptedEventIds: ["event-1"] });
    expect(inbox.list(TENANT_A)).toHaveLength(1);
    expect(queue.list(TENANT_A)).toHaveLength(1);
  });

  it("rejects altered body, wrong signature and invalid JSON without side effects", () => {
    const valid = bodyFor([eventFor()]);
    const { handler, inbox, queue } = makeHandler();
    const invalidSignature = handler.handle({ webhookKey: WEBHOOK_KEY, signature: "bad", rawBody: valid });
    expect(invalidSignature).toMatchObject({ accepted: false, status: 403, reasonCode: "FORBIDDEN" });
    const altered = new TextEncoder().encode(`${new TextDecoder().decode(valid)} `);
    const alteredResult = handler.handle({ webhookKey: WEBHOOK_KEY, signature: signatureFor(valid), rawBody: altered });
    expect(alteredResult).toMatchObject({ accepted: false, status: 403, reasonCode: "FORBIDDEN" });
    const malformed = new TextEncoder().encode("not-json");
    const malformedResult = handler.handle({ webhookKey: WEBHOOK_KEY, signature: signatureFor(malformed), rawBody: malformed });
    expect(malformedResult).toMatchObject({ accepted: false, status: 400, reasonCode: "VALIDATION_ERROR" });
    expect(inbox.list()).toHaveLength(0);
    expect(queue.list()).toHaveLength(0);
  });

  it("rejects unknown webhook key and destination mismatch without revealing channel existence", () => {
    const body = bodyFor([eventFor()]);
    const { handler } = makeHandler();
    expect(handler.handle({ webhookKey: `${WEBHOOK_KEY}-wrong`, signature: signatureFor(body), rawBody: body })).toMatchObject({ status: 403, reasonCode: "FORBIDDEN" });
    const wrongDestinationBody = bodyFor([eventFor()], "line-destination-b");
    expect(handler.handle({ webhookKey: WEBHOOK_KEY, signature: signatureFor(wrongDestinationBody), rawBody: wrongDestinationBody })).toMatchObject({ status: 403, reasonCode: "FORBIDDEN" });
  });

  it("rejects stale and future events as replay conflicts", () => {
    const stale = bodyFor([eventFor({ timestamp: NOW - 300_001 })]);
    const future = bodyFor([eventFor({ timestamp: NOW + 30_001, webhookEventId: "event-future" })]);
    const { handler, inbox, queue } = makeHandler();
    expect(handler.handle({ webhookKey: WEBHOOK_KEY, signature: signatureFor(stale), rawBody: stale })).toMatchObject({ status: 409, reasonCode: "CONFLICT" });
    expect(handler.handle({ webhookKey: WEBHOOK_KEY, signature: signatureFor(future), rawBody: future })).toMatchObject({ status: 409, reasonCode: "CONFLICT" });
    expect(inbox.list()).toHaveLength(0);
    expect(queue.list()).toHaveLength(0);
  });

  it("persists and enqueues a duplicate event only once, including a 100-event batch", () => {
    const events = Array.from({ length: 100 }, (_, index) => eventFor({ webhookEventId: `event-${index}`, timestamp: NOW }));
    const body = bodyFor(events);
    const { handler, inbox, queue } = makeHandler();
    const first = handler.handle({ webhookKey: WEBHOOK_KEY, signature: signatureFor(body), rawBody: body });
    expect(first).toMatchObject({ accepted: true, acceptedEventIds: expect.arrayContaining(["event-0", "event-99"]) });
    const duplicate = handler.handle({ webhookKey: WEBHOOK_KEY, signature: signatureFor(body), rawBody: body });
    expect(duplicate).toMatchObject({ accepted: true, acceptedEventIds: [], duplicateEventIds: expect.arrayContaining(["event-0", "event-99"]) });
    expect(inbox.list()).toHaveLength(100);
    expect(queue.list()).toHaveLength(100);
  });

  it("accepts unsupported event types for logging/worker handling without failing the batch", () => {
    const body = bodyFor([eventFor({ webhookEventId: "unsupported-1", type: "video" })]);
    const { handler, queue } = makeHandler();
    const result = handler.handle({ webhookKey: WEBHOOK_KEY, signature: signatureFor(body), rawBody: body });
    expect(result).toMatchObject({ accepted: true, unsupportedEventIds: ["unsupported-1"] });
    expect(queue.list()[0]?.eventType).toBe("unsupported");
  });

  it("supports follow, unfollow, text/image/location and postback events", () => {
    const events = [
      eventFor({ webhookEventId: "follow-1", type: "follow", message: undefined }),
      eventFor({ webhookEventId: "unfollow-1", type: "unfollow", message: undefined }),
      eventFor({ webhookEventId: "image-1", message: { type: "image" } }),
      eventFor({ webhookEventId: "location-1", message: { type: "location" } }),
      eventFor({ webhookEventId: "postback-1", type: "postback", postback: { data: "menu" }, message: undefined }),
    ];
    const body = bodyFor(events);
    const { handler, queue } = makeHandler();
    const result = handler.handle({ webhookKey: WEBHOOK_KEY, signature: signatureFor(body), rawBody: body });
    expect(result).toMatchObject({ accepted: true, unsupportedEventIds: [] });
    expect(queue.list()).toHaveLength(5);
  });

  it("rejects malformed events and oversized bodies before enqueue", () => {
    const malformed = bodyFor([eventFor({ webhookEventId: "", timestamp: "bad" })]);
    const { handler, inbox, queue } = makeHandler();
    expect(handler.handle({ webhookKey: WEBHOOK_KEY, signature: signatureFor(malformed), rawBody: malformed })).toMatchObject({ status: 400, reasonCode: "VALIDATION_ERROR" });
    const tinyLimit = new LineWebhookHandler({ resolver, maxBodyBytes: 10 });
    const body = bodyFor([eventFor()]);
    expect(tinyLimit.handle({ webhookKey: WEBHOOK_KEY, signature: signatureFor(body), rawBody: body })).toMatchObject({ status: 400, reasonCode: "VALIDATION_ERROR" });
    expect(inbox.list()).toHaveLength(0);
    expect(queue.list()).toHaveLength(0);
  });

  it("keeps tenant isolation in inbox and queue records and does not persist raw body/user data", () => {
    const body = bodyFor([eventFor()]);
    const { handler, inbox, queue } = makeHandler();
    handler.handle({ webhookKey: WEBHOOK_KEY, signature: signatureFor(body), rawBody: body });
    const inboxJson = JSON.stringify(inbox.list(TENANT_A));
    const queueJson = JSON.stringify(queue.list(TENANT_A));
    expect(inboxJson).toContain(TENANT_A);
    expect(inboxJson).not.toContain("line-user-a");
    expect(queueJson).not.toContain("line-user-a");
    expect(queue.list("22222222-2222-4222-8222-222222222222")).toEqual([]);
  });

  it("returns correlation IDs and acknowledges synchronously without running provider work", () => {
    const body = bodyFor([eventFor()]);
    const { handler } = makeHandler();
    const result = handler.handle({ webhookKey: WEBHOOK_KEY, signature: signatureFor(body), rawBody: body, requestId: "66666666-6666-4666-8666-666666666666" });
    expect(result).toMatchObject({ accepted: true, status: 200, requestId: "66666666-6666-4666-8666-666666666666" });
    if (result.accepted) expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("parses only after signature responsibility and enforces destination/time bounds", () => {
    const body = bodyFor([eventFor()]);
    expect(parseLineWebhookEvents(body, DESTINATION, NOW)).toHaveLength(1);
    expect(() => parseLineWebhookEvents(body, "wrong-destination", NOW)).toThrowError(/destination/);
    const invalid = bodyFor([]);
    expect(() => parseLineWebhookEvents(invalid, DESTINATION, NOW)).toThrowError(/non-empty/);
  });
});
