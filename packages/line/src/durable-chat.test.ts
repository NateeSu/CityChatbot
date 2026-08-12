import { describe, expect, it } from "vitest";

import { LineWebhookError, parseDurableLineChatEvent } from "./webhook";

const destination = "Uabcdef123456789";
const eventId = "01HCHATMESSAGE00000000000000";
const now = Date.parse("2026-08-13T00:00:00.000Z");

const body = (overrides: Record<string, unknown> = {}): Uint8Array => new TextEncoder().encode(JSON.stringify({
  destination,
  events: [{
    type: "message",
    webhookEventId: eventId,
    timestamp: now - 1_000,
    source: { type: "user", userId: "Uabcdef123456789" },
    message: { type: "text", text: "เวลาทำการ" },
    replyToken: "reply-token",
    ...overrides,
  }],
}));

describe("durable LINE chat event rehydration", () => {
  it("returns only the validated message fields", () => {
    expect(parseDurableLineChatEvent(body(), destination, eventId, now)).toMatchObject({
      webhookEventId: eventId,
      eventType: "message",
      lineUserId: "Uabcdef123456789",
      text: "เวลาทำการ",
      replyToken: "reply-token",
    });
  });

  it("ignores non-text and non-message events without creating a chat turn", () => {
    expect(parseDurableLineChatEvent(body({ type: "follow" }), destination, eventId, now)).toBeUndefined();
    expect(parseDurableLineChatEvent(body({ message: { type: "image" } }), destination, eventId, now)).toBeUndefined();
  });

  it("rejects destination, event identity, unsafe text and stale payloads", () => {
    expect(() => parseDurableLineChatEvent(body(), "Uother123456789", eventId, now)).toThrow(LineWebhookError);
    expect(() => parseDurableLineChatEvent(body(), destination, "different-event", now)).toThrow(/event was not found/);
    expect(() => parseDurableLineChatEvent(body({ message: { type: "text", text: "bad\u0000text" } }), destination, eventId, now)).toThrow(/text is invalid/);
    expect(() => parseDurableLineChatEvent(body({ timestamp: now - 25 * 60 * 60 * 1000 }), destination, eventId, now)).toThrow(/outside the replay window/);
  });
});
